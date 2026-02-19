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
define(function (require, exports, module) {
    const StringUtils = require("utils/StringUtils");
    const Strings = require("strings");

    /** @type {Object} Reference to the panel instance, set via init() */
    let _panel;

    /**
     * this is a generic function to show error messages for input fields
     *
     * @param {string} inputId - input field id
     * @param {string} wrapperId - wrapper element id
     * @param {string} errorMessage - error message to display
     * @param {string} errorId - Unique ID for the error message element
     */
    function showError(inputId, wrapperId, errorMessage, errorId) {
        // First, clear any existing error messages for this input field
        const $inputField = $(`#${inputId}`);
        const $wrapper = $(`#${wrapperId}`);

        // Remove any existing error messages in this wrapper
        $wrapper.find(".error-message").remove();

        // Remove error styling from the input field
        $inputField.removeClass("error-input");

        // Now show the new error message
        const $errorMessage = $("<div>").attr("id", errorId).addClass("error-message").text(errorMessage);

        $wrapper.append($errorMessage);

        // highlight the input field with error
        $inputField.addClass("error-input");

        // to automatically remove it after 5 seconds
        setTimeout(function () {
            $(`#${errorId}`).fadeOut(function () {
                $(this).remove();
            });
            $inputField.removeClass("error-input");
        }, 5000);

        $inputField.one("input", function () {
            $(`#${errorId}`).remove();
            $(this).removeClass("error-input");
        });
    }

    /**
     * This function is called when there are no available snippets to display
     * this is called inside the 'showSnippetsList' function inside the snippetsList.js file
     * in that case we need to show the empty snippet message
     */
    function showEmptySnippetMessage() {
        const $emptySnippet = $("#no-snippets-wrapper");
        const $snippetsList = $("#snippets-list-wrapper");

        $emptySnippet.removeClass("hidden");
        $snippetsList.addClass("hidden");
    }

    /**
     * This function is called when there are snippets to display.
     * Note: this function just updates the hidden state from the wrapper divs
     * so this just unhides the wrapper. it doesn't add the snippet items
     * this is called inside the 'showSnippetsList' function inside the snippetsList.js file
     */
    function showSnippetsList() {
        const $emptySnippet = $("#no-snippets-wrapper");
        const $snippetsList = $("#snippets-list-wrapper");

        $emptySnippet.addClass("hidden");
        $snippetsList.removeClass("hidden");
    }

    /**
     * This function clears all the existing items inside the snippets list wrapper
     * this is called everytime users switches back to the snippets list view,
     * because we rebuild the snippets list menu everytime
     */
    function clearSnippetsList() {
        const $snippetsListWrapper = $("#snippets-list-wrapper");
        $snippetsListWrapper.empty();
    }

    /**
     * This function is responsible to show the add snippet menu
     * add snippet menu is the menu which allows users to create a new snippet
     * this is called when user clicks on the plus button at the toolbar or the add new snippet button
     */
    function showAddSnippetMenu() {
        const $addSnippetMenu = $("#custom-snippets-add-new");
        const $snippetListMenu = $("#custom-snippets-list");
        const $backToListMenuBtn = $("#back-to-list-menu-btn");
        const $addNewSnippetBtn = $("#add-new-snippet-btn");
        const $filterSnippetsPanel = $("#filter-snippets-panel");

        $addSnippetMenu.removeClass("hidden");
        $snippetListMenu.addClass("hidden");

        $backToListMenuBtn.removeClass("hidden");
        $addNewSnippetBtn.addClass("hidden");
        $filterSnippetsPanel.addClass("hidden");

        if (_panel) {
            _panel.setTitle(Strings.CUSTOM_SNIPPETS_ADD_PANEL_TITLE);
        }
    }

    /**
     * This function is responsible to show the snippet list menu
     * snippet list menu is the menu which shows the list of all the snippets
     * this is called when user clicks on the back button from add snippet menu
     */
    function showSnippetListMenu() {
        const $addSnippetMenu = $("#custom-snippets-add-new");
        const $editSnippetMenu = $("#custom-snippets-edit");
        const $snippetListMenu = $("#custom-snippets-list");
        const $backToListMenuBtn = $("#back-to-list-menu-btn");
        const $addNewSnippetBtn = $("#add-new-snippet-btn");
        const $filterSnippetsPanel = $("#filter-snippets-panel");

        $addSnippetMenu.addClass("hidden");
        $editSnippetMenu.addClass("hidden");
        $snippetListMenu.removeClass("hidden");

        $backToListMenuBtn.addClass("hidden");
        $addNewSnippetBtn.removeClass("hidden");
        $filterSnippetsPanel.removeClass("hidden");

        if (_panel) {
            _panel.setTitle(Strings.CUSTOM_SNIPPETS_PANEL_TITLE);
        }

        $("#filter-snippets-input").val("");
    }

    /**
     * This function is responsible to show the edit snippet menu
     * edit snippet menu is the menu which allows users to edit an existing snippet
     */
    function showEditSnippetMenu() {
        const $editSnippetMenu = $("#custom-snippets-edit");
        const $snippetListMenu = $("#custom-snippets-list");
        const $backToListMenuBtn = $("#back-to-list-menu-btn");
        const $addNewSnippetBtn = $("#add-new-snippet-btn");
        const $filterSnippetsPanel = $("#filter-snippets-panel");

        $editSnippetMenu.removeClass("hidden");
        $snippetListMenu.addClass("hidden");

        $backToListMenuBtn.removeClass("hidden");
        $addNewSnippetBtn.addClass("hidden");
        $filterSnippetsPanel.addClass("hidden");

        if (_panel) {
            _panel.setTitle(Strings.CUSTOM_SNIPPETS_EDIT_PANEL_TITLE);
        }
    }

    /**
     * Shows an error message when a snippet with the same abbreviation already exists
     * and user is trying to add a new one
     * @param {string} abbreviation - The abbreviation that's duplicated
     * @param {boolean} isEditForm - Whether this is for the edit form (optional, defaults to false)
     */
    function showDuplicateAbbreviationError(abbreviation, isEditForm = false) {
        const inputId = isEditForm ? "edit-abbr-box" : "abbr-box";
        const wrapperId = isEditForm ? "edit-abbr-box-wrapper" : "abbr-box-wrapper";
        const errorId = isEditForm ? "edit-abbreviation-duplicate-error" : "abbreviation-duplicate-error";

        showError(inputId, wrapperId, StringUtils.format(Strings.CUSTOM_SNIPPETS_DUPLICATE_ERROR, abbreviation), errorId);
    }

    /**
     * Shows the snippets list header
     * this is called when there are snippets to display
     */
    function showSnippetsListHeader() {
        const $snippetsListHeader = $("#snippets-list-header");
        $snippetsListHeader.removeClass("hidden");
    }

    /**
     * Hides the snippets list header
     * this is called when there are no snippets to display (either none exist or all filtered out)
     */
    function hideSnippetsListHeader() {
        const $snippetsListHeader = $("#snippets-list-header");
        $snippetsListHeader.addClass("hidden");
    }

    /**
     * Resets the tab title back to the default list view title.
     * Called when the panel is first opened or toggled visible.
     */
    function initializeListViewToolbarTitle() {
        if (_panel) {
            _panel.setTitle(Strings.CUSTOM_SNIPPETS_PANEL_TITLE);
        }
    }

    /**
     * Sets the panel reference so UIHelper can update the tab title.
     * @param {Object} panel  The Panel instance returned by WorkspaceManager.createBottomPanel
     */
    function init(panel) {
        _panel = panel;
    }

    exports.init = init;
    exports.showEmptySnippetMessage = showEmptySnippetMessage;
    exports.showSnippetsList = showSnippetsList;
    exports.clearSnippetsList = clearSnippetsList;
    exports.showAddSnippetMenu = showAddSnippetMenu;
    exports.showSnippetListMenu = showSnippetListMenu;
    exports.showEditSnippetMenu = showEditSnippetMenu;
    exports.showDuplicateAbbreviationError = showDuplicateAbbreviationError;
    exports.showSnippetsListHeader = showSnippetsListHeader;
    exports.hideSnippetsListHeader = hideSnippetsListHeader;
    exports.initializeListViewToolbarTitle = initializeListViewToolbarTitle;
    exports.showError = showError;
});
