import shlex
import subprocess
import json
import os
from typing import Optional, Any

def cmd_control(parameters: dict, player: Optional[Any] = None) -> str:
    task = parameters.get("task", "")
    if not task:
        raise ValueError("cmd_control requires a 'task' parameter.")

    from backend.agent.local_model import generate_local
    try:
        command = generate_local(
            f"Translate this task to a Linux bash command: {task}",
            system_instruction=(
                "You are a terminal command translator. "
                "Convert the user's natural language request into a single, valid, safe Linux bash command. "
                "Return ONLY the bash command. No explanation, no markdown backticks, no markdown formatting."
            ),
        )
        # Clean any backticks
        if command.startswith("```"):
            parts = command.split("```")
            command = parts[1] if len(parts) > 1 else command
            if command.startswith("bash"):
                command = command[4:]
            elif command.startswith("sh"):
                command = command[2:]
        command = command.strip().rstrip("`").strip()
        
        print(f"[cmd_control] Running command: {command}")
        
        cmd_args = shlex.split(command)
        res = subprocess.run(
            cmd_args,
            shell=False,
            capture_output=True,
            text=True,
            timeout=30,
            cwd=os.path.expanduser("~")
        )
        
        output = res.stdout.strip()
        error = res.stderr.strip()
        
        if res.returncode == 0:
            return output if output else "Command completed successfully."
        else:
            return f"Command failed with exit code {res.returncode}. Error: {error}"
            
    except Exception as e:
        return f"Error executing task: {e}"
