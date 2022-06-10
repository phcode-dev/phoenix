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

define(function (require, exports, module) {
    const Dialogs = brackets.getModule("widgets/Dialogs"),
        Mustache = brackets.getModule("thirdparty/mustache/mustache"),
        FeatureGate = brackets.getModule("utils/FeatureGate"),
        newProjectTemplate = require("text!new-project-template.html"),
        Strings = brackets.getModule("strings"),
        ExtensionInterface = brackets.getModule("utils/ExtensionInterface"),
        CommandManager = brackets.getModule("command/CommandManager"),
        Commands = brackets.getModule("command/Commands"),
        Menus = brackets.getModule("command/Menus"),
        Metrics = brackets.getModule("utils/Metrics"),
        DefaultDialogs = brackets.getModule("widgets/DefaultDialogs"),
        FileSystem = brackets.getModule("filesystem/FileSystem");

    const FEATURE_NEW_PROJECT_DIALOGUE = 'newProjectDialogue',
        NEW_PROJECT_INTERFACE = "Extn.Phoenix.newProject";

    ExtensionInterface.registerExtensionInterface(NEW_PROJECT_INTERFACE, exports);

    let dialogue;

    // TODO: change default enabled to true to ship this feature.
    FeatureGate.registerFeatureGate(FEATURE_NEW_PROJECT_DIALOGUE, false);

    function _showNewProjectDialogue() {
        var templateVars = {
            Strings: Strings,
            newProjectURL: `${window.location.href}/assets/new-project/code-editor.html`
        };
        let dialogueContents = Mustache.render(newProjectTemplate, templateVars);
        dialogue = Dialogs.showModalDialogUsingTemplate(dialogueContents, true);
        setTimeout(()=>{
            document.getElementById("newProjectFrame").contentWindow.focus();
        }, 100);
        Metrics.countEvent(Metrics.EVENT_TYPE.NEW_PROJECT, "dialogue", "open", 1);
    }

    function _addMenuEntries() {
        CommandManager.register(Strings.CMD_PROJECT_NEW, Commands.FILE_NEW_PROJECT, _showNewProjectDialogue);
        const fileMenu = Menus.getMenu(Menus.AppMenuBar.FILE_MENU);
        fileMenu.addMenuItem(Commands.FILE_NEW_PROJECT, "Alt-Shift-N", Menus.AFTER, Commands.FILE_NEW);
    }

    function closeDialogue() {
        Metrics.countEvent(Metrics.EVENT_TYPE.NEW_PROJECT, "dialogue", "open", 1);
        dialogue.close();
    }

    function openFolder () {
        if(!window.showOpenFilePicker){
            Dialogs.showModalDialog(
                DefaultDialogs.DIALOG_ID_ERROR,
                Strings.UNSUPPORTED_BROWSER,
                "Browser does not support Open folder."
            );
        }
        CommandManager.execute(Commands.FILE_OPEN_FOLDER).then(closeDialogue);
    }

    function init() {
        if(!FeatureGate.isFeatureEnabled(FEATURE_NEW_PROJECT_DIALOGUE)){
            return;
        }
        _addMenuEntries();
        _showNewProjectDialogue();
    }

    function downloadAndOpenProject(downloadURL, projectPath) {
        console.log(downloadURL, projectPath);

        // https://api.github.com/repos/phcode-dev/phoenix/zipball
        // window.JSZipUtils.getBinaryContent(downloadURL, {
        //     callback: function(err, data) {
        //         if(err) {
        //             console.error("could not load phoenix default project from zip file!");
        //         } else {
        //             console.log("default project Setup complete: ", data.length);
        //         }
        //     },
        //     progress: function (){
        //         console.log(arguments);
        //     }
        // });
    }

    function showFolderSelect() {
        return new Promise((resolve, reject)=>{
            FileSystem.showOpenDialog(false, true, Strings.CHOOSE_FOLDER, '', null, function (err, files) {
                if(err || files.length !== 1){
                    reject();
                    return;
                }
                resolve(files[0]);
            });
        });
    }

    exports.init = init;
    exports.openFolder = openFolder;
    exports.closeDialogue = closeDialogue;
    exports.downloadAndOpenProject = downloadAndOpenProject;
    exports.showFolderSelect = showFolderSelect;
});
