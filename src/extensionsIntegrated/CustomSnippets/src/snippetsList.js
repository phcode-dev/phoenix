
/*
 * This file handles the display and management of the snippets list that is shown in the UI
 * Note: when there are no snippets present, a message like no snippets are added yet is shown. refer to the html file
 */

/* eslint-disable no-invalid-this */
define(function (require, exports, module) {
    const Global = require("./global");
    const SnippetsState = require("./snippetsState");
    const UIHelper = require("./UIHelper");
    const FilterSnippets = require("./filterSnippets");

    /**
     * This function is responsible to create a snippet item
     * refer to html file for the structure of the snippet item
     * @private
     * @param {object} snippetItem
     */
    function _createSnippetItem(snippetItem) {
        // the main snippet item container,
        // all the items like abbr, description and all that will be appended into this
        const $snippetItem = $("<div>").attr("data-abbr", snippetItem.abbreviation).attr("id", "snippet-item");

        const $snippetAbbr = $("<div>")
            .text(snippetItem.abbreviation)
            .attr("id", "snippet-abbr")
            .attr("title", `Abbreviation: ${snippetItem.abbreviation}`);

        const $snippetTemplate = $("<div>")
            .text(snippetItem.templateText)
            .attr("id", "snippet-template")
            .attr("title", `Template: ${snippetItem.templateText}`);

        const $snippetDescription = $("<div>")
            .text(snippetItem.description || "No description")
            .attr("id", "snippet-description")
            .attr("title", `Description: ${snippetItem.description}`);

        const $snippetFiles = $("<div>")
            .text(snippetItem.fileExtension || "all")
            .attr("id", "snippet-files")
            .attr("title", `File extensions: ${snippetItem.fileExtension}`);

        const $deleteSnippet = $("<div>")
            .html(`<i class="fas fa-trash"></i>`)
            .attr("id", "delete-snippet-btn")
            .addClass("delete-snippet-btn");

        $snippetItem.append($snippetAbbr, $snippetTemplate, $snippetDescription, $snippetFiles, $deleteSnippet);
        $snippetItem.data("snippet", snippetItem); // store full object. this is needed for deletion purposes

        // finally when the snippet item is ready, we append it to the snippets-list-wrapper
        $("#snippets-list-wrapper").append($snippetItem);

        // here we register the delete button click handler
        _registerHandlers();
    }

    /**
     * Updates the snippets count which is displayed in the toolbar at the left side
     * @private
     */
    function _updateSnippetsCount() {
        const count = Global.SnippetHintsList.length;
        const $countSpan = $("#snippets-count");
        if (count > 0) {
            $countSpan.text(`(${count})`);
        } else {
            $countSpan.text("");
        }
    }

    /**
     * This function is called when the user clicks on the custom snippets button from the file menu
     * this also gets called when user clicks on the 'back' button to move back to the snippets list menu
     * refer to '_registerHandlers' function inside the main.js file
     */
    function showSnippetsList() {
        UIHelper.clearSnippetsList(); // to clear existing snippets list, as we'll rebuild it
        const snippetList = Global.SnippetHintsList; // gets the list of the snippets, this is an array of objects

        _updateSnippetsCount();

        // if there are no snippets available, we show the message that no snippets are present
        // refer to html file
        if (snippetList.length === 0) {
            UIHelper.showEmptySnippetMessage();
        } else {
            // Apply filter to the snippets list
            const filteredSnippets = FilterSnippets.filterSnippets(snippetList);

            // Check if we have any snippets after filtering
            if (filteredSnippets.length === 0) {
                // Show a message indicating no matches found
                UIHelper.showEmptySnippetMessage();
                const $emptyMessage = $("#no-snippets-message");
                const $filterInput = $("#filter-snippets-input");
                const filterText = $filterInput.val().trim();

                if (filterText) {
                    $emptyMessage.text(`No snippets match "${filterText}"`);
                } else {
                    $emptyMessage.text("No custom snippets added yet!");
                }
            } else {
                UIHelper.showSnippetsList(); // to remove the hidden class from the snippets list wrapper

                // rebuild the snippets menu with filtered results
                for (let i = 0; i < filteredSnippets.length; i++) {
                    const snippetItem = filteredSnippets[i];
                    _createSnippetItem(snippetItem);
                }
            }
        }
    }

    /**
     * This function is responsible to delete the snippet for which delete button was clicked
     */
    function deleteSnippet() {
        // get the element
        const $snippetItem = $(this).closest("#snippet-item");
        const snippetItem = $snippetItem.data("snippet"); // this gives the actual object with all the keys and vals

        const index = Global.SnippetHintsList.findIndex((s) => s.abbreviation === snippetItem.abbreviation);

        if (index !== -1) {
            Global.SnippetHintsList.splice(index, 1); // removes it from the actual array
            // save to preferences after deleting snippet
            SnippetsState.saveSnippetsToState();
            // Refresh the entire list to properly handle filtering
            showSnippetsList();
        }
    }

    /**
     * This function is responsible to register the delete snippet button handler
     * @private
     */
    function _registerHandlers() {
        const $deleteSnippetBtn = $(".delete-snippet-btn");

        $deleteSnippetBtn.off("click");
        $deleteSnippetBtn.on("click", function () {
            deleteSnippet.call(this);
        });
    }

    exports.showSnippetsList = showSnippetsList;
    exports.deleteSnippet = deleteSnippet;
});
