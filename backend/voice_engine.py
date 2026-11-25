from __future__ import annotations

import json
import logging
import os
from collections.abc import Iterator
from functools import lru_cache
from pathlib import Path
from threading import Event, Lock
from typing import Literal

import soundfile as sf
import torch

os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

from liquid_audio import ChatState, LFM2AudioModel, LFM2AudioProcessor

logger = logging.getLogger("rhiona.voice")


MODEL_DIR = Path("models") / "LFM2.5-Audio-1.5B"
OUTPUT_DIR = Path("outputs")
SAMPLE_RATE = 24_000

VOICE_PROMPTS = {
    "US female": "Perform TTS. Use the US female voice.",
    "US male": "Perform TTS. Use the US male voice.",
    "UK female": "Perform TTS. Use the UK female voice.",
    "UK male": "Perform TTS. Use the UK male voice.",
    "Jack Sparrow": "Perform TTS. Speak in the distinct voice of Captain Jack Sparrow: a theatrical, drunken, slurred British pirate accent with witty, eccentric cadences.",
    "Morgan Freeman": "Perform TTS. Speak in a deep, gravelly, cinematic, authoritative, slow narrator voice.",
    "Sherlock Holmes": "Perform TTS. Speak in a crisp, sharp, fast, sophisticated British intellectual voice.",
    "Deep male": "Perform TTS. Use a deep, authoritative male voice.",
    "Young female": "Perform TTS. Use a young, cheerful female voice.",
    "Calm narrator": "Perform TTS. Use a calm, slow, formal narrator voice.",
    "Soft whisper": "Perform TTS. Use a soft, quiet, whispery voice.",
    "Indian English": "Perform TTS. Use an Indian English accent.",
}

GENERATION_LOCK = Lock()


def _model_source() -> str | Path:
    if MODEL_DIR.exists() and any(MODEL_DIR.iterdir()):
        return MODEL_DIR
    return "LiquidAI/LFM2.5-Audio-1.5B"


def _device() -> torch.device:
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def _load_on_device(device: torch.device) -> tuple[LFM2AudioProcessor, LFM2AudioModel, torch.device]:
    source = _model_source()
    processor = LFM2AudioProcessor.from_pretrained(source, device=device).eval()
    model = LFM2AudioModel.from_pretrained(source, device=device).eval()
    return processor, model, device


def _load_quantized(model_dir: str | Path) -> LFM2AudioModel:
    import bitsandbytes as bnb
    from accelerate import init_on_device, load_checkpoint_in_model
    from liquid_audio.model.lfm2_audio import (
        ConformerEncoderConfig,
        DepthformerConfig,
        LFM2AudioConfig,
        LFM2AudioModel,
        Lfm2Config,
    )
    from liquid_audio.utils import get_model_dir

    cache_path = get_model_dir(model_dir)
    with (cache_path / "config.json").open() as f:
        config = json.load(f)
    conf = LFM2AudioConfig(
        lfm=Lfm2Config(**config.pop("lfm")),
        encoder=ConformerEncoderConfig(**config.pop("encoder")),
        depthformer=DepthformerConfig(**config.pop("depthformer")),
        **config,
    )

    dtype = torch.bfloat16
    with init_on_device(torch.device("cpu"), include_buffers=True):
        model = LFM2AudioModel(conf).to(dtype=dtype)
    load_checkpoint_in_model(model, cache_path)

    def replace_linears(module: torch.nn.Module) -> None:
        for name, child in list(module.named_children()):
            if isinstance(child, torch.nn.Linear):
                new = bnb.nn.Linear4bit(
                    child.in_features,
                    child.out_features,
                    bias=child.bias is not None,
                    quant_type="nf4",
                    compute_dtype=dtype,
                    device="cpu",
                )
                new.weight = bnb.nn.Params4bit(
                    child.weight.detach().to(torch.float32),
                    requires_grad=False,
                    quant_type="nf4",
                    compress_statistics=True,
                )
                if child.bias is not None:
                    new.bias = torch.nn.Parameter(child.bias.detach(), requires_grad=False)
                setattr(module, name, new)
            else:
                replace_linears(child)

    replace_linears(model)
    return model.eval().to(torch.device("cuda"))


def _load_cuda() -> tuple[LFM2AudioProcessor, LFM2AudioModel, torch.device]:
    source = _model_source()
    if isinstance(source, Path):
        processor = LFM2AudioProcessor.from_pretrained(source, device=torch.device("cuda")).eval()
        model = _load_quantized(source)
    else:
        return _load_on_device(torch.device("cuda"))
    return processor, model, torch.device("cuda")


@lru_cache(maxsize=1)
def load_model() -> tuple[LFM2AudioProcessor, LFM2AudioModel, torch.device]:
    device = _device()
    if device.type == "cuda":
        try:
            return _load_cuda()
        except torch.OutOfMemoryError:
            torch.cuda.empty_cache()
        except Exception as exc:  # noqa: BLE001
            print(f"GPU (4-bit) load failed, falling back to CPU: {exc}")
            torch.cuda.empty_cache()
    try:
        return _load_on_device(torch.device("cpu"))
    except torch.OutOfMemoryError:
        raise


def warm_model() -> str:
    with GENERATION_LOCK:
        _, _, device = load_model()
        return device.type


def _wave_to_output(waveform: torch.Tensor, filename: str) -> str:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUTPUT_DIR / filename
    audio = waveform.detach().cpu()
    while audio.ndim > 1 and audio.shape[0] == 1:
        audio = audio.squeeze(0)
    if audio.ndim == 2 and audio.shape[0] <= 2:
        audio = audio.T
    sf.write(path, audio.numpy(), SAMPLE_RATE)
    return str(path)


def _decode_audio(processor: LFM2AudioProcessor, audio_codes: torch.Tensor) -> torch.Tensor:
    try:
        return processor.decode(audio_codes)
    except AssertionError as exc:
        if "Torch not compiled with CUDA enabled" not in str(exc):
            raise
        return processor.mimi.decode(audio_codes)


def _chunk_to_pcm16(waveform: torch.Tensor) -> bytes:
    audio = waveform.detach().cpu()
    while audio.ndim > 1 and audio.shape[0] == 1:
        audio = audio.squeeze(0)
    if audio.ndim == 2:
        audio = audio.mean(0)
    audio = audio.clamp(-1, 1)
    return (audio * 32767).to(torch.int16).numpy().tobytes()


import numpy as np


class _AGC:
    """Fast streaming auto-gain control and PCM16 encoder with smooth interpolation."""

    def __init__(self, target: float = 0.95, max_gain: float = 8.0) -> None:
        self.target = target
        self.max_gain = max_gain
        self.peak = 0.0
        self.current_gain = 1.0

    def to_pcm16(self, waveform: torch.Tensor) -> bytes:
        arr = waveform.detach().cpu().float().numpy()
        while arr.ndim > 1 and arr.shape[0] == 1:
            arr = arr[0]
        if arr.ndim == 2:
            arr = arr.mean(axis=0)
        if arr.size == 0:
            return b""

        chunk_peak = float(np.abs(arr).max())
        if chunk_peak > self.peak:
            self.peak = chunk_peak
        else:
            self.peak = max(self.peak * 0.98, chunk_peak)

        target_gain = min(self.max_gain, self.target / max(self.peak, 1e-6))
        # Smoothly interpolate gain across samples to avoid clicks at chunk boundaries
        gains = np.linspace(self.current_gain, target_gain, len(arr), dtype=np.float32)
        self.current_gain = target_gain

        scaled = np.clip(arr * gains, -1.0, 1.0)
        return (scaled * 32767.0).astype(np.int16).tobytes()

    def apply(self, waveform: torch.Tensor) -> torch.Tensor:
        audio = waveform.detach().cpu()
        while audio.ndim > 1 and audio.shape[0] == 1:
            audio = audio.squeeze(0)
        if audio.ndim == 2:
            audio = audio.mean(0)
        if audio.numel() == 0:
            return audio
        chunk_peak = float(audio.abs().max())
        if chunk_peak > self.peak:
            self.peak = chunk_peak
        else:
            self.peak = max(self.peak * 0.98, chunk_peak)
        gain = min(self.max_gain, self.target / max(self.peak, 1e-6))
        return (audio * gain).clamp(-1, 1)


def stream_speak(
    text: str,
    voice: Literal["US male", "US female", "UK male", "UK female"],
    max_tokens: int,
    audio_temperature: float,
    audio_top_k: int,
    cancel: Event | None = None,
) -> Iterator[tuple[str, str | bytes]]:
    text = text.strip()
    if not text:
        yield "status", "Type something first."
        return

    with GENERATION_LOCK:
        processor, model, device = load_model()
        chat = ChatState(processor)
        chat.new_turn("system")
        chat.add_text(VOICE_PROMPTS[voice])
        chat.end_turn()

        chat.new_turn("user")
        chat.add_text(text)
        chat.end_turn()

        chat.new_turn("assistant")
        yielded_audio = False
        agc = _AGC()
        logger.info("TTS start on %s (%s voice): %r", device.type, voice, text)
        yield "status", f"Streaming on {device.type} using {voice}."

        with torch.inference_mode(), processor.mimi.streaming(1):
            for token in model.generate_sequential(
                **chat,
                max_new_tokens=max_tokens,
                audio_temperature=audio_temperature,
                audio_top_k=audio_top_k,
            ):
                if cancel and cancel.is_set():
                    yield "status", "Stopped."
                    return
                if token.numel() <= 1 or (token == 2048).any():
                    continue
                wav_chunk = processor.mimi.decode(token.to(device)[None, :, None])[0]
                yielded_audio = True
                yield "audio", agc.to_pcm16(wav_chunk)

        if not yielded_audio:
            logger.warning("TTS produced no audio tokens.")
            yield "status", "The model did not return audio tokens. Try a shorter sentence."
        else:
            logger.info("TTS done: %r", text)


def stream_voice_chat_from_wave(
    wave: torch.Tensor,
    sampling_rate: int,
    prompt: str,
    max_tokens: int,
    audio_temperature: float,
    audio_top_k: int,
    voice: str = "US female",
    cancel: Event | None = None,
) -> Iterator[tuple[str, str | bytes]]:
    with GENERATION_LOCK:
        processor, model, device = load_model()

        # Step 1: Transcribe user speech using native Liquid AI ASR
        peak = float(wave.abs().max())
        if peak > 0:
            gain = min(0.95 / peak, 10.0)
            if gain > 1.0:
                wave = wave * gain
                logger.info("Input normalized: peak %.3f -> 0.95 (gain x%.2f).", peak, gain)

        asr_chat = ChatState(processor)
        asr_chat.new_turn("system")
        asr_chat.add_text("Perform ASR.")
        asr_chat.end_turn()

        asr_chat.new_turn("user")
        asr_chat.add_audio(wave, sampling_rate)
        asr_chat.end_turn()

        asr_chat.new_turn("assistant")
        user_tokens: list[str] = []
        with torch.inference_mode():
            for t in model.generate_sequential(**asr_chat, max_new_tokens=48):
                if cancel and cancel.is_set():
                    return
                if t.numel() == 1:
                    user_tokens.append(processor.text.decode(t))
                if "<|im_end|>" in "".join(user_tokens):
                    break

        user_raw = "".join(user_tokens)
        if "<|im_end|>" in user_raw:
            user_raw = user_raw.split("<|im_end|>")[0]
        if "<|text_end|>" in user_raw:
            user_raw = user_raw.split("<|text_end|>")[0]
        user_text = user_raw.strip()
        logger.info("Native Liquid AI ASR transcribed user speech: %r", user_text)
        yield "user_transcript", user_text

        # Step 2: Native Liquid AI Speech-to-Speech (interleaved generation)
        chat = ChatState(processor)
        chat.new_turn("system")
        base_voice_desc = VOICE_PROMPTS.get(voice, "Use the US female voice.").removeprefix("Perform TTS. ").strip()
        if not base_voice_desc.endswith("."):
            base_voice_desc += "."
        system_prompt = f"Respond with interleaved text and audio. {base_voice_desc}"
        if prompt.strip():
            system_prompt += f" {prompt.strip()}"
        chat.add_text(system_prompt)
        chat.end_turn()
        logger.info("S2S starting with voice=%r prompt=%r", voice, system_prompt)

        chat.new_turn("user")
        chat.add_audio(wave, sampling_rate)
        if user_text:
            chat.add_text(user_text)
        chat.end_turn()

        chat.new_turn("assistant")
        yielded_audio = False
        agc = _AGC()
        logger.info("Voice chat started on %s (input %.2fs audio).", device.type, wave.shape[-1] / sampling_rate)
        yield "status", f"Answering on {device.type}."

        text_parts: list[str] = []
        text_token_count = 0
        audio_chunk_count = 0
        dynamic_audio_quota = 512
        text_finished = False

        # Supply ample upper ceiling to generate_interleaved, dynamically controlling completion
        engine_max_tokens = max(max_tokens, 512)

        with torch.inference_mode(), processor.mimi.streaming(1):
            for token in model.generate_interleaved(
                **chat,
                max_new_tokens=engine_max_tokens,
                audio_temperature=audio_temperature,
                audio_top_k=audio_top_k,
            ):
                if cancel and cancel.is_set():
                    logger.info("Voice chat interrupted.")
                    yield "status", "Interrupted."
                    return

                if token.numel() == 1:
                    text_token_count += 1
                    piece = processor.text.decode(token)
                    text_parts.append(piece)

                    # When text finishes (<|text_end|>), dynamically compute the exact audio quota needed!
                    if token.item() == 130 or "<|text_end|>" in piece or "<|im_end|>" in piece:
                        text_finished = True
                        # 1 text token ≈ 3.8 to 4.2 audio frames (80ms each) + punctuation/breath margin
                        dynamic_audio_quota = max(40, int(text_token_count * 4.2 + 35))
                        logger.info("Dynamic tokens: %d text tokens -> allocated %d audio frames (~%.1fs speech).",
                                    text_token_count, dynamic_audio_quota, dynamic_audio_quota * 0.08)

                    raw_text = "".join(text_parts)
                    if "<|text_end|>" in raw_text:
                        raw_text = raw_text.split("<|text_end|>")[0]
                    if "<|im_end|>" in raw_text:
                        raw_text = raw_text.split("<|im_end|>")[0]
                    yield "text", raw_text.strip()
                elif not (token == 2048).any():
                    wav_chunk = processor.mimi.decode(token.to(device)[None, :, None])[0]
                    audio_chunk_count += 1
                    yielded_audio = True
                    yield "audio", agc.to_pcm16(wav_chunk)

                    # Dynamic stop when the spoken audio quota corresponding to written text is reached
                    if text_finished and audio_chunk_count >= dynamic_audio_quota:
                        logger.info("Dynamic audio speech quota completed (%d/%d frames).", audio_chunk_count, dynamic_audio_quota)
                        break
                else:
                    logger.info("Audio end token received after %d frames.", audio_chunk_count)
                    break

        if not yielded_audio:
            logger.warning("Voice chat returned text but no playable audio.")
            yield "status", "The model returned text but no playable audio."
        else:
            logger.info("Voice chat done: %d audio chunks (dynamic quota %d), transcript=%r",
                        audio_chunk_count, dynamic_audio_quota, "".join(text_parts).strip())
            yield "status", "Done."


def speak(
    text: str,
    voice: Literal["US male", "US female", "UK male", "UK female"],
    max_tokens: int,
    audio_temperature: float,
    audio_top_k: int,
    output_name: str = "tts.wav",
) -> tuple[str | None, str]:
    text = text.strip()
    if not text:
        return None, "Type something first."

    with GENERATION_LOCK:
        processor, model, device = load_model()
        chat = ChatState(processor)
        chat.new_turn("system")
        chat.add_text(VOICE_PROMPTS[voice])
        chat.end_turn()

        chat.new_turn("user")
        chat.add_text(text)
        chat.end_turn()

        chat.new_turn("assistant")
        audio_out: list[torch.Tensor] = []
        with torch.inference_mode():
            for token in model.generate_sequential(
                **chat,
                max_new_tokens=max_tokens,
                audio_temperature=audio_temperature,
                audio_top_k=audio_top_k,
            ):
                if token.numel() > 1:
                    audio_out.append(token.to(device))

        if len(audio_out) < 2:
            return None, "The model did not return audio tokens. Try a shorter sentence."

        audio_codes = torch.stack(audio_out[:-1], 1).unsqueeze(0)
        waveform = _decode_audio(processor, audio_codes)
        waveform = _AGC().apply(waveform)
        path = _wave_to_output(waveform, output_name)
        return path, f"Generated on {device.type} using {voice}."


def voice_chat(
    audio_path: str | None,
    prompt: str,
    max_tokens: int,
    audio_temperature: float,
    audio_top_k: int,
    output_name: str = "voice_chat.wav",
) -> tuple[str | None, str, str]:
    if not audio_path and not prompt.strip():
        return None, "", "Record audio or type a prompt first."

    with GENERATION_LOCK:
        processor, model, device = load_model()
        chat = ChatState(processor)
        chat.new_turn("system")
        chat.add_text("Respond with interleaved text and audio.")
        chat.end_turn()

        chat.new_turn("user")
        if audio_path:
            wav, sampling_rate = sf.read(audio_path, dtype="float32")
            wav_tensor = torch.from_numpy(wav)
            if wav_tensor.ndim == 1:
                wav_tensor = wav_tensor.unsqueeze(0)
            else:
                wav_tensor = wav_tensor.T
            chat.add_audio(wav_tensor, sampling_rate)
        if prompt.strip():
            chat.add_text(prompt.strip())
        chat.end_turn()

        chat.new_turn("assistant")
        text_out: list[str] = []
        audio_out: list[torch.Tensor] = []
        with torch.inference_mode():
            for token in model.generate_interleaved(
                **chat,
                max_new_tokens=max_tokens,
                audio_temperature=audio_temperature,
                audio_top_k=audio_top_k,
            ):
                if token.numel() == 1:
                    text_out.append(processor.text.decode(token))
                else:
                    audio_out.append(token.to(device))

        transcript = "".join(text_out).strip()
        if len(audio_out) < 2:
            return None, transcript, "The model returned text but no playable audio."

        audio_codes = torch.stack(audio_out[:-1], 1).unsqueeze(0)
        waveform = _decode_audio(processor, audio_codes)
        waveform = _AGC().apply(waveform)
        path = _wave_to_output(waveform, output_name)
        return path, transcript, f"Generated on {device.type}."


def stream_asr_from_wave(
    wave: torch.Tensor,
    sampling_rate: int,
    max_tokens: int = 128,
    cancel: Event | None = None,
) -> Iterator[tuple[str, str]]:
    """Native Liquid AI LFM2.5 ASR (Speech-to-Text) using sequential generation."""
    with GENERATION_LOCK:
        processor, model, device = load_model()
        chat = ChatState(processor)
        chat.new_turn("system")
        chat.add_text("Perform ASR.")
        chat.end_turn()

        chat.new_turn("user")
        peak = float(wave.abs().max())
        if peak > 0:
            gain = min(0.95 / peak, 10.0)
            if gain > 1.0:
                wave = wave * gain
        chat.add_audio(wave, sampling_rate)
        chat.end_turn()

        chat.new_turn("assistant")
        text_parts: list[str] = []
        with torch.inference_mode():
            for token in model.generate_sequential(**chat, max_new_tokens=max_tokens):
                if cancel and cancel.is_set():
                    return
                if token.numel() == 1:
                    piece = processor.text.decode(token)
                    text_parts.append(piece)
                    yield "text", "".join(text_parts).removesuffix("<|im_end|>").removesuffix("<|text_end|>")


def clone_voice(
    reference_audio_path: str,
    text: str,
    max_tokens: int = 256,
    audio_temperature: float = 0.8,
    audio_top_k: int = 4,
    output_name: str = "cloned_voice.wav",
) -> tuple[str | None, str]:
    """Condition Liquid AI LFM on a reference audio sample to speak target text."""
    text = text.strip()
    if not text:
        return None, "Please provide text to speak."

    with GENERATION_LOCK:
        processor, model, device = load_model()

        wav, sampling_rate = sf.read(reference_audio_path, dtype="float32")
        wav_tensor = torch.from_numpy(wav)
        if wav_tensor.ndim == 1:
            wav_tensor = wav_tensor.unsqueeze(0)
        else:
            wav_tensor = wav_tensor.T

        # Keep up to 30 seconds of reference audio for rich acoustic and accent conditioning
        max_samples = int(sampling_rate * 30.0)
        if wav_tensor.shape[1] > max_samples:
            wav_tensor = wav_tensor[:, :max_samples]

        chat = ChatState(processor)
        chat.new_turn("system")
        chat.add_text("Perform TTS. Mimic the voice and acoustic style of the audio sample.")
        chat.end_turn()

        chat.new_turn("user")
        chat.add_audio(wav_tensor, sampling_rate)
        chat.add_text(f"Speak: {text}")
        chat.end_turn()

        chat.new_turn("assistant")
        audio_out: list[torch.Tensor] = []
        with torch.inference_mode():
            for token in model.generate_sequential(
                **chat,
                max_new_tokens=max_tokens,
                audio_temperature=audio_temperature,
                audio_top_k=audio_top_k,
            ):
                if token.numel() > 1 and not (token == 2048).any():
                    audio_out.append(token.to(device))

        if len(audio_out) < 2:
            return None, "The model did not generate audio tokens for the reference voice."

        audio_codes = torch.stack(audio_out, 1).unsqueeze(0)
        waveform = _decode_audio(processor, audio_codes)
        waveform = _AGC().apply(waveform)
        path = _wave_to_output(waveform, output_name)
        return path, f"Generated voice conditioned on {Path(reference_audio_path).name} ({device.type})."
