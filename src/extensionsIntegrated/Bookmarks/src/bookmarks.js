define(function (require, exports, module) {
    const EditorManager = require("editor/EditorManager");
    const Editor = require("editor/Editor").Editor;

    const Helper = require("./helper");

    const GUTTER_NAME = "CodeMirror-bookmarkGutter",
        BOOKMARK_PRIORITY = 100;

    /**
     * This is where all the bookmarks will be stored
     * it is an array of objects where each object will be stored firstly based on the file and then as per line no.
     * the sorting is done to make sure we need not access the whole complete list when trying to move back and forth
     *
     * @type {[{file: {String}, line: {Number}}]}
     */
    const BookmarksList = [];

    // initialize the bookmark gutter
    Editor.registerGutter(GUTTER_NAME, BOOKMARK_PRIORITY);

    /**
     * This function is responsible to remove the bookmark from the bookmarks list
     *
     * @private
     * @param {String} file - the file path
     * @param {Number} line - the line number
     */
    function _removeFromBookmarksList(file, line) {
        for (let i = 0; i < BookmarksList.length; i++) {
            if (BookmarksList[i].file === file && BookmarksList[i].line === line) {
                BookmarksList.splice(i, 1);
                break;
            }
        }
    }

    /**
     * This function is responsible to add the bookmark to the bookmarks list
     * after adding that we also sort that first by file path and then by line number to make accessing efficient
     *
     * @private
     * @param {String} file - the file path
     * @param {Number} line - the line number
     */
    function _addToBookmarksList(file, line) {
        BookmarksList.push({ file: file, line: line });

        BookmarksList.sort((a, b) => {
            if (a.file === b.file) {
                return a.line - b.line;
            }
            return a.file.localeCompare(b.file);
        });
    }

    /**
     * This function toggles a bookmark on a specific line
     *
     * @private
     * @param {Editor} editor - The current editor instance
     * @param {number} line - The line number to toggle bookmark on
     */
    function _toggleLineBookmark(editor, line) {
        const file = editor.document.file.fullPath; // this file path will be used when storing in the bookmarks list

        // remove bookmark
        if (Helper.hasBookmark(editor, line, GUTTER_NAME)) {
            editor.setGutterMarker(line, GUTTER_NAME, "");
            _removeFromBookmarksList(file, line);
        } else {
            // add bookmark
            editor.setGutterMarker(line, GUTTER_NAME, Helper.createBookmarkMarker());
            _addToBookmarksList(file, line);
        }
    }

    /**
     * This function is responsible to toggle bookmarks at the current cursor position(s)
     */
    function toggleBookmark() {
        const editor = EditorManager.getFocusedEditor();
        if (!editor) {
            return;
        }

        const selections = editor.getSelections();
        const uniqueLines = Helper.getUniqueLines(selections);

        // process each unique line
        uniqueLines.forEach((line) => {
            _toggleLineBookmark(editor, line);
        });
    }

    /**
     * This function gets executed when users click on the go to next bookmark button in the navigate menu,
     * or its keyboard shortcut
     * This finds the next bookmark in the current file and moves the cursor there
     */
    function goToNextBookmark() {
        const editor = EditorManager.getFocusedEditor();
        if (!editor) {
            return;
        }

        // get the file path and line as these values are needed when searching in the bookmarks list
        const currentFile = editor.document.file.fullPath;
        const currentLine = editor.getCursorPos().line;

        // get all the bookmarks in current file (this is already sorted by line number)
        const fileBookmarks = BookmarksList.filter((bookmark) => bookmark.file === currentFile);
        if (fileBookmarks.length === 0) {
            return;
        }

        // find the next bookmark after current position
        let nextBookmark = null;

        // find the first bookmark after current line
        for (let i = 0; i < fileBookmarks.length; i++) {
            if (fileBookmarks[i].line > currentLine) {
                nextBookmark = fileBookmarks[i];
                break;
            }
        }

        // If no next bookmark found, we wrap around to get the first bookmark in this file
        if (!nextBookmark && fileBookmarks.length > 0) {
            nextBookmark = fileBookmarks[0];
        }

        // take the cursor to the bookmark
        if (nextBookmark) {
            editor.setCursorPos(nextBookmark.line, 0);
        }
    }

    /**
     * This function gets executed when users click on the go to previous bookmark button in the navigate menu,
     * or its keyboard shortcut
     * This finds the previous bookmark in the current file and moves the cursor there
     */
    function goToPrevBookmark() {
        const editor = EditorManager.getFocusedEditor();
        if (!editor) {
            return;
        }

        const currentFile = editor.document.file.fullPath;
        const currentLine = editor.getCursorPos().line;

        const fileBookmarks = BookmarksList.filter((bookmark) => bookmark.file === currentFile);
        if (fileBookmarks.length === 0) {
            return;
        }

        let prevBookmark = null;

        for (let i = fileBookmarks.length - 1; i >= 0; i--) {
            if (fileBookmarks[i].line < currentLine) {
                prevBookmark = fileBookmarks[i];
                break;
            }
        }

        if (!prevBookmark && fileBookmarks.length > 0) {
            prevBookmark = fileBookmarks[fileBookmarks.length - 1];
        }

        if (prevBookmark) {
            editor.setCursorPos(prevBookmark.line, 0);
        }
    }

    exports.toggleBookmark = toggleBookmark;
    exports.goToNextBookmark = goToNextBookmark;
    exports.goToPrevBookmark = goToPrevBookmark;
});
