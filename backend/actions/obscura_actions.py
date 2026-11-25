import os
import shutil
import subprocess
import json
import urllib.parse

_PROJECT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OBSCURA_BIN = os.environ.get(
    "OBSCURA_BIN",
    os.path.join(_PROJECT_DIR, "backend", "obscura", "obscura")
)

def _obscura_bin() -> str:
    if not os.path.isfile(OBSCURA_BIN):
        which = shutil.which("obscura")
        if which:
            return which
        raise FileNotFoundError(
            f"Obscura not found at {OBSCURA_BIN} or in PATH"
        )
    return OBSCURA_BIN


def open_url(url: str) -> str:
    """Open a URL in Obscura browser (GUI mode)."""
    if not url.startswith("http"):
        url = "https://" + url
    try:
        subprocess.Popen(
            [_obscura_bin(), url],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        return f"Opened {url} in Obscura"
    except Exception as e:
        return f"Failed to open Obscura: {e}"


def search(query: str, engine: str = "google") -> str:
    """Search using Obscura browser."""
    q = urllib.parse.quote(query)
    engines = {
        "google":     f"https://www.google.com/search?q={q}",
        "bing":       f"https://www.bing.com/search?q={q}",
        "duckduckgo": f"https://duckduckgo.com/?q={q}",
        "youtube":    f"https://www.youtube.com/results?search_query={q}",
    }
    url = engines.get(engine.lower(), engines["google"])
    return open_url(url)


def fetch(url: str, eval_js: str = "document.body.innerText") -> str:
    """Headless fetch a URL and evaluate JavaScript. Returns the result."""
    if not url.startswith("http"):
        url = "https://" + url
    try:
        result = subprocess.run(
            [_obscura_bin(), "fetch", url, "--eval", eval_js],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            return f"Obscura fetch error: {result.stderr.strip()}"
        # Output format: "Fetching <url>...\nPage loaded: ...\n<result>"
        lines = result.stdout.strip().split("\n")
        return lines[-1] if lines else "No output"
    except subprocess.TimeoutExpired:
        return f"Timeout fetching {url}"
    except Exception as e:
        return f"Obscura fetch failed: {e}"


def scrape(urls: list[str], eval_js: str = "document.body.innerText") -> str:
    """Parallel scrape multiple URLs using Obscura's scrape command."""
    try:
        input_data = "\n".join(
            json.dumps({"url": u, "eval": eval_js}) for u in urls
        )
        result = subprocess.run(
            [_obscura_bin(), "scrape"],
            input=input_data, capture_output=True, text=True,
            timeout=60
        )
        if result.returncode != 0:
            return f"Obscura scrape error: {result.stderr.strip()}"
        return result.stdout.strip()
    except subprocess.TimeoutExpired:
        return "Timeout during scrape"
    except Exception as e:
        return f"Obscura scrape failed: {e}"
