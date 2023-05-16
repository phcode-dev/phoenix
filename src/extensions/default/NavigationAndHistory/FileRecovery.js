/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2016 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global path, logger, jsPromise*/

define(function (require, exports, module) {
    const NativeApp = brackets.getModule("utils/NativeApp"),
        FileSystem = brackets.getModule("filesystem/FileSystem"),
        ProjectManager = brackets.getModule("project/ProjectManager"),
        FileSystemError = brackets.getModule("filesystem/FileSystemError"),
        FileUtils = brackets.getModule("file/FileUtils"),
        DocumentManager = brackets.getModule("document/DocumentManager");

    const BACKUP_INTERVAL_MS = 3000; // todo change to 20 secs
    // todo large number of tracked files performance issues?
    const sessionRestoreDir = FileSystem.getDirectoryForPath(
        path.normalize(NativeApp.getApplicationSupportDirectory() + "/sessionRestore"));

    let trackingProjectRoot = null,
        trackingRestoreRoot = null,
        trackedProjectFilesMap = {},
        trackedFilesChangeTimestamps = {};

    function simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            let char = str.charCodeAt(i);
            // eslint-disable-next-line no-bitwise
            hash = ((hash << 5) - hash) + char;
            // eslint-disable-next-line no-bitwise
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash) + "";
    }

    function createDir(dir) {
        return new Promise((resolve, reject)=>{
            dir.create(function (err) {
                if (err && err !== FileSystemError.ALREADY_EXISTS) {
                    console.error("Error creating project crash restore folder " + dir.fullPath, err);
                    reject(err);
                }
                resolve();
            });
        });
    }

    function silentlyRemoveFile(path) {
        return new Promise((resolve)=>{
            FileSystem.getFileForPath(path).unlink((err)=>{
                if(err) {
                    console.error(err);
                }
                resolve();
            });
        });
    }

    function setupProjectRestoreRoot(projectPath) {
        const baseName = path.basename(projectPath);
        let restoreRootPath = path.normalize(`${sessionRestoreDir.fullPath}/${baseName}_${simpleHash(projectPath)}`);
        trackingRestoreRoot = FileSystem.getDirectoryForPath(restoreRootPath);
        createDir(trackingRestoreRoot);
    }

    function getRestoreFilePath(projectFilePath) {
        if(ProjectManager.isWithinProject(projectFilePath)) {
            return path.normalize(
                `${trackingRestoreRoot.fullPath}/${ProjectManager.getProjectRelativePath(projectFilePath)}`);
        }
        return null;
    }

    // try not to use this
    function getProjectFilePath(restoreFilePath) {
        if(!restoreFilePath.startsWith(trackingRestoreRoot.fullPath)){
            return null;
        }
        // Eg. trackingRestoreRoot = "/fs/app/sessionRestore/default project_1944444020/"
        // and restoreProjectRelativePath = "/fs/app/sessionRestore/default project_1944444020/default project/a.html"
        let restoreProjectRelativePath = restoreFilePath.replace(trackingRestoreRoot.fullPath, "");
        // Eg. default project/a.html
        let restoreProjectName = restoreProjectRelativePath.split("/")[0], // Eg. default project
            trackingProjectName = path.basename(trackingProjectRoot.fullPath); // default project
        if(trackingProjectName !== restoreProjectName){
            return null;
        }
        let filePathInProject = restoreProjectRelativePath.replace(`${restoreProjectName}/`, ""); // a.html
        return path.normalize(`${trackingProjectRoot.fullPath}/${filePathInProject}`);
    }

    function projectOpened(_event, projectRoot) {
        trackingProjectRoot = projectRoot;
        setupProjectRestoreRoot(trackingProjectRoot.fullPath);
    }

    async function writeFileIgnoreFailure(filePath, contents) {
        try {
            let parentDir = FileSystem.getDirectoryForPath(path.dirname(filePath));
            await createDir(parentDir);
            let file = FileSystem.getFileForPath(filePath);
            await jsPromise(FileUtils.writeText(file, contents, true));
        } catch (e) {
            console.error(e);
            logger.reportError(e); // todo too many error reports prevent every 20 secs
        }
    }

    async function backupChangedDocs(changedDocs) {
        for(let doc of changedDocs){
            let restorePath = getRestoreFilePath(doc.file.fullPath);
            await writeFileIgnoreFailure(restorePath, doc.getText());
            trackedFilesChangeTimestamps[doc.file.fullPath] = doc.lastChangeTimestamp;
            trackedProjectFilesMap[doc.file.fullPath] = restorePath;
        }
    }

    async function cleanupUntrackedFiles(docPathsToTrack) {
        let allTrackingPaths = Object.keys(trackedProjectFilesMap);
        for(let trackedPath of allTrackingPaths){
            if(!docPathsToTrack[trackedPath]){
                const restoreFile = trackedProjectFilesMap[trackedPath];
                await silentlyRemoveFile(restoreFile);
                delete trackedProjectFilesMap[trackedPath];
                delete trackedFilesChangeTimestamps[trackedPath];
            }
        }
    }

    let backupInProgress = false;
    async function changeScanner() {
        if(backupInProgress || trackingProjectRoot.fullPath === "/"){
            // trackingProjectRoot can be "/" if debug>open virtual file system menu is clicked. Don't track root fs
            return;
        }
        backupInProgress = true;
        try{
            // do backup
            const openDocs = DocumentManager.getAllOpenDocuments();
            let changedDocs = [], docPathsToTrack = {};
            for(let doc of openDocs){
                if(doc && doc.isDirty){
                    docPathsToTrack[doc.file.fullPath] = true;
                    const lastTrackedTimestamp = trackedFilesChangeTimestamps[doc.file.fullPath];
                    if(!lastTrackedTimestamp || lastTrackedTimestamp !== doc.lastChangeTimestamp){
                        // Already backed up, only need to consider it again if its contents changed
                        changedDocs.push(doc);
                    }
                }
            }
            await backupChangedDocs(changedDocs);
            await cleanupUntrackedFiles(docPathsToTrack);
        } catch (e) {
            console.error(e);
            logger.reportError(e);
        }
        backupInProgress = false;
    }

    function documentChanged(_event, doc) {
        let restorePath = getRestoreFilePath(doc.file.fullPath);
        let originalPath = getProjectFilePath(restorePath);
        //debugger;
    }

    function documentDirtyFlagChanged(_event, doc) {
        //debugger;
    }

    function init() {
        ProjectManager.on(ProjectManager.EVENT_AFTER_PROJECT_OPEN, projectOpened);
        DocumentManager.on(DocumentManager.EVENT_DOCUMENT_CHANGE, documentChanged);
        DocumentManager.on(DocumentManager.EVENT_DIRTY_FLAG_CHANGED, documentDirtyFlagChanged);
        createDir(sessionRestoreDir);
        if(!window.testEnvironment){
            setInterval(changeScanner, BACKUP_INTERVAL_MS);
        }
    }

    exports.init = init;
});
