/* eslint-disable no-invalid-this */
define(function (require, exports, module) {
    const Global = require("./global");

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
        const $toolbarTitle = $(".toolbar-title");

        $addSnippetMenu.removeClass("hidden");
        $snippetListMenu.addClass("hidden");

        $backToListMenuBtn.removeClass("hidden");
        $addNewSnippetBtn.addClass("hidden");
        $filterSnippetsPanel.addClass("hidden");

        $toolbarTitle.html('Add Snippet <span id="snippets-count" class="snippets-count"></span>');
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
        const $toolbarTitle = $(".toolbar-title");

        $addSnippetMenu.addClass("hidden");
        $editSnippetMenu.addClass("hidden");
        $snippetListMenu.removeClass("hidden");

        $backToListMenuBtn.addClass("hidden");
        $addNewSnippetBtn.removeClass("hidden");
        $filterSnippetsPanel.removeClass("hidden");

        // add the snippet count in the toolbar (the no. of snippets added)
        const snippetCount = Global.SnippetHintsList.length;
        const countText = snippetCount > 0 ? `(${snippetCount})` : "";
        $toolbarTitle.html(`Custom Snippets <span id="snippets-count" class="snippets-count">${countText}</span>`);

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
        const $toolbarTitle = $(".toolbar-title");

        $editSnippetMenu.removeClass("hidden");
        $snippetListMenu.addClass("hidden");

        $backToListMenuBtn.removeClass("hidden");
        $addNewSnippetBtn.addClass("hidden");
        $filterSnippetsPanel.addClass("hidden");

        // Update toolbar title
        $toolbarTitle.html('Edit Snippet <span id="snippets-count" class="snippets-count"></span>');
    }

    /**
     * Shows an error message when a snippet with the same abbreviation already exists
     * and user is trying to add a new one
     * @param {string} abbreviation - The abbreviation that's duplicated
     */
    function showDuplicateAbbreviationError(abbreviation) {
        // just make sure that the error message is not already displaying
        if ($("#abbreviation-error-message").length === 0) {
            const $errorMessage = $("<div>")
                .attr("id", "abbreviation-error-message")
                .addClass("error-message")
                .text(`A snippet with abbreviation "${abbreviation}" already exists.`);

            $("#abbr-box-wrapper").append($errorMessage);

            // highlight the abbreviation input with error
            $("#abbr-box").addClass("error-input");

            // automatically remove it after 5 seconds
            setTimeout(function () {
                $("#abbreviation-error-message").fadeOut(function () {
                    $(this).remove();
                });
                $("#abbr-box").removeClass("error-input");
            }, 5000);

            $("#abbr-box").one("input", function () {
                $("#abbreviation-error-message").remove();
                $(this).removeClass("error-input");
            });
        }
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
     * Initializes the toolbar title for the list view
     * This is called when the panel is first opened to ensure the snippet count is displayed
     */
    function initializeListViewToolbarTitle() {
        const $toolbarTitle = $(".toolbar-title");
        const snippetCount = Global.SnippetHintsList.length;
        const countText = snippetCount > 0 ? `(${snippetCount})` : "";
        $toolbarTitle.html(`Custom Snippets <span id="snippets-count" class="snippets-count">${countText}</span>`);
    }

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
});
