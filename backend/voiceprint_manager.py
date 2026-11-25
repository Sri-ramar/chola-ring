import os
import numpy as np
import librosa
import logging

logger = logging.getLogger("VoiceprintManager")
logger.setLevel(logging.INFO)

VOICEPRINT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "user_voiceprint.npy")

class VoiceprintManager:
    _cached_embedding = None

    @classmethod
    def load_user_voiceprint(cls):
        if cls._cached_embedding is not None:
            return cls._cached_embedding
        if os.path.exists(VOICEPRINT_FILE):
            try:
                cls._cached_embedding = np.load(VOICEPRINT_FILE)
                logger.info(f"🎙 [Voiceprint] Loaded Sri Ramar's voiceprint embedding from {VOICEPRINT_FILE}")
                return cls._cached_embedding
            except Exception as e:
                logger.error(f"[Voiceprint] Error loading voiceprint file: {e}")
        return None

    @classmethod
    def extract_mfcc_embedding(cls, samples, sample_rate=16000):
        if samples is None or len(samples) < 1600:
            return None
        try:
            float_samples = samples.astype(np.float32) / 32768.0
            mfcc = librosa.feature.mfcc(y=float_samples, sr=sample_rate, n_mfcc=20)
            mfcc_mean = np.mean(mfcc, axis=1)
            norm = np.linalg.norm(mfcc_mean)
            if norm > 0:
                mfcc_mean = mfcc_mean / norm
            return mfcc_mean
        except Exception:
            return None

    @classmethod
    def verify_speaker(cls, samples, sample_rate=16000, threshold=0.65):
        target_embedding = cls.load_user_voiceprint()
        if target_embedding is None:
            # If no voiceprint enrolled yet, allow audio through by default
            return True, 1.0

        current_embedding = cls.extract_mfcc_embedding(samples, sample_rate)
        if current_embedding is None:
            return True, 1.0

        # Cosine similarity between stored voiceprint and live mic input
        sim = float(np.dot(target_embedding, current_embedding))
        is_match = sim >= threshold
        return is_match, sim

    @classmethod
    def save_voiceprint(cls, samples, sample_rate=16000):
        emb = cls.extract_mfcc_embedding(samples, sample_rate)
        if emb is not None:
            np.save(VOICEPRINT_FILE, emb)
            cls._cached_embedding = emb
            logger.info(f"🎉 [Voiceprint] Successfully saved Sri Ramar's voiceprint to {VOICEPRINT_FILE}")
            return True
        return False
