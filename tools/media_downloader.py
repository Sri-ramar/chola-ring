#!/usr/bin/env python3
"""
YouTube & Media MP3/MP4 Downloader Tool
Skeuomorphic Dark Gold Theme GUI
"""
import os
import sys
import re
import shutil
import subprocess
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from pathlib import Path

def _detect_browser():
    browsers = ["brave-browser", "google-chrome", "chromium", "chromium-browser", "firefox"]
    for b in browsers:
        if shutil.which(b):
            return b.replace("-browser", "")
    return None

def _has_node():
    return shutil.which("node") is not None

class MediaDownloaderApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Rhiona Media & YouTube MP3/MP4 Downloader")
        self.root.geometry("640x520")
        self.root.configure(bg="#140d08")
        self.root.resizable(False, False)
        
        self._download_dir = str(Path.home() / "Music" / "musics and video")
        Path(self._download_dir).mkdir(parents=True, exist_ok=True)
        self._running = False
        self._browser = _detect_browser()
        
        self._build_ui()

    def _build_ui(self):
        # Header
        header = tk.Frame(self.root, bg="#1f150c", bd=1, relief="raised")
        header.pack(fill=tk.X, padx=16, pady=12)
        tk.Label(header, text="📥 YouTube & Media Downloader Studio", font=("Outfit", 14, "bold"), bg="#1f150c", fg="#d4a259").pack(pady=8)
        
        main = tk.Frame(self.root, bg="#140d08")
        main.pack(fill=tk.BOTH, expand=True, padx=16, pady=4)
        
        # URL Input Section
        tk.Label(main, text="Video / Reel / Song URL:", font=("Outfit", 11, "bold"), bg="#140d08", fg="#d4a259").pack(anchor=tk.W, pady=(4, 2))
        
        url_frame = tk.Frame(main, bg="#1f150c", bd=1, relief="sunken", highlightbackground="#855e3a", highlightthickness=1)
        url_frame.pack(fill=tk.X, pady=(0, 12))
        
        self.url_var = tk.StringVar()
        self.url_entry = tk.Entry(url_frame, textvariable=self.url_var, font=("Share Tech Mono", 11), bg="#1f150c", fg="#ffffff", bd=0, insertbackground="#d4a259")
        self.url_entry.pack(fill=tk.X, padx=10, pady=8)
        
        # Format Choice
        fmt_frame = tk.LabelFrame(main, text=" Output Format ", font=("Outfit", 11, "bold"), bg="#140d08", fg="#d4a259", bd=1, relief="groove")
        fmt_frame.pack(fill=tk.X, pady=(0, 12), ipady=4)
        
        self.format_var = tk.StringVar(value="mp3")
        rb1 = tk.Radiobutton(fmt_frame, text="🎵 High Quality MP3 Audio", value="mp3", variable=self.format_var, font=("Outfit", 10, "bold"), bg="#140d08", fg="#ffffff", selectcolor="#2b1f13", activebackground="#140d08", activeforeground="#d4a259")
        rb1.pack(anchor=tk.W, padx=16, pady=2)
        
        rb2 = tk.Radiobutton(fmt_frame, text="🎞️ MP4 Video (720p/HD)", value="mp4", variable=self.format_var, font=("Outfit", 10, "bold"), bg="#140d08", fg="#ffffff", selectcolor="#2b1f13", activebackground="#140d08", activeforeground="#d4a259")
        rb2.pack(anchor=tk.W, padx=16, pady=2)
        
        # Output Location
        loc_frame = tk.Frame(main, bg="#140d08")
        loc_frame.pack(fill=tk.X, pady=(0, 12))
        
        tk.Label(loc_frame, text="Save Folder:", font=("Outfit", 10, "bold"), bg="#140d08", fg="#d4a259").pack(side=tk.LEFT)
        self.dir_label = tk.Label(loc_frame, text=self._download_dir, font=("Share Tech Mono", 9), bg="#1f150c", fg="#a88454", anchor="w", bd=1, relief="sunken", padx=6, pady=4)
        self.dir_label.pack(side=tk.LEFT, padx=(8, 8), fill=tk.X, expand=True)
        
        tk.Button(loc_frame, text="Browse...", font=("Outfit", 9, "bold"), bg="#382718", fg="#d4a259", activebackground="#d4a259", command=self._browse_dir).pack(side=tk.RIGHT)
        
        # Download Button
        self.dl_btn = tk.Button(main, text="🚀 Start Download", font=("Outfit", 12, "bold"), bg="#e0a643", fg="#1a1102", activebackground="#ffe3a0", bd=2, relief="raised", command=self._start_download)
        self.dl_btn.pack(fill=tk.X, pady=(4, 10), ipady=4)
        
        # Status Bar
        self.status_var = tk.StringVar(value="Status: Ready")
        tk.Label(main, textvariable=self.status_var, font=("Share Tech Mono", 10), bg="#140d08", fg="#a88454", anchor="w", wraplength=600).pack(fill=tk.X)

    def _browse_dir(self):
        d = filedialog.askdirectory(initialdir=self._download_dir)
        if d:
            self._download_dir = d
            self.dir_label.config(text=d)

    def _log_progress(self, line: str):
        self.status_var.set(line.strip())
        self.root.update_idletasks()

    def _start_download(self):
        if self._running:
            return
        url = self.url_var.get().strip()
        if not url:
            messagebox.showerror("Error", "Please paste a URL first.")
            return

        self._running = True
        self.dl_btn.config(state=tk.DISABLED, bg="#4a3821", fg="#888")
        threading.Thread(target=self._download, args=(url,), daemon=True).start()

    def _download(self, url: str):
        fmt = self.format_var.get()
        try:
            self._log_progress("Fetching media metadata...")
            outtmpl = os.path.join(self._download_dir, "%(title)s.%(ext)s")

            cmd = [
                "yt-dlp",
                "--no-playlist",
                "-o", outtmpl,
                "--newline",
                "--print", "after_move:filepath",
                "--extractor-retries", "3",
                "--retries", "5",
            ]

            if _has_node():
                cmd += ["--js-runtimes", "node", "--remote-components", "ejs:github"]

            if self._browser:
                cmd += ["--cookies-from-browser", self._browser]

            if fmt == "mp3":
                cmd += ["-f", "best[ext=mp4]/best", "-x", "--audio-format", "mp3", "--audio-quality", "0"]
            else:
                cmd += ["-S", "res:720,ext:mp4:m4a", "--merge-output-format", "mp4"]

            cmd.append(url)

            self._log_progress("Downloading media file...")
            filepath = None
            with subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, bufsize=1
            ) as proc:
                for line in proc.stdout:
                    line = line.strip()
                    if not line:
                        continue
                    p = Path(line)
                    if p.exists() and p.suffix in (".mp4", ".mp3", ".m4a", ".webm"):
                        filepath = p
                        self._log_progress(f"Download complete -> {p.name}")
                    elif "error" in line.lower() and "warning" not in line.lower():
                        self._log_progress(line)
                    else:
                        self._log_progress(line)

            if filepath and filepath.exists():
                messagebox.showinfo("Success", f"Downloaded successfully:\n{filepath.name}")
            else:
                self._log_progress("Download finished.")
        except Exception as e:
            self._log_progress(f"Download error: {e}")
            messagebox.showerror("Error", f"Failed to download media: {e}")
        finally:
            self._running = False
            self.root.after(0, lambda: self.dl_btn.config(state=tk.NORMAL, bg="#e0a643", fg="#1a1102"))

if __name__ == "__main__":
    root = tk.Tk()
    app = MediaDownloaderApp(root)
    root.mainloop()
