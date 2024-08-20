/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*global path, jsPromise*/

/**
 *  Utilities functions for running macros.
 *  Eg:
 *  await __PR.openFile("a.html");
 *   __PR.setCursors(["17:28", "17:28-17:30"])
 * __PR.expectCursorsToBe(["17:28", "17:28-17:30"])
 * __PR.keydown(["BACK_SPACE"])
 * __PR.typeAtCursor("hello")
 * __PR.validateText(`a`, "16:14-16:15")
 * __PR.validateAllMarks("startTagSyncEdit", ["16:14-16:15"]); // All marks of type startTagSyncEdit should be there
 * __PR.validateMarks("startTagSyncEdit", ["16:14-16:15"], 1); // 1 is total marks of type startTagSyncEdit
 *
 *  This can be later extended to run macros. But since this uses eval, the
 *  security posture must be changed. One way is to:
 *  1. create an iframe that contains the macro panel and codemirror surface in a sandboxed or 3rd party context. This
 *     will create origin isolation in browser so that extensions cannot read or write to the ifrmae macro code.
 *  2. The iframe should be created in an extensions and once created, only that iframe should be tested to run evaled
 *     code. So the iframe will post message with code to eval and we will only eval that.
 *  3. The iframe can request to save data to eval which we need to carefully handle.
 *  4. Now this is a problem only when we securely sandbox extensions in the future, as for now an extension can run
 *     eval itself and pretty much all of this is no-op till we have extension sandbox. So this is not the security
 *     model now.
 */
define(function (require, exports, module) {
    const FileViewController = brackets.getModule("project/FileViewController"),
        CommandManager = brackets.getModule("command/CommandManager"),
        EditorManager = brackets.getModule("editor/EditorManager"),
        KeyEvent = brackets.getModule("utils/KeyEvent"),
        Commands = brackets.getModule("command/Commands"),
        PreferencesManager  = brackets.getModule("preferences/PreferencesManager"),
        Editor = brackets.getModule("editor/Editor"),
        _ = brackets.getModule("thirdparty/lodash"),
        ProjectManager = brackets.getModule("project/ProjectManager");

    /**
     * Open a project relative file or absolute file path. if no leading slash, path is assumed to be project relative
     * @param filePath
     * @returns {Promise<null>}
     */
    function openFile(filePath) {
        if(filePath.startsWith('/')) {
            return jsPromise(FileViewController.openFileAndAddToWorkingSet(filePath));
        }
        const projectFilePath = path.join(ProjectManager.getProjectRoot().fullPath, filePath);
        return jsPromise(FileViewController.openFileAndAddToWorkingSet(projectFilePath));
    }


    /**
     * Set cursor positions or text selections in the active CodeMirror editor based on a specified format.
     * The input should be an array of strings where each string can denote a cursor position ("line:char")
     * or a text selection range ("line:char-line:char"). For a selection, the first part is the anchor and
     * the second is the head of the selection.
     *
     * Example usage: ["1:2", "2:2-3:4"]
     *
     * @param {Array<string>} selections - An array of strings defining cursor positions or selection ranges.
     * @throws {Error} Throws an error if no active editor is found or if there are parsing issues with the input.
     */
    function setCursors(selections) {
        const activeEditor = EditorManager.getActiveEditor();
        if(!activeEditor){
            throw new Error(`No active editor found to set cursor at: ${selections}`);
        }
        // Parse the selection strings to CodeMirror positions
        const parsedSelections = selections.map(selection => {
            const parts = selection.split('-');
            if (parts.length === 1) {
                const [line, ch] = parts[0].split(':').map(Number);
                if (isNaN(line) || isNaN(ch)) {
                    throw new Error(`Invalid cursor format: ${parts[0]} for ${selections}`);
                }
                return {start: {line: line - 1, ch: ch - 1}, end: {line: line - 1, ch: ch - 1}};
            } else if (parts.length === 2) {
                const [fromLine, fromCh] = parts[0].split(':').map(Number);
                const [toLine, toCh] = parts[1].split(':').map(Number);
                if (isNaN(fromLine) || isNaN(fromCh) || isNaN(toLine) || isNaN(toCh)) {
                    throw new Error(`Invalid selection range format: ${selection}`);
                }
                return {start: {line: fromLine - 1, ch: fromCh -1}, end: {line: toLine - 1, ch: toCh - 1}};
            } else {
                throw new Error(`Invalid format: ${selection}`);
            }
        });

        // Set the selections in the editor
        activeEditor.setSelections(parsedSelections);
    }

    /**
     * gets cursor selections array that can be used in the setCursors API
     * @param editor
     * @returns {*}
     */
    function computeCursors(editor, addQuotes) {
        const selections = editor.getSelections();
        return selections.map(selection => {
            const start = selection.start;
            const end = selection.end;
            let cursor;

            // Check if the selection is a cursor (start and end are the same)
            if (start.line === end.line && start.ch === end.ch) {
                cursor = `${start.line + 1}:${start.ch + 1}`;
            } else {
                cursor = `${start.line + 1}:${start.ch + 1}-${end.line + 1}:${end.ch + 1}`;
            }
            return addQuotes ? `"${cursor}"` : cursor;
        });
    }

    /**
     * Validates the currently active editor has selections as given here
     */
    function expectCursorsToBe(expectedSelections) {
        const activeEditor = EditorManager.getActiveEditor();
        if(!activeEditor){
            throw new Error(`No active editor found for expectCursorsToBe: ${expectedSelections}`);
        }
        const currentSelections = computeCursors(activeEditor);
        if(currentSelections.length !== expectedSelections.length) {
            throw new Error(`expectCursorsToBe: [${expectedSelections.join(", ")}] `+
             `but got [${currentSelections.join(", ")}]`);
        }
        for(let i = 0; i < currentSelections.length; i++) {
            if(!currentSelections.includes(`${expectedSelections[i]}`) ||
                !expectedSelections.includes(currentSelections[i])){
                throw new Error(`expectCursorsToBe: [${expectedSelections.join(", ")}] `+
                    `but got [${currentSelections.join(", ")}]`);
            }
        }
    }

    /**
     * Simulate a key event.
     * @param {Number} key Key code available as One of the KeyEvent.DOM_VK_*
     * @param {String} event Key event to simulate. one of keydown, keyup or keypress
     * @param {HTMLElement} element Element to receive event
     * @param {KeyboardEventInit} options Optional arguments for key event
     */
    function raiseKeyEvent(key, event, element, options) {
        const doc = element.ownerDocument;

        if(typeof options === 'undefined') {
            options = {
                view: doc.defaultView,
                bubbles: true,
                cancelable: true,
                keyIdentifer: key
            };
        } else {
            options.view = doc.defaultView;
            options.bubbles = true;
            options.cancelable = true;
            options.keyIdentifier = key;
        }
        const oEvent = new KeyboardEvent(event, options);

        if (event !== "keydown" && event !== "keyup" && event !== "keypress") {
            console.log("SpecRunnerUtils.simulateKeyEvent() - unsupported keyevent: " + event);
            return;
        }

        // Chromium Hack: need to override the 'which' property.
        // Note: this code is not designed to work in IE, Safari,
        // or other browsers. Well, maybe with Firefox. YMMV.
        Object.defineProperty(oEvent, 'keyCode', {
            get: function () {
                return this.keyCodeVal;
            }
        });
        Object.defineProperty(oEvent, 'which', {
            get: function () {
                return this.keyCodeVal;
            }
        });
        Object.defineProperty(oEvent, 'charCode', {
            get: function () {
                return this.keyCodeVal;
            }
        });

        oEvent.keyCodeVal = key;
        if (oEvent.keyCode !== key) {
            console.log("SpecRunnerUtils.simulateKeyEvent() - keyCode mismatch: " + oEvent.keyCode);
        }

        element.dispatchEvent(oEvent);
    }

    /**
     * @param {Array<string>} keysArray An array of Key strings available as One of the KeyEvent.DOM_VK_* without the
     *    `KeyEvent.DOM_VK_` prefix. Eg: use `["ESCAPE"]` instead of fully specifying [`DOM_VK_ESCAPE`]
     *    E.g: __PR.keydown(["BACK_SPACE"]) or __PR.keydown(["BACK_SPACE"], {ctrlKey: true})
     * @param {object} modifiers to modify the key
     * @param {boolean} modifiers.ctrlKey
     * @param {boolean} modifiers.altKey
     * @param {boolean} modifiers.shiftKey
     * @param {boolean} modifiers.metaKey
     * @param keysArray
     */
    function keydown(keysArray, modifiers) {
        for(let key of keysArray) {
            if(typeof key === "string"){
                if(!key.startsWith("DOM_VK_")){
                    key = "DOM_VK_"+key;
                }
                key = KeyEvent[key];
                if(!key){
                    throw new Error(`Invalid key "${key}"`);
                }
            }
            raiseKeyEvent(key, "keydown", document.activeElement, modifiers);
        }
    }

    function typeAtCursor(text, origin) {
        const activeEditor = EditorManager.getActiveEditor();
        if(!activeEditor){
            throw new Error(`No active editor found to typeAtCursor: ${text}`);
        }
        const selections = activeEditor.getSelections();
        // Insert text at each cursor or the head of each selection.
        // We perform the insertions in reverse order to avoid affecting the indices of subsequent insertions.
        for (let selection of selections) {
            activeEditor.replaceRange(text, selection.start, selection.end, origin);
        }
    }

    // converts string of from "ln:ch" to pos object
    function _toPos(posString) {
        const pos = posString.split(":");
        return {line: Number(pos[0]) - 1, ch: Number(pos[1]) - 1 };
    }

    /**
     * Verify if the given text is same as what is in between the given selection.
     * @param {string} text
     * @param {string} selection of the form "ln:ch-ln:ch"
     */
    function validateText(text, selection) {
        const activeEditor = EditorManager.getActiveEditor();
        if(!activeEditor){
            throw new Error(`No active editor found to validateText: ${text} at selection ${selection}`);
        }
        const from = selection.split("-")[0], to = selection.split("-")[1];
        const selectedText = activeEditor.getTextBetween(_toPos(from), _toPos(to));
        if(selectedText !== text){
            throw new Error(`validateText: expected text at [${selection}] to be "${text}" but got "${selectedText}"`);
        }
    }

    function _getMarkLocations(markType, whichAPI, selections) {
        const activeEditor = EditorManager.getActiveEditor();
        if(!activeEditor){
            throw new Error(`No active editor found to ${whichAPI}: "${markType}" for selection "${selections}"`);
        }
        const marks = activeEditor.getAllMarks(markType);
        const marksLocations = [];
        for(let mark of marks){
            const loc = mark.find();
            marksLocations.push(`${loc.from.line+1}:${loc.from.ch+1}-${loc.to.line+1}:${loc.to.ch+1}`);
        }
        return marksLocations;
    }

    /**
     * validates all marks of the given mark type
     * @param {string} markType
     * @param {Array<string>} selections - An array of strings defining cursor positions or selection ranges.
     */
    function validateAllMarks(markType, selections) {
        const marksLocations = _getMarkLocations(markType, "validateAllMarks", selections);
        if(!selections || marksLocations.length !== selections.length){
            throw new Error(`validateAllMarks expected marks "${markType}" at: [${selections&&selections.join(", ")}] `+
                `but got marked locations [${marksLocations.join(", ")}]`);
        }
        for(let i = 0; i < selections.length; i++) {
            if(!selections.includes(`${marksLocations[i]}`) ||
                !marksLocations.includes(selections[i])){
                throw new Error(`validateAllMarks expected marks "${markType}" at: [${selections.join(", ")}] `+
                    `but got marked locations [${marksLocations.join(", ")}]`);
            }
        }
    }

    function validateEqual(obj1, obj2) {
        if(!_.isEqual(obj1, obj2)){
            throw new Error(`validateEqual: expected ${JSON.stringify(obj1)} to equal ${JSON.stringify(obj2)}`);
        }
    }

    /**
     * validates if the given mark type is present in the specified selections
     * @param {string} markType
     * @param {Array<string>} selections - An array of strings defining cursor positions or selection ranges.
     * @param {number} [totalMarkCount] optional to validate against the total number of expected marks of the type
     */
    function validateMarks(markType, selections, totalMarkCount) {
        const marksLocations = _getMarkLocations(markType, "validateMarks", selections);
        if(!selections){
            return;
        }
        if(totalMarkCount !== undefined && marksLocations.length !== totalMarkCount){
            throw new Error(`validateMarks expected mark count for "${markType}" to be: ${totalMarkCount} `+
                `but got ${marksLocations.length}`);
        }
        for(let selection of selections) {
            if(!marksLocations.includes(selection)){
                throw new Error(`validateMarks expected marks "${markType}" to be at: [${selections.join(", ")}] `+
                    `but got marked locations [${marksLocations.join(", ")}]`);
            }
        }
    }

    function closeFile() {
        return jsPromise(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }));
    }

    function closeAll() {
        return jsPromise(CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }));
    }

    function execCommand(commandID, args) {
        return jsPromise(CommandManager.execute(commandID, args));
    }

    function undo() {
        return execCommand(Commands.EDIT_UNDO);
    }

    function redo() {
        return execCommand(Commands.EDIT_REDO);
    }

    function setPreference(key, value){
        PreferencesManager.set(key, value);
    }

    function getPreference(key){
        return PreferencesManager.get(key);
    }

    const EDITING = {
        setEditorSpacing: function (useTabs, spaceOrTabCount, isAutoMode) {
            const activeEditor = EditorManager.getActiveEditor();
            if(!activeEditor){
                throw new Error(`No active editor found to setEditorSpacing`);
            }
            const fullPath = activeEditor.document.file.fullPath;
            if(Editor.Editor.getAutoTabSpaces(fullPath) !== isAutoMode){
                Editor.Editor.setAutoTabSpaces(isAutoMode, fullPath);
                isAutoMode && Editor.Editor._autoDetectTabSpaces(activeEditor, true, true);
            }
            Editor.Editor.setUseTabChar(useTabs, fullPath);
            if(useTabs) {
                Editor.Editor.setTabSize(spaceOrTabCount, fullPath);
            } else {
                Editor.Editor.setSpaceUnits(spaceOrTabCount, fullPath);
            }
        }
    };

    const __PR= {
        openFile, setCursors, expectCursorsToBe, keydown, typeAtCursor, validateText, validateAllMarks, validateMarks,
        closeFile, closeAll, undo, redo, setPreference, getPreference, validateEqual, EDITING
    };

    async function runMacro(macroText) {
        let errors = [];
        try{
            const AsyncFunction = async function () {}.constructor;
            const macroAsync = new AsyncFunction("__PR", "KeyEvent", macroText);
            await macroAsync(__PR, KeyEvent);
        } catch (e) {
            console.error("Error executing macro: ", macroText, e);
            errors.push({
                lineNo: 0, line: '',
                errorCode: `ERROR_EXEC`,
                errorText: `${e}`
            });
        }
        return errors;
    }

    if(Phoenix.isTestWindow) {
        window.__PR = __PR;
    }
    exports.computeCursors = computeCursors;
    exports.runMacro = runMacro;
});
