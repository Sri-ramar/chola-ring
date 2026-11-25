import asyncio
import concurrent.futures
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

import logging
logger = logging.getLogger("browser")

_PROJECT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

_BRAVE_EXECUTABLES = ["brave-browser", "brave"]
_CHROME_EXECUTABLES = ["google-chrome", "google-chrome-stable", "chromium-browser", "chromium"]
_USER_DATA_DIRS = {
    "brave":          os.path.expanduser("~/.config/BraveSoftware/Brave-Browser"),
    "brave-browser":  os.path.expanduser("~/.config/BraveSoftware/Brave-Browser"),
    "google-chrome":  os.path.expanduser("~/.config/google-chrome"),
    "google-chrome-stable": os.path.expanduser("~/.config/google-chrome"),
    "chromium":       os.path.expanduser("~/.config/chromium"),
    "chromium-browser": os.path.expanduser("~/.config/chromium"),
}


def _get_default_browser_id() -> str:
    system = platform.system()
    try:
        if system == "Linux":
            result = subprocess.run(
                ["xdg-settings", "get", "default-web-browser"],
                capture_output=True, text=True, timeout=5
            )
            return result.stdout.strip().lower()
    except Exception:
        pass
    return ""


def _find_browser() -> tuple[str | None, str | None]:
    prog_id = _get_default_browser_id()

    all_browsers = _BRAVE_EXECUTABLES + _CHROME_EXECUTABLES
    for browser in all_browsers:
        if browser in prog_id:
            path = shutil.which(browser)
            if path:
                return browser, path

    for browser in all_browsers:
        path = shutil.which(browser)
        if path:
            return browser, path

    return None, None


class _BrowserSession:
    DEBUG_PORT = 9222

    def __init__(self):
        self._loop = None
        self._thread = None
        self._ready = threading.Event()

        self._browser_use_session = None
        self._playwright = None
        self._browser = None
        self._context = None
        self._page = None
        self._exe_name = None
        self._exe_path = None
        self._user_data_dir = None
        self._debug_port = None

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(
            target=self._run_loop, daemon=True, name="BrowserSessionThread"
        )
        self._thread.start()
        self._ready.wait(timeout=30)

    def _run_loop(self):
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        self._loop.run_until_complete(self._init())
        self._ready.set()
        self._loop.run_forever()

    async def _init(self):
        from playwright.async_api import async_playwright
        self._playwright = await async_playwright().start()

    def run(self, coro, timeout=60):
        if not self._loop:
            raise RuntimeError("BrowserSession not started.")
        future = asyncio.run_coroutine_threadsafe(coro, self._loop)
        return future.result(timeout=timeout)

    async def _get_exe_and_profile(self):
        self._exe_name, self._exe_path = _find_browser()
        if self._exe_name:
            self._user_data_dir = _USER_DATA_DIRS.get(self._exe_name)

    @staticmethod
    def _profile_locked(user_data_dir):
        if not user_data_dir or not os.path.isdir(user_data_dir):
            return False
        return os.path.exists(os.path.join(user_data_dir, "SingletonLock"))

    def _cdp_url(self) -> str:
        port = self._debug_port or self.DEBUG_PORT
        return f"http://127.0.0.1:{port}"

    async def _launch_with_cdp(self, user_data_dir: str) -> int:
        """Launch the browser with remote debugging and return the CDP port."""
        proc = await asyncio.create_subprocess_exec(
            self._exe_path,
            "--remote-debugging-port=0",
            f"--user-data-dir={user_data_dir}",
            "--profile-directory=Default",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-profile-picker",
            "--disable-features=ProfilePicker",
            "--start-maximized",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )

        # Chromium prints "DevTools listening on ws://127.0.0.1:PORT" to stderr;
        # port 0 lets the OS pick a free port so we never collide with other apps.
        port = None
        deadline = time.monotonic() + 25
        while time.monotonic() < deadline:
            try:
                line = await asyncio.wait_for(proc.stderr.readline(), timeout=1)
            except asyncio.TimeoutError:
                continue
            if not line:
                break
            match = re.search(rb"DevTools listening on ws://127\.0\.0\.1:(\d+)", line)
            if match:
                port = int(match.group(1))
                break
        if not port:
            try:
                proc.terminate()
            except Exception:
                pass
            raise RuntimeError("Could not determine CDP port from browser output")
        return port

    async def _ensure_cdp_browser(self):
        if self._browser and self._browser.is_connected():
            return

        await self._get_exe_and_profile()

        # Try connecting to an existing CDP browser first (don't kill anything)
        try:
            self._browser = await self._playwright.chromium.connect_over_cdp(
                self._cdp_url(),
                timeout=5000,
            )
            logger.info(f"[Browser] Connected to existing browser via CDP ({self._exe_name})")
            return
        except Exception:
            logger.info("[Browser] No existing CDP browser found, launching a new one...")

        if not self._exe_path:
            raise RuntimeError("No browser executable found")

        # If the user's real profile is locked (browser already running), Chromium
        # would just hand off to the existing process and never open the debug port.
        # Fall back to a throwaway profile so CDP control still works.
        user_data_dir = self._user_data_dir
        if self._profile_locked(user_data_dir):
            import tempfile
            user_data_dir = tempfile.mkdtemp(prefix="maya-browser-")
            logger.info(f"[Browser] Profile in use — using temporary profile {user_data_dir}")

        self._debug_port = await self._launch_with_cdp(user_data_dir)
        self._user_data_dir = user_data_dir

        for i in range(15):
            try:
                self._browser = await self._playwright.chromium.connect_over_cdp(
                    f"http://127.0.0.1:{self._debug_port}",
                    timeout=5000,
                )
                logger.info(f"[Browser] Launched and connected via CDP ({self._exe_name}, port {self._debug_port})")
                return
            except Exception:
                if i < 14:
                    await asyncio.sleep(2)

        logger.warning("[Browser] CDP connection timed out, attempting direct Playwright launch...")
        try:
            self._browser = await self._playwright.chromium.launch(
                headless=False,
                executable_path=self._exe_path if self._exe_path and os.path.exists(self._exe_path) else None,
            )
            logger.info(f"[Browser] Launched directly via Playwright ({self._exe_name})")
            return
        except Exception as e:
            raise RuntimeError(f"Could not connect to browser via CDP or direct launch: {e}")

    async def _get_page(self):
        await self._ensure_cdp_browser()

        contexts = self._browser.contexts
        if contexts:
            self._context = contexts[0]
        else:
            self._context = await self._browser.new_context(
                viewport=None,
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )

        pages = self._context.pages
        if pages:
            self._page = pages[0]
        elif self._page is None or self._page.is_closed():
            self._page = await self._context.new_page()

        return self._page

    async def _go_to(self, url: str) -> str:
        if not url.startswith("http"):
            url = "https://" + url
        page = await self._get_page()
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=15000)
            return f"Opened: {page.url}"
        except Exception as e:
            return f"Navigation error: {e}"

    async def _search(self, query: str, engine: str = "google") -> str:
        engines = {
            "google":     f"https://www.google.com/search?q={query.replace(' ', '+')}",
            "bing":       f"https://www.bing.com/search?q={query.replace(' ', '+')}",
            "duckduckgo": f"https://duckduckgo.com/?q={query.replace(' ', '+')}",
        }
        url = engines.get(engine.lower(), engines["google"])
        return await self._go_to(url)

    async def _click(self, selector=None, text=None) -> str:
        page = await self._get_page()
        try:
            if text:
                await page.get_by_text(text, exact=False).first.click(timeout=8000)
                return f"Clicked: '{text}'"
            elif selector:
                await page.click(selector, timeout=8000)
                return f"Clicked: {selector}"
            return "No selector or text provided."
        except Exception as e:
            return f"Click error: {e}"

    async def _type(self, selector=None, text="", clear_first=True) -> str:
        page = await self._get_page()
        try:
            element = page.locator(selector).first if selector else page.locator(":focus")
            if clear_first:
                await element.clear()
            await element.type(text, delay=50)
            return "Text typed."
        except Exception as e:
            return f"Type error: {e}"

    async def _scroll(self, direction="down", amount=500) -> str:
        page = await self._get_page()
        try:
            y = amount if direction == "down" else -amount
            await page.mouse.wheel(0, y)
            return f"Scrolled {direction}."
        except Exception as e:
            return f"Scroll error: {e}"

    async def _press(self, key: str) -> str:
        page = await self._get_page()
        try:
            await page.keyboard.press(key)
            return f"Pressed: {key}"
        except Exception as e:
            return f"Key error: {e}"

    async def _get_text(self) -> str:
        page = await self._get_page()
        try:
            text = await page.inner_text("body")
            return text[:4000] if len(text) > 4000 else text
        except Exception as e:
            return f"Could not get page text: {e}"

    async def _fill_form(self, fields: dict) -> str:
        page = await self._get_page()
        results = []
        for selector, value in fields.items():
            try:
                el = page.locator(selector).first
                await el.clear()
                await el.type(str(value), delay=40)
                results.append(f"OK {selector}")
            except Exception as e:
                results.append(f"FAIL {selector}: {e}")
        return "Form filled: " + ", ".join(results)

    async def _smart_click(self, description: str) -> str:
        page = await self._get_page()
        desc_lower = description.lower()
        role_hints = {
            "button":    ["button", "buton", "btn"],
            "link":      ["link", "baglanti"],
            "searchbox": ["search", "arama"],
            "textbox":   ["input", "field", "alan"],
        }
        for role, keywords in role_hints.items():
            if any(k in desc_lower for k in keywords):
                try:
                    await page.get_by_role(role).first.click(timeout=5000)
                    return f"Clicked ({role}): '{description}'"
                except Exception:
                    pass
        try:
            await page.get_by_text(description, exact=False).first.click(timeout=5000)
            return f"Clicked (text): '{description}'"
        except Exception:
            pass
        try:
            await page.get_by_placeholder(description, exact=False).first.click(timeout=5000)
            return f"Clicked (placeholder): '{description}'"
        except Exception:
            pass
        return f"Could not find: '{description}'"

    async def _smart_type(self, description: str, text: str) -> str:
        page = await self._get_page()
        for method, locator in [
            ("placeholder", page.get_by_placeholder(description, exact=False)),
            ("label",       page.get_by_label(description, exact=False)),
            ("role",        page.get_by_role("textbox")),
        ]:
            try:
                el = locator.first
                await el.clear()
                await el.type(text, delay=50)
                return f"Typed into ({method}): '{description}'"
            except Exception:
                continue
        return f"Could not find input: '{description}'"

    async def _send_whatsapp(self, receiver: str, message: str) -> str:
        await self._ensure_cdp_browser()
        if not self._browser:
            return "Could not connect to browser via CDP."

        ctx = self._browser.contexts[0] if self._browser.contexts else await self._browser.new_context()

        # Check if whatsapp is already open in an existing tab
        page = None
        for p in ctx.pages:
            if "web.whatsapp.com" in p.url.lower():
                page = p
                try:
                    await page.bring_to_front()
                except Exception:
                    pass
                logger.info("[WhatsApp] Reusing existing WhatsApp tab in Brave")
                break

        if not page:
            if ctx.pages and ctx.pages[-1].url in ("about:blank", "chrome://newtab/", ""):
                page = ctx.pages[-1]
            else:
                page = await ctx.new_page()
            await page.goto("https://web.whatsapp.com", wait_until="domcontentloaded", timeout=20000)
            logger.info("[WhatsApp] Opened web.whatsapp.com in Brave")

        # Resolve contact from contacts manager
        contact_name = receiver
        try:
            from backend.contacts_manager import search_contact
            match = search_contact(receiver)
            if match:
                contact_name = match.get("name") or receiver
        except Exception:
            pass

        # Look for search input in left sidebar (both modern <input> and contenteditable div)
        try:
            search_input = page.locator("input[placeholder*='Search' i], input[aria-label*='Search' i], div[contenteditable='true'][role='textbox']").first
            if await search_input.is_visible(timeout=3000):
                await search_input.click()
                await search_input.fill("")
                await page.keyboard.type(contact_name, delay=20)
                await asyncio.sleep(0.8)

                # Look for matching contact row
                contact_row = page.locator(f"#pane-side span[title*='{receiver}' i]").first
                if not await contact_row.is_visible(timeout=1500):
                    contact_row = page.locator(f"#pane-side span[title*='{contact_name}' i]").first

                if await contact_row.is_visible(timeout=2000):
                    await contact_row.click()
                    await asyncio.sleep(0.5)
                else:
                    await page.keyboard.press("ArrowDown")
                    await asyncio.sleep(0.2)
                    await page.keyboard.press("Enter")
                    await asyncio.sleep(0.5)
        except Exception as e:
            logger.warning(f"[WhatsApp] Search exception: {e}")

        # Locate message box in chat footer
        try:
            msg_box = page.locator("footer div[contenteditable='true'], div[contenteditable='true'][data-tab='10']").first
            await msg_box.wait_for(state="visible", timeout=6000)
            await msg_box.click()

            if len(message) > 60 or "\n" in message:
                try:
                    import pyperclip
                    pyperclip.copy(message)
                    await page.keyboard.press("Control+v")
                except Exception:
                    await page.keyboard.type(message, delay=5)
            else:
                await page.keyboard.type(message, delay=10)

            await page.keyboard.press("Enter")
            logger.info(f"[WhatsApp] Sent message to {contact_name}")
            return f"Successfully sent WhatsApp message to {contact_name}: '{message}'"
        except Exception as e:
            logger.warning(f"[WhatsApp] Message typing exception: {e}")
            return f"Opened WhatsApp for {contact_name}, but message composer was unavailable: {e}"

    async def _run_agent(self, task: str, initial_actions: list | None = None) -> str:
        # browser_use is vendored under backend/browser-use — make it importable.
        vendored = os.path.join(_PROJECT_DIR, "backend", "browser-use")
        if vendored not in sys.path:
            sys.path.append(vendored)

        from browser_use import Agent, BrowserSession, Tools
        from browser_use.llm.openai.chat import ChatOpenAI

        from backend.agent.local_model import NVIDIA_API_KEY, NVIDIA_BASE, NVIDIA_MODEL

        if not NVIDIA_API_KEY:
            return "Agent requires NVIDIA_API_KEY to be set."

        try:
            if self._browser:
                await self._browser.close()
        except Exception:
            pass
        self._browser = None
        self._context = None
        self._page = None

        await self._ensure_cdp_browser()

        tools = Tools(exclude_actions=["read_file", "write_file", "replace_file", "search"])
        cdp_url = self._cdp_url()
        browser_session = BrowserSession(cdp_url=cdp_url, keep_alive=True)

        llm = ChatOpenAI(
            model=NVIDIA_MODEL,
            api_key=NVIDIA_API_KEY,
            base_url=NVIDIA_BASE,
            temperature=0.1,
            remove_min_items_from_schema=True,
            remove_defaults_from_schema=True,
        )

        agent = Agent(
            task=task,
            llm=llm,
            browser=browser_session,
            tools=tools,
            use_vision=False,
            flash_mode=True,
            max_failures=3,
            initial_actions=initial_actions,
        )

        history = await agent.run(max_steps=30)
        result = history.final_result() or "Task completed."
        try:
            await browser_session.stop()
        except Exception:
            pass
        return str(result)

    async def _fill_online_form(self, url: str = "", field_descriptions: str = "") -> str:
        task_parts = ["Fill the online form on this page."]
        if url:
            task_parts.insert(0, f"Go to {url}")
        if field_descriptions:
            task_parts.append(f"Here is what to fill: {field_descriptions}")
        else:
            task_parts.append(
                "Read each form field label/question and fill with realistic sample data "
                "(e.g. 'John Doe' for name, 'john@email.com' for email, '1234567890' for phone). "
                "Use appropriate dummy data for each field type."
            )
        task_parts.append("Then click the submit button if there is one.")
        task = ". ".join(task_parts)
        return await self._run_agent(task)

    async def _close(self) -> str:
        if self._browser:
            try:
                await self._browser.close()
            except Exception:
                pass
            self._browser = None
            self._context = None
            self._page = None
        if self._browser_use_session:
            try:
                await self._browser_use_session.stop()
            except Exception:
                pass
            self._browser_use_session = None
        return "Browser closed."


_bt = _BrowserSession()
_bt_started = False
_bt_lock = threading.Lock()


def _ensure_started():
    global _bt_started
    with _bt_lock:
        if not _bt_started:
            _bt.start()
            _bt_started = True


def browser_control(
    parameters: dict,
    response=None,
    player=None,
    session_memory=None
) -> str:
    _ensure_started()

    action = (parameters or {}).get("action", "").lower().strip()
    result = "Unknown action."

    try:
        if action == "go_to":
            result = _bt.run(_bt._go_to(parameters.get("url", "")))

        elif action == "search":
            result = _bt.run(_bt._search(
                parameters.get("query", ""),
                parameters.get("engine", "google"),
            ))

        elif action == "click":
            result = _bt.run(_bt._click(
                selector=parameters.get("selector"),
                text=parameters.get("text"),
            ))

        elif action == "type":
            result = _bt.run(_bt._type(
                selector=parameters.get("selector"),
                text=parameters.get("text", ""),
                clear_first=parameters.get("clear_first", True),
            ))

        elif action == "scroll":
            result = _bt.run(_bt._scroll(
                direction=parameters.get("direction", "down"),
                amount=parameters.get("amount", 500),
            ))

        elif action == "fill_form":
            result = _bt.run(_bt._fill_form(parameters.get("fields", {})))

        elif action == "smart_click":
            result = _bt.run(_bt._smart_click(parameters.get("description", "")))

        elif action == "smart_type":
            result = _bt.run(_bt._smart_type(
                parameters.get("description", ""),
                parameters.get("text", ""),
            ))

        elif action == "get_text":
            result = _bt.run(_bt._get_text())

        elif action == "press":
            result = _bt.run(_bt._press(parameters.get("key", "Enter")))

        elif action == "send_whatsapp":
            receiver = parameters.get("receiver", "")
            message_text = parameters.get("message_text", "")
            if not receiver or not message_text:
                result = "Both receiver and message_text are required for send_whatsapp."
            else:
                result = _bt.run(_bt._send_whatsapp(receiver, message_text), timeout=300)

        elif action == "agent":
            task = parameters.get("task", parameters.get("description", ""))
            if not task:
                result = "Agent action requires a 'task' parameter."
            else:
                result = _bt.run(_bt._run_agent(task), timeout=300)

        elif action == "close":
            result = _bt.run(_bt._close())

        elif action == "discover_form":
            from backend.actions.form_filler import discover
            url = parameters.get("url")
            forms = discover(url)
            result = json.dumps(forms, indent=2) if forms else "No form fields found."

        else:
            result = f"Unknown action: {action}"

    except concurrent.futures.TimeoutError:
        result = "Browser action timed out."
    except Exception as e:
        result = f"Browser error: {e}"

    logger.info(f"[Browser] {result[:80]}")
    if player:
        player.write_log(f"[browser] {result[:60]}")

    return result
