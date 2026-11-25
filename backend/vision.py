import io
import os
import json
import base64
import requests

import logging

logger = logging.getLogger("vision")


def _get_api_key() -> str:
    # Resolved lazily per call so a missing key never breaks module import.
    try:
        from backend.memory.config_manager import load_api_keys
        key = load_api_keys().get("nvidia_api_key", "")
        if key:
            return key
    except Exception:
        pass
    return os.environ.get("NVIDIA_API_KEY", "")


VISION_MODEL = os.environ.get("NVIDIA_VISION_MODEL", "meta/llama-3.2-11b-vision-instruct")
NVIDIA_BASE = "https://integrate.api.nvidia.com/v1"


def _nvidia_vision(prompt: str, image_bytes: bytes) -> str:
    api_key = _get_api_key()
    if not api_key:
        raise RuntimeError(
            "NVIDIA_API_KEY is not set. "
            "Set it as an environment variable or in backend/config/api_keys.json."
        )
    b64 = base64.b64encode(image_bytes).decode()

    payload = {
        "model": VISION_MODEL,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}}
            ]
        }],
        "temperature": 0.1,
        "max_tokens": 4096,
    }

    try:
        resp = requests.post(
            f"{NVIDIA_BASE}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=60,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"NVIDIA Vision error {resp.status_code}: {resp.text[:500]}")
        result = resp.json()
        return result["choices"][0]["message"]["content"].strip()
    except requests.exceptions.Timeout:
        raise RuntimeError("NVIDIA Vision request timed out")
    except requests.exceptions.ConnectionError as e:
        raise RuntimeError(f"NVIDIA Vision unavailable: {e}")


def detect_objects(image_bytes: bytes = None, image_path: str = None) -> list[dict]:
    if image_bytes is None and image_path:
        from pathlib import Path
        image_bytes = Path(image_path).read_bytes()
    elif image_bytes is None:
        raise ValueError("Provide image_bytes or image_path")

    prompt = (
        "List all visible objects in this image. Return ONLY valid JSON as an array of objects, "
        "each with 'label' (object name) and 'confidence' (always 1.0). "
        "Example: [{\"label\": \"person\", \"confidence\": 1.0}, {\"label\": \"laptop\", \"confidence\": 1.0}]"
    )
    raw = _nvidia_vision(prompt, image_bytes)
    clean = raw.strip()
    if clean.startswith("```"):
        clean = clean.split("\n", 1)[-1]
        clean = clean.rsplit("```", 1)[0].strip()
    try:
        detections = json.loads(clean)
        if not isinstance(detections, list):
            detections = [detections]
        for d in detections:
            d.setdefault("confidence", 1.0)
        return detections
    except json.JSONDecodeError:
        return [{"label": raw[:50], "confidence": 1.0}]


def describe_screenshot(detections: list[dict]) -> str:
    if not detections:
        return "No objects detected in the image."
    labels = [d["label"] for d in detections if d.get("label")]
    if not labels:
        return "No objects detected in the image."
    from collections import Counter
    counts = Counter(labels)
    parts = [f"{count} {label}{'s' if count > 1 else ''}" for label, count in counts.most_common()]
    return f"Detected: {', '.join(parts)}."


def screen_find(description: str) -> tuple[int, int] | None:
    import pyautogui
    img = pyautogui.screenshot()
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    img_bytes = buf.getvalue()

    prompt = (
        f"Find the '{description}' element on this screenshot. "
        "Return ONLY valid JSON with the center coordinates (x, y) of the element, like: "
        '{"x": 123, "y": 456}. '
        'If the element is not visible, return {"x": null, "y": null}.'
    )
    try:
        raw = _nvidia_vision(prompt, img_bytes)
        clean = raw.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[-1]
            clean = clean.rsplit("```", 1)[0].strip()
        coords = json.loads(clean)
        x, y = coords.get("x"), coords.get("y")
        if x is not None and y is not None:
            logger.info(f"[Vision] Found '{description}' at ({x}, {y})")
            return (int(x), int(y))
    except Exception as e:
        logger.error(f"[Vision] screen_find failed for '{description}': {e}")
    return None
