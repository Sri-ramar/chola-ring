# actions/reminder.py
from typing import Any
from backend.agent.scheduler import add_reminder, load_reminders


def reminder(
    parameters: dict,
    response: str | None = None,
    player=None,
    session_memory=None
) -> str:
    """
    Sets a timed reminder or scheduled autonomous task using Rhiona's native scheduler.
    parameters:
        - message / title (str)
        - time (str) e.g. "13:00", "+15m", "12:30 PM"
        - date (str, optional) YYYY-MM-DD
        - action (str, optional) "notify" | "execute_agent"
        - recurring (str, optional) "once" | "daily"
    """
    message = (
        parameters.get("message")
        or parameters.get("title")
        or parameters.get("task")
        or "Scheduled Reminder"
    ).strip()

    time_str = parameters.get("time") or parameters.get("scheduled_time") or "+15m"
    date_str = parameters.get("date")
    if date_str and time_str and not time_str.startswith("+"):
        time_spec = f"{date_str}T{time_str}:00"
    else:
        time_spec = time_str

    action = parameters.get("action", "notify")
    recurring = parameters.get("recurring", "once")
    priority = parameters.get("priority", "HIGH")
    goal = parameters.get("goal") or message

    res = add_reminder(
        title=message,
        scheduled_time=time_spec,
        action=action,
        recurring=recurring,
        goal=goal,
        priority=priority,
    )

    if res.get("success"):
        item = res["item"]
        display = item.get("scheduled_display", time_spec)
        kind = "Autonomous task" if item.get("action") == "execute_agent" else "Reminder"
        repeat_str = " (daily)" if item.get("recurring") == "daily" else ""
        return f"{kind} set for {display}{repeat_str}: '{message}'."
    return f"Failed to schedule reminder: {res.get('error', 'Unknown error')}"