import json
import os
import re
import sys
from pathlib import Path

import logging

logger = logging.getLogger("planner")


def get_base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return Path(__file__).resolve().parent.parent


BASE_DIR        = get_base_dir()
API_CONFIG_PATH = BASE_DIR / "config" / "api_keys.json"


def _get_api_key() -> str:
    # api_keys.json stores this as "openrouter_api_key"; older configs used
    # "open_router_key". Accept both so the planner is not silently keyless.
    try:
        if API_CONFIG_PATH.exists():
            with open(API_CONFIG_PATH, "r") as f:
                data = json.load(f)
            for name in ("openrouter_api_key", "open_router_key"):
                key = str(data.get(name, "") or "").strip()
                if key:
                    return key
    except Exception:
        pass
    return os.environ.get("OPENROUTER_API_KEY", "").strip()



PLANNER_PROMPT = """You are the tactical planning module of Rhiona, an autonomous AI desktop companion.
Your job: break any user goal into a sequence of steps using ONLY the tools listed below.

RULES:
- NEVER reference previous step results in parameters. Every step is independent.
- When the user wants you to write code, automate something, or do something that requires custom logic, use generated_code.
- Use web_search for ANY information retrieval, research, or current data.
- Use system_health for ANY question about CPU/GPU/RAM temperature, fan speed, system load, battery, uptime or hardware status. It takes no parameters and returns live readings.
- Use file_controller to save content to disk.
- Use cmd_control to open files or run system commands.
- Max 5 steps. Use the minimum steps needed.

AVAILABLE TOOLS AND THEIR PARAMETERS:

open_app
  app_name: string (required)

web_search
  query: string (required) — write a clear, focused search query
  mode: "search" or "compare" (optional, default: search)
  items: list of strings (optional, for compare mode)
  aspect: string (optional, for compare mode)

system_health
  (no parameters) — live CPU load and temperature, GPU load/temperature/VRAM, RAM usage, battery state, fan RPM, uptime

game_updater
  action: "update" | "install" | "list" | "download_status" | "schedule" (required)
  platform: "steam" | "epic" | "both" (optional, default: both)
  game_name: string (optional)
  app_id: string (optional)
  shutdown_when_done: boolean (optional)

browser_control
  action: "go_to" | "search" | "click" | "type" | "scroll" | "get_text" | "press" | "send_whatsapp" | "agent" | "close" (required)
  url: string (for go_to)
  query: string (for search)
  text: string (for click/type)
  direction: "up" | "down" (for scroll)
  receiver: string (for send_whatsapp — contact name)
  message_text: string (for send_whatsapp — message to send)
  task: string (for agent) — natural language description of a multi-step browser task. Use for form filling, shopping, or any complex browser interaction that is NOT messaging.

file_controller
  action: "write" | "create_file" | "read" | "list" | "delete" | "move" | "copy" | "find" | "disk_usage" (required)
  path: string — use "desktop" for Desktop folder
  name: string — filename
  content: string — file content (for write/create_file)

cmd_control
  task: string (required) — natural language description of what to do
  visible: boolean (optional)

computer_settings
  action: string (required)
  description: string — natural language description
  value: string (optional)

computer_control
  action: "type" | "click" | "hotkey" | "press" | "scroll" | "screenshot" | "screen_find" | "screen_click" (required)
  text: string (for type)
  x, y: int (for click)
  keys: string (for hotkey, e.g. "ctrl+c")
  key: string (for press)
  direction: "up" | "down" (for scroll)
  description: string (for screen_find/screen_click)

screen_process
  text: string (required) — what to analyze or ask about the screen
  angle: "screen" | "camera" (optional)

send_message
  receiver: string (required)
  message_text: string (required)
  platform: string (required)

reminder
  time: string (required) — e.g. "13:00", "+15m", "12:30 PM", or ISO time
  message: string (required) — what to remind or autonomous mission to execute
  action: "notify" | "execute_agent" (optional, default: notify)
  recurring: "once" | "daily" (optional, default: once)

clipboard
  action: "read" | "write" (required)
  text: string (optional, for write action)

desktop_notification
  title: string (required)
  message: string (required)

fan_control
  mode: "max" | "auto" | "status" (required)

desktop_control
  action: "wallpaper" | "organize" | "clean" | "list" | "task" (required)
  path: string (optional)
  task: string (optional)

youtube_video
  action: "play" | "summarize" | "trending" (required)
  query: string (for play)

weather_report
  city: string (required)

flight_finder
  origin: string (required)
  destination: string (required)
  date: string (required)

code_helper
  action: "write" | "edit" | "run" | "explain" (required)
  description: string (required)
  language: string (optional)
  output_path: string (optional)
  file_path: string (optional)

dev_agent
  description: string (required)
  language: string (optional)

generated_code
  description: string (required) — clear description of what the code should do
EXAMPLES:

Goal: "research mechanical engineering and save it to a notepad file"
Steps:

web_search | query: "mechanical engineering overview definition history"
web_search | query: "mechanical engineering applications and future trends"
file_controller | action: write, path: desktop, name: mechanical_engineering.txt, content: "MECHANICAL ENGINEERING RESEARCH\n\nThis file will be filled with web research results."
cmd_control | task: "open mechanical_engineering.txt on desktop with notepad"

Goal: "What is the price of Bitcoin"
Steps:

web_search | query: "Bitcoin price today USD"

Goal: "List the files on the desktop and find the largest 5 files"
Steps:

file_controller | action: list, path: desktop
file_controller | action: largest, path: desktop, count: 5

Goal: "Install PUBG from Steam"
Steps:

game_updater | action: install, platform: steam, game_name: "PUBG"

Goal: "Update all my Steam games"
Steps:

game_updater | action: update, platform: steam

Goal: "Send John a message on WhatsApp saying there is a meeting tomorrow"
Steps:

browser_control | action: send_whatsapp, receiver: John, message_text: "There is a meeting tomorrow"

Goal: "Book a hotel in Paris for next weekend"
Steps:

web_search | query: "best hotels in Paris booking deals next weekend"
browser_control | action: agent, task: "Open the first hotel booking link and fill in the search form with destination Paris, check-in next Friday, check-out Sunday, 1 room, 2 adults"

Goal: "Open the clock and set a reminder for 30 minutes later"
Steps:

reminder | date: [today], time: [now+30min], message: "Reminder"

OUTPUT — return ONLY valid JSON, no markdown, no explanation, no code blocks:
{
  "goal": "...",
  "steps": [
    {
      "step": 1,
      "tool": "tool_name",
      "description": "what this step does",
      "parameters": {},
      "critical": true
    }
  ]
}
"""


KNOWN_TOOLS = {
    "open_app", "web_search", "system_health", "game_updater", "browser_control",
    "file_controller", "cmd_control", "code_helper", "dev_agent", "screen_process",
    "send_message", "reminder", "youtube_video", "weather_report", "computer_settings",
    "desktop_control", "computer_control", "flight_finder", "clipboard",
    "clipboard_control", "desktop_notification", "fan_control", "generated_code",
}

# Small local models routinely invent plausible-but-nonexistent tool names.
# Map the common ones onto real tools instead of letting execution fall through
# to generated_code (which can execute arbitrary Python).
TOOL_ALIASES = {
    "health": "system_health",
    "system_status": "system_health",
    "system_health_check": "system_health",
    "check_health": "system_health",
    "telemetry": "system_health",
    "hardware_status": "system_health",
    "hardware_info": "system_health",
    "system_info": "system_health",
    "cpu_status": "system_health",
    "temperature": "system_health",
    "monitor": "system_health",
    "fan": "fan_control",
    "fans": "fan_control",
    "fan_speed": "fan_control",
    "notify": "desktop_notification",
    "notification": "desktop_notification",
    "search": "web_search",
    "web": "web_search",
    "google_search": "web_search",
    "shell": "cmd_control",
    "terminal": "cmd_control",
    "command": "cmd_control",
    "run_command": "cmd_control",
    "vision": "screen_process",
    "screenshot": "screen_process",
    "screen": "screen_process",
    "analyze_screen": "screen_process",
    "weather": "weather_report",
    "youtube": "youtube_video",
    "message": "send_message",
    "whatsapp": "send_message",
    "open": "open_app",
    "launch_app": "open_app",
    "file": "file_controller",
    "files": "file_controller",
    "clipboard_read": "clipboard",
    "custom_code": "generated_code",
    "python": "generated_code",
    "code": "generated_code",
    "settings": "computer_settings",
    "desktop": "desktop_control",
    "mouse_keyboard": "computer_control",
    "browser": "browser_control",
    "flight_search": "flight_finder",
    "game": "game_updater",
}


def _infer_tool(goal: str) -> str:
    """Best-effort tool choice for a step whose tool name the model invented."""
    text = goal.lower()
    if any(k in text for k in (
        "temperature", "temp", "fan", "cpu", "gpu", "ram", "memory",
        "battery", "disk", "load", "uptime", "overheat",
    )):
        return "system_health"
    if any(k in text for k in ("open ", "launch", "start ")):
        return "open_app"
    return "web_search"


def _sanitize_plan(plan: dict, goal: str) -> dict:
    """Rewrite aliased or invented tool names so every step can actually execute."""
    steps = plan.get("steps")
    if not isinstance(steps, list):
        return plan

    repairs = []
    for index, step in enumerate(steps):
        if not isinstance(step, dict):
            continue
        raw = str(step.get("tool", "")).strip().lower()
        tool = TOOL_ALIASES.get(raw, raw)
        if tool not in KNOWN_TOOLS:
            tool = _infer_tool(goal)
            repairs.append(f"{raw or '(missing)'} -> {tool}")
        step["tool"] = tool
        step.setdefault("step", index + 1)
        if not isinstance(step.get("parameters"), dict):
            step["parameters"] = {}

    if repairs:
        logger.warning(f"[Planner] Repaired unknown tools: {', '.join(repairs)}")
    return plan


def create_plan(goal: str, context: str = "") -> dict:
    from backend.agent.local_model import generate_local

    user_input = f"Goal: {goal}"
    if context:
        user_input += f"\n\nContext: {context}"

    try:
        text = generate_local(user_input, PLANNER_PROMPT, response_format="json")
        text = re.sub(r"```(?:json)?", "", text).strip().rstrip("`").strip()
        plan = json.loads(text)
        if "steps" not in plan or not isinstance(plan["steps"], list):
            raise ValueError("Invalid plan structure")
        plan = _sanitize_plan(plan, goal)
        logger.info(f"[Planner] Plan: {len(plan['steps'])} steps")
        return plan
    except json.JSONDecodeError as e:
        logger.error(f"[Planner] JSON parse failed: {e}")
        return _fallback_plan(goal)
    except Exception as e:
        logger.error(f"[Planner] Planning failed: {e}")
        return _fallback_plan(goal)


def _fallback_plan(goal: str) -> dict:
    logger.info("[Planner] Using fallback plan")
    goal_lower = goal.lower().strip()
    
    # 1. Play on YouTube fallback
    if "play" in goal_lower and ("on youtube" in goal_lower or "youtube" in goal_lower or len(goal_lower.split()) > 1):
        query = goal_lower.replace("play on youtube", "").replace("play", "").replace("on youtube", "").replace("youtube", "").strip()
        return {
            "goal": goal,
            "steps": [
                {
                    "step": 1,
                    "tool": "youtube_video",
                    "description": f"Play video/music on YouTube: {query}",
                    "parameters": {"action": "play", "query": query},
                    "critical": True
                }
            ]
        }
        
    # 2. Adjust volume/settings fallback
    if any(k in goal_lower for k in ["volume", "mute", "brightness"]):
        action = "volume_up"
        if "down" in goal_lower:
            action = "volume_down"
        elif "mute" in goal_lower:
            action = "mute"
        elif "brightness" in goal_lower:
            action = "brightness"
            
        return {
            "goal": goal,
            "steps": [
                {
                    "step": 1,
                    "tool": "computer_settings",
                    "description": f"Adjust system settings: {goal}",
                    "parameters": {"action": action, "description": goal},
                    "critical": True
                }
            ]
        }
        
    # 3. Screenshot fallback
    if "screenshot" in goal_lower:
        return {
            "goal": goal,
            "steps": [
                {
                    "step": 1,
                    "tool": "computer_control",
                    "description": "Take a screenshot",
                    "parameters": {"action": "screenshot"},
                    "critical": True
                }
            ]
        }
        
    # Default: search
    return {
        "goal": goal,
        "steps": [
            {
                "step": 1,
                "tool": "web_search",
                "description": f"Search for: {goal}",
                "parameters": {"query": goal},
                "critical": True
            }
        ]
    }


def replan(goal: str, completed_steps: list, failed_step: dict, error: str) -> dict:
    from backend.agent.local_model import generate_local

    completed_summary = "\n".join(
        f"  - Step {s['step']} ({s['tool']}): DONE" for s in completed_steps
    )

    prompt = f"""Goal: {goal}

Already completed:
{completed_summary if completed_summary else '  (none)'}

Failed step: [{failed_step.get('tool')}] {failed_step.get('description')}
Error: {error}

Create a REVISED plan for the remaining work only. Do not repeat completed steps."""

    try:
        text = generate_local(prompt, PLANNER_PROMPT, response_format="json")
        text = re.sub(r"```(?:json)?", "", text).strip().rstrip("`").strip()
        plan = json.loads(text)
        plan = _sanitize_plan(plan, goal)
        logger.info(f"[Planner] Revised plan: {len(plan['steps'])} steps")
        return plan
    except Exception as e:
        logger.error(f"[Planner] Replan failed: {e}")
        return _fallback_plan(goal)
