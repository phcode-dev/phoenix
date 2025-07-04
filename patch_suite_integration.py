import tkinter as tk
from tkinter import filedialog, messagebox, Toplevel
import zipfile
import shutil # Added for removing temp directory
import re
from pathlib import Path

PREMIUM_PATTERNS = [
    (re.compile(r"\b(isPremium|licenseValid|proVersion|hasProAccess)\s*=\s*false\b"), r"\1 = True"),
    (re.compile(r"if\s*\(!?\s*(isPremium|licenseValid|proVersion|hasProAccess)\)"), r"if True"), # Simplified for editor context
    (re.compile(r"checkLicense\s*\([^)]*\)\s*{[^}]*}"), r"checkLicense() { return True }"), # JS/TS like
]

TEXT_FILE_EXTENSIONS = {'.js', '.ts', '.json', '.html', '.py', '.txt', '.cfg', '.xml', '.md', '.java', '.cs', '.cpp', '.c', '.php'} # Expanded list

class KNEAUXPatchSuiteIntegration:
    def __init__(self, editor_root):
        self.editor_root = editor_root # Main editor window to anchor dialogs
        self.patch_window = None

    def show_patch_dialog(self):
        if self.patch_window and self.patch_window.winfo_exists():
            self.patch_window.lift()
            return

        self.patch_window = Toplevel(self.editor_root)
        self.patch_window.title("KNEAUX-COD3 EDU Patch Suite")
        self.patch_window.geometry("450x200")
        self.patch_window.transient(self.editor_root) # Make it a child of the main window

        tk.Label(self.patch_window, text="🔧 Select an extension (ZIP/CRX) or folder to patch:").pack(pady=15)
        tk.Button(self.patch_window, text="📂 Select File or Folder", command=self.select_and_process).pack(pady=5)
        tk.Button(self.patch_window, text="✖️ Close", command=self.patch_window.destroy).pack(pady=10)


    def select_and_process(self):
        # Determine if it's a file or folder dialog needed
        # For simplicity, starting with askopenfilename and then checking type
        path_str = filedialog.askopenfilename(
            parent=self.patch_window,
            title="Select ZIP/CRX file or any file in a target folder",
            filetypes=[("Supported Archives", "*.zip *.crx"), ("All files", "*.*")]
        )

        if not path_str:
            # User cancelled
            # Try asking for a directory if no file was selected, or provide a separate button for directory
            path_str = filedialog.askdirectory(
                parent=self.patch_window,
                title="Select Folder to Patch"
            )
            if not path_str:
                messagebox.showinfo("Info", "No file or folder selected.", parent=self.patch_window)
                return

        file_path = Path(path_str)

        if file_path.is_dir():
            self.scan_and_patch_folder(file_path)
        elif file_path.is_file():
            if file_path.suffix in ['.zip', '.crx']:
                temp_dir = file_path.parent / (file_path.stem + "_unzipped_temp")
                if temp_dir.exists():
                    shutil.rmtree(temp_dir) # Clean up previous attempt
                temp_dir.mkdir(parents=True, exist_ok=True)

                try:
                    with zipfile.ZipFile(file_path, 'r') as zip_ref:
                        zip_ref.extractall(temp_dir)

                    patched_files_count = self.scan_and_patch_folder(temp_dir, is_temp=True)

                    if patched_files_count > 0:
                        self.rezip_folder(temp_dir, file_path.parent / (file_path.stem + "_patched" + file_path.suffix))
                    elif patched_files_count == 0:
                         messagebox.showinfo("ℹ️ No Changes", "No patchable code found in the archive.", parent=self.patch_window)
                    # If patched_files_count is None, an error occurred during patching

                except zipfile.BadZipFile:
                    messagebox.showerror("Error", "Invalid or corrupted ZIP/CRX file.", parent=self.patch_window)
                except Exception as e:
                    messagebox.showerror("Error", f"Failed to process archive: {e}", parent=self.patch_window)
                finally:
                    if temp_dir.exists():
                        shutil.rmtree(temp_dir) # Clean up
            elif file_path.suffix in TEXT_FILE_EXTENSIONS:
                 # Allow patching a single, currently open, or selected text file
                if self.patch_single_file(file_path):
                    messagebox.showinfo("✅ Patch Complete", f"File '{file_path.name}' patched.", parent=self.patch_window)
                else:
                    messagebox.showinfo("ℹ️ No Changes", f"No patchable patterns found in '{file_path.name}'.", parent=self.patch_window)

            elif file_path.suffix in ['.exe', '.bin']:
                messagebox.showinfo("Note", "Binary patching is not supported. Please select source files, folders, or archives (ZIP/CRX).", parent=self.patch_window)
            else:
                messagebox.showwarning("Unsupported File", f"File type '{file_path.suffix}' is not directly patchable. Select a folder, ZIP, or CRX.", parent=self.patch_window)
        else:
            messagebox.showerror("Error", "Selected path is not a valid file or folder.", parent=self.patch_window)


    def patch_code_content(self, content):
        original_content = content
        for pattern, repl in PREMIUM_PATTERNS:
            content = pattern.sub(repl, content)
        return content, content != original_content

    def patch_single_file(self, file_path: Path):
        try:
            content = file_path.read_text(encoding='utf-8')
            patched_content, changed = self.patch_code_content(content)
            if changed:
                file_path.write_text(patched_content, encoding='utf-8')
                print(f"[+] Patched: {file_path}")
                return True
        except UnicodeDecodeError:
            print(f"[!] Skipping binary or non-UTF-8 file: {file_path.name}")
        except Exception as e:
            messagebox.showerror("File Patch Error", f"Error patching file {file_path.name}:\n{e}", parent=self.patch_window or self.editor_root)
            print(f"[!] Error processing {file_path.name}: {e}")
        return False

    def scan_and_patch_folder(self, folder_path: Path, is_temp: bool = False):
        patched_files_count = 0
        error_occurred = False
        for path_object in folder_path.rglob('*'):
            if path_object.is_file() and path_object.suffix in TEXT_FILE_EXTENSIONS:
                if self.patch_single_file(path_object):
                    patched_files_count += 1
                # Check if patch_single_file returned None due to an error, if so, set error_occurred flag
                # This check is a bit tricky as False means no patches applied, not necessarily an error.
                # We rely on messagebox shown in patch_single_file for error reporting.

        if not is_temp: # Only show message for direct folder patching here. Archive patching has its own summary.
            if patched_files_count > 0:
                messagebox.showinfo("✅ Patch Complete", f"{patched_files_count} file(s) patched in folder '{folder_path.name}'.", parent=self.patch_window)
            else:
                messagebox.showinfo("ℹ️ No Changes", f"No patchable code found in folder '{folder_path.name}'.", parent=self.patch_window)

        return patched_files_count # Return count for archive processing logic


    def rezip_folder(self, folder_to_zip: Path, output_zip_path: Path):
        try:
            with zipfile.ZipFile(output_zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for file in folder_to_zip.rglob('*'):
                    if file.is_file():
                        zipf.write(file, file.relative_to(folder_to_zip))
            messagebox.showinfo("📦 Repack Complete", f"Patched archive saved to:\n{output_zip_path}", parent=self.patch_window)
        except Exception as e:
            messagebox.showerror("Repack Error", f"Failed to repack archive: {e}", parent=self.patch_window)
            print(f"[!] Error repacking {folder_to_zip} to {output_zip_path}: {e}")

# Example of how it might be instantiated from the main editor (for testing purposes)
if __name__ == '__main__':
    root = tk.Tk()
    root.title("Main Editor Window (Test)")
    root.geometry("600x400")

    def open_patcher():
        patch_suite_instance = KNEAUXPatchSuiteIntegration(root)
        patch_suite_instance.show_patch_dialog()

    tk.Button(root, text="Open KNEAUX Patcher", command=open_patcher).pack(pady=20)
    root.mainloop()
