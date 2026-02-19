/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License along
 * with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

/**
 * DefaultPanelView - A launcher panel shown in the bottom panel area when no
 * other panels are open. Provides quick-access buttons for common panels
 * (Problems, Find in Files, Git, Custom Snippets, Keyboard Shortcuts) and a
 * link to the documentation.
 *
 * @module view/DefaultPanelView
 */
define(function (require, exports, module) {

    const AppInit = require("utils/AppInit"),
        Commands = require("command/Commands"),
        CommandManager = require("command/CommandManager"),
        Strings = require("strings"),
        WorkspaceManager = require("view/WorkspaceManager"),
        PanelView = require("view/PanelView");

    /**
     * Descriptors for each launcher button.
     */
    const _panelButtons = [
        {
            id: "problems",
            icon: "fa-solid fa-triangle-exclamation",
            label: Strings.CMD_VIEW_TOGGLE_PROBLEMS || "Problems",
            commandID: Commands.VIEW_TOGGLE_PROBLEMS
        },
        {
            id: "search",
            icon: "fa-solid fa-magnifying-glass",
            label: Strings.CMD_FIND_IN_FILES || "Find in Files",
            commandID: Commands.CMD_FIND_IN_FILES
        },
        {
            id: "git",
            icon: "fa-solid fa-code-branch",
            label: Strings.GIT_PANEL_TITLE || "Git",
            commandID: Commands.CMD_GIT_TOGGLE_PANEL
        },
        {
            id: "snippets",
            icon: "fa-solid fa-code",
            label: Strings.CUSTOM_SNIPPETS_PANEL_TITLE || "Custom Snippets",
            commandID: "custom_snippets"
        },
        {
            id: "shortcuts",
            icon: "fa-solid fa-keyboard",
            label: Strings.KEYBOARD_SHORTCUT_PANEL_TITLE || "Keyboard Shortcuts",
            commandID: Commands.HELP_TOGGLE_SHORTCUTS_PANEL
        }
    ];

    /** @type {Panel} The default panel instance */
    let _panel;

    /** @type {jQueryObject} The panel DOM element */
    let _$panel;

    /**
     * Build the panel DOM.
     * @return {jQueryObject}
     * @private
     */
    function _buildPanelHTML() {
        let $panel = $('<div id="default-panel" class="bottom-panel"></div>');
        let $content = $('<div class="default-panel-content"></div>');
        let $heading = $('<div class="default-panel-heading"></div>')
            .text(Strings.BOTTOM_PANEL_DEFAULT_HEADING);
        $content.append($heading);

        let $buttonsRow = $('<div class="default-panel-buttons"></div>');

        _panelButtons.forEach(function (btn) {
            let $button = $('<button class="default-panel-btn"></button>')
                .attr("data-command", btn.commandID)
                .attr("data-btn-id", btn.id)
                .attr("title", btn.label);
            let $icon = $('<i></i>').addClass(btn.icon);
            let $label = $('<span class="default-panel-btn-label"></span>').text(btn.label);
            $button.append($icon).append($label);
            $buttonsRow.append($button);
        });

        $content.append($buttonsRow);

        $panel.append($content);
        return $panel;
    }

    /**
     * Check whether Git is available for the current project.
     * The Git extension hides its toolbar icon with the "forced-hidden" class
     * when Git is not available (no binary, not a repo, extension disabled, etc.).
     * @return {boolean}
     * @private
     */
    function _isGitAvailable() {
        const $gitIcon = $("#git-toolbar-icon");
        return $gitIcon.length > 0 && !$gitIcon.hasClass("forced-hidden");
    }

    /**
     * Check whether there are currently lint errors/warnings.
     * The status bar indicator gets the "inspection-errors" class when problems exist.
     * @return {boolean}
     * @private
     */
    function _hasProblems() {
        const $indicator = $("#status-inspection");
        return $indicator.length > 0 && $indicator.hasClass("inspection-errors");
    }

    /**
     * Show or hide the Git and Problems buttons based on current state.
     * @private
     */
    function _updateButtonVisibility() {
        if (!_$panel) {
            return;
        }
        _$panel.find('.default-panel-btn[data-btn-id="git"]').toggle(_isGitAvailable());
        _$panel.find('.default-panel-btn[data-btn-id="problems"]').toggle(_hasProblems());
    }

    /**
     * Set up MutationObservers on the Git toolbar icon and status-inspection
     * indicator so that button visibility updates live.
     * @private
     */
    function _observeStateChanges() {
        // Watch Git toolbar icon for class changes (forced-hidden added/removed)
        const gitIcon = document.getElementById("git-toolbar-icon");
        if (gitIcon) {
            const gitObserver = new MutationObserver(_updateButtonVisibility);
            gitObserver.observe(gitIcon, {attributes: true, attributeFilter: ["class"]});
        }

        // Watch status-inspection indicator for class changes (inspection-errors)
        const statusInspection = document.getElementById("status-inspection");
        if (statusInspection) {
            const inspectionObserver = new MutationObserver(_updateButtonVisibility);
            inspectionObserver.observe(statusInspection, {attributes: true, attributeFilter: ["class"]});
        }
    }

    /**
     * Initialise the default panel. Called once at appReady.
     * @private
     */
    function _init() {
        _$panel = _buildPanelHTML();
        _panel = WorkspaceManager.createBottomPanel(
            WorkspaceManager.DEFAULT_PANEL_ID,
            _$panel,
            undefined,
            Strings.BOTTOM_PANEL_DEFAULT_TITLE
        );

        // Button click handler: execute the command to open the target panel.
        // The auto-hide listener (EVENT_PANEL_SHOWN) will close the default panel.
        _$panel.on("click", ".default-panel-btn", function () {
            let commandID = $(this).attr("data-command");
            if (commandID) {
                CommandManager.execute(commandID);
            }
        });

        // Auto-hide when any other panel is shown.
        // hide() is a no-op if the panel is already closed, so no guard needed.
        PanelView.on(PanelView.EVENT_PANEL_SHOWN, function (event, panelID) {
            if (panelID !== WorkspaceManager.DEFAULT_PANEL_ID) {
                _panel.hide();
            }
            if (panelID === WorkspaceManager.DEFAULT_PANEL_ID) {
                _updateButtonVisibility();
            }
        });

        // Initial visibility update and set up live observers
        _updateButtonVisibility();
        _observeStateChanges();
    }

    AppInit.appReady(_init);
});
