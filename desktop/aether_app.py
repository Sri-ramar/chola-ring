#!/usr/bin/env python3
"""Aether / Chola Core - native QtWebEngine desktop shell.

Loads the Chola Core reactor HUD in a frameless-feel desktop window. If no Chola
bridge server is listening on 127.0.0.1:3008 yet, it spawns the Node production
server (frontend/dist/server.cjs) automatically and tears it down when the window
closes. Media (mic) and notification permissions are auto-granted so voice mode
and live S2S speech work seamlessly inside the web view.
"""

from __future__ import annotations

import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_VENV_PYTHON = ROOT / "backend" / ".venv" / "bin" / "python3"
if _VENV_PYTHON.exists() and Path(sys.executable).resolve() != _VENV_PYTHON.resolve():
    try:
        import PyQt6.QtWebEngineWidgets  # noqa: F401
    except ImportError:
        os.execv(str(_VENV_PYTHON), [str(_VENV_PYTHON), str(Path(__file__).resolve()), *sys.argv[1:]])

# Force full hardware GPU acceleration, zero-copy rasterization, PulseAudio/PipeWire mic, and auto media stream
_GPU_FLAGS = [
    "--ignore-gpu-blocklist",
    "--enable-gpu-rasterization",
    "--enable-zero-copy",
    "--enable-native-gpu-memory-buffers",
    "--enable-accelerated-2d-canvas",
    "--enable-accelerated-video-decode",
    "--gpu-rasterization-msaa-sample-count=0",
    "--num-raster-threads=4",
    "--enable-features=VaapiVideoDecoder,CanvasOopRasterization,UseSkiaRenderer,WebRTCPipeWireCapturer,Pulseaudio",
    "--autoplay-policy=no-user-gesture-required",
    "--use-fake-ui-for-media-stream",
    "--audio-backend=pulseaudio",
    "--disable-features=AudioServiceSandbox",
    "--unsafely-treat-insecure-origin-as-secure=http://127.0.0.1:3008,http://localhost:3008",
    "--disable-gpu-driver-bug-workarounds",
]
_existing_flags = os.environ.get("QTWEBENGINE_CHROMIUM_FLAGS", "")
os.environ["QTWEBENGINE_CHROMIUM_FLAGS"] = f"{' '.join(_GPU_FLAGS)} {_existing_flags}".strip()

from PyQt6.QtCore import QTimer, QUrl, Qt
from PyQt6.QtGui import QIcon, QKeySequence, QShortcut
from PyQt6.QtWidgets import QApplication, QMainWindow, QMessageBox
from PyQt6.QtWebEngineCore import QWebEnginePage, QWebEngineSettings
from PyQt6.QtWebEngineWidgets import QWebEngineView

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
HOST = "127.0.0.1"
PORT = int(os.environ.get("AETHER_PORT", "3008"))
URL = f"http://{HOST}:{PORT}"
WINDOW_TITLE = "Chola Core UI"
ICON = ROOT / "Icon.png"

_LOADING_HTML = """<!doctype html>
<html><head><meta charset="utf-8">
<style>
  body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
       background:#05070d;color:#f59e0b;font-family:'Segoe UI',sans-serif;}
  .core{text-align:center}
  .ring{width:64px;height:64px;border:3px solid #1a140b;border-top-color:#f59e0b;
        border-radius:50%;margin:0 auto 18px;animation:spin 1s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  h1{font-size:20px;letter-spacing:4px;font-weight:300}
  p{color:#b45309;font-size:13px;letter-spacing:1px}
</style></head><body>
  <div class="core"><div class="ring"></div>
  <h1>CHOLA CORE</h1><p>igniting metallurgical reactor core&hellip;</p></div>
</body></html>"""


def server_alive(timeout: float = 0.8) -> bool:
    for endpoint in ("/api/health", "/api/status", "/"):
        try:
            with urllib.request.urlopen(f"{URL}{endpoint}", timeout=timeout) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            pass
    return False


def port_busy() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.4)
        return sock.connect_ex((HOST, PORT)) == 0


class AetherPage(QWebEnginePage):
    """Grants audio/video capture and notifications to the Chola Core web app."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._granted: set[QWebEnginePage.Feature] = {
            QWebEnginePage.Feature.MediaAudioCapture,
            QWebEnginePage.Feature.MediaVideoCapture,
            QWebEnginePage.Feature.MediaAudioVideoCapture,
            QWebEnginePage.Feature.Notifications,
            QWebEnginePage.Feature.DesktopVideoCapture,
            QWebEnginePage.Feature.DesktopAudioVideoCapture,
        }
        # In Qt 6.8+, permissionRequested(QWebEnginePermission) replaces featurePermissionRequested.
        # Connect to both so microphone, video, and audio work reliably across all Qt6 versions.
        if hasattr(self, "permissionRequested"):
            self.permissionRequested.connect(self._on_permission_requested)

    def _on_permission_requested(self, permission):
        # Auto-grant requested companion features (microphone, media capture, notifications)
        try:
            print(f"[Aether] Auto-granting permission: {permission.permissionType()} for {permission.origin().toString()}")
            permission.grant()
        except Exception as exc:
            print(f"[Aether] Permission grant exception: {exc}")

    def featurePermissionRequested(self, url: QUrl, feature):
        # Legacy Qt 6.0 - 6.7 feature permission callback.
        granted = feature in self._granted
        print(f"[Aether] Feature permission requested: {feature} -> granted={granted}")
        self.setFeaturePermission(
            url,
            feature,
            QWebEnginePage.PermissionPolicy.PermissionGrantedByUser
            if granted
            else QWebEnginePage.PermissionPolicy.PermissionDeniedByUser,
        )

    def javaScriptConsoleMessage(self, level, message, lineNumber, sourceID):
        print(f"[HUD JS {level.name}] {message} (line {lineNumber} in {sourceID})")

    def featurePermissionRequestCanceled(self, url: QUrl, feature):
        if feature in self._granted:
            self.setFeaturePermission(
                url, feature, QWebEnginePage.PermissionPolicy.PermissionDeniedByUser
            )


class AetherWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(WINDOW_TITLE)
        self.resize(1440, 900)
        if ICON.exists():
            self.setWindowIcon(QIcon(str(ICON)))

        self.child = None
        self._log_fh = None
        self.view = QWebEngineView()
        page = AetherPage(self.view)
        settings = page.settings()
        settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptCanOpenWindows, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.FullScreenSupportEnabled, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.Accelerated2dCanvasEnabled, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.WebGLEnabled, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.ScrollAnimatorEnabled, True)
        self.view.setPage(page)
        self.setCentralWidget(self.view)

        QShortcut(QKeySequence("F5"), self, activated=lambda: self.view.reload())
        QShortcut(QKeySequence("Ctrl+Shift+I"), self, activated=self._toggle_devtools)

        self._ensure_server()
        self.view.setHtml(_LOADING_HTML, baseUrl=QUrl(URL))
        self._wait_then_load()

    def _ensure_server(self) -> None:
        if server_alive():
            print(f"[Aether] Chola server already running at {URL}")
            return
        if port_busy():
            print(f"[Aether] Port {PORT} is occupied; attaching to existing service.")
            return

        # Augment PATH so NVM and system node are discovered regardless of GUI launcher environment
        nvm_paths = []
        nvm_dir = Path.home() / ".nvm" / "versions" / "node"
        if nvm_dir.exists():
            for v in sorted(nvm_dir.glob("v*"), reverse=True):
                bin_dir = v / "bin"
                if bin_dir.exists():
                    nvm_paths.append(str(bin_dir))

        env = dict(os.environ)
        existing_path = env.get("PATH", "")
        augmented_path = os.pathsep.join(nvm_paths + [existing_path, "/usr/local/bin", "/usr/bin"])
        env["PATH"] = augmented_path
        env["PORT"] = str(PORT)
        env["RHIONA_HOST"] = HOST
        env["NODE_ENV"] = "production"

        node_bin = None
        for p in nvm_paths:
            candidate = Path(p) / "node"
            if candidate.exists() and os.access(candidate, os.X_OK):
                node_bin = str(candidate)
                break
        if not node_bin:
            node_bin = shutil.which("node", path=augmented_path) or "/usr/bin/node"

        server_cjs = FRONTEND / "dist" / "server.cjs"
        tsx = FRONTEND / "node_modules" / ".bin" / "tsx"

        log_path = Path("/tmp/chola_server.log")
        self._log_fh = open(log_path, "a", encoding="utf-8")

        if server_cjs.exists():
            cmd = [node_bin, str(server_cjs)]
            print(f"[Aether] Spawning precompiled production bundle with {node_bin}: {server_cjs}")
        elif tsx.exists():
            cmd = [str(tsx), "server.ts"]
            print(f"[Aether] Spawning TypeScript server via {tsx}")
        else:
            QMessageBox.critical(
                self,
                "Chola Core",
                "Chola frontend build or dependencies are missing.\n\n"
                f"Run: npm --prefix {FRONTEND} run build",
            )
            sys.exit(1)

        try:
            self.child = subprocess.Popen(
                cmd,
                cwd=str(FRONTEND),
                env=env,
                stdout=self._log_fh,
                stderr=self._log_fh,
                start_new_session=True,
            )
            print(f"[Aether] Spawned Chola Core bridge (pid {self.child.pid}) on {URL}")
        except OSError as exc:
            QMessageBox.critical(self, "Chola Core", f"Failed to start Chola Core server:\n{exc}")
            sys.exit(1)

    def _wait_then_load(self) -> None:
        self._ready_deadline = time.time() + 45
        QTimer.singleShot(300, self._poll_server)

    def _poll_server(self) -> None:
        if self.child is not None and self.child.poll() is not None:
            self._show_crash("Chola Core bridge exited unexpectedly before becoming ready. Check /tmp/chola_server.log")
            return
        if server_alive():
            print("[Aether] Chola Core reactor online -> loading HUD")
            self.view.load(QUrl(URL))
            return
        if time.time() >= self._ready_deadline:
            self._show_crash("Chola Core bridge did not become ready in time. Check /tmp/chola_server.log")
            return
        QTimer.singleShot(300, self._poll_server)

    def _show_crash(self, message: str) -> None:
        QMessageBox.critical(self, WINDOW_TITLE, message)
        self.close()

    def _toggle_devtools(self) -> None:
        devtools = self.view.page().devToolsPage()
        if devtools is None:
            self.view.page().setDevToolsPage(
                AetherPage(self.view)
            )
        self.view.page().triggerAction(QWebEnginePage.WebAction.ToggleInspector)

    def closeEvent(self, event) -> None:
        if self.child is not None and self.child.poll() is None:
            self.child.send_signal(signal.SIGTERM)
            try:
                self.child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.child.kill()
            print(f"[Aether] Stopped Chola Core bridge (pid {self.child.pid})")
        if self._log_fh is not None:
            try:
                self._log_fh.close()
            except Exception:
                pass
        event.accept()


def main() -> int:
    QApplication.setAttribute(Qt.ApplicationAttribute.AA_ShareOpenGLContexts, True)
    app = QApplication(sys.argv)
    app.setApplicationName(WINDOW_TITLE)
    app.setApplicationDisplayName(WINDOW_TITLE)
    if ICON.exists():
        app.setWindowIcon(QIcon(str(ICON)))

    window = AetherWindow()
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())