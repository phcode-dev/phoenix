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

define(function (require, exports, module) {


    var Async           = require("utils/Async"),
        CommandManager  = require("command/CommandManager"),
        Commands        = require("command/Commands"),
        Dialogs         = require("widgets/Dialogs"),
        DefaultDialogs  = require("widgets/DefaultDialogs"),
        MainViewManager = require("view/MainViewManager"),
        FileSystem      = require("filesystem/FileSystem"),
        FileUtils       = require("file/FileUtils"),
        ProjectManager  = require("project/ProjectManager"),
        Strings         = require("strings"),
        StringUtils     = require("utils/StringUtils");

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
                            StringUtils.breakableUrl(ProjectManager.makeProjectRelativeIfPossible(info.path)) +
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


    /**
     * Attaches global drag & drop handlers to this window. This enables dropping files/folders to open them, and also
     * protects the Brackets app from being replaced by the browser trying to load the dropped file in its place.
     */
    function attachHandlers() {

        function handleDragOver(event) {
            event = event.originalEvent || event;

            var files = event.dataTransfer.files;

            stopURIListPropagation(files, event);

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

            var files = event.dataTransfer.files;

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
});
