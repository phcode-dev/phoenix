/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/**
 * EditAgent propagates changes from the in-document editor to the source
 * document.
 */
define(function EditAgent(require, exports, module) {


    var Inspector = require("LiveDevelopment/Inspector/Inspector");
    var DOMAgent = require("LiveDevelopment/Agents/DOMAgent");
    var RemoteAgent = require("LiveDevelopment/Agents/RemoteAgent");
    var GotoAgent = require("LiveDevelopment/Agents/GotoAgent");

    var EditorManager = require("editor/EditorManager");

    var _editedNode;

    /** Find changed characters
     * @param {string} old value
     * @param {string} changed value
     * @return {from, to, text}
     */
    function _findChangedCharacters(oldValue, value) {
        if (oldValue === value) {
            return undefined;
        }
        var length = oldValue.length;
        var index = 0;

        // find the first character that changed
        var i;
        for (i = 0; i < length; i++) {
            if (value[i] !== oldValue[i]) {
                break;
            }
        }
        index += i;
        value = value.substr(i);
        length -= i;

        // find the last character that changed
        for (i = 0; i < length; i++) {
            if (value[value.length - 1 - i] !== oldValue[oldValue.length - 1 - i]) {
                break;
            }
        }
        length -= i;
        value = value.substr(0, value.length - i);

        return { from: index, to: index + length, text: value };
    }

    // WebInspector Event: DOM.characterDataModified
    function _onCharacterDataModified(event, res) {
        // res = {nodeId, characterData}
        if (_editedNode.nodeId !== res.nodeId) {
            return;
        }

        GotoAgent.open(DOMAgent.url);
        var editor = EditorManager.getCurrentFullEditor();
        var codeMirror = editor._codeMirror;
        var change = _findChangedCharacters(_editedNode.value, res.characterData);
        if (change) {
            var from = codeMirror.posFromIndex(_editedNode.location + change.from);
            var to = codeMirror.posFromIndex(_editedNode.location + change.to);
            exports.isEditing = true;
            editor.document.replaceRange(change.text, from, to);
            exports.isEditing = false;

            var newPos = codeMirror.posFromIndex(_editedNode.location + change.from + change.text.length);
            editor.setCursorPos(newPos.line, newPos.ch);
        }
    }

    // Remote Event: Go to the given source node
    function _onRemoteEdit(event, res) {
        // res = {nodeId, name, value}

        // detach from DOM change events
        if (res.value === "0") {
            Inspector.DOM.off(".EditAgent");
            return;
        }

        // find and store the edited node
        var node = DOMAgent.nodeWithId(res.nodeId);
        node = node.children[0];
        if (!node.location) {
            return;
        }
        _editedNode = node;

        // attach to character data modified events
        Inspector.DOM.on("characterDataModified.EditAgent", _onCharacterDataModified);
    }

    /** Initialize the agent */
    function load() {
        RemoteAgent.on("edit.EditAgent", _onRemoteEdit);
    }

    /** Initialize the agent */
    function unload() {
        RemoteAgent.off(".EditAgent");
    }

    // Export public functions
    exports.load = load;
    exports.unload = unload;
});
