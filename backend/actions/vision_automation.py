import os
import json
import time

import pyautogui

from backend.vision import _nvidia_vision
from backend.actions.browser_control import browser_control, _bt, _ensure_started

pyautogui.FAILSAFE = True


def _screenshot() -> bytes:
    import subprocess, tempfile, os
    tmp = os.path.join(tempfile.gettempdir(), "rhiona_screenshot.png")
    try:
        os.unlink(tmp)
    except FileNotFoundError:
        pass
    result = subprocess.run(
        ["spectacle", "-b", "-o", tmp],
        capture_output=True, timeout=15
    )
    if result.returncode == 0 and os.path.isfile(tmp):
        with open(tmp, "rb") as f:
            data = f.read()
        os.unlink(tmp)
        if len(data) > 100:
            return data
    try:
        with open(tmp, "rb") as f:
            data = f.read()
        os.unlink(tmp)
        if len(data) > 100:
            return data
    except Exception:
        pass
    raise RuntimeError("Could not take screenshot (spectacle failed)")


def _extract_browser_window() -> tuple[int, int, int, int]:
    import subprocess, re
    try:
        result = subprocess.run(
            ["wmctrl", "-l", "-G"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            for line in result.stdout.strip().split("\n"):
                parts = line.split(None, 7)
                if len(parts) >= 6:
                    x, y, w, h = int(parts[2]), int(parts[3]), int(parts[4]), int(parts[5])
                    name = parts[-1].lower() if len(parts) > 6 else ""
                    if any(p in name for p in
                           ["chrome", "chromium", "firefox", "browser", "obscura"]):
                        if w > 200 and h > 200:
                            return (x, y, w, h)
    except Exception:
        pass
    return (0, 0, 1920, 1080)


def fill_current_form(
    intent: str = "",
    context: str = "",
) -> str:
    time.sleep(1)
    screenshot_bytes = _screenshot()
    win_x, win_y, win_w, win_h = _extract_browser_window()

    user_intent = intent or "fill this form with reasonable data"
    vision_prompt = (
        f"You are controlling a computer via mouse and keyboard. "
        f"The user wants to: {user_intent}\n"
        f"User context: {context or 'Not provided'}\n\n"
        f"Here is a screenshot of the current screen "
        f"(screen resolution: {win_w}x{win_h}).\n\n"
        "Analyze the screenshot and return a JSON array of actions to perform. "
        "Each action must be one of:\n"
        '  - {"action": "click", "x": <int>, "y": <int>, "desc": "<what>"}\n'
        '  - {"action": "type", "text": "<value>", "desc": "<what>"}\n'
        '  - {"action": "wait", "ms": <milliseconds>}\n'
        '  - {"action": "key", "key": "<key_name>", "desc": "<what>"}\n'
        '  - {"action": "scroll", "clicks": <int>, "desc": "<what>"}\n\n'
        "Rules:\n"
        "- Coordinates (x, y) must be absolute screen coordinates.\n"
        "- For typing into a field: click the field first, then type the value.\n"
        "- Use 'Tab' key to move between fields when appropriate.\n"
        "- For dropdowns: click to open, then click the option.\n"
        "- For checkboxes/radios: click on them directly.\n"
        "- For submit buttons: click on the button.\n"
        "- Use sensible placeholder data for fields where the user hasn't provided a value.\n"
        "- Make reasonable guesses about coordinates based on the visual layout.\n"
        "- Return ONLY valid JSON array, no other text."
    )

    try:
        vision_result = _nvidia_vision(vision_prompt, screenshot_bytes)
    except Exception as e:
        return f"NVIDIA Vision failed: {e}"

    return _execute_vision_actions(vision_result)


def _execute_vision_actions(vision_result: str) -> str:
    clean = vision_result.strip()
    if clean.startswith("```"):
        clean = clean.split("\n", 1)[-1]
        clean = clean.rsplit("```", 1)[0].strip()

    try:
        actions = json.loads(clean)
        if isinstance(actions, dict) and "actions" in actions:
            actions = actions["actions"]
        elif not isinstance(actions, list):
            actions = [actions]
    except json.JSONDecodeError:
        return f"Vision returned invalid JSON: {vision_result[:300]}"

    results = []
    for i, step in enumerate(actions):
        action = step.get("action", "")
        desc = step.get("desc", "")
        try:
            if action == "click":
                x, y = int(step["x"]), int(step["y"])
                pyautogui.moveTo(x, y, duration=0.3)
                pyautogui.click()
                results.append(f"✓ Clicked {desc or f'({x},{y})'}")
                time.sleep(0.5)

            elif action == "type":
                text = step.get("text", "")
                pyautogui.typewrite(text, interval=0.05)
                results.append(f"✓ Typed '{text[:30]}' ({desc})")
                time.sleep(0.3)

            elif action == "key":
                key = step.get("key", "Tab")
                pyautogui.press(key)
                results.append(f"✓ Key: {key} ({desc})")
                time.sleep(0.3)

            elif action == "wait":
                time.sleep(step.get("ms", 1000) / 1000)
                results.append(f"✓ Waited")

            elif action == "scroll":
                clicks = step.get("clicks", 1)
                pyautogui.scroll(clicks)
                results.append(f"✓ Scrolled {clicks} clicks")
                time.sleep(0.5)

            else:
                results.append(f"? Unknown action: {action}")

        except Exception as e:
            results.append(f"✗ Step {i} ({desc}): {e}")
            break

    return "\n".join(results)


def computer_use(
    url: str,
    intent: str,
    context: str = "",
    headless: bool = False,
) -> str:
    if headless:
        from backend.actions.form_filler import fill_from_intent
        return fill_from_intent(url, intent, context)

    _ensure_started()
    browser_control({"action": "go_to", "url": url})
    time.sleep(2)

    screenshot_bytes = _screenshot()
    win_x, win_y, win_w, win_h = _extract_browser_window()

    vision_prompt = (
        f"You are controlling a computer via mouse and keyboard. "
        f"The user wants to: {intent}\n"
        f"User context: {context or 'Not provided'}\n\n"
        f"Here is a screenshot of the current browser window "
        f"(window position: {win_x},{win_y}, size: {win_w}x{win_h}).\n\n"
        "Analyze the screenshot and return a JSON array of actions to perform. "
        "Each action must be one of:\n"
        '  - {"action": "click", "x": <int>, "y": <int>, "desc": "<what>"}\n'
        '  - {"action": "type", "text": "<value>", "desc": "<what>"}\n'
        '  - {"action": "wait", "ms": <milliseconds>}\n'
        '  - {"action": "key", "key": "<key_name>", "desc": "<what>"}\n'
        '  - {"action": "scroll", "clicks": <int>, "desc": "<what>"}\n\n'
        "Rules:\n"
        "- Coordinates (x, y) must be absolute screen coordinates.\n"
        "- For typing into a field: click the field first, then type the value.\n"
        "- Use 'Tab' key to move between fields when appropriate.\n"
        "- For dropdowns: click to open, then click the option.\n"
        "- For checkboxes/radios: click on them directly.\n"
        "- For submit buttons: click on the button.\n"
        "- Use sensible placeholder data for fields where the user hasn't provided a value.\n"
        "- Make reasonable guesses about coordinates based on the visual layout.\n"
        "- Return ONLY valid JSON array, no other text."
    )

    try:
        vision_result = _nvidia_vision(vision_prompt, screenshot_bytes)
    except Exception as e:
        return f"NVIDIA Vision failed: {e}"

    return _execute_vision_actions(vision_result)
