import tkinter as tk
from tkinter import scrolledtext, Menu, filedialog, messagebox
from patch_suite_integration import KNEAUXPatchSuiteIntegration # Import the integration class

class AwesomeCodeEditor:
    def __init__(self, root):
        self.root = root
        self.root.title("Awesome Code Editor")
        self.root.geometry("800x600")

        self.text_area = scrolledtext.ScrolledText(self.root, wrap=tk.WORD, undo=True)
        self.text_area.pack(fill=tk.BOTH, expand=True)
        self.current_file_path = None # To keep track of the currently open file

        self.menu_bar = Menu(self.root)
        self.root.config(menu=self.menu_bar)

        self.file_menu = Menu(self.menu_bar, tearoff=0)
        self.menu_bar.add_cascade(label="File", menu=self.file_menu)
        self.file_menu.add_command(label="Open", command=self.open_file)
        self.file_menu.add_command(label="Save", command=self.save_file)
        self.file_menu.add_command(label="Save As...", command=self.save_file_as)
        self.file_menu.add_separator()
        self.file_menu.add_command(label="Exit", command=self.root.quit)

        self.tools_menu = Menu(self.menu_bar, tearoff=0)
        self.menu_bar.add_cascade(label="Tools", menu=self.tools_menu)
        self.tools_menu.add_command(label="Patch with KNEAUX EDU", command=self.open_patch_suite_dialog)

        # Initialize patch suite integration object - created on demand
        self.patch_suite_instance = None


    def open_file(self):
        filepath = filedialog.askopenfilename(
            filetypes=[("Text Files", "*.txt"), ("All Files", "*.*")]
        )
        if not filepath:
            return
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
            self.text_area.delete(1.0, tk.END)
            self.text_area.insert(tk.END, content)
            self.current_file_path = filepath # Store current file path
            self.root.title(f"Awesome Code Editor - {filepath}")
        except Exception as e:
            messagebox.showerror("Error", f"Failed to open file: {e}")
            self.current_file_path = None

    def save_file_as(self):
        filepath = filedialog.asksaveasfilename(
            defaultextension=".txt",
            filetypes=[("Text Files", "*.txt"), ("All Files", "*.*")]
        )
        if not filepath:
            return False # Indicate cancellation
        try:
            with open(filepath, "w", encoding="utf-8") as f:
                content = self.text_area.get(1.0, tk.END)
                f.write(content)
            self.current_file_path = filepath # Update current file path
            self.root.title(f"Awesome Code Editor - {filepath}")
            return True # Indicate success
        except Exception as e:
            messagebox.showerror("Error", f"Failed to save file: {e}")
            return False # Indicate failure

    def save_file(self):
        if self.current_file_path:
            try:
                with open(self.current_file_path, "w", encoding="utf-8") as f:
                    content = self.text_area.get(1.0, tk.END)
                    f.write(content)
                self.root.title(f"Awesome Code Editor - {self.current_file_path}")
            except Exception as e:
                messagebox.showerror("Error", f"Failed to save file: {e}")
        else:
            self.save_file_as() # If no current file, use Save As logic

    def open_patch_suite_dialog(self):
        if self.patch_suite_instance is None or not self.patch_suite_instance.patch_window or not self.patch_suite_instance.patch_window.winfo_exists():
            self.patch_suite_instance = KNEAUXPatchSuiteIntegration(self.root)
        self.patch_suite_instance.show_patch_dialog()

        # Optionally, if a file is open, you could pass its path or directory to the patch suite
        # For example:
        # current_dir = None
        # if self.current_file_path:
        #     current_dir = Path(self.current_file_path).parent
        # self.patch_suite_instance.show_patch_dialog(initial_dir=current_dir)
        # This would require KNEAUXPatchSuiteIntegration to accept an initial_dir parameter.

def main():
    root = tk.Tk()
    editor = AwesomeCodeEditor(root)
    root.mainloop()

if __name__ == "__main__":
    main()
