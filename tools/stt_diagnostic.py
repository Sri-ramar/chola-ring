#!/usr/bin/env python3
"""
STT Pipeline Diagnostic Tool
Tests each stage of the wake word detection pipeline independently.
"""
import sys, os, io, wave, time, json, threading, logging, traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ["PYTHONUNBUFFERED"] = "1"

import numpy as np

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("diag")


def _pcm_to_wav(pcm_int16, rate=16000):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(rate)
        wf.writeframes(pcm_int16.tobytes() if isinstance(pcm_int16, np.ndarray) else pcm_int16)
    return buf.getvalue()


# ── Pipeline Stages ─────────────────────────────────────────────────────

class StageTester:
    def __init__(self, log_callback):
        self.log = log_callback
        self.whisper_model = None

    # Stage 0: Device Info
    def stage0_devices(self):
        self.log("=== STAGE 0: Audio Devices ===")
        import sounddevice as sd
        devices = sd.query_devices()
        for i, d in enumerate(devices):
            if d["max_input_channels"] > 0:
                self.log(f"  [{i}] {d['name']} — {int(d['default_samplerate'])}Hz, {d['max_input_channels']}ch in")
        default = sd.default.device
        self.log(f"System default input device: {default}")
        return devices

    # Stage 1: Capture raw audio
    def stage1_capture(self, device_idx=None, duration=4.0):
        self.log(f"\n=== STAGE 1: Capture Audio ({duration}s) ===")
        import sounddevice as sd
        rate = 48000
        self.log(f"Device: {device_idx}, Rate: {rate}Hz, Duration: {duration}s")
        self.log("Recording... speak NOW!")
        try:
            recording = sd.rec(int(rate * duration), samplerate=rate, channels=1,
                              dtype="int16", device=device_idx, blocking=True)
            self.log(f"Captured {len(recording)} samples ({len(recording)/rate:.2f}s)")
            rms = float(np.sqrt(np.mean(recording.astype(np.float64) ** 2)))
            peak = float(np.max(np.abs(recording)))
            self.log(f"Raw: RMS={rms:.1f}, Peak={peak:.1f}")
            return recording.flatten(), rate
        except Exception as e:
            self.log(f"ERROR: {e}")
            return None, None

    # Stage 2: VAD analysis
    def stage2_vad(self, raw_audio, rate):
        self.log(f"\n=== STAGE 2: VAD Analysis ===")
        target_rate = 16000
        block_size = int(16000 * 0.05)
        self.log(f"Blocks: {block_size} samples @ 16kHz (50ms each)")

        # Resample to 16kHz
        if rate != target_rate:
            n = int(len(raw_audio) * (target_rate / rate))
            samples16 = np.interp(np.linspace(0, len(raw_audio), n, endpoint=False),
                                  np.arange(len(raw_audio)), raw_audio.astype(np.float64)).astype(np.int16)
            self.log(f"Resampled: {len(raw_audio)} → {len(samples16)} samples")
        else:
            samples16 = raw_audio

        # Apply DC offset and high-pass filter (same as filter_fan_noise)
        x = samples16.astype(np.float32)
        alpha = 0.92
        y = np.zeros_like(x)
        y[0] = x[0]
        diffs = np.diff(x, prepend=x[0])
        for i in range(1, len(x)):
            y[i] = alpha * y[i-1] + diffs[i]
        samples16 = y.astype(np.int16)

        # Analyze per-block RMS
        ambient_rms = 220.0
        trigger_thresholds = []
        block_rms_values = []
        vad_triggers = []
        recording = False
        speech_frames = []
        silence_count = 0

        for start in range(0, len(samples16), block_size):
            block = samples16[start:start + block_size]
            if len(block) < block_size // 2:
                break
            rms = float(np.sqrt(np.mean(block.astype(np.float32) ** 2)))
            block_rms_values.append(rms)

            if not recording:
                ambient_rms = 0.97 * ambient_rms + 0.03 * rms
                trigger_threshold = max(ambient_rms * 2.5, ambient_rms + 200.0, 300.0)
                trigger_thresholds.append(trigger_threshold)
                if rms > trigger_threshold:
                    self.log(f"  VAD TRIGGERED at block {len(block_rms_values)}: RMS={rms:.1f}, Ambient={ambient_rms:.1f}, Threshold={trigger_threshold:.0f}")
                    recording = True
                    vad_triggers.append(start / target_rate)
                    speech_frames.append(block)
            else:
                trigger_threshold = max(ambient_rms * 2.5, ambient_rms + 200.0, 300.0)
                is_speech = rms > trigger_threshold
                speech_frames.append(block)
                if is_speech:
                    silence_count = 0
                else:
                    silence_count += 1
                    if silence_count >= 14:
                        self.log(f"  Silence end at block {len(block_rms_values)}: {silence_count * 0.05:.1f}s silence ({silence_count} blocks)")
                        break

        self.log(f"Ambient RMS settled at: {ambient_rms:.1f}")
        self.log(f"Blocks analyzed: {len(block_rms_values)}, RMS range: {min(block_rms_values):.1f}–{max(block_rms_values):.1f}")
        if block_rms_values:
            self.log(f"Last threshold: {trigger_thresholds[-1]:.0f}")
        else:
            self.log("No threshold values computed")

        if speech_frames:
            speech_pcm = np.concatenate(speech_frames)
            self.log(f"Speech segment: {len(speech_pcm)} samples ({len(speech_pcm)/target_rate:.2f}s)")
            rms = float(np.sqrt(np.mean(speech_pcm.astype(np.float64) ** 2)))
            self.log(f"Speech RMS: {rms:.1f}")
            return _pcm_to_wav(speech_pcm, target_rate)
        else:
            self.log("No speech detected by VAD")
            return None

    # Stage 3: Preprocess (DC offset removal)
    def stage3_preprocess(self, wav_bytes):
        self.log(f"\n=== STAGE 3: Preprocess ===")
        with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
            rate = wf.getframerate()
            sw = wf.getsampwidth()
            ch = wf.getnchannels()
            frames = wf.readframes(wf.getnframes())
            self.log(f"Input: {rate}Hz, {sw}byte, {ch}ch, {len(frames)} bytes")

        samples = np.frombuffer(frames, dtype=np.int16).astype(np.int32)
        dc = int(samples.mean())
        samples -= dc
        samples = samples.clip(-32768, 32767).astype(np.int16)
        self.log(f"DC offset removed: {dc}")

        # Is likely speech check (simplified)
        nfft = min(2048, len(samples))
        windowed = samples[:nfft].astype(np.float32) / 32768.0 * np.hanning(nfft)
        spectrum = np.abs(np.fft.rfft(windowed))
        freqs = np.fft.rfftfreq(nfft, d=1.0 / rate)
        speech_band = (freqs >= 200) & (freqs <= 4000)
        total = spectrum.sum()
        if total > 1e-6:
            ratio = spectrum[speech_band].sum() / total
            self.log(f"Speech-band energy ratio (first {nfft/rate*1000:.0f}ms): {ratio:.3f} (need > 0.3)")
        else:
            self.log("Total energy too low for spectral check")
            ratio = 0

        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(ch); wf.setsampwidth(sw); wf.setframerate(rate)
            wf.writeframes(samples.tobytes())
        return buf.getvalue(), ratio > 0.3

    # Stage 4: Whisper transcription
    def stage4_whisper(self, wav_bytes):
        self.log(f"\n=== STAGE 4: Whisper Transcription ===")
        try:
            from faster_whisper import WhisperModel
        except ImportError:
            self.log("ERROR: faster-whisper not installed")
            return None

        if self.whisper_model is None:
            self.log("Loading model (first time)...")
            t0 = time.time()
            self.whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
            self.log(f"Model loaded in {time.time()-t0:.1f}s")

        model = self.whisper_model

        with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
            rate = wf.getframerate()
            pcm = wf.readframes(wf.getnframes())
        samples = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
        self.log(f"Audio: {len(samples)/rate:.2f}s @ {rate}Hz, {len(samples)} samples")

        param_sets = [
            {"name": "A: base (no VAD, lenient)", "kwargs": dict(
                language="en", beam_size=5, best_of=5, temperature=0.0,
                vad_filter=False, no_speech_threshold=0.4,
                compression_ratio_threshold=2.4, condition_on_previous_text=False,
            )},
            {"name": "B: base (VAD on, strict)", "kwargs": dict(
                language="en", beam_size=5, best_of=5, temperature=0.0,
                vad_filter=True, vad_parameters={"threshold": 0.8, "min_silence_duration_ms": 500, "speech_pad_ms": 200},
                no_speech_threshold=0.8, compression_ratio_threshold=2.0,
                condition_on_previous_text=False, log_prob_threshold=-0.5,
            )},
            {"name": "C: beam1 (fast)", "kwargs": dict(
                language="en", beam_size=1, best_of=1, temperature=0.0,
                vad_filter=False, no_speech_threshold=0.6,
                compression_ratio_threshold=2.4, condition_on_previous_text=False,
            )},
            {"name": "D: temp=0.2 (diverse)", "kwargs": dict(
                language="en", beam_size=3, best_of=3, temperature=0.2,
                vad_filter=False, no_speech_threshold=0.5,
                compression_ratio_threshold=2.4, condition_on_previous_text=False,
            )},
        ]

        results = []
        for ps in param_sets:
            self.log(f"\n--- {ps['name']} ---")
            try:
                t0 = time.time()
                segments, info = model.transcribe(samples, **ps["kwargs"])
                dt = time.time() - t0

                seg_list = list(segments)
                text = " ".join(s.text.strip() for s in seg_list).strip()
                self.log(f"  Time: {dt*1000:.0f}ms")
                self.log(f"  Duration: {info.duration:.2f}s")
                self.log(f"  Language: {info.language} ({info.language_probability:.2f})")
                self.log(f"  Text: {text!r}")
                for s in seg_list:
                    self.log(f"  Segment: {s.text!r} | no_speech_prob={s.no_speech_prob:.3f} avg_logprob={s.avg_logprob:.3f}")
                results.append({"name": ps["name"], "text": text, "time_ms": dt*1000})
            except Exception as e:
                self.log(f"  ERROR: {e}")
                results.append({"name": ps["name"], "text": None, "error": str(e)})

        return results

    # Stage 5: Wake word matching
    def stage5_match(self, text):
        self.log(f"\n=== STAGE 5: Wake Word Matching ===")
        from app import BackgroundVoiceEngine
        # Create minimal mock for testing
        class MockParent:
            live_session_active = False
        engine = BackgroundVoiceEngine.__new__(BackgroundVoiceEngine)
        engine.parent = MockParent()

        text_lower = text.lower().strip() if text else ""
        self.log(f"Input text: {text_lower!r}")

        self.log(f"Wake words: {BackgroundVoiceEngine._WAKE_WORDS}")
        match = engine._match_wake_word(text_lower)
        if match:
            self.log(f"MATCHED: word={match['word']!r}, pattern={match['pattern']!r}")
        else:
            self.log("No match")
        return match


# ── UI ─────────────────────────────────────────────────────────────────

def build_ui():
    import tkinter as tk
    from tkinter import ttk, scrolledtext

    root = tk.Tk()
    root.title("STT Pipeline Diagnostic")
    root.geometry("1000x750")

    log_area = scrolledtext.ScrolledText(root, font=("Consolas", 10), wrap=tk.WORD)
    log_area.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
    log_area.bind("<Key>", lambda e: "break")

    def _copy_log():
        root.clipboard_clear()
        root.clipboard_append(log_area.get("1.0", "end-1c"))
        log("📋 Copied to clipboard")
    log_area.bind("<Control-c>", lambda e: _copy_log())
    log_area.bind("<Control-Insert>", lambda e: _copy_log())

    def log(msg):
        log_area.insert(tk.END, str(msg) + "\n")
        log_area.see(tk.END)
        root.update_idletasks()

    tester = StageTester(log)

    # ── Stitch all stages together ──
    def run_full_test(device_idx=None):
        if device_idx and device_idx != "default":
            device_idx = int(device_idx)
        else:
            device_idx = None
        log("╔══════════════════════════════════════════╗")
        log("║     STT PIPELINE FULL DIAGNOSTIC        ║")
        log("╚══════════════════════════════════════════╝")
        try:
            log(f"\nTimestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}")
            log(f"Python: {sys.version}")

            # Stage 0
            tester.stage0_devices()

            # Capture
            audio, rate = tester.stage1_capture(device_idx, 4.0)
            if audio is None:
                log("\nFAILED at Stage 1: Capture")
                return

            # Save raw audio for inspection
            raw_wav = _pcm_to_wav(audio, rate)
            raw_path = Path("/tmp/diag_raw.wav")
            raw_path.write_bytes(raw_wav)
            log(f"\nRaw audio saved: {raw_path} ({len(raw_wav)} bytes)")

            # Stage 2
            speech_wav = tester.stage2_vad(audio, rate)
            if speech_wav is None:
                log("\nFAILED at Stage 2: VAD")
                # Try whisper directly on raw audio
                log("\nSkipping VAD — testing whisper on raw audio:")
                tester.stage4_whisper(raw_wav)
                return

            speech_path = Path("/tmp/diag_speech.wav")
            speech_path.write_bytes(speech_wav)
            log(f"\nSpeech segment saved: {speech_path} ({len(speech_wav)} bytes)")

            # Stage 3
            clean_wav, is_speech = tester.stage3_preprocess(speech_wav)
            clean_path = Path("/tmp/diag_clean.wav")
            clean_path.write_bytes(clean_wav)
            log(f"\nCleaned audio saved: {clean_path} ({len(clean_wav)} bytes)")
            if not is_speech:
                log("WARNING: Speech-band energy check FAILED (> 0.3 needed)")
            else:
                log("Speech-band energy check passed")

            # Stage 4
            results = tester.stage4_whisper(clean_wav)
            if not results:
                log("\nFAILED at Stage 4: Whisper")

            # Stage 5 — test best result
            best = None
            if results:
                for r in results:
                    if r.get("text"):
                        best = r
                        break
            if best and best.get("text"):
                log(f"\nUsing best result: {best['name']} → {best['text']!r}")
                tester.stage5_match(best["text"])
            else:
                log("\nNo text from any whisper config — can't test wake word match")
                # Still test wake word matching manually
                tester.stage5_match("pavi pavithra")

        except Exception as e:
            log(f"\nUNHANDLED ERROR: {e}")
            log(traceback.format_exc())

        log("\n" + "═" * 50 + "\n")

    # ── Controls ──
    ctrl = tk.Frame(root)
    ctrl.pack(fill=tk.X, padx=5, pady=2)

    tk.Label(ctrl, text="Mic:", font=("", 9)).pack(side=tk.LEFT)
    device_var = tk.StringVar(value="default")
    device_menu = tk.OptionMenu(ctrl, device_var, "default")
    device_menu.config(font=("", 8))
    device_menu.pack(side=tk.LEFT, padx=2)

    def refresh_devices():
        import sounddevice as sd
        devices = sd.query_devices()
        menu = device_menu["menu"]
        menu.delete(0, "end")
        for i, d in enumerate(devices):
            if d["max_input_channels"] > 0:
                label = f"[{i}] {d['name']}"
                menu.add_command(label=label, command=lambda v=str(i): device_var.set(v))
        log("Device list refreshed")
    refresh_devices()

    def run_with_device():
        run_full_test(device_var.get())

    tk.Button(ctrl, text="▶ Run Full Test", command=run_with_device,
              bg="#4CAF50", fg="white", font=("", 10, "bold"), padx=15).pack(side=tk.LEFT, padx=2)

    tk.Button(ctrl, text="Refresh Mics", command=refresh_devices,
              padx=8).pack(side=tk.LEFT, padx=2)

    tk.Button(ctrl, text="Copy All", command=_copy_log,
              bg="#2196F3", fg="white", padx=10).pack(side=tk.LEFT, padx=2)
    tk.Button(ctrl, text="Clear", command=lambda: (
        log_area.delete("1.0", tk.END)
    ), padx=10).pack(side=tk.LEFT, padx=2)

    tk.Label(ctrl, text="  Speak 'pavi' / 'pavithra' during capture", fg="gray").pack(side=tk.LEFT, padx=10)

    log("STT Diagnostic Tool ready. Click 'Run Full Test' and speak 'pavi' during the 4s recording.")
    log("All WAV files saved to /tmp/diag_*.wav for manual inspection.\n")

    return root


if __name__ == "__main__":
    root = build_ui()
    root.mainloop()
