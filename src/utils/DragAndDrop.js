 /*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

// @INCLUDE_IN_API_DOCS


define(function (require, exports, module) {


    const Async           = require("utils/Async"),
        CommandManager  = require("command/CommandManager"),
        Commands        = require("command/Commands"),
        Dialogs         = require("widgets/Dialogs"),
        DefaultDialogs  = require("widgets/DefaultDialogs"),
        MainViewManager = require("view/MainViewManager"),
        FileSystem      = require("filesystem/FileSystem"),
        PreferencesManager  = require("preferences/PreferencesManager"),
        FileUtils       = require("file/FileUtils"),
        ProjectManager  = require("project/ProjectManager"),
        Strings         = require("strings"),
        Metrics = require("utils/Metrics"),
        StringUtils     = require("utils/StringUtils");

    const _PREF_DRAG_AND_DROP = "dragAndDrop"; // used in debug menu
    PreferencesManager.definePreference(_PREF_DRAG_AND_DROP, "boolean",
        Phoenix.isNativeApp && Phoenix.platform !== "linux", {description: Strings.DESCRIPTION_DRAG_AND_DROP_ENABLED}
    );

    /**
     * Returns true if the drag and drop items contains valid drop objects.
     * @param {Array.<DataTransferItem>} items Array of items being dragged
     * @return {boolean} True if one or more items can be dropped.
     */
    function isValidDrop(items) {
        var i, len = items.length;

        for (i = 0; i < len; i++) {
            if (items[i].kind === "file") {
                var entry = items[i].webkitGetAsEntry();

                if (entry.isFile) {
                    // If any files are being dropped, this is a valid drop
                    return true;
                } else if (len === 1) {
                    // If exactly one folder is being dropped, this is a valid drop
                    return true;
                }
            }
        }

        // No valid entries found
        return false;
    }

    /**
     * Determines if the event contains a type list that has a URI-list.
     * If it does and contains an empty file list, then what is being dropped is a URL.
     * If that is true then we stop the event propagation and default behavior to save Brackets editor from the browser taking over.
     * @param {Array.<File>} files Array of File objects from the event datastructure. URLs are the only drop item that would contain a URI-list.
     * @param {event} event The event datastucture containing datatransfer information about the drag/drop event. Contains a type list which may or may not hold a URI-list depending on what was dragged/dropped. Interested if it does.
     */
    function stopURIListPropagation(files, event) {
        var types = event.dataTransfer.types;

        if ((!files || !files.length) && types) { // We only want to check if a string of text was dragged into the editor
            types.forEach(function (value) {
                //Dragging text externally (dragging text from another file): types has "text/plain" and "text/html"
                //Dragging text internally (dragging text to another line): types has just "text/plain"
                //Dragging a file: types has "Files"
                //Dragging a url: types has "text/plain" and "text/uri-list" <-what we are interested in
                if (value === "text/uri-list") {
                    event.stopPropagation();
                    event.preventDefault();
                    return;
                }
            });
        }
    }

    /**
     * Open dropped files
     * @param {Array.<string>} files Array of files dropped on the application.
     * @return {Promise} Promise that is resolved if all files are opened, or rejected
     *     if there was an error.
     */
    function openDroppedFiles(paths) {
        var errorFiles = [],
            ERR_MULTIPLE_ITEMS_WITH_DIR = {};

        return Async.doInParallel(paths, function (path, idx) {
            var result = new $.Deferred();

            // Only open files.
            FileSystem.resolve(path, function (err, item) {
                if (!err && item.isFile) {
                    // If the file is already open, and this isn't the last
                    // file in the list, return. If this *is* the last file,
                    // always open it so it gets selected.
                    if (idx < paths.length - 1) {
                        if (MainViewManager.findInWorkingSet(MainViewManager.ALL_PANES, path) !== -1) {
                            result.resolve();
                            return;
                        }
                    }

                    Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "dragAndDrop", "fileOpen");
                    CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN,
                        {fullPath: path, silent: true})
                        .done(function () {
                            result.resolve();
                        })
                        .fail(function (openErr) {
                            errorFiles.push({path: path, error: openErr});
                            result.reject();
                        });
                } else if (!err && item.isDirectory && paths.length === 1) {
                    // One folder was dropped, open it.
                    Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "dragAndDrop", "projectOpen");
                    ProjectManager.openProject(path)
                        .done(function () {
                            result.resolve();
                        })
                        .fail(function () {
                            // User was already notified of the error.
                            result.reject();
                        });
                } else {
                    errorFiles.push({path: path, error: err || ERR_MULTIPLE_ITEMS_WITH_DIR});
                    result.reject();
                }
            });

            return result.promise();
        }, false)
            .fail(function () {
                function errorToString(err) {
                    if (err === ERR_MULTIPLE_ITEMS_WITH_DIR) {
                        return Strings.ERROR_MIXED_DRAGDROP;
                    }
                    return FileUtils.getFileErrorString(err);

                }

                if (errorFiles.length > 0) {
                    var message = Strings.ERROR_OPENING_FILES;

                    message += "<ul class='dialog-list'>";
                    errorFiles.forEach(function (info) {
                        message += "<li><span class='dialog-filename'>" +
                            StringUtils.breakableUrl(ProjectManager.getProjectRelativeOrDisplayPath(info.path)) +
                            "</span> - " + errorToString(info.error) +
                            "</li>";
                    });
                    message += "</ul>";

                    Dialogs.showModalDialog(
                        DefaultDialogs.DIALOG_ID_ERROR,
                        Strings.ERROR_OPENING_FILE_TITLE,
                        message
                    );
                }
            });
    }

    async function _focusAndOpenDroppedFiles(droppedPaths) {
        try{
            const currentWindow = window.__TAURI__.window.getCurrent();
            await currentWindow.setAlwaysOnTop(true);
            await currentWindow.setAlwaysOnTop(false);
        } catch (e) {
            console.error("Error focusing window");
        }
        openDroppedFiles(droppedPaths);
    }

    if(Phoenix.isNativeApp){
        window.__TAURI__.event.listen('file-drop-event-phoenix', ({payload})=> {
            if(!payload || !payload.pathList || !payload.pathList.length || !payload.windowLabelOfListener
                || payload.windowLabelOfListener !== window.__TAURI__.window.appWindow.label){
                return;
            }
            Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "dragAndDrop", "any");
            const droppedVirtualPaths = [];
            for(const droppedPath of payload.pathList) {
                try{
                    droppedVirtualPaths.push(window.fs.getTauriVirtualPath(droppedPath));
                } catch (e) {
                    console.error("Error resolving dropped path: ", droppedPath);
                }
            }
            _focusAndOpenDroppedFiles(droppedVirtualPaths);
        });
    }

    async function _computeNewPositionAndSizeWebkit() {
        const currentWindow = window.__TAURI__.window.getCurrent();
        const newSize = await currentWindow.innerSize();
        const newPosition = await currentWindow.innerPosition();
        // in mac we somehow get the top left of the window including the title bar even though we are calling the
        // tauri innerPosition api. We earlier adjusted for a generally constant title bar height of mac that is 28px.
        // But then is nome macs due to display scaling, it was not 28px all the time.
        // so, we just draw over the entire window in mac alone.
        return {newSize, newPosition};
    }

    async function _computeNewPositionAndSizeWindows() {
        // Note that the drop window may be on different screens if multi window setup. in windows os, there can be
        // of different scale factors like 1x and 1.5x on another monitor. Additionally, we may apply our own zoom
        // settings. So its is always better to just use the tauri provided positions. the tauri api returned values
        // will position the window to the correct monitor as well.
        const currentWindow = window.__TAURI__.window.getCurrent();
        const newSize = await currentWindow.innerSize();
        const newPosition = await currentWindow.innerPosition();
        return {newSize, newPosition};
    }

    async function _computeNewPositionAndSize() {
        if(Phoenix.platform === "win") {
            return _computeNewPositionAndSizeWindows();
        }
        return _computeNewPositionAndSizeWebkit();
    }

    async function showAndResizeFileDropWindow(event) {
        let $activeElement;
        const fileDropWindow = window.__TAURI__.window.WebviewWindow.getByLabel('fileDrop');
        if($("#editor-holder").has(event.target).length) {
            $activeElement = $("#editor-holder");
        } else if($("#sidebar").has(event.target).length) {
            $activeElement = $("#sidebar");
        } else {
            await fileDropWindow.hide();
        }
        if(!$activeElement){
            return;
        }

        const {newSize, newPosition} = await _computeNewPositionAndSize();
        const currentSize = await fileDropWindow.innerSize();
        const currentPosition = await fileDropWindow.innerPosition();
        const isSameSize = currentSize.width === newSize.width && currentSize.height === newSize.height;
        const isSamePosition = currentPosition.x === newPosition.x && currentPosition.y === newPosition.y;
        window.__TAURI__.event.emit("drop-attach-on-window", {
            projectName: window.path.basename(ProjectManager.getProjectRoot().fullPath),
            dropMessage: Strings.DROP_TO_OPEN_FILES,
            dropMessageOneFile: Strings.DROP_TO_OPEN_FILE,
            dropProjectMessage: Strings.DROP_TO_OPEN_PROJECT,
            windowLabelOfListener: window.__TAURI__.window.appWindow.label,
            platform: Phoenix.platform
        });
        if (isSameSize && isSamePosition && (await fileDropWindow.isVisible())) {
            return; // Do nothing if the window is already at the correct size and position and visible
        }

        // Resize the fileDrop window to match the current window
        await fileDropWindow.setSize(newSize);
        await fileDropWindow.setPosition(newPosition);

        // Show the fileDrop window
        await fileDropWindow.show();
        await fileDropWindow.setAlwaysOnTop(true);
        // the fileDropWindow window will always be on top as the window itslef has logic to dismiss itself if mouse
        // exited it. Also, if we dont to that, in mac in some cases, the window will go to the background while
        // dragging. So while this window is visible, this will alwyas be on top.
    }

    /**
     * Attaches global drag & drop handlers to this window. This enables dropping files/folders to open them, and also
     * protects the Brackets app from being replaced by the browser trying to load the dropped file in its place.
     */
    function attachHandlers() {

        function handleDragOver(event) {
            event = event.originalEvent || event;

            var files = event.dataTransfer.files;

            stopURIListPropagation(files, event);
            if(PreferencesManager.get(_PREF_DRAG_AND_DROP) &&
                event.dataTransfer.types && event.dataTransfer.types.includes("Files")){
                // in linux, there is a bug in ubuntu 24 where dropping a file will cause a ghost icon which only
                // goes away on reboot. So we dont support drop files in linux for now.
                showAndResizeFileDropWindow(event);
            }

            if (files && files.length) {
                event.stopPropagation();
                event.preventDefault();

                var dropEffect = "none";

                // Don't allow drag-and-drop of files/folders when a modal dialog is showing.
                if ($(".modal.instance").length === 0 && isValidDrop(event.dataTransfer.items)) {
                    dropEffect = "copy";
                }
                event.dataTransfer.dropEffect = dropEffect;
            }
        }

        function handleDrop(event) {
            event = event.originalEvent || event;

            const files = event.dataTransfer.files;
            Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "dragAndDrop", "any");

            stopURIListPropagation(files, event);

            if (files && files.length) {
                event.stopPropagation();
                event.preventDefault();

                brackets.app.getDroppedFiles(function (err, paths) {
                    if (!err) {
                        openDroppedFiles(paths);
                    }
                });
            }
        }

        // For most of the window, only respond if nothing more specific in the UI has already grabbed the event (e.g.
        // the Extension Manager drop-to-install zone, or an extension with a drop-to-upload zone in its panel)
        $(window.document.body)
            .on("dragover", handleDragOver)
            .on("drop", handleDrop);

        // Over CodeMirror specifically, always pre-empt CodeMirror's drag event handling if files are being dragged - CM stops
        // propagation on any drag event it sees, even when it's not a text drag/drop. But allow CM to handle all non-file drag
        // events. See bug #10617.
        window.document.body.addEventListener("dragover", function (event) {
            if ($(event.target).closest(".CodeMirror").length) {
                handleDragOver(event);
            }
        }, true);
        window.document.body.addEventListener("drop", function (event) {
            if ($(event.target).closest(".CodeMirror").length) {
                handleDrop(event);
            }
        }, true);
    }


    CommandManager.register(Strings.CMD_OPEN_DROPPED_FILES, Commands.FILE_OPEN_DROPPED_FILES, openDroppedFiles);

    // Export public API
    exports.attachHandlers      = attachHandlers;
    exports.isValidDrop         = isValidDrop;
    exports.openDroppedFiles    = openDroppedFiles;

    // private exports
    exports._PREF_DRAG_AND_DROP = _PREF_DRAG_AND_DROP;
});
