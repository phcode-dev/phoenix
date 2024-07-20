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
        FileSystem = brackets.getModule("filesystem/FileSystem"),
        Editor = brackets.getModule("editor/Editor"),
        Dialogs = brackets.getModule("widgets/Dialogs"),
        CommandManager = brackets.getModule("command/CommandManager"),
        Commands = brackets.getModule("command/Commands"),
        MacroRunner = brackets.getModule("utils/MacroRunner"),
        WorkspaceManager = brackets.getModule("view/WorkspaceManager");

    const BUILD_SCRATCH_FILE = path.join(brackets.app.getApplicationSupportDirectory(), "testBuilder.md");
    let builderPanel, $panel, builderEditor;

    function toggleTestBuilder() {
        builderPanel.setVisible(!builderPanel.isVisible());
    }
    const panelHTML = `
<div id="test-builder-panel-phcode" class="bottom-panel vert-resizable top-resizer">
    <div class="toolbar simple-toolbar-layout">
        <div class="title">Test Builder</div>
        <button class="btn btn-mini no-focus save-test-builder">Save</button>
        <button class="btn btn-mini primary no-focus run-test-builder">Run</button>
        <a href="#" class="close">&times;</a>
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

    async function runTests() {
        saveFile();
        const errors = await MacroRunner.runMacro(builderEditor.document.getText());
        if(errors.length) {
            let errorHTML = "";
            for (let error of errors) {
                errorHTML += `${error.errorText}<br>`;
            }
            Dialogs.showErrorDialog("Error running macro: ", errorHTML);
        }
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
            builderEditor.updateLayout();
        }).observe($panel[0]);

        $panel.find(".save-test-builder").click(saveFile);
        $panel.find(".run-test-builder").click(runTests);
    }

    AppInit.appReady(function () {
        $panel = $(panelHTML);
        builderPanel = WorkspaceManager.createBottomPanel("phcode-test-builder-panel", $panel, 100);
        builderPanel.hide();
        _setupPanel();
    });

    exports.toggleTestBuilder = toggleTestBuilder;
});
