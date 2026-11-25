import json
import re
import sys
import threading
import subprocess
import tempfile
import os
from pathlib import Path
from typing import Callable

from backend.agent.planner       import create_plan, replan
from backend.agent.error_handler import analyze_error, generate_fix, ErrorDecision
from backend.memory.memory_manager import format_memory_for_prompt, should_extract_memory, extract_memory, update_memory, load_memory

import logging

logger = logging.getLogger("executor")


def get_base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return Path(__file__).resolve().parent.parent


BASE_DIR        = get_base_dir()

BLOCKED_MODULES = [
    "shutil.rmtree", "os.remove", "os.unlink", "os.rmdir",
    "subprocess.run", "subprocess.Popen", "subprocess.call",
    "sys.exit", "os._exit", "os.kill",
    "__import__", "os.system", "os.popen",
    "eval(", "exec(", "compile(",
    "__builtins__", "breakpoint",
]

def _is_safe_code(code: str) -> bool:
    code_lower = code.lower()
    for blocked in BLOCKED_MODULES:
        if blocked in code_lower:
            logger.error(f"[Executor] Blocked dangerous code pattern: {blocked}")
            raise RuntimeError(
                f"Generated code contains blocked operation '{blocked}'. "
                "Task denied for safety."
            )
    return True

def _run_generated_code(description: str, speak: Callable | None = None) -> str:
    if speak:
        speak("Writing custom code for this task, sir.")

    home      = Path.home()
    desktop   = home / "Desktop"
    downloads = home / "Downloads"
    documents = home / "Documents"

    system_instruction = (
        "SAFETY RULES - You MUST follow these:\n"
        "1. NEVER import or call: shutil.rmtree, os.remove, os.unlink, os.rmdir\n"
        "2. NEVER import or call: subprocess.run, subprocess.Popen, subprocess.call\n"
        "3. NEVER use: sys.exit, os._exit, os.kill\n"
        "4. NEVER delete or modify system files\n"
        "5. Only read/write files in Desktop, Downloads, Documents, or /tmp\n\n"
        "You are an expert Python developer. "
        "Write clean, complete, working Python code. "
        "Use standard library + common packages. "
        "Install missing packages with subprocess + pip if needed. "
        "Return ONLY the Python code. No explanation, no markdown, no backticks.\n\n"
        f"SYSTEM PATHS:\n"
        f"  Desktop   = r'{desktop}'\n"
        f"  Downloads = r'{downloads}'\n"
        f"  Documents = r'{documents}'\n"
        f"  Home      = r'{home}'\n"
    )

    from backend.agent.local_model import generate_local
    try:
        code = generate_local(f"Write Python code to accomplish this task:\n\n{description}", system_instruction)

        code = re.sub(r"```(?:python)?", "", code).strip().rstrip("`").strip()

        _is_safe_code(code)

        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".py", delete=False, encoding="utf-8"
        ) as f:
            f.write(code)
            tmp_path = f.name

        logger.info(f"[Executor] Running generated code: {tmp_path}")

        result = subprocess.run(
            [sys.executable, "-I", tmp_path],
            capture_output=True, text=True,
            timeout=120, cwd=str(Path.home()),
            env={**os.environ, "PYTHONNOUSERSITE": "1"}
        )

        try:
            os.unlink(tmp_path)
        except Exception:
            pass

        output = result.stdout.strip()
        error  = result.stderr.strip()

        if result.returncode == 0 and output:
            return output
        elif result.returncode == 0:
            return "Task completed successfully."
        elif error:
            raise RuntimeError(f"Code error: {error[:400]}")
        return "Completed."

    except subprocess.TimeoutExpired:
        raise RuntimeError("Generated code timed out after 120 seconds.")
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"Generated code failed: {e}")

def _inject_context(params: dict, tool: str, step_results: dict, goal: str = "") -> dict:
    if not step_results:
        return params

    params = dict(params)

    if tool == "file_controller" and params.get("action") in ("write", "create_file"):
        content = params.get("content", "")
        if not content or len(content) < 50:
            all_results = [
                v for v in step_results.values()
                if v and len(v) > 100 and v not in ("Done.", "Completed.")
            ]
            if all_results:
                combined = "\n\n---\n\n".join(all_results)
                translated = _translate_to_goal_language(combined, goal)
                params["content"] = translated
                logger.info(f"[Executor] Injected + translated content")

    return params
def _detect_language(text: str) -> str:
    from backend.agent.local_model import generate_local
    try:
        return generate_local(
            f"What language is this text written in? "
            f"Reply with ONLY the language name in English (e.g. Turkish, English, French).\n\n"
            f"Text: {text[:200]}"
        )
    except Exception:
        return "English"


def _translate_to_goal_language(content: str, goal: str) -> str:
    if not goal:
        return content
    try:
        from backend.agent.local_model import generate_local
        target_lang = _detect_language(goal)
        logger.info(f"[Executor] Translating to: {target_lang}")

        translated = generate_local(
            f"Translate the following text into {target_lang}.\n"
            f"IMPORTANT:\n"
            f"- Translate EVERYTHING\n"
            f"- Keep all facts, numbers, and data intact\n"
            f"- Keep the structure and formatting\n"
            f"- Output ONLY the translated text, nothing else\n\n"
            f"Text to translate:\n{content[:4000]}"
        )
        logger.info(f"[Executor] Translation done ({target_lang})")
        return translated
    except Exception as e:
        logger.error(f"[Executor] Translation failed: {e}")
        return content

def _call_tool(tool: str, parameters: dict, speak: Callable | None) -> str:

    if tool == "open_app":
        from backend.actions.open_app import open_app
        return open_app(parameters=parameters, player=None) or "Done."

    elif tool == "web_search":
        from backend.actions.web_search import web_search
        return web_search(parameters=parameters, player=None) or "Done."
    elif tool == "game_updater":
        from backend.actions.game_updater import game_updater
        return game_updater(parameters=parameters, player=None, speak=speak) or "Done."
    elif tool == "browser_control":
        from backend.actions.browser_control import browser_control
        return browser_control(parameters=parameters, player=None) or "Done."

    elif tool == "file_controller":
        from backend.actions.file_controller import file_controller
        return file_controller(parameters=parameters, player=None) or "Done."

    elif tool == "cmd_control":
        from backend.actions.cmd_control import cmd_control
        return cmd_control(parameters=parameters, player=None) or "Done."

    elif tool == "code_helper":
        from backend.actions.code_helper import code_helper
        return code_helper(parameters=parameters, player=None, speak=speak) or "Done."

    elif tool == "dev_agent":
        from backend.actions.dev_agent import dev_agent
        return dev_agent(parameters=parameters, player=None, speak=speak) or "Done."

    elif tool == "screen_process":
        from backend.actions.screen_processor import screen_process
        screen_process(parameters=parameters, player=None)
        return "Screen captured and analyzed."

    elif tool == "send_message":
        from backend.actions.send_message import send_message
        return send_message(parameters=parameters, player=None) or "Done."

    elif tool == "reminder":
        from backend.actions.reminder import reminder
        return reminder(parameters=parameters, player=None) or "Done."

    elif tool == "youtube_video":
        from backend.actions.youtube_video import youtube_video
        return youtube_video(parameters=parameters, player=None) or "Done."

    elif tool == "weather_report":
        from backend.actions.weather_report import weather_action
        return weather_action(parameters=parameters, player=None) or "Done."

    elif tool == "computer_settings":
        from backend.actions.computer_settings import computer_settings
        return computer_settings(parameters=parameters, player=None) or "Done."

    elif tool == "desktop_control":
        from backend.actions.desktop import desktop_control
        return desktop_control(parameters=parameters, player=None) or "Done."

    elif tool == "computer_control":
        from backend.actions.computer_control import computer_control
        return computer_control(parameters=parameters, player=None) or "Done."

    elif tool in ("system_health", "health", "system_status", "telemetry"):
        from backend.agent_engine import get_system_health
        health = get_system_health()
        if not health.get("success"):
            raise RuntimeError(f"System health unavailable: {health.get('error', 'unknown error')}")
        gpu = health.get("gpu") or {}
        fan = health.get("fan") or {}
        parts = [
            f"CPU load {health.get('cpu_percent', 0)}%",
            f"CPU temp {health.get('cpu_temp', 0)}C",
            f"RAM {health.get('ram_percent', 0)}% used "
            f"({health.get('ram_used_mb', 0)} of {health.get('ram_total_mb', 0)} MB)",
            f"Battery {health.get('battery', 'unknown')}",
        ]
        if gpu.get("name") and gpu.get("name") != "Unavailable":
            parts.append(
                f"GPU {gpu.get('name')}: {gpu.get('utilization', 0)}% load, {gpu.get('temp', 0)}C, "
                f"VRAM {gpu.get('vram_used_mb', 0)}/{gpu.get('vram_total_mb', 0)} MB "
                f"({gpu.get('vram_percent', 0)}%)"
            )
        if fan:
            parts.append(
                f"Fans {fan.get('fan1_rpm', 0)} and {fan.get('fan2_rpm', 0)} RPM "
                f"(mode: {fan.get('mode', 'auto')})"
            )
        uptime = int(health.get("uptime_seconds", 0) or 0)
        parts.append(f"Uptime {uptime // 3600}h {(uptime % 3600) // 60}m")
        return "; ".join(parts)

    elif tool == "generated_code":
        description = parameters.get("description", "")
        if not description:
            raise ValueError("generated_code requires a 'description' parameter.")
        return _run_generated_code(description, speak=speak)

    elif tool == "flight_finder":
        from backend.actions.flight_finder import flight_finder
        return flight_finder(parameters=parameters, player=None, speak=speak) or "Done."

    elif tool in ("clipboard", "clipboard_control"):
        act = parameters.get("action", "read")
        if act == "write":
            from backend.agent_engine import set_clipboard
            txt = parameters.get("text", "")
            set_clipboard(txt)
            return f"Copied to system clipboard: {txt[:60]}"
        else:
            from backend.agent_engine import get_clipboard
            res = get_clipboard()
            return f"Clipboard text: {res.get('text', '')}"

    elif tool in ("desktop_notification", "notify"):
        from backend.agent_engine import send_desktop_notification
        title = parameters.get("title", "RHIONA")
        msg = parameters.get("message") or parameters.get("text", "")
        send_desktop_notification(title, msg)
        return f"Desktop notification sent: {title} - {msg}"

    elif tool in ("fan_control", "fan"):
        from backend.agent_engine import set_fan_mode, get_fan_status
        mode = parameters.get("mode", "status")
        if mode in ("max", "auto"):
            res = set_fan_mode(mode)
            return res.get("message", f"Fans set to {mode}")
        else:
            st = get_fan_status()
            return f"Fan 1: {st['fan1_rpm']} RPM, Fan 2: {st['fan2_rpm']} RPM (mode: {st['mode']})"

    else:
        logger.warning(f"[Executor] Unknown tool '{tool}' — falling back to generated_code")
        return _run_generated_code(f"Accomplish this task: {parameters}", speak=speak)

class AgentExecutor:

    MAX_REPLAN_ATTEMPTS = 2

    def __init__(self) -> None:
        # Structured outcome of the most recent run, consumed by agent_engine so the
        # UI / voice layer can speak the real numbers behind a summary.
        self.last_result: dict = {"goal": "", "summary": "", "steps": [], "success": False}

    def execute(
        self,
        goal:        str,
        speak:       Callable | None        = None,
        cancel_flag: threading.Event | None = None,
    ) -> str:
        print(f"\n[Executor] Goal: {goal}")

        self.last_result = {"goal": goal, "summary": "", "steps": [], "success": False}

        memory = load_memory()
        memory_context = format_memory_for_prompt(memory)

        replan_attempts = 0
        completed_steps = []
        step_results    = {} 
        plan            = create_plan(goal, context=memory_context)

        while True:
            steps = plan.get("steps", [])

            if not steps:
                msg = "I couldn't create a valid plan for this task, sir."
                if speak: speak(msg)
                self.last_result["summary"] = msg
                return msg

            success      = True
            failed_step  = None
            failed_error = ""

            for step in steps:
                if cancel_flag and cancel_flag.is_set():
                    if speak: speak("Task cancelled, sir.")
                    self.last_result["summary"] = "Task cancelled."
                    return "Task cancelled."

                step_num = step.get("step", "?")
                tool     = step.get("tool", "generated_code")
                desc     = step.get("description", "")
                params   = step.get("parameters", {})

                params = _inject_context(params, tool, step_results, goal=goal)

                logger.info(f"[Executor] Step {step_num}: [{tool}] {desc}")

                attempt = 1
                step_ok = False

                while attempt <= 3:
                    if cancel_flag and cancel_flag.is_set():
                        break
                    try:
                        result = _call_tool(tool, params, speak)
                        step_results[step_num] = result 
                        completed_steps.append(step)
                        logger.info(f"[Executor] Step {step_num} done: {str(result)[:100]}")
                        step_ok = True
                        break

                    except Exception as e:
                        error_msg = str(e)
                        logger.error(f"[Executor] Step {step_num} attempt {attempt} failed: {error_msg}")

                        recovery = analyze_error(step, error_msg, attempt=attempt)
                        decision = recovery["decision"]
                        user_msg = recovery.get("user_message", "")

                        if speak and user_msg:
                            speak(user_msg)

                        if decision == ErrorDecision.RETRY:
                            attempt += 1
                            import time; time.sleep(2)
                            continue

                        elif decision == ErrorDecision.SKIP:
                            logger.info(f"[Executor] Skipping step {step_num}")
                            completed_steps.append(step)
                            step_ok = True
                            break

                        elif decision == ErrorDecision.ABORT:
                            msg = f"Task aborted, sir. {recovery.get('reason', '')}"
                            if speak: speak(msg)
                            self.last_result["summary"] = msg
                            return msg

                        else: 
                            fix_suggestion = recovery.get("fix_suggestion", "")
                            if fix_suggestion and tool != "generated_code":
                                try:
                                    fixed_step = generate_fix(step, error_msg, fix_suggestion)
                                    if speak: speak("Trying an alternative approach, sir.")
                                    res = _call_tool(
                                        fixed_step["tool"],
                                        fixed_step["parameters"],
                                        speak
                                    )
                                    step_results[step_num] = res
                                    completed_steps.append(step)
                                    step_ok = True
                                    break
                                except Exception as fix_err:
                                    logger.error(f"[Executor] Fix failed: {fix_err}")

                            failed_step  = step
                            failed_error = error_msg
                            success      = False
                            break

                if not step_ok and not failed_step:
                    failed_step  = step
                    failed_error = "Max retries exceeded"
                    success      = False

                if not success:
                    break

            if success:
                summary = self._summarize(goal, completed_steps, step_results, speak)
                try:
                    if should_extract_memory(goal, summary):
                        extracted = extract_memory(goal, summary)
                        if extracted:
                            update_memory(extracted)
                            logger.info(f"[Executor] Memory updated: {list(extracted.keys())}")
                except Exception as e:
                    logger.error(f"[Executor] Memory extraction failed: {e}")
                return summary

            if replan_attempts >= self.MAX_REPLAN_ATTEMPTS:
                msg = f"Task failed after {replan_attempts} replan attempts, sir."
                if speak: speak(msg)
                self.last_result["summary"] = msg
                return msg

            if speak: speak("Adjusting my approach, sir.")

            replan_attempts += 1
            plan = replan(goal, completed_steps, failed_step, failed_error)

    @staticmethod
    def _clip(value, limit: int = 1200) -> str:
        text = " ".join(str(value).split())
        if not text:
            return ""
        return text if len(text) <= limit else text[:limit] + " ...[truncated]"

    @staticmethod
    def _compose_data_answer(structured_steps: list) -> str:
        """Deterministic, data-first answer used when no LLM summary is available."""
        for step in reversed(structured_steps):
            output = step.get("output", "")
            if not output:
                continue
            deliverable = output.split("RESULT:", 1)[-1]
            deliverable = " ".join(deliverable.split())
            if len(deliverable) > 400:
                deliverable = deliverable[:400].rsplit(" ", 1)[0] + "..."
            return f"Here is what I found, sir: {deliverable}"
        return ""

    def _summarize(
        self,
        goal: str,
        completed_steps: list,
        step_results: dict | None = None,
        speak: Callable | None = None,
    ) -> str:
        step_results = step_results or {}
        fallback = f"All done, sir. Completed {len(completed_steps)} steps for: {goal[:60]}."

        evidence_lines = []
        structured_steps = []
        for index, step in enumerate(completed_steps):
            step_num = step.get("step", index + 1)
            output = self._clip(step_results.get(step_num, step_results.get(str(step_num), "")))
            structured_steps.append(
                {
                    "step": step_num,
                    "tool": step.get("tool", ""),
                    "description": step.get("description", ""),
                    "output": output,
                }
            )
            evidence_lines.append(
                f"Step {step_num} [{step.get('tool', 'tool')}] {step.get('description', '')}\n"
                f"    RESULT: {output or '(no output captured)'}"
            )
        evidence = "\n".join(evidence_lines)[:4000]
        data_speech = self._compose_data_answer(structured_steps) or fallback

        self.last_result = {
            "goal": goal,
            "summary": "",
            "steps": structured_steps,
            "success": True,
        }

        # No tool handed back usable data -> say so instead of inventing a result.
        if not any(s["output"] for s in structured_steps):
            if speak: speak(fallback)
            self.last_result["summary"] = fallback
            return fallback

        try:
            from backend.agent.local_model import generate_local
            summary = generate_local(
                f'User goal: "{goal}"\n\n'
                f"Raw output captured from the executed steps:\n{evidence}\n\n"
                "Answer the user's goal using ONLY the facts in the step results above. "
                "State the concrete values you found (numbers, names, paths, times). "
                "If the step results do not answer the goal, say exactly which part failed. "
                "Maximum 3 sentences, no preamble, address the user as 'sir'.",
            )
            cleaned = " ".join(str(summary).split())
            # Reject echoes of the prompt itself and runaway generations.
            if (
                not cleaned
                or len(cleaned) > 600
                or "RESULT:" in cleaned
                or "step results" in cleaned.lower()
                or cleaned.count(' ') > 110
            ):
                raise ValueError("Summary unusable")
            if speak: speak(cleaned)
            self.last_result["summary"] = cleaned
            return cleaned
        except Exception:
            if speak: speak(data_speech)
            self.last_result["summary"] = data_speech
            return data_speech
