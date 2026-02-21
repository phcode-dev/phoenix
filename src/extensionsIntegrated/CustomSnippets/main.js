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

/* eslint-disable no-invalid-this */
/* global logger */
define(function (require, exports, module) {
    const AppInit = require("utils/AppInit");
    const CommandManager = require("command/CommandManager");
    const Menus = require("command/Menus");
    const Commands = require("command/Commands");
    const WorkspaceManager = require("view/WorkspaceManager");
    const Strings = require("strings");
    const Mustache = require("thirdparty/mustache/mustache");
    const Metrics = require("utils/Metrics");

    const Driver = require("./driver");
    const SnippetsList = require("./snippetsList");
    const CodeHintIntegration = require("./codeHintIntegration");
    const Helper = require("./helper");
    const UIHelper = require("./UIHelper");
    const SnippetsState = require("./snippetsState");
    const SnippetCursorManager = require("./snippetCursorManager");
    const Global = require("./global");

    const snippetsPanelTpl = require("text!./htmlContent/snippets-panel.html");
    // the html content of the panel will be stored in this variable
    let $snippetsPanel;

    const MY_COMMAND_ID = "custom_snippets";
    const PANEL_ID = "customSnippets.panel";
    const MENU_ITEM_NAME = Strings.CUSTOM_SNIPPETS_MENU_ITEM_NAME; // this name will appear as the menu item
    const PANEL_MIN_SIZE = 340; // the minimum size more than which its height cannot be decreased

    // this is to store the panel reference,
    // as we only need to create this once. rest of the time we can just toggle the visibility of the panel
    let customSnippetsPanel;

    /**
     * This function is called when the first time the custom snippets panel button is clicked
     * this is responsible to create the custom snippets bottom panel and show that
     * @private
     */
    function _createPanel() {
        customSnippetsPanel = WorkspaceManager.createBottomPanel(PANEL_ID, $snippetsPanel, PANEL_MIN_SIZE,
            Strings.CUSTOM_SNIPPETS_PANEL_TITLE);
        UIHelper.init(customSnippetsPanel);
        customSnippetsPanel.show();

        // also register the handlers
        _registerHandlers();

        $("#filter-snippets-input").val("");
        UIHelper.initializeListViewToolbarTitle();
        SnippetsList.showSnippetsList(); // to show the snippets list in the snippets panel
    }

    /**
     * This function is responsible to toggle the visibility of the panel
     * this is called every time (after the panel is created) to show/hide the panel
     * @private
     */
    function _togglePanelVisibility() {
        if (customSnippetsPanel.isVisible()) {
            customSnippetsPanel.hide();
            CommandManager.get(MY_COMMAND_ID).setChecked(false);
        } else {
            customSnippetsPanel.show();
            CommandManager.get(MY_COMMAND_ID).setChecked(true);

            $("#filter-snippets-input").val("");
            UIHelper.initializeListViewToolbarTitle();
            SnippetsList.showSnippetsList(); // we just remake the snippets list UI to make sure it is always on point
        }
    }

    /**
     * This function is responsible to hide the panel
     * this is called when user clicks on the 'cross' icon inside the panel itself and that is the reason,
     * why we don't need to check whether the panel is visible or not
     * @private
     */
    function _hidePanel() {
        customSnippetsPanel.hide();
        CommandManager.get(MY_COMMAND_ID).setChecked(false);
    }

    /**
     * This function is responsible to create the bottom panel, if not created
     * if panel is already created, we just toggle its visibility
     * this will be called when the custom snippets menu item is clicked from the menu bar
     */
    function showCustomSnippetsPanel() {
        // make sure that the panel is not created,
        // if it is then we can just toggle its visibility
        if (!customSnippetsPanel) {
            _createPanel();
            CommandManager.get(MY_COMMAND_ID).setChecked(true);
        } else {
            _togglePanelVisibility();
        }
    }

    /**
     * This function is responsible to add the Custom Snippets menu item to the menu bar
     * @private
     */
    function _addToMenu() {
        const menu = Menus.getMenu(Menus.AppMenuBar.FILE_MENU);
        menu.addMenuItem(MY_COMMAND_ID, "", Menus.BEFORE, Commands.FILE_EXTENSION_MANAGER);
    }

    /**
     * This function is responsible to register all the required handlers
     * @private
     */
    function _registerHandlers() {
        const $saveCustomSnippetBtn = $("#save-custom-snippet-btn");
        const $cancelCustomSnippetBtn = $("#cancel-custom-snippet-btn");
        const $abbrInput = $("#abbr-box");
        const $descInput = $("#desc-box");
        const $templateInput = $("#template-text-box");
        const $fileExtnInput = $("#file-extn-box");
        const $addSnippetBtn = $("#add-snippet-btn");
        const $addNewSnippetBtn = $("#add-new-snippet-btn");
        const $backToListMenuBtn = $("#back-to-list-menu-btn");
        const $filterInput = $("#filter-snippets-input");

        const $editAbbrInput = $("#edit-abbr-box");
        const $editDescInput = $("#edit-desc-box");
        const $editTemplateInput = $("#edit-template-text-box");
        const $editFileExtnInput = $("#edit-file-extn-box");
        const $saveEditSnippetBtn = $("#save-edit-snippet-btn");
        const $cancelEditSnippetBtn = $("#cancel-edit-snippet-btn");

        $addSnippetBtn.on("click", function () {
            UIHelper.showAddSnippetMenu();
        });

        $addNewSnippetBtn.on("click", function () {
            UIHelper.showAddSnippetMenu();
        });

        $backToListMenuBtn.on("click", function () {
            UIHelper.showSnippetListMenu();
            SnippetsList.showSnippetsList();
        });

        $saveCustomSnippetBtn.on("click", function () {
            Driver.handleSaveBtnClick();
        });

        $cancelCustomSnippetBtn.on("click", function () {
            UIHelper.showSnippetListMenu();
            SnippetsList.showSnippetsList();
        });

        $abbrInput.on("input", Helper.toggleSaveButtonDisability);
        $templateInput.on("input", Helper.toggleSaveButtonDisability);

        $abbrInput.on("keydown", function (e) {
            Helper.validateAbbrInput(e, this);
        });
        $abbrInput.on("paste", function (e) {
            Helper.handleAbbrPaste(e, $(this));
        });

        $descInput.on("keydown", function (e) {
            Helper.validateDescInput(e, this);
        });
        $descInput.on("paste", function (e) {
            Helper.handleDescPaste(e, $(this));
        });

        $templateInput.on("keydown", function (e) {
            Helper.handleTextareaTabKey(e, this);
        });

        $fileExtnInput.on("input", function () {
            Helper.handleFileExtensionInput($(this));
        });
        $fileExtnInput.on("keypress", function (e) {
            Helper.handleFileExtensionKeypress(e, this);
        });
        $fileExtnInput.on("paste", function (e) {
            Helper.handleFileExtensionPaste(e, $(this));
        });

        $editAbbrInput.on("input", Helper.toggleEditSaveButtonDisability);
        $editDescInput.on("input", Helper.toggleEditSaveButtonDisability);
        $editTemplateInput.on("input", Helper.toggleEditSaveButtonDisability);
        $editFileExtnInput.on("input", Helper.toggleEditSaveButtonDisability);

        $editAbbrInput.on("keydown", function (e) {
            Helper.validateAbbrInput(e, this);
        });
        $editAbbrInput.on("paste", function (e) {
            Helper.handleAbbrPaste(e, $(this));
        });

        $editDescInput.on("keydown", function (e) {
            Helper.validateDescInput(e, this);
        });
        $editDescInput.on("paste", function (e) {
            Helper.handleDescPaste(e, $(this));
        });

        $editTemplateInput.on("keydown", function (e) {
            Helper.handleTextareaTabKey(e, this);
        });

        $editFileExtnInput.on("input", function () {
            Helper.handleFileExtensionInput($(this));
        });
        $editFileExtnInput.on("keypress", function (e) {
            Helper.handleFileExtensionKeypress(e, this);
        });
        $editFileExtnInput.on("paste", function (e) {
            Helper.handleFileExtensionPaste(e, $(this));
        });

        $saveEditSnippetBtn.on("click", function () {
            Driver.handleEditSaveBtnClick();
        });

        $cancelEditSnippetBtn.on("click", function () {
            Driver.handleCancelEditBtnClick();
        });

        // filter input event handler
        $filterInput.on("keyup input", function (event) {
            // if user presses 'esc' we clear the input field
            if (event && event.key === "Escape") {
                $(this).val("");
                SnippetsList.showSnippetsList();
                return;
            }
            SnippetsList.showSnippetsList();
        });
    }

    // When the panel tab is closed externally (e.g. via the × button),
    // update the menu checked state to stay in sync.
    WorkspaceManager.on(WorkspaceManager.EVENT_WORKSPACE_PANEL_HIDDEN, function (event, panelID) {
        if (panelID === PANEL_ID && customSnippetsPanel) {
            CommandManager.get(MY_COMMAND_ID).setChecked(false);
        }
    });

    AppInit.appReady(function () {
        CommandManager.register(MENU_ITEM_NAME, MY_COMMAND_ID, showCustomSnippetsPanel);
        // Render template with localized strings
        const renderedHtml = Mustache.render(snippetsPanelTpl, {Strings: Strings});
        $snippetsPanel = $(renderedHtml);
        _addToMenu();
        CodeHintIntegration.init();

        // load snippets from file storage
        SnippetsState.loadSnippetsFromState()
            .then(function () {
                // track boot-time snippet count (only if user has snippets)
                const snippetCount = Global.SnippetHintsList.length;
                if (snippetCount > 0) {
                    const countRange = Metrics.getRangeName(snippetCount);
                    Metrics.countEvent(Metrics.EVENT_TYPE.EDITOR, "snipt", `boot.${countRange}`);
                }
            })
            .catch(function (error) {
                logger.reportError(error, "Custom Snippets: didn't load on app init");
            });

        SnippetCursorManager.registerHandlers();
    });
});
