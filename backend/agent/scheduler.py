import json
import os
import sys
import time
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
REMINDERS_FILE = PROJECT_ROOT / "backend" / "memory" / "reminders.json"


def _ensure_store():
    REMINDERS_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not REMINDERS_FILE.exists():
        with open(REMINDERS_FILE, "w", encoding="utf-8") as f:
            json.dump([], f)


def load_reminders() -> list[dict[str, Any]]:
    """Load all persistent reminders and autonomous scheduled tasks."""
    _ensure_store()
    try:
        with open(REMINDERS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception:
        return []


def save_reminders(reminders: list[dict[str, Any]]) -> None:
    """Save reminders array to persistent JSON store."""
    _ensure_store()
    with open(REMINDERS_FILE, "w", encoding="utf-8") as f:
        json.dump(reminders, f, indent=2)


def add_reminder(
    title: str,
    scheduled_time: str,
    action: str = "notify",
    recurring: str = "once",
    goal: str | None = None,
    priority: str = "HIGH",
) -> dict[str, Any]:
    """
    Create a new scheduled reminder or autonomous agent task.
    scheduled_time formats:
      - 'HH:MM' (e.g. '13:00' for today or daily)
      - '+Nm' or '+Nh' (e.g. '+15m' for in 15 minutes)
      - ISO timestamp (e.g. '2026-09-04T13:00:00')
    """
    now = datetime.now()
    clean_time = scheduled_time.strip()

    # Parse relative time (+10m, +1h, 10m, etc.)
    target_dt: datetime | None = None
    if clean_time.startswith("+") or clean_time.endswith("m") or clean_time.endswith("h"):
        clean_rel = clean_time.lstrip("+").strip()
        if clean_rel.endswith("m"):
            mins = int(clean_rel[:-1].strip())
            target_dt = now + timedelta(minutes=mins)
        elif clean_rel.endswith("h"):
            hrs = int(clean_rel[:-1].strip())
            target_dt = now + timedelta(hours=hrs)
        elif clean_rel.isdigit():
            target_dt = now + timedelta(minutes=int(clean_rel))

    # Parse HH:MM (e.g. 13:00 or 1:30 PM)
    if not target_dt:
        for fmt in ("%H:%M", "%I:%M %p", "%I:%M%p"):
            try:
                parsed = datetime.strptime(clean_time, fmt)
                target_dt = now.replace(hour=parsed.hour, minute=parsed.minute, second=0, microsecond=0)
                if target_dt <= now and recurring != "daily":
                    # If time already passed today, assume tomorrow
                    target_dt += timedelta(days=1)
                break
            except ValueError:
                pass

    # Parse full ISO timestamp
    if not target_dt:
        try:
            target_dt = datetime.fromisoformat(clean_time)
        except Exception:
            # Fallback to in 10 minutes if parsing failed
            target_dt = now + timedelta(minutes=10)

    item_id = f"task-{int(time.time())}-{len(load_reminders()) + 1}"
    item = {
        "id": item_id,
        "title": title.strip(),
        "action": "execute_agent" if action in ("execute_agent", "auto", "agent", "task") else "notify",
        "recurring": "daily" if recurring.lower() in ("daily", "repeat") else "once",
        "scheduled_iso": target_dt.isoformat(),
        "scheduled_display": target_dt.strftime("%I:%M %p") if target_dt.date() == now.date() else target_dt.strftime("%b %d %I:%M %p"),
        "goal": goal.strip() if goal else title.strip(),
        "priority": priority.upper() if priority.upper() in ("CRITICAL", "HIGH", "ROUTINE") else "HIGH",
        "status": "scheduled",
        "created_at": now.isoformat(),
        "last_triggered": None,
    }

    reminders = load_reminders()
    reminders.append(item)
    save_reminders(reminders)
    return {"success": True, "item": item}


def delete_reminder(item_id: str) -> dict[str, Any]:
    """Delete a reminder by ID."""
    reminders = load_reminders()
    initial_len = len(reminders)
    reminders = [r for r in reminders if r.get("id") != item_id]
    save_reminders(reminders)
    return {"success": len(reminders) < initial_len, "deleted_id": item_id}


def trigger_single_item(item: dict[str, Any]) -> dict[str, Any]:
    """Execute the notification or agent action for an item."""
    title = item.get("title", "Rhiona Scheduled Task")
    action = item.get("action", "notify")
    goal = item.get("goal") or title

    now_iso = datetime.now().isoformat()
    item["last_triggered"] = now_iso

    # 1. Sound Alert via Linux pulse/pipewire
    sound_files = [
        "/usr/share/sounds/freedesktop/stereo/alarm-clock-elapsed.oga",
        "/usr/share/sounds/freedesktop/stereo/bell.oga",
        "/usr/share/sounds/freedesktop/stereo/complete.oga",
    ]
    sound_file = next((f for f in sound_files if os.path.exists(f)), None)
    if sound_file:
        for player in ("pw-play", "paplay", "canberra-gtk-play -f"):
            try:
                cmd = f"{player} '{sound_file}'"
                subprocess.Popen(cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                break
            except Exception:
                pass

    # 2. Native Linux Desktop Notification
    try:
        urgency = "critical" if item.get("priority") == "CRITICAL" else "normal"
        subtitle = "Autonomous Mission Execution" if action == "execute_agent" else "Scheduled Reminder"
        subprocess.run(
            ["notify-send", f"RHIONA // {subtitle}", title, "-u", urgency, "-i", "appointment-soon"],
            timeout=3,
        )
    except Exception:
        pass

    # 3. Autonomous Execution if it's an agent task
    agent_output = None
    if action == "execute_agent":
        try:
            from backend.agent.executor import AgentExecutor
            executor = AgentExecutor()
            agent_output = executor.execute(goal)
            subprocess.run(
                ["notify-send", "RHIONA // MISSION COMPLETE", f"Task '{title}' finished: {str(agent_output)[:80]}", "-u", "normal"],
                timeout=3,
            )
        except Exception as exc:
            agent_output = f"Execution error: {exc}"

    # Update item status
    if item.get("recurring") == "daily":
        try:
            old_dt = datetime.fromisoformat(item["scheduled_iso"])
            next_dt = old_dt + timedelta(days=1)
            item["scheduled_iso"] = next_dt.isoformat()
            item["scheduled_display"] = next_dt.strftime("%I:%M %p")
            item["status"] = "scheduled"
        except Exception:
            item["status"] = "completed"
    else:
        item["status"] = "completed"

    item["last_result"] = agent_output
    return {"success": True, "item": item, "result": agent_output}


def check_and_trigger_due() -> list[dict[str, Any]]:
    """Scan all scheduled tasks and execute those that are due."""
    reminders = load_reminders()
    now = datetime.now()
    triggered = []
    modified = False

    for item in reminders:
        if item.get("status") != "scheduled":
            continue

        try:
            sched_dt = datetime.fromisoformat(item["scheduled_iso"])
            if sched_dt <= now:
                res = trigger_single_item(item)
                triggered.append(res)
                modified = True
        except Exception:
            continue

    if modified:
        save_reminders(reminders)

    return triggered
