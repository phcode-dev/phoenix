/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

/**
 * TerminalInstance - manages a single xterm.js terminal instance and its
 * connection to a PTY process via NodeConnector.
 */
define(function (require, exports, module) {

    // xterm.js and addons (loaded as AMD modules from thirdparty)
    const xtermModule = require("thirdparty/xterm/xterm");
    const FitAddonModule = require("thirdparty/xterm/addon-fit");
    const WebLinksAddonModule = require("thirdparty/xterm/addon-web-links");
    const SearchAddonModule = require("thirdparty/xterm/addon-search");
    const WebglAddonModule = require("thirdparty/xterm/addon-webgl");

    const Terminal = xtermModule.Terminal;
    const FitAddon = FitAddonModule.FitAddon;
    const WebLinksAddon = WebLinksAddonModule.WebLinksAddon;
    const SearchAddon = SearchAddonModule.SearchAddon;
    const WebglAddon = WebglAddonModule.WebglAddon;

    let _nextId = 0;

    // Shortcuts that should be passed to the editor, not the terminal
    const EDITOR_SHORTCUTS = [
        {ctrlKey: true, shiftKey: true, key: "p"}, // Command Palette
        {ctrlKey: true, key: "p"},                  // Quick Open
        {ctrlKey: true, key: "b"},                  // Toggle sidebar
        {ctrlKey: true, key: "Tab"},                // Next tab
        {ctrlKey: true, shiftKey: true, key: "Tab"} // Previous tab
    ];

    /**
     * Read terminal theme colors from CSS variables
     * @returns {Object} xterm.js theme object
     */
    function _getThemeFromCSS() {
        const panelEl = document.querySelector('.terminal-panel-container') || document.documentElement;
        const style = getComputedStyle(panelEl);
        function v(name) {
            return style.getPropertyValue(name).trim() || undefined;
        }
        return {
            background: v("--terminal-background"),
            foreground: v("--terminal-foreground"),
            cursor: v("--terminal-cursor"),
            cursorAccent: v("--terminal-background"),
            selectionBackground: v("--terminal-selection"),
            selectionForeground: undefined,
            black: v("--terminal-ansi-black"),
            red: v("--terminal-ansi-red"),
            green: v("--terminal-ansi-green"),
            yellow: v("--terminal-ansi-yellow"),
            blue: v("--terminal-ansi-blue"),
            magenta: v("--terminal-ansi-magenta"),
            cyan: v("--terminal-ansi-cyan"),
            white: v("--terminal-ansi-white"),
            brightBlack: v("--terminal-ansi-bright-black"),
            brightRed: v("--terminal-ansi-bright-red"),
            brightGreen: v("--terminal-ansi-bright-green"),
            brightYellow: v("--terminal-ansi-bright-yellow"),
            brightBlue: v("--terminal-ansi-bright-blue"),
            brightMagenta: v("--terminal-ansi-bright-magenta"),
            brightCyan: v("--terminal-ansi-bright-cyan"),
            brightWhite: v("--terminal-ansi-bright-white")
        };
    }

    /**
     * Create a new TerminalInstance
     * @param {Object} nodeConnector - NodeConnector for communication
     * @param {Object} shellProfile - Shell profile {name, path, args}
     * @param {string} cwd - Working directory
     * @constructor
     */
    function TerminalInstance(nodeConnector, shellProfile, cwd) {
        this.id = "term_" + (++_nextId);
        this.nodeConnector = nodeConnector;
        this.shellProfile = shellProfile;
        this.cwd = cwd;
        this.title = shellProfile.name;
        this.pid = null;
        this.isAlive = false;
        this.terminal = null;
        this.fitAddon = null;
        this.searchAddon = null;
        this.$container = null;
        this._resizeTimeout = null;
        this._disposed = false;

        // Bound event handlers for cleanup
        this._onTerminalData = this._onTerminalData.bind(this);
        this._onTerminalExit = this._onTerminalExit.bind(this);
    }

    /**
     * Create the xterm.js terminal and attach it to the DOM
     * @param {jQuery} $parentContainer - The container to attach the terminal to
     */
    TerminalInstance.prototype.create = function ($parentContainer) {
        // Create DOM container
        this.$container = $('<div class="terminal-instance-container" data-terminal-id="' + this.id + '"></div>');
        $parentContainer.append(this.$container);

        // Create xterm.js instance
        this.terminal = new Terminal({
            theme: _getThemeFromCSS(),
            fontFamily: "'Menlo', 'DejaVu Sans Mono', 'Consolas', 'Lucida Console', monospace",
            fontSize: 13,
            lineHeight: 1.2,
            cursorBlink: true,
            cursorStyle: "block",
            scrollback: 10000,
            allowProposedApi: true
        });

        // Load addons
        this.fitAddon = new FitAddon();
        this.searchAddon = new SearchAddon();

        this.terminal.loadAddon(this.fitAddon);
        this.terminal.loadAddon(new WebLinksAddon());
        this.terminal.loadAddon(this.searchAddon);

        // Open terminal in DOM
        this.terminal.open(this.$container[0]);

        // Load WebGL renderer for better performance
        try {
            this.terminal.loadAddon(new WebglAddon());
        } catch (e) {
            console.warn("Terminal: WebglAddon failed to load, using default renderer:", e);
        }

        // Fit to container
        this._fit();

        // Set up custom key handler to intercept editor shortcuts
        this.terminal.attachCustomKeyEventHandler(this._customKeyHandler.bind(this));

        // Wire input: terminal -> PTY
        this.terminal.onData((data) => {
            if (this.isAlive) {
                this.nodeConnector.execPeer("writeTerminal", {id: this.id, data}).catch((err) => {
                    console.error("Terminal: write error:", err);
                });
            }
        });

        // Wire resize: terminal -> PTY
        this.terminal.onResize(({cols, rows}) => {
            if (this.isAlive) {
                this.nodeConnector.execPeer("resizeTerminal", {id: this.id, cols, rows}).catch((err) => {
                    console.error("Terminal: resize error:", err);
                });
            }
        });

        // Listen for title changes from xterm
        this.terminal.onTitleChange((newTitle) => {
            if (newTitle) {
                this.title = newTitle;
                if (this.onTitleChanged) {
                    this.onTitleChanged(this.id, newTitle);
                }
            }
        });

        // Listen for NodeConnector events
        this.nodeConnector.on("terminalData", this._onTerminalData);
        this.nodeConnector.on("terminalExit", this._onTerminalExit);
    };

    /**
     * Spawn the PTY process on the Node side
     */
    TerminalInstance.prototype.spawn = async function () {
        const dims = this.fitAddon.proposeDimensions();
        try {
            const result = await this.nodeConnector.execPeer("createTerminal", {
                id: this.id,
                shell: this.shellProfile.path,
                args: this.shellProfile.args || [],
                cwd: this.cwd,
                cols: dims ? dims.cols : 80,
                rows: dims ? dims.rows : 24
            });
            this.pid = result.pid;
            this.isAlive = true;
        } catch (err) {
            console.error("Terminal: Failed to spawn PTY:", err);
            this.terminal.write("\r\n\x1b[31mFailed to start terminal: " + err.message + "\x1b[0m\r\n");
        }
    };

    /**
     * Handle data from PTY (NodeConnector event)
     */
    TerminalInstance.prototype._onTerminalData = function (_event, eventData) {
        if (eventData.id === this.id && this.terminal) {
            this.terminal.write(eventData.data);
        }
    };

    /**
     * Handle PTY exit (NodeConnector event)
     */
    TerminalInstance.prototype._onTerminalExit = function (_event, eventData) {
        if (eventData.id === this.id) {
            this.isAlive = false;
            if (this.terminal) {
                this.terminal.write("\r\n\x1b[90m[Process exited with code " + eventData.exitCode + "]\x1b[0m\r\n");
            }
            if (this.onProcessExit) {
                this.onProcessExit(this.id, eventData.exitCode);
            }
        }
    };

    /**
     * Custom key event handler - intercept editor shortcuts and clipboard keys
     * Returns true to allow xterm to handle, false to prevent
     */
    TerminalInstance.prototype._customKeyHandler = function (event) {
        // Only intercept keydown events
        if (event.type !== "keydown") {
            return true;
        }

        const ctrlOrMeta = event.ctrlKey || event.metaKey;

        // Shift+Escape should focus the active editor
        if (event.shiftKey && event.key === "Escape") {
            return false;
        }

        // Ctrl+C with a selection should copy to clipboard, not send SIGINT
        if (ctrlOrMeta && !event.shiftKey && event.key.toLowerCase() === "c" && this.terminal.hasSelection()) {
            return false;
        }

        for (const shortcut of EDITOR_SHORTCUTS) {
            const ctrlMatch = shortcut.ctrlKey ? ctrlOrMeta : !ctrlOrMeta;
            const shiftMatch = shortcut.shiftKey ? event.shiftKey : !event.shiftKey;
            const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();

            if (ctrlMatch && shiftMatch && keyMatch) {
                return false; // Don't let xterm handle it
            }
        }

        return true; // Let xterm handle it
    };

    /**
     * Fit the terminal to its container
     */
    TerminalInstance.prototype._fit = function () {
        if (this.fitAddon && this.$container && this.$container.is(":visible")) {
            try {
                this.fitAddon.fit();
            } catch (e) {
                // Container might not be visible yet
            }
        }
    };

    /**
     * Handle container resize - debounced
     */
    TerminalInstance.prototype.handleResize = function () {
        clearTimeout(this._resizeTimeout);
        this._resizeTimeout = setTimeout(() => {
            this._fit();
        }, 50);
    };

    /**
     * Show this terminal (make its container visible)
     */
    TerminalInstance.prototype.show = function () {
        if (this.$container) {
            this.$container.addClass("active");
            this._fit();
            this.terminal.focus();
        }
    };

    /**
     * Hide this terminal
     */
    TerminalInstance.prototype.hide = function () {
        if (this.$container) {
            this.$container.removeClass("active");
        }
    };

    /**
     * Focus the terminal
     */
    TerminalInstance.prototype.focus = function () {
        if (this.terminal) {
            this.terminal.focus();
        }
    };

    /**
     * Clear the terminal screen
     */
    TerminalInstance.prototype.clear = function () {
        if (this.terminal) {
            this.terminal.clear();
        }
    };

    /**
     * Update the terminal theme (e.g., after theme change)
     */
    TerminalInstance.prototype.updateTheme = function () {
        if (this.terminal) {
            this.terminal.options.theme = _getThemeFromCSS();
        }
    };

    /**
     * Kill the PTY process and dispose of the terminal
     */
    TerminalInstance.prototype.dispose = function () {
        if (this._disposed) {
            return;
        }
        this._disposed = true;

        // Remove event listeners
        this.nodeConnector.off("terminalData", this._onTerminalData);
        this.nodeConnector.off("terminalExit", this._onTerminalExit);

        // Kill PTY
        if (this.isAlive) {
            this.nodeConnector.execPeer("killTerminal", {id: this.id}).catch((err) => {
                console.error("Terminal: kill error:", err);
            });
            this.isAlive = false;
        }

        // Dispose xterm
        clearTimeout(this._resizeTimeout);
        if (this.terminal) {
            this.terminal.dispose();
            this.terminal = null;
        }

        // Remove DOM
        if (this.$container) {
            this.$container.remove();
            this.$container = null;
        }
    };

    module.exports = TerminalInstance;
});
