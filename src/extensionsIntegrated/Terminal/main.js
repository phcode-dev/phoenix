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
    const Menus = require("command/Menus");
    const WorkspaceManager = require("view/WorkspaceManager");
    const ProjectManager = require("project/ProjectManager");
    const ExtensionUtils = require("utils/ExtensionUtils");
    const NodeConnector = require("NodeConnector");
    const Mustache = require("thirdparty/mustache/mustache");
    const Dialogs = require("widgets/Dialogs");
    const Strings = require("strings");
    const StringUtils = require("utils/StringUtils");

    const TerminalInstance = require("./TerminalInstance");
    const ShellProfiles = require("./ShellProfiles");
    const panelHTML = require("text!./terminal-panel.html");

    // Load xterm.css (terminal panel styles are in src/styles/Extn-Terminal.less)
    ExtensionUtils.loadStyleSheet(module, "../../thirdparty/xterm/xterm.css");

    // Constants
    const CMD_TOGGLE_TERMINAL = "terminal.toggle";
    const CMD_NEW_TERMINAL = "terminal.new";
    const PANEL_ID = "terminal-panel";
    const PANEL_MIN_SIZE = 100;

    // Shell process names — if the foreground process is one of these, no child is running
    const SHELL_NAMES = new Set([
        "bash", "zsh", "fish", "sh", "dash", "ksh", "csh", "tcsh",
        "pwsh", "powershell", "cmd.exe", "nu", "elvish", "xonsh",
        "login"
    ]);

    /**
     * Check if a process name is a shell (handles full paths like /bin/bash)
     */
    function _isShellProcess(processName) {
        if (!processName) {
            return true;
        }
        const basename = processName.split("/").pop().split("\\").pop();
        return SHELL_NAMES.has(basename);
    }

    // State
    let panel = null;
    let nodeConnector = null;
    let terminalInstances = [];   // All terminal instances
    let activeTerminalId = null;  // Currently visible terminal
    let processInfo = {};         // id -> processName from PTY
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
            });
            $shellDropdown.append($item);
        }
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
            _updateToolbarIcon(true);
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
            _updateToolbarIcon(false);
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
     * Handle terminal title change — also fetches and displays the foreground process
     */
    function _onTerminalTitleChanged(id, title) {
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
                processInfo[id] = newProc;
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

            // Label: process basename; right side: cwd basename; tooltip: full title
            const label = basename || "Terminal";
            const cwdName = _extractCwdBasename(inst.title);

            const $item = $('<div class="terminal-flyout-item"></div>')
                .attr("data-terminal-id", inst.id)
                .attr("title", inst.title)
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
     * Toggle the terminal panel visibility
     */
    function _togglePanel() {
        if (panel.isVisible()) {
            panel.hide();
            _updateToolbarIcon(false);
        } else {
            if (terminalInstances.length === 0) {
                _createNewTerminal();
            } else {
                panel.show();
                _updateToolbarIcon(true);
                const active = _getActiveTerminal();
                if (active) {
                    active.handleResize();
                    active.focus();
                }
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
     * Update toolbar icon active state
     */
    function _updateToolbarIcon(isActive) {
        const $icon = $("#toolbar-terminal");
        if (isActive) {
            $icon.addClass("selected-button");
        } else {
            $icon.removeClass("selected-button");
        }
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
     * Clean up all terminals (on app quit)
     */
    function _disposeAll() {
        for (const inst of terminalInstances) {
            inst.dispose();
        }
        terminalInstances = [];
        processInfo = {};
    }

    // Register commands
    CommandManager.register("New Terminal", CMD_NEW_TERMINAL, _createNewTerminal);
    CommandManager.register("Toggle Terminal", CMD_TOGGLE_TERMINAL, _togglePanel);

    // Add menu item
    const fileMenu = Menus.getMenu(Menus.AppMenuBar.FILE_MENU);
    if (fileMenu) {
        fileMenu.addMenuItem(CMD_NEW_TERMINAL, null, Menus.AFTER, "file.close");
    }

    // Initialize on app ready
    AppInit.appReady(function () {
        if (Phoenix.isSpecRunnerWindow) {
            return;
        }

        _initNodeConnector();
        _createPanel();

        // Set up toolbar icon click handler
        const $toolbarIcon = $("#toolbar-terminal");
        $toolbarIcon.html('<i class="fa-solid fa-terminal"></i>');
        $toolbarIcon.removeClass("forced-hidden");
        $toolbarIcon.on("click", _togglePanel);

        // Detect shells
        ShellProfiles.init(nodeConnector).then(function () {
            const shells = ShellProfiles.getShells();
            if (shells.length <= 1) {
                $panel.find(".terminal-flyout-dropdown-btn").addClass("forced-hidden");
            }
            _populateShellDropdown();
        });

        // Clean up on window unload
        window.addEventListener("beforeunload", _disposeAll);
    });

    // Export for testing
    exports.CMD_TOGGLE_TERMINAL = CMD_TOGGLE_TERMINAL;
    exports.CMD_NEW_TERMINAL = CMD_NEW_TERMINAL;
});
