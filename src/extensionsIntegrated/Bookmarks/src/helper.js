define(function (require, exports, module) {
    // the bookmark svg icon
    const bookmarkSvg = require("text!styles/images/bookmark.svg");

    /**
     * This function creates a bookmark marker element
     *
     * @returns {HTMLElement} The bookmark marker element
     */
    function createBookmarkMarker() {
        return $("<div>").addClass("bookmark-icon").html(bookmarkSvg)[0];
    }

    /**
     * This function checks whether a line has a bookmark
     *
     * @param {Editor} editor - The current editor instance
     * @param {number} line - The line number to check
     * @param {string} gutterName - The name of the gutter
     * @returns {boolean} True if the line has a bookmark, false otherwise
     */
    function hasBookmark(editor, line, gutterName) {
        return !!editor.getGutterMarker(line, gutterName);
    }

    /**
     * This function gets unique line numbers from all selections
     * this is needed so that when multiple cursors are there at the same line, we can get the line only once
     *
     * @param {Array<{start: {line: number}}>} selections - Array of selections
     * @returns {Array<number>} Array of unique line numbers
     */
    function getUniqueLines(selections) {
        return [...new Set(selections.map((selection) => selection.start.line))];
    }

    exports.createBookmarkMarker = createBookmarkMarker;
    exports.hasBookmark = hasBookmark;
    exports.getUniqueLines = getUniqueLines;
});
