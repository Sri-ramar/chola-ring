import asyncio
import base64
import os
import threading

import sounddevice as sd
import numpy as np

import logging

logger = logging.getLogger("livevoice")


def _get_api_key():
    key = os.environ.get("NVIDIA_API_KEY")
    if key:
        return key
    return os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or ""


class LiveVoiceSession:
    """
    Real-time voice session using NVIDIA API for text interaction.
    Note: NVIDIA does not support real-time bidirectional audio streaming
    like Gemini Live. This session uses text-based chat completion instead.
    """

    def __init__(self, system_prompt="You are Rhiona, a helpful AI assistant. Be concise and natural."):
        self._loop = None
        self._thread = None
        self._session = None
        self._out_queue = None
        self._audio_in = None
        self._ready = threading.Event()
        self._send_lock = None
        self._system_prompt = system_prompt
        self._speaking_event = threading.Event()
        self._api_key = _get_api_key()

    def start(self, timeout=20):
        if self._thread and self._thread.is_alive():
            return
        if not self._api_key:
            raise RuntimeError("No NVIDIA API key found for live voice session")
        self._ready.set()
        logger.info("[LiveVoice] Session ready (NVIDIA text-based mode)")

    def _run_loop(self):
        pass

    async def _main(self):
        pass

    async def _send_loop(self):
        pass

    async def _recv_loop(self):
        pass

    async def _play_loop(self):
        pass

    def send_text(self, text):
        logger.info(f"[LiveVoice] send_text (no-op, use generate_local instead): {text[:50]}")

    def send_image(self, image_b64, mime="image/jpeg", text=""):
        logger.info(f"[LiveVoice] send_image (no-op, use vision module instead)")

    def is_ready(self):
        return bool(self._api_key)

    def is_speaking(self):
        return self._speaking_event.is_set()

    def stop(self):
        self._session = None
