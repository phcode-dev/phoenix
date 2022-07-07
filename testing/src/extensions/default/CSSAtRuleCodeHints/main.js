/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2017 - 2021 Adobe Systems Incorporated. All rights reserved.
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

define(function (require, exports, module) {


    // Load dependent modules
    var AppInit         = brackets.getModule("utils/AppInit"),
        CodeHintManager = brackets.getModule("editor/CodeHintManager"),
        AtRulesText     = require("text!AtRulesDef.json"),
        AtRules         = JSON.parse(AtRulesText);


    /**
     * @constructor
     */
    function AtRuleHints() {
    }

    // As we are only going to provide @rules name hints
    // we should claim that we don't have hints for anything else
    AtRuleHints.prototype.hasHints = function (editor, implicitChar) {
        var pos = editor.getCursorPos(),
            token = editor._codeMirror.getTokenAt(pos),
            cmState;

        this.editor = editor;

        if (token.state.base && token.state.base.localState) {
            cmState = token.state.base.localState;
        } else {
            cmState = token.state.localState || token.state;
        }

        // Check if we are at '@' rule 'def' context
        if ((token.type === "def" && cmState.context.type === "at")
                || (token.type === "variable-2" && (cmState.context.type === "top" || cmState.context.type === "block"))) {
            this.filter = token.string;
            return true;
        }
        this.filter = null;
        return false;

    };

    AtRuleHints.prototype.getHints = function (implicitChar) {
        var pos     = this.editor.getCursorPos(),
            token   = this.editor._codeMirror.getTokenAt(pos);

        this.filter = token.string;
        this.token = token;

        if (!this.filter) {
            return null;
        }

        // Filter the property list based on the token string
        var result = Object.keys(AtRules).filter(function (key) {
            if (key.indexOf(token.string) === 0) {
                return key;
            }
        }).sort();

        return {
            hints: result,
            match: this.filter,
            selectInitial: true,
            defaultDescriptionWidth: true,
            handleWideResults: false
        };
    };


    /**
     * Inserts a given @<rule> hint into the current editor context.
     *
     * @param {string} completion
     * The hint to be inserted into the editor context.
     *
     * @return {boolean}
     * Indicates whether the manager should follow hint insertion with an
     * additional explicit hint request.
     */
    AtRuleHints.prototype.insertHint = function (completion) {
        var cursor = this.editor.getCursorPos();
        this.editor.document.replaceRange(completion, {line: cursor.line, ch: this.token.start}, {line: cursor.line, ch: this.token.end});
        return false;
    };

    AppInit.appReady(function () {
        // Register code hint providers
        var restrictedBlockHints = new AtRuleHints();
        CodeHintManager.registerHintProvider(restrictedBlockHints, ["css", "less", "scss"], 0);

        // For unit testing
        exports.restrictedBlockHints = restrictedBlockHints;
    });
});
