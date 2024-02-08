brackets-display-shortcuts
==========================

Brackets Extension to Display Shortcuts in bottom panel

## Overview

This is an Extension for [Brackets](https://github.com/adobe/brackets). 

## Features

This extension is accessed in Brackets using menu `Help > Show Shortcuts` or with the keyboard shortcut `Ctrl-Alt-/` on Windows and `Control-Alt-/` on Mac.

This extension displays all shortcuts defined for:
* Brackets
* CodeMirror (which not overridden by Brackets)
* Extensions which are currently installed 

All columns are sortable in both ascending and descending order.

Display of "Extension" in Origin column is dependent on command using package-style naming convention (e.g. "myorg.myextension.mycommand") to avoid collisions with other extensions as [mentioned in How to Write Extensions doc](https://github.com/adobe/brackets/wiki/How%20to%20write%20extensions#uihooks).

Button to "Copy to Current Document" inserts Table HTML markup at the current selection. It only works for full editor.

Type the name of the command you're looking for in the filter field to find the shortcut faster.

Use *Override Shortcut for Command* and *Disable Shortcuts* commands from context (right-click) menu to facilitate [editing of keymap.json file](https://github.com/adobe/brackets/wiki/User-Key-Bindings).

## License

MIT-licensed -- see _main.js_ for details.
