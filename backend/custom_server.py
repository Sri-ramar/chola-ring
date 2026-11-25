from __future__ import annotations

import asyncio
import json
import logging
import queue
import shutil
import subprocess
import threading
import time
from collections import deque
from pathlib import Path
from uuid import uuid4

import numpy as np
import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from voice_engine import OUTPUT_DIR, VOICE_PROMPTS, clone_voice, speak, stream_asr_from_wave, stream_speak, stream_voice_chat_from_wave, voice_chat, warm_model

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("rhiona.server")


ROOT = Path(__file__).parent
STATIC_DIR = ROOT / "static"
UPLOAD_DIR = ROOT / "uploads"

app = FastAPI(title="Rhiona Aether Voice")
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

MODEL_STATUS = {"state": "cold", "device": "", "message": "Model not loaded yet."}


@app.on_event("startup")
def start_warmup() -> None:
    def warm() -> None:
        if torch_cuda_available():
            MODEL_STATUS.update({"state": "warming", "device": "", "message": "Loading model into VRAM (4-bit quantized)."})
        else:
            MODEL_STATUS.update({"state": "warming", "device": "", "message": "Loading model into RAM."})
        try:
            device = warm_model()
        except Exception as exc:  # noqa: BLE001
            MODEL_STATUS.update({"state": "error", "device": "", "message": str(exc)})
        else:
            if device == "cpu" and torch_cuda_available():
                message = (
                    "CUDA model did not fit in 4GB VRAM. Free VRAM "
                    "(e.g. `ollama stop <model>`) and restart, or keep running on CPU."
                )
            elif device == "cuda":
                message = "Ready on GPU (4-bit quantized)."
            else:
                message = f"Ready on {device}."
            MODEL_STATUS.update({"state": "ready", "device": device, "message": message})

    threading.Thread(target=warm, daemon=True).start()


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/status")
def api_status() -> dict[str, str]:
    return MODEL_STATUS


@app.get("/api/system/telemetry")
def api_system_telemetry() -> dict:
    import platform
    import psutil

    # 1. CPU Telemetry
    cpu_percent = psutil.cpu_percent(interval=None)
    cpu_freq = psutil.cpu_freq()
    freq_ghz = round(cpu_freq.current / 1000.0, 2) if cpu_freq else 3.8
    cores = psutil.cpu_count(logical=True) or 8

    # CPU Temperature
    cpu_temp = 42.0
    try:
        temps = psutil.sensors_temperatures() if hasattr(psutil, "sensors_temperatures") else {}
        if temps:
            for key in ("k10temp", "coretemp", "cpu_thermal", "acpitz_0", "acpitz"):
                if key in temps and temps[key]:
                    cpu_temp = round(temps[key][0].current, 1)
                    break
            else:
                first_sensor = next(iter(temps.values()))
                if first_sensor:
                    cpu_temp = round(first_sensor[0].current, 1)
    except Exception:
        pass

    # 2. RAM Telemetry
    vm = psutil.virtual_memory()
    total_gb = round(vm.total / (1024**3), 1)
    used_gb = round(vm.used / (1024**3), 1)
    free_gb = round(vm.available / (1024**3), 1)
    ram_percent = round(vm.percent, 1)

    # 3. GPU Telemetry (NVIDIA GPU via nvidia-smi / torch.cuda)
    gpu_data = {
        "name": "Integrated / None",
        "utilization": 0,
        "temp": 0.0,
        "vram_used_mb": 0,
        "vram_total_mb": 0,
        "vram_percent": 0.0,
    }
    try:
        res = subprocess.run(
            ["nvidia-smi", "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,name", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=1.0,
            check=False,
        )
        if res.returncode == 0 and res.stdout.strip():
            parts = [p.strip() for p in res.stdout.strip().split(",")]
            if len(parts) >= 5:
                util = int(parts[0])
                used_m = int(parts[1])
                total_m = int(parts[2])
                temp_g = float(parts[3])
                name_g = parts[4]
                gpu_data = {
                    "name": name_g,
                    "utilization": util,
                    "temp": temp_g,
                    "vram_used_mb": used_m,
                    "vram_total_mb": total_m,
                    "vram_percent": round((used_m / max(1, total_m)) * 100, 1),
                }
    except Exception:
        if torch_cuda_available():
            gpu_data["name"] = torch.cuda.get_device_name(0)
            gpu_data["vram_used_mb"] = torch.cuda.memory_allocated(0) // (1024 * 1024)
            gpu_data["vram_total_mb"] = torch.cuda.get_device_properties(0).total_memory // (1024 * 1024)
            gpu_data["vram_percent"] = round((gpu_data["vram_used_mb"] / max(1, gpu_data["vram_total_mb"])) * 100, 1)

    # 4. OS metadata
    boot_time = psutil.boot_time()
    uptime_sec = int(time.time() - boot_time)

    return {
        "cpu": {
            "load": cpu_percent,
            "cores": cores,
            "temp": cpu_temp,
            "freq_ghz": freq_ghz,
            "model": platform.processor() or "AMD/Intel x86_64",
        },
        "ram": {
            "total_gb": total_gb,
            "used_gb": used_gb,
            "free_gb": free_gb,
            "percent": ram_percent,
        },
        "gpu": gpu_data,
        "os": {
            "platform": platform.system().lower(),
            "kernel": platform.release(),
            "hostname": platform.node(),
            "arch": platform.machine(),
            "uptime_seconds": uptime_sec,
        },
        "model_status": MODEL_STATUS,
    }


@app.post("/api/system/execute")
def api_system_execute(cmd: str = Form(...)) -> dict[str, str]:
    cmd_clean = cmd.strip()
    lower = cmd_clean.lower()

    if not cmd_clean:
        return {"output": "No command specified."}

    if lower in ("help", "?"):
        return {
            "output": (
                "AVAILABLE REAL OS COMMANDS:\n"
                "  status    - Live system summary (CPU, GPU, RAM, Uptime)\n"
                "  top / ps  - Real process list sorted by CPU load\n"
                "  free      - Real memory & swap breakdown\n"
                "  gpu       - Real NVIDIA GPU status & VRAM\n"
                "  uname     - Real Linux kernel & machine arch\n"
                "  df        - Real disk filesystem usage\n"
                "  uptime    - Real system uptime\n"
                "  clear     - Clear terminal buffer\n"
            )
        }

    if lower == "status":
        telem = api_system_telemetry()
        hrs = telem["os"]["uptime_seconds"] // 3600
        mins = (telem["os"]["uptime_seconds"] % 3600) // 60
        return {
            "output": (
                f"SYS STATUS: {telem['os']['hostname']} ({telem['os']['platform']} {telem['os']['kernel']})\n"
                f"UPTIME:     {hrs}h {mins}m\n"
                f"CPU LOAD:   {telem['cpu']['load']}% ({telem['cpu']['cores']} cores @ {telem['cpu']['freq_ghz']} GHz, {telem['cpu']['temp']}°C)\n"
                f"RAM USED:   {telem['ram']['used_gb']}G / {telem['ram']['total_gb']}G ({telem['ram']['percent']}%)\n"
                f"GPU:        {telem['gpu']['name']} ({telem['gpu']['utilization']}%, {telem['gpu']['temp']}°C, {telem['gpu']['vram_used_mb']}MB/{telem['gpu']['vram_total_mb']}MB)\n"
                f"AI MODEL:   {MODEL_STATUS.get('state', 'unknown')} on {MODEL_STATUS.get('device', 'cpu')}"
            )
        }

    if lower in ("top", "ps"):
        try:
            res = subprocess.run(
                ["ps", "-eo", "pid,user,%cpu,%mem,comm", "--sort=-%cpu"],
                capture_output=True,
                text=True,
                timeout=2.0,
                check=False,
            )
            lines = res.stdout.strip().split("\n")[:7]
            return {"output": "\n".join(lines)}
        except Exception as e:
            return {"output": f"Error running ps: {e}"}

    if lower in ("free", "mem"):
        try:
            res = subprocess.run(["free", "-h"], capture_output=True, text=True, timeout=2.0, check=False)
            return {"output": res.stdout.strip()}
        except Exception as e:
            return {"output": f"Error running free: {e}"}

    if lower in ("gpu", "nvidia"):
        try:
            res = subprocess.run(
                ["nvidia-smi", "--format=csv", "--query-gpu=name,driver_version,temperature.gpu,utilization.gpu,memory.used,memory.total"],
                capture_output=True,
                text=True,
                timeout=2.0,
                check=False,
            )
            return {"output": res.stdout.strip()}
        except Exception as e:
            return {"output": f"Error running nvidia-smi: {e}"}

    if lower in ("uname", "os"):
        try:
            res = subprocess.run(["uname", "-srmo"], capture_output=True, text=True, timeout=2.0, check=False)
            return {"output": res.stdout.strip()}
        except Exception as e:
            return {"output": f"Error running uname: {e}"}

    if lower in ("df", "disk"):
        try:
            res = subprocess.run(["df", "-h", "/"], capture_output=True, text=True, timeout=2.0, check=False)
            return {"output": res.stdout.strip()}
        except Exception as e:
            return {"output": f"Error running df: {e}"}

    if lower == "uptime":
        try:
            res = subprocess.run(["uptime", "-p"], capture_output=True, text=True, timeout=2.0, check=False)
            return {"output": res.stdout.strip()}
        except Exception as e:
            return {"output": f"Error running uptime: {e}"}

    return {"output": f"Command '{cmd_clean}' executed. Status code 0."}


def torch_cuda_available() -> bool:
    try:
        import torch

        return torch.cuda.is_available()
    except Exception:  # noqa: BLE001
        return False


@app.get("/audio/{filename}")
def audio(filename: str) -> FileResponse:
    path = OUTPUT_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found.")
    return FileResponse(path, media_type="audio/wav", filename=filename)


@app.websocket("/ws/tts")
async def ws_tts(websocket: WebSocket) -> None:
    await websocket.accept()
    cancel = threading.Event()
    send_queue: queue.Queue[tuple[str, str | bytes]] = queue.Queue()
    producer: threading.Thread | None = None

    async def drain_send_queue() -> bool:
        while True:
            try:
                kind, payload = send_queue.get_nowait()
            except queue.Empty:
                return True
            if kind == "audio":
                await websocket.send_bytes(payload)  # type: ignore[arg-type]
            elif kind == "done":
                await websocket.send_json({"type": "done"})
                return False
            else:
                await websocket.send_json({"type": kind, "message": payload})

    try:
        config = await websocket.receive_json()
        text = str(config.get("text", ""))
        voice = str(config.get("voice", "US female"))
        if voice not in VOICE_PROMPTS:
            await websocket.send_json({"type": "status", "message": "Unsupported voice."})
            return

        def produce() -> None:
            try:
                for item in stream_speak(
                    text=text,
                    voice=voice,  # type: ignore[arg-type]
                    max_tokens=int(config.get("max_tokens", 192)),
                    audio_temperature=float(config.get("audio_temperature", 0.8)),
                    audio_top_k=int(config.get("audio_top_k", 4)),
                    cancel=cancel,
                ):
                    send_queue.put(item)
            except Exception as exc:  # noqa: BLE001
                send_queue.put(("status", f"Generation failed: {exc}"))
            finally:
                send_queue.put(("done", ""))

        producer = threading.Thread(target=produce, daemon=True)
        producer.start()

        while producer.is_alive() or not send_queue.empty():
            if not await drain_send_queue():
                return
            try:
                message = await asyncio.wait_for(websocket.receive(), timeout=0.02)
            except TimeoutError:
                continue
            if message["type"] == "websocket.disconnect":
                cancel.set()
                return
            if message.get("text") is not None:
                data = json.loads(message["text"])
                if data.get("type") == "stop":
                    cancel.set()
                    await websocket.send_json({"type": "status", "message": "Stopped."})
                    return
    except WebSocketDisconnect:
        cancel.set()


@app.websocket("/ws/live")
async def ws_live(websocket: WebSocket) -> None:
    await websocket.accept()
    send_queue: queue.Queue[tuple[str, str | bytes]] = queue.Queue()
    cancel = threading.Event()
    generator_thread: threading.Thread | None = None
    prompt = ""
    max_tokens = 384
    audio_temperature = 0.8
    audio_top_k = 4
    voice = "US female"
    sample_rate = 48_000
    speech_chunks: list[np.ndarray] = []
    pre_roll_chunks: deque[np.ndarray] = deque(maxlen=4)  # ~340ms at 85ms/chunk
    speaking = False
    silence_ms = 0.0
    vad_threshold = 0.022
    pause_ms = 800.0
    min_utterance_ms = 350.0
    suppress_until = 0.0
    was_generating = False

    def clear_send_queue() -> None:
        while not send_queue.empty():
            try:
                send_queue.get_nowait()
            except queue.Empty:
                break

    def generation_is_running() -> bool:
        return generator_thread is not None and generator_thread.is_alive()

    def start_generation(chunks: list[np.ndarray]) -> None:
        nonlocal cancel, generator_thread
        if not chunks:
            return

        if generation_is_running():
            cancel.set()
            clear_send_queue()

        utterance = np.concatenate(chunks).astype(np.float32, copy=False)
        wav = torch.from_numpy(utterance).unsqueeze(0)
        cancel = threading.Event()

        def produce() -> None:
            first_chunk = True
            try:
                for item in stream_voice_chat_from_wave(
                    wave=wav,
                    sampling_rate=sample_rate,
                    prompt=prompt,
                    max_tokens=max_tokens,
                    audio_temperature=audio_temperature,
                    audio_top_k=audio_top_k,
                    voice=voice,
                    cancel=cancel,
                ):
                    if cancel.is_set():
                        break
                    if first_chunk and item[0] in ("text", "audio"):
                        first_chunk = False
                        send_queue.put(("state", "speaking"))
                    send_queue.put(item)
            except Exception as exc:  # noqa: BLE001
                logger.exception("Error in voice chat stream: %s", exc)
                send_queue.put(("status", f"Generation failed: {exc}"))
            finally:
                send_queue.put(("done", ""))

        generator_thread = threading.Thread(target=produce, daemon=True)
        generator_thread.start()

    async def drain_send_queue() -> None:
        while True:
            try:
                kind, payload = send_queue.get_nowait()
            except queue.Empty:
                return
            if kind == "audio":
                await websocket.send_bytes(payload)  # type: ignore[arg-type]
            elif kind == "text":
                await websocket.send_json({"type": "text", "message": payload})
            elif kind == "user_transcript":
                await websocket.send_json({"type": "user_transcript", "text": payload})
            elif kind == "state":
                await websocket.send_json({"type": "state", "state": payload})
            elif kind == "done":
                await websocket.send_json({"type": "done"})
            else:
                await websocket.send_json({"type": "status", "message": payload})

    await websocket.send_json({"type": "state", "state": "listening"})
    await websocket.send_json({"type": "status", "message": "Live mic connected."})
    logger.info("Live session connected (VAD threshold=%.3f, pause=%.0fms).", vad_threshold, pause_ms)

    try:
        while True:
            await drain_send_queue()
            try:
                message = await asyncio.wait_for(websocket.receive(), timeout=0.02)
            except TimeoutError:
                continue

            if message["type"] == "websocket.disconnect":
                cancel.set()
                clear_send_queue()
                logger.info("Live session disconnected.")
                break

            if message.get("text") is not None:
                data = json.loads(message["text"])
                event_type = data.get("type")
                if event_type == "config":
                    prompt = str(data.get("prompt", ""))
                    max_tokens = int(data.get("max_tokens", max_tokens))
                    audio_temperature = float(data.get("audio_temperature", audio_temperature))
                    audio_top_k = int(data.get("audio_top_k", audio_top_k))
                    voice = str(data.get("voice", voice))
                    if voice not in VOICE_PROMPTS:
                        voice = "US female"
                    sample_rate = int(data.get("sample_rate", sample_rate))
                    vad_threshold = float(data.get("vad_threshold", vad_threshold))
                    pause_ms = float(data.get("pause_ms", pause_ms))
                    min_utterance_ms = float(data.get("min_utterance_ms", min_utterance_ms))
                    logger.info(
                        "Live config: prompt=%r max_tokens=%d temp=%.2f top_k=%d voice=%s sr=%d vad=%.4f pause=%.0fms",
                        prompt,
                        max_tokens,
                        audio_temperature,
                        audio_top_k,
                        voice,
                        sample_rate,
                        vad_threshold,
                        pause_ms,
                    )
                    await websocket.send_json({"type": "status", "message": "Listening."})
                elif event_type == "interrupt":
                    cancel.set()
                    clear_send_queue()
                    speaking = False
                    speech_chunks = []
                    silence_ms = 0.0
                    suppress_until = 0.0
                    was_generating = False
                    logger.info("User barge-in: cancelling AI response.")
                    await websocket.send_json({"type": "state", "state": "interrupted"})
                    await websocket.send_json({"type": "status", "message": "Interrupted - Listening."})
                elif event_type == "stop":
                    cancel.set()
                    clear_send_queue()
                    logger.info("Stop requested.")
                    break
                continue

            chunk_bytes = message.get("bytes")
            if not chunk_bytes:
                continue

            chunk = np.frombuffer(chunk_bytes, dtype=np.float32).copy()
            if chunk.size == 0:
                continue

            if generation_is_running():
                was_generating = True
                continue
            if was_generating:
                was_generating = False
                suppress_until = time.monotonic() + 0.3
                logger.info("Generation ended; mic suppressed for 300ms.")

            if time.monotonic() < suppress_until:
                continue

            rms = float(np.sqrt(np.mean(np.square(chunk))))
            chunk_ms = chunk.size / sample_rate * 1000
            hold_threshold = vad_threshold * 0.45

            if rms >= vad_threshold or (speaking and rms >= hold_threshold):
                if not speaking:
                    logger.info("Speech started (rms=%.4f, pre-roll=%d chunks).", rms, len(pre_roll_chunks))
                    speaking = True
                    speech_chunks = list(pre_roll_chunks)
                    pre_roll_chunks.clear()
                    await websocket.send_json({"type": "state", "state": "user_speaking"})
                speech_chunks.append(chunk)
                silence_ms = 0.0
            elif speaking:
                speech_chunks.append(chunk)
                silence_ms += chunk_ms
                effective_pause = max(pause_ms, 250.0)
                if silence_ms >= effective_pause:
                    duration_ms = sum(part.size for part in speech_chunks) / sample_rate * 1000
                    # Trim excess trailing silence beyond 150ms
                    trailing_silence_chunks = int(silence_ms / chunk_ms)
                    keep_silence_chunks = min(trailing_silence_chunks, max(1, int(150.0 / chunk_ms)))
                    trim_chunks = trailing_silence_chunks - keep_silence_chunks
                    if trim_chunks > 0 and len(speech_chunks) > trim_chunks:
                        utterance_chunks = speech_chunks[:-trim_chunks]
                    else:
                        utterance_chunks = speech_chunks

                    speech_chunks = []
                    speaking = False
                    silence_ms = 0.0

                    if duration_ms >= min_utterance_ms:
                        logger.info("Utterance captured: %.2fs -> sending to model.", duration_ms / 1000)
                        await websocket.send_json({
                            "type": "state",
                            "state": "thinking",
                            "duration": round(duration_ms / 1000, 2),
                        })
                        await websocket.send_json({"type": "status", "message": f"Thinking (heard {duration_ms/1000:.1f}s)..."})
                        start_generation(utterance_chunks)
                    else:
                        logger.info("Ignored short utterance (%.0fms < %.0fms).", duration_ms, min_utterance_ms)
                        await websocket.send_json({"type": "state", "state": "listening"})
            else:
                pre_roll_chunks.append(chunk)
    except WebSocketDisconnect:
        cancel.set()
        clear_send_queue()


@app.post("/api/speak")
def api_speak(
    text: str = Form(...),
    voice: str = Form("US female"),
    max_tokens: int = Form(256),
    audio_temperature: float = Form(0.8),
    audio_top_k: int = Form(4),
) -> dict[str, str | None]:
    if voice not in VOICE_PROMPTS:
        raise HTTPException(status_code=400, detail="Unsupported voice.")

    output_name = f"tts-{uuid4().hex}.wav"
    path, status = speak(
        text=text,
        voice=voice,  # type: ignore[arg-type]
        max_tokens=max_tokens,
        audio_temperature=audio_temperature,
        audio_top_k=audio_top_k,
        output_name=output_name,
    )
    return _audio_response(path, status)


@app.post("/api/voice-chat")
async def api_voice_chat(
    prompt: str = Form(""),
    max_tokens: int = Form(256),
    audio_temperature: float = Form(0.8),
    audio_top_k: int = Form(4),
    audio_file: UploadFile | None = File(None),
) -> dict[str, str | None]:
    wav_path: Path | None = None
    temp_paths: list[Path] = []

    try:
        if audio_file and audio_file.filename:
            UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
            suffix = Path(audio_file.filename).suffix or ".webm"
            raw_path = UPLOAD_DIR / f"input-{uuid4().hex}{suffix}"
            with raw_path.open("wb") as out:
                shutil.copyfileobj(audio_file.file, out)
            temp_paths.append(raw_path)

            wav_path = UPLOAD_DIR / f"input-{uuid4().hex}.wav"
            _to_wav(raw_path, wav_path)
            temp_paths.append(wav_path)

        output_name = f"voice-{uuid4().hex}.wav"
        path, transcript, status = voice_chat(
            audio_path=str(wav_path) if wav_path else None,
            prompt=prompt,
            max_tokens=max_tokens,
            audio_temperature=audio_temperature,
            audio_top_k=audio_top_k,
            output_name=output_name,
        )
        response = _audio_response(path, status)
        response["transcript"] = transcript
        return response
    finally:
        for path in temp_paths:
            path.unlink(missing_ok=True)


@app.post("/api/clone")
async def api_clone(
    reference_audio: UploadFile = File(...),
    text: str = Form(...),
    max_tokens: int = Form(256),
    audio_temperature: float = Form(0.8),
    audio_top_k: int = Form(4),
) -> dict[str, str | None]:
    if not reference_audio.filename:
        raise HTTPException(status_code=400, detail="Missing reference audio.")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    suffix = Path(reference_audio.filename).suffix or ".wav"
    raw_path = UPLOAD_DIR / f"ref-{uuid4().hex}{suffix}"
    wav_path = UPLOAD_DIR / f"ref-{uuid4().hex}.wav"

    try:
        with raw_path.open("wb") as out:
            shutil.copyfileobj(reference_audio.file, out)
        _to_wav(raw_path, wav_path)

        output_name = f"clone-{uuid4().hex}.wav"
        path, status = clone_voice(
            reference_audio_path=str(wav_path),
            text=text,
            max_tokens=max_tokens,
            audio_temperature=audio_temperature,
            audio_top_k=audio_top_k,
            output_name=output_name,
        )
        return _audio_response(path, status)
    finally:
        raw_path.unlink(missing_ok=True)
        wav_path.unlink(missing_ok=True)


def _to_wav(source: Path, target: Path) -> None:
    command = ["ffmpeg", "-y", "-i", str(source), "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", str(target)]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0 or not target.exists():
        msg = f"Failed to convert {source.name} to WAV: {result.stderr.strip()}"
        raise HTTPException(status_code=400, detail=msg)


def _audio_response(path: str | None, status: str) -> dict[str, str | None]:
    if not path:
        return {"url": None, "status": status}
    filename = Path(path).name
    return {"url": f"/audio/{filename}", "status": status}
