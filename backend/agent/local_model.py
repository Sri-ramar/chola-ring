import os
import sys
import json
import requests
try:
    from dotenv import load_dotenv
    # Load env files
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env.local"))
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"))
except ImportError:
    pass

def _get_gemini_key() -> str:
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY", "")
    if key:
        return key
    try:
        from backend.memory.config_manager import load_api_keys
        cfg = load_api_keys()
        return cfg.get("gemini_api_key", "")
    except Exception:
        return ""

def _get_nvidia_key() -> str:
    try:
        from backend.memory.config_manager import load_api_keys
        cfg = load_api_keys()
        key = cfg.get("nvidia_api_key", "")
        if key:
            return key
    except Exception:
        pass
    return os.environ.get("NVIDIA_API_KEY", "")

NVIDIA_MODEL = os.environ.get("NVIDIA_MODEL", "meta/llama-3.2-11b-vision-instruct")
NVIDIA_BASE = "https://integrate.api.nvidia.com/v1"
GEMINI_MODEL = os.environ.get("RHIONA_PLANNER_MODEL", "gemini-3.1-flash-lite")

def get_active_model() -> str:
    if _get_gemini_key():
        return GEMINI_MODEL
    return NVIDIA_MODEL

def is_offline() -> bool:
    return not (_get_gemini_key() or _get_nvidia_key())

def get_llama_instance():
    key = _get_gemini_key() or _get_nvidia_key()
    return {"model": get_active_model(), "api_key": key[:8] + "..." if key else "None"}

def wake_model() -> bool:
    return bool(_get_gemini_key() or _get_nvidia_key())

def unload_model() -> bool:
    return True

def generate_local(prompt: str, system_instruction: str = "", response_format: str = None) -> str:
    gemini_key = _get_gemini_key()
    if gemini_key:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={gemini_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.2 if response_format == "json" else 0.7,
            }
        }
        if system_instruction:
            payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}
        if response_format == "json":
            payload["generationConfig"]["responseMimeType"] = "application/json"

        try:
            resp = requests.post(url, json=payload, timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                candidates = data.get("candidates", [])
                if candidates and "content" in candidates[0]:
                    parts = candidates[0]["content"].get("parts", [])
                    if parts and "text" in parts[0]:
                        return parts[0]["text"].strip()
            # If rate-limited or failed, fallback to NVIDIA or alternate model
        except Exception:
            pass

    nvidia_key = _get_nvidia_key()
    if nvidia_key:
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": NVIDIA_MODEL,
            "messages": messages,
            "temperature": 0.2 if response_format == "json" else 0.7,
            "max_tokens": 4096 if response_format == "json" else 2048,
        }
        if response_format == "json":
            payload["response_format"] = {"type": "json_object"}

        try:
            resp = requests.post(
                f"{NVIDIA_BASE}/chat/completions",
                headers={
                    "Authorization": f"Bearer {nvidia_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=60,
            )
            if resp.status_code == 200:
                result = resp.json()
                return result["choices"][0]["message"]["content"].strip()
        except Exception as e:
            raise RuntimeError(f"NVIDIA API request failed: {e}")

    if not gemini_key and not nvidia_key:
        raise RuntimeError(
            "No LLM API key set. Add gemini_api_key to backend/config/api_keys.json "
            "(or set GEMINI_API_KEY in the environment)."
        )
    raise RuntimeError("LLM request failed to generate response.")
