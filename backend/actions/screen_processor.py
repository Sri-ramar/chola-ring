import io
import json
import os
import sys
import time
import threading
import base64
import cv2
import mss
import mss.tools
from pathlib import Path

try:
    import PIL.Image
    _PIL_OK = True
except ImportError:
    _PIL_OK = False

from backend.live_voice import LiveVoiceSession

import logging

logger = logging.getLogger("sent")

IMG_MAX_W = 640
IMG_MAX_H = 360
JPEG_Q    = 55

SYSTEM_PROMPT = (
    "You are Rhiona, a sharp and efficient AI assistant. "
    "Analyze images with technical precision and intelligence. "
    "Help the user in a way they can understand — don't be overly complex. "
    "Be concise, smart, and helpful. "
    "Respond in maximum 2 short sentences. Speed is priority. "
    "Address the user as 'sir' for a tone of respect. "
    "Ask if the user needs any further help with their problem."
)


def _get_camera_index() -> int:
    config_path = Path(__file__).resolve().parent.parent / "config" / "api_keys.json"
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        if "camera_index" in cfg:
            return int(cfg["camera_index"])
    except Exception:
        pass

    logger.info("[Camera] 🔍 No camera index in config. Auto-detecting...")
    best_index = 0

    for idx in range(6):
        cap = cv2.VideoCapture(idx, cv2.CAP_V4L2)
        if not cap.isOpened():
            cap.release()
            continue
        for _ in range(5):
            cap.read()
        ret, frame = cap.read()
        cap.release()
        if ret and frame is not None and frame.mean() > 5:
            best_index = idx
            logger.info(f"[Camera] ✅ Camera found at index {idx} — saving to config.")
            break
        else:
            logger.info(f"[Camera] ⚠️  Index {idx}: no valid frame.")

    try:
        cfg = {}
        if config_path.exists():
            with open(config_path, "r", encoding="utf-8") as f:
                cfg = json.load(f)
        cfg["camera_index"] = best_index
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=4)
        logger.info(f"[Camera] Camera index {best_index} saved to config.")
    except Exception as e:
        logger.error(f"[Camera] Could not save camera index: {e}")

    return best_index


def _to_jpeg(img_bytes: bytes) -> bytes:
    if not _PIL_OK:
        return img_bytes
    img = PIL.Image.open(io.BytesIO(img_bytes)).convert("RGB")
    img.thumbnail([IMG_MAX_W, IMG_MAX_H], PIL.Image.BILINEAR)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_Q, optimize=False)
    return buf.getvalue()


def _capture_screenshot() -> bytes:
    with mss.mss() as sct:
        shot      = sct.grab(sct.monitors[1])
        png_bytes = mss.tools.to_png(shot.rgb, shot.size)
    return _to_jpeg(png_bytes)


def _capture_camera() -> bytes:
    camera_index = _get_camera_index()
    cap = cv2.VideoCapture(camera_index, cv2.CAP_V4L2)
    if not cap.isOpened():
        raise RuntimeError(f"Camera could not be opened: index {camera_index}")
    for _ in range(10):
        cap.read()
    ret, frame = cap.read()
    cap.release()
    if not ret or frame is None:
        raise RuntimeError("Could not capture camera frame.")
    if _PIL_OK:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = PIL.Image.fromarray(rgb)
        img.thumbnail([IMG_MAX_W, IMG_MAX_H], PIL.Image.BILINEAR)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=JPEG_Q, optimize=False)
        return buf.getvalue()
    _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_Q])
    return buf.tobytes()


_live       = LiveVoiceSession(system_prompt=SYSTEM_PROMPT)
_started    = False
_start_lock = threading.Lock()


def _ensure_started(player=None):
    global _started
    with _start_lock:
        if not _started:
            _live.start()
            _started = True


def screen_process(
    parameters:     dict,
    response:       str | None = None,
    player=None,
    session_memory=None,
) -> bool:
    user_text = (parameters or {}).get("text") or (parameters or {}).get("user_text", "")
    user_text = (user_text or "").strip()
    if not user_text:
        logger.info("[ScreenProcess] ⚠️ No user_text provided.")
        return False

    angle = (parameters or {}).get("angle", "screen").lower().strip()
    logger.info(f"[ScreenProcess] angle={angle!r}  text={user_text!r}")

    _ensure_started(player=player)

    try:
        if angle == "camera":
            image_bytes = _capture_camera()
            mime_type   = "image/jpeg"
            logger.info("[ScreenProcess] 📷 Camera captured")
        else:
            image_bytes = _capture_screenshot()
            mime_type   = "image/jpeg" if _PIL_OK else "image/png"
            logger.info("[ScreenProcess] 🖥️ Screen captured")
    except Exception as e:
        import traceback; traceback.print_exc()
        logger.error(f"[ScreenProcess] ❌ Capture error: {e}")
        return False

    logger.info(f"[ScreenProcess] {len(image_bytes)} bytes → sending")
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")
    _live.send_image(image_b64, mime_type, user_text)
    return True  # Response is spoken directly via Live Voice audio


def warmup_session(player=None):
    try:
        _ensure_started(player=player)
    except Exception as e:
        logger.error(f"[ScreenProcess] ⚠️ Warmup error: {e}")


if __name__ == "__main__":
    logger.info("[TEST] screen_processor.py v8 — image-only session")
    print("=" * 50)
    mode    = input("screen / camera (default: screen): ").strip().lower() or "screen"
    request = input("Question (Enter for default): ").strip() or "What do you see? Be brief."

    t0 = time.perf_counter()
    warmup_session()
    logger.info(f"Session ready — {time.perf_counter()-t0:.2f}s\n")

    t1     = time.perf_counter()
    result = screen_process({"angle": mode, "text": request}, player=None)
    logger.info(f"Sent — {time.perf_counter()-t1:.3f}s | audio incoming...")
    time.sleep(8)
    print(f"\n{'✅' if result else '❌'}")
