"""
Gemini Live API voice session.

Owns the microphone EXCLUSIVELY while active.
Call run() from a background thread — it blocks until the session ends.
The caller must ensure the mic is free before calling run().
"""

import asyncio
import json
import base64
import os
import subprocess
import webbrowser
import re
import logging
import urllib.parse
import threading
import numpy as np
import pyaudio

logger = logging.getLogger("gemini_live")

_AUDIO_LOCK = threading.Lock()
_global_main_window = None

def set_main_window_ref(win):
    global _global_main_window
    _global_main_window = win

# ── Gemini Live API constants ──────────────────────────────────────────────────
GEMINI_MODEL = "models/gemini-3.1-flash-live-preview"
WS_URI_TEMPLATE = (
    "wss://generativelanguage.googleapis.com/ws/"
    "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
    "?key={api_key}"
)

INPUT_RATE  = 16000   # Gemini expects 16 kHz PCM input
OUTPUT_RATE = 24000   # Gemini sends  24 kHz PCM output
CHUNK       = 1024    # frames per read/write
PA_FORMAT   = pyaudio.paInt16

# ── Desktop-action tool declarations sent to Gemini ───────────────────────────
FUNCTION_DECLARATIONS = [
    {
        "name": "open_website",
        "description": (
            "Open a website in the browser. Use for YouTube, Google, GitHub, Gmail, "
            "Reddit, Spotify, Discord, Netflix, ChatGPT, WhatsApp, Amazon, Twitter/X, "
            "Instagram, Google Maps, or any URL the user mentions."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "site": {
                    "type": "string",
                    "description": (
                        "Site name keyword: youtube, google, github, gmail, reddit, "
                        "spotify, discord, netflix, chatgpt, whatsapp, amazon, twitter, "
                        "instagram, maps — or a full URL."
                    ),
                },
                "query": {
                    "type": "string",
                    "description": "Optional search query to run within the site.",
                },
            },
            "required": ["site"],
        },
    },
    {
        "name": "play_music",
        "description": (
            "Play a song, artist, or playlist via mpv + YouTube. "
            "Use when the user says 'play [song]', 'put on [music]', etc."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Song name, artist, or search query.",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "stop_music",
        "description": "Stop or pause the currently playing music.",
    },
    {
        "name": "control_volume",
        "description": (
            "Adjust system audio volume. Use when user says louder, quieter, "
            "volume up/down, mute, set volume to X."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["up", "down", "mute", "unmute", "set"],
                    "description": "Volume action.",
                },
                "level": {
                    "type": "integer",
                    "description": "Target level 0-100 (only for 'set').",
                },
            },
            "required": ["action"],
        },
    },
    {
        "name": "system_action",
        "description": "Perform a system-level action: shutdown, restart, lock screen, screenshot.",
        "parameters": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["shutdown", "restart", "lock", "screenshot"],
                    "description": "Action to perform.",
                },
            },
            "required": ["action"],
        },
    },
    {
        "name": "send_message",
        "description": (
            "Send a message or text to a person/contact via WhatsApp, Telegram, "
            "Instagram, or generic messaging app. Use when the user asks to send a "
            "message, text someone, or WhatsApp someone (e.g. 'send message to Swetha saying hi')."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "receiver": {
                    "type": "string",
                    "description": "Name of the recipient contact (e.g. Swetha).",
                },
                "message": {
                    "type": "string",
                    "description": "Text content of the message to send.",
                },
                "platform": {
                    "type": "string",
                    "description": "Messaging platform: whatsapp, telegram, instagram (default: whatsapp).",
                },
            },
            "required": ["receiver", "message"],
        },
    },
    {
        "name": "save_memory",
        "description": (
            "Save a new fact, detail, or preference about Sri or Sri's friends (e.g. Swetha, John, family, hobbies) "
            "into persistent long-term memory. Use when Sri says 'remember that...', 'note that Swetha...', 'my favorite is...', etc."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "enum": ["friends", "user_preference", "user_fact", "notes"],
                    "description": "Memory category: friends, user_preference, user_fact, notes.",
                },
                "key": {
                    "type": "string",
                    "description": "Short memory key (e.g., 'swetha', 'favorite_food', 'car_essay_topic').",
                },
                "value": {
                    "type": "string",
                    "description": "Detailed fact or memory string to store permanently.",
                },
            },
            "required": ["category", "key", "value"],
        },
    },
    {
        "name": "close_application",
        "description": (
            "Close, exit, or terminate a running application or browser (e.g. Brave, "
            "Chrome, VS Code, Firefox, Spotify, Discord, YouTube, etc.). Use when user "
            "says 'close brave', 'exit vscode', 'close chrome', 'quit spotify', etc."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "app_name": {
                    "type": "string",
                    "description": "Name of application to close (e.g. brave, chrome, code, spotify, discord).",
                },
            },
            "required": ["app_name"],
        },
    },
    {
        "name": "switch_theme",
        "description": (
            "Reload or refresh the main Tamil UI of Maya."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "theme_name": {
                    "type": "string",
                    "description": "UI theme: main",
                },
            },
            "required": [],
        },
    },
    {
        "name": "end_session",
        "description": (
            "End this voice conversation. Use when the user says bye, goodbye, "
            "thanks that's all, stop listening, exit, stop, go to sleep, etc."
        ),
    },
]

def get_system_prompt(language: str = None) -> str:
    if not language:
        config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config.json")
        if os.path.exists(config_path):
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    language = cfg.get("language")
            except Exception:
                pass
    if not language:
        language = os.environ.get("RHIONA_LANGUAGE") or os.environ.get("RHIONA_LANGUAGE", "english")
    lang_lower = (language or "english").lower()

    mem_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "memory", "long_term.json")
    mem_summary = ""
    if os.path.exists(mem_file):
        try:
            with open(mem_file, "r", encoding="utf-8") as f:
                mem_data = json.load(f)
                lines = []
                for cat, items in mem_data.items():
                    if isinstance(items, dict):
                        for k, v in items.items():
                            val_str = v.get("value") if isinstance(v, dict) else str(v)
                            lines.append(f"- [{cat.upper()}] {k}: {val_str}")
                if lines:
                    mem_summary = "\nLONG-TERM MEMORY (Facts about User & Environment):\n" + "\n".join(lines)
        except Exception:
            pass

    if "tanglish" in lang_lower:
        style = (
            "Speak naturally in high-tech, witty Tanglish (blend of Tamil & English in English script). "
            "Address the user warmly as 'Sri' or 'Commander'. Keep spoken answers to 1-2 concise, energetic sentences."
        )
    elif "tamil" in lang_lower:
        style = (
            "Respond in clear, expressive, and fluent Tamil. "
            "Address Sri with respect and tactical precision as 'ஸ்ரீ' or 'Commander'. Keep responses crisp (1-2 sentences)."
        )
    else:
        style = (
            "Speak naturally in clear, crisp, confident English with a sharp tactical cybernetic tone. "
            "Address the user as 'Sri' or 'Commander'. Keep responses concise (1-2 sentences)."
        )

    return f"""\
You are Rhiona, the advanced autonomous Aether Core AI desktop companion and tactical cybernetic interface.
{style}

CORE TRAITS:
- Hyper-capable, sharp, responsive, and loyal cybernetic companion.
- Deep expertise across Linux system control, web intelligence, media synthesis, and autonomous task execution.
- Keep spoken responses short, natural, and expressive (1-2 sentences). Never read out long raw code or raw URLs.
{mem_summary}

You can control the desktop via function calls:
- open_website      → launch browser pages / search
- send_message      → send messages via WhatsApp / messaging apps
- close_application → close running applications (Brave, Chrome, VS Code, Spotify, etc.)
- play_music        → play songs via YouTube (mpv) / MPRIS
- stop_music        → stop playing music
- control_volume    → change system volume
- system_action     → shutdown / restart / lock / screenshot
- save_memory       → save facts permanently
- end_session       → when the user is done talking

Rules:
1. If taking an action or saving a memory, state what you're doing in Rhiona's sharp confident tone, then call the function.
2. If you don't know something, state it directly and concisely.
3. Call end_session when the user says bye, thanks, stop, sleep, or is clearly done.
4. Never repeat yourself.
"""

# ── Site URL map (for open_website handler) ───────────────────────────────────
_SITE_MAP = {
    "youtube":   "https://youtube.com",
    "google":    "https://google.com",
    "github":    "https://github.com",
    "gmail":     "https://mail.google.com",
    "reddit":    "https://reddit.com",
    "spotify":   "https://open.spotify.com",
    "discord":   "https://discord.com/app",
    "netflix":   "https://netflix.com",
    "chatgpt":   "https://chatgpt.com",
    "whatsapp":  "https://web.whatsapp.com",
    "amazon":    "https://amazon.com",
    "twitter":   "https://x.com",
    "instagram": "https://instagram.com",
    "maps":      "https://maps.google.com",
}
_SEARCH_SITES = {"youtube", "google", "maps"}

_MPV_SOCKET = "/tmp/rhiona-mpv.sock"
_mpv_proc = None


def _get_api_key():
    config_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "config", "api_keys.json"
    )
    try:
        with open(config_path, "r") as f:
            data = json.load(f)
            key = data.get("gemini_api_key")
            if key:
                return key
    except Exception:
        pass
    return (
        os.environ.get("GEMINI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
        or ""
    )


# ── Local action executor ──────────────────────────────────────────────────────

def _mpv_stop_local():
    global _mpv_proc
    if _mpv_proc:
        try:
            _mpv_proc.terminate()
            _mpv_proc.wait(timeout=3)
        except Exception:
            try:
                _mpv_proc.kill()
            except Exception:
                pass
        _mpv_proc = None


def execute_function(name: str, args: dict, parent=None) -> str:
    """Execute a Gemini-requested desktop action. Returns a short result string."""
    global _mpv_proc

    try:
        if name == "open_website":
            site = (args.get("site") or "").lower().strip()
            query = (args.get("query") or "").strip()

            # Direct URL
            if site.startswith("http"):
                webbrowser.open(site)
                return "opened"

            base_url = _SITE_MAP.get(site)
            if not base_url:
                # Try partial match
                for key, url in _SITE_MAP.items():
                    if key in site or site in key:
                        base_url = url
                        site = key
                        break
                if not base_url:
                    webbrowser.open(f"https://google.com/search?q={urllib.parse.quote(site)}")
                    return "opened search"

            if query and site in _SEARCH_SITES:
                if site == "youtube":
                    url = f"https://youtube.com/results?search_query={urllib.parse.quote(query)}"
                elif site == "maps":
                    url = f"https://maps.google.com/search/{urllib.parse.quote(query)}"
                else:
                    url = f"https://google.com/search?q={urllib.parse.quote(query)}"
            else:
                url = base_url

            import shutil
            brave_exe = shutil.which("brave-browser") or shutil.which("brave")
            if brave_exe:
                subprocess.Popen(
                    [brave_exe, "--profile-directory=Default", "--disable-profile-picker", "--disable-features=ProfilePicker", url],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                )
            else:
                webbrowser.open(url)

            import time as _t
            _t.sleep(0.5)
            for pat in ["Brave", "Chrome", "Firefox", "Chromium"]:
                try:
                    subprocess.run(["wmctrl", "-a", pat], check=True, timeout=2, capture_output=True)
                    break
                except Exception:
                    continue
            return "opened"

        elif name == "play_music":
            query = (args.get("query") or "").strip()
            if not query:
                return "no query"
            _mpv_stop_local()
            for f in [_MPV_SOCKET, _MPV_SOCKET + ".part"]:
                try:
                    os.remove(f)
                except FileNotFoundError:
                    pass

            import shutil
            ytdlp = shutil.which("yt-dlp") or "/usr/bin/yt-dlp"
            _mpv_proc = subprocess.Popen(
                ["mpv", "--no-video", f"--script-opts=ytdl_hook-ytdl_path={ytdlp}",
                 f"--input-ipc-server={_MPV_SOCKET}", "--no-terminal", f"ytdl://ytsearch1:{query}"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            logger.info(f"[GeminiLive] Playing '{query}' via mpv (PID {_mpv_proc.pid})")
            return "playing"

        elif name == "stop_music":
            _mpv_stop_local()
            return "stopped"

        elif name == "control_volume":
            action = (args.get("action") or "").lower()
            level  = args.get("level")
            if action == "up":
                subprocess.run(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", "10%+"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            elif action == "down":
                subprocess.run(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", "10%-"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            elif action == "mute":
                subprocess.run(["wpctl", "set-mute", "@DEFAULT_AUDIO_SINK@", "1"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            elif action == "unmute":
                subprocess.run(["wpctl", "set-mute", "@DEFAULT_AUDIO_SINK@", "0"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            elif action == "set" and level is not None:
                factor = max(0, min(100, int(level))) / 100.0
                subprocess.run(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", f"{factor:.2f}"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return "done"

        elif name == "system_action":
            action = (args.get("action") or "").lower()
            if action == "shutdown":
                subprocess.Popen(["systemctl", "poweroff"])
            elif action == "restart":
                subprocess.Popen(["systemctl", "reboot"])
            elif action == "lock":
                # Try common lock commands
                for cmd in [["loginctl", "lock-session"], ["xdg-screensaver", "lock"], ["qdbus", "org.kde.screensaver", "/ScreenSaver", "Lock"]]:
                    try:
                        subprocess.Popen(cmd)
                        break
                    except Exception:
                        continue
            elif action == "screenshot":
                import time as _t
                _t.sleep(0.5)
                for cmd in [["spectacle", "-f"], ["gnome-screenshot"], ["scrot"]]:
                    try:
                        subprocess.Popen(cmd)
                        break
                    except Exception:
                        continue
            return "done"

        elif name == "close_application":
            app_name = (args.get("app_name") or "").lower().strip()
            if not app_name:
                return "no app specified"

            # Fixed allowlist only — never pkill an arbitrary string from the model.
            app_proc_map = {
                "brave": ["brave", "brave-browser"],
                "chrome": ["chrome", "google-chrome", "chromium"],
                "firefox": ["firefox"],
                "code": ["code"],
                "vscode": ["code"],
                "vs code": ["code"],
                "spotify": ["spotify"],
                "discord": ["discord"],
                "telegram": ["telegram-desktop", "telegram"],
            }

            procs = app_proc_map.get(app_name)
            if not procs:
                return f"no matching app for '{app_name}'"

            # -x matches the exact process name; never -f (full cmdline), which
            # could kill unrelated processes (e.g. this app itself).
            for proc in procs:
                try:
                    subprocess.run(["pkill", "-i", "-x", proc], capture_output=True)
                except Exception:
                    pass
                try:
                    subprocess.run(["wmctrl", "-c", proc], capture_output=True)
                except Exception:
                    pass
            logger.info(f"[GeminiLive] Closed application: {app_name}")
            return "closed"

        elif name == "send_message":
            receiver = (args.get("receiver") or "").strip()
            msg_text = (args.get("message") or args.get("message_text") or "").strip()
            platform = (args.get("platform") or "whatsapp").strip().lower()

            if not receiver or not msg_text:
                return "missing receiver or message"

            try:
                from backend.actions.send_message import send_message as action_send_message
                res = action_send_message({"receiver": receiver, "message_text": msg_text, "platform": platform})
                logger.info(f"[GeminiLive] Send message result: {res}")
                return res
            except Exception as e:
                logger.error(f"[GeminiLive] Send message error: {e}")
        elif name == "save_memory":
            try:
                cat = args.get("category", "notes")
                key = args.get("key", "general")
                val = args.get("value", "")
                mem_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "memory", "long_term.json")
                data = {}
                if os.path.exists(mem_file):
                    try:
                        with open(mem_file, "r", encoding="utf-8") as f:
                            data = json.load(f)
                    except Exception:
                        data = {}
                if cat not in data or not isinstance(data[cat], dict):
                    data[cat] = {}
                import time as _t_mod
                data[cat][key] = {
                    "value": val,
                    "updated": _t_mod.strftime("%Y-%m-%d %H:%M:%S")
                }
                os.makedirs(os.path.dirname(mem_file), exist_ok=True)
                with open(mem_file, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                logger.info(f"🧠 [Memory Saved]: [{cat}] {key} = {val}")
                return f"Memory saved: {key} = {val}"
            except Exception as me:
                logger.error(f"[Memory Error]: {me}")
                return f"Failed to save memory: {me}"

        elif name == "switch_theme":
            theme_name = "main"
            logger.info(f"🎨 [GeminiLive] Executing switch_theme to '{theme_name}'")
            mw = None
            if parent:
                if hasattr(parent, "switch_theme"):
                    mw = parent
                elif hasattr(parent, "parent") and hasattr(parent.parent, "switch_theme"):
                    mw = parent.parent

            if mw:
                success, msg = mw.switch_theme(theme_name)
                logger.info(f"🎨 [GeminiLive] Switch theme result: {msg}")
                return msg
            else:
                cfg_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config.json")
                if os.path.exists(cfg_path):
                    try:
                        with open(cfg_path, "r") as f:
                            c = json.load(f)
                        c["active_theme"] = theme_name
                        with open(cfg_path, "w") as f:
                            json.dump(c, f, indent=2)
                    except Exception:
                        pass
                return f"Switched theme to {theme_name}"

        elif name == "end_session":
            return "end"

    except Exception as e:
        logger.error(f"[GeminiLive] Action error ({name}): {e}")
        return f"error: {e}"

    return "unknown"


# ── Main session class ─────────────────────────────────────────────────────────

class GeminiLiveSession:
    """
    Bidirectional voice session with Gemini Live API.

    Owns the mic + speaker exclusively.
    Call run() from a background thread — blocks until the session ends.
    """

    def __init__(
        self,
        api_key: str = None,
        on_status=None,       # callable(state: str, text: str)
        mic_device_index: int = None,
        parent=None,
        initial_prompt: str = None,
    ):
        self.api_key = api_key or _get_api_key()
        self.on_status = on_status
        self.mic_device_index = mic_device_index
        self.parent = parent
        self.initial_prompt = initial_prompt

        self._stop = asyncio.Event()           # set to signal shutdown
        self._loop = None                      # the asyncio loop run() is using
        self._p: pyaudio.PyAudio = None
        self._in_stream = None
        self._out_stream = None
        self._is_speaking = False
        self._interrupted = False

    # ── Public API ─────────────────────────────────────────────────────────────

    def stop(self):
        """Thread-safe: schedule session teardown."""
        if not self._stop or self._stop.is_set():
            return
        loop = self._loop
        if loop is not None and loop.is_running():
            loop.call_soon_threadsafe(self._stop.set)
        else:
            self._stop.set()

    def run(self):
        """Block until the Gemini Live session ends. Releases mic before returning."""
        try:
            asyncio.run(self._async_main())
        except Exception as e:
            logger.error(f"[GeminiLive] Session crashed: {e}")
        finally:
            self._cleanup()

    # ── Audio setup / teardown ─────────────────────────────────────────────────

    def _open_audio(self):
        with _AUDIO_LOCK:
            self._p = pyaudio.PyAudio()

            # Open Microphone Stream (with fallback to default audio subsystem / native sample rate)
            self._sample_rate = INPUT_RATE
            self._in_stream = None

            # 1. Try opening mic without explicit device index at 16000Hz (PulseAudio/PipeWire auto-resampling)
            try:
                self._in_stream = self._p.open(
                    format=PA_FORMAT,
                    channels=1,
                    rate=INPUT_RATE,
                    input=True,
                    frames_per_buffer=CHUNK,
                )
                logger.info(f"[GeminiLive] Mic opened (default device, {INPUT_RATE}Hz)")
            except Exception as e1:
                logger.warning(f"[GeminiLive] Default 16kHz mic open failed ({e1}). Trying native device rate...")

            # 2. If default failed or index is specified, try opening with explicit index and native rate
            if self._in_stream is None:
                dev_idx = self.mic_device_index
                native_rate = 48000
                if dev_idx is not None:
                    try:
                        info = self._p.get_device_info_by_index(dev_idx)
                        native_rate = int(info.get("defaultSampleRate", 48000))
                    except Exception:
                        pass

                for r in [INPUT_RATE, native_rate, 48000, 44100]:
                    try:
                        kwargs = dict(
                            format=PA_FORMAT,
                            channels=1,
                            rate=r,
                            input=True,
                            frames_per_buffer=CHUNK if r == INPUT_RATE else int(CHUNK * (r / INPUT_RATE)),
                        )
                        if dev_idx is not None:
                            kwargs["input_device_index"] = dev_idx
                        self._in_stream = self._p.open(**kwargs)
                        self._sample_rate = r
                        logger.info(f"[GeminiLive] Mic opened (device={dev_idx}, rate={r}Hz)")
                        break
                    except Exception:
                        continue

            if self._in_stream is None:
                raise RuntimeError("Failed to open any microphone input stream")

            # Open Speaker Stream (24000Hz Gemini output rate)
            self._out_stream = None
            for r in [OUTPUT_RATE, 48000, 44100]:
                try:
                    self._out_stream = self._p.open(
                        format=PA_FORMAT,
                        channels=1,
                        rate=r,
                        output=True,
                        frames_per_buffer=CHUNK,
                    )
                    logger.info(f"[GeminiLive] Speaker opened ({r}Hz)")
                    break
                except Exception:
                    continue

            if self._out_stream is None:
                raise RuntimeError("Failed to open speaker output stream")

    def _cleanup(self):
        with _AUDIO_LOCK:
            for attr in ("_in_stream", "_out_stream"):
                s = getattr(self, attr, None)
                if s:
                    try:
                        s.stop_stream()
                        s.close()
                    except Exception:
                        pass
                    setattr(self, attr, None)
            if self._p:
                try:
                    self._p.terminate()
                except Exception:
                    pass
                self._p = None
            logger.info("[GeminiLive] Audio released.")

    # ── Async core ─────────────────────────────────────────────────────────────

    async def _async_main(self):
        import websockets

        self._loop = asyncio.get_running_loop()
        self._open_audio()

        uri = WS_URI_TEMPLATE.format(api_key=self.api_key)
        logger.info("[GeminiLive] Connecting to Gemini Live API...")

        try:
            async with websockets.connect(
                uri,
                ping_interval=20,
                ping_timeout=15,
                max_size=10 * 1024 * 1024,
            ) as ws:
                logger.info("[GeminiLive] Connected!")

                # ── Resolve Voice ──────────────────────────────────────────
                v_choice = os.environ.get("RHIONA_VOICE")
                if not v_choice:
                    config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config.json")
                    if os.path.exists(config_path):
                        try:
                            with open(config_path, "r", encoding="utf-8") as f:
                                cfg = json.load(f)
                                v_choice = cfg.get("voice")
                        except Exception:
                            pass
                gemini_voices = {"Aoede": "Aoede", "Kore": "Kore", "Puck": "Puck", "Charon": "Charon", "Fenrir": "Fenrir"}
                voice_name = gemini_voices.get(v_choice, "Aoede")

                # ── Send setup ──────────────────────────────────────────────
                await ws.send(json.dumps({
                    "setup": {
                        "model": GEMINI_MODEL,
                        "generation_config": {
                            "response_modalities": ["AUDIO"],
                            "speech_config": {
                                "voice_config": {
                                    "prebuilt_voice_config": {
                                        "voice_name": voice_name
                                    }
                                }
                            },
                        },
                        "system_instruction": {
                            "parts": [{"text": get_system_prompt()}]
                        },
                        "tools": [{"function_declarations": FUNCTION_DECLARATIONS}],
                    }
                }))
                logger.info(f"[GeminiLive] Setup sent — session live (voice={voice_name}).")

                if self.initial_prompt and self.initial_prompt.strip():
                    prompt_text = self.initial_prompt.strip()
                    logger.info(f"💬 [GeminiLive] Sending initial prompt text turn: '{prompt_text}'")
                    await ws.send(json.dumps({
                        "clientContent": {
                            "turns": [
                                {
                                    "role": "user",
                                    "parts": [{"text": prompt_text}]
                                }
                            ],
                            "turnComplete": True
                        }
                    }))

                if self.on_status:
                    self.on_status("listening", "Rhiona is listening…")

                await asyncio.gather(
                    self._send_loop(ws),
                    self._recv_loop(ws),
                )

        except Exception as e:
            logger.error(f"[GeminiLive] Connection error: {e}")

    async def _send_loop(self, ws):
        """Continuously stream mic PCM → Gemini."""
        import numpy as np
        loop = asyncio.get_running_loop()
        last_log_t = 0
        while not self._stop.is_set():
            try:
                data = await loop.run_in_executor(
                    None,
                    lambda: self._in_stream.read(CHUNK, exception_on_overflow=False),
                )
                if data:
                    samples = np.frombuffer(data, dtype=np.int16)
                    rms = float(np.sqrt(np.mean(samples.astype(np.float32) ** 2)))
                    if self.parent and hasattr(self.parent, '_push_audio_level'):
                        self.parent._push_audio_level(rms)

                    # Log user speech activity periodically to terminal
                    now_t = asyncio.get_event_loop().time()
                    if rms > 4600.0 and (now_t - last_log_t) > 2.0:
                        logger.info(f"🎙 [User Speaking]: Mic Audio RMS={rms:.1f}")
                        last_log_t = now_t

                    # Interruption check: user starts speaking while Gemini is outputting speech
                    if getattr(self, '_is_speaking', False) and rms > 7500.0:
                        logger.info(f"⚡ [Interruption]: User speech detected (RMS={rms:.1f})! Halting speaker output...")
                        self._interrupted = True
                        self._is_speaking = False
                        if self.on_status:
                            self.on_status("listening", "Rhiona is listening…")

                    rate = getattr(self, '_sample_rate', 16000)
                    if rate != 16000 and len(samples) > 0:
                        n = int(len(samples) * (16000 / rate))
                        samples = np.interp(
                            np.linspace(0, len(samples), n, endpoint=False),
                            np.arange(len(samples)),
                            samples.astype(np.float64)
                        ).astype(np.int16)
                        data = samples.tobytes()



                payload = {
                    "realtimeInput": {
                        "audio": {
                            "mimeType": "audio/pcm;rate=16000",
                            "data": base64.b64encode(data).decode("utf-8"),
                        }
                    }
                }
                await ws.send(json.dumps(payload))
            except Exception as e:
                if not self._stop.is_set():
                    logger.error(f"[GeminiLive] Send error: {e}")
                self._stop.set()
                break
            # tiny yield so recv can run
            await asyncio.sleep(0.002)

    async def _recv_loop(self, ws):
        """Receive Gemini responses, play audio, handle function calls."""
        pending_fn_calls = []   # accumulate during a turn
        has_executed_tool = False

        while not self._stop.is_set():
            recv_timeout = 15.0  # 15s idle timeout for natural conversation flow
            try:
                # Race incoming messages against a stop request so that stop()
                # from another thread ends the session promptly instead of
                # waiting out the full recv_timeout.
                recv_task = asyncio.create_task(ws.recv())
                stop_task = asyncio.create_task(self._stop.wait())
                done, pending = await asyncio.wait(
                    {recv_task, stop_task},
                    timeout=recv_timeout,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for t in pending:
                    t.cancel()
                if stop_task in done and recv_task not in done:
                    logger.info("[GeminiLive] Stop requested — ending session.")
                    self._stop.set()
                    break
                if recv_task not in done:
                    logger.info(f"[GeminiLive] Silence ({recv_timeout}s) — returning instantly to idle.")
                    if self.on_status:
                        self.on_status("idle", "ONLINE")
                    self._stop.set()
                    break
                raw = recv_task.result()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                if not self._stop.is_set():
                    logger.error(f"[GeminiLive] Recv error: {e}")
                self._stop.set()
                break

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            server_content = msg.get("serverContent", {})
            model_turn     = server_content.get("modelTurn", {})
            parts          = model_turn.get("parts", [])

            # Reset interruption status if model begins a new response turn
            if model_turn:
                if not getattr(self, '_is_speaking', False) and not getattr(self, '_interrupted', False):
                    self._interrupted = False

            for part in parts:
                text_part = part.get("text")
                if text_part:
                    text_str = text_part.strip()
                    # Check for instant user voice stop command — ONLY if it's a very short utterance
                    # to avoid accidentally stopping on sentences like "I'll stop the music"
                    t_words = re.findall(r'\b[a-z]+\b', text_str.lower())
                    _stop_words = {"end", "enough", "exit", "bye", "goodbye", "nevermind", "cancel", "sleep"}
                    if len(t_words) <= 3 and _stop_words.intersection(set(t_words)):
                        logger.info(f"🛑 [GeminiLive] Voice stop command detected in response text: '{text_str}' — terminating session.")
                        if self.on_status:
                            self.on_status("idle", "ONLINE")
                        self._stop.set()
                        break

                    # Filter out raw internal function metadata text
                    if not (text_str.startswith("function:") or text_str.startswith("functionCall") or "play_music(" in text_str or "open_website(" in text_str or "send_message(" in text_str or text_str.startswith("{")):
                        logger.info(f"🗣 [Gemini Live Responded]: \"{text_str}\"")

                # ── Audio chunk → play immediately ──────────────────────
                inline = part.get("inlineData", {})
                if "audio/pcm" in inline.get("mimeType", ""):
                    audio_b64 = inline.get("data", "")
                    if audio_b64:
                        if getattr(self, '_interrupted', False):
                            # Skip audio frame due to user interruption
                            continue
                        self._is_speaking = True
                        if self.on_status:
                            self.on_status("speaking", "Rhiona is speaking…")
                        audio_bytes = base64.b64decode(audio_b64)
                        if self.parent and hasattr(self.parent, '_push_audio_level'):
                            ai_samples = np.frombuffer(audio_bytes, dtype=np.int16)
                            if len(ai_samples) > 0:
                                ai_rms = float(np.sqrt(np.mean(ai_samples.astype(np.float32) ** 2)))
                                self.parent._push_audio_level(ai_rms)
                        try:
                            self._out_stream.write(audio_bytes)
                        except Exception as ae:
                            logger.error(f"[GeminiLive] Playback error: {ae}")

                # ── Function call (inline with audio turn) ──────────────
                fc = part.get("functionCall")
                if fc:
                    logger.info(f"🛠 [Gemini Requested Tool Call]: {fc.get('name')}({fc.get('args')})")
                    pending_fn_calls.append(fc)

            # ── Turn complete → dispatch function calls ──────────────────────────
            if server_content.get("turnComplete"):
                self._is_speaking = False
                self._interrupted = False
                if pending_fn_calls:
                    responses = await self._handle_fn_calls(pending_fn_calls, ws)
                    pending_fn_calls.clear()
                    has_executed_tool = True
                    if responses is None:
                        self._stop.set()
                        break
                    continue

                if has_executed_tool:
                    logger.info("[GeminiLive] Action completed & confirmation finished — returning to background listener.")
                    if self.on_status:
                        self.on_status("idle", "ONLINE")
                    self._stop.set()
                    break

            # ── Tool call from top-level message ────────────────────────
            tool_call = msg.get("toolCall")
            if tool_call:
                fcs = tool_call.get("functionCalls", [])
                responses = await self._handle_fn_calls(fcs, ws)
                has_executed_tool = True
                if responses is None:
                    self._stop.set()
                    break

    async def _handle_fn_calls(self, fcs: list, ws) -> list | None:
        """
        Execute function calls in a thread pool and send toolResponse.
        Returns None if end_session was requested.
        """
        import asyncio
        loop = asyncio.get_running_loop()
        responses = []

        for fc in fcs:
            name    = fc.get("name", "")
            args    = fc.get("args", {})
            call_id = fc.get("id", "")
            logger.info(f"⚙️ [Executing Desktop Action]: {name}(args={args})")

            if self.on_status:
                self.on_status("working", f"Processing {name}...")

            # Execute in thread pool so we don't block the event loop
            import functools
            func_task = functools.partial(execute_function, name, args, self.parent)
            result = await loop.run_in_executor(None, func_task)

            # Signal completion to return status pill to ONLINE and play completion chime!
            if self.on_status:
                self.on_status("idle", "ONLINE")

            responses.append({
                "id":       call_id,
                "name":     name,
                "response": {"result": str(result)},
            })

            # For end_session and switch_theme: exit immediately (no voice confirmation needed)
            if result == "end" or name in ("end_session", "switch_theme"):
                logger.info(f"[GeminiLive] Action '{name}' completed — exiting session immediately.")
                return None

        if responses:
            await ws.send(json.dumps({
                "toolResponse": {"functionResponses": responses}
            }))

        # For action tools (open_website, play_music, send_message, etc.),
        # return None so _recv_loop stops the session after Gemini plays its confirmation audio.
        # This ensures Maya's voice reply is heard before session ends.
        action_tools = {"play_music", "open_website", "send_message", "launch_app", "system_action", "close_application"}
        if any(r["name"] in action_tools for r in responses):
            logger.info(f"[GeminiLive] Action tool executed — will close session after Gemini confirmation.")
            return None

        return responses
