import os
import io
import wave
import time
import struct
import threading
import subprocess
import tempfile
from pathlib import Path

import speech_recognition as sr
import sounddevice as sd
import numpy as np

import logging

logger = logging.getLogger("record")


SAMPLE_RATE = 48000
CHANNELS = 2
SAMPLE_WIDTH = 2

_device_cache = None
_device_cache_lock = threading.Lock()


class CaptureError(Exception):
    pass


def list_devices():
    devices = []
    for i, d in enumerate(sd.query_devices()):
        if d["max_input_channels"] > 0:
            devices.append((i, d["name"], d["max_input_channels"]))
    return devices


def _query_devices_safe():
    with _device_cache_lock:
        try:
            return list(sd.query_devices())
        except Exception:
            return []

def find_working_device():
    global _device_cache
    if _device_cache is not None:
        return _device_cache

    # 1. Check RHIONA_MIC_INDEX or RILEY_MIC_INDEX env var
    env_idx = os.getenv("RHIONA_MIC_INDEX") or os.getenv("RILEY_MIC_INDEX")
    if env_idx is not None:
        try:
            idx = int(env_idx)
            info = sd.query_devices(idx)
            rate = int(info.get("default_samplerate", 48000))
            ch = min(2, info["max_input_channels"])
            _device_cache = (idx, rate, ch)
            return _device_cache
        except Exception:
            pass

    # Try to list all devices
    devices = _query_devices_safe()
    if not devices:
        _device_cache = (None, None, None)
        return _device_cache

    # Filter for input devices
    input_devices = []
    for idx, d in enumerate(devices):
        if d.get("max_input_channels", 0) > 0:
            name = d.get("name", "").lower()
            # Avoid JACK devices to prevent PortAudio/pa_jack.c assertion crashes
            try:
                if sd.query_hostapis(d.get("hostapi"))["name"].upper() == "JACK":
                    continue
            except Exception:
                pass
            input_devices.append((idx, d, name))

    # Score each device based on name keywords
    scored_devices = []
    for idx, d, name in input_devices:
        score = 0
        
        # Check exclusion keywords (exclude AMD ACP hardware coprocessors, monitors, etc.)
        exclude = False
        for kw in ["acp", "monitor", "sink", "cava", "speaker"]:
            if kw in name:
                exclude = True
                break
        if exclude:
            continue
            
        # Positive keywords
        if "digital microphone" in name or "digital mic" in name:
            score += 100
        for kw in ["mic", "microphone", "headset", "analog"]:
            if kw in name:
                score += 10
                
        # Also check default status in system
        try:
            default_input_idx = sd.query_devices(kind='input')['index']
            if idx == default_input_idx:
                score += 5
        except Exception:
            pass
            
        scored_devices.append((score, idx, d))

    # Sort by score descending (highest score first)
    scored_devices.sort(key=lambda x: x[0], reverse=True)

    # Test the devices in order
    for score, idx, d in scored_devices:
        try:
            rate = int(d.get("default_samplerate", 48000))
            ch = min(2, d["max_input_channels"])
            sd.default.device = idx
            sd.default.samplerate = rate
            # Test record a tiny chunk
            audio = sd.rec(int(0.1 * rate), samplerate=rate, channels=ch, dtype="int16")
            sd.wait()
            _device_cache = (idx, rate, ch)
            return _device_cache
        except Exception:
            continue

    # If all scored devices failed, try default device as fallback
    try:
        default_info = sd.query_devices(kind='input')
        # Avoid JACK fallback
        try:
            if sd.query_hostapis(default_info.get("hostapi"))["name"].upper() == "JACK":
                raise ValueError("JACK fallback excluded")
        except Exception as ex:
            if isinstance(ex, ValueError):
                raise
        idx = default_info['index']
        rate = int(default_info.get("default_samplerate", 48000))
        ch = min(2, default_info["max_input_channels"])
        sd.default.device = idx
        sd.default.samplerate = rate
        audio = sd.rec(int(0.1 * rate), samplerate=rate, channels=ch, dtype="int16")
        sd.wait()
        _device_cache = (idx, rate, ch)
        return _device_cache
    except Exception:
        pass

    # Absolute fallback: try any input device
    if not input_devices:
        for i, d in enumerate(devices):
            if d.get("max_input_channels", 0) > 0:
                try:
                    if sd.query_hostapis(d.get("hostapi"))["name"].upper() == "JACK":
                        continue
                except Exception:
                    pass
                input_devices.append((i, d, d.get("name", "").lower()))
    for idx, d, name in input_devices:
        try:
            rate = int(d.get("default_samplerate", 48000))
            ch = min(2, d["max_input_channels"])
            sd.default.device = idx
            sd.default.samplerate = rate
            audio = sd.rec(int(0.1 * rate), samplerate=rate, channels=ch, dtype="int16")
            sd.wait()
            _device_cache = (idx, rate, ch)
            return _device_cache
        except Exception:
            continue

    return None, None, None


def _audio_to_wav_bytes(audio: np.ndarray, rate: int, channels: int) -> bytes:
    if channels == 2 and audio.ndim == 2:
        ch0 = audio[:, 0]
        ch1 = audio[:, 1]
        rms0 = float(np.sqrt(np.mean(ch0.astype(np.float32) ** 2))) if len(ch0) > 0 else 0
        rms1 = float(np.sqrt(np.mean(ch1.astype(np.float32) ** 2))) if len(ch1) > 0 else 0
        mono = ch0.astype(np.int16) if rms0 >= rms1 else ch1.astype(np.int16)
    else:
        mono = audio.ravel().astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(SAMPLE_WIDTH)
        wf.setframerate(rate)
        wf.writeframes(mono.tobytes())
    return buf.getvalue()


def record_audio_pyaudio(
    duration: float = 4.0,
    rate: int = 16000,
    channels: int = 1,
    device_idx: int = None,
) -> bytes:
    import pyaudio
    p = pyaudio.PyAudio()
    try:
        kwargs = dict(
            format=pyaudio.paInt16,
            channels=channels,
            rate=rate,
            input=True,
            frames_per_buffer=1024,
        )
        if device_idx is not None:
            kwargs["input_device_index"] = device_idx
        stream = p.open(**kwargs)
        frames = []
        num_chunks = int(duration * rate / 1024)
        for _ in range(num_chunks):
            data = stream.read(1024, exception_on_overflow=False)
            frames.append(data)
        stream.stop_stream()
        stream.close()
        
        raw_data = b"".join(frames)
        audio_np = np.frombuffer(raw_data, dtype=np.int16)
        if channels > 1:
            audio_np = audio_np.reshape(-1, channels)
        return _audio_to_wav_bytes(audio_np, rate, channels)
    finally:
        p.terminate()


def record_audio_sounddevice(
    duration: float = 4.0,
    device: int = None,
    rate: int = SAMPLE_RATE,
    channels: int = CHANNELS,
) -> bytes:
    if device is not None:
        sd.default.device = device
    sd.default.samplerate = rate
    audio = sd.rec(int(duration * rate), samplerate=rate, channels=channels, dtype="int16")
    sd.wait()
    return _audio_to_wav_bytes(audio, rate, channels)


def record_audio_arecord(
    duration: float = 4.0,
    device: str = "default",
    rate: int = 48000,
    channels: int = 2,
) -> bytes:
    cmd = [
        "arecord",
        "-D", device,
        "-f", "S32_LE",
        "-r", str(rate),
        "-c", str(channels),
        "-d", str(int(duration)),
        "--file-type", "raw",
        "--quiet",
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=int(duration) + 5)
    except FileNotFoundError as e:
        raise CaptureError("arecord not found") from e
    except subprocess.TimeoutExpired as e:
        raise CaptureError("arecord timed out") from e

    raw = result.stdout
    if not raw:
        raise CaptureError("arecord returned no data")

    expected = rate * channels * 4 * int(duration)
    if len(raw) < expected * 0.5:
        raise CaptureError(f"arecord returned only {len(raw)} bytes (expected ~{expected})")

    samples = np.frombuffer(raw, dtype=np.int32)
    samples = samples[: (len(samples) // channels) * channels]
    samples = samples.reshape(-1, channels).astype(np.float64)
    samples /= 2147483648.0  # 2^31 (not 2^31-1): divide by max positive to normalize to [-1, 1)
    samples_int16 = (samples * 32767).clip(-32768, 32767).astype(np.int16)

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(SAMPLE_WIDTH)
        wf.setframerate(rate)
        if channels == 2:
            interleaved = np.zeros(len(samples_int16) * 2, dtype=np.int16)
            interleaved[0::2] = samples_int16[:, 0]
            interleaved[1::2] = samples_int16[:, 1]
            wf.writeframes(interleaved.tobytes())
        else:
            wf.writeframes(samples_int16.tobytes())
    return buf.getvalue()


def get_arecord_device_name(device_idx: int = None) -> str:
    import re
    if device_idx is None:
        return "default"
    try:
        info = sd.query_devices(device_idx)
        name = info.get("name", "")
        # Find hardware card/device if specified in the PortAudio device name
        match = re.search(r'\(hw:(\d+),(\d+)\)', name)
        if match:
            card, device = match.groups()
            return f"hw:{card},{device}"
        if "default" in name.lower() or "pipewire" in name.lower():
            return "default"
    except Exception:
        pass
    return "default"


def record_audio(
    duration: float = 4.0,
    use_arecord: bool = False,
    device_idx: int = None,
) -> bytes:
    if use_arecord:
        return record_audio_arecord(duration, device=get_arecord_device_name(device_idx))
    try:
        # Use pyaudio recording first as verified in test_live_api.py
        # We record in mono at 16000Hz directly to avoid channel processing/downsampling issues
        return record_audio_pyaudio(duration, rate=16000, channels=1, device_idx=device_idx)
    except Exception as pyaudio_err:
        logger.warning(f"pyaudio recording failed: {pyaudio_err}. Trying sounddevice fallback...")
        try:
            if device_idx is not None:
                info = sd.query_devices(device_idx)
                rate = int(info.get("default_samplerate", SAMPLE_RATE))
                ch = min(CHANNELS, info["max_input_channels"])
                dev_idx = device_idx
            else:
                dev_idx, rate, ch = find_working_device()
                if dev_idx is None:
                    raise CaptureError("no working sounddevice input found")
            return record_audio_sounddevice(duration, device=dev_idx, rate=rate, channels=ch)
        except Exception as sd_err:
            try:
                arecord_dev = get_arecord_device_name(device_idx)
                return record_audio_arecord(duration, device=arecord_dev)
            except Exception:
                raise CaptureError(f"pyaudio failed ({pyaudio_err}), sounddevice failed ({sd_err}), and arecord fallback also failed")


def wav_bytes_to_audiodata(wav_bytes: bytes, recognizer: sr.Recognizer = None) -> sr.AudioData:
    r = recognizer or sr.Recognizer()
    with sr.AudioFile(io.BytesIO(wav_bytes)) as source:
        return r.record(source)


def recognize_bytes(wav_bytes: bytes, recognizer: sr.Recognizer = None) -> str:
    r = recognizer or sr.Recognizer()
    audio_data = wav_bytes_to_audiodata(wav_bytes, recognizer=r)
    return r.recognize_google(audio_data)


def filter_fan_noise(samples_int16, alpha=0.92):
    """
    IIR High-Pass Filter (Cutoff ~200Hz at 16kHz sample rate).
    Strips room fan low-frequency rumble and steady background noise.
    """
    if len(samples_int16) < 2:
        return samples_int16
    x = samples_int16.astype(np.float32)
    y = np.zeros_like(x)
    y[0] = x[0]
    diffs = np.diff(x, prepend=x[0])
    for i in range(1, len(x)):
        y[i] = alpha * y[i-1] + diffs[i]
    return y.astype(np.int16)


class BackgroundListener:
    def __init__(self, callback, recognizer=None, device_idx=None, parent=None, engine=None):
        self.callback = callback
        self.recognizer = recognizer or sr.Recognizer()
        self._stop_event = threading.Event()
        self._thread = None
        self._device_idx = device_idx
        self._parent = parent
        self._engine = engine

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self, wait=False):
        self._stop_event.set()
        # Always join briefly (even when wait=False) so the mic stream is
        # released before the caller (e.g. GeminiLiveSession) opens it again.
        if self._thread and self._thread.is_alive():
            try:
                self._thread.join(timeout=2.0 if wait else 1.0)
            except Exception:
                pass
        self._thread = None

    def _run(self):
        import time, wave, io
        import sounddevice as sd
        import numpy as np
        from collections import deque

        target_device = self._device_idx
        try:
            d_info = sd.query_devices(target_device if target_device is not None else None, 'input')
            rate = int(d_info.get('default_samplerate', 48000))
            channels = min(2, d_info.get('max_input_channels', 1))
        except Exception:
            rate = 48000
            channels = 1

        target_rate = 16000
        window_sec = 3.5  # Rolling 3.5-second buffer (never misses wake words regardless of timing)
        max_samples_16k = int(window_sec * target_rate)
        
        # Thread-safe rolling audio buffer
        audio_ring = deque(maxlen=max_samples_16k)
        ring_lock = threading.Lock()

        def stream_callback(indata, frames, time_info, status):
            if status:
                logger.debug(f"[ContinuousMic] Status: {status}")
            # Downsample to 16kHz mono immediately
            chunk = indata[:, 0] if indata.ndim > 1 else indata.flatten()
            if rate != target_rate:
                n = int(len(chunk) * (target_rate / rate))
                if n > 0:
                    chunk_16k = np.interp(
                        np.linspace(0, len(chunk), n, endpoint=False),
                        np.arange(len(chunk)),
                        chunk.astype(np.float32)
                    ).astype(np.int16)
                else:
                    chunk_16k = np.array([], dtype=np.int16)
            else:
                chunk_16k = chunk.astype(np.int16)

            with ring_lock:
                audio_ring.extend(chunk_16k)

        logger.info(f"🎙 [Continuous Mic Engine] Started sliding-window mic listener on device {target_device} @ {target_rate}Hz...")

        # Signal UI: Mic is active (Solid green ONLINE state)
        if self._engine and hasattr(self._engine, 'mic_recording_signal'):
            self._engine.mic_recording_signal.emit(True)

        try:
            stream = sd.InputStream(
                device=target_device,
                samplerate=rate,
                channels=channels,
                dtype='int16',
                callback=stream_callback,
                blocksize=1600,  # ~100ms blocks
            )
            with stream:
                last_eval_at = time.monotonic()
                while not self._stop_event.is_set():
                    time.sleep(0.5)  # Check rolling buffer every 500ms

                    with ring_lock:
                        if len(audio_ring) < int(1.2 * target_rate):
                            continue  # Wait for at least 1.2s of audio to accumulate
                        samples_16k = np.array(audio_ring, dtype=np.int16)

                    # Compute RMS of recent 0.5s for UI meter
                    recent_samples = samples_16k[-int(0.5 * target_rate):]
                    rms = float(np.sqrt(np.mean(recent_samples.astype(np.float32) ** 2))) if len(recent_samples) > 0 else 0

                    if self._parent and hasattr(self._parent, '_push_audio_level'):
                        self._parent._push_audio_level(rms)

                    # Skip empty silence
                    if rms < 35.0:
                        continue

                    # Only run STT evaluation every 0.8s to avoid overloading
                    now = time.monotonic()
                    if now - last_eval_at < 0.8:
                        continue
                    last_eval_at = now

                    # Create WAV in memory from rolling 3.5s buffer
                    buf = io.BytesIO()
                    with wave.open(buf, "wb") as wf:
                        wf.setnchannels(1)
                        wf.setsampwidth(2)
                        wf.setframerate(target_rate)
                        wf.writeframes(samples_16k.tobytes())

                    audio_data = wav_bytes_to_audiodata(buf.getvalue())
                    self.callback(self.recognizer, audio_data)

        except Exception as e:
            logger.error(f"[Continuous Mic Engine] Mic stream error: {e}")
            time.sleep(0.5)
        finally:
            if self._engine and hasattr(self._engine, 'mic_recording_signal'):
                self._engine.mic_recording_signal.emit(False)



def record_audio_vad(
    silence_sec: float = 1.5,
    device_idx: int = None,
    max_duration: float = 15.0,
    cancel_event: threading.Event = None,
    hold_off_sec: float = 0.5,
    aggressiveness: int = 2,
) -> bytes:
    import webrtcvad
    if device_idx is None:
        device_idx, _, _ = find_working_device()

    info = sd.query_devices(device_idx)
    rate = int(info.get("default_samplerate", 48000))
    channels = min(2, info["max_input_channels"])

    vad = webrtcvad.Vad(aggressiveness)
    buffer = []
    state = {
        "speech_detected": False,
        "last_speech_time": time.monotonic(),
        "recording": True,
    }

    def callback(indata, frames, time_info, status):
        if not state["recording"]:
            raise sd.CallbackStop()
        buffer.append(indata.copy())

    stream = sd.InputStream(
        device=device_idx,
        samplerate=rate,
        channels=channels,
        dtype='int16',
        callback=callback,
        blocksize=480,
    )

    def _to_mono_16k(raw_chunk, src_rate):
        if raw_chunk.ndim > 1:
            if raw_chunk.shape[1] == 2:
                ch0 = raw_chunk[:, 0]
                ch1 = raw_chunk[:, 1]
                rms0 = float(np.sqrt(np.mean(ch0.astype(np.float32) ** 2))) if len(ch0) > 0 else 0
                rms1 = float(np.sqrt(np.mean(ch1.astype(np.float32) ** 2))) if len(ch1) > 0 else 0
                raw_chunk = ch0.astype(np.int16) if rms0 >= rms1 else ch1.astype(np.int16)
            else:
                raw_chunk = raw_chunk.ravel().astype(np.int16)
        else:
            raw_chunk = raw_chunk.astype(np.int16)
        if src_rate != 16000:
            raw_chunk = _resample(raw_chunk, src_rate, 16000)
        return raw_chunk

    def _resample(data, orig_rate, target_rate):
        data = np.asarray(data).ravel()
        ratio = target_rate / orig_rate
        n = int(len(data) * ratio)
        return np.interp(
            np.linspace(0, len(data), n, endpoint=False),
            np.arange(len(data)),
            data.astype(np.float64)
        ).astype(np.int16)

    start_time = time.monotonic()
    vad_audio_buffer = b""  # accumulated 16kHz mono bytes for VAD
    _processed = 0
    with stream:
        while state["recording"]:
            if cancel_event and cancel_event.is_set():
                state["recording"] = False
                break
            time.sleep(0.05)
            now = time.monotonic()

            if now - start_time < hold_off_sec:
                continue

            if len(buffer) == 0:
                continue

            # Process only new chunks
            while _processed < len(buffer):
                chunk = buffer[_processed]
                _processed += 1
                mono_chunk = _to_mono_16k(chunk, rate)
                vad_audio_buffer += mono_chunk.tobytes()
            # Process VAD for all accumulated 10ms frames (160 samples @ 16kHz = 320 bytes)
            if len(vad_audio_buffer) >= 320:
                vad_bytes = vad_audio_buffer[: (len(vad_audio_buffer) // 320) * 320]
                vad_audio_buffer = vad_audio_buffer[len(vad_bytes):]
                is_speech = any(
                    len(vad_bytes[i:i+320]) == 320 and
                    vad.is_speech(vad_bytes[i:i+320], 16000)
                    for i in range(0, len(vad_bytes), 320)
                )
                if is_speech:
                    if not state["speech_detected"]:
                        logger.info("[VAD] Speech started")
                        state["speech_detected"] = True
                    state["last_speech_time"] = now

            if state["speech_detected"] and (now - state["last_speech_time"] > silence_sec):
                logger.info(f"[VAD] Silence for {silence_sec}s. Stopping.")
                state["recording"] = False
                break

            if now - start_time > max_duration:
                state["recording"] = False
                break

    if len(buffer) == 0:
        raise RuntimeError("No audio captured")

    audio_data = np.concatenate(buffer)

    # Remove DC offset (some JACK/digital mics return all-positive audio)
    audio_data = audio_data.astype(np.int32)
    audio_data -= np.int32(audio_data.mean())
    audio_data = audio_data.clip(-32768, 32767).astype(np.int16)

    # Convert to 16kHz mono for Whisper / STT
    if rate != 16000 or channels > 1:
        if channels > 1:
            ch0 = audio_data[:, 0]
            ch1 = audio_data[:, 1]
            rms0 = float(np.sqrt(np.mean(ch0.astype(np.float32) ** 2))) if len(ch0) > 0 else 0
            rms1 = float(np.sqrt(np.mean(ch1.astype(np.float32) ** 2))) if len(ch1) > 0 else 0
            audio_data = ch0.astype(np.int16) if rms0 >= rms1 else ch1.astype(np.int16)
        else:
            audio_data = audio_data.ravel()
        if rate != 16000:
            ratio = 16000 / rate
            n = int(len(audio_data) * ratio)
            audio_data = np.interp(
                np.linspace(0, len(audio_data), n, endpoint=False),
                np.arange(len(audio_data)),
                audio_data.astype(np.float64)
            ).astype(np.int16)
        rate = 16000

    return _audio_to_wav_bytes(audio_data, rate, 1)


def record_audio_until_silence(
    silence_sec: float = 2.0,
    device_idx: int = None,
    max_duration: float = 15.0,
    silence_threshold: float = 150.0,
    cancel_event: threading.Event = None,
    hold_off_sec: float = 0.3
) -> bytes:
    import time
    if device_idx is None:
        device_idx, _, _ = find_working_device()
        
    info = sd.query_devices(device_idx)
    rate = int(info.get("default_samplerate", 48000))
    channels = min(2, info["max_input_channels"])
    dev_name = info.get("name", f"device {device_idx}")
    logger.info(f"[Record] Listening on {dev_name} ({channels}ch @ {rate}Hz)")
    
    buffer = []
    state = {"speech_detected": False, "last_sound_time": time.monotonic(), "recording": True}
    
    def callback(indata, frames, time_info, status):
        if not state["recording"]:
            raise sd.CallbackStop()
        buffer.append(indata.copy())
        
    stream = sd.InputStream(
        device=device_idx,
        samplerate=rate,
        channels=channels,
        dtype='int16',
        callback=callback,
        blocksize=1024
    )
    
    start_time = time.monotonic()
    last_log = 0.0
    with stream:
        while state["recording"]:
            if cancel_event and cancel_event.is_set():
                logger.info("[Record] Cancelled.")
                state["recording"] = False
                break

            time.sleep(0.1)
            now = time.monotonic()
            
            # Hold-off period: ignore all audio for speech detection
            if now - start_time < hold_off_sec:
                continue
            
            # Check last ~130ms of data (10 blocks of 1024 frames at 48kHz)
            if len(buffer) >= 10:
                last_chunk = np.concatenate(buffer[-10:])
                rms = np.sqrt(np.mean(last_chunk.astype(np.float64) ** 2))
                
                if now - last_log > 2.0:
                    logger.info(f"[Record] RMS={rms:.1f} (threshold={silence_threshold}) buffered={len(buffer)}")
                    last_log = now
                
                if rms > silence_threshold:
                    if not state["speech_detected"]:
                        logger.info(f"[Record] Speech detected! (RMS={rms:.1f})")
                        state["speech_detected"] = True
                    state["last_sound_time"] = now
            
            if state["speech_detected"] and (now - state["last_sound_time"] > silence_sec):
                logger.info(f"[Record] Silence for {silence_sec}s. Stopping.")
                state["recording"] = False
                break
                
            if now - start_time > max_duration:
                logger.info(f"[Record] Max duration {max_duration}s reached.")
                state["recording"] = False
                break
                
    if len(buffer) == 0:
        raise RuntimeError("No audio captured")
        
    audio_data = np.concatenate(buffer)
    logger.info(f"[Record] Captured {len(audio_data)} samples ({len(audio_data)/rate:.1f}s)")

    return _audio_to_wav_bytes(audio_data, rate, channels)
