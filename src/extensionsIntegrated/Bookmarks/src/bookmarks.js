define(function (require, exports, module) {
    const EditorManager = require("editor/EditorManager");
    const Editor = require("editor/Editor").Editor;

    const Helper = require("./helper");

    const GUTTER_NAME = "CodeMirror-bookmarkGutter",
        BOOKMARK_PRIORITY = 100;

    // initialize the bookmark gutter
    Editor.registerGutter(GUTTER_NAME, BOOKMARK_PRIORITY);

    /**
     * This function toggles a bookmark on a specific line
     *
     * @private
     * @param {Editor} editor - The current editor instance
     * @param {number} line - The line number to toggle bookmark on
     */
    function _toggleLineBookmark(editor, line) {
        if (Helper.hasBookmark(editor, line, GUTTER_NAME)) {
            editor.setGutterMarker(line, GUTTER_NAME, "");
        } else {
            editor.setGutterMarker(line, GUTTER_NAME, Helper.createBookmarkMarker());
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

    function goToNextBookmark() {
        //
    }

    function goToPrevBookmark() {
        //
    }

    exports.toggleBookmark = toggleBookmark;
    exports.goToNextBookmark = goToNextBookmark;
    exports.goToPrevBookmark = goToPrevBookmark;
});
