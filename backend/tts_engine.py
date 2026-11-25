import os
import tempfile
import subprocess
import json
import logging
import shutil

logger = logging.getLogger("tts")

VOICE_MAP = {
    "Michelle": "en-US-MichelleNeural",
    "Ava": "en-US-AvaNeural",
    "Emma": "en-US-EmmaNeural",
    "Jenny": "en-US-JennyNeural",
    "Sonia": "en-GB-SoniaNeural",
    "Maisie": "en-GB-MaisieNeural",
    "Pallavi": "ta-IN-PallaviNeural",
    "Kani": "ta-IN-KaniNeural",
    "Aoede": "en-US-MichelleNeural",
    "Kore": "en-US-AvaNeural",
    "Leda": "en-US-EmmaNeural",
    "Calliope": "en-US-JennyNeural",
    "Clio": "en-US-MichelleNeural",
    "Thalia": "en-US-AvaNeural",
    "Puck": "en-US-ChristopherNeural",
    "Charon": "en-US-GuyNeural",
    "Fenrir": "en-US-EricNeural",
}

class TTSEngine:
    def __init__(self, voice: str = None):
        self.default_voice = voice or "en-US-MichelleNeural"

    def _get_voice(self) -> str:
        cfg_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config.json")
        if os.path.exists(cfg_path):
            try:
                with open(cfg_path, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    v_name = cfg.get("voice", "")
                    lang = cfg.get("language", "")
                    if "tamil" in lang.lower():
                        return "ta-IN-PallaviNeural"
                    if v_name in VOICE_MAP:
                        return VOICE_MAP[v_name]
                    if v_name and "-" in v_name:
                        return v_name
            except Exception:
                pass
        return os.environ.get("RHIONA_TTS_VOICE", self.default_voice)

    def speak(self, text: str, voice: str = None) -> None:
        if not text or not text.strip():
            return
        logger.info(f"[TTS] Speak requested: {text[:60]}")
        target_voice = voice or self._get_voice()

        edge_cli = shutil.which("edge-tts") or os.path.expanduser("~/.local/bin/edge-tts")
        if os.path.exists(edge_cli):
            try:
                with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
                    tmp_path = f.name
                
                cmd = [edge_cli, "--voice", target_voice, "--text", text, "--write-media", tmp_path]
                res = subprocess.run(cmd, capture_output=True, timeout=10)
                if res.returncode == 0 and os.path.getsize(tmp_path) > 0:
                    mpv_cli = shutil.which("mpv")
                    if mpv_cli:
                        subprocess.run([mpv_cli, "--no-video", "--no-terminal", tmp_path], capture_output=True, timeout=15)
                    else:
                        subprocess.run(["aplay", tmp_path], capture_output=True, timeout=15)
                    try:
                        os.remove(tmp_path)
                    except Exception:
                        pass
                    return
            except Exception as e:
                logger.warning(f"[TTS] edge-tts error: {e}, falling back to spd-say")

        # Fallback to spd-say
        try:
            subprocess.run(['spd-say', text[:100]], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
        except Exception:
            pass

tts = TTSEngine()

