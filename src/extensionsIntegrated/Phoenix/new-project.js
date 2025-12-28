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

define(function (require, exports, module) {
    const Dialogs = require("widgets/Dialogs"),
        Mustache = require("thirdparty/mustache/mustache"),
        newProjectTemplate = require("text!./html/new-project-template.html"),
        Strings = require("strings"),
        StringUtils = require("utils/StringUtils"),
        ExtensionInterface = require("utils/ExtensionInterface"),
        CommandManager = require("command/CommandManager"),
        Commands = require("command/Commands"),
        Menus = require("command/Menus"),
        Metrics = require("utils/Metrics"),
        DefaultDialogs = require("widgets/DefaultDialogs"),
        FileSystem = require("filesystem/FileSystem"),
        FileUtils = require("file/FileUtils"),
        ZipUtils = require("utils/ZipUtils"),
        ProjectManager = require("project/ProjectManager"),
        EventDispatcher     = require("utils/EventDispatcher"),
        DocumentCommandHandlers = require("document/DocumentCommandHandlers"),
        createProjectDialogue = require("text!./html/create-project-dialogue.html"),
        replaceProjectDialogue = require("text!./html/replace-project-dialogue.html"),
        replaceKeepProjectDialogue = require("text!./html/replace-keep-project-dialogue.html"),
        defaultProjects   = require("./default-projects"),
        guidedTour = require("./guided-tour");

    EventDispatcher.makeEventDispatcher(exports);

    const NEW_PROJECT_INTERFACE = "Extn.Phoenix.newProject",
        MAX_DEDUPE_COUNT = 10000;

    ExtensionInterface.registerExtensionInterface(NEW_PROJECT_INTERFACE, exports);

    let newProjectDialogueObj,
        createProjectDialogueObj,
        downloadCancelled = false;

    function _focusContentWindow() {
        let attempts = 0;
        const maxAttempts = 10; // 10 * 100ms = 1 second total scan time
        const intervalId = setInterval(() => {
            const frame = document.getElementById("newProjectFrame");
            if (frame && frame.contentWindow) {
                frame.contentWindow.focus();
                clearInterval(intervalId);
            }

            attempts++;
            if (attempts >= maxAttempts) {
                clearInterval(intervalId);
                console.warn("Could not find or focus on newProjectFrame");
            }
        }, 100);
    }

    function _showNewProjectDialogue() {
        if(window.testEnvironment){
            return;
        }
        if(newProjectDialogueObj && newProjectDialogueObj.isVisible()){
            return newProjectDialogueObj;
        }
        let templateVars = {
            Strings: Strings,
            newProjectURL: `${window.Phoenix.baseURL}assets/new-project/code-editor.html`
        };
        let dialogueContents = Mustache.render(newProjectTemplate, templateVars);
        newProjectDialogueObj = Dialogs.showModalDialogUsingTemplate(dialogueContents, true);
        _focusContentWindow();
        Metrics.countEvent(Metrics.EVENT_TYPE.NEW_PROJECT, "dialogue", "open");
        return newProjectDialogueObj;
    }

    function _addMenuEntries() {
        CommandManager.register(Strings.CMD_PROJECT_NEW, Commands.FILE_NEW_PROJECT, _showNewProjectDialogue);
        const fileMenu = Menus.getMenu(Menus.AppMenuBar.FILE_MENU);
        fileMenu.addMenuItem(Commands.FILE_NEW_PROJECT, "", Menus.AFTER, Commands.FILE_NEW_FOLDER);
    }

    function closeDialogue() {
        Metrics.countEvent(Metrics.EVENT_TYPE.NEW_PROJECT, "dialogue", "close");
        newProjectDialogueObj.close();
        exports.trigger(exports.EVENT_NEW_PROJECT_DIALOGUE_CLOSED);
        guidedTour.startTourIfNeeded();
    }

    function showErrorDialogue(title, message) {
        Dialogs.showModalDialog(
            DefaultDialogs.DIALOG_ID_ERROR,
            title,
            message
        );
    }

    function openFolder () {
        CommandManager.execute(Commands.FILE_OPEN_FOLDER).then(closeDialogue);
    }

    async function _shouldNotShowDialog() {
        if(!Phoenix.isNativeApp){
            // in browser we always show the new project dialog even if there is a different startup project open. This
            // is mainly for users to discover the download native app button in the new project window.
            return false;
        }
        // in tauri, we don't show the dialog if its not default project or
        // if phoenix was opened with a file/folder from os with cli args. In mac, this is done via
        // setSingleInstanceCLIArgsHandler as it doesnt use cli args for open with like other os.
        if(ProjectManager.getProjectRoot().fullPath !== ProjectManager.getWelcomeProjectPath() ||
            DocumentCommandHandlers._isOpenWithFileFromOS()){
            return true;
        }
        // we are in the default project, show the dialog only if we are not opened with a file
        const cliArgs= await Phoenix.app.getCommandLineArgs();
        const args = cliArgs && cliArgs.args;
        if(!args || args.length <= 1){
            return false;
        }
        return true;
    }

    function projectOpened() {
        if(ProjectManager.getProjectRoot().fullPath === ProjectManager.getPlaceholderProjectPath()){
            _showNewProjectDialogue();
        }
    }

    ProjectManager.on(ProjectManager.EVENT_AFTER_PROJECT_OPEN, projectOpened);

    let _bootDoneDeferred = new $.Deferred();
    let _bootDonePromise = jsPromise(_bootDoneDeferred.promise());

    function onBootComplete() {
        return _bootDonePromise;
    }

    function init() {
        _addMenuEntries();
        const shouldShowWelcome = PhStore.getItem("new-project.showWelcomeScreen") || 'Y';
        if(shouldShowWelcome !== 'Y') {
            Metrics.countEvent(Metrics.EVENT_TYPE.NEW_PROJECT, "dialogue", "disabled");
            guidedTour.startTourIfNeeded();
            _bootDoneDeferred.resolve();
            return;
        }
        _shouldNotShowDialog()
            .then(notShow=>{
                if(notShow){
                    _bootDoneDeferred.resolve();
                    return;
                }
                const dialog = _showNewProjectDialogue();
                if(dialog){
                    dialog.done(()=>{
                        _bootDoneDeferred.resolve();
                    });
                } else {
                    _bootDoneDeferred.resolve();
                }
                DocumentCommandHandlers.on(DocumentCommandHandlers._EVENT_OPEN_WITH_FILE_FROM_OS, ()=>{
                    closeDialogue();
                });
            });
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
        // We do this by writing a file `.phcode.json` to the folder
        return new Promise((resolve, reject)=>{
            let file = FileSystem.getFileForPath(`${path}/.phcode.json`);
            FileUtils.writeText(file, "{}", true)
                .done(resolve)
                .fail(reject);
        });
    }

    async function _validateProjectFolder(projectPath) {
        return new Promise((resolve, reject)=>{
            let dir = FileSystem.getDirectoryForPath(projectPath);
            let displayPath = Phoenix.app.getDisplayPath(projectPath);
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
        return new Promise(async (resolve, reject)=>{ // eslint-disable-line
            try {
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
            } catch (e) {
                reject(e);
            }
        });
    }

    async function _getSuggestedProjectDir(suggestedProjectName) {
        return new Promise(async (resolve, reject)=>{ // eslint-disable-line
            try{
                // try suggested path first
                let projectPath = `${ProjectManager.getLocalProjectsPath()}${suggestedProjectName}`;
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
            } catch (e) {
                reject(e);
            }
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

    function _unzipProject(data, projectPath, flattenFirstLevelInZip, progressCb) {
        return new Promise((resolve, reject)=>{
            _updateCreateProjectDialogueMessage(Strings.UNZIP_IN_PROGRESS, Strings.DOWNLOAD_COMPLETE);
            ZipUtils.unzipBinDataToLocation(data, projectPath, flattenFirstLevelInZip, progressCb)
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
        return new Promise(async (resolve, reject)=>{ // eslint-disable-line
            try {
                // if project path is null, create one in default folder
                if(!projectPath){
                    projectPath = await _getSuggestedProjectDir(suggestedProjectName);
                } else {
                    await _validateProjectFolder(projectPath);
                }
                console.log(
                    `downloadAndOpenProject ${suggestedProjectName} from URL: ${downloadURL} to: ${projectPath}`);

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
                            function _progressCB(done, total) {
                                let message = StringUtils.format(Strings.EXTRACTING_FILES_PROGRESS, done, total);
                                _updateCreateProjectDialogueMessage(message);
                                return !downloadCancelled; // continueExtraction id not download cancelled
                            }
                            _unzipProject(data, projectPath, flattenFirstLevelInZip, _progressCB)
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
                            _updateCreateProjectDialogueMessage(
                                `${Strings.DOWNLOADING} ${Math.round(status.percent)}%`);
                        }
                    },
                    abortCheck: function (){
                        return downloadCancelled;
                    }
                });
            } catch (e) {
                reject(e);
            }
        });
    }

    function showFolderSelect(initialPath = "") {
        return new Promise((resolve, reject)=>{
            FileSystem.showOpenDialog(false, true, Strings.CHOOSE_FOLDER, initialPath, null, function (err, files) {
                if(err || files.length !== 1){
                    reject();
                    return;
                }
                resolve(files[0]);
            });
        });
    }

    async function gitClone(url, cloneDIR) {
        try{
            const cloneFolderExists = await _dirExists(cloneDIR);
            if(!cloneFolderExists) {
                await Phoenix.VFS.ensureExistsDirAsync(cloneDIR);
            }
            await jsPromise(ProjectManager.openProject(cloneDIR));
            CommandManager.execute("git-clone-url", url, cloneDIR );
        } catch (e) {
            setTimeout(async ()=>{
                // we need this timeout as when user clicks clone in new project dialog, it will immediately
                // close the error dialog too as it dismisses itself.
                showErrorDialogue(Strings.ERROR_CLONING_TITLE, e.message || e);
            }, 100);
            console.error("git clone failed: ", url, cloneDIR, e);
            Metrics.countEvent(Metrics.EVENT_TYPE.NEW_PROJECT, "gitClone", "fail");
        }
    }

    function _getGitFolderName(gitURL) {
        if (typeof gitURL !== 'string' || !gitURL.trim()) {
            return "";
        }
        // Remove trailing `.git` if it exists and split the URL
        const parts = gitURL.replace(/\.git$/, '').split('/');
        // Return the last segment as the project folder name
        return parts[parts.length - 1];
    }

    async function _dirExists(fullPath) {
        try {
            const {entry} = await FileSystem.resolveAsync(fullPath);
            return entry.isDirectory;
        } catch (e) {
            return false;
        }
    }

    /**
     * Determines which directory to use for a Git clone operation:
     *  1. If the selected directory is empty, returns that directory.
     *  2. Otherwise, checks/creates a child directory named after the Git project.
     *     - If that child directory is (or becomes) empty, returns its entry.
     *     - If it is not empty, returns null.
     *
     * @param {string} selectedDir - The full path to the user-selected directory.
     * @param {string} gitURL - The Git clone URL (used to derive the child folder name).
     * @returns {Promise<{error, }>} error string to show to user and the path to clone.
     */
    async function getGitCloneDir(selectedDir, gitURL) {
        const selectedDirExists = await _dirExists(selectedDir);
        if (!selectedDirExists) {
            return {error: Strings.ERROR_GIT_FOLDER_NOT_EXIST, clonePath: selectedDir};
        }

        const {entry: selectedEntry} = await FileSystem.resolveAsync(selectedDir);
        if (await selectedEntry.isEmptyAsync()) {
            return {clonePath: selectedDir};
        }

        // If not empty, compute the child directory path
        const folderName = _getGitFolderName(gitURL);
        if(!folderName){
            return {error: Strings.ERROR_GIT_FOLDER_NOT_EMPTY, clonePath: selectedDir};
        }

        const childDirPath = path.join(selectedDir, folderName);
        const childDirExists = await _dirExists(childDirPath);
        if (!childDirExists) {
            return {clonePath: childDirPath};
        }
        // The child directory exists; check if it is empty
        const {entry: childEntry} = await FileSystem.resolveAsync(childDirPath);
        const isChildEmpty = await childEntry.isEmptyAsync();
        if(isChildEmpty){
            return {clonePath: childDirPath};
        }
        return {error: Strings.ERROR_GIT_FOLDER_NOT_EMPTY, clonePath: childDirPath};
    }

    function showAboutBox() {
        CommandManager.execute(Commands.HELP_ABOUT);
    }

    exports.init = init;
    exports.onBootComplete = onBootComplete;
    exports.openFolder = openFolder;
    exports.closeDialogue = closeDialogue;
    exports.downloadAndOpenProject = downloadAndOpenProject;
    exports.showFolderSelect = showFolderSelect;
    exports.showErrorDialogue = showErrorDialogue;
    exports.getGitCloneDir = getGitCloneDir;
    exports.gitClone = gitClone;
    exports.setupExploreProject = defaultProjects.setupExploreProject;
    exports.setupStartupProject = defaultProjects.setupStartupProject;
    exports.alreadyExists = window.Phoenix.VFS.existsAsync;
    exports.Metrics = Metrics;
    exports.EVENT_NEW_PROJECT_DIALOGUE_CLOSED = "newProjectDlgClosed";
    exports.getWelcomeProjectPath = ProjectManager.getWelcomeProjectPath;
    exports.getExploreProjectPath = ProjectManager.getExploreProjectPath;
    exports.getLocalProjectsPath = ProjectManager.getLocalProjectsPath;
    exports.getMountDir = Phoenix.VFS.getMountDir;
    exports.path = Phoenix.path;
    exports.getTauriDir = Phoenix.VFS.getTauriDir;
    exports.getTauriPlatformPath = Phoenix.fs.getTauriPlatformPath;
    exports.showAboutBox = showAboutBox;
});
