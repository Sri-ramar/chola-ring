#!/usr/bin/env python3
"""
Scientific & Standard Desktop Calculator Tool
Skeuomorphic Dark Gold Theme GUI
"""
import sys
import math
import tkinter as tk
from tkinter import ttk, messagebox

class CalculatorApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Rhiona Scientific Calculator")
        self.root.geometry("380x520")
        self.root.configure(bg="#140d08")
        self.root.resizable(False, False)
        
        self.expression = ""
        
        # Display Screen Frame
        display_frame = tk.Frame(root, bg="#1f150c", bd=2, relief="sunken", highlightbackground="#855e3a", highlightthickness=1)
        display_frame.pack(fill=tk.X, padx=16, pady=(16, 10))
        
        self.history_var = tk.StringVar(value="")
        self.history_label = tk.Label(display_frame, textvariable=self.history_var, font=("Share Tech Mono", 10), bg="#1f150c", fg="#a88454", anchor="e")
        self.history_label.pack(fill=tk.X, padx=10, pady=(6, 2))
        
        self.display_var = tk.StringVar(value="0")
        self.display_entry = tk.Entry(display_frame, textvariable=self.display_var, font=("Share Tech Mono", 22, "bold"), bg="#1f150c", fg="#ffffff", bd=0, justify="right", insertbackground="#d4a259")
        self.display_entry.pack(fill=tk.X, padx=10, pady=(0, 8))
        
        # Buttons Grid
        buttons_frame = tk.Frame(root, bg="#140d08")
        buttons_frame.pack(fill=tk.BOTH, expand=True, padx=16, pady=(0, 16))
        
        button_layout = [
            [("C", self.clear), ("DEL", self.delete), ("(", lambda: self.append("(")), (")", lambda: self.append(")"))],
            [("sin", lambda: self.func("sin")), ("cos", lambda: self.func("cos")), ("tan", lambda: self.func("tan")), ("√", lambda: self.func("sqrt"))],
            [("7", lambda: self.append("7")), ("8", lambda: self.append("8")), ("9", lambda: self.append("9")), ("÷", lambda: self.append("/"))],
            [("4", lambda: self.append("4")), ("5", lambda: self.append("5")), ("6", lambda: self.append("6")), ("×", lambda: self.append("*"))],
            [("1", lambda: self.append("1")), ("2", lambda: self.append("2")), ("3", lambda: self.append("3")), ("-", lambda: self.append("-"))],
            [("0", lambda: self.append("0")), (".", lambda: self.append(".")), ("=", self.evaluate), ("+", lambda: self.append("+"))]
        ]
        
        for r, row in enumerate(button_layout):
            buttons_frame.rowconfigure(r, weight=1)
            for c, (text, cmd) in enumerate(row):
                buttons_frame.columnconfigure(c, weight=1)
                
                # Style colors based on button type
                if text == "=":
                    bg_col, fg_col = "#e0a643", "#1a1102"
                elif text in ["C", "DEL"]:
                    bg_col, fg_col = "#7a271d", "#ffffff"
                elif text in ["+", "-", "×", "÷", "sin", "cos", "tan", "√", "(", ")"]:
                    bg_col, fg_col = "#382718", "#d4a259"
                else:
                    bg_col, fg_col = "#24180d", "#ffffff"
                
                btn = tk.Button(
                    buttons_frame,
                    text=text,
                    font=("Share Tech Mono", 12, "bold"),
                    bg=bg_col,
                    fg=fg_col,
                    activebackground="#d4a259",
                    activeforeground="#000000",
                    bd=1,
                    relief="raised",
                    command=cmd
                )
                btn.grid(row=r, column=c, padx=3, pady=3, sticky="nsew")

    def append(self, char):
        if self.display_var.get() == "0" and char not in [".", "/", "*", "+", "-"]:
            self.expression = char
        else:
            self.expression += char
        self.display_var.set(self.expression)

    def clear(self):
        self.expression = ""
        self.history_var.set("")
        self.display_var.set("0")

    def delete(self):
        self.expression = self.expression[:-1]
        self.display_var.set(self.expression if self.expression else "0")

    def func(self, fn):
        try:
            val = float(eval(self.expression if self.expression else self.display_var.get()))
            if fn == "sin": res = math.sin(math.radians(val))
            elif fn == "cos": res = math.cos(math.radians(val))
            elif fn == "tan": res = math.tan(math.radians(val))
            elif fn == "sqrt": res = math.sqrt(val)
            self.history_var.set(f"{fn}({val})")
            self.display_var.set(f"{res:.6g}")
            self.expression = str(res)
        except Exception as e:
            self.display_var.set("Error")
            self.expression = ""

    def evaluate(self):
        try:
            self.history_var.set(self.expression + " =")
            res = eval(self.expression.replace("×", "*").replace("÷", "/"))
            self.display_var.set(f"{res:.6g}")
            self.expression = str(res)
        except Exception:
            self.display_var.set("Error")
            self.expression = ""

if __name__ == "__main__":
    root = tk.Tk()
    app = CalculatorApp(root)
    root.mainloop()
