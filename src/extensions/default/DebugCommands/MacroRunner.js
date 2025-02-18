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
        FileSystem = brackets.getModule("filesystem/FileSystem"),
        MainViewManager = brackets.getModule("view/MainViewManager"),
        FileUtils   = brackets.getModule("file/FileUtils"),
        PreferencesManager  = brackets.getModule("preferences/PreferencesManager"),
        Editor = brackets.getModule("editor/Editor"),
        Dialogs = brackets.getModule("widgets/Dialogs"),
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
     * Reads a text file and returns a promise that resolves to the text
     * @param filePath - project relative or full path
     * @param {boolean?} bypassCache - an optional argument, if specified will read from disc instead of using cache.
     * @returns {Promise<String>}
     */
    function readTextFile(filePath, bypassCache) {
        if(!filePath.startsWith('/')) {
            filePath = path.join(ProjectManager.getProjectRoot().fullPath, filePath);
        }
        const file = FileSystem.getFileForPath(filePath);
        return jsPromise(FileUtils.readAsText(file, bypassCache));
    }

    /**
     * Asynchronously writes a file as UTF-8 encoded text.
     * @param filePath - project relative or full path
     * @param {String} text
     * @param {boolean} allowBlindWrite Indicates whether or not CONTENTS_MODIFIED
     *      errors---which can be triggered if the actual file contents differ from
     *      the FileSystem's last-known contents---should be ignored.
     * @return {Promise<null>} promise that will be resolved when
     * file writing completes, or rejected with a FileSystemError string constant.
     */
    function writeTextFile(filePath, text, allowBlindWrite) {
        if(!filePath.startsWith('/')) {
            filePath = path.join(ProjectManager.getProjectRoot().fullPath, filePath);
        }
        const file = FileSystem.getFileForPath(filePath);
        return jsPromise(FileUtils.writeText(file, text, allowBlindWrite));
    }

    /**
     * deletes a file or dir at given path
     * @param filePath - project relative or full path
     * @return {Promise<null>} promise that will be resolved when path removed
     */
    function deletePath(filePath) {
        if(!filePath.startsWith('/')) {
            filePath = path.join(ProjectManager.getProjectRoot().fullPath, filePath);
        }
        return new Promise((resolve, reject) => {
            window.fs.unlink(filePath, (err)=>{
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
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

    function validateEqual(obj1, obj2, message = "") {
        if(!_.isEqual(obj1, obj2)){
            throw new Error(`validateEqual: ${ message ? message + "\n" : ""
            } expected ${JSON.stringify(obj1)} to equal ${JSON.stringify(obj2)}`);
        }
    }

    function validateNotEqual(obj1, obj2) {
        if(_.isEqual(obj1, obj2)){
            throw new Error(`validateEqual: expected ${JSON.stringify(obj1)} to NOT equal ${JSON.stringify(obj2)}`);
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

    function execCommand(commandID, arg) {
        return jsPromise(CommandManager.execute(commandID, arg));
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

    // Helper function to get full path (reusing existing openFile logic)
    function _getFullPath(filePath) {
        if(filePath.startsWith('/')) {
            return filePath;
        }
        return path.join(ProjectManager.getProjectRoot().fullPath, filePath);
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
        },
        /**
         * Split the editor pane vertically
         */
        splitVertical: function() {
            CommandManager.execute(Commands.CMD_SPLITVIEW_VERTICAL);
        },

        /**
         * Split the editor pane horizontally
         */
        splitHorizontal: function() {
            CommandManager.execute(Commands.CMD_SPLITVIEW_HORIZONTAL);
        },

        /**
         * Remove split pane and return to single pane view
         */
        splitNone: function() {
            CommandManager.execute(Commands.CMD_SPLITVIEW_NONE);
        },
        /**
         * Gets the editor in the first pane (left/top)
         * @return {?Editor} The editor in first pane or null if not available
         */
        getFirstPaneEditor: function() {
            return MainViewManager.getCurrentlyViewedEditor("first-pane");
        },

        /**
         * Gets the editor in the second pane (right/bottom)
         * @return {?Editor} The editor in second pane or null if not available
         */
        getSecondPaneEditor: function() {
            return MainViewManager.getCurrentlyViewedEditor("second-pane");
        },

        /**
         * Checks if the view is currently split
         * @return {boolean} True if view is split, false otherwise
         */
        isSplit: function() {
            return MainViewManager.getPaneCount() > 1;
        },
        /**
         * Opens a file in the first pane (left/top)
         * @param {string} filePath - Project relative or absolute file path
         * @param {boolean} [addToWorkingSet] - true to add to working set
         * @returns {Promise} A promise that resolves when the file is opened
         */
        openFileInFirstPane: function(filePath, addToWorkingSet) {
            const command = addToWorkingSet ? Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN : Commands.FILE_OPEN;
            return jsPromise(CommandManager.execute(command, {
                fullPath: _getFullPath(filePath),
                paneId: "first-pane"
            }));
        },

        /**
         * Opens a file in the second pane (right/bottom)
         * @param {string} filePath - Project relative or absolute file path
         * @param {boolean} addToWorkingSet - true to add to working set
         * @returns {Promise} A promise that resolves when the file is opened
         */
        openFileInSecondPane: function(filePath, addToWorkingSet) {
            const command = addToWorkingSet ? Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN : Commands.FILE_OPEN;
            return jsPromise(CommandManager.execute(command, {
                fullPath: _getFullPath(filePath),
                paneId: "second-pane"
            }));
        },
        /**
         * Focus the first pane (left/top)
         */
        focusFirstPane: function() {
            MainViewManager.setActivePaneId("first-pane");
        },

        /**
         * Focus the second pane (right/bottom)
         */
        focusSecondPane: function() {
            MainViewManager.setActivePaneId("second-pane");
        }
    };

    /**
     * Waits for a polling function to succeed or until a timeout is reached.
     * The polling function is periodically invoked to check for success, and
     * the function rejects with a timeout message if the timeout duration elapses.
     *
     * @param {function} pollFn - A function that returns `true` or a promise resolving to `true`/`false`
     *                            to indicate success and stop waiting.
     *                            The function will be called repeatedly until it succeeds or times out.
     * @param {string|function} _timeoutMessageOrMessageFn - A helpful string message or an async function
     *                                                       that returns a string message to reject with in case of timeout.
     *                                                       Example:
     *                                                       - String: "Condition not met within the allowed time."
     *                                                       - Function: `async () => "Timeout while waiting for the process to complete."`
     * @param {number} [timeoutms=2000] - The maximum time to wait in milliseconds before timing out. Defaults to 2 seconds.
     * @param {number} [pollInterval=10] - The interval in milliseconds at which `pollFn` is invoked. Defaults to 10ms.
     * @returns {Promise<void>} A promise that resolves when `pollFn` succeeds or rejects with a timeout message.
     *
     * @throws {Error} If `timeoutms` or `pollInterval` is not a number.
     *
     * @example
     * // Example 1: Using a string as the timeout message
     * awaitsFor(
     *   () => document.getElementById("element") !== null,
     *   "Element did not appear within the allowed time.",
     *   5000,
     *   100
     * ).then(() => {
     *   console.log("Element appeared!");
     * }).catch(err => {
     *   console.error(err.message);
     * });
     *
     * @example
     * // Example 2: Using a function as the timeout message
     * awaitsFor(
     *  () => document.getElementById("element") !== null,
     *   async () => {
     *     const el = document.getElementById("element");
     *     return `expected ${el} to be null`;
     *   },
     *   10000,
     *   500
     * ).then(() => {
     *   console.log("Element appeared!");
     * }).catch(err => {
     *   console.error(err.message);
     * });
     */
    function awaitsFor(pollFn, _timeoutMessageOrMessageFn, timeoutms = 2000, pollInterval = 10){
        if(typeof  _timeoutMessageOrMessageFn === "number"){
            timeoutms = _timeoutMessageOrMessageFn;
            pollInterval = timeoutms;
        }
        if(!(typeof  timeoutms === "number" && typeof  pollInterval === "number")){
            throw new Error("awaitsFor: invalid parameters when awaiting for " + _timeoutMessageOrMessageFn);
        }

        async function _getExpectMessage(_timeoutMessageOrMessageFn) {
            try{
                if(typeof _timeoutMessageOrMessageFn === "function") {
                    _timeoutMessageOrMessageFn = _timeoutMessageOrMessageFn();
                    if(_timeoutMessageOrMessageFn instanceof Promise){
                        _timeoutMessageOrMessageFn = await _timeoutMessageOrMessageFn;
                    }
                }
            } catch (e) {
                _timeoutMessageOrMessageFn = "Error executing expected message function:" + e.stack;
            }
            return _timeoutMessageOrMessageFn;
        }

        function _timeoutPromise(promise, ms) {
            const timeout = new Promise((_, reject) => {
                setTimeout(async () => {
                    _timeoutMessageOrMessageFn = await _getExpectMessage(_timeoutMessageOrMessageFn);
                    reject(new Error(_timeoutMessageOrMessageFn || `Promise timed out after ${ms}ms`));
                }, ms);
            });

            return Promise.race([promise, timeout]);
        }

        return new Promise((resolve, reject)=>{
            let startTime = Date.now(),
                lapsedTime;
            async function pollingFn() {
                try{
                    let result = pollFn();

                    // If pollFn returns a promise, await it
                    if (Object.prototype.toString.call(result) === "[object Promise]") {
                        // we cant simply check for result instanceof Promise as the Promise may be returned from
                        // an iframe and iframe has a different instance of Promise than this js context.
                        result = await _timeoutPromise(result, timeoutms);
                    }

                    if (result) {
                        resolve();
                        return;
                    }
                    lapsedTime = Date.now() - startTime;
                    if(lapsedTime>timeoutms){
                        _timeoutMessageOrMessageFn = await _getExpectMessage(_timeoutMessageOrMessageFn);
                        reject("awaitsFor timed out waiting for - " + _timeoutMessageOrMessageFn);
                        return;
                    }
                    setTimeout(pollingFn, pollInterval);
                } catch (e) {
                    reject(e);
                }
            }
            pollingFn();
        });
    }

    async function waitForModalDialog(dialogClass, friendlyName, timeout = 2000) {
        dialogClass = dialogClass || "";
        friendlyName = friendlyName || dialogClass || "Modal Dialog";
        await awaitsFor(()=>{
            let $dlg = $(`.modal.instance${dialogClass}`);
            return $dlg.length >= 1;
        }, `Waiting for Modal Dialog to show ${friendlyName}`, timeout);
    }

    async function waitForModalDialogClosed(dialogClass, friendlyName, timeout = 2000) {
        dialogClass = dialogClass || "";
        friendlyName = friendlyName || dialogClass || "Modal Dialog";
        await awaitsFor(()=>{
            let $dlg = $(`.modal.instance${dialogClass}`);
            return $dlg.length === 0;
        }, `Waiting for Modal Dialog to not there ${friendlyName}`, timeout);
    }

    /** Clicks on a button within a specified dialog.
     * This function identifies a dialog using its class and locates a button either by its selector or button ID.
     * Validation to ensure the dialog and button exist and that the button is enabled before attempting to click.
     *
     * @param {string} selectorOrButtonID - The selector or button ID to identify the button to be clicked.
     *                                       Example (as selector): ".my-button-class".
     *                                       Example (as button ID): "ok".
     * @param {string} dialogClass - The class of the dialog (optional). If omitted, defaults to an empty string.
     *                               Example: "my-dialog-class".
     * @param {boolean} isButtonID - If `true`, `selectorOrButtonid` is treated as a button ID.
     *                                If `false`, it is treated as a jQuery selector. Default is `false`.
     *
     * @throws {Error} Throws an error if:
     *   - The specified dialog does not exist.
     *   - Multiple buttons match the given selector or ID.
     *   - No button matches the given selector or ID.
     *   - The button is disabled and cannot be clicked.
     *
     */
    function _clickDialogButtonWithSelector(selectorOrButtonID, dialogClass, isButtonID) {
        dialogClass = dialogClass || "";
        const $dlg = $(`.modal.instance${dialogClass}`);

        if(!$dlg.length){
            throw new Error(`No such dialog present: "${dialogClass}"`);
        }

        const $button = isButtonID ?
            $dlg.find(".dialog-button[data-button-id='" + selectorOrButtonID + "']") :
            $dlg.find(selectorOrButtonID);
        if($button.length > 1){
            throw new Error(`Multiple button in dialog "${selectorOrButtonID}"`);
        } else if(!$button.length){
            throw new Error(`No such button in dialog "${selectorOrButtonID}"`);
        }

        if($button.prop("disabled")) {
            throw new Error(`Cannot click, button is disabled. "${selectorOrButtonID}"`);
        }

        $button.click();
    }

    /**
     * Clicks on a button within a specified dialog using its button ID.
     *
     * @param {string} buttonID - The unique ID of the button to be clicked. usually One of the
     *                            __PR.Dialogs.DIALOG_BTN_* symbolic constants or a custom id. You can find the button
     *                            id in the dialog by inspecting the button and checking its `data-button-id` attribute
     *                            Example: __PR.Dialogs.DIALOG_BTN_OK.
     * @param {string} [dialogClass] - The class of the dialog containing the button. Optional, if only one dialog
     *                               is present, you can omit this.
     *                               Example: "my-dialog-class".
     * @throws {Error} Throws an error if:
     *   - The specified dialog does not exist.
     *   - No button matches the given button ID.
     *   - Multiple buttons match the given button ID.
     *   - The button is disabled and cannot be clicked.
     *
     * @example
     * // Example: Click a button by its ID
     * __PR.clickDialogButtonID(__PR.Dialogs.DIALOG_BTN_OK, "my-dialog-class");
     * __PR.clickDialogButtonID(__PR.Dialogs.DIALOG_BTN_OK); // if only 1 dialog is present, can omit the dialog class
     * __PR.clickDialogButtonID("customBtnID", "my-dialog-class");
     */
    function clickDialogButtonID(buttonID, dialogClass) {
        _clickDialogButtonWithSelector(buttonID, dialogClass, true);
    }

    /**
     * Clicks on a button within a specified dialog using a selector.
     *
     * @param {string} buttonSelector - A jQuery selector to identify the button to be clicked.
     *                                   Example: ".showImageBtn".
     * @param {string} [dialogClass] - The class of the dialog containing the button. Optional, if only one dialog
     *                               is present, you can omit this.
     *                               Example: "my-dialog-class".
     * @throws {Error} Throws an error if:
     *   - The specified dialog does not exist.
     *   - No button matches the given selector.
     *   - Multiple buttons match the given selector.
     *   - The button is disabled and cannot be clicked.
     *
     * @example
     * // Example: Click a button using a selector
     * __PR.clickDialogButton(".showImageBtn", "my-dialog-class");
     * __PR.clickDialogButton(".showImageBtn"); // if only 1 dialog is present, can omit the dialog class
     */
    function clickDialogButton(buttonSelector, dialogClass) {
        _clickDialogButtonWithSelector(buttonSelector, dialogClass, false);
    }

    /**
     * Saves the currently active file
     * @returns {Promise<void>} A promise that resolves when file is saved to disc
     */
    function saveActiveFile() {
        return jsPromise(CommandManager.execute(Commands.FILE_SAVE));
    }

    const __PR= {
        readTextFile, writeTextFile, deletePath,
        openFile, setCursors, expectCursorsToBe, keydown, typeAtCursor, validateText, validateAllMarks, validateMarks,
        closeFile, closeAll, undo, redo, setPreference, getPreference, validateEqual, validateNotEqual, execCommand,
        saveActiveFile,
        awaitsFor, waitForModalDialog, waitForModalDialogClosed, clickDialogButtonID, clickDialogButton,
        EDITING, // contains apis like splitVertical, openFileInFirstPane. focus pane etc...
        $, Commands, Dialogs
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
