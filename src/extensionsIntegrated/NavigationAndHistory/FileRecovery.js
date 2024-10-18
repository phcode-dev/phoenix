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

/**
 * This file outlines the process phcode follows to restore files if the application crashes or if a user closes
 * the application without saving their files.
 *
 * For each project in phcode, there's a unique 'restore' folder located in the appdata directory.
 * This folder is named according to the pattern <projectName>-<projectPathHash>.
 *
 * The restore folder monitors all files being edited in phcode, and this tracking is updated every 5 seconds
 * by a function called changeScanner. The function backs up changes every 5 seconds, and only unsaved files
 * that have been modified since the last backup are synced again. When files are saved, they're removed from
 * the backup during this changeScanner process because there's no need to restore them.
 *
 * When opening a project, we first check for the existence of a 'restore' folder associated with that project
 * and scan for any files within it. If we find any, these files are marked for potential restoration.
 *
 * During this process, we load all recoverable file data into memory and temporarily halt any writing activity
 * to the 'restore' folder. This safeguard is in place to prevent any accidental overwriting of the restore files'
 * data in case the user edits any files currently marked for restoration.
 *
 * Once we've cached the data from the restore files, we present a notification to the user, asking if they would
 * like these files to be restored. If the user agrees, we then open all of these files in the editor and populate
 * them with the previously cached, restored content.
 */

define(function (require, exports, module) {
    const NativeApp = require("utils/NativeApp"),
        FileSystem = require("filesystem/FileSystem"),
        ProjectManager = require("project/ProjectManager"),
        MainViewManager = require("view/MainViewManager"),
        FileSystemError = require("filesystem/FileSystemError"),
        FileUtils = require("file/FileUtils"),
        DocumentManager = require("document/DocumentManager"),
        NotificationUI = require("widgets/NotificationUI"),
        Mustache = require("thirdparty/mustache/mustache"),
        Strings = require("strings"),
        FileViewController  = require("project/FileViewController"),
        recoveryTemplate = require("text!./html/recovery-template.html"),
        EventDispatcher = require("utils/EventDispatcher"),
        Metrics = require("utils/Metrics"),
        EventManager = require("utils/EventManager");

    EventDispatcher.makeEventDispatcher(exports);
    EventManager.registerEventHandler("ph-recovery", exports);

    const BACKUP_INTERVAL_MS = 5000;
    let sessionRestoreDir = FileSystem.getDirectoryForPath(
        path.normalize(NativeApp.getApplicationSupportDirectory() + "/sessionRestore"));

    const trackedProjects = {};

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
                    console.error("[recovery] Error creating project crash restore folder " + dir.fullPath, err);
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

    function silentlyRemoveDirectory(dir) {
        return new Promise((resolve)=>{
            dir.unlink((err)=>{
                if(err) {
                    console.error(err);
                }
                resolve();
            });
        });
    }

    function getProjectRestoreRoot(projectPath) {
        const baseName = path.basename(projectPath),
            restoreRootPath = path.normalize(`${sessionRestoreDir.fullPath}/${baseName}_${simpleHash(projectPath)}`);
        return FileSystem.getDirectoryForPath(restoreRootPath);
    }

    function getRestoreFilePath(projectFilePath, projectRootPath) {
        if(!projectFilePath.startsWith(projectRootPath) || !trackedProjects[projectRootPath]){
            console.error(`[recovery] cannot backed up as ${projectFilePath} is not in project ${projectRootPath}`);
            return null;
        }
        let pathWithinProject = projectFilePath.replace(projectRootPath, "");
        let restoreRoot = trackedProjects[projectRootPath].restoreRoot;
        return path.normalize(`${restoreRoot.fullPath}/${pathWithinProject}`);
    }

    // try not to use this
    function getProjectFilePath(restoreFilePath, projectRootPath) {
        const project = trackedProjects[projectRootPath];
        if(!project || !restoreFilePath.startsWith(project.restoreRoot.fullPath)){
            return null;
        }

        let filePathInProject = restoreFilePath.replace(project.restoreRoot.fullPath, "");
        return path.normalize(`${projectRootPath}/${filePathInProject}`);
    }

    /**
     * the restore folder may have empty folders as files get deleted according to backup algorithm. This fn will
     * ensure that there are no empty folders and restore folder exists
     * @param folder
     * @return {Promise<void>}
     */
    async function ensureFolderIsClean(folder) {
        await createDir(folder);
        await folder.unlinkEmptyDirectoryAsync();
        await createDir(folder);
    }

    function integrityCheck(input) {
        // The backup is of the form "length,string_backed_up" so that we can do integrity checks. ideally we should use
        // crypto hash functions but that may be expensive. since this is reversible with undo, not doing it for now.
        if(!input){
            return null;
        }
        const parts = input.split(',', 2);

        if (parts.length !== 2) {
            return null;
        }

        // Parse the length part (should be the first part before the comma)
        const expectedLength = parseInt(parts[0], 10);
        if (isNaN(expectedLength)) {
            return null;
        }

        // The second part is the actual string after the comma
        const actualString = parts[1];
        if (actualString.length === expectedLength) {
            return actualString;
        }
        return null;
    }

    async function loadLastBackedUpFileContents(projectRootPath) {
        const project = trackedProjects[projectRootPath];
        if(!project){
            console.error("[recovery] Cannot load backup, no tracking info of project " + projectRootPath);
            return;
        }
        const currentProjectLoadCount = project.projectLoadCount;
        let restoreFolder = project.restoreRoot;
        await ensureFolderIsClean(restoreFolder);
        let allEntries = await FileSystem.getAllDirectoryContents(restoreFolder);
        let backupExists = false;
        for(let entry of allEntries){
            if(entry.isDirectory){
                continue;
            }
            let text = integrityCheck(await jsPromise(FileUtils.readAsText(entry)));
            if(!text){
                continue;
            }
            let projectFilePath = getProjectFilePath(entry.fullPath, projectRootPath);
            if(currentProjectLoadCount !== project.projectLoadCount){
                // this means that while we were tying to load a project backup, the user switched to another project
                // and then switched back to this project, all before the first backup load was complete. so
                // we just return without doing anything here. This function will be eventually called on projectOpened
                // event handler.
                return;
            }
            project.lastBackedUpFileContents[projectFilePath] = text;
            backupExists = true;
        }
        project.lastBackedupLoadInProgress = false;
        if(backupExists) {
            let notificationHTML = Mustache.render(recoveryTemplate, {
                Strings: Strings,
                PROJECT_TO_RECOVER: projectRootPath
            });
            if(project.restoreNotification){
                project.restoreNotification.close();
                project.restoreNotification = null;
            }
            project.restoreNotification = NotificationUI.createToastFromTemplate( Strings.RECOVER_UNSAVED_FILES_TITLE,
                notificationHTML, {
                    dismissOnClick: false,
                    toastStyle: NotificationUI.NOTIFICATION_STYLES_CSS_CLASS.SUCCESS
                });
            Metrics.countEvent(Metrics.EVENT_TYPE.PROJECT, "recovery", "notified");
        } else {
            Metrics.countEvent(Metrics.EVENT_TYPE.PROJECT, "recovery", "none");
        }
    }

    let currentProjectRoot = null;
    function projectOpened(_event, projectRoot) {
        if(projectRoot.fullPath === '/') {
            console.error("[recovery] Backups will not be done for root folder `/`");
            return;
        }
        if(currentProjectRoot && currentProjectRoot.fullPath === projectRoot.fullPath){
            // If we get a redundant project open event return. This is because of #SEARCH_THIS_TAG_IN_FILE_1
            return;
        }
        currentProjectRoot = projectRoot;
        if(trackedProjects[projectRoot.fullPath]){
            if(trackedProjects[projectRoot.fullPath].restoreNotification){
                trackedProjects[projectRoot.fullPath].restoreNotification.close();
                trackedProjects[projectRoot.fullPath].restoreNotification = null;
            }
            trackedProjects[projectRoot.fullPath].projectLoadCount++;// we use this to prevent race conditions
            // on frequent project switch before all project backup files are loaded.
            trackedProjects[projectRoot.fullPath].lastBackedUpFileContents = {};
            trackedProjects[projectRoot.fullPath].firstEditHandled = false;
            trackedProjects[projectRoot.fullPath].lastBackedupLoadInProgress = true;
            trackedProjects[projectRoot.fullPath].trackedFileUpdateTimestamps = {};
            trackedProjects[projectRoot.fullPath].trackedFileContents = {};
            trackedProjects[projectRoot.fullPath].changeErrorReported = false;
            loadLastBackedUpFileContents(projectRoot.fullPath).catch(err=>{
                console.error("[recovery] loadLastBackedUpFileContents failed ", err);
            });
            return;
        }
        trackedProjects[projectRoot.fullPath] = {
            projectLoadCount: 0, // we use this to prevent race conditions on frequent project switch before all
            // project backup files are loaded.
            projectRoot: projectRoot,
            restoreRoot: getProjectRestoreRoot(projectRoot.fullPath),
            lastBackedUpFileContents: {},
            firstEditHandled: false, // after a project is loaded, has the first edit by user on any file been handled?
            lastBackedupLoadInProgress: true, // while the backup is loading, we need to prevent write over the existing
            // backup with backup info of the current session
            trackedFileUpdateTimestamps: {},
            trackedFileContents: {},
            restoreNotification: null,
            changeErrorReported: false // we only report change errors once to prevent too many Bugsnag reports
        };
        loadLastBackedUpFileContents(projectRoot.fullPath).catch(err=>{
            console.error("[recovery] loadLastBackedUpFileContents failed ", err);
        });
    }

    async function writeFileIgnoreFailure(filePath, contents) {
        try {
            let parentDir = FileSystem.getDirectoryForPath(path.dirname(filePath));
            await createDir(parentDir);
            let file = FileSystem.getFileForPath(filePath);
            const restoreContentsWithIntegrity = contents.length + "," + contents;
            await jsPromise(FileUtils.writeText(file, restoreContentsWithIntegrity, true));
        } catch (e) {
            console.error(e);
        }
    }

    async function backupChangedDocs(projectRoot) {
        const project = trackedProjects[projectRoot.fullPath];
        let trackedFilePaths =  Object.keys(project.trackedFileContents);
        for(let trackedFilePath of trackedFilePaths){
            const restorePath = getRestoreFilePath(trackedFilePath, projectRoot.fullPath);
            if(restorePath) {
                const content = project.trackedFileContents[trackedFilePath];
                await writeFileIgnoreFailure(restorePath, content);
            }
            delete project.trackedFileContents[trackedFilePath];
        }
    }

    async function cleanupUntrackedFiles(docPathsToTrack, projectRoot) {
        const project = trackedProjects[projectRoot.fullPath];
        let allTrackingPaths = Object.keys(project.trackedFileUpdateTimestamps);
        for(let trackedPath of allTrackingPaths){
            if(!docPathsToTrack[trackedPath]){
                const restoreFile = getRestoreFilePath(trackedPath, projectRoot.fullPath);
                if(restoreFile) {
                    await silentlyRemoveFile(restoreFile);
                }
                delete project.trackedFileUpdateTimestamps[trackedPath];
            }
        }
    }

    let backupInProgress = false;

    /**
     * This gets executed every 5 seconds and should be as light-weight as possible. If there are no changes to be
     * backed up, then this function should return as soon as possible without waiting for any async flows.
     * @return {Promise<void>}
     */
    async function changeScanner() {
        let currentProjectRoot = ProjectManager.getProjectRoot();
        const project = trackedProjects[currentProjectRoot.fullPath];
        if(backupInProgress || currentProjectRoot.fullPath === "/" || !project || project.lastBackedupLoadInProgress){
            // trackingProjectRoot can be "/" if debug>open virtual file system menu is clicked. Don't track root fs
            return;
        }
        backupInProgress = true;
        try{
            // do backup
            const openDocs = DocumentManager.getAllOpenDocuments();
            let docPathsToTrack = {}, dirtyDocsExists = false;
            for(let doc of openDocs){
                if(doc && doc.isDirty){
                    dirtyDocsExists = true;
                    docPathsToTrack[doc.file.fullPath] = true;
                    const lastTrackedTimestamp = project.trackedFileUpdateTimestamps[doc.file.fullPath];
                    if(!lastTrackedTimestamp || lastTrackedTimestamp !== doc.lastChangeTimestamp){
                        // Already backed up, only need to consider it again if its contents changed
                        project.trackedFileContents[doc.file.fullPath] = doc.getText();
                        project.trackedFileUpdateTimestamps[doc.file.fullPath] = doc.lastChangeTimestamp;
                    }
                }
            }
            if(!project.firstEditHandled && dirtyDocsExists) {
                // this means that the last backup session has been fully loaded in memory and a new edit has been
                // done by the user. The user may not have yet clicked on the restore backup button. But as the user
                // made an edit, we should delete the project restore folder to start a new backup session. The user
                // can still restore the last backup session from the in memory `project.lastBackedUpFileContents`
                console.log("Discarding old backup for restore...");
                await silentlyRemoveDirectory(project.restoreRoot);
                await createDir(project.restoreRoot);
                await backupChangedDocs(currentProjectRoot);
                project.firstEditHandled = true;
                if(project.restoreNotification) {
                    // this means the user edited a file while the restore dialog was shown. This generally means the
                    // restore folder has been nuked to make way for the new session, but the old restore contents are still
                    // available in project.lastBackedUpFileContents. So the contents can be restored, but the restore
                    // data has already been discarded. We hide the discard option in the case as it's already done.
                    $("#DISCARD_UNSAVED_FILES_RESTORE").addClass("forced-hidden");
                }
            } else {
                await backupChangedDocs(currentProjectRoot);
                await cleanupUntrackedFiles(docPathsToTrack, currentProjectRoot);
            }
        } catch (e) {
            console.error("[recovery] changeScanner error", e);
            if(!project.changeErrorReported){
                project.changeErrorReported = true;
                // we only report change errors once to prevent too many Bugsnag reports
                logger.reportError(e);
            }
        }
        backupInProgress = false;
    }

    function beforeProjectClosed() {
        let currentProjectRoot = ProjectManager.getProjectRoot();
        const project = trackedProjects[currentProjectRoot.fullPath];
        if(project.restoreNotification) {
            project.restoreNotification.close();
            project.restoreNotification = null;
        }
        changeScanner().catch(err=>{
            console.error("[recovery] beforeProjectClosed failed which scanning for changes to backup", err);
        });
    }

    async function ensureOpenEditors(pathList) {
        let allOpenFiles = MainViewManager.getAllOpenFiles();
        let openFilePaths = {};
        for(let file of allOpenFiles){
            openFilePaths[file.fullPath] = true;
        }
        for(let path of pathList) {
            if(!openFilePaths[path]){
                let file = FileSystem.getFileForPath(path);
                await jsPromise(FileViewController.openFileAndAddToWorkingSet(file.fullPath));
            }
        }
    }

    async function restoreBtnClicked(_event, projectToRestore) {
        let currentProjectRoot = ProjectManager.getProjectRoot();
        const project = trackedProjects[currentProjectRoot.fullPath];
        Metrics.countEvent(Metrics.EVENT_TYPE.PROJECT, "recovery", "restoreClick");
        if(!project || projectToRestore !== currentProjectRoot.fullPath){
            console.error(`[recovery] current project ${currentProjectRoot.fullPath} != restore ${projectToRestore}`);
            return;
        }
        let pathsToRestore = Object.keys(project.lastBackedUpFileContents);
        await ensureOpenEditors(pathsToRestore);
        for(let filePath of pathsToRestore){
            if(ProjectManager.isWithinProject(filePath)) {
                console.log("restoring", filePath);
                let document = await jsPromise(DocumentManager.getDocumentForPath(filePath));
                document.setText(project.lastBackedUpFileContents[filePath]);
            } else {
                console.error("[recovery] Skipping restore of non project file: ", filePath);
            }
        }
        if(project.restoreNotification){
            project.restoreNotification.close();
            project.restoreNotification = null;
        }
    }

    async function discardBtnClicked(_event, projectToRestore) {
        let currentProjectRoot = ProjectManager.getProjectRoot();
        const project = trackedProjects[currentProjectRoot.fullPath];
        Metrics.countEvent(Metrics.EVENT_TYPE.PROJECT, "recovery", "discardClick");
        if(!project || projectToRestore !== currentProjectRoot.fullPath){
            console.error(`[recovery] current project ${currentProjectRoot.fullPath} != restore ${projectToRestore}`);
            return;
        }
        trackedProjects[currentProjectRoot.fullPath].lastBackedUpFileContents = {};
        // if first edit is handled, the restore directory is nuked and the backup discarded.The discard button will
        // not be shown so this fn should never get called in the case. We also should mark firstEditHandled to true to
        // indicate a fresh backup start for the project
        trackedProjects[currentProjectRoot.fullPath].firstEditHandled = true;
        if(project.restoreNotification) {
            project.restoreNotification.close();
            project.restoreNotification = null;
        }
        await silentlyRemoveDirectory(project.restoreRoot);
        await createDir(project.restoreRoot);
        await backupChangedDocs(currentProjectRoot);
    }

    function initWith(scanIntervalMs, restoreDir) {
        ProjectManager.on(ProjectManager.EVENT_AFTER_PROJECT_OPEN, projectOpened);
        ProjectManager.on(ProjectManager.EVENT_PROJECT_BEFORE_CLOSE, beforeProjectClosed);
        exports.on("restoreProject", restoreBtnClicked);
        exports.on("discardProject", discardBtnClicked);
        sessionRestoreDir = restoreDir;
        createDir(sessionRestoreDir);
        setInterval(changeScanner, scanIntervalMs);
        let currentProjectRoot = ProjectManager.getProjectRoot();
        if(currentProjectRoot) {
            // ##SEARCH_THIS_TAG_IN_FILE_1
            // At boot, the startup project may be opened and we may never get the projectOpened event triggered
            // for the startup project. So we call manually.
            projectOpened(null, currentProjectRoot);
        }
    }

    function init() {
        if(!window.testEnvironment){
            initWith(BACKUP_INTERVAL_MS, sessionRestoreDir);
        } else {
            // this is a test environment, expose functions to test
            exports.getProjectRestoreRoot = getProjectRestoreRoot;
            exports.initWith = initWith;
            window._FileRecoveryExtensionForTests = exports;
        }
    }

    exports.init = init;
});
