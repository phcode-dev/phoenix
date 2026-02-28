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
 * Terminal Extension - Integrates a terminal panel into Phoenix Code.
 * Only available in native (desktop) builds where node-pty is available.
 */
define(function (require, exports, module) {

    if (!Phoenix.isNativeApp) {
        return; // Terminal requires Node.js (node-pty)
    }

    const AppInit = require("utils/AppInit");
    const CommandManager = require("command/CommandManager");
    const WorkspaceManager = require("view/WorkspaceManager");
    const ProjectManager = require("project/ProjectManager");
    const ExtensionUtils = require("utils/ExtensionUtils");
    const NodeConnector = require("NodeConnector");
    const Mustache = require("thirdparty/mustache/mustache");
    const Dialogs = require("widgets/Dialogs");
    const DefaultDialogs = require("widgets/DefaultDialogs");
    const Strings = require("strings");
    const StringUtils = require("utils/StringUtils");

    const Commands = require("command/Commands");
    const NotificationUI = require("widgets/NotificationUI");
    const TerminalInstance = require("./TerminalInstance");
    const ShellProfiles = require("./ShellProfiles");
    const panelHTML = require("text!./terminal-panel.html");

    // Load xterm.css (terminal panel styles are in src/styles/Extn-Terminal.less)
    ExtensionUtils.loadStyleSheet(module, "../../thirdparty/xterm/xterm.css");

    // Constants
    const CMD_VIEW_TERMINAL = Commands.VIEW_TERMINAL;
    const CMD_NEW_TERMINAL = "terminal.new";
    const PANEL_ID = "terminal-panel";
    const PANEL_MIN_SIZE = 100;

    // Shell process names — if the foreground process is one of these, no child is running
    const SHELL_NAMES = new Set([
        "bash", "zsh", "fish", "sh", "dash", "ksh", "csh", "tcsh",
        "pwsh", "powershell", "cmd.exe", "nu", "elvish", "xonsh",
        "login",
        // Windows shell executables (returned with .exe suffix)
        "bash.exe", "pwsh.exe", "powershell.exe", "nu.exe",
        "fish.exe", "elvish.exe", "xonsh.exe", "wsl.exe"
    ]);

    /**
     * Check if a process name is a shell (handles full paths like /bin/bash)
     */
    function _isShellProcess(processName) {
        if (!processName) {
            return true;
        }
        // Strip path and leading "-" for login shells (e.g. "-zsh")
        const basename = processName.split("/").pop().split("\\").pop().replace(/^-/, "");
        return SHELL_NAMES.has(basename);
    }

    // State
    let panel = null;
    let nodeConnector = null;
    let terminalInstances = [];   // All terminal instances
    let activeTerminalId = null;  // Currently visible terminal
    let processInfo = {};         // id -> processName from PTY
    let originalDefaultShellName = null; // System-detected default shell name
    let _focusToastShown = false;       // Show focus hint toast only once per session
    let $panel, $contentArea, $shellDropdown, $flyoutList;

    /**
     * Create a new NodeConnector for terminal communication
     */
    function _initNodeConnector() {
        nodeConnector = NodeConnector.createNodeConnector("phoenix_terminal", exports);
    }

    /**
     * Create the bottom panel
     */
    function _createPanel() {
        const templateVars = {
            Strings: {
                CMD_NEW_TERMINAL: "New Terminal",
                TERMINAL_CLEAR: "Clear",
                TERMINAL_KILL: "Kill",
                CMD_HIDE_TERMINAL: "Close Panel"
            }
        };

        $panel = $(Mustache.render(panelHTML, templateVars));
        panel = WorkspaceManager.createBottomPanel(PANEL_ID, $panel, PANEL_MIN_SIZE);

        // Override focus() so Shift+Escape can transfer focus to the terminal
        panel.focus = function () {
            const active = _getActiveTerminal();
            if (active) {
                active.focus();
                return true;
            }
            return false;
        };

        // Cache DOM references
        $contentArea = $panel.find(".terminal-content-area");
        $shellDropdown = $panel.find(".terminal-shell-dropdown");
        $flyoutList = $panel.find(".terminal-flyout-list");

        // "+" button creates a new terminal with the default shell
        $panel.find(".terminal-flyout-new-btn").on("click", function (e) {
            e.stopPropagation();
            _createNewTerminal();
        });

        // Dropdown chevron button toggles shell selector
        $panel.find(".terminal-flyout-dropdown-btn").on("click", _onDropdownButtonClick);

        // Refresh process info when user hovers over the flyout
        $panel.find(".terminal-tab-flyout").on("mouseenter", _refreshAllProcesses);

        // Listen for panel resize
        WorkspaceManager.on("workspaceUpdateLayout", _handleResize);

        // Focus terminal when the panel becomes visible
        const PanelView = require("view/PanelView");
        PanelView.on(PanelView.EVENT_PANEL_SHOWN, function (_event, panelId) {
            if (panelId === PANEL_ID) {
                const active = _getActiveTerminal();
                if (active) {
                    active.handleResize();
                    active.focus();
                }
                _showFocusHintToast();
            }
        });

        // Listen for theme changes via MutationObserver on body class
        const observer = new MutationObserver(function () {
            _updateAllThemes();
        });
        observer.observe(document.body, {attributes: true, attributeFilter: ["class"]});
    }

    /**
     * Populate the shell dropdown menu with checkmark on current default
     */
    function _populateShellDropdown() {
        const shells = ShellProfiles.getShells();
        const defaultShell = ShellProfiles.getDefaultShell();
        $shellDropdown.empty();
        for (const shell of shells) {
            const isSelected = defaultShell && defaultShell.name === shell.name;
            const $check = $('<span class="shell-check"></span>');
            if (isSelected) {
                $check.append('<i class="fa-solid fa-check"></i>');
            }
            const $item = $('<div class="shell-option"></div>')
                .attr("data-shell-name", shell.name)
                .append($check)
                .append($('<span></span>').text(shell.name));
            $item.on("click", function () {
                _hideShellDropdown();
                ShellProfiles.setDefaultShell(shell.name);
                _populateShellDropdown();
                _updateNewTerminalButtonLabel();
                _createNewTerminalWithShell(shell);
            });
            $shellDropdown.append($item);
        }
    }

    /**
     * Update the "+ New Terminal" button label.
     * Shows "Terminal" when using the system default, or the shell name when user switched.
     */
    function _updateNewTerminalButtonLabel() {
        const defaultShell = ShellProfiles.getDefaultShell();
        const isOriginal = defaultShell && defaultShell.name === originalDefaultShellName;
        const label = !defaultShell || isOriginal ? "Terminal" : defaultShell.name;
        $panel.find(".terminal-btn-label").text(label);
        $panel.find(".terminal-flyout-new-btn").attr("title", label);
    }

    /**
     * Show/hide the shell dropdown
     */
    function _showShellDropdown() {
        $shellDropdown.removeClass("forced-hidden");
        // Close on outside click
        setTimeout(function () {
            $(document).one("click", _hideShellDropdown);
        }, 0);
    }

    function _hideShellDropdown() {
        $shellDropdown.addClass("forced-hidden");
    }

    /**
     * Handle dropdown chevron button click: toggle shell selector
     */
    function _onDropdownButtonClick(e) {
        e.stopPropagation();
        if ($shellDropdown.hasClass("forced-hidden")) {
            _populateShellDropdown();
            _showShellDropdown();
        } else {
            _hideShellDropdown();
        }
    }

    /**
     * Create a new terminal with the default shell
     */
    async function _createNewTerminal() {
        const shell = ShellProfiles.getDefaultShell();
        return _createNewTerminalWithShell(shell);
    }

    /**
     * Create a new terminal with a specific shell profile
     */
    async function _createNewTerminalWithShell(shell) {
        if (!shell) {
            console.error("Terminal: No shell available");
            return;
        }

        // Get project root as cwd, converting VFS path to native platform path
        const projectRoot = ProjectManager.getProjectRoot();
        let cwd;
        if (projectRoot) {
            const fullPath = projectRoot.fullPath;
            const tauriPrefix = Phoenix.VFS.getTauriDir();
            if (fullPath.startsWith(tauriPrefix)) {
                cwd = Phoenix.fs.getTauriPlatformPath(fullPath);
            } else {
                cwd = fullPath;
            }
            // Remove trailing slash/backslash (posix_spawnp can fail with trailing slashes)
            if (cwd.length > 1 && (cwd.endsWith("/") || cwd.endsWith("\\"))) {
                cwd = cwd.slice(0, -1);
            }
        }

        // Create instance
        const instance = new TerminalInstance(nodeConnector, shell, cwd);

        // Set up callbacks
        instance.onTitleChanged = _onTerminalTitleChanged;
        instance.onProcessExit = _onTerminalProcessExit;

        // Create xterm UI
        instance.create($contentArea);

        // Add to list
        terminalInstances.push(instance);

        // Activate this terminal (also updates flyout)
        _activateTerminal(instance.id);

        // Show panel if hidden
        if (!panel.isVisible()) {
            panel.show();
        }

        // Spawn PTY process
        await instance.spawn();
    }

    /**
     * Activate a terminal tab (show it, hide others)
     */
    function _activateTerminal(id) {
        activeTerminalId = id;

        // Show/hide terminal containers
        for (const inst of terminalInstances) {
            if (inst.id === id) {
                inst.show();
            } else {
                inst.hide();
            }
        }

        _updateFlyout();
    }

    /**
     * Close a terminal instance, confirming first if a child process is running
     */
    async function _closeTerminal(id) {
        const idx = terminalInstances.findIndex(t => t.id === id);
        if (idx === -1) {
            return;
        }

        const instance = terminalInstances[idx];

        // Check for active child process before closing
        if (instance.isAlive) {
            try {
                const result = await nodeConnector.execPeer("getTerminalProcess", {id});
                const processName = result.process || "";
                if (processName && !_isShellProcess(processName)) {
                    const message = StringUtils.format(
                        Strings.TERMINAL_CLOSE_CONFIRM_MSG, _escapeHtml(processName)
                    );
                    const dialog = Dialogs.showConfirmDialog(
                        Strings.TERMINAL_CLOSE_CONFIRM_TITLE, message
                    );
                    const buttonId = await dialog.getPromise();
                    if (buttonId !== Dialogs.DIALOG_BTN_OK) {
                        return;
                    }
                }
            } catch (e) {
                // Terminal may already be dead; proceed with close
            }
        }

        instance.dispose();
        terminalInstances.splice(idx, 1);
        delete processInfo[id];

        // If we closed the active terminal, activate another
        if (activeTerminalId === id) {
            if (terminalInstances.length > 0) {
                const newActive = terminalInstances[Math.min(idx, terminalInstances.length - 1)];
                _activateTerminal(newActive.id);
            } else {
                activeTerminalId = null;
            }
        }

        // If no terminals left, hide the panel
        if (terminalInstances.length === 0) {
            panel.hide();

        }

        _updateFlyout();
    }

    /**
     * Get the active terminal instance
     */
    function _getActiveTerminal() {
        return terminalInstances.find(t => t.id === activeTerminalId) || null;
    }

    /**
     * Clear the active terminal
     */
    function _clearActiveTerminal() {
        const active = _getActiveTerminal();
        if (active) {
            active.clear();
        }
    }

    /**
     * Kill the active terminal's process
     */
    function _killActiveTerminal() {
        const active = _getActiveTerminal();
        if (active && active.isAlive) {
            nodeConnector.execPeer("killTerminal", {id: active.id}).catch((err) => {
                console.error("Terminal: kill error:", err);
            });
        }
    }

    /**
     * Handle terminal title change — also fetches and displays the foreground process.
     * Clears the stale-title flag since the shell has provided its own title.
     */
    function _onTerminalTitleChanged(id) {
        const instance = terminalInstances.find(t => t.id === id);
        if (instance) {
            instance._titleStale = false;
        }
        _updateFlyout();
        _updateTabProcess(id);
    }

    /**
     * Fetch and display the foreground process for a terminal tab
     */
    function _updateTabProcess(id) {
        const instance = terminalInstances.find(t => t.id === id);
        if (!instance || !instance.isAlive) {
            return;
        }
        nodeConnector.execPeer("getTerminalProcess", {id}).then(function (result) {
            const newProc = result.process || "";
            if (processInfo[id] !== newProc) {
                const oldProc = processInfo[id];
                processInfo[id] = newProc;
                // When a child process exits and the shell regains
                // foreground, the child may have set a custom title
                // via escape sequences. Some shells (e.g. zsh on
                // macOS) don't emit a title reset, leaving inst.title
                // stale. Mark it so _updateFlyout can fall back to
                // the profile name. If the shell DOES emit a title
                // change (e.g. bash on Linux), _onTerminalTitleChanged
                // clears this flag immediately.
                if (oldProc && !_isShellProcess(oldProc) && _isShellProcess(newProc)) {
                    instance._titleStale = true;
                }
                _updateFlyout();
            }
        }).catch(function () {
            // Terminal may have been closed; ignore
        });
    }

    /**
     * Refresh process info for all alive terminals.
     * Called on flyout hover so the tab bar is up-to-date when the user looks.
     */
    function _refreshAllProcesses() {
        for (const inst of terminalInstances) {
            if (inst.isAlive) {
                _updateTabProcess(inst.id);
            }
        }
    }

    /**
     * Rebuild the flyout panel to reflect current tabs
     */
    /**
     * Extract the last directory name from a terminal title.
     * Title format is typically "user@host: /path/to/dir" or "user@host: ~/path/to/dir".
     */
    function _extractCwdBasename(title) {
        const colonIdx = title.indexOf(": ");
        const pathPart = colonIdx >= 0 ? title.slice(colonIdx + 2) : title;
        const trimmed = pathPart.replace(/\/+$/, "");
        const lastSlash = trimmed.lastIndexOf("/");
        return lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
    }

    function _updateFlyout() {
        $flyoutList.empty();
        for (const inst of terminalInstances) {
            const proc = processInfo[inst.id] || "";
            const basename = proc ? proc.split("/").pop().split("\\").pop() : "";

            // Label: process basename; right side: cwd basename; tooltip: full title.
            // If the title is stale (child set it and the shell didn't reset it),
            // fall back to the shell profile name.
            const label = basename || "Terminal";
            const displayTitle = inst._titleStale ? inst.shellProfile.name : inst.title;
            const cwdName = _extractCwdBasename(displayTitle);

            const $item = $('<div class="terminal-flyout-item"></div>')
                .attr("data-terminal-id", inst.id)
                .attr("title", displayTitle)
                .toggleClass("active", inst.id === activeTerminalId);

            if (!inst.isAlive) {
                $item.css("opacity", "0.6");
            }

            $item.append('<span class="terminal-flyout-close"><i class="fa-solid fa-xmark"></i></span>');
            $item.append('<span class="terminal-flyout-icon"><i class="fa-solid fa-terminal"></i></span>');
            $item.append($('<span class="terminal-flyout-title"></span>').text(label));
            if (cwdName) {
                $item.append($('<span class="terminal-flyout-cwd"></span>').text(cwdName));
            }

            $item.on("click", function (e) {
                if (!$(e.target).closest(".terminal-flyout-close").length) {
                    _activateTerminal(inst.id);
                }
            });
            $item.find(".terminal-flyout-close").on("click", function (e) {
                e.stopPropagation();
                _closeTerminal(inst.id);
            });

            $flyoutList.append($item);
        }
    }

    /**
     * Handle terminal process exit
     */
    function _onTerminalProcessExit(id, exitCode) {
        delete processInfo[id];
        _updateFlyout();
    }

    /**
     * Show the terminal panel. Creates a new terminal if none exist.
     * If the panel is visible and the active terminal is focused and there
     * are 2+ terminals, cycles to the next one. Otherwise just shows and
     * focuses the active terminal.
     */
    function _showTerminal() {
        if (terminalInstances.length === 0) {
            _createNewTerminal();
            return;
        }
        const active = _getActiveTerminal();
        const terminalHasFocus = active && active.$container &&
            active.$container[0].contains(document.activeElement);
        if (terminalInstances.length >= 2 && panel.isVisible() && terminalHasFocus) {
            const activeIdx = terminalInstances.findIndex(t => t.id === activeTerminalId);
            const nextIdx = (activeIdx + 1) % terminalInstances.length;
            _activateTerminal(terminalInstances[nextIdx].id);
        } else {
            panel.show();
            if (active) {
                active.handleResize();
                active.focus();
            }
        }
    }

    /**
     * Handle workspace resize
     */
    function _handleResize() {
        const active = _getActiveTerminal();
        if (active) {
            active.handleResize();
        }
    }

    /**
     * Update all terminal themes (after editor theme change)
     */
    function _updateAllThemes() {
        for (const inst of terminalInstances) {
            inst.updateTheme();
        }
    }

    /**
     * Show a one-time toast hint about Shift+Escape to switch focus
     */
    function _showFocusHintToast() {
        if (_focusToastShown) {
            return;
        }
        _focusToastShown = true;

        const shortcutKey = '<kbd>Shift+Esc</kbd>';
        const message = StringUtils.format(Strings.TERMINAL_FOCUS_HINT, shortcutKey);
        NotificationUI.showToastOn($contentArea[0], message, {
            autoCloseTimeS: 5,
            dismissOnClick: true
        });
    }

    /**
     * Escape HTML special characters
     */
    function _escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Clean up all terminals (on app quit).
     * Fire-and-forget — PTY kills are not awaited.
     */
    function _disposeAll() {
        for (const inst of terminalInstances) {
            inst.dispose();
        }
        terminalInstances = [];
        processInfo = {};
    }

    /**
     * Async version: awaits all PTY kill commands so the
     * caller can be sure the kill signals have been sent
     * and acknowledged by the Node side.
     */
    async function _disposeAllAsync() {
        const killPromises = terminalInstances
            .filter(function (inst) { return inst.isAlive && !inst._disposed; })
            .map(function (inst) {
                return nodeConnector.execPeer("killTerminal", {id: inst.id})
                    .catch(function () {});
            });
        _disposeAll();
        await Promise.all(killPromises);
    }

    // Register commands
    CommandManager.register("New Terminal", CMD_NEW_TERMINAL, _createNewTerminal);
    CommandManager.register(Strings.CMD_VIEW_TERMINAL, CMD_VIEW_TERMINAL, _showTerminal);

    // Initialize on app ready
    AppInit.appReady(function () {
        if (Phoenix.isSpecRunnerWindow) {
            return;
        }

        _initNodeConnector();
        _createPanel();

        // Gate user-initiated panel close (X button): confirm if needed, then
        // dispose all terminals. Programmatic hide() just collapses the panel
        // without disposing terminals.
        panel.registerOnCloseRequestedHandler(async function () {
            // Query all terminals in parallel to avoid sequential 2s waits on Windows
            const aliveInstances = terminalInstances.filter(inst => inst.isAlive);
            const results = await Promise.all(aliveInstances.map(function (inst) {
                return nodeConnector.execPeer("getTerminalProcess", {id: inst.id})
                    .catch(function () { return {process: ""}; });
            }));
            const activeProcesses = [];
            for (const result of results) {
                if (result.process && !_isShellProcess(result.process)) {
                    activeProcesses.push(result.process);
                }
            }

            let title, message, confirmText;
            const count = terminalInstances.length;
            const procCount = activeProcesses.length;

            if (count === 1 && procCount > 0) {
                // Single terminal with an active process
                title = Strings.TERMINAL_CLOSE_SINGLE_TITLE;
                message = Strings.TERMINAL_CLOSE_SINGLE_MSG;
                confirmText = Strings.TERMINAL_CLOSE_SINGLE_BTN;
            } else if (count > 1 && procCount === 0) {
                // Multiple terminals, no active processes
                title = Strings.TERMINAL_CLOSE_ALL_TITLE;
                message = Strings.TERMINAL_CLOSE_ALL_MSG;
                confirmText = Strings.TERMINAL_CLOSE_ALL_BTN;
            } else if (count > 1 && procCount > 0) {
                // Multiple terminals, some with active processes
                title = Strings.TERMINAL_CLOSE_ALL_TITLE;
                message = procCount === 1
                    ? Strings.TERMINAL_CLOSE_ALL_MSG_PROCESS_ONE
                    : StringUtils.format(Strings.TERMINAL_CLOSE_ALL_MSG_PROCESS_MANY, procCount);
                confirmText = Strings.TERMINAL_CLOSE_ALL_STOP_BTN;
            } else {
                // Single idle terminal — no confirmation needed
                await _disposeAllAsync();
                activeTerminalId = null;
                _updateFlyout();
                return true;
            }

            const buttons = [
                {className: Dialogs.DIALOG_BTN_CLASS_NORMAL, id: Dialogs.DIALOG_BTN_CANCEL, text: Strings.CANCEL},
                {className: Dialogs.DIALOG_BTN_CLASS_PRIMARY, id: Dialogs.DIALOG_BTN_OK, text: confirmText}
            ];
            const dialog = Dialogs.showModalDialog(
                DefaultDialogs.DIALOG_ID_INFO, title, message, buttons
            );
            const buttonId = await dialog.getPromise();
            if (buttonId !== Dialogs.DIALOG_BTN_OK) {
                return false;
            }

            // User confirmed — dispose everything
            await _disposeAllAsync();
            activeTerminalId = null;
            _updateFlyout();
            return true;
        });

        // Detect shells
        ShellProfiles.init(nodeConnector).then(function () {
            const shells = ShellProfiles.getShells();
            const systemDefault = ShellProfiles.getDefaultShell();
            originalDefaultShellName = systemDefault ? systemDefault.name : null;
            if (shells.length <= 1) {
                $panel.find(".terminal-flyout-dropdown-btn").addClass("forced-hidden");
            }
            _populateShellDropdown();
            _updateNewTerminalButtonLabel();
        });

        // Clean up on window unload
        window.addEventListener("beforeunload", _disposeAll);
    });

    // Export for testing
    exports.CMD_VIEW_TERMINAL = CMD_VIEW_TERMINAL;
    exports.CMD_NEW_TERMINAL = CMD_NEW_TERMINAL;

    /**
     * Write data to the active terminal's PTY. Test-only helper.
     * @param {string} data The text to send to the terminal.
     * @return {Promise}
     */
    exports._writeToActiveTerminal = function (data) {
        const active = _getActiveTerminal();
        if (!active || !active.isAlive) {
            return Promise.reject(new Error("No active terminal"));
        }
        return nodeConnector.execPeer("writeTerminal", {
            id: active.id, data
        });
    };

    /**
     * Dispose all terminal instances. Test-only helper.
     * Awaits all PTY kill commands so the caller can be
     * sure processes have been signalled before the test
     * window is torn down.
     */
    exports._disposeAll = async function () {
        await _disposeAllAsync();
        activeTerminalId = null;
    };
});
