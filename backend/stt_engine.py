import io
import wave
import numpy as np
import logging
import speech_recognition as sr

logger = logging.getLogger("stt")

class STTEngine:
    def __init__(self):
        self.recognizer = sr.Recognizer()
        self.recognizer.energy_threshold = 300
        self.recognizer.dynamic_energy_threshold = False
        logger.info("⚡ [STT Engine] Initialized using Google Free Speech Recognition API (en-IN)")

    def is_online(self):
        return True

    def transcribe(self, audio) -> str | None:
        """Transcribe audio using Google Free Speech API (en-IN / en-US). 100% free, no key, <0.3s response."""
        audio_data = self._to_audiodata(audio)
        if not audio_data:
            return None

        # 1. Try Google Free STT (en-IN: Indian English tuned for Indian names like Nila/Pavi)
        try:
            text = self.recognizer.recognize_google(audio_data, language="en-IN")
            if text and text.strip():
                logger.info(f"🌐 [Google STT]: \"{text.strip()}\"")
                return text.strip()
        except sr.UnknownValueError:
            return None  # Quiet / Silence — returned no speech cleanly
        except Exception as e:
            logger.debug(f"[Google STT (en-IN)] {e}")

        # 2. Try Google Free STT (en-US fallback)
        try:
            text = self.recognizer.recognize_google(audio_data, language="en-US")
            if text and text.strip():
                logger.info(f"🌐 [Google STT (US)]: \"{text.strip()}\"")
                return text.strip()
        except Exception:
            pass

        return None

    # ── Helpers ──────────────────────────────────────────────────────────────

    @staticmethod
    def _to_wav_bytes(audio) -> bytes:
        """Convert AudioData or bytes to 16kHz mono WAV bytes with normalization."""
        try:
            if isinstance(audio, sr.AudioData):
                raw = audio.get_raw_data(convert_rate=16000, convert_width=2)
                samples = np.frombuffer(raw, dtype=np.int16).astype(np.int32)
                # Strip DC offset
                samples -= int(samples.mean())
                peak = np.max(np.abs(samples))
                if 0 < peak < 12000:
                    gain = min(3.0, 18000.0 / peak)
                    samples = (samples * gain).clip(-32768, 32767)
                res = samples.astype(np.int16)
                buf = io.BytesIO()
                with wave.open(buf, 'wb') as wf:
                    wf.setnchannels(1)
                    wf.setsampwidth(2)
                    wf.setframerate(16000)
                    wf.writeframes(res.tobytes())
                return buf.getvalue()
        except Exception:
            pass
        if isinstance(audio, bytes):
            if audio.startswith(b'RIFF'):
                return audio
            buf = io.BytesIO()
            with wave.open(buf, 'wb') as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(16000)
                wf.writeframes(audio)
            return buf.getvalue()
        return b''

    def _to_audiodata(self, audio):
        if isinstance(audio, sr.AudioData):
            return audio
        wav_bytes = self._to_wav_bytes(audio)
        if not wav_bytes:
            return None
        buf = io.BytesIO(wav_bytes)
        buf.seek(0)
        try:
            with sr.AudioFile(buf) as source:
                return self.recognizer.record(source)
        except Exception:
            return None


stt = STTEngine()
