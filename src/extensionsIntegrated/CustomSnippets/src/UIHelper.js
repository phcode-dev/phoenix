/* eslint-disable no-invalid-this */
define(function (require, exports, module) {
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

        $addSnippetMenu.removeClass("hidden");
        $snippetListMenu.addClass("hidden");

        $backToListMenuBtn.removeClass("hidden");
        $addNewSnippetBtn.addClass("hidden");
    }

    /**
     * This function is to show the snippets list menu
     * this menu is loaded by default when user opens up the panel
     * it displays the list of all the snippets available
     */
    function showSnippetListMenu() {
        const $addSnippetMenu = $("#custom-snippets-add-new");
        const $snippetListMenu = $("#custom-snippets-list");
        const $backToListMenuBtn = $("#back-to-list-menu-btn");
        const $addNewSnippetBtn = $("#add-new-snippet-btn");

        $addSnippetMenu.addClass("hidden");
        $snippetListMenu.removeClass("hidden");

        $backToListMenuBtn.addClass("hidden");
        $addNewSnippetBtn.removeClass("hidden");
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

    exports.showEmptySnippetMessage = showEmptySnippetMessage;
    exports.showSnippetsList = showSnippetsList;
    exports.clearSnippetsList = clearSnippetsList;
    exports.showAddSnippetMenu = showAddSnippetMenu;
    exports.showSnippetListMenu = showSnippetListMenu;
    exports.showDuplicateAbbreviationError = showDuplicateAbbreviationError;
});
