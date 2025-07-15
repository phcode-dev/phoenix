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

/* global logger */
define(function (require, exports, module) {
    const EditorManager = require("editor/EditorManager");
    const Metrics = require("utils/Metrics");

    const Global = require("./global");
    const Helper = require("./helper");
    const UIHelper = require("./UIHelper");
    const SnippetsState = require("./snippetsState");
    const SnippetsList = require("./snippetsList");

    /**
     * This function handles the save button click handler
     * it does all the chores like fetching the data from the required fields, adding it to snippet list and all that
     */
    function handleSaveBtnClick() {
        const snippetData = Helper.getSnippetData();

        if (!snippetData.abbreviation || !snippetData.abbreviation.trim()) {
            return;
        }
        if (!snippetData.templateText || !snippetData.templateText.trim()) {
            return;
        }

        if (shouldAddSnippetToList(snippetData)) {
            Global.SnippetHintsList.push(snippetData);
            Helper.rebuildOptimizedStructures();
            Helper.clearAllInputFields();
            Helper.toggleSaveButtonDisability();

            // snippet creating metrics
            const fileCategory = Helper.categorizeFileExtensionForMetrics(snippetData.fileExtension);
            Metrics.countEvent(Metrics.EVENT_TYPE.EDITOR, "snipt", `add.${fileCategory}`);

            // save to file storage
            SnippetsState.saveSnippetsToState()
                .catch(function (error) {
                    logger.reportError(error, "Custom Snippets: failed to save new snippet to file storage");
                });

            // we need to move back to snippets list view after a snippet is saved
            UIHelper.showSnippetListMenu();
            SnippetsList.showSnippetsList();
        } else {
            // false since this is from addSnippet and not from editSnippet
            UIHelper.showDuplicateAbbreviationError(snippetData.abbreviation, false);
        }
    }

    /**
     * This function handles the save button click for editing a snippet
     */
    function handleEditSaveBtnClick() {
        const editedData = Helper.getEditSnippetData();
        const $editView = $("#custom-snippets-edit");
        const originalSnippet = $editView.data("originalSnippet");
        const snippetIndex = $editView.data("snippetIndex");

        if (!editedData.abbreviation || !editedData.abbreviation.trim()) {
            return;
        }
        if (!editedData.templateText || !editedData.templateText.trim()) {
            return;
        }

        // check if abbreviation changed and if new abbreviation already exists
        if (editedData.abbreviation !== originalSnippet.abbreviation) {
            const existingSnippet = Global.SnippetHintsList.find(
                (snippet) => snippet.abbreviation === editedData.abbreviation
            );
            if (existingSnippet) {
                // true since this is from editSnippet and not from addSnippet
                UIHelper.showDuplicateAbbreviationError(editedData.abbreviation, true);
                return;
            }
        }

        // update the snippet in the list
        if (snippetIndex !== -1) {
            Global.SnippetHintsList[snippetIndex] = editedData;
            Helper.rebuildOptimizedStructures();

            // save to file storage
            SnippetsState.saveSnippetsToState()
                .catch(function (error) {
                    logger.reportError(error, "Custom Snippets: failed to save edited snippet to file storage");
                });

            // clear the stored data
            $editView.removeData("originalSnippet");
            $editView.removeData("snippetIndex");

            // go back to snippets list
            UIHelper.showSnippetListMenu();
            SnippetsList.showSnippetsList();
        }
    }

    /**
     * This function is responsible to handle the cancel button click in the edit-snippet panel
     * this resets the format to the last saved values and then moves back to the snippets-list panel
     */
    function handleCancelEditBtnClick() {
        const $editView = $("#custom-snippets-edit");
        const originalSnippet = $editView.data("originalSnippet");

        if (originalSnippet) {
            // restore original data in the form to reset any changes
            Helper.populateEditForm(originalSnippet);
        }

        $editView.removeData("originalSnippet");
        $editView.removeData("snippetIndex");

        // navigate back to snippets list
        UIHelper.showSnippetListMenu();
        SnippetsList.showSnippetsList();
    }

    /**
     * This function is to check whether we can add the new snippet to the snippets list
     * because we don't want to add the new snippet if a snippet already exists with the same abbreviation
     * @param   {object}  snippetData - the snippet data object
     * @returns {boolean} - true if we can add the new snippet to the list otherwise false
     */
    function shouldAddSnippetToList(snippetData) {
        const matchedItem = Global.SnippetHintsList.find(
            (snippet) => snippet.abbreviation === snippetData.abbreviation
        );

        if (matchedItem) {
            return false;
        }
        return true;
    }

    /**
     * This function is responsible to get the word before the cursor
     * this is required to check whether something matches the snippet list
     * @returns {object} - an object in the format {word: 'pluto', line: 10, ch: 2}
     */
    function getWordBeforeCursor() {
        const editor = EditorManager.getActiveEditor();
        if (!editor) {
            return;
        }

        const pos = editor.getCursorPos();
        let word = ""; // this will store the actual word before the cursor
        let i = pos.ch - 1; // index of the char right before the cursor
        const breakWordAt = ["", " ", "\t"]; // we need to break the loop when we encounter this char's

        while (i >= 0) {
            const char = editor.getCharacterAtPosition({ line: pos.line, ch: i });
            if (breakWordAt.includes(char)) {
                break;
            }
            word = char + word;
            i--;
        }

        return {
            word: word,
            line: pos.line,
            ch: i
        };
    }

    exports.getWordBeforeCursor = getWordBeforeCursor;
    exports.handleSaveBtnClick = handleSaveBtnClick;
    exports.handleEditSaveBtnClick = handleEditSaveBtnClick;
    exports.handleCancelEditBtnClick = handleCancelEditBtnClick;
});
