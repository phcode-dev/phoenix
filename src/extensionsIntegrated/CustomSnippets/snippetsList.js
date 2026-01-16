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

/*
 * This file handles the display and management of the snippets list that is shown in the UI
 * Note: when there are no snippets present, a message like no snippets are added yet is shown. refer to the html file
 */

/* eslint-disable no-invalid-this */
define(function (require, exports, module) {
    const StringUtils = require("utils/StringUtils");
    const Metrics = require("utils/Metrics");

    const Global = require("./global");
    const SnippetsState = require("./snippetsState");
    const UIHelper = require("./UIHelper");
    const FilterSnippets = require("./filterSnippets");
    const Helper = require("./helper");
    const Strings = require("strings");

    /**
     * This function is responsible to create a snippet item
     * refer to html file for the structure of the snippet item
     * @private
     * @param {object} snippetItem
     */
    function _createSnippetItem(snippetItem) {
        // the main snippet item container,
        // all the items like abbr, description and all that will be appended into this
        const $snippetItem = $("<div>").attr("data-abbr", snippetItem.abbreviation).addClass("snippet-item");

        const $snippetAbbr = $("<div>")
            .text(snippetItem.abbreviation)
            .attr("id", "snippet-abbr")
            .attr("title", StringUtils.format(Strings.CUSTOM_SNIPPETS_EDIT_ABBR_TOOLTIP, snippetItem.abbreviation));

        const $snippetTemplate = $("<div>")
            .text(snippetItem.templateText)
            .attr("id", "snippet-template")
            .attr("title", StringUtils.format(Strings.CUSTOM_SNIPPETS_EDIT_TEMPLATE_TOOLTIP, snippetItem.templateText));

        const $snippetDescription = $("<div>")
            .text(
                snippetItem.description && snippetItem.description.trim() !== ""
                    ? snippetItem.description
                    : Strings.CUSTOM_SNIPPETS_NO_DESCRIPTION
            )
            .attr("id", "snippet-description")
            .attr(
                "title",
                snippetItem.description && snippetItem.description.trim() !== ""
                    ? StringUtils.format(Strings.CUSTOM_SNIPPETS_EDIT_DESC_TOOLTIP, snippetItem.description)
                    : Strings.CUSTOM_SNIPPETS_ADD_DESC_TOOLTIP
            );

        const $snippetFiles = $("<div>")
            .text(snippetItem.fileExtension || "all")
            .attr("id", "snippet-files")
            .attr("title", StringUtils.format(Strings.CUSTOM_SNIPPETS_EDIT_FILE_EXT_TOOLTIP, snippetItem.fileExtension || "all"));

        const $deleteSnippet = $("<div>")
            .html(`<i class="fas fa-trash"></i>`)
            .attr("id", "delete-snippet-btn")
            .attr("title", Strings.CUSTOM_SNIPPETS_DELETE_TOOLTIP)
            .addClass("delete-snippet-btn");

        $snippetItem.append($snippetAbbr, $snippetTemplate, $snippetDescription, $snippetFiles, $deleteSnippet);
        $snippetItem.data("snippet", snippetItem); // store full object. this is needed for deletion purposes

        // finally when the snippet item is ready, we append it to the snippets-list-wrapper
        $("#snippets-list-wrapper").append($snippetItem);

        // here we register the delete button click handler
        _registerHandlers();
    }

    /**
     * Shows the appropriate empty state message based on context
     * the context might be either one of the two cases:
     * when no snippets are added
     * or
     * when no snippets match the filtered text
     * @private
     */
    function _showEmptyState() {
        UIHelper.showEmptySnippetMessage();
        UIHelper.hideSnippetsListHeader();
        const $emptyMessage = $("#no-snippets-message");
        const $filterInput = $("#filter-snippets-input");
        const filterText = $filterInput.val().trim();

        if (filterText) {
            $emptyMessage.text(StringUtils.format(Strings.CUSTOM_SNIPPETS_NO_MATCHES, filterText));
        } else {
            $emptyMessage.html(Strings.CUSTOM_SNIPPETS_LEARN_MORE);
        }
    }

    /**
     * this function is responsible to render the filtered snippets list
     * @private
     * @param {Array} filteredSnippets - array of filtered snippet objects
     */
    function _renderSnippetsList(filteredSnippets) {
        UIHelper.showSnippetsList(); // show the snippets list wrapper
        UIHelper.showSnippetsListHeader(); // show header when there are snippets to display

        // add each filtered snippet to the list
        filteredSnippets.forEach(function (snippetItem) {
            _createSnippetItem(snippetItem);
        });
    }

    /**
     * This function is called when the user clicks on the custom snippets button from the file menu
     * this also gets called when user clicks on the 'back' button to move back to the snippets list menu
     * refer to '_registerHandlers' function inside the main.js file
     */
    function showSnippetsList() {
        UIHelper.clearSnippetsList(); // clear existing snippets list, as we'll rebuild it
        const snippetList = Global.SnippetHintsList; // get the list of snippets

        // handle empty snippets case
        if (snippetList.length === 0) {
            _showEmptyState();
            return;
        }

        // apply the filtering and get results
        const filteredSnippets = FilterSnippets.filterSnippets(snippetList);

        // if there are no matches after filtering
        if (filteredSnippets.length === 0) {
            _showEmptyState();
            return;
        }

        // render the filtered snippets
        _renderSnippetsList(filteredSnippets);
    }

    /**
     * This function is responsible to delete the snippet for which delete button was clicked
     */
    function deleteSnippet() {
        // get the element
        const $snippetItem = $(this).closest(".snippet-item");
        const snippetItem = $snippetItem.data("snippet"); // this gives the actual object with all the keys and vals

        const index = Global.SnippetHintsList.findIndex((s) => s.abbreviation === snippetItem.abbreviation);

        if (index !== -1) {
            // track the snippet deletion metrics before removing
            const fileCategory = Helper.categorizeFileExtensionForMetrics(snippetItem.fileExtension);
            Metrics.countEvent(Metrics.EVENT_TYPE.EDITOR, "snipt", `del.${fileCategory}`);

            Global.SnippetHintsList.splice(index, 1); // removes it from the actual array
            Helper.rebuildOptimizedStructures();

            // save to file storage
            SnippetsState.saveSnippetsToState()
                .catch(function (error) {
                    console.error("failed to delete custom snippet correctly:", error);
                });

            // update the snippets count in toolbar
            Helper.updateSnippetsCount();
            // Refresh the entire list to properly handle filtering
            showSnippetsList();
        }
    }

    /**
     * This function is responsible to register the delete snippet button handler
     * @private
     */
    function _registerHandlers() {
        const $snippetsListWrapper = $("#snippets-list-wrapper");

        $snippetsListWrapper.off("click.deleteSnippet");
        $snippetsListWrapper.on("click.deleteSnippet", ".delete-snippet-btn", function (e) {
            e.stopPropagation(); // prevent triggering the edit handler
            deleteSnippet.call(this);
        });

        // Use event delegation for snippet item clicks to enable editing
        $snippetsListWrapper.off("click.editSnippet");
        $snippetsListWrapper.on("click.editSnippet", ".snippet-item", function (e) {
            // don't trigger edit if clicking on delete button
            if ($(e.target).closest(".delete-snippet-btn").length === 0) {
                editSnippet.call(this);
            }
        });
    }

    /**
     * This function handles editing a snippet when the snippet item is clicked
     */
    function editSnippet() {
        // get the snippet data from the clicked item
        const $snippetItem = $(this).closest(".snippet-item");
        const snippetItem = $snippetItem.data("snippet");

        // populate the edit form with current snippet data
        Helper.populateEditForm(snippetItem);

        // store the original data for reset functionality
        $("#custom-snippets-edit").data("originalSnippet", snippetItem);
        $("#custom-snippets-edit").data(
            "snippetIndex",
            Global.SnippetHintsList.findIndex((s) => s.abbreviation === snippetItem.abbreviation)
        );

        // show the edit form
        UIHelper.showEditSnippetMenu();

        // enable the save button based on current data
        Helper.toggleEditSaveButtonDisability();
    }

    exports.showSnippetsList = showSnippetsList;
    exports.deleteSnippet = deleteSnippet;
    exports.editSnippet = editSnippet;
});
