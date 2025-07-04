/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
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

// jshint ignore: start
/*jslint regexp: true */
/*globals logger, jsPromise, path*/

define(function (require, exports, module) {


    // Load dependent modules
    const AppInit             = require("utils/AppInit"),
        CommandManager      = require("command/CommandManager"),
        Commands            = require("command/Commands"),
        DeprecationWarning  = require("utils/DeprecationWarning"),
        EventDispatcher     = require("utils/EventDispatcher"),
        ProjectManager      = require("project/ProjectManager"),
        DocumentManager     = require("document/DocumentManager"),
        MainViewManager     = require("view/MainViewManager"),
        EditorManager       = require("editor/EditorManager"),
        FileSystem          = require("filesystem/FileSystem"),
        FileSystemError     = require("filesystem/FileSystemError"),
        FileUtils           = require("file/FileUtils"),
        FileViewController  = require("project/FileViewController"),
        InMemoryFile        = require("document/InMemoryFile"),
        StringUtils         = require("utils/StringUtils"),
        Async               = require("utils/Async"),
        Metrics             = require("utils/Metrics"),
        Dialogs             = require("widgets/Dialogs"),
        DefaultDialogs      = require("widgets/DefaultDialogs"),
        Strings             = require("strings"),
        PopUpManager        = require("widgets/PopUpManager"),
        PreferencesManager  = require("preferences/PreferencesManager"),
        PerfUtils           = require("utils/PerfUtils"),
        KeyEvent            = require("utils/KeyEvent"),
        Menus               = require("command/Menus"),
        UrlParams           = require("utils/UrlParams").UrlParams,
        StatusBar           = require("widgets/StatusBar"),
        WorkspaceManager    = require("view/WorkspaceManager"),
        LanguageManager     = require("language/LanguageManager"),
        NewFileContentManager     = require("features/NewFileContentManager"),
        NodeConnector = require("NodeConnector"),
        NodeUtils           = require("utils/NodeUtils"),
        _                   = require("thirdparty/lodash");

    const KernalModeTrust = window.KernalModeTrust;
    if(!KernalModeTrust){
        throw new Error("KernalModeTrust is not defined. Cannot boot without trust ring");
    }
    async function _resetTauriTrustRingBeforeRestart() {
        // This is needed as if for a given tauri window, the trust ring can only be set once. So reloading the app
        // in the same window, tauri will deny setting new keys.
        // this is a security measure to prevent a malicious extension from setting its own key.
        try {
            await KernalModeTrust.dismantleKeyring();
        } catch (e) {
            console.error("Error while resetting trust ring before restart", e);
        }
    }

    /**
     * Handlers for commands related to document handling (opening, saving, etc.)
     */

    /**
     * Container for label shown above editor; must be an inline element
     * @type {jQueryObject}
     */
    var _$title = null;

    /**
     * Container for dirty dot; must be an inline element
     * @type {jQueryObject}
     */
    var _$dirtydot = null;

    /**
     * Container for _$title; need not be an inline element
     * @type {jQueryObject}
     */
    var _$titleWrapper = null;

    /**
     * Label shown above editor for current document: filename and potentially some of its path
     * @type {string}
     */
    var _currentTitlePath = null;

    /**
     * Determine the dash character for each platform. Use emdash on Mac
     * and a standard dash on all other platforms.
     * @type {string}
     */
    var _osDash = brackets.platform === "mac" ? "\u2014" : "-";

    /**
     * String template for window title when no file is open.
     * @type {string}
     */
    var WINDOW_TITLE_STRING_NO_DOC = "{0} " + _osDash + " {1}";

    /**
    * String template for window title when a file is open.
    * @type {string}
    */
    var WINDOW_TITLE_STRING_DOC = "{0} " + _osDash + " {1}";

    /**
     * Container for _$titleWrapper; if changing title changes this element's height, must kick editor to resize
     * @type {jQueryObject}
     */
    var _$titleContainerToolbar = null;

    /**
     * Last known height of _$titleContainerToolbar
     * @type {number}
     */
    var _lastToolbarHeight = null;

    /**
     * index to use for next, new Untitled document
     * @type {number}
     */
    var _nextUntitledIndexToUse = 1;

    /**
     * prevents reentrancy of browserReload()
     * @type {boolean}
     */
    var _isReloading = false;

    /** Unique token used to indicate user-driven cancellation of Save As (as opposed to file IO error) */
    var USER_CANCELED = { userCanceled: true };

    PreferencesManager.definePreference("defaultExtension", "string", "", {
        excludeFromHints: true
    });
    EventDispatcher.makeEventDispatcher(exports);


    PreferencesManager.definePreference("emmet", "boolean", true, {
        description: Strings.DESCRIPTION_EMMET
    });

    // Register the Emmet toggle command
    const EMMET_COMMAND_ID = "edit.emmet";
    const emmetCommand = CommandManager.register(Strings.CMD_TOGGLE_EMMET, EMMET_COMMAND_ID, toggleEmmet);

    // Set initial state based on the preference
    emmetCommand.setChecked(PreferencesManager.get("emmet"));

    // Helper function to toggle the Emmet preference
    function toggleEmmet() {
        PreferencesManager.set("emmet", !PreferencesManager.get("emmet"));
        emmetCommand.setChecked(PreferencesManager.get("emmet"));
    }

    // Listen for any change in the "emmet" preference and update the menu's toggle state
    // this is needed because else the menu is not getting updated when the preference is changed
    PreferencesManager.on("change", "emmet", function () {
        emmetCommand.setChecked(PreferencesManager.get("emmet"));
    });

    /**
     * Event triggered when File Save is cancelled, when prompted to save dirty files
     */
    const APP_QUIT_CANCELLED = "appQuitCancelled";
    // private event emitted when a file is opened via user right-clicking a file from the os explorer in phcode.
    const _EVENT_OPEN_WITH_FILE_FROM_OS = "_openWithFileFromOS";
    let _filesOpenedFromOsCount = 0;


    /**
     * JSLint workaround for circular dependency
     * @type {function}
     */
    let handleFileSaveAs;

    // these are files that should be treated separately in metrics for open files.
    const DEFAULT_PROJECT_FILES = {
        "index.html": true,
        "Newly_added_features.md": true,
        "styles.css": true,
        "script.js": true
    };

    const METRIC_FILE_SAVE = "fileSave",
        METRIC_FILE_OPEN = "fileOpen",
        METRIC_FILE_CLOSE = "fileClose",
        METRIC_FILE_OPEN_WS = "fileAddWorkingSet";
    function _dpIfDefaultProjectEvent(eventCategory, filePath) {
        const projectRootPath = ProjectManager.getProjectRoot().fullPath;
        if(filePath && filePath.startsWith(projectRootPath)){
            const relativePath = path.relative(projectRootPath, filePath);
            if(DEFAULT_PROJECT_FILES[relativePath] || relativePath.startsWith("images")){
                return eventCategory === METRIC_FILE_SAVE ? "defaultFileSave" : "defaultFileOp";
            }
        }
        return `${eventCategory}`;
    }

    /**
     * For analytics. Whenever a file is opened call this function. The function will record the number of times
     * the standard file types have been opened. We only log the standard filetypes
     * @param {String} filePath          The path of the file to be registered
     * @param {boolean} addedToWorkingSet set to true if extensions of files added to the
     *                                    working set needs to be logged
     */
    function _fileOpened(filePath, addedToWorkingSet, encoding) {
        let language = LanguageManager.getLanguageForPath(filePath);

        Metrics.countEvent(Metrics.EVENT_TYPE.EDITOR,
            _dpIfDefaultProjectEvent("fileEncoding", filePath), encoding || 'UTF-8');
        if(addedToWorkingSet){
            Metrics.countEvent(Metrics.EVENT_TYPE.EDITOR,
                _dpIfDefaultProjectEvent(METRIC_FILE_OPEN_WS, filePath), language._name.toLowerCase());
        } else {
            Metrics.countEvent(Metrics.EVENT_TYPE.EDITOR,
                _dpIfDefaultProjectEvent(METRIC_FILE_OPEN, filePath), language._name.toLowerCase());
        }
    }

    /**
     * For analytics. Whenever a file is saved call this function.
     * The function will send the analytics Data
     * We only log the standard filetypes and fileSize
     * @param {Document} docToSave The path of the file to be registered
     */
    function _fileSavedMetrics(docToSave) {
        if (!docToSave) {
            return;
        }
        let fileType = docToSave.language ? docToSave.language._name : "";
        Metrics.countEvent(Metrics.EVENT_TYPE.EDITOR,
            _dpIfDefaultProjectEvent(METRIC_FILE_SAVE, docToSave.file && docToSave.file.fullPath), fileType);
    }

    /**
     * For analytics. Whenever a file is closed call this function.
     * The function will send the analytics Data.
     * We only log the standard filetypes and fileSize
     * @param {File} file The path of the file to be registered
     */
    function _fileClosed(file) {
        if (!file) {
            return;
        }
        var language = LanguageManager.getLanguageForPath(file._path),
            size = -1;

        function _sendData(fileSizeInKB) {
            let subType = "",
                fileSizeInMB = fileSizeInKB/1024;

            if(fileSizeInMB <= 1) {
                // We don't log exact file sizes for privacy.
                if(fileSizeInKB < 0) {
                    subType = "";
                }
                if(fileSizeInKB <= 10) {
                    subType = "0_to_10KB";
                } else if (fileSizeInKB <= 50) {
                    subType = "10_to_50KB";
                } else if (fileSizeInKB <= 100) {
                    subType = "50_to_100KB";
                } else if (fileSizeInKB <= 500) {
                    subType = "100_to_500KB";
                } else {
                    subType = "500KB_to_1MB";
                }

            } else {
                if(fileSizeInMB <= 2) {
                    subType = "1_to_2MB";
                } else if(fileSizeInMB <= 5) {
                    subType = "2_to_5MB";
                } else if(fileSizeInMB <= 10) {
                    subType = "5_to_10MB";
                } else {
                    subType = "Above_10MB";
                }
            }

            Metrics.countEvent(Metrics.EVENT_TYPE.EDITOR,
                _dpIfDefaultProjectEvent(METRIC_FILE_CLOSE, file.fullPath),
                `${language._name.toLowerCase()}.${subType}`);
        }

        file.stat(function(err, fileStat) {
            if(!err) {
                size = fileStat.size.valueOf()/1024;
            }
            _sendData(size);
        });
    }

    /**
     * Updates the title bar with new file title or dirty indicator
     * @private
     */
    function _updateTitle() {
        var currentDoc          = DocumentManager.getCurrentDocument(),
            windowTitle         = brackets.config.app_title,
            currentlyViewedFile = MainViewManager.getCurrentlyViewedFile(MainViewManager.ACTIVE_PANE),
            currentlyViewedPath = currentlyViewedFile && currentlyViewedFile.fullPath,
            readOnlyString      = (currentlyViewedFile && currentlyViewedFile.readOnly) ? "[Read Only] - " : "";


        if (currentlyViewedPath) {
            if(!Phoenix.isNativeApp) {
                // in native app, the app titlebar will have the file name and the title text section in not there.
                _$title.text(_currentTitlePath);
            }
            _$title.attr("title", currentlyViewedPath);
            if (currentDoc) {
                // dirty dot is always in DOM so layout doesn't change, and visibility is toggled
                _$dirtydot.css("visibility", (currentDoc.isDirty) ? "visible" : "hidden");
            } else {
                // hide dirty dot if there is no document
                _$dirtydot.css("visibility", "hidden");
            }
        } else {
            _$title.text("");
            _$title.attr("title", "");
            _$dirtydot.css("visibility", "hidden");
        }

        // Set _$titleWrapper to a fixed width just large enough to accommodate _$title. This seems equivalent to what
        // the browser would do automatically, but the CSS trick we use for layout requires _$titleWrapper to have a
        // fixed width set on it (see the "#titlebar" CSS rule for details).
        _$titleWrapper.css("width", "");
        var newWidth = _$title.width();
        _$titleWrapper.css("width", newWidth);

        // Changing the width of the title may cause the toolbar layout to change height, which needs to resize the
        // editor beneath it (toolbar changing height due to window resize is already caught by EditorManager).
        var newToolbarHeight = _$titleContainerToolbar.height();
        if (_lastToolbarHeight !== newToolbarHeight) {
            _lastToolbarHeight = newToolbarHeight;
            WorkspaceManager.recomputeLayout();
        }


        var projectRoot = ProjectManager.getProjectRoot();
        if (projectRoot) {
            var projectName = projectRoot.name;
            // Construct shell/browser window title, e.g. "• index.html (myProject) — Brackets"
            if (currentlyViewedPath) {
                windowTitle = StringUtils.format(WINDOW_TITLE_STRING_DOC, readOnlyString + projectName, _currentTitlePath);
                // Display dirty dot when there are unsaved changes
                if (currentDoc && currentDoc.isDirty) {
                    windowTitle = "• " + windowTitle;
                }
            } else {
                // A document is not open
                windowTitle = StringUtils.format(WINDOW_TITLE_STRING_NO_DOC, projectName, brackets.config.app_title);
            }
        }
        Phoenix.app.setWindowTitle(windowTitle);
    }

    /**
     * Returns a short title for a given document.
     *
     * @param {Document} doc - the document to compute the short title for
     * @return {string} - a short title for doc.
     */
    function _shortTitleForDocument(doc) {
        var fullPath = doc.file.fullPath;

        // If the document is untitled then return the filename, ("Untitled-n.ext");
        // otherwise show the project-relative path if the file is inside the
        // current project or the full absolute path if it's not in the project.
        if (doc.isUntitled()) {
            return fullPath.substring(fullPath.lastIndexOf("/") + 1);
        }
        return Phoenix.app.getDisplayPath(ProjectManager.makeProjectRelativeIfPossible(fullPath));

    }

    /**
     * Handles currentFileChange and filenameChanged events and updates the titlebar
     */
    function handleCurrentFileChange() {
        var newFile = MainViewManager.getCurrentlyViewedFile(MainViewManager.ACTIVE_PANE);

        if (newFile) {
            var newDocument = DocumentManager.getOpenDocumentForPath(newFile.fullPath);

            if (newDocument) {
                _currentTitlePath = _shortTitleForDocument(newDocument);
            } else {
                const filePath = ProjectManager.makeProjectRelativeIfPossible(newFile.fullPath);
                _currentTitlePath = Phoenix.app.getDisplayPath(filePath);
            }
        } else {
            _currentTitlePath = null;
        }

        // Update title text & "dirty dot" display
        _updateTitle();
    }

    /**
     * Handles dirtyFlagChange event and updates the title bar if necessary
     */
    function handleDirtyChange(event, changedDoc) {
        var currentDoc = DocumentManager.getCurrentDocument();

        if (currentDoc && changedDoc.file.fullPath === currentDoc.file.fullPath) {
            _updateTitle();
        }
    }

    /**
     * Shows an error dialog indicating that the given file could not be opened due to the given error
     * @param {!FileSystemError} name
     * @return {!Dialog}
     */
    function showFileOpenError(name, path) {
        return Dialogs.showModalDialog(
            DefaultDialogs.DIALOG_ID_ERROR,
            Strings.ERROR_OPENING_FILE_TITLE,
            StringUtils.format(
                Strings.ERROR_OPENING_FILE,
                StringUtils.breakableUrl(path),
                FileUtils.getFileErrorString(name)
            )
        );
    }

    /**
     * @private
     * Creates a document and displays an editor for the specified file path.
     * @param {!string} fullPath
     * @param {boolean=} silent If true, don't show error message
     * @param {string=} paneId, the id oi the pane in which to open the file. Can be undefined, a valid pane id or ACTIVE_PANE.
     * @param {{*}=} options, command options
     * @return {$.Promise} a jQuery promise that will either
     * - be resolved with a file for the specified file path or
     * - be rejected with FileSystemError if the file can not be read.
     * If paneId is undefined, the ACTIVE_PANE constant
     */
    function _doOpen(fullPath, silent, paneId, options) {
        var result = new $.Deferred();

        // workaround for https://github.com/adobe/brackets/issues/6001
        // TODO should be removed once bug is closed.
        // if we are already displaying a file do nothing but resolve immediately.
        // this fixes timing issues in test cases.
        if (MainViewManager.getCurrentlyViewedPath(paneId || MainViewManager.ACTIVE_PANE) === fullPath) {
            result.resolve(MainViewManager.getCurrentlyViewedFile(paneId || MainViewManager.ACTIVE_PANE));
            return result.promise();
        }

        function _cleanup(fileError, fullFilePath) {
            if (fullFilePath) {
                // For performance, we do lazy checking of file existence, so it may be in workingset
                MainViewManager._removeView(paneId, FileSystem.getFileForPath(fullFilePath));
                MainViewManager.focusActivePane();
            }
            result.reject(fileError);
        }
        function _showErrorAndCleanUp(fileError, fullFilePath) {
            if (silent) {
                _cleanup(fileError, fullFilePath);
            } else {
                showFileOpenError(fileError, fullFilePath).done(function () {
                    _cleanup(fileError, fullFilePath);
                });
            }
        }

        if (!fullPath) {
            throw new Error("_doOpen() called without fullPath");
        } else {
            var perfTimerName = PerfUtils.markStart("Open File:\t" + fullPath);
            result.always(function () {
                let fileOpenTime = PerfUtils.addMeasurement(perfTimerName);
                Metrics.valueEvent(Metrics.EVENT_TYPE.PERFORMANCE, "fileOpen",
                    "timeMs", Number(fileOpenTime));
            });

            var file = FileSystem.getFileForPath(fullPath);
            if (options && options.encoding) {
                file._encoding = options.encoding;
            } else {
                const encoding = PreferencesManager.getViewState("encoding", PreferencesManager.STATE_PROJECT_CONTEXT);
                if (encoding && encoding[fullPath]) {
                    file._encoding = encoding[fullPath];
                }
            }
            MainViewManager._open(paneId, file, options)
                .done(function () {
                    result.resolve(file);
                })
                .fail(function (fileError) {
                    _showErrorAndCleanUp(fileError, fullPath);
                    result.reject();
                });
        }

        return result.promise();
    }

    /**
     * @private
     * Used to track the default directory for the file open dialog
     */
    var _defaultOpenDialogFullPath = null;

    /**
     * @private
     * Opens a file and displays its view (editor, image view, etc...) for the specified path.
     * If no path is specified, a file prompt is provided for input.
     * @param {?string} fullPath - The path of the file to open; if it's null we'll prompt for it
     * @param {boolean=} silent - If true, don't show error message
     * @param {string=}  paneId - the pane in which to open the file. Can be undefined, a valid pane id or ACTIVE_PANE
     * @param {{*}=} options - options to pass to MainViewManager._open
     * @return {$.Promise} a jQuery promise resolved with a Document object or
     *                      rejected with an err
     */
    function _doOpenWithOptionalPath(fullPath, silent, paneId, options) {
        var result;
        paneId = paneId || MainViewManager.ACTIVE_PANE;
        if (!fullPath) {
            // Create placeholder deferred
            result = new $.Deferred();

            //first time through, default to the current project path
            if (!_defaultOpenDialogFullPath) {
                _defaultOpenDialogFullPath = ProjectManager.getProjectRoot().fullPath;
            }
            // Prompt the user with a dialog
            FileSystem.showOpenDialog(true, false, Strings.OPEN_FILE, _defaultOpenDialogFullPath, null, function (err, paths) {
                if (!err) {
                    if (paths.length > 0) {
                        // Add all files to the workingset without verifying that
                        // they still exist on disk (for faster opening)
                        var filesToOpen = [];

                        paths.forEach(function (path) {
                            filesToOpen.push(FileSystem.getFileForPath(path));
                        });
                        MainViewManager.addListToWorkingSet(paneId, filesToOpen);

                        _doOpen(paths[paths.length - 1], silent, paneId, options)
                            .done(function (file) {
                                _defaultOpenDialogFullPath =
                                    FileUtils.getDirectoryPath(
                                        MainViewManager.getCurrentlyViewedPath(paneId)
                                    );
                            })
                            // Send the resulting document that was opened
                            .then(result.resolve, result.reject);
                    } else {
                        // Reject if the user canceled the dialog
                        result.reject();
                    }
                }
            });
        } else {
            result = _doOpen(fullPath, silent, paneId, options);
        }

        return result.promise();
    }

    /**
     * @private
     * Splits a decorated file path into its parts.
     * @param {?string} path - a string of the form "fullpath[:lineNumber[:columnNumber]]"
     * @return {{path: string, line: ?number, column: ?number}}
     */
    function _parseDecoratedPath(path) {
        var result = {path: path, line: null, column: null};
        if (path) {
            // If the path has a trailing :lineNumber and :columnNumber, strip
            // these off and assign to result.line and result.column.
            var matchResult = /(.+?):([0-9]+)(:([0-9]+))?$/.exec(path);
            if (matchResult) {
                result.path = matchResult[1];
                if (matchResult[2]) {
                    result.line = parseInt(matchResult[2], 10);
                }
                if (matchResult[4]) {
                    result.column = parseInt(matchResult[4], 10);
                }
            }
        }
        return result;
    }

    /**
     * @typedef {{fullPath:?string=, silent:boolean=, paneId:string=}} FileCommandData
     * fullPath: is in the form "path[:lineNumber[:columnNumber]]"
     * lineNumber and columnNumber are 1-origin: lines and columns are 1-based
     */

    /**
     * @typedef {{fullPath:?string=, index:number=, silent:boolean=, forceRedraw:boolean=, paneId:string=}} PaneCommandData
     * fullPath: is in the form "path[:lineNumber[:columnNumber]]"
     * lineNumber and columnNumber are 1-origin: lines and columns are 1-based
     */

    /**
     * Opens the given file and makes it the current file. Does NOT add it to the workingset.
     * @param {FileCommandData=} commandData - record with the following properties:
     *   fullPath: File to open;
     *   silent: optional flag to suppress error messages;
     *   paneId: optional PaneId (defaults to active pane)
     * @return {$.Promise} a jQuery promise that will be resolved with a file object
     */
    function handleFileOpen(commandData) {
        var fileInfo = _parseDecoratedPath(commandData ? commandData.fullPath : null),
            silent = (commandData && commandData.silent) || false,
            paneId = (commandData && commandData.paneId) || MainViewManager.ACTIVE_PANE,
            result = new $.Deferred();

        _doOpenWithOptionalPath(fileInfo.path, silent, paneId, commandData && commandData.options)
            .done(function (file) {
                _fileOpened(file._path, false, file._encoding);
                if (!commandData || !commandData.options || !commandData.options.noPaneActivate) {
                    MainViewManager.setActivePaneId(paneId);
                }

                // If a line and column number were given, position the editor accordingly.
                if (fileInfo.line !== null) {
                    if (fileInfo.column === null || (fileInfo.column <= 0)) {
                        fileInfo.column = 1;
                    }

                    // setCursorPos expects line/column numbers as 0-origin, so we subtract 1
                    EditorManager.getCurrentFullEditor().setCursorPos(fileInfo.line - 1,
                                                                      fileInfo.column - 1,
                                                                      true);
                }

                result.resolve(file);
            })
            .fail(function (err) {
                result.reject(err);
            });

        return result;
        // Testing notes: here are some recommended manual tests for handleFileOpen, on Macintosh.
        // Do all tests with brackets already running, and also with brackets not already running.
        //
        // drag a file onto brackets icon in desktop (this uses undecorated paths)
        // drag a file onto brackets icon in taskbar (this uses undecorated paths)
        // open a file from brackets sidebar (this uses undecorated paths)
        // from command line: ...../Brackets.app/Contents path         - where 'path' is undecorated
        // from command line: ...../Brackets.app path                  - where 'path' has the form "path:line"
        // from command line: ...../Brackets.app path                  - where 'path' has the form "path:line:column"
        // from command line: open -a ...../Brackets.app path          - where 'path' is undecorated
        // do "View Source" from Adobe Scout version 1.2 or newer (this will use decorated paths of the form "path:line:column")
    }

    /**
     * Opens the given file, makes it the current file, does NOT add it to the workingset
     * @param {FileCommandData} commandData
     *   fullPath: File to open;
     *   silent: optional flag to suppress error messages;
     *   paneId: optional PaneId (defaults to active pane)
     * @return {$.Promise} a jQuery promise that will be resolved with @type {Document}
     */
    function handleDocumentOpen(commandData) {
        var result = new $.Deferred();
        handleFileOpen(commandData)
            .done(function (file) {
                // if we succeeded with an open file
                //  then we need to resolve that to a document.
                //  getOpenDocumentForPath will return null if there isn't a
                //  supporting document for that file (e.g. an image)
                var doc = DocumentManager.getOpenDocumentForPath(file.fullPath);
                result.resolve(doc);
            })
            .fail(function (err) {
                result.reject(err);
            });

        return result.promise();

    }

    /**
     * Opens the given file, makes it the current file, AND adds it to the workingset
     * @param {!PaneCommandData} commandData - record with the following properties:
     *   fullPath: File to open;
     *   index: optional index to position in workingset (defaults to last);
     *   silent: optional flag to suppress error messages;
     *   forceRedraw: flag to force the working set view redraw;
     *   paneId: optional PaneId (defaults to active pane)
     * @return {$.Promise} a jQuery promise that will be resolved with a @type {File}
     */
    function handleFileAddToWorkingSetAndOpen(commandData) {
        return handleFileOpen(commandData).done(function (file) {
            var paneId = (commandData && commandData.paneId) || MainViewManager.ACTIVE_PANE;
            MainViewManager.addToWorkingSet(paneId, file, commandData.index, commandData.forceRedraw);
            _fileOpened(file.fullPath, true);
        });
    }

    /**
     * @deprecated
     * Opens the given file, makes it the current document, AND adds it to the workingset
     * @param {!PaneCommandData} commandData - record with the following properties:
     *   fullPath: File to open;
     *   index: optional index to position in workingset (defaults to last);
     *   silent: optional flag to suppress error messages;
     *   forceRedraw: flag to force the working set view redraw;
     *   paneId: optional PaneId (defaults to active pane)
     * @return {$.Promise} a jQuery promise that will be resolved with @type {File}
     */
    function handleFileAddToWorkingSet(commandData) {
        // This is a legacy deprecated command that
        //  will use the new command and resolve with a document
        //  as the legacy command would only support.
        DeprecationWarning.deprecationWarning("Commands.FILE_ADD_TO_WORKING_SET has been deprecated.  Use Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN instead.");
        var result = new $.Deferred();

        handleFileAddToWorkingSetAndOpen(commandData)
            .done(function (file) {
                // if we succeeded with an open file
                //  then we need to resolve that to a document.
                //  getOpenDocumentForPath will return null if there isn't a
                //  supporting document for that file (e.g. an image)
                var doc = DocumentManager.getOpenDocumentForPath(file.fullPath);
                result.resolve(doc);
            })
            .fail(function (err) {
                result.reject(err);
            });

        return result.promise();
    }

    /**
     * @private
     * Ensures the suggested file name doesn't already exit.
     * @param {Directory} dir  The directory to use
     * @param {string} baseFileName  The base to start with, "-n" will get appended to make unique
     * @param {boolean} isFolder True if the suggestion is for a folder name
     * @return {$.Promise} a jQuery promise that will be resolved with a unique name starting with
     *   the given base name
     */
    function _getUntitledFileSuggestion(dir, baseFileName, isFolder) {
        var suggestedName   = baseFileName + "-" + _nextUntitledIndexToUse++,
            deferred        = $.Deferred();

        if (_nextUntitledIndexToUse > 9999) {
            //we've tried this enough
            deferred.reject();
        } else {
            var path = dir.fullPath + suggestedName,
                entry = isFolder ? FileSystem.getDirectoryForPath(path)
                                 : FileSystem.getFileForPath(path);

            entry.exists(function (err, exists) {
                if (err || exists) {
                    _getUntitledFileSuggestion(dir, baseFileName, isFolder)
                        .then(deferred.resolve, deferred.reject);
                } else {
                    deferred.resolve(suggestedName);
                }
            });
        }

        return deferred.promise();
    }

    /**
     * Prevents re-entrancy into handleFileNewInProject()
     *
     * handleFileNewInProject() first prompts the user to name a file and then asynchronously writes the file when the
     * filename field loses focus. This boolean prevent additional calls to handleFileNewInProject() when an existing
     * file creation call is outstanding
     */
    var fileNewInProgress = false;

    /**
     * Bottleneck function for creating new files and folders in the project tree.
     * @private
     * @param {boolean} isFolder - true if creating a new folder, false if creating a new file
     */
    function _handleNewItemInProject(isFolder) {
        if (fileNewInProgress) {
            ProjectManager.forceFinishRename();
            return;
        }
        fileNewInProgress = true;

        // Determine the directory to put the new file
        // If a file is currently selected in the tree, put it next to it.
        // If a directory is currently selected in the tree, put it in it.
        // If an Untitled document is selected or nothing is selected in the tree, put it at the root of the project.
        var baseDirEntry,
            selected = ProjectManager.getFileTreeContext();
        if ((!selected) || (selected instanceof InMemoryFile)) {
            selected = ProjectManager.getProjectRoot();
        }

        if (selected.isFile) {
            baseDirEntry = FileSystem.getDirectoryForPath(selected.parentPath);
        }

        baseDirEntry = baseDirEntry || selected;

        // Create the new node. The createNewItem function does all the heavy work
        // of validating file name, creating the new file and selecting.
        function createWithSuggestedName(suggestedName) {
            return ProjectManager.createNewItem(baseDirEntry, suggestedName, false, isFolder)
                .done(function (fileOrStatus) {
                    if(!(typeof fileOrStatus === 'object' && fileOrStatus.isFile && fileOrStatus.fullPath)){
                        return;
                    }
                    DocumentManager.getDocumentForPath(fileOrStatus.fullPath)
                        .done(doc =>{
                            NewFileContentManager.getInitialContentForFile(fileOrStatus.fullPath).then(content =>{
                                doc.setText(content);
                            });
                        })
                        .fail(console.error);
                })
                .always(function () { fileNewInProgress = false; });
        }

        return _getUntitledFileSuggestion(baseDirEntry, Strings.UNTITLED, isFolder)
            .then(createWithSuggestedName, createWithSuggestedName.bind(undefined, Strings.UNTITLED));
    }

    /**
     * Create a new untitled document in the workingset, and make it the current document.
     * Promise is resolved (synchronously) with the newly-created Document.
     */
    function handleFileNew() {
        //var defaultExtension = PreferencesManager.get("defaultExtension");
        //if (defaultExtension) {
        //    defaultExtension = "." + defaultExtension;
        //}
        var defaultExtension = "";  // disable preference setting for now

        var doc = DocumentManager.createUntitledDocument(_nextUntitledIndexToUse++, defaultExtension);
        MainViewManager._edit(MainViewManager.ACTIVE_PANE, doc);

        Metrics.countEvent(
            Metrics.EVENT_TYPE.EDITOR,
            "newUntitledFile",
            "create"
        );

        return new $.Deferred().resolve(doc).promise();
    }

    /**
     * Create a new file in the project tree.
     */
    function handleFileNewInProject() {
        Metrics.countEvent(
            Metrics.EVENT_TYPE.EDITOR,
            "newFile",
            "inProject"
        );
        _handleNewItemInProject(false);
    }

    /**
     * Create a new folder in the project tree.
     */
    function handleNewFolderInProject() {
        Metrics.countEvent(
            Metrics.EVENT_TYPE.EDITOR,
            "newFolder",
            "inProject"
        );
        _handleNewItemInProject(true);
    }

    /**
     * @private
     * Shows an Error modal dialog
     * @param {string} name
     * @param {string} path
     * @return {Dialog}
     */
    function _showSaveFileError(name, path) {
        return Dialogs.showModalDialog(
            DefaultDialogs.DIALOG_ID_ERROR,
            Strings.ERROR_SAVING_FILE_TITLE,
            StringUtils.format(
                Strings.ERROR_SAVING_FILE,
                StringUtils.breakableUrl(path),
                FileUtils.getFileErrorString(name)
            )
        );
    }

    let alwaysOverwriteTillProjectSwitch = false;
    /**
     * Saves a document to its existing path. Does NOT support untitled documents.
     * @param {!Document} docToSave
     * @param {boolean=} force Ignore CONTENTS_MODIFIED errors from the FileSystem
     * @return {$.Promise} a promise that is resolved with the File of docToSave (to mirror
     *   the API of _doSaveAs()). Rejected in case of IO error (after error dialog dismissed).
     */
    function doSave(docToSave, force) {
        var result = new $.Deferred(),
            file = docToSave.file;

        function handleError(error) {
            _showSaveFileError(error, file.fullPath)
                .done(function () {
                    result.reject(error);
                });
        }

        function handleContentsModified() {
            if(alwaysOverwriteTillProjectSwitch){
                doSave(docToSave, true).then(result.resolve, result.reject);
                return;
            }
            Dialogs.showModalDialog(
                DefaultDialogs.DIALOG_ID_ERROR,
                Strings.EXT_MODIFIED_TITLE,
                StringUtils.format(
                    Strings.EXT_MODIFIED_WARNING,
                    StringUtils.breakableUrl(docToSave.file.fullPath)
                ),
                [
                    {
                        className: Dialogs.DIALOG_BTN_CLASS_LEFT,
                        id: Dialogs.DIALOG_BTN_SAVE_AS,
                        text: Strings.SAVE_AS
                    },
                    {
                        className: Dialogs.DIALOG_BTN_CLASS_NORMAL,
                        id: Dialogs.DIALOG_BTN_CANCEL,
                        text: Strings.CANCEL
                    },
                    {
                        className: Dialogs.DIALOG_BTN_CLASS_NORMAL,
                        id: "alwaysOverwrite",
                        text: Strings.ALWAYS_OVERWRITE,
                        tooltip: Strings.EXT_ALWAYS_MODIFIED_BUTTON_TOOLTIP
                    },
                    {
                        className: Dialogs.DIALOG_BTN_CLASS_PRIMARY,
                        id: Dialogs.DIALOG_BTN_OK,
                        text: Strings.SAVE_AND_OVERWRITE
                    }
                ]
            )
                .done(function (id) {
                    if (id === Dialogs.DIALOG_BTN_CANCEL) {
                        result.reject();
                    } else if (id === Dialogs.DIALOG_BTN_OK) {
                        // Re-do the save, ignoring any CONTENTS_MODIFIED errors
                        doSave(docToSave, true).then(result.resolve, result.reject);
                    } else if (id === Dialogs.DIALOG_BTN_SAVE_AS) {
                        // Let the user choose a different path at which to write the file
                        handleFileSaveAs({doc: docToSave}).then(result.resolve, result.reject);
                    } else if (id === 'alwaysOverwrite'){
                        alwaysOverwriteTillProjectSwitch = true;
                        doSave(docToSave, true).then(result.resolve, result.reject);
                    }
                });
        }

        function trySave() {
            // We don't want normalized line endings, so it's important to pass true to getText()
            FileUtils.writeText(file, docToSave.getText(true), force)
                .done(function () {
                    docToSave.notifySaved();
                    result.resolve(file);
                    _fileSavedMetrics(docToSave);
                })
                .fail(function (err) {
                    if (err === FileSystemError.CONTENTS_MODIFIED) {
                        handleContentsModified();
                    } else {
                        handleError(err);
                    }
                })
                .always(function () {
                    docToSave.isSaving = false;
                });
        }

        if (docToSave.isDirty) {
            docToSave.isSaving = true;
            if (docToSave.keepChangesTime) {
                // The user has decided to keep conflicting changes in the editor. Check to make sure
                // the file hasn't changed since they last decided to do that.
                docToSave.file.stat(function (err, stat) {
                    // If the file has been deleted on disk, the stat will return an error, but that's fine since
                    // that means there's no file to overwrite anyway, so the save will succeed without us having
                    // to set force = true.
                    if (!err && docToSave.keepChangesTime === stat.mtime.getTime()) {
                        // OK, it's safe to overwrite the file even though we never reloaded the latest version,
                        // since the user already said s/he wanted to ignore the disk version.
                        force = true;
                    }
                    trySave();
                });
            } else {
                trySave();
            }
        } else {
            result.resolve(file);
        }
        result.always(function () {
            MainViewManager.focusActivePane();
        });
        return result.promise();
    }

    /**
     * Reverts the Document to the current contents of its file on disk. Discards any unsaved changes
     * in the Document.
     * @private
     * @param {Document} doc
     * @param {boolean=} suppressError If true, then a failure to read the file will be ignored and the
     *      resulting promise will be resolved rather than rejected.
     * @return {$.Promise} a Promise that's resolved when done, or (if suppressError is false)
     *      rejected with a FileSystemError if the file cannot be read (after showing an error
     *      dialog to the user).
     */
    function _doRevert(doc, suppressError) {
        var result = new $.Deferred();

        FileUtils.readAsText(doc.file)
            .done(function (text, readTimestamp) {
                doc.refreshText(text, readTimestamp);
                result.resolve();
            })
            .fail(function (error) {
                if (suppressError) {
                    result.resolve();
                } else {
                    showFileOpenError(error, doc.file.fullPath)
                        .done(function () {
                            result.reject(error);
                        });
                }
            });

        return result.promise();
    }

    /**
     * Dispatches the app quit cancelled event
     */
    function dispatchAppQuitCancelledEvent() {
        exports.trigger(exports.APP_QUIT_CANCELLED);
    }


    /**
     * Opens the native OS save as dialog and saves document.
     * The original document is reverted in case it was dirty.
     * Text selection and cursor position from the original document
     * are preserved in the new document.
     * When saving to the original document the document is saved as if save was called.
     * @param {Document} doc
     * @param {?{cursorPos:!Object, selection:!Object, scrollPos:!Object}} settings - properties of
     *      the original document's editor that need to be carried over to the new document
     *      i.e. scrollPos, cursorPos and text selection
     * @return {$.Promise} a promise that is resolved with the saved document's File. Rejected in
     *   case of IO error (after error dialog dismissed), or if the Save dialog was canceled.
     */
    function _doSaveAs(doc, settings) {
        var origPath,
            saveAsDefaultPath,
            defaultName,
            result = new $.Deferred();

        function _doSaveAfterSaveDialog(path) {
            var newFile;

            // Reconstruct old doc's editor's view state, & finally resolve overall promise
            function _configureEditorAndResolve() {
                var editor = EditorManager.getActiveEditor();
                if (editor) {
                    if (settings) {
                        editor.setSelections(settings.selections);
                        editor.setScrollPos(settings.scrollPos.x, settings.scrollPos.y);
                    }
                }
                result.resolve(newFile);
            }

            // Replace old document with new one in open editor & workingset
            function openNewFile() {
                var fileOpenPromise;

                if (FileViewController.getFileSelectionFocus() === FileViewController.PROJECT_MANAGER) {
                    // If selection is in the tree, leave workingset unchanged - even if orig file is in the list
                    setTimeout(()=>{
                        fileOpenPromise = FileViewController
                            .openAndSelectDocument(path, FileViewController.PROJECT_MANAGER);
                        // always configure editor after file is opened
                        fileOpenPromise.always(function () {
                            _configureEditorAndResolve();
                        });
                    }, 100); // this is in a timeout as the file tree may not have updated yet after save as
                    // file created, and we wait for the file watcher events to get triggered so that the file
                    // selection is updated.
                } else {
                    // If selection is in workingset, replace orig item in place with the new file
                    var info = MainViewManager.findInAllWorkingSets(doc.file.fullPath).shift();

                    // Remove old file from workingset; no redraw yet since there's a pause before the new file is opened
                    MainViewManager._removeView(info.paneId, doc.file, true);

                    // Add new file to workingset, and ensure we now redraw (even if index hasn't changed)
                    fileOpenPromise = handleFileAddToWorkingSetAndOpen({fullPath: path, paneId: info.paneId, index: info.index, forceRedraw: true});
                    // always configure editor after file is opened
                    fileOpenPromise.always(function () {
                        _configureEditorAndResolve();
                    });
                }
            }

            // Same name as before - just do a regular Save
            if (path === origPath) {
                doSave(doc).then(result.resolve, result.reject);
                return;
            }

            doc.isSaving = true;    // mark that we're saving the document

            // First, write document's current text to new file
            if (doc.file._encoding && doc.file._encoding !== "UTF-8") {
                const encoding = PreferencesManager.getViewState("encoding", PreferencesManager.STATE_PROJECT_CONTEXT);
                encoding[path] = doc.file._encoding;
                PreferencesManager.setViewState("encoding", encoding, PreferencesManager.STATE_PROJECT_CONTEXT);
            }
            newFile = FileSystem.getFileForPath(path);
            newFile._encoding = doc.file._encoding;

            // Save as warns you when you're about to overwrite a file, so we
            // explicitly allow "blind" writes to the filesystem in this case,
            // ignoring warnings about the contents being modified outside of
            // the editor.
            FileUtils.writeText(newFile, doc.getText(true), true)
                .done(function () {
                    // If there were unsaved changes before Save As, they don't stay with the old
                    // file anymore - so must revert the old doc to match disk content.
                    // Only do this if the doc was dirty: _doRevert on a file that is not dirty and
                    // not in the workingset has the side effect of adding it to the workingset.
                    if (doc.isDirty && !(doc.isUntitled())) {
                        // if the file is dirty it must be in the workingset
                        // _doRevert is side effect free in this case
                        _doRevert(doc).always(openNewFile);
                    } else {
                        openNewFile();
                    }
                    _fileSavedMetrics(doc);
                })
                .fail(function (error) {
                    _showSaveFileError(error, path)
                        .done(function () {
                            result.reject(error);
                        });
                })
                .always(function () {
                    // mark that we're done saving the document
                    doc.isSaving = false;
                });
        }

        if (doc) {
            origPath = doc.file.fullPath;
            // If the document is an untitled document, we should default to project root.
            if (doc.isUntitled()) {
                // (Issue #4489) if we're saving an untitled document, go ahead and switch to this document
                //   in the editor, so that if we're, for example, saving several files (ie. Save All),
                //   then the user can visually tell which document we're currently prompting them to save.
                var info = MainViewManager.findInAllWorkingSets(origPath).shift();

                if (info) {
                    MainViewManager._open(info.paneId, doc.file);
                }

                // If the document is untitled, default to project root.
                saveAsDefaultPath = ProjectManager.getProjectRoot().fullPath;
            } else {
                saveAsDefaultPath = FileUtils.getDirectoryPath(origPath);
            }
            defaultName = FileUtils.getBaseName(origPath);
            var file = FileSystem.getFileForPath(origPath);
            if (file instanceof InMemoryFile) {
                var language = LanguageManager.getLanguageForPath(origPath);
                if (language) {
                    var fileExtensions = language.getFileExtensions();
                    if (fileExtensions && fileExtensions.length > 0) {
                        defaultName += "." + fileExtensions[0];
                    }
                }
            }
            FileSystem.showSaveDialog(Strings.SAVE_FILE_AS, saveAsDefaultPath, defaultName, function (err, selectedPath) {
                if (!err) {
                    if (selectedPath) {
                        _doSaveAfterSaveDialog(selectedPath);
                    } else {
                        dispatchAppQuitCancelledEvent();
                        result.reject(USER_CANCELED);
                    }
                } else {
                    result.reject(err);
                }
            });
        } else {
            result.reject();
        }
        return result.promise();
    }

    /**
     * Saves the given file. If no file specified, assumes the current document.
     * @param {?{doc: ?Document}} commandData  Document to close, or null
     * @return {$.Promise} resolved with the saved document's File (which MAY DIFFER from the doc
     *   passed in, if the doc was untitled). Rejected in case of IO error (after error dialog
     *   dismissed), or if doc was untitled and the Save dialog was canceled (will be rejected with
     *   USER_CANCELED object).
     */
    function handleFileSave(commandData) {
        var activeEditor = EditorManager.getActiveEditor(),
            activeDoc = activeEditor && activeEditor.document,
            doc = (commandData && commandData.doc) || activeDoc,
            settings;

        if (doc && !doc.isSaving) {
            if (doc.isUntitled()) {
                if (doc === activeDoc) {
                    settings = {
                        selections: activeEditor.getSelections(),
                        scrollPos: activeEditor.getScrollPos()
                    };
                }

                return _doSaveAs(doc, settings);
            }
            return doSave(doc);

        }

        return $.Deferred().reject().promise();
    }

    /**
     * Saves all unsaved documents corresponding to 'fileList'. Returns a Promise that will be resolved
     * once ALL the save operations have been completed. If ANY save operation fails, an error dialog is
     * immediately shown but after dismissing we continue saving the other files; after all files have
     * been processed, the Promise is rejected if any ONE save operation failed (the error given is the
     * first one encountered). If the user cancels any Save As dialog (for untitled files), the
     * Promise is immediately rejected.
     *
     * @param {!Array.<File>} fileList
     * @return {!$.Promise} Resolved with {!Array.<File>}, which may differ from 'fileList'
     *      if any of the files were Unsaved documents. Or rejected with {?FileSystemError}.
     */
    function _saveFileList(fileList) {
        // Do in serial because doSave shows error UI for each file, and we don't want to stack
        // multiple dialogs on top of each other
        var userCanceled = false,
            filesAfterSave = [];

        return Async.doSequentially(
            fileList,
            function (file) {
                // Abort remaining saves if user canceled any Save As dialog
                if (userCanceled) {
                    return (new $.Deferred()).reject().promise();
                }

                var doc = DocumentManager.getOpenDocumentForPath(file.fullPath);
                if (doc) {
                    var savePromise = handleFileSave({doc: doc});
                    savePromise
                        .done(function (newFile) {
                            filesAfterSave.push(newFile);
                        })
                        .fail(function (error) {
                            if (error === USER_CANCELED) {
                                userCanceled = true;
                            }
                        });
                    return savePromise;
                }
                    // workingset entry that was never actually opened - ignore
                filesAfterSave.push(file);
                return (new $.Deferred()).resolve().promise();

            },
            false  // if any save fails, continue trying to save other files anyway; then reject at end
        ).then(function () {
            return filesAfterSave;
        });
    }

    /**
     * Saves all unsaved documents. See _saveFileList() for details on the semantics.
     * @return {$.Promise}
     */
    function saveAll() {
        return _saveFileList(MainViewManager.getWorkingSet(MainViewManager.ALL_PANES));
    }

    /**
     * Prompts user with save as dialog and saves document.
     * @return {$.Promise} a promise that is resolved once the save has been completed
     */
    handleFileSaveAs = function (commandData) {
        // Default to current document if doc is null
        var doc = null,
            settings;

        if (commandData) {
            doc = commandData.doc;
        } else {
            var activeEditor = EditorManager.getActiveEditor();
            if (activeEditor) {
                doc = activeEditor.document;
                settings = {};
                settings.selections = activeEditor.getSelections();
                settings.scrollPos = activeEditor.getScrollPos();
            }
        }

        // doc may still be null, e.g. if no editors are open, but _doSaveAs() does a null check on
        // doc.
        return _doSaveAs(doc, settings);
    };

    /**
     * Saves all unsaved documents.
     * @return {$.Promise} a promise that is resolved once ALL the saves have been completed; or rejected
     *      after all operations completed if any ONE of them failed.
     */
    function handleFileSaveAll() {
        return saveAll();
    }

    let closedFilesHistory = new Map();

    function _enableOrDisableReopenClosedCmd() {
        CommandManager.get(Commands.FILE_REOPEN_CLOSED).setEnabled(!!closedFilesHistory.size);
    }

    function _addToClosedFilesHistory(filePath, paneID) {
        closedFilesHistory.set(filePath, {paneID, closeTime: Date.now()});
        _enableOrDisableReopenClosedCmd();
    }

    function handleReopenClosed() {
        // find the file that was most recently closed
        let leastRecentlyClosedPath, leastRecentlyClosedTime, paneToUse;
        for(let closedFilePath of closedFilesHistory.keys()){
            const currentScan = closedFilesHistory.get(closedFilePath);
            if(!leastRecentlyClosedPath || leastRecentlyClosedTime < currentScan.closeTime) {
                leastRecentlyClosedPath = closedFilePath;
                leastRecentlyClosedTime = currentScan.closeTime;
                paneToUse = currentScan.paneID;
            }
        }
        if(leastRecentlyClosedPath) {
            closedFilesHistory.delete(leastRecentlyClosedPath);
            if(MainViewManager.getPaneCount() === 1) {
                paneToUse = MainViewManager.ACTIVE_PANE;
            }
            _enableOrDisableReopenClosedCmd();
            return FileViewController.openFileAndAddToWorkingSet(leastRecentlyClosedPath, paneToUse);
        }
        _enableOrDisableReopenClosedCmd();
    }

    /**
     * Closes the specified file: removes it from the workingset, and closes the main editor if one
     * is open. Prompts user about saving changes first, if document is dirty.
     *
     * @param {?{file: File, promptOnly:boolean}} commandData  Optional bag of arguments:
     *      file - File to close; assumes the current document if not specified.
     *      promptOnly - If true, only displays the relevant confirmation UI and does NOT actually
     *          close the document. This is useful when chaining file-close together with other user
     *          prompts that may be cancelable.
     *      _forceClose - If true, closes the document without prompting even if there are unsaved
     *          changes. Only for use in unit tests.
     * @return {$.Promise} a promise that is resolved when the file is closed, or if no file is open.
     *      FUTURE: should we reject the promise if no file is open?
     */
    function handleFileClose(commandData) {
        var file,
            promptOnly,
            _forceClose,
            _spawnedRequest,
            paneId = MainViewManager.ACTIVE_PANE,
            activePaneID = MainViewManager.getActivePaneId();

        if (commandData) {
            file        = commandData.file;
            promptOnly  = commandData.promptOnly;
            _forceClose = commandData._forceClose;
            paneId      = commandData.paneId || paneId;
            _spawnedRequest = commandData.spawnedRequest || false;
        }

        // utility function for handleFileClose: closes document & removes from workingset
        function doClose(file) {
            if (!promptOnly) {
                MainViewManager._close(paneId, file);
                let paneClosing = paneId;
                if(paneId === MainViewManager.ACTIVE_PANE){
                    paneClosing = activePaneID;
                }
                _addToClosedFilesHistory(file.fullPath, paneClosing);
                _fileClosed(file);
            }
        }

        var result = new $.Deferred(), promise = result.promise();

        // Default to current document if doc is null
        if (!file) {
            file = MainViewManager.getCurrentlyViewedFile(MainViewManager.ACTIVE_PANE);
        }

        // No-op if called when nothing is open; TODO: (issue #273) should command be grayed out instead?
        if (!file) {
            result.resolve();
            return promise;
        }

        var doc = DocumentManager.getOpenDocumentForPath(file.fullPath);

        if (doc && doc.isDirty && !_forceClose && (MainViewManager.isExclusiveToPane(doc.file, paneId) || _spawnedRequest)) {
            // Document is dirty: prompt to save changes before closing if only the document is exclusively
            // listed in the requested pane or this is part of a list close request
            var filename = FileUtils.getBaseName(doc.file.fullPath);

            Dialogs.showModalDialog(
                DefaultDialogs.DIALOG_ID_SAVE_CLOSE,
                Strings.SAVE_CLOSE_TITLE,
                StringUtils.format(
                    Strings.SAVE_CLOSE_MESSAGE,
                    StringUtils.breakableUrl(filename)
                ),
                [
                    {
                        className: Dialogs.DIALOG_BTN_CLASS_LEFT,
                        id: Dialogs.DIALOG_BTN_DONTSAVE,
                        text: Strings.DONT_SAVE
                    },
                    {
                        className: Dialogs.DIALOG_BTN_CLASS_NORMAL,
                        id: Dialogs.DIALOG_BTN_CANCEL,
                        text: Strings.CANCEL
                    },
                    {
                        className: Dialogs.DIALOG_BTN_CLASS_PRIMARY,
                        id: Dialogs.DIALOG_BTN_OK,
                        text: Strings.SAVE
                    }
                ]
            )
                .done(function (id) {
                    if (id === Dialogs.DIALOG_BTN_CANCEL) {
                        dispatchAppQuitCancelledEvent();
                        result.reject();
                    } else if (id === Dialogs.DIALOG_BTN_OK) {
                        // "Save" case: wait until we confirm save has succeeded before closing
                        handleFileSave({doc: doc})
                            .done(function (newFile) {
                                doClose(newFile);
                                result.resolve();
                            })
                            .fail(function () {
                                result.reject();
                            });
                    } else {
                        // "Don't Save" case: even though we're closing the main editor, other views of
                        // the Document may remain in the UI. So we need to revert the Document to a clean
                        // copy of whatever's on disk.
                        doClose(file);

                        // Only reload from disk if we've executed the Close for real.
                        if (promptOnly) {
                            result.resolve();
                        } else {
                            // Even if there are no listeners attached to the document at this point, we want
                            // to do the revert anyway, because clients who are listening to the global documentChange
                            // event from the Document module (rather than attaching to the document directly),
                            // such as the Find in Files panel, should get a change event. However, in that case,
                            // we want to ignore errors during the revert, since we don't want a failed revert
                            // to throw a dialog if the document isn't actually open in the UI.
                            var suppressError = !DocumentManager.getOpenDocumentForPath(file.fullPath);
                            _doRevert(doc, suppressError)
                                .then(result.resolve, result.reject);
                        }
                    }
                });
            result.always(function () {
                MainViewManager.focusActivePane();
            });
        } else {
            // File is not open, or IS open but Document not dirty: close immediately
            doClose(file);
            MainViewManager.focusActivePane();
            result.resolve();
        }
        return promise;
    }

    /**
     * @param {!Array.<File>} list - the list of files to close
     * @param {boolean} promptOnly - true to just prompt for saving documents with actually closing them.
     * @param {boolean} _forceClose Whether to force all the documents to close even if they have unsaved changes. For unit testing only.
     * @return {jQuery.Promise} promise that is resolved or rejected when the function finishes.
     */
    function _closeList(list, promptOnly, _forceClose) {
        var result      = new $.Deferred(),
            unsavedDocs = [];

        list.forEach(function (file) {
            var doc = DocumentManager.getOpenDocumentForPath(file.fullPath);
            if (doc && doc.isDirty) {
                unsavedDocs.push(doc);
            }
        });

        if (unsavedDocs.length === 0 || _forceClose) {
            // No unsaved changes or we want to ignore them, so we can proceed without a prompt
            result.resolve();

        } else if (unsavedDocs.length === 1) {
            // Only one unsaved file: show the usual single-file-close confirmation UI
            var fileCloseArgs = { file: unsavedDocs[0].file, promptOnly: promptOnly, spawnedRequest: true };

            handleFileClose(fileCloseArgs).done(function () {
                // still need to close any other, non-unsaved documents
                result.resolve();
            }).fail(function () {
                result.reject();
            });

        } else {
            // Multiple unsaved files: show a single bulk prompt listing all files
            var message = Strings.SAVE_CLOSE_MULTI_MESSAGE + FileUtils.makeDialogFileList(_.map(unsavedDocs, _shortTitleForDocument));

            Dialogs.showModalDialog(
                DefaultDialogs.DIALOG_ID_SAVE_CLOSE,
                Strings.SAVE_CLOSE_TITLE,
                message,
                [
                    {
                        className: Dialogs.DIALOG_BTN_CLASS_LEFT,
                        id: Dialogs.DIALOG_BTN_DONTSAVE,
                        text: Strings.DONT_SAVE
                    },
                    {
                        className: Dialogs.DIALOG_BTN_CLASS_NORMAL,
                        id: Dialogs.DIALOG_BTN_CANCEL,
                        text: Strings.CANCEL
                    },
                    {
                        className: Dialogs.DIALOG_BTN_CLASS_PRIMARY,
                        id: Dialogs.DIALOG_BTN_OK,
                        text: Strings.SAVE
                    }
                ]
            )
                .done(function (id) {
                    if (id === Dialogs.DIALOG_BTN_CANCEL) {
                        dispatchAppQuitCancelledEvent();
                        result.reject();
                    } else if (id === Dialogs.DIALOG_BTN_OK) {
                        // Save all unsaved files, then if that succeeds, close all
                        _saveFileList(list).done(function (listAfterSave) {
                            // List of files after save may be different, if any were Untitled
                            result.resolve(listAfterSave);
                        }).fail(function () {
                            result.reject();
                        });
                    } else {
                        // "Don't Save" case--we can just go ahead and close all files.
                        result.resolve();
                    }
                });
        }

        // If all the unsaved-changes confirmations pan out above, then go ahead & close all editors
        // NOTE: this still happens before any done() handlers added by our caller, because jQ
        // guarantees that handlers run in the order they are added.
        result.done(function (listAfterSave) {
            listAfterSave = listAfterSave || list;
            if (!promptOnly) {
                MainViewManager._closeList(MainViewManager.ALL_PANES, listAfterSave);
            }
        });

        return result.promise();
    }

    /**
     * Closes all open files; equivalent to calling handleFileClose() for each document, except
     * that unsaved changes are confirmed once, in bulk.
     * @param {?{promptOnly: boolean, _forceClose: boolean}}
     *          If promptOnly is true, only displays the relevant confirmation UI and does NOT
     *          actually close any documents. This is useful when chaining close-all together with
     *          other user prompts that may be cancelable.
     *          If _forceClose is true, forces the files to close with no confirmation even if dirty.
     *          Should only be used for unit test cleanup.
     * @return {$.Promise} a promise that is resolved when all files are closed
     */
    function handleFileCloseAll(commandData) {
        return _closeList(MainViewManager.getAllOpenFiles(),
                                    (commandData && commandData.promptOnly), (commandData && commandData._forceClose));
    }


    /**
     * Closes a list of open files; equivalent to calling handleFileClose() for each document, except
     * that unsaved changes are confirmed once, in bulk.
     * @param {?{promptOnly: boolean, _forceClose: boolean}}
     *          If promptOnly is true, only displays the relevant confirmation UI and does NOT
     *          actually close any documents. This is useful when chaining close-all together with
     *          other user prompts that may be cancelable.
     *          If _forceClose is true, forces the files to close with no confirmation even if dirty.
     *          Should only be used for unit test cleanup.
     * @return {$.Promise} a promise that is resolved when all files are closed
     */
    function handleFileCloseList(commandData) {
        return _closeList(commandData.fileList);
    }

    /**
     * @private - tracks our closing state if we get called again
     */
    var _windowGoingAway = false;
    let exitWaitPromises = [];

    /**
     * @private
     * Common implementation for close/quit/reload which all mostly
     * the same except for the final step
     * @param {Object} commandData - (not referenced)
     * @param {!function()} postCloseHandler - called after close
     * @param {!function()} failHandler - called when the save fails to cancel closing the window
     */
    function _handleWindowGoingAway(commandData, postCloseHandler, failHandler) {
        if (_windowGoingAway) {
            //if we get called back while we're closing, then just return
            return (new $.Deferred()).reject().promise();
        }
        Metrics.flushMetrics();

        return CommandManager.execute(Commands.FILE_CLOSE_ALL, { promptOnly: true })
            .done(function () {
                exitWaitPromises = [];
                _windowGoingAway = true;

                // Give everyone a chance to save their state - but don't let any problems block
                // us from quitting
                try {
                    // if someone wats to do any deferred tasks, they should add
                    // their promise to the wait promises list.
                    ProjectManager.trigger("beforeAppClose", exitWaitPromises);
                } catch (ex) {
                    console.error(ex);
                }

                postCloseHandler();
            })
            .fail(function () {
                _windowGoingAway = false;
                if (failHandler) {
                    failHandler();
                }
            });
    }

    /**
     * @private
     * Implementation for abortQuit callback to reset quit sequence settings
     */
    function handleAbortQuit() {
        _windowGoingAway = false;
    }

    /**
     * @private
     * Implementation for native APP_BEFORE_MENUPOPUP callback to trigger beforeMenuPopup event
     */
    function handleBeforeMenuPopup() {
        PopUpManager.trigger("beforeMenuPopup");
    }

    /**
     * Confirms any unsaved changes, then closes the window
     * @param {Object} commandData data
     */
    function handleFileCloseWindow(commandData) {
        _forceQuitIfNeeded();
        return _handleWindowGoingAway(
            commandData,
            function (closeSuccess) {
                console.log('close success: ', closeSuccess);
                raceAgainstTime(window.PhStore.flushDB())
                    .finally(()=>{
                        raceAgainstTime(_safeNodeTerminate())
                            .finally(()=>{
                                Phoenix.app.closeWindow();
                            });
                    });
            },
            function (err) {
                console.error("Quit failed! ", err);
            }
        );
    }

    function newPhoenixWindow(cliArgsArray = null, cwd=null) {
        let width = window.innerWidth;
        let height = window.innerHeight;
        Phoenix.app.openNewPhoenixEditorWindow(width, height, cliArgsArray, cwd);
    }

    async function _fileExists(fullPath) {
        try {
            const {entry} = await FileSystem.resolveAsync(fullPath);
            return entry.isFile;
        } catch (e) {
            return false;
        }
    }

    async function _tryToOpenFile(absOrRelativePath, cwdIfRelativePath) {
        try{
            let fileToOpen;
            if(cwdIfRelativePath){
                fileToOpen = window.path.join(Phoenix.VFS.getTauriVirtualPath(cwdIfRelativePath), absOrRelativePath);
            } else {
                fileToOpen = Phoenix.VFS.getTauriVirtualPath(absOrRelativePath);
            }
            let isFile = await _fileExists(fileToOpen);
            if(isFile){
                await jsPromise(FileViewController.openFileAndAddToWorkingSet(fileToOpen));
                return true;
            }
        } catch (e) {
            console.warn("Opening file failed ", absOrRelativePath, e);
        }
        return false;
    }

    async function _openFilesPassedInFromCLI(args=null, cwd="") {
        if(!args){
            const cliArgs= await Phoenix.app.getCommandLineArgs();
            args = cliArgs && cliArgs.args;
            cwd = cliArgs && cliArgs.cwd;
        }
        if(!args || args.length <= 1){
            return;
        }

        let openCount = 0;
        for(let i=1; i<args.length; i++) { // the first arg is the executable path itself, ignore that
            const fileArg = args[i];
            let isOpened = await _tryToOpenFile(fileArg);
            if(!isOpened){
                // if here, then, this maybe a relative file path or not a file at all. check if relative path
                await _tryToOpenFile(fileArg, cwd);
            }
            if(isOpened){
                openCount++;
            }
        }
        if(openCount){
            exports.trigger(_EVENT_OPEN_WITH_FILE_FROM_OS);
            _filesOpenedFromOsCount++;
            Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, 'openWith', "file", openCount);
        }
    }

    async function _safeCheckFileAndGetVirtualPath(absOrRelativePath, relativeToDir=null) {
        try{
            let fileToCheck;
            if(!relativeToDir){
                fileToCheck = Phoenix.VFS.getTauriVirtualPath(absOrRelativePath);
                const fileExists = await _fileExists(fileToCheck);
                if(fileExists){
                    return fileToCheck;
                }
            } else {
                fileToCheck = window.path.join(Phoenix.VFS.getTauriVirtualPath(relativeToDir), absOrRelativePath);
                const fileExists = await _fileExists(fileToCheck);
                if(fileExists){
                    return fileToCheck;
                }
            }
        } catch (e) {
            console.warn("error opening folder at path", absOrRelativePath, relativeToDir);
        }
        return null;
    }

    async function _singleInstanceHandler(args, cwd) {
        const isPrimary = await Phoenix.app.isPrimaryDesktopPhoenixWindow();
        if(!isPrimary){
            // only primary phoenix windows can open a new window, else every window is going to make its own
            // window and cause a runaway phoenix window explosion.
            return;
        }
        if(args.length > 1) {
            // check if the second arg is a file, if so we just open it and the remaining files in this window
            let fileToOpen = await _safeCheckFileAndGetVirtualPath(args[1]);
            if(!fileToOpen){
                // maybe relative path?
                fileToOpen = await _safeCheckFileAndGetVirtualPath(args[1], cwd);
            }
            if(fileToOpen) {
                Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, 'openWith', "file");
                await _openFilesPassedInFromCLI(args, cwd);
                await Phoenix.app.focusWindow();
                return;
            }
        }
        newPhoenixWindow(args, cwd);
    }

    function handleFileNewWindow() {
        newPhoenixWindow([]);
    }

    /** Show a textfield to rename whatever is currently selected in the sidebar (or current doc if nothing else selected) */
    function handleFileRename() {
        // Prefer selected sidebar item (which could be a folder)
        var entry = ProjectManager.getContext();
        if (!entry) {
            // Else use current file (not selected in ProjectManager if not visible in tree or workingset)
            entry = MainViewManager.getCurrentlyViewedFile();
        }
        if (entry) {
            ProjectManager.renameItemInline(entry);
        }
    }


    /** Are we already listening for a keyup to call detectDocumentNavEnd()? */
    var _addedNavKeyHandler = false;

    /**
     * When the Ctrl key is released, if we were in the middle of a next/prev document navigation
     * sequence, now is the time to end it and update the MRU order. If we allowed the order to update
     * on every next/prev increment, the 1st & 2nd entries would just switch places forever and we'd
     * never get further down the list.
     * @param {jQueryEvent} event Key-up event
     */
    function detectDocumentNavEnd(event) {
        if (event.keyCode === KeyEvent.DOM_VK_CONTROL) {  // Ctrl key
            MainViewManager.endTraversal();
            _addedNavKeyHandler = false;
            $(window.document.body).off("keyup", detectDocumentNavEnd);
        }
    }

    /**
     * Navigate to the next/previous (MRU or list order) document. Don't update MRU order yet
     * @param {!number} inc Delta indicating in which direction we're going
     * @param {?boolean} listOrder Whether to navigate using MRU or list order. Defaults to MRU order
     */
    function goNextPrevDoc(inc, listOrder) {
        var result;
        if (listOrder) {
            result = MainViewManager.traverseToNextViewInListOrder(inc);
        } else {
            result = MainViewManager.traverseToNextViewByMRU(inc);
        }

        if (result) {
            var file = result.file,
                paneId = result.paneId;

            MainViewManager.beginTraversal();
            CommandManager.execute(Commands.FILE_OPEN, {fullPath: file.fullPath,
                paneId: paneId });

            // Listen for ending of Ctrl+Tab sequence
            if (!_addedNavKeyHandler) {
                _addedNavKeyHandler = true;
                $(window.document.body).keyup(detectDocumentNavEnd);
            }
        }
    }

    /** Next Doc command handler (MRU order) **/
    function handleGoNextDoc() {
        goNextPrevDoc(+1);
    }

    /** Previous Doc command handler (MRU order) **/
    function handleGoPrevDoc() {
        goNextPrevDoc(-1);
    }

    /** Next Doc command handler (list order) **/
    function handleGoNextDocListOrder() {
        goNextPrevDoc(+1, true);
    }

    /** Previous Doc command handler (list order) **/
    function handleGoPrevDocListOrder() {
        goNextPrevDoc(-1, true);
    }

    /** Show in File Tree command handler **/
    function handleShowInTree() {
        let activeFile = MainViewManager.getCurrentlyViewedFile(MainViewManager.ACTIVE_PANE);
        if(activeFile){
            ProjectManager.showInTree(activeFile);
        }
    }

    function _getDeleteMessageTemplate(isFile, canMoveToTrash) {
        if(!Phoenix.isNativeApp || !canMoveToTrash){
            return isFile ? Strings.CONFIRM_FILE_DELETE : Strings.CONFIRM_FOLDER_DELETE;
        }
        if(Phoenix.platform === "win") {
            return isFile ? Strings.CONFIRM_FILE_DELETE_RECYCLE_BIN : Strings.CONFIRM_FOLDER_DELETE_RECYCLE_BIN;
        }
        return isFile ? Strings.CONFIRM_FILE_DELETE_TRASH : Strings.CONFIRM_FOLDER_DELETE_TRASH;
    }

    function _getDeleteButtonString(canMoveToTrash) {
        if(!Phoenix.isNativeApp || !canMoveToTrash){
            return Strings.DELETE;
        }
        if(Phoenix.platform === "win") {
            return Strings.MOVE_TO_RECYCLE_BIN;
        }
        return Strings.MOVE_TO_TRASH;
    }

    /** Delete file command handler
     *
     * @param {{file: File}} [commandData]  Optional bag of arguments:
     *      file - File to delete; assumes the current document if not specified.
     *  **/
    function handleFileDelete(commandData={}) {
        const entry = commandData.file || ProjectManager.getSelectedItem();
        const canMoveToTrash = Phoenix.app.canMoveToTrash(entry.fullPath);
        Dialogs.showModalDialog(
            DefaultDialogs.DIALOG_ID_EXT_DELETED,
            Strings.CONFIRM_DELETE_TITLE,
            StringUtils.format(
                _getDeleteMessageTemplate(entry.isFile, canMoveToTrash),
                StringUtils.breakableUrl(ProjectManager.getProjectRelativePath(entry.fullPath))
            ),
            [
                {
                    className: Dialogs.DIALOG_BTN_CLASS_NORMAL,
                    id: Dialogs.DIALOG_BTN_CANCEL,
                    text: Strings.CANCEL
                },
                {
                    className: Dialogs.DIALOG_BTN_CLASS_PRIMARY,
                    id: Dialogs.DIALOG_BTN_OK,
                    text: _getDeleteButtonString(canMoveToTrash)
                }
            ]
        )
            .done(function (id) {
                if (id === Dialogs.DIALOG_BTN_OK) {
                    if(Phoenix.isNativeApp && canMoveToTrash) {
                        ProjectManager.moveToTrash(entry);
                        return;
                    }
                    ProjectManager.deleteItem(entry);
                }
            });
    }

    /** Show the selected sidebar (tree or workingset) item in Finder/Explorer */
    function handleShowInOS() {
        var entry = ProjectManager.getSelectedItem();
        if (entry) {
            brackets.app.openPathInFileBrowser(entry.fullPath)
                .catch(err=>console.error("Error showing '" + entry.fullPath + "' in OS folder:", err));
        } else {
            brackets.app.openPathInFileBrowser(ProjectManager.getProjectRoot().fullPath)
                .catch(err=>console.error("Error showing '" + ProjectManager.getProjectRoot().fullPath + "' in OS folder:", err));
        }
    }

    function openDefaultTerminal() {
        const entry = ProjectManager.getSelectedItem();
        if (entry && entry.fullPath) {
            NodeUtils.openNativeTerminal(entry.fullPath);
        } else {
            NodeUtils.openNativeTerminal(ProjectManager.getProjectRoot().fullPath);
        }
    }

    function openPowerShell() {
        const entry = ProjectManager.getSelectedItem();
        if (entry && entry.fullPath) {
            NodeUtils.openNativeTerminal(entry.fullPath, true);
        } else {
            NodeUtils.openNativeTerminal(ProjectManager.getProjectRoot().fullPath, true);
        }
    }

    function openDefaultApp() {
        const entry = ProjectManager.getSelectedItem();
        if (entry && entry.fullPath) {
            NodeUtils.openInDefaultApp(entry.fullPath);
        } else {
            NodeUtils.openInDefaultApp(ProjectManager.getProjectRoot().fullPath);
        }
    }

    function raceAgainstTime(promise, timeout = 2000) {
        const timeoutPromise = new Promise((_resolve, reject) => {
            setTimeout(() => {
                reject(new Error(`Timed out after ${timeout} seconds`));
            }, timeout);
        });

        return Promise.race([promise, timeoutPromise]);
    }

    /**
    * Does a full reload of the browser window
    * @param {string} href The url to reload into the window
    */
    function browserReload(href) {
        if (_isReloading) {
            return;
        }

        _isReloading = true;

        return CommandManager.execute(Commands.FILE_CLOSE_ALL, { promptOnly: true }).done(function () {
            exitWaitPromises = [];
            // Give everyone a chance to save their state - but don't let any problems block
            // us from quitting
            try {
                // if someone wats to do any deferred tasks, they should add
                // their promise to the wait promises list.
                ProjectManager.trigger("beforeAppClose", exitWaitPromises);
            } catch (ex) {
                console.error(ex);
            }

            // Remove all menus to assure every part of Brackets is reloaded
            _.forEach(Menus.getAllMenus(), function (value, key) {
                Menus.removeMenu(key);
            });

            // If there's a fragment in both URLs, setting location.href won't actually reload
            var fragment = href.indexOf("#");
            if (fragment !== -1) {
                href = href.substr(0, fragment);
            }

            // Defer for a more successful reload - issue #11539
            window.setTimeout(function () {
                exitWaitPromises.push(window.PhStore.flushDB());
                raceAgainstTime(Promise.all(exitWaitPromises)) // wither wait for flush or time this out
                    .finally(()=>{
                        raceAgainstTime(_safeNodeTerminate(), 4000)
                            .finally(()=>{
                                _resetTauriTrustRingBeforeRestart();
                                // we do not wait/raceAgainstTime here purposefully to prevent attacks that will rely
                                // on this brief window of no trust zone in while the kernal trust key is being reset.
                                window.location.href = href;
                            });
                    });
            }, 1000);
        }).fail(function () {
            _isReloading = false;
        });
    }

    /**
     * Restarts brackets Handler
     * @param {boolean=} loadWithoutExtensions - true to restart without extensions,
     *                                           otherwise extensions are loadeed as it is durning a typical boot
     * @param {Array<String>|string} loadDevExtensionPath If specified, will load the extension from the path. IF
     * and empty array is specified, it will unload all dev extensions on reload.
     */
    function handleReload(loadWithoutExtensions=false, loadDevExtensionPath=[]) {
        var href    = window.location.href,
            params  = new UrlParams();

        // Make sure the Reload Without User Extensions parameter is removed
        params.parse();

        function _removeLoadDevExtensionPathParam() {
            if (params.get("loadDevExtensionPath")) {
                params.remove("loadDevExtensionPath");
                // only remove logging flag if the flag is set for loadDevExtensionPath
                if (params.get(logger.loggingOptions.LOCAL_STORAGE_KEYS.LOG_TO_CONSOLE_KEY)) {
                    params.remove(logger.loggingOptions.LOCAL_STORAGE_KEYS.LOG_TO_CONSOLE_KEY);
                }
            }
        }

        if (loadWithoutExtensions) {
            if (!params.get("reloadWithoutUserExts")) {
                params.put("reloadWithoutUserExts", true);
            }
            _removeLoadDevExtensionPathParam();
        } else {
            if (params.get("reloadWithoutUserExts")) {
                params.remove("reloadWithoutUserExts");
            }
            if(loadDevExtensionPath && loadDevExtensionPath.length){
                params.put("loadDevExtensionPath", loadDevExtensionPath);
                // since we are loading a development extension, we have to enable detailed logs too on reload
                params.put(logger.loggingOptions.LOCAL_STORAGE_KEYS.LOG_TO_CONSOLE_KEY, "true");
            } else if (loadDevExtensionPath && loadDevExtensionPath.length === 0) {
                _removeLoadDevExtensionPathParam();
            }
        }

        if (href.indexOf("?") !== -1) {
            href = href.substring(0, href.indexOf("?"));
        }

        if (!params.isEmpty()) {
            href += "?" + params.toString();
        }

        // Give Mac native menus extra time to update shortcut highlighting.
        // Prevents the menu highlighting from getting messed up after reload.
        window.setTimeout(function () {
            browserReload(href);
        }, 100);
    }

    /** Reload Without Extensions commnad handler **/
    var handleReloadWithoutExts = _.partial(handleReload, true);

    /**
     * Attach a beforeunload handler to notify user about unsaved changes and URL redirection in CEF.
     * Prevents data loss in scenario reported under #13708
     * Make sure we don't attach this handler if the current window is actually a test window
    **/

    function attachBrowserUnloadHandler() {
        window.onbeforeunload = function(e) {
            PreferencesManager.setViewState("windowClosingTime", new Date().getTime());
            _handleWindowGoingAway(null, closeSuccess=>{
                console.log('close success: ', closeSuccess);
            }, closeFail=>{
                console.log('close fail: ', closeFail);
            });
            var openDocs = DocumentManager.getAllOpenDocuments();

            // Detect any unsaved changes
            openDocs = openDocs.filter(function(doc) {
                return doc && doc.isDirty;
            });

            // Ensure we are not in normal app-quit or reload workflow
            if (!_isReloading && !_windowGoingAway) {
                if (openDocs.length > 0) {
                    return Strings.WINDOW_UNLOAD_WARNING_WITH_UNSAVED_CHANGES;
                }
                return Strings.WINDOW_UNLOAD_WARNING;
            }
        };
    }

    async function _safeFlushDB() {
        // close should not be interrupted.
        try{
            await window.PhStore.flushDB();
        } catch (e) {
            console.error(e);
        }
    }

    let nodeTerminateDueToShutdown = false;
    async function _safeNodeTerminate() {
        // close should not be interrupted.
        nodeTerminateDueToShutdown = true;
        try{
            await NodeConnector.terminateNode();
        } catch (e) {
            console.error(e);
        }
    }
    if(window.nodeTerminationPromise) {
        window.nodeTerminationPromise
            .then(()=>{
                if(nodeTerminateDueToShutdown){
                    return; // normal shutdown
                }
                Metrics.countEvent(Metrics.EVENT_TYPE.NODEJS, 'crash', Phoenix.platform);
                window.fs.forceUseNodeWSEndpoint(false);
                Dialogs
                    .showErrorDialog(Strings.ERROR_NODE_JS_CRASH_TITLE, Strings.ERROR_NODE_JS_CRASH_MESSAGE)
                    .done(()=>{
                        handleReload();
                    });
            });
    }

    let closeInProgress;
    let closeClickCounter = 0;
    const CLOSE_TIMER_RESET_INTERVAL = 4000;
    let closeTimer = setTimeout(()=>{
        closeClickCounter = 0;
        closeTimer = null;
    }, CLOSE_TIMER_RESET_INTERVAL);

    function _forceQuitIfNeeded() {
        closeClickCounter++;
        if(closeTimer){
            clearTimeout(closeTimer);
        }
        closeTimer = setInterval(()=>{
            closeClickCounter = 0;
            closeTimer = null;
        }, CLOSE_TIMER_RESET_INTERVAL);
        if(closeClickCounter >= 2) {
            // the user clicked the close button 2 times in the last 4 secs, he's desperate, close the window now!.
            Phoenix.app.closeWindow(true);
        }
    }
    function attachTauriUnloadHandler() {
        window.__TAURI__.window.appWindow.onCloseRequested((event)=>{
            _forceQuitIfNeeded();
            if(closeInProgress){
                event.preventDefault();
                return;
            }
            closeInProgress = true;
            PreferencesManager.setViewState("windowClosingTime", new Date().getTime());
            event.preventDefault();
            _handleWindowGoingAway(null, closeSuccess=>{
                console.log('close success: ', closeSuccess);
                exitWaitPromises.push(_safeFlushDB());
                raceAgainstTime(Promise.all(exitWaitPromises))
                    .finally(()=>{
                        raceAgainstTime(_safeNodeTerminate())
                            .finally(()=>{
                                closeInProgress = false;
                                Phoenix.app.closeWindow();
                            });
                    });
            }, closeFail=>{
                console.log('close fail: ', closeFail);
                closeInProgress = false;
            });
        });
    }

    let isTestWindow = (new window.URLSearchParams(window.location.search || "")).get("testEnvironment");
    if (!isTestWindow) {
        if(Phoenix.isNativeApp) {
            attachTauriUnloadHandler();
        } else {
            attachBrowserUnloadHandler();
        }
    }

    /** Do some initialization when the DOM is ready **/
    AppInit.htmlReady(function () {
        // If in Reload Without User Extensions mode, update UI and log console message
        var params      = new UrlParams(),
            $icon       = $("#toolbar-extension-manager"),
            $indicator  = $("<div>" + Strings.STATUSBAR_USER_EXTENSIONS_DISABLED + "</div>");

        params.parse();

        if (params.get("reloadWithoutUserExts") === "true") {
            CommandManager.get(Commands.FILE_EXTENSION_MANAGER).setEnabled(false);
            $icon.css({display: "none"});
            StatusBar.addIndicator("status-user-exts", $indicator, true);
            console.log("Brackets reloaded with extensions disabled");
        }

        // Init DOM elements
        _$titleContainerToolbar = $("#titlebar");
        _$titleWrapper = $(".title-wrapper", _$titleContainerToolbar);
        _$title = $(".title", _$titleWrapper);
        _$dirtydot = $(".dirty-dot", _$titleWrapper);
    });

    if(Phoenix.isSpecRunnerWindow){
        _$titleContainerToolbar = $("#titlebar");
        _$titleWrapper = $(".title-wrapper");
        _$title = $(".title");
        _$dirtydot = $(".dirty-dot");
    }

    let firstProjectOpenHandled = false;
    ProjectManager.on(ProjectManager.EVENT_AFTER_PROJECT_OPEN, ()=>{
        closedFilesHistory = new Map();
        _enableOrDisableReopenClosedCmd();
        if(firstProjectOpenHandled){
            return;
        }
        firstProjectOpenHandled = true;
        Phoenix.app.setSingleInstanceCLIArgsHandler(_singleInstanceHandler);
        _openFilesPassedInFromCLI()
            .finally(()=>{
                // in mac, this is not exactly correct. This event will get triggered on startup, but mac will only
                // raise events in the background and there is no way for us to know when the mac open with events
                // come. Use this event carefully in mac.
                ProjectManager.trigger(ProjectManager.EVENT_AFTER_STARTUP_FILES_LOADED);
            });
    });

    // Exported for unit testing only
    exports._parseDecoratedPath = _parseDecoratedPath;

    // Set some command strings
    let quitString  = Strings.CMD_QUIT,
        showInOS    = Strings.CMD_SHOW_IN_FILE_MANAGER,
        defaultTerminal    = Strings.CMD_OPEN_IN_TERMINAL_DO_NOT_TRANSLATE;
    if (brackets.platform === "win") {
        quitString  = Strings.CMD_EXIT;
        showInOS    = Strings.CMD_SHOW_IN_EXPLORER;
        defaultTerminal    = Strings.CMD_OPEN_IN_CMD;
    } else if (brackets.platform === "mac") {
        showInOS    = Strings.CMD_SHOW_IN_FINDER;
    }

    // private api
    exports._EVENT_OPEN_WITH_FILE_FROM_OS = _EVENT_OPEN_WITH_FILE_FROM_OS;
    exports._isOpenWithFileFromOS = function () {
        return !!_filesOpenedFromOsCount;
    };

    // Define public API
    exports.showFileOpenError = showFileOpenError;
    exports.APP_QUIT_CANCELLED = APP_QUIT_CANCELLED;


    // Deprecated commands
    CommandManager.register(Strings.CMD_ADD_TO_WORKING_SET,          Commands.FILE_ADD_TO_WORKING_SET,        handleFileAddToWorkingSet);
    CommandManager.register(Strings.CMD_FILE_OPEN,                   Commands.FILE_OPEN,                      handleDocumentOpen);

    // New commands
    CommandManager.register(Strings.CMD_ADD_TO_WORKING_SET,          Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, handleFileAddToWorkingSetAndOpen);
    CommandManager.register(Strings.CMD_FILE_OPEN,                   Commands.CMD_OPEN,                       handleFileOpen);

    // File Commands
    CommandManager.register(Strings.CMD_FILE_NEW_UNTITLED,           Commands.FILE_NEW_UNTITLED,              handleFileNew);
    CommandManager.register(Strings.CMD_FILE_NEW,                    Commands.FILE_NEW,                       handleFileNewInProject);
    CommandManager.register(Strings.CMD_FILE_NEW_FOLDER,             Commands.FILE_NEW_FOLDER,                handleNewFolderInProject);
    CommandManager.register(Strings.CMD_FILE_SAVE,                   Commands.FILE_SAVE,                      handleFileSave);
    CommandManager.register(Strings.CMD_FILE_SAVE_ALL,               Commands.FILE_SAVE_ALL,                  handleFileSaveAll);
    CommandManager.register(Strings.CMD_FILE_SAVE_AS,                Commands.FILE_SAVE_AS,                   handleFileSaveAs);
    CommandManager.register(Strings.CMD_FILE_RENAME,                 Commands.FILE_RENAME,                    handleFileRename);
    CommandManager.register(Strings.CMD_FILE_DELETE,                 Commands.FILE_DELETE,                    handleFileDelete);

    // Close Commands
    CommandManager.register(Strings.CMD_FILE_CLOSE,                  Commands.FILE_CLOSE,                     handleFileClose);
    CommandManager.register(Strings.CMD_FILE_CLOSE_ALL,              Commands.FILE_CLOSE_ALL,                 handleFileCloseAll);
    CommandManager.register(Strings.CMD_FILE_CLOSE_LIST,             Commands.FILE_CLOSE_LIST,                handleFileCloseList);
    CommandManager.register(Strings.CMD_REOPEN_CLOSED,               Commands.FILE_REOPEN_CLOSED,             handleReopenClosed);

    // Traversal
    CommandManager.register(Strings.CMD_NEXT_DOC,                    Commands.NAVIGATE_NEXT_DOC,              handleGoNextDoc);
    CommandManager.register(Strings.CMD_PREV_DOC,                    Commands.NAVIGATE_PREV_DOC,              handleGoPrevDoc);

    CommandManager.register(Strings.CMD_NEXT_DOC_LIST_ORDER,         Commands.NAVIGATE_NEXT_DOC_LIST_ORDER,   handleGoNextDocListOrder);
    CommandManager.register(Strings.CMD_PREV_DOC_LIST_ORDER,         Commands.NAVIGATE_PREV_DOC_LIST_ORDER,   handleGoPrevDocListOrder);

    // Special Commands
    CommandManager.register(showInOS,                                Commands.NAVIGATE_SHOW_IN_OS,            handleShowInOS);
    CommandManager.register(defaultTerminal,                         Commands.NAVIGATE_OPEN_IN_TERMINAL,      openDefaultTerminal);
    if (brackets.platform === "win") {
        CommandManager.register(Strings.CMD_OPEN_IN_POWER_SHELL,     Commands.NAVIGATE_OPEN_IN_POWERSHELL,    openPowerShell);
    }
    CommandManager.register(Strings.CMD_OPEN_IN_DEFAULT_APP,         Commands.NAVIGATE_OPEN_IN_DEFAULT_APP,   openDefaultApp);
    CommandManager.register(Strings.CMD_NEW_BRACKETS_WINDOW,         Commands.FILE_NEW_WINDOW,                handleFileNewWindow);
    CommandManager.register(quitString,                              Commands.FILE_QUIT,                      handleFileCloseWindow);
    CommandManager.register(Strings.CMD_SHOW_IN_TREE,                Commands.NAVIGATE_SHOW_IN_FILE_TREE,     handleShowInTree);

    // These commands have no UI representation and are only used internally
    CommandManager.registerInternal(Commands.APP_ABORT_QUIT,            handleAbortQuit);
    CommandManager.registerInternal(Commands.APP_BEFORE_MENUPOPUP,      handleBeforeMenuPopup);
    CommandManager.registerInternal(Commands.FILE_CLOSE_WINDOW,         handleFileCloseWindow);
    CommandManager.registerInternal(Commands.APP_RELOAD,                handleReload);
    CommandManager.registerInternal(Commands.APP_RELOAD_WITHOUT_EXTS,   handleReloadWithoutExts);

    // Listen for changes that require updating the editor titlebar
    ProjectManager.on("projectOpen", ()=>{
        alwaysOverwriteTillProjectSwitch = false;
        _updateTitle();
    });
    DocumentManager.on("dirtyFlagChange", handleDirtyChange);
    DocumentManager.on("fileNameChange", handleCurrentFileChange);
    MainViewManager.on("currentFileChange", handleCurrentFileChange);

    // Reset the untitled document counter before changing projects
    ProjectManager.on("beforeProjectClose", function () { _nextUntitledIndexToUse = 1; });
});
