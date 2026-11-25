#!/usr/bin/env python3
"""
Rhiona Agent Engine
Central CLI & Python engine bridging the agentic workflow (planner, executor, actions, memory, vision)
with the Rhiona Node/Express presentation layer.
"""

from __future__ import annotations

import argparse
import base64
import datetime
import json
import logging
import os
import platform
import re
import shlex
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Also ensure backend directory is importable
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Suppress noisy logs for CLI output
logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger("agent_engine")


# ---------------------------------------------------------------------------
# 1. Real Hardware & System Telemetry (Including HP Fan Control)
# ---------------------------------------------------------------------------
def find_hp_fan_paths() -> tuple[str | None, str | None, str | None, str | None]:
    """Dynamically locate hp-wmi hwmon sysfs interface paths."""
    import glob
    candidates = glob.glob("/sys/class/hwmon/hwmon*/name")
    for c in candidates:
        try:
            with open(c) as f:
                if f.read().strip() == "hp":
                    hwmon_dir = os.path.dirname(c)
                    pwm = os.path.join(hwmon_dir, "pwm1_enable")
                    fan1 = os.path.join(hwmon_dir, "fan1_input")
                    fan2 = os.path.join(hwmon_dir, "fan2_input")
                    return hwmon_dir, pwm, fan1, fan2
        except Exception:
            pass
    return None, None, None, None


def get_fan_status() -> dict[str, Any]:
    """Read current fan RPMs and mode from kernel hwmon interface."""
    hwmon_dir, pwm, fan1, fan2 = find_hp_fan_paths()
    f1_rpm = 0
    f2_rpm = 0
    pwm_val = "2"
    mode = "auto"
    available = False

    if pwm and os.path.exists(pwm):
        available = True
        try:
            with open(pwm) as f:
                pwm_val = f.read().strip()
                # 0 = max fan speed, 2 = auto thermal curve
                mode = "max" if pwm_val == "0" else ("auto" if pwm_val == "2" else f"custom_{pwm_val}")
        except Exception:
            pass

    if fan1 and os.path.exists(fan1):
        try:
            with open(fan1) as f:
                f1_rpm = int(f.read().strip())
        except Exception:
            pass

    if fan2 and os.path.exists(fan2):
        try:
            with open(fan2) as f:
                f2_rpm = int(f.read().strip())
        except Exception:
            pass

    # Fallback to psutil.sensors_fans() if sysfs wasn't found directly
    if not available:
        try:
            import psutil
            fans = psutil.sensors_fans() if hasattr(psutil, "sensors_fans") else {}
            if "hp" in fans and fans["hp"]:
                available = True
                f1_rpm = int(fans["hp"][0].current) if len(fans["hp"]) > 0 else 0
                f2_rpm = int(fans["hp"][1].current) if len(fans["hp"]) > 1 else 0
        except Exception:
            pass

    return {
        "success": True,
        "available": available,
        "mode": mode,
        "pwm_raw": pwm_val,
        "fan1_rpm": f1_rpm,
        "fan2_rpm": f2_rpm,
        "hwmon_dir": hwmon_dir,
    }


def set_fan_mode(mode: str, password: str | None = None) -> dict[str, Any]:
    """Set fan mode to 'max' (0) or 'auto' (2). Supports sudo password authentication and direct unlock."""
    hwmon_dir, pwm, fan1, fan2 = find_hp_fan_paths()
    if not pwm or not os.path.exists(pwm):
        return {"success": False, "error": "HP fan control interface not found on this machine."}

    clean_mode = mode.lower().strip()
    target_val = "0" if clean_mode in ("max", "full", "100", "overclock", "boost") else "2"
    target_name = "MAX" if target_val == "0" else "AUTO"

    # 1. Direct write attempt (succeeds if chmod 666 or udev rule already exists)
    try:
        with open(pwm, "w") as f:
            f.write(target_val)
        status = get_fan_status()
        return {
            "success": True,
            "mode": status["mode"],
            "fan1_rpm": status["fan1_rpm"],
            "fan2_rpm": status["fan2_rpm"],
            "message": f"Laptop fans switched to {target_name} speed.",
            "unlocked": True,
        }
    except PermissionError:
        pass
    except Exception as exc:
        return {"success": False, "error": f"Direct write error: {exc}"}

    # 2. Authenticated write attempt with sudo -S (unlocks chmod 666 for future use)
    if password:
        udev_rule = 'ACTION==\\"add|change\\", SUBSYSTEM==\\"hwmon\\", ATTRS{name}==\\"hp\\", RUN+=\\"/bin/chmod 666 /sys%p/pwm1_enable\\"'
        unlock_script = (
            f"echo {target_val} > {pwm} && "
            f"chmod 666 {pwm} && "
            f"(echo '{udev_rule}' > /etc/udev/rules.d/99-hp-fan.rules 2>/dev/null || true)"
        )
        try:
            proc = subprocess.run(
                ["sudo", "-S", "sh", "-c", unlock_script],
                input=(password + "\n"),
                text=True,
                capture_output=True,
                timeout=6,
            )
            if proc.returncode == 0:
                status = get_fan_status()
                return {
                    "success": True,
                    "mode": status["mode"],
                    "fan1_rpm": status["fan1_rpm"],
                    "fan2_rpm": status["fan2_rpm"],
                    "message": f"Laptop fans set to {target_name} speed. Hardware permissions unlocked for future toggles.",
                    "unlocked": True,
                }
            else:
                err_msg = proc.stderr.strip()
                if "incorrect password" in err_msg.lower():
                    return {"success": False, "need_password": True, "error": "Incorrect password."}
                return {"success": False, "error": f"Sudo execution notice: {err_msg}"}
        except Exception as exc:
            return {"success": False, "error": f"Authentication execution error: {exc}"}

    # 3. If no password provided and write requires root
    return {
        "success": False,
        "need_password": True,
        "message": "Root authorization required to toggle fan speed. Enter password to authorize.",
    }


def get_system_health() -> dict[str, Any]:
    """Return real-time host hardware metrics."""
    try:
        import psutil
        cpu = psutil.cpu_percent(interval=0.1)
        mem = psutil.virtual_memory()
        ram_percent = mem.percent
        used_mb = round(mem.used / (1024 * 1024))
        total_mb = round(mem.total / (1024 * 1024))

        cpu_temp = 0.0
        try:
            temperatures = psutil.sensors_temperatures() if hasattr(psutil, "sensors_temperatures") else {}
            preferred = ("k10temp", "coretemp", "cpu_thermal", "acpitz")
            readings = next((temperatures[name] for name in preferred if temperatures.get(name)), None)
            if readings is None and temperatures:
                readings = next(iter(temperatures.values()))
            if readings:
                cpu_temp = round(float(readings[0].current), 1)
        except Exception:
            pass

        battery_info = "AC Connected"
        if hasattr(psutil, "sensors_battery"):
            bat = psutil.sensors_battery()
            if bat:
                battery_info = f"{bat.percent}% {'(Charging)' if bat.power_plugged else ''}".strip()

        gpu_info = {
            "name": "Unavailable",
            "temp": 0.0,
            "vram_percent": 0,
            "utilization": 0,
            "vram_used_mb": 0,
            "vram_total_mb": 0,
        }
        if shutil.which("nvidia-smi"):
            try:
                res = subprocess.run(
                    ["nvidia-smi", "--query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total", "--format=csv,noheader,nounits"],
                    capture_output=True, text=True, timeout=1.5,
                )
                if res.returncode == 0 and res.stdout.strip():
                    parts = [p.strip() for p in res.stdout.strip().split(",")]
                    if len(parts) >= 5:
                        used_vram = float(parts[3])
                        total_vram = float(parts[4])
                        vram_pct = round((used_vram / total_vram) * 100) if total_vram > 0 else 0
                        gpu_info = {
                            "name": parts[0],
                            "temp": float(parts[1]),
                            "utilization": float(parts[2]),
                            "vram_percent": vram_pct,
                            "vram_used_mb": int(used_vram),
                            "vram_total_mb": int(total_vram),
                        }
            except Exception:
                pass

        fan_info = get_fan_status()

        return {
            "success": True,
            "cpu_percent": cpu,
            "cpu_temp": cpu_temp,
            "ram_percent": ram_percent,
            "ram_used_mb": used_mb,
            "ram_total_mb": total_mb,
            "battery": battery_info,
            "gpu": gpu_info,
            "fan": fan_info,
            "uptime_seconds": int(time.time() - psutil.boot_time()),
            "timestamp": datetime.datetime.now().isoformat(),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


# ---------------------------------------------------------------------------
# 2. Live Web Search
# ---------------------------------------------------------------------------
def search_web(query: str) -> dict[str, Any]:
    """Execute search using backend action with structured markdown."""
    clean_q = query.strip()
    if not clean_q:
        return {"success": True, "query": "", "results": [], "sources": [], "markdown": "Empty search query."}

    try:
        from backend.actions.web_search import web_search
        summary = web_search({"query": clean_q, "mode": "search"}, player=None) or ""
    except Exception as exc:
        summary = f"Search notice: {exc}"

    results = [
        {
            "title": f"Web Intelligence: {clean_q}",
            "snippet": summary,
            "url": f"https://duckduckgo.com/?q={clean_q.replace(' ', '+')}",
        }
    ]

    markdown = f"### Web Intelligence Briefing: \"{clean_q}\"\n\n{summary}\n\n"
    markdown += f"**Primary Reference:** [{clean_q}]({results[0]['url']})"

    return {
        "success": True,
        "query": clean_q,
        "results": results,
        "sources": [{"title": r["title"], "url": r["url"]} for r in results],
        "markdown": markdown,
        "summary": summary,
        "timestamp": datetime.datetime.now().isoformat(),
    }


def scrape_web(url: str) -> dict[str, Any]:
    """Scrape a web page and return readable text with title."""
    clean_url = url.strip()
    if not clean_url:
        return {"success": False, "error": "Empty URL provided", "markdown": "Empty URL provided."}
    if not clean_url.startswith(("http://", "https://")):
        clean_url = "https://" + clean_url

    try:
        import urllib.request
        from bs4 import BeautifulSoup

        req = urllib.request.Request(
            clean_url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
                )
            },
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            html = resp.read().decode("utf-8", errors="ignore")

        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style", "noscript", "svg", "header", "footer", "nav"]):
            tag.decompose()

        title = soup.title.string.strip() if soup.title and soup.title.string else clean_url
        paragraphs = [p.get_text().strip() for p in soup.find_all(["p", "h1", "h2", "h3", "li"]) if p.get_text().strip()]
        body_text = "\n\n".join(paragraphs[:30])

        markdown = f"### Scraped Web Target: [{title}]({clean_url})\n\n{body_text[:3000]}"
        return {
            "success": True,
            "url": clean_url,
            "title": title,
            "markdown": markdown,
            "sources": [{"title": title, "url": clean_url}],
            "timestamp": datetime.datetime.now().isoformat(),
        }
    except Exception as exc:
        return {
            "success": False,
            "url": clean_url,
            "error": str(exc),
            "markdown": f"### Scrape Warning: {clean_url}\n\nNotice: {exc}",
            "sources": [{"title": clean_url, "url": clean_url}],
            "timestamp": datetime.datetime.now().isoformat(),
        }


# ---------------------------------------------------------------------------
# 3. System Media Control & Host MPRIS Telemetry
# ---------------------------------------------------------------------------
def get_media_status() -> dict[str, Any]:
    """Query real Linux MPRIS and PipeWire/Pulse volume."""
    info = {
        "title": "Rhiona Aether Synth",
        "artist": "System Audio",
        "album": "Rhiona Runtime",
        "status": "Stopped",
        "volume": 75,
        "isMuted": False,
        "position": 0,
        "duration": 0,
    }

    players_priority = "plasma-browser-integration,brave,spotify,vlc,mpv,%any"
    if shutil.which("playerctl"):
        try:
            sp = subprocess.run(
                ["playerctl", f"--player={players_priority}", "status"],
                capture_output=True, text=True, timeout=1
            )
            if sp.returncode == 0 and sp.stdout.strip():
                info["status"] = sp.stdout.strip()
            mp = subprocess.run(
                [
                    "playerctl",
                    f"--player={players_priority}",
                    "metadata",
                    "--format",
                    "{{xesam:title}};;;{{xesam:artist}};;;{{xesam:album}};;;{{position}};;;{{mpris:length}}",
                ],
                capture_output=True,
                text=True,
                timeout=1,
            )
            if mp.returncode == 0 and mp.stdout.strip():
                parts = mp.stdout.strip().split(";;;")
                if len(parts) > 0 and parts[0]:
                    info["title"] = parts[0]
                if len(parts) > 1 and parts[1]:
                    info["artist"] = parts[1]
                if len(parts) > 2 and parts[2]:
                    info["album"] = parts[2]
                if len(parts) > 3 and parts[3].isdigit():
                    info["position"] = int(parts[3]) // 1_000_000
                if len(parts) > 4 and parts[4].isdigit():
                    info["duration"] = int(parts[4]) // 1_000_000
        except Exception:
            pass

    if shutil.which("wpctl"):
        try:
            vp = subprocess.run(
                ["wpctl", "get-volume", "@DEFAULT_AUDIO_SINK@"],
                capture_output=True,
                text=True,
                timeout=1,
            )
            if vp.returncode == 0:
                m = re.search(r"Volume:\s+([0-9.]+)", vp.stdout)
                if m:
                    info["volume"] = int(float(m.group(1)) * 100)
                if "[MUTED]" in vp.stdout:
                    info["isMuted"] = True
        except Exception:
            pass

    return info


def control_media(action: str) -> dict[str, Any]:
    """Control local/browser media players using playerctl or wpctl."""
    action_clean = action.strip().lower()

    if action_clean in ("status", "info", "query"):
        return {"success": True, "status": "Status queried", "media": get_media_status()}

    players_priority = "plasma-browser-integration,brave,spotify,vlc,mpv,%any"
    if shutil.which("playerctl"):
        cmd = ["playerctl", f"--player={players_priority}"]
        if action_clean in ("play", "resume"):
            cmd.append("play")
        elif action_clean == "pause":
            cmd.append("pause")
        elif action_clean in ("toggle", "play-pause", "play_pause"):
            cmd.append("play-pause")
        elif action_clean == "stop":
            cmd.append("stop")
        elif action_clean == "next":
            cmd.append("next")
        elif action_clean in ("prev", "previous"):
            cmd.append("previous")
        elif action_clean.startswith("seek:"):
            try:
                target_sec = float(action_clean.split(":", 1)[1])
                cmd.extend(["position", f"{target_sec:.1f}"])
            except Exception:
                pass
        elif action_clean == "volume_up":
            cmd.extend(["volume", "0.05+"])
        elif action_clean == "volume_down":
            cmd.extend(["volume", "0.05-"])
        elif action_clean.startswith("volume:"):
            try:
                vol = float(action_clean.split(":", 1)[1])
                cmd.extend(["volume", f"{vol:.2f}"])
            except Exception as e:
                return {"success": False, "error": f"Invalid volume value: {e}"}
        else:
            cmd.append("play-pause")

        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=2)
            if res.returncode != 0:
                if action_clean in ("play", "pause", "toggle", "play-pause"):
                    act = "play" if action_clean in ("play", "resume") else "pause" if action_clean == "pause" else "play-pause"
                    subprocess.run(["playerctl", "-a", act], capture_output=True, text=True, timeout=2)
                elif action_clean == "next":
                    subprocess.run(["playerctl", f"--player={players_priority}", "position", "10+"], capture_output=True, text=True, timeout=2)
                elif action_clean in ("prev", "previous"):
                    subprocess.run(["playerctl", f"--player={players_priority}", "position", "10-"], capture_output=True, text=True, timeout=2)
        except Exception:
            pass

    # Fallback/Supplemental volume adjustment via wpctl
    if shutil.which("wpctl"):
        if action_clean == "volume_up":
            subprocess.run(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", "5%+"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        elif action_clean == "volume_down":
            subprocess.run(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", "5%-"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        elif action_clean in ("mute", "unmute", "toggle_mute"):
            subprocess.run(["wpctl", "set-mute", "@DEFAULT_AUDIO_SINK@", "toggle"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        elif action_clean.startswith("volume:"):
            try:
                vol_pct = float(action_clean.split(":", 1)[1])
                subprocess.run(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", f"{vol_pct:.2f}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception:
                pass

    return {
        "success": True,
        "status": f"Media command '{action_clean}' dispatched.",
        "media": get_media_status(),
    }


# ---------------------------------------------------------------------------
# 4. Safe Shell & Command Execution
# ---------------------------------------------------------------------------
SAFE_DIAGNOSTIC_COMMANDS = {
    "date", "df", "free", "hostname", "ls", "nvidia-smi", "ps", "pwd", "uname", "uptime", "whoami",
}
SAFE_GIT_SUBCOMMANDS = {"branch", "diff", "log", "show", "status"}


def run_shell(command: str) -> dict[str, Any]:
    """Execute diagnostic or shell commands safely."""
    clean_cmd = command.replace('\n', ' ').replace('\r', ' ').strip()
    if not clean_cmd:
        return {"success": False, "output": "Empty command."}

    lower = clean_cmd.lower()
    if lower in ("help", "?"):
        return {
            "success": True,
            "output": (
                "Available diagnostics: status, fan (status|max|auto), top, free, gpu, uname, df, uptime, "
                "date, hostname, pwd, whoami, ls, ps, git status/log/diff/branch, and agent tasks."
            ),
        }

    # HP Laptop Fan Control & Diagnostics
    if lower.startswith("fan"):
        parts = clean_cmd.split()
        sub = parts[1].lower() if len(parts) > 1 else "status"
        pwd = parts[2] if len(parts) > 2 else None

        if sub in ("status", "info", "rpm", "check", "?"):
            st = get_fan_status()
            return {
                "success": True,
                "command": clean_cmd,
                "output": (
                    f"[RHIONA FAN MATRIX]\n"
                    f"Mode:     {st['mode'].upper()} (pwm1_enable={st['pwm_raw']})\n"
                    f"Fan 1:    {st['fan1_rpm']} RPM\n"
                    f"Fan 2:    {st['fan2_rpm']} RPM\n"
                    f"Hardware: {st['hwmon_dir'] or 'hp-wmi hwmon'}"
                ),
            }
        elif sub in ("max", "full", "100", "overclock", "boost"):
            res = set_fan_mode("max", password=pwd)
            if res.get("need_password"):
                return {
                    "success": False,
                    "command": clean_cmd,
                    "output": (
                        "[RHIONA FAN MATRIX] Root authentication required.\n"
                        "To authorize and permanently unlock direct hardware control, run:\n"
                        "  fan max <your_sudo_password>\n"
                        "Or toggle the FAN button in the UI toolbar."
                    ),
                }
            st = get_fan_status()
            return {
                "success": res.get("success", False),
                "command": "fan max",
                "output": f"[RHIONA FAN MATRIX] {res.get('message', 'Max fans engaged.')}\nFan 1: {st['fan1_rpm']} RPM | Fan 2: {st['fan2_rpm']} RPM",
            }
        elif sub in ("auto", "default", "normal", "quiet", "off"):
            res = set_fan_mode("auto", password=pwd)
            if res.get("need_password"):
                return {
                    "success": False,
                    "command": clean_cmd,
                    "output": (
                        "[RHIONA FAN MATRIX] Root authentication required.\n"
                        "To authorize and permanently unlock direct hardware control, run:\n"
                        "  fan auto <your_sudo_password>\n"
                        "Or toggle the FAN button in the UI toolbar."
                    ),
                }
            st = get_fan_status()
            return {
                "success": res.get("success", False),
                "command": "fan auto",
                "output": f"[RHIONA FAN MATRIX] {res.get('message', 'Automatic thermal curves restored.')}\nFan 1: {st['fan1_rpm']} RPM | Fan 2: {st['fan2_rpm']} RPM",
            }

    if lower == "status":
        health = get_system_health()
        fan_part = ""
        if health.get("fan", {}).get("available"):
            fan_part = f" | FAN {health['fan']['fan1_rpm']}/{health['fan']['fan2_rpm']} RPM ({health['fan']['mode'].upper()})"
        return {
            "success": health.get("success", False),
            "output": (
                f"CPU {health.get('cpu_percent', 0)}% | "
                f"RAM {health.get('ram_percent', 0)}% | "
                f"GPU {health.get('gpu', {}).get('utilization', 0)}%{fan_part} | "
                f"UPTIME {health.get('uptime_seconds', 0)}s"
            ),
        }

    aliases = {
        "top": ["ps", "-eo", "pid,user,%cpu,%mem,comm", "--sort=-%cpu"],
        "gpu": [
            "nvidia-smi",
            "--query-gpu=name,driver_version,temperature.gpu,utilization.gpu,memory.used,memory.total",
            "--format=csv",
        ],
    }

    try:
        argv = aliases.get(lower) or shlex.split(clean_cmd)
    except ValueError as exc:
        return {"success": False, "output": f"Invalid command syntax: {exc}"}

    if not argv:
        return {"success": False, "output": "Empty command."}

    executable = argv[0]
    allowed = executable in SAFE_DIAGNOSTIC_COMMANDS
    if executable == "git":
        allowed = len(argv) > 1 and argv[1] in SAFE_GIT_SUBCOMMANDS

    # If in allowlist, run directly
    if allowed and shutil.which(executable):
        try:
            proc = subprocess.run(
                argv, shell=False, capture_output=True, text=True, timeout=5, cwd=str(PROJECT_ROOT),
            )
            out = proc.stdout.strip()
            err = proc.stderr.strip()
            if lower == "top" and out:
                out = "\n".join(out.splitlines()[:8])
            return {
                "success": proc.returncode == 0,
                "command": clean_cmd,
                "output": out if out else (err if err else f"Command '{clean_cmd}' completed with code {proc.returncode}."),
                "returncode": proc.returncode,
            }
        except subprocess.TimeoutExpired:
            return {"success": False, "output": f"Command '{clean_cmd}' timed out."}
        except Exception as exc:
            return {"success": False, "output": f"Execution error: {exc}"}

    # For other commands, dispatch via backend cmd_control
    try:
        from backend.actions.cmd_control import cmd_control
        res = cmd_control({"task": clean_cmd}, player=None)
        return {
            "success": True,
            "command": clean_cmd,
            "output": res or "Command executed.",
        }
    except Exception as exc:
        return {
            "success": False,
            "output": f"Command execution notice: {exc}",
        }


# ---------------------------------------------------------------------------
# 5. Long-Term Memory & Relationship Graph
# ---------------------------------------------------------------------------
def get_memory_graph() -> dict[str, Any]:
    """Read backend/memory/long_term.json and convert to graph edges for the UI."""
    try:
        from backend.memory.memory_manager import load_memory
        mem = load_memory()
    except Exception:
        mem = {}

    edges = []
    for category, items in mem.items():
        if not isinstance(items, dict):
            continue
        for key, val_obj in items.items():
            val = val_obj.get("value") if isinstance(val_obj, dict) else str(val_obj)
            edges.append({
                "source": category,
                "relation": key,
                "target": str(val)[:120],
                "timestamp": val_obj.get("updated", "") if isinstance(val_obj, dict) else "",
            })

    return {"success": True, "edges": edges, "categories": list(mem.keys()), "raw": mem}


def add_memory_fact(source: str, relation: str, target: str) -> dict[str, Any]:
    """Store fact in long-term memory."""
    try:
        from backend.memory.memory_manager import update_memory
        update_memory({relation: target})
        return {"success": True, "result": f"Memory stored: [{source}] {relation} -> {target}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ---------------------------------------------------------------------------
# 6. Screen Capture & Vision
# ---------------------------------------------------------------------------
def capture_screen() -> dict[str, Any]:
    """Capture screen and return base64 data."""
    output_dir = PROJECT_ROOT / "backend" / "outputs"
    output_dir.mkdir(parents=True, exist_ok=True)
    tmp_path = output_dir / "screen_capture.png"

    captured = False
    # Priority for Linux desktop environments (KDE spectacle, Wayland grim, X11 scrot/import)
    for tool, args in [
        ("spectacle", ["spectacle", "-b", "-n", "-o", str(tmp_path)]),
        ("grim", ["grim", str(tmp_path)]),
        ("scrot", ["scrot", "-z", "-q", "75", str(tmp_path)]),
        ("import", ["import", "-window", "root", "-quality", "75", str(tmp_path)]),
    ]:
        if shutil.which(tool):
            try:
                subprocess.run(args, timeout=3, check=True)
                if tmp_path.exists() and tmp_path.stat().st_size > 0:
                    captured = True
                    break
            except Exception:
                continue

    # Fallback to Python mss if CLI tools failed
    if not captured:
        try:
            import mss
            with mss.mss() as sct:
                sct.shot(output=str(tmp_path))
                if tmp_path.exists() and tmp_path.stat().st_size > 0:
                    captured = True
        except Exception:
            pass

    if captured and tmp_path.exists():
        try:
            with open(tmp_path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")
            return {
                "success": True,
                "path": str(tmp_path),
                "size": tmp_path.stat().st_size,
                "image_base64": b64,
                "mime_type": "image/png",
                "timestamp": datetime.datetime.now().isoformat(),
            }
        except Exception as e:
            return {"success": False, "error": f"Failed reading screenshot: {e}"}

    return {"success": False, "error": "No screenshot utility (spectacle/grim/scrot/mss) succeeded."}


def analyze_screen(prompt: str = "Describe what is on screen.") -> dict[str, Any]:
    """Capture screen and analyze visual content using Gemini Multimodal Vision API."""
    # 1. Take fresh screen capture
    shot = capture_screen()
    if not shot.get("success") or not shot.get("image_base64"):
        return {"success": False, "error": shot.get("error", "Failed to capture screen.")}

    # 2. Prefer Gemini Multimodal Vision if key is available
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        try:
            from dotenv import load_dotenv
            load_dotenv(str(PROJECT_ROOT / "backend" / ".env"))
            key = os.environ.get("GEMINI_API_KEY")
        except Exception:
            pass

    if not key:
        # Fall back to the project's key store (backend/config/api_keys.json), which is
        # where the planner, local model and live-voice paths all read from. Without
        # this, vision silently stayed keyless while the rest of the app worked.
        try:
            from backend.memory.config_manager import get_gemini_key
            key = get_gemini_key()
        except Exception:
            key = None

    if key:
        try:
            import requests
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key={key}"
            payload = {
                "contents": [{
                    "parts": [
                        {"text": prompt or "Describe the active window and workspace in detail."},
                        {"inline_data": {"mime_type": shot.get("mime_type", "image/png"), "data": shot["image_base64"]}}
                    ]
                }]
            }
            res = requests.post(url, json=payload, timeout=20)
            if res.status_code == 200:
                result_json = res.json()
                text = result_json["candidates"][0]["content"]["parts"][0]["text"].strip()
                return {
                    "success": True,
                    "analysis": text,
                    "prompt": prompt,
                    "screenshot_path": shot.get("path"),
                    "engine": "gemini-3.1-flash-lite-vision",
                }
            else:
                logger.warning(f"[Vision] Gemini Vision error {res.status_code}: {res.text[:150]}")
        except Exception as exc:
            logger.warning(f"[Vision] Gemini request failed: {exc}")

    # 3. Fallback to local vision
    try:
        from backend.vision import describe_screenshot
        analysis = describe_screenshot([])
        return {"success": True, "analysis": analysis, "prompt": prompt}
    except Exception as exc:
        return {"success": False, "error": str(exc), "analysis": f"Vision analysis notice: {exc}"}


# ---------------------------------------------------------------------------
# 7. Agentic Flow: Planner & Executor
# ---------------------------------------------------------------------------
def agent_plan(goal: str) -> dict[str, Any]:
    """Generate multi-step plan for a goal using backend.agent.planner."""
    clean_goal = goal.strip()
    if clean_goal.startswith("{") and clean_goal.endswith("}"):
        try:
            parsed = json.loads(clean_goal)
            if "goal" in parsed:
                clean_goal = str(parsed["goal"]).strip()
        except Exception:
            pass
    try:
        from backend.agent.planner import create_plan
        from backend.memory.memory_manager import format_memory_for_prompt, load_memory
        memory_ctx = format_memory_for_prompt(load_memory())
        plan = create_plan(clean_goal, context=memory_ctx)
        return {"success": True, "goal": clean_goal, "plan": plan}
    except Exception as exc:
        return {"success": False, "error": str(exc), "goal": clean_goal}


def agent_execute(goal: str) -> dict[str, Any]:
    """Execute a goal using backend.agent.executor.AgentExecutor."""
    clean_goal = goal.strip()
    if clean_goal.startswith("{") and clean_goal.endswith("}"):
        try:
            parsed = json.loads(clean_goal)
            if "goal" in parsed:
                clean_goal = str(parsed["goal"]).strip()
        except Exception:
            pass
    try:
        from backend.agent.executor import AgentExecutor
        executor = AgentExecutor()
        summary = executor.execute(clean_goal)
        details = getattr(executor, "last_result", None) or {}
        return {
            "success": True,
            "goal": clean_goal,
            "result": summary,
            "steps": details.get("steps", []),
        }
    except Exception as exc:
        return {"success": False, "error": str(exc), "goal": clean_goal}


def open_application(app_name: str) -> dict[str, Any]:
    """Launch app using backend.actions.open_app."""
    try:
        from backend.actions.open_app import open_app
        res = open_app({"app_name": app_name}, player=None)
        return {"success": True, "result": res or f"Opened {app_name}"}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def search_contacts(query: str = "") -> dict[str, Any]:
    """Search or list contacts using backend.contacts_manager."""
    try:
        from backend.contacts_manager import get_contacts, search_contact
        if query:
            match = search_contact(query)
            return {"success": True, "contacts": [match] if match else []}
        return {"success": True, "contacts": get_contacts()[:50]}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def send_whatsapp_message(receiver: str, message: str) -> dict[str, Any]:
    """Send a WhatsApp message via browser automation."""
    try:
        from backend.actions.browser_control import browser_control
        res = browser_control({"action": "send_whatsapp", "receiver": receiver, "message_text": message})
        return {"success": "Successfully sent" in res, "result": res}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def browser_action(action: str = "search", params: dict | None = None) -> dict[str, Any]:
    """Execute dynamic browser control via Playwright and CDP."""
    try:
        from backend.actions.browser_control import browser_control
        payload = {"action": action}
        if params:
            payload.update(params)
        res = browser_control(payload)
        return {"success": True, "result": res}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


# ---------------------------------------------------------------------------
# 10. Desktop Assistant Integrations: Clipboard, Notify, Scheduler
# ---------------------------------------------------------------------------
def get_clipboard() -> dict[str, Any]:
    """Read desktop system clipboard text using wl-paste or xclip."""
    for cmd in (["wl-paste"], ["xclip", "-o", "-selection", "clipboard"]):
        if shutil.which(cmd[0]):
            try:
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=2)
                if proc.returncode == 0:
                    return {"success": True, "text": proc.stdout.strip()}
            except Exception:
                pass
    return {"success": False, "text": "", "error": "Clipboard empty or tool not available"}


def set_clipboard(text: str) -> dict[str, Any]:
    """Write text to desktop system clipboard using wl-copy or xclip."""
    clean_text = text.strip()
    for cmd in (["wl-copy"], ["xclip", "-selection", "clipboard"]):
        if shutil.which(cmd[0]):
            try:
                proc = subprocess.run(cmd, input=clean_text, text=True, timeout=2)
                if proc.returncode == 0:
                    return {"success": True, "text": clean_text}
            except Exception:
                pass
    return {"success": False, "error": "Clipboard utility not available"}


def send_desktop_notification(title: str, message: str, urgency: str = "normal") -> dict[str, Any]:
    """Send native desktop notification banner."""
    if shutil.which("notify-send"):
        try:
            subprocess.run(
                ["notify-send", title, message, "-u", urgency, "-i", "rhiona"],
                timeout=3,
            )
            return {"success": True, "title": title, "message": message}
        except Exception as exc:
            return {"success": False, "error": str(exc)}
    return {"success": False, "error": "notify-send not installed"}


def get_scheduler_tasks() -> dict[str, Any]:
    """Read all persistent reminders and autonomous tasks."""
    try:
        from backend.agent.scheduler import load_reminders
        return {"success": True, "tasks": load_reminders()}
    except Exception as exc:
        return {"success": False, "tasks": [], "error": str(exc)}


def add_scheduler_task(
    title: str,
    time_spec: str = "+15m",
    action: str = "notify",
    recurring: str = "once",
    goal: str | None = None,
    priority: str = "HIGH",
) -> dict[str, Any]:
    """Add a new scheduled reminder or autonomous mission."""
    try:
        from backend.agent.scheduler import add_reminder
        return add_reminder(title, time_spec, action=action, recurring=recurring, goal=goal, priority=priority)
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def delete_scheduler_task(task_id: str) -> dict[str, Any]:
    """Delete a reminder or task by ID."""
    try:
        from backend.agent.scheduler import delete_reminder
        return delete_reminder(task_id)
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def check_scheduler_due() -> dict[str, Any]:
    """Check and trigger any due reminders or autonomous missions."""
    try:
        from backend.agent.scheduler import check_and_trigger_due
        triggered = check_and_trigger_due()
        return {"success": True, "triggered": triggered, "count": len(triggered)}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


# ---------------------------------------------------------------------------
# CLI Dispatcher
# ---------------------------------------------------------------------------
def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No action specified"}))
        sys.exit(1)

    action = sys.argv[1].lower()

    if action == "health":
        print(json.dumps(get_system_health()))
    elif action == "search":
        q = sys.argv[2] if len(sys.argv) > 2 else ""
        print(json.dumps(search_web(q)))
    elif action == "scrape":
        url = sys.argv[2] if len(sys.argv) > 2 else ""
        print(json.dumps(scrape_web(url)))
    elif action in ("media_status", "media_info"):
        print(json.dumps(get_media_status()))
    elif action == "media":
        cmd = sys.argv[2] if len(sys.argv) > 2 else "status"
        print(json.dumps(control_media(cmd)))
    elif action == "shell":
        cmd = sys.argv[2] if len(sys.argv) > 2 else "uptime"
        print(json.dumps(run_shell(cmd)))
    elif action in ("memory_graph", "memory_list", "memory_get"):
        print(json.dumps(get_memory_graph()))
    elif action == "memory_add":
        s = sys.argv[2] if len(sys.argv) > 2 else "notes"
        r = sys.argv[3] if len(sys.argv) > 3 else "general"
        t = sys.argv[4] if len(sys.argv) > 4 else ""
        print(json.dumps(add_memory_fact(s, r, t)))
    elif action == "screen":
        print(json.dumps(capture_screen()))
    elif action == "vision_analyze":
        prompt = sys.argv[2] if len(sys.argv) > 2 else "Describe what is on screen."
        print(json.dumps(analyze_screen(prompt)))
    elif action == "agent_plan":
        goal = sys.argv[2] if len(sys.argv) > 2 else ""
        print(json.dumps(agent_plan(goal)))
    elif action == "agent_execute":
        goal = sys.argv[2] if len(sys.argv) > 2 else ""
        print(json.dumps(agent_execute(goal)))
    elif action == "open_app":
        app = sys.argv[2] if len(sys.argv) > 2 else ""
        print(json.dumps(open_application(app)))
    elif action in ("browser", "browser_control"):
        sub_act = sys.argv[2] if len(sys.argv) > 2 else "search"
        raw_params = sys.argv[3] if len(sys.argv) > 3 else "{}"
        try:
            p = json.loads(raw_params) if raw_params.startswith("{") else {"query": raw_params}
        except Exception:
            p = {"query": raw_params}
        print(json.dumps(browser_action(sub_act, p)))
    elif action == "contacts":
        q = sys.argv[2] if len(sys.argv) > 2 else ""
        print(json.dumps(search_contacts(q)))
    elif action in ("whatsapp", "whatsapp_send", "send_whatsapp"):
        rec = sys.argv[2] if len(sys.argv) > 2 else ""
        msg = sys.argv[3] if len(sys.argv) > 3 else ""
        print(json.dumps(send_whatsapp_message(rec, msg)))
    elif action in ("fan_status", "fan_info"):
        print(json.dumps(get_fan_status()))
    elif action == "fan":
        mode = sys.argv[2] if len(sys.argv) > 2 else "status"
        # Prefer the environment: argv is world-readable in `ps`, so the sudo
        # password must never be passed as a command-line argument.
        pwd = os.environ.get("RHIONA_FAN_PASSWORD") or (sys.argv[3] if len(sys.argv) > 3 else None)
        print(json.dumps(set_fan_mode(mode, password=pwd)))
    elif action == "clipboard_get":
        print(json.dumps(get_clipboard()))
    elif action == "clipboard_set":
        txt = sys.argv[2] if len(sys.argv) > 2 else ""
        print(json.dumps(set_clipboard(txt)))
    elif action == "notify":
        t = sys.argv[2] if len(sys.argv) > 2 else "RHIONA"
        m = sys.argv[3] if len(sys.argv) > 3 else "Notification"
        print(json.dumps(send_desktop_notification(t, m)))
    elif action in ("reminders_list", "reminders", "tasks_list"):
        print(json.dumps(get_scheduler_tasks()))
    elif action in ("reminders_add", "tasks_add"):
        title = sys.argv[2] if len(sys.argv) > 2 else "Reminder"
        ts = sys.argv[3] if len(sys.argv) > 3 else "+15m"
        act = sys.argv[4] if len(sys.argv) > 4 else "notify"
        rec = sys.argv[5] if len(sys.argv) > 5 else "once"
        gl = sys.argv[6] if len(sys.argv) > 6 else None
        print(json.dumps(add_scheduler_task(title, ts, action=act, recurring=rec, goal=gl)))
    elif action in ("reminders_delete", "tasks_delete"):
        tid = sys.argv[2] if len(sys.argv) > 2 else ""
        print(json.dumps(delete_scheduler_task(tid)))
    elif action in ("reminders_check", "tasks_check"):
        print(json.dumps(check_scheduler_due()))
    else:
        print(json.dumps({"error": f"Unknown action: {action}"}))


if __name__ == "__main__":
    main()

