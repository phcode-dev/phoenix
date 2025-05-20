define(function (require, exports, module) {
    const EditorManager = require("editor/EditorManager"),
        Editor = require("editor/Editor").Editor;

    const GUTTER_NAME = "CodeMirror-bookmarkGutter",
        BOOKMARK_PRIORITY = 100;

    // the bookmark svg icon
    const bookmarkSvg = require("text!styles/images/bookmark.svg");

    // initialize the bookmark gutter
    Editor.registerGutter(GUTTER_NAME, BOOKMARK_PRIORITY);

    /**
     * This function is responsible to toggle a bookmark at the current cursor position
     */
    function toggleBookmark() {
        const editor = EditorManager.getFocusedEditor();
        if (!editor) {
            return;
        }

        const selection = editor.getSelection();
        const currentLine = selection.start.line;

        // check whether there's already a bookmark on this line
        const marker = editor.getGutterMarker(currentLine, GUTTER_NAME);

        if (marker) {
            // remove bookmark if exists
            editor.setGutterMarker(currentLine, GUTTER_NAME, "");
        } else {
            // add the bookmark
            const $marker = $("<div>").addClass("bookmark-icon").html(bookmarkSvg);
            editor.setGutterMarker(currentLine, GUTTER_NAME, $marker[0]);
        }
    }

    exports.toggleBookmark = toggleBookmark;
});
