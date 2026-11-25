import json, os
from pathlib import Path

_CONFIG_PATH = Path(__file__).parent / "api_keys.json"

def get_config() -> dict:
    with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

import sys

def get_os() -> str:
    """Returns: 'windows' | 'mac' | 'linux'"""
    config_os = get_config().get("os_system", "")
    if config_os:
        return config_os.lower()
    if sys.platform.startswith("win"):
        return "windows"
    elif sys.platform.startswith("dar"):
        return "mac"
    return "linux"

def is_windows() -> bool: return get_os() == "windows"
def is_mac()     -> bool: return get_os() == "mac"
def is_linux()   -> bool: return get_os() == "linux"