#!/usr/bin/env python3
"""
AI Image Enhancer & Upscaler Tool
Skeuomorphic Dark Gold Theme GUI
"""
import os
import sys
import tkinter as tk
from tkinter import filedialog, messagebox
from PIL import Image, ImageTk, ImageEnhance, ImageFilter

class ImageEnhancerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Rhiona AI Image Enhancer Studio")
        self.root.geometry("540x620")
        self.root.configure(bg="#140d08")
        self.root.resizable(False, False)
        
        self.original_img = None
        self.current_img = None
        self.img_path = None
        
        # Header
        header = tk.Frame(root, bg="#1f150c", bd=1, relief="raised")
        header.pack(fill=tk.X, padx=16, pady=12)
        tk.Label(header, text="📷 AI Image Enhancer & Upscaler Studio", font=("Outfit", 14, "bold"), bg="#1f150c", fg="#d4a259").pack(pady=8)
        
        # Controls Top Frame
        top_ctrl = tk.Frame(root, bg="#140d08")
        top_ctrl.pack(fill=tk.X, padx=16, pady=4)
        
        tk.Button(top_ctrl, text="📁 Open Image", font=("Outfit", 11, "bold"), bg="#4a3721", fg="#ffffff", activebackground="#d4a259", command=self.load_image).pack(side=tk.LEFT, padx=4)
        tk.Button(top_ctrl, text="💾 Save Enhanced Image", font=("Outfit", 11, "bold"), bg="#e0a643", fg="#1a1102", activebackground="#ffe3a0", command=self.save_image).pack(side=tk.RIGHT, padx=4)
        
        # Image Preview Frame
        self.preview_frame = tk.Frame(root, bg="#0d0805", bd=2, relief="sunken", highlightbackground="#855e3a", highlightthickness=1)
        self.preview_frame.pack(fill=tk.BOTH, expand=True, padx=16, pady=10)
        
        self.preview_label = tk.Label(self.preview_frame, text="No Image Loaded\nClick 'Open Image' to start", font=("Outfit", 12), bg="#0d0805", fg="#a88454")
        self.preview_label.pack(expand=True)
        
        # Sliders Frame
        sliders_frame = tk.Frame(root, bg="#140d08")
        sliders_frame.pack(fill=tk.X, padx=16, pady=10)
        
        # Sharpness Slider
        tk.Label(sliders_frame, text="Sharpness / AI Detail:", font=("Outfit", 10, "bold"), bg="#140d08", fg="#d4a259").grid(row=0, column=0, sticky="w")
        self.sharp_slider = tk.Scale(sliders_frame, from_=0.5, to=3.0, resolution=0.1, orient=tk.HORIZONTAL, bg="#140d08", fg="#fff", highlightthickness=0, troughcolor="#2f231a", activebackground="#d4a259", command=self.apply_effects)
        self.sharp_slider.set(1.0)
        self.sharp_slider.grid(row=0, column=1, sticky="ew", padx=8)
        
        # Contrast Slider
        tk.Label(sliders_frame, text="Contrast / Color Depth:", font=("Outfit", 10, "bold"), bg="#140d08", fg="#d4a259").grid(row=1, column=0, sticky="w")
        self.contrast_slider = tk.Scale(sliders_frame, from_=0.5, to=2.0, resolution=0.1, orient=tk.HORIZONTAL, bg="#140d08", fg="#fff", highlightthickness=0, troughcolor="#2f231a", activebackground="#d4a259", command=self.apply_effects)
        self.contrast_slider.set(1.0)
        self.contrast_slider.grid(row=1, column=1, sticky="ew", padx=8)
        
        # Brightness Slider
        tk.Label(sliders_frame, text="Brightness / Glow:", font=("Outfit", 10, "bold"), bg="#140d08", fg="#d4a259").grid(row=2, column=0, sticky="w")
        self.bright_slider = tk.Scale(sliders_frame, from_=0.5, to=2.0, resolution=0.1, orient=tk.HORIZONTAL, bg="#140d08", fg="#fff", highlightthickness=0, troughcolor="#2f231a", activebackground="#d4a259", command=self.apply_effects)
        self.bright_slider.set(1.0)
        self.bright_slider.grid(row=2, column=1, sticky="ew", padx=8)
        
        sliders_frame.columnconfigure(1, weight=1)

    def load_image(self):
        path = filedialog.askopenfilename(filetypes=[("Image Files", "*.png *.jpg *.jpeg *.webp *.bmp")])
        if not path:
            return
        self.img_path = path
        self.original_img = Image.open(path).convert("RGB")
        self.apply_effects()

    def apply_effects(self, *args):
        if not self.original_img:
            return
        
        img = self.original_img.copy()
        
        # Sharpness
        s_val = self.sharp_slider.get()
        if s_val != 1.0:
            enhancer = ImageEnhance.Sharpness(img)
            img = enhancer.enhance(s_val)
            
        # Contrast
        c_val = self.contrast_slider.get()
        if c_val != 1.0:
            enhancer = ImageEnhance.Contrast(img)
            img = enhancer.enhance(c_val)
            
        # Brightness
        b_val = self.bright_slider.get()
        if b_val != 1.0:
            enhancer = ImageEnhance.Brightness(img)
            img = enhancer.enhance(b_val)
            
        self.current_img = img
        
        # Render Preview Thumbnail
        preview = img.copy()
        preview.thumbnail((480, 300))
        self.tk_preview = ImageTk.PhotoImage(preview)
        self.preview_label.configure(image=self.tk_preview, text="")

    def save_image(self):
        if not self.current_img:
            messagebox.showwarning("Warning", "No image loaded to save!")
            return
        out_path = filedialog.asksaveasfilename(defaultextension=".png", filetypes=[("PNG Image", "*.png"), ("JPEG Image", "*.jpg")])
        if out_path:
            self.current_img.save(out_path)
            messagebox.showinfo("Success", f"Enhanced image saved cleanly to:\n{out_path}")

if __name__ == "__main__":
    root = tk.Tk()
    app = ImageEnhancerApp(root)
    root.mainloop()
