/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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

    const ProjectManager          = brackets.getModule("project/ProjectManager"),
        ExtensionUtils      = brackets.getModule("utils/ExtensionUtils");

    let syncRoot = "";
    let $icon;
    let published = false;
    let publishURL = "http://localhost:3000/upload";

    function _uploadFile(filePath, blob, resolve, reject) {
        let uploadFormData = new FormData();
        let projectRoot = path.dirname(syncRoot);
        let relativePath = path.relative(projectRoot, filePath);
        let fileName = path.basename(filePath);
        uploadFormData.append("path", path.dirname(relativePath));
        uploadFormData.append("files", blob, fileName);
        $.ajax({
            url: publishURL,
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
            file.read({encoding: window.fs.BYTE_ARRAY_ENCODING}, function (err, content, encoding, stat) {
                if (err){
                    reject(err);
                    return;
                }
                let blob = new Blob([content], {type:"application/octet-stream"});
                _uploadFile(file.fullPath, blob, resolve, reject);
                resolve(blob);
            });
        });
    }

    function _uploadFiles(fileList, doneCB) {
        for(let file of fileList){
            _readAndUploadFile(file);
        }
        doneCB();
    }

    function _startSync() {
        _setSyncInProgress();
        let newSyncRoot = ProjectManager.getProjectRoot();
        let newSyncPath = newSyncRoot.fullPath;
        if(newSyncPath !== syncRoot){
            syncRoot = newSyncPath;
            ProjectManager.getAllFiles().then((files)=>{
                _uploadFiles(files, ()=>{
                    _setSyncComplete();
                });
            });
        }
    }

    function _projectOpened() {
        _startSync();
    }

    function _projectFileChanged(target, entry, added, removed) {
        console.log("sync: ", entry, added, removed);
    }

    function _projectFileRenamed(target, oldName, newName) {
        console.log("sync: ", oldName, newName);
    }

    function _setSyncInProgress() {
        published = false;
        $icon.attr({
            class: "syncing",
            title: "Sync in progress for preview..."
        });
    }

    function _setSyncComplete() {
        published = true;
        $icon.attr({
            class: "ready-to-preview",
            title: "Click to view published page"
        });
    }

    function _addToolbarIcon() {
        const syncButtonID = "sync-button";
        $icon = $("<a>")
            .attr({
                id: syncButtonID,
                href: "#",
                class: "syncing",
                title: "Publishing for preview..."
            })
            .appendTo($("#main-toolbar .buttons"));
    }

    exports.init = function () {
        _addToolbarIcon();
        ProjectManager.on(ProjectManager.EVENT_PROJECT_OPEN, _projectOpened);
        ProjectManager.on(ProjectManager.EVENT_PROJECT_FILE_CHANGED, _projectFileChanged);
        ProjectManager.on(ProjectManager.EVENT_PROJECT_FILE_RENAMED, _projectFileRenamed);
        _startSync();
    };

    ExtensionUtils.loadStyleSheet(module, "styles.css");
});
