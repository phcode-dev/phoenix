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

/*global Phoenix*/

define(function (require, exports, module) {
    const Dialogs = brackets.getModule("widgets/Dialogs"),
        Mustache = brackets.getModule("thirdparty/mustache/mustache"),
        newProjectTemplate = require("text!html/new-project-template.html"),
        Strings = brackets.getModule("strings"),
        StringUtils = brackets.getModule("utils/StringUtils"),
        ExtensionInterface = brackets.getModule("utils/ExtensionInterface"),
        CommandManager = brackets.getModule("command/CommandManager"),
        Commands = brackets.getModule("command/Commands"),
        Menus = brackets.getModule("command/Menus"),
        Metrics = brackets.getModule("utils/Metrics"),
        DefaultDialogs = brackets.getModule("widgets/DefaultDialogs"),
        FileSystem = brackets.getModule("filesystem/FileSystem"),
        FileUtils = brackets.getModule("file/FileUtils"),
        ProjectManager = brackets.getModule("project/ProjectManager"),
        NotificationUI = brackets.getModule("widgets/NotificationUI"),
        createProjectDialogue = require("text!html/create-project-dialogue.html"),
        replaceProjectDialogue = require("text!html/replace-project-dialogue.html"),
        replaceKeepProjectDialogue = require("text!html/replace-keep-project-dialogue.html"),
        utils = require("utils");

    const NEW_PROJECT_INTERFACE = "Extn.Phoenix.newProject",
        MAX_DEDUPE_COUNT = 10000;

    ExtensionInterface.registerExtensionInterface(NEW_PROJECT_INTERFACE, exports);

    let newProjectDialogueObj,
        createProjectDialogueObj,
        downloadCancelled = false;

    function _showNewProjectDialogue() {
        let templateVars = {
            Strings: Strings,
            newProjectURL: `${window.location.href}/assets/new-project/code-editor.html`
        };
        let dialogueContents = Mustache.render(newProjectTemplate, templateVars);
        newProjectDialogueObj = Dialogs.showModalDialogUsingTemplate(dialogueContents, true);
        setTimeout(()=>{
            document.getElementById("newProjectFrame").contentWindow.focus();
        }, 100);
        Metrics.countEvent(Metrics.EVENT_TYPE.NEW_PROJECT, "dialogue", "open");
    }

    function _addMenuEntries() {
        CommandManager.register(Strings.CMD_PROJECT_NEW, Commands.FILE_NEW_PROJECT, _showNewProjectDialogue);
        const fileMenu = Menus.getMenu(Menus.AppMenuBar.FILE_MENU);
        fileMenu.addMenuItem(Commands.FILE_NEW_PROJECT, "Alt-Shift-N", Menus.AFTER, Commands.FILE_NEW);
    }

    function closeDialogue() {
        Metrics.countEvent(Metrics.EVENT_TYPE.NEW_PROJECT, "dialogue", "open");
        newProjectDialogueObj.close();
        NotificationUI.createFromTemplate("yo <b>hello world</b>",
            "showInfileTree", {
                allowedPlacements: ['top', 'bottom'],
                autoCloseTimeS: 30,
                dismissOnClick: true
        }).done(()=>{
            console.log('done');
        });
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
        _addMenuEntries();
        _showNewProjectDialogue();
    }

    function _showProjectErrorDialogue(desc, projectPath, err) {
        let message = StringUtils.format(desc, projectPath, err);
        showErrorDialogue(Strings.ERROR_LOADING_PROJECT, message);
    }

    function _showReplaceProjectConfirmDialogue(projectPath) {
        let message = StringUtils.format(Strings.DIRECTORY_REPLACE_MESSAGE, projectPath);
        let templateVars = {
            Strings: Strings,
            MESSAGE: message
        };
        return Dialogs.showModalDialogUsingTemplate(Mustache.render(replaceProjectDialogue, templateVars));
    }

    function _showReplaceKeepProjectConfirmDialogue(projectPath) {
        let message = StringUtils.format(Strings.DIRECTORY_REPLACE_MESSAGE, projectPath);
        let templateVars = {
            Strings: Strings,
            MESSAGE: message
        };
        return Dialogs.showModalDialogUsingTemplate(Mustache.render(replaceKeepProjectDialogue, templateVars));
    }

    function _checkIfPathIsWritable(path) {
        // this is needed as for fs access APIs in native folders, the browser will ask an additional write permission
        // to the user. We have to validate that before proceeding.
        // We do this by writing a file `.brackets.json` to the folder
        return new Promise((resolve, reject)=>{
            let file = FileSystem.getFileForPath(`${path}/.brackets.json`);
            FileUtils.writeText(file, "{}")
                .done(resolve)
                .fail(reject);
        });
    }

    async function _validateProjectFolder(projectPath) {
        return new Promise(async (resolve, reject)=>{
            let dir = FileSystem.getDirectoryForPath(projectPath);
            let displayPath = projectPath.replace(Phoenix.VFS.getMountDir(), "");
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
                function _resolveIfWritable() {
                    _checkIfPathIsWritable(projectPath)
                        .then(resolve)
                        .catch(reject);
                }
                if(contents.length >0){
                    _showReplaceProjectConfirmDialogue(displayPath).done(function (id) {
                        if (id === Dialogs.DIALOG_BTN_OK) {
                            _resolveIfWritable();
                            return;
                        }
                        reject();
                    });
                } else {
                    _resolveIfWritable();
                }
            });
        });
    }

    async function _findFreeFolderName(basePath) {
        return new Promise(async (resolve, reject)=>{
            for(let i=0; i< MAX_DEDUPE_COUNT; i++){
                let newPath = `${basePath}-${i}`;
                let exists = await window.Phoenix.VFS.existsAsync(newPath);
                if(!exists){
                    await window.Phoenix.VFS.ensureExistsDirAsync(newPath);
                    resolve(newPath);
                    return;
                }
            }
            reject();
        });
    }

    async function alreadyExists(suggestedProjectName) {
        let projectPath = `${ProjectManager.getLocalProjectsPath()}${suggestedProjectName}`; // try suggested path first
        return await window.Phoenix.VFS.existsAsync(projectPath);
    }

    async function _getSuggestedProjectDir(suggestedProjectName) {
        return new Promise(async (resolve, reject)=>{
            let projectPath = `${ProjectManager.getLocalProjectsPath()}${suggestedProjectName}`; // try suggested path first
            let exists = await window.Phoenix.VFS.existsAsync(projectPath);
            if(!exists){
                resolve(projectPath);
                return;
            }
            _showReplaceKeepProjectConfirmDialogue(suggestedProjectName).done(function (id) {
                if (id === Dialogs.DIALOG_BTN_OK) {
                    resolve(projectPath);
                    return;
                } else if(id === Dialogs.DIALOG_BTN_CANCEL){
                    reject();
                    return;
                }
                _findFreeFolderName(projectPath)
                    .then(projectPath=>resolve(projectPath))
                    .catch(reject);
            });
        });
    }

    function _showCreateProjectDialogue(title, message) {
        let templateVars = {
            Strings: Strings,
            TITLE: title,
            MESSAGE: message
        };
        createProjectDialogueObj=
            Dialogs.showModalDialogUsingTemplate(Mustache.render(createProjectDialogue, templateVars));
        return createProjectDialogueObj;
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
                projectPath = await _getSuggestedProjectDir(suggestedProjectName);
            } else {
                await _validateProjectFolder(projectPath);
            }
            console.log(`downloadAndOpenProject ${suggestedProjectName} from URL: ${downloadURL} to: ${projectPath}`);

            downloadCancelled = false;
            _showCreateProjectDialogue(Strings.SETTING_UP_PROJECT, Strings.DOWNLOADING).done(function (id) {
                if (id === Dialogs.DIALOG_BTN_CANCEL) {
                    downloadCancelled = true;
                }
            });
            window.JSZipUtils.getBinaryContent(downloadURL, {
                callback: async function(err, data) {
                    if(downloadCancelled){
                        reject();
                    } else if(err) {
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
                                console.log("Project Setup complete: ", projectPath);
                            })
                            .catch(()=>{
                                _closeCreateProjectDialogue();
                                showErrorDialogue(Strings.ERROR_LOADING_PROJECT, Strings.UNZIP_FAILED);
                                reject();
                            });
                    }
                },
                progress: function (status){
                    if(status.percent > 0){
                        _updateCreateProjectDialogueMessage(`${Strings.DOWNLOADING} ${Math.round(status.percent)}%`);
                    }
                },
                abortCheck: function (){
                    return downloadCancelled;
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
    exports.alreadyExists = alreadyExists;
    exports.Metrics = Metrics;
    exports.getWelcomeProjectPath = ProjectManager.getWelcomeProjectPath;
    exports.getExploreProjectPath = ProjectManager.getExploreProjectPath;
    exports.getLocalProjectsPath = ProjectManager.getLocalProjectsPath;
    exports.getMountDir = Phoenix.VFS.getMountDir;
});
