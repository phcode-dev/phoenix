define(function (require, exports, module) {
    const EditorManager = require("editor/EditorManager");
    const HTMLInstrumentation = require("LiveDevelopment/MultiBrowserImpl/language/HTMLInstrumentation");


    /**
     * This function is responsible to delete an element from the source code
     * @param {Number} tagId - the data-brackets-id of the DOM element
     */
    function _deleteElementInSourceByTagId(tagId) {
        const editor = EditorManager.getActiveEditor();
        if (!editor || !tagId) {
            return;
        }

        // this will give us the start pos and end pos of the DOM element in the source code
        // can be referenced using range.from and range.to
        const range = HTMLInstrumentation.getPositionFromTagId(editor, tagId);
        if(!range) {
            return;
        }

        editor.replaceRange("", range.from, range.to);
    }

    /**
     * This is the main function that is exported.
     * it will be called by LiveDevProtocol when it receives a message from RemoteFunctions.js using MessageBroker
     * Refer to: `handleOptionClick` function in the RemoteFunctions.js and `_receive` function in LiveDevProtocol.js
     *
     * @param {Object} message - this is the object that is passed by RemoteFunctions.js using MessageBroker
     * this object will be in the format
     * {
                livePreviewEditEnabled: true,
                element: element,
                event: event,
                tagId: tagId,
                delete: true
        }
    * here element is the actual DOM element that is clicked, and tagId is the data-brackets-id
    * and 'delete: true is just an example, it might be 'duplicate' or 'select-parent' also
     */
    function handleLivePreviewEditOperation(message) {
        if (!message.element || !message.tagId) {
            return;
        }

        // just call the required functions
        if (message.delete) {
            _deleteElementInSourceByTagId(Number(message.tagId));
        }
    }

    exports.handleLivePreviewEditOperation = handleLivePreviewEditOperation;
});
