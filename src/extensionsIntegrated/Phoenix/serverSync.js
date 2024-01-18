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

/*global fs, Phoenix, path*/
/*eslint no-console: 0*/
/*eslint strict: ["error", "global"]*/
/* jshint ignore:start */

define(function (require, exports, module) {

    const ProjectManager          = require("project/ProjectManager"),
        DocumentManager     = require("document/DocumentManager"),
        Dialogs             = require("widgets/Dialogs"),
        Strings             = require("strings"),
        StringUtils         = require("utils/StringUtils"),
        DefaultDialogs      = require("widgets/DefaultDialogs"),
        Metrics             = require("utils/Metrics");

    let syncRoot = "";
    let $icon;
    let userContext = "";
    let publishURL = "https://phcode.site";
    const USER_CONTEXT = "publish.userContext";
    let ongoingSyncCount = 0;
    let syncEnabled = false;
    let projectSyncStarted = false;
    let projectSyncCompleted = false;
    let previewURL;

    function _fixLegacyUserContext() {
        // In earlier versions, user context data was stored in the browser's localStorage. We have since
        // transitioned to using PhStore for this purpose. This function helps in migrating the user context
        // from localStorage to PhStore. This ensures that existing users don't lose access to their published projects.
        // Note: Published projects are retained for only 30 days. This function is primarily intended to support
        // users during the transition period and is safe to remove 3 months after the date of this implementation,
        // as users are informed that their published projects are kept for a 30-day period only.
        if (!PhStore.getItem(USER_CONTEXT) && localStorage.getItem(USER_CONTEXT)) {
            PhStore.setItem(USER_CONTEXT, localStorage.getItem(USER_CONTEXT));
        }
    }

    function _setupUserContext() {
        _fixLegacyUserContext();
        userContext = PhStore.getItem(USER_CONTEXT);
        if(!userContext){
            userContext = "p-" + Math.round( Math.random()*10000000000000).toString(16);
            PhStore.setItem(USER_CONTEXT, userContext);
        }
    }

    function _getProjectPreviewURL() {
        let projectName = ProjectManager.getProjectRoot().name;
        return `${publishURL}/p/${userContext}/${projectName}`;
    }

    function _uploadFile(filePath, blob, resolve, reject) {
        console.log('Uploading file for preview: ', filePath);
        let uploadFormData = new FormData();
        let projectRoot = path.dirname(syncRoot);
        let relativePath = path.relative(projectRoot, filePath);
        let fileName = path.basename(filePath);
        uploadFormData.append("path", `${userContext}/${path.dirname(relativePath)}`);
        uploadFormData.append("files", blob, fileName);
        $.ajax({
            url: publishURL + '/upload',
            type: "POST",
            data: uploadFormData,
            cache: false,
            contentType: false,
            processData: false,
            success: function(r) {
                resolve();
            },
            error: function(r) {
                reject();
            }
        });
    }

    function _readAndUploadFile(file) {
        return new Promise((resolve, reject)=>{
            if(file.fullPath === '/fs/app/state.json'){
                // somehow we get these changes as project file changes too. don't sync state file
                resolve();
                return;
            }
            file.read({encoding: window.fs.BYTE_ARRAY_ENCODING}, function (err, content, encoding, stat) {
                if (err){
                    reject(err);
                    return;
                }
                let blob = new Blob([content], {type:"application/octet-stream"});
                _uploadFile(file.fullPath, blob, resolve, reject);
            });
        });
    }

    function _uploadFiles(fileList, doneCB) {
        let allPromises = [];
        for(let file of fileList){
            allPromises.push(_readAndUploadFile(file));
        }
        Promise.all(allPromises).then(()=>{
            doneCB();
        });
    }

    function _startSync(doneCb) {
        if(!syncEnabled){
            return;
        }
        projectSyncStarted = true;
        projectSyncCompleted = false;
        _setSyncInProgress();
        let newSyncRoot = ProjectManager.getProjectRoot();
        let newSyncPath = newSyncRoot.fullPath;
        if(newSyncPath !== syncRoot){
            syncRoot = newSyncPath;
            ProjectManager.getAllFiles().then((files)=>{
                if(files.length > 500){
                    Dialogs.showModalDialog(
                        DefaultDialogs.DIALOG_ID_ERROR,
                        Strings.CANNOT_PUBLISH_LARGE_PROJECT,
                        Strings.CANNOT_PUBLISH_LARGE_PROJECT_MESSAGE
                    );
                    _setSyncComplete();
                    if(doneCb){
                        doneCb();
                    }
                    return;
                }
                _uploadFiles(files, ()=>{
                    projectSyncCompleted = true;
                    if(doneCb){
                        doneCb();
                    }
                    _setSyncComplete();
                });
            });
        }
    }

    function _projectOpened() {
        syncEnabled = false;
        projectSyncStarted = false;
        projectSyncCompleted = false;
        previewURL = null;
    }

    let allChangedFiles = [];
    async function _collectFiles(dirEntry) {
        return new Promise((resolve, reject)=>{
            dirEntry.getContents(async (err,fsEntries)=>{
                if(err){
                    reject(err);
                }
                for(let fsEntry of fsEntries){
                    if(fsEntry.isDirectory){
                        let contentFiles = await _collectFiles(fsEntry);
                        allChangedFiles.push(...contentFiles);
                    } else {
                        allChangedFiles.push(fsEntry);
                    }
                }
            });
            resolve(allChangedFiles);
        });
    }

    async function _projectFileChanged(target, entry, added, removed) {
        if(!syncEnabled){
            return;
        }
        if(entry){
            if(entry.isDirectory){
                await _collectFiles(entry);
            } else {
                allChangedFiles.push(entry);
            }
        }
    }

    function _setSyncInProgress() {
        ongoingSyncCount = ongoingSyncCount+1;
        $icon.attr({
            class: "syncing",
            title: Strings.PUBLISH_SYNC_IN_PROGRESS
        });
    }

    function _setSyncComplete() {
        ongoingSyncCount = ongoingSyncCount-1;
        if(ongoingSyncCount ===0){
            $icon.attr({
                class: "preview",
                title: Strings.PUBLISH_VIEW_PAGE
            });
        }
    }

    function _showPublishConsentDialogue() {
        if(projectSyncStarted){
            return;
        }
        let publishMessage = StringUtils.format(Strings.PUBLISH_CONSENT_MESSAGE,
            `<a href="${_getProjectPreviewURL()}">${_getProjectPreviewURL()}</a>`);
        Dialogs.showModalDialog(
            DefaultDialogs.DIALOG_ID_INFO,
            Strings.SHARE_WEBSITE,
            publishMessage,
            [
                {
                    className: Dialogs.DIALOG_BTN_CLASS_NORMAL,
                    id: Dialogs.DIALOG_BTN_CANCEL,
                    text: Strings.CANCEL
                },
                {
                    className: Dialogs.DIALOG_BTN_CLASS_PRIMARY,
                    id: Dialogs.DIALOG_BTN_OK,
                    text: Strings.PUBLISH
                }
            ]
        )
            .done(function (id) {
                if (id === Dialogs.DIALOG_BTN_OK) {
                    syncEnabled = true;
                    _startSync(()=>{
                        _loadPreview();
                    });
                }
            });
    }

    function _isPreviewableFile(filePath) {
        let pathSplit = filePath.split('.');
        let extension = pathSplit && pathSplit.length>1 ? pathSplit[pathSplit.length-1] : null;
        if(['html', 'htm', 'jpg', 'jpeg', 'png', 'svg', 'pdf', 'xml'].includes(extension.toLowerCase())){
            return true;
        }
        return false;
    }

    async function _loadPreview() {
        let projectRootUrl = _getProjectPreviewURL();
        let currentDocument = DocumentManager.getCurrentDocument();
        let currentFile = currentDocument? currentDocument.file : ProjectManager.getSelectedItem();
        if(currentFile){
            let fullPath = currentFile.fullPath;
            let projectRoot = ProjectManager.getProjectRoot().fullPath;
            let relativePath = path.relative(projectRoot, fullPath);
            if(_isPreviewableFile(relativePath)){
                previewURL = `${projectRootUrl}/${relativePath}`;
            }
        }

        if(!previewURL){
            previewURL = projectRootUrl;
        }
        Phoenix.app.openURLInDefaultBrowser(previewURL);
    }

    function _addToolbarIcon() {
        const syncButtonID = "sync-button";
        $icon = $("<a>")
            .attr({
                id: syncButtonID,
                href: "#",
                class: "preview",
                title: Strings.PUBLISH_PAGE
            })
            .appendTo($("#main-toolbar .buttons"));
        $icon.on('click', ()=>{
            Metrics.countEvent(Metrics.EVENT_TYPE.SHARING, "shareIcon", "clicked");
            if(projectSyncCompleted){
                _setSyncInProgress();
                let uniqueFilesToUpload = [...new Set(allChangedFiles)];
                allChangedFiles = [];
                _uploadFiles(uniqueFilesToUpload, ()=>{
                    _setSyncComplete();
                    _loadPreview();
                });
            }
            _showPublishConsentDialogue();
        });
    }

    exports.init = function () {
        _addToolbarIcon();
        _setupUserContext();
        ProjectManager.on(ProjectManager.EVENT_PROJECT_OPEN, _projectOpened);
        ProjectManager.on(ProjectManager.EVENT_PROJECT_FILE_CHANGED, _projectFileChanged);
    };
});
