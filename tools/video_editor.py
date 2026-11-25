#!/usr/bin/env python3
"""
AI Video Studio & Converter Tool
Skeuomorphic Dark Gold Theme GUI
"""
import os
import sys
import subprocess
import shutil
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

class VideoStudioApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Rhiona AI Video Studio & Converter")
        self.root.geometry("520x460")
        self.root.configure(bg="#140d08")
        self.root.resizable(False, False)
        
        self.video_path = None
        
        # Header
        header = tk.Frame(root, bg="#1f150c", bd=1, relief="raised")
        header.pack(fill=tk.X, padx=16, pady=12)
        tk.Label(header, text="🎬 AI Video Studio & Media Converter", font=("Outfit", 14, "bold"), bg="#1f150c", fg="#d4a259").pack(pady=8)
        
        # Select File Section
        file_frame = tk.Frame(root, bg="#140d08")
        file_frame.pack(fill=tk.X, padx=16, pady=6)
        
        self.path_var = tk.StringVar(value="No Video Selected")
        tk.Entry(file_frame, textvariable=self.path_var, font=("Share Tech Mono", 10), bg="#1f150c", fg="#a88454", bd=1, state="readonly").pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 8))
        tk.Button(file_frame, text="Browse Video", font=("Outfit", 10, "bold"), bg="#4a3721", fg="#fff", activebackground="#d4a259", command=self.browse_video).pack(side=tk.RIGHT)
        
        # Operations Section
        ops_frame = tk.LabelFrame(root, text=" Media Processing Actions ", font=("Outfit", 11, "bold"), bg="#140d08", fg="#d4a259", bd=1, relief="groove")
        ops_frame.pack(fill=tk.BOTH, expand=True, padx=16, pady=10)
        
        # Operation 1: Extract MP3
        op1 = tk.Frame(ops_frame, bg="#140d08")
        op1.pack(fill=tk.X, padx=12, pady=8)
        tk.Label(op1, text="🎵 Extract MP3 Audio Track:", font=("Outfit", 10, "bold"), bg="#140d08", fg="#fff").pack(side=tk.LEFT)
        tk.Button(op1, text="Extract MP3", font=("Outfit", 10, "bold"), bg="#e0a643", fg="#1a1102", activebackground="#ffe3a0", command=self.extract_audio).pack(side=tk.RIGHT)
        
        # Operation 2: Convert to MP4
        op2 = tk.Frame(ops_frame, bg="#140d08")
        op2.pack(fill=tk.X, padx=12, pady=8)
        tk.Label(op2, text="🎞️ Convert Video to MP4 / Fast Web:", font=("Outfit", 10, "bold"), bg="#140d08", fg="#fff").pack(side=tk.LEFT)
        tk.Button(op2, text="Convert MP4", font=("Outfit", 10, "bold"), bg="#382718", fg="#d4a259", activebackground="#d4a259", activeforeground="#000", command=self.convert_mp4).pack(side=tk.RIGHT)

        # Operation 3: Convert to Animated GIF
        op3 = tk.Frame(ops_frame, bg="#140d08")
        op3.pack(fill=tk.X, padx=12, pady=8)
        tk.Label(op3, text="👾 Create Animated GIF Preview:", font=("Outfit", 10, "bold"), bg="#140d08", fg="#fff").pack(side=tk.LEFT)
        tk.Button(op3, text="Create GIF", font=("Outfit", 10, "bold"), bg="#382718", fg="#d4a259", activebackground="#d4a259", activeforeground="#000", command=self.create_gif).pack(side=tk.RIGHT)
        
        # Status Label
        self.status_var = tk.StringVar(value="Status: Ready")
        tk.Label(root, textvariable=self.status_var, font=("Share Tech Mono", 10), bg="#140d08", fg="#a88454").pack(pady=8)

    def browse_video(self):
        path = filedialog.askopenfilename(filetypes=[("Video Files", "*.mp4 *.mkv *.avi *.mov *.webm *.flv")])
        if path:
            self.video_path = path
            self.path_var.set(path)
            self.status_var.set("Status: Video loaded successfully")

    def extract_audio(self):
        if not self.video_path:
            messagebox.showwarning("Warning", "Please select a video file first!")
            return
        out_path = filedialog.asksaveasfilename(defaultextension=".mp3", filetypes=[("MP3 Audio", "*.mp3")])
        if not out_path:
            return
        self.status_var.set("Status: Extracting MP3 audio...")
        self.root.update()
        
        cmd = ["ffmpeg", "-y", "-i", self.video_path, "-vn", "-acodec", "libmp3lame", "-q:a", "2", out_path]
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            self.status_var.set("Status: MP3 extracted successfully!")
            messagebox.showinfo("Success", f"MP3 audio track saved cleanly to:\n{out_path}")
        except Exception as e:
            self.status_var.set("Status: Error during extraction")
            messagebox.showerror("Error", f"Failed to extract audio using ffmpeg: {e}")

    def convert_mp4(self):
        if not self.video_path:
            messagebox.showwarning("Warning", "Please select a video file first!")
            return
        out_path = filedialog.asksaveasfilename(defaultextension=".mp4", filetypes=[("MP4 Video", "*.mp4")])
        if not out_path:
            return
        self.status_var.set("Status: Converting video to MP4...")
        self.root.update()
        
        cmd = ["ffmpeg", "-y", "-i", self.video_path, "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-c:a", "aac", out_path]
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            self.status_var.set("Status: Video converted successfully!")
            messagebox.showinfo("Success", f"MP4 video saved cleanly to:\n{out_path}")
        except Exception as e:
            self.status_var.set("Status: Error during conversion")
            messagebox.showerror("Error", f"Failed to convert video: {e}")

    def create_gif(self):
        if not self.video_path:
            messagebox.showwarning("Warning", "Please select a video file first!")
            return
        out_path = filedialog.asksaveasfilename(defaultextension=".gif", filetypes=[("Animated GIF", "*.gif")])
        if not out_path:
            return
        self.status_var.set("Status: Creating Animated GIF...")
        self.root.update()
        
        cmd = ["ffmpeg", "-y", "-i", self.video_path, "-t", "5", "-vf", "fps=10,scale=320:-1", out_path]
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            self.status_var.set("Status: GIF created successfully!")
            messagebox.showinfo("Success", f"Animated GIF saved cleanly to:\n{out_path}")
        except Exception as e:
            self.status_var.set("Status: Error creating GIF")
            messagebox.showerror("Error", f"Failed to create GIF: {e}")

if __name__ == "__main__":
    root = tk.Tk()
    app = VideoStudioApp(root)
    root.mainloop()
