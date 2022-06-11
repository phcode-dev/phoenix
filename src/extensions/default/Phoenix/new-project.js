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
        StringUtils = brackets.getModule("utils/StringUtils"),
        ExtensionInterface = brackets.getModule("utils/ExtensionInterface"),
        CommandManager = brackets.getModule("command/CommandManager"),
        Commands = brackets.getModule("command/Commands"),
        Menus = brackets.getModule("command/Menus"),
        Metrics = brackets.getModule("utils/Metrics"),
        DefaultDialogs = brackets.getModule("widgets/DefaultDialogs"),
        FileSystem = brackets.getModule("filesystem/FileSystem"),
        ProjectManager = brackets.getModule("project/ProjectManager"),
        createProjectDialogue = require("text!create-project-dialogue.html"),
        utils = require("utils");

    const FEATURE_NEW_PROJECT_DIALOGUE = 'newProjectDialogue',
        NEW_PROJECT_INTERFACE = "Extn.Phoenix.newProject";

    ExtensionInterface.registerExtensionInterface(NEW_PROJECT_INTERFACE, exports);

    let newProjectDialogueObj,
        createProjectDialogueObj;

    // TODO: change default enabled to true to ship this feature.
    FeatureGate.registerFeatureGate(FEATURE_NEW_PROJECT_DIALOGUE, false);

    function _showNewProjectDialogue() {
        var templateVars = {
            Strings: Strings,
            newProjectURL: `${window.location.href}/assets/new-project/code-editor.html`
        };
        let dialogueContents = Mustache.render(newProjectTemplate, templateVars);
        newProjectDialogueObj = Dialogs.showModalDialogUsingTemplate(dialogueContents, true);
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
        newProjectDialogueObj.close();
    }

    function showErrorDialogue(title, message) {
        Dialogs.showModalDialog(
            DefaultDialogs.DIALOG_ID_ERROR,
            title,
            message
        );
    }

    function openFolder () {
        if(!window.showOpenFilePicker){
            showErrorDialogue(
                Strings.UNSUPPORTED_BROWSER,
                Strings.UNSUPPORTED_BROWSER_OPEN_FOLDER
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

    function _showProjectErrorDialogue(desc, projectPath, err) {
        let message = StringUtils.format(desc, projectPath, err);
        showErrorDialogue(Strings.ERROR_LOADING_PROJECT, message);
    }

    async function _validateProjectFolder(projectPath) {
        return new Promise((resolve, reject)=>{
            let dir = FileSystem.getDirectoryForPath(projectPath);
            let displayPath = projectPath.replace("/mnt/", "");
            if(!dir){
                _showProjectErrorDialogue(Strings.REQUEST_NATIVE_FILE_SYSTEM_ERROR, displayPath, Strings.NOT_FOUND_ERR);
                reject();
            }
            dir.getContents(function (err, contents) {
                if (err) {
                    _showProjectErrorDialogue(Strings.READ_DIRECTORY_ENTRIES_ERROR, displayPath, Strings.NOT_FOUND_ERR);
                    reject();
                    return;
                }
                if(contents.length >0){
                    _showProjectErrorDialogue(Strings.DIRECTORY_NOT_EMPTY, displayPath);
                    reject();
                    return;
                }
                resolve();
            });
        });
    }

    function _getSuggestedProjectDir(url) {
        // this is for vfs default project loc
    }

    function _showCreateProjectDialogue(title, message) {
        var templateVars = {
            Strings: Strings,
            TITLE: title,
            MESSAGE: message
        };
        createProjectDialogueObj=
            Dialogs.showModalDialogUsingTemplate(Mustache.render(createProjectDialogue, templateVars));
    }

    function _closeCreateProjectDialogue() {
        createProjectDialogueObj.close();
    }

    function _updateCreateProjectDialogueMessage(message, title) {
        let el = document.getElementById('new-prj-msg-dlg-message');
        if(el){
            el.textContent = message;
        }
        el = document.getElementById('new-prj-msg-dlg-title');
        if(el && title){
            el.textContent = title;
        }
    }

    function _unzipProject(data, projectPath, flattenFirstLevelInZip) {
        return new Promise((resolve, reject)=>{
            _updateCreateProjectDialogueMessage(Strings.UNZIP_IN_PROGRESS, Strings.DOWNLOAD_COMPLETE);
            utils.unzipFileToLocation(data, projectPath, flattenFirstLevelInZip)
                .then(resolve)
                .catch(reject);
        });
    }

    /**
     *
     * @param downloadURL
     * @param projectPath
     * @param suggestedProjectName
     * @param flattenFirstLevelInZip if set to true, then if zip contents are nested inside a directory, the nexted dir
     * will be removed in the path structure in destination. For Eg. some Zip may contain a `contents` folder inside the
     * zip which has all the contents. If we blindly extract the zio, all the contents will be placed inside a
     * `contents` folder in root and not the root dir itself.
     * See a sample zip file here: https://api.github.com/repos/StartBootstrap/startbootstrap-grayscales/zipball
     * @returns {Promise<void>}
     */
    async function downloadAndOpenProject(downloadURL, projectPath, suggestedProjectName, flattenFirstLevelInZip) {
        return new Promise(async (resolve, reject)=>{
            // if project path is null, create one in default folder
            if(!projectPath){
                projectPath = _getSuggestedProjectDir(downloadURL);
            }
            await _validateProjectFolder(projectPath);
            console.log(`downloadAndOpenProject ${suggestedProjectName} from URL: ${downloadURL} to: ${projectPath}`);

            _showCreateProjectDialogue(Strings.SETTING_UP_PROJECT, Strings.DOWNLOADING);
            window.JSZipUtils.getBinaryContent(downloadURL, {
                callback: async function(err, data) {
                    if(err) {
                        console.error("could not load phoenix default project from zip file!", err);
                        _closeCreateProjectDialogue();
                        showErrorDialogue(Strings.DOWNLOAD_FAILED, Strings.DOWNLOAD_FAILED_MESSAGE);
                        reject();
                    } else {
                        _unzipProject(data, projectPath, flattenFirstLevelInZip)
                            .then(()=>{
                                _closeCreateProjectDialogue();
                                ProjectManager.openProject(projectPath)
                                    .then(resolve)
                                    .fail(reject);
                            })
                            .catch(()=>{
                                _closeCreateProjectDialogue();
                                showErrorDialogue(Strings.ERROR_LOADING_PROJECT, Strings.UNZIP_FAILED);
                                reject();
                            });
                        console.log("Project Setup complete: ", projectPath);
                    }
                },
                progress: function (status){
                    if(status.percent > 0){
                        _updateCreateProjectDialogueMessage(`${Strings.DOWNLOADING} ${Math.round(status.percent)}%`);
                    }
                }
            });
        });
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
    exports.showErrorDialogue = showErrorDialogue;
});
