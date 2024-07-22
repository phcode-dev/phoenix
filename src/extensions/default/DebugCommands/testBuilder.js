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

/*globals path*/

define(function (require, exports, module) {
    const AppInit = brackets.getModule("utils/AppInit"),
        DocumentManager = brackets.getModule("document/DocumentManager"),
        EditorManager = brackets.getModule("editor/EditorManager"),
        FileSystem = brackets.getModule("filesystem/FileSystem"),
        Editor = brackets.getModule("editor/Editor"),
        Dialogs = brackets.getModule("widgets/Dialogs"),
        CommandManager = brackets.getModule("command/CommandManager"),
        Commands = brackets.getModule("command/Commands"),
        WorkspaceManager = brackets.getModule("view/WorkspaceManager"),
        MacroRunner = require("./MacroRunner");

    const BUILD_SCRATCH_FILE = path.join(brackets.app.getApplicationSupportDirectory(), "testBuilder.js");
    let builderPanel, $panel, builderEditor;

    function toggleTestBuilder() {
        builderPanel.setVisible(!builderPanel.isVisible());
    }
    const panelHTML = `
<div id="test-builder-panel-phcode" class="bottom-panel vert-resizable top-resizer">
    <div class="toolbar" style="display: flex; justify-content: space-between;">
      <div style="display: flex">
         <div class="title">Test Builder</div>
         <button class="btn btn-mini no-focus save-test-builder">Save</button>
         <button class="btn btn-mini primary no-focus run-test-builder">Run</button>
         <button class="btn btn-mini no-focus run-selected">Run Selected</button>
      </div>
      <div>
         <button class="btn btn-mini no-focus cursor-locate" style="margin-right: 20px;">cursor</button>
         <a href="#" class="close" style="right: 0;margin-right: 10px;">&times;</a>
      </div>  
    </div>
    <div style="display: flex; height: 100%;">
<!--27 px is status bar height. If this is not set, the preview code mirror editor gives weird layout issues at times-->
        <div class="test_builder-editor" style="width: 100%; height: 100%;"></div>
    </div>
</div>`;

    function saveFile() {
        return new Promise((resolve, reject) => {
            CommandManager.execute(Commands.FILE_SAVE,
                {doc: builderEditor.document})
                .done(resolve)
                .fail(function (openErr) {
                    console.error("error saving test builder file: ", BUILD_SCRATCH_FILE, openErr);
                    reject();
                });
        });
    }

    async function runTests(macroText) {
        saveFile();
        const errors = await MacroRunner.runMacro(macroText || builderEditor.document.getText());
        if(errors.length) {
            let errorHTML = "";
            for (let error of errors) {
                errorHTML += `${error.errorText}<br>`;
            }
            Dialogs.showErrorDialog("Error running macro: ", errorHTML);
        }
    }

    function runSelection() {
        return runTests(builderEditor.getSelectedText());
    }

    function _locateCursor() {
        const editor = EditorManager.getActiveEditor();
        if(!editor) {
            return;
        }
        const selections = editor.getSelections();
        const formattedSelections = selections.map(selection => {
            const start = selection.start;
            const end = selection.end;

            // Check if the selection is a cursor (start and end are the same)
            if (start.line === end.line && start.ch === end.ch) {
                return `"${start.line+1}:${start.ch+1}"`;
            }
            return `"${start.line+1}:${start.ch+1}-${end.line+1}:${end.ch+1}"`;
        });
        builderEditor.replaceRange(`\nsetCursors([${formattedSelections.join(", ")}])`, builderEditor.getEndingCursorPos());
        editor.focus();
    }

    async function _setupPanel() {
        let file = FileSystem.getFileForPath(BUILD_SCRATCH_FILE);
        let isExists = await file.existsAsync();
        if(!isExists) {
            await new Promise(resolve => {
                file.write("", {blind: true}, resolve);
            });
        }
        DocumentManager.getDocumentForPath(BUILD_SCRATCH_FILE).done(function (doc) {
            const _$editor   = $panel.find(".test_builder-editor");
            builderEditor = new Editor.Editor(doc, false, _$editor, null, {});
            builderEditor.updateLayout();
        });
        new ResizeObserver(()=>{
            builderEditor && builderEditor.updateLayout();
        }).observe($panel[0]);

        $panel.find(".save-test-builder").click(saveFile);
        $panel.find(".run-test-builder").click(()=>{
            runTests();
        });
        $panel.find(".run-selected").click(runSelection);
        $panel.find(".cursor-locate").click(_locateCursor);
    }

    AppInit.appReady(function () {
        $panel = $(panelHTML);
        builderPanel = WorkspaceManager.createBottomPanel("phcode-test-builder-panel", $panel, 100);
        builderPanel.hide();
        _setupPanel();
    });

    exports.toggleTestBuilder = toggleTestBuilder;
});
