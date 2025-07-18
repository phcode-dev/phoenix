define(function (require, exports, module) {
    const EditorManager = require("editor/EditorManager");

    function deleteElementInSourceByTagId(tagId) {
        const editor = EditorManager.getActiveEditor();
        if (!editor || !tagId) {
            return;
        }

        // this will give us the text marker object
        const mark = editor.getAllMarks().find((m) => m.tagID === Number(tagId));
        if (!mark) {
            return;
        }

        // this give us the start position to the end position of the code.
        // we just need to delete it
        const range = mark.find();
        if (!range) {
            return;
        }

        editor.replaceRange("", range.from, range.to);
    }

    exports.deleteElementInSourceByTagId = deleteElementInSourceByTagId;
});
