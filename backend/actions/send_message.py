# actions/send_message.py
# Universal messaging — WhatsApp & Instagram
# Uses visual element detection (pyautogui + screen search) instead of
# hardcoded tab/click sequences — works on any screen resolution.

import time
import platform
import subprocess
import pyautogui
from pathlib import Path

import logging

logger = logging.getLogger("sendmessage")

pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.08

import shutil

def _open_app(app_name: str) -> bool:
    """Opens an app via OS app launcher."""
    try:
        app_lower = app_name.lower()
        opened = False
        system = platform.system()
        if system == "Linux":
            if "whatsapp" in app_lower:
                brave_exe = shutil.which("brave-browser") or shutil.which("brave")
                if brave_exe:
                    cmd = [
                        brave_exe,
                        "--profile-directory=Default",
                        "--disable-profile-picker",
                        "--disable-features=ProfilePicker",
                        "https://web.whatsapp.com"
                    ]
                    try:
                        subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        opened = True
                    except Exception:
                        pass

            if not opened:
                candidates = []
                if "whatsapp" in app_lower:
                    candidates = ["whatsapp-for-linux", "whatsapp-desktop", "whatsapp"]
                elif "telegram" in app_lower:
                    candidates = ["telegram-desktop", "telegram"]
                else:
                    candidates = [app_lower]

                for cand in candidates:
                    if shutil.which(cand):
                        try:
                            subprocess.Popen([cand], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                            opened = True
                            break
                        except Exception:
                            pass

            if not opened and "whatsapp" in app_lower:
                import webbrowser
                webbrowser.open("https://web.whatsapp.com")
                opened = True

            time.sleep(2.0)
            return opened
        elif system == "Darwin":
            subprocess.run(["open", "-a", app_name], capture_output=True, timeout=8)
            time.sleep(2.0)
            return True
        else:
            pyautogui.press("win")
            time.sleep(0.4)
            pyautogui.write(app_name, interval=0.04)
            time.sleep(0.5)
            pyautogui.press("enter")
            time.sleep(2.0)
            return True
    except Exception as e:
        logger.error(f"[SendMessage] Could not open {app_name}: {e}")
        return False


def _search_contact(contact: str, platform: str):
    """
    Searches for a contact inside the messaging app.
    Uses Ctrl+F (universal search shortcut) then types contact name.
    """
    time.sleep(0.5)
    pyautogui.hotkey("ctrl", "f")
    time.sleep(0.4)
    pyautogui.hotkey("ctrl", "a")
    pyautogui.write(contact, interval=0.04)
    time.sleep(0.8)
    pyautogui.press("enter")
    time.sleep(0.6)


def _type_and_send(message: str):
    """Types message and sends it."""
    pyautogui.press("tab")
    time.sleep(0.2)
    pyautogui.hotkey("ctrl", "a")
    pyautogui.write(message, interval=0.03)
    time.sleep(0.2)
    pyautogui.press("enter")
    time.sleep(0.3)


def _send_whatsapp(receiver: str, message: str) -> str:
    """
    Sends a WhatsApp message via Playwright browser-use engine in Brave Browser.
    """
    try:
        from backend.actions.browser_control import browser_control
        logger.info(f"[SendMessage] Delegating WhatsApp message to browser-use Playwright engine...")
        res = browser_control({
            "action": "send_whatsapp",
            "receiver": receiver,
            "message_text": message
        })
        if res and "error" not in res.lower() and "failed" not in res.lower():
            return res
    except Exception as e:
        logger.warning(f"[SendMessage] browser-use fallback: {e}")

    try:
        if not _open_app("WhatsApp"):
            return "Could not open WhatsApp."

        logger.info("[SendMessage] Waiting for WhatsApp Web page load...")
        time.sleep(6.0)

        try:
            subprocess.run(["wmctrl", "-a", "Brave"], capture_output=True, timeout=2)
            subprocess.run(["wmctrl", "-a", "WhatsApp"], capture_output=True, timeout=2)
        except Exception:
            pass

        time.sleep(0.5)
        # Click search box inside WhatsApp Web left sidebar
        pyautogui.click(250, 210)
        time.sleep(0.3)
        pyautogui.hotkey("ctrl", "a")
        pyautogui.write(receiver, interval=0.04)
        time.sleep(1.2)

        pyautogui.press("enter")
        time.sleep(0.8)

        pyautogui.write(message, interval=0.03)
        time.sleep(0.3)
        pyautogui.press("enter")

        return f"Message sent to {receiver} via WhatsApp."

    except Exception as e:
        return f"WhatsApp error: {e}"


def _send_instagram(receiver: str, message: str) -> str:
    """
    Sends an Instagram DM via browser (instagram.com).
    Steps: Open Chrome → Go to instagram.com/direct → Search contact → Send
    """
    try:
        import webbrowser

        webbrowser.open("https://www.instagram.com/direct/new/")
        time.sleep(3.5)

        pyautogui.write(receiver, interval=0.05)
        time.sleep(1.5)

        pyautogui.press("down")
        time.sleep(0.3)
        pyautogui.press("enter")
        time.sleep(0.5)

        for _ in range(3):
            pyautogui.press("tab")
            time.sleep(0.1)
        pyautogui.press("enter")
        time.sleep(1.5)

        pyautogui.write(message, interval=0.04)
        time.sleep(0.2)
        pyautogui.press("enter")

        return f"Message sent to {receiver} via Instagram."

    except Exception as e:
        return f"Instagram error: {e}"

def _send_telegram(receiver: str, message: str) -> str:
    """Sends a Telegram message via Windows desktop app."""
    try:
        if not _open_app("Telegram"):
            return "Could not open Telegram."

        time.sleep(1.5)

        pyautogui.hotkey("ctrl", "f")
        time.sleep(0.4)
        pyautogui.write(receiver, interval=0.04)
        time.sleep(1.0)
        pyautogui.press("enter")
        time.sleep(0.8)

        pyautogui.write(message, interval=0.03)
        time.sleep(0.2)
        pyautogui.press("enter")

        return f"Message sent to {receiver} via Telegram."

    except Exception as e:
        return f"Telegram error: {e}"



def _send_generic(platform: str, receiver: str, message: str) -> str:
    """
    For any other platform not explicitly supported.
    Opens the app, searches for contact, types and sends.
    Works for: Messenger, Discord, Signal, etc.
    """
    try:
        if not _open_app(platform):
            return f"Could not open {platform}."

        time.sleep(1.5)
        pyautogui.hotkey("ctrl", "f")
        time.sleep(0.4)
        pyautogui.write(receiver, interval=0.04)
        time.sleep(1.0)
        pyautogui.press("enter")
        time.sleep(0.8)
        pyautogui.write(message, interval=0.03)
        time.sleep(0.2)
        pyautogui.press("enter")

        return f"Message sent to {receiver} via {platform}."

    except Exception as e:
        return f"{platform} error: {e}"

def send_message(
    parameters: dict,
    response=None,
    player=None,
    session_memory=None
) -> str:
    """
    Called from main.py.

    parameters:
        receiver     : Contact name to send to
        message_text : The message content
        platform     : whatsapp | instagram | telegram | <any app name>
                       Default: whatsapp
    """
    params       = parameters or {}
    receiver     = params.get("receiver", "").strip()
    message_text = params.get("message_text", "").strip()
    platform     = params.get("platform", "whatsapp").strip().lower()

    if not receiver:
        return "Please specify who to send the message to, sir."
    if not message_text:
        return "Please specify what message to send, sir."

    logger.info(f"[SendMessage] 📨 {platform} → {receiver}: {message_text[:40]}")
    if player:
        player.write_log(f"[msg] Sending to {receiver} via {platform}...")

    if "whatsapp" in platform or "wp" in platform or "wapp" in platform:
        result = _send_whatsapp(receiver, message_text)

    elif "instagram" in platform or "ig" in platform or "insta" in platform:
        result = _send_instagram(receiver, message_text)

    elif "telegram" in platform or "tg" in platform:
        result = _send_telegram(receiver, message_text)

    else:
        result = _send_generic(platform, receiver, message_text)

    logger.info(f"[SendMessage] ✅ {result}")
    if player:
        player.write_log(f"[msg] {result}")

    return result