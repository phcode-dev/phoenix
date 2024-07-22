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
 *  Utilities functions for running macros. This can be later extended to run macros. But since this uses eval, the
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
        EditorManager = brackets.getModule("editor/EditorManager"),
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

    const __PR= {
        openFile, setCursors, expectCursorsToBe
    };

    async function runMacro(macroText) {
        let errors = [];
        try{
            const AsyncFunction = async function () {}.constructor;
            const macroAsync = new AsyncFunction("__PR", macroText);
            await macroAsync(__PR);
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
