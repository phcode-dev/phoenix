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

/*global Phoenix, jsPromise, jasmine, expect, awaitsFor,awaitsForDone, spyOn, awaits */

define(function (require, exports, module) {


    var Commands            = require("command/Commands"),
        FileUtils           = require("file/FileUtils"),
        Async               = require("utils/Async"),
        Dialogs             = require("widgets/Dialogs"),
        DocumentManager     = require("document/DocumentManager"),
        Editor              = require("editor/Editor").Editor,
        EditorManager       = require("editor/EditorManager"),
        MainViewManager     = require("view/MainViewManager"),
        FileSystemError     = require("filesystem/FileSystemError"),
        FileSystem          = require("filesystem/FileSystem"),
        WorkspaceManager    = require("view/WorkspaceManager"),
        UrlParams           = require("utils/UrlParams").UrlParams,
        StringUtils         = require("utils/StringUtils"),
        LanguageManager     = require("language/LanguageManager");

    var TEST_PREFERENCES_KEY    = "com.adobe.brackets.test.preferences",
        EDITOR_USE_TABS         = false,
        EDITOR_SPACE_UNITS      = 4,
        OPEN_TAG                = "{{",
        RE_MARKER               = /\{\{(\d+)\}\}/g,
        absPathPrefix           = "/",
        _testSuites             = {},
        _testWindow,
        _doLoadExtensions,
        _rootSuite              = { id: "__brackets__" },
        _unitTestReporter;

    MainViewManager._initialize($("#mock-main-view"));

    function _getFileSystem() {
        return FileSystem;
    }

    /**
     * Delete a path
     * @param {string} fullPath
     * @param {boolean=} silent Defaults to false. When true, ignores ERR_NOT_FOUND when deleting path.
     * @param {FileSystem} fileSystem optional fs to use
     * @return {$.Promise} Resolved when deletion complete, or rejected if an error occurs
     */
    function deletePath(fullPath, silent, fileSystem) {
        var result = new $.Deferred();
        fileSystem = fileSystem || _getFileSystem();
        fileSystem.resolve(fullPath, function (err, item) {
            if (!err) {
                item.unlink(function (err) {
                    if (!err) {
                        result.resolve();
                    } else {
                        if (err === FileSystemError.NOT_FOUND && silent) {
                            result.resolve();
                        } else {
                            console.error("Unable to remove " + fullPath, err);
                            result.reject(err);
                        }
                    }
                });
            } else {
                if (err === FileSystemError.NOT_FOUND && silent) {
                    result.resolve();
                } else {
                    console.error("Unable to remove " + fullPath, err);
                    result.reject(err);
                }
            }
        });
        return result.promise();
    }

    async function deletePathAsync(fullPath, silent, fileSystem) {
        return jsPromise(deletePath(fullPath, silent, fileSystem));
    }

    /**
     * Remove a directory (recursively) or file
     *
     * @param {!string} path Path to remove
     * @return {$.Promise} Resolved when the path is removed, rejected if there was a problem
     */
    function remove(path) {
        var result = new $.Deferred();
        window.fs.unlink(path, (err)=>{
            if (!err) {
                result.resolve();
            } else {
                result.reject(err);
            }
        });
        return result.promise();
    }

    /**
     * Copy a directory (recursively) or file
     *
     * @param {!string}     src     Path to copy
     * @param {!string}     dest    Destination directory
     * @return {$.Promise} Resolved when the path is copied, rejected if there was a problem
     */
    function copy(src, dest) {
        var result = new $.Deferred();
        window.fs.copy(src, dest, err => {
            if (!err) {
                result.resolve();
            } else {
                result.reject(err);
            }
        });
        return result.promise();
    }

    /**
     * Rename a directory or file.
     * @return {$.Promise} Resolved when the path is rename, rejected if there was a problem
     */
    function rename(src, dest) {
        var result = new $.Deferred();
        window.fs.rename(src, dest, err => {
            if (!err) {
                result.resolve();
            } else {
                result.reject(err);
            }
        });
        return result.promise();
    }

    /**
     * Resolves a path string to a File or Directory
     * @param {!string} path Path to a file or directory
     * @return {$.Promise} A promise resolved when the file/directory is found or
     *     rejected when any error occurs.
     */
    function resolveNativeFileSystemPath(path) {
        var result = new $.Deferred();

        _getFileSystem().resolve(path, function (err, item) {
            if (!err) {
                result.resolve(item);
            } else {
                result.reject(err);
            }
        });

        return result.promise();
    }


    /**
     * Utility for tests that wait on a Promise to complete.
     * @param {$.Promise} promise
     */
    window.awaitsForDone = function (promise, msg = "") {
        return new Promise((resolve, reject)=>{
            jsPromise(promise)
                .then(()=>{
                    resolve();
                })
                .catch((err)=>{
                    console.error("awaitsForDone failed when expecting to pass for: " + msg, err);
                    reject(new Error("awaitsForDone failed when expecting to pass for: " + msg + err));
                });
        });
    };

    /**
     * Utility for tests that waits on a Promise to fail. resolves only if the promise fails. else will reject
     * @param {$.Promise} promise
     */
    window.awaitsForFail = function (promise, msg = "") {
        return new Promise((resolve, reject)=>{
            jsPromise(promise)
                .then(()=>{
                    // dont pass any args back, so not chaining with them
                    console.error("awaitsForFail expected to fail but passed for:"  + msg);
                    reject("awaitsForFail expected to fail but passed for:"  + msg);
                })
                .catch(()=>{
                    // dont pass any args back, so not chaining with them
                    resolve();
                });
        });
    };

    /**
     * Get or create a NativeFileSystem rooted at the system root.
     * @return {$.Promise} A promise resolved when the native file system is found or rejected when an error occurs.
     */
    function getRoot() {
        var deferred = new $.Deferred();

        resolveNativeFileSystemPath("/").then(deferred.resolve, deferred.reject);

        return deferred.promise();
    }

    function getTestRoot() {
        if(Phoenix.isNativeApp){
            return Phoenix.app.getApplicationSupportDirectory() + "test";
        }
        return '/test';
    }

    function getTestPath(path = '') {
        if(path && !path.startsWith("/")){
            throw new Error("getTestPath path should start with a /");
        }
        return getTestRoot() + path;
    }

    /**
     * Get the temporary unit test project path. Use this path for unit tests that need to modify files on disk.
     * @return {$.string} Path to the temporary unit test project
     */
    function getTempDirectory() {
        return getTestPath("/temp");
    }

    /**
     * creates an editable temp dir with copied contents from the test folder specified
     * @param pathInTestDir
     * @return {*}
     */
    async function getTempTestDirectory(pathInTestDir, ranbomize) {
        if(!pathInTestDir){
            throw new Error("getTempTestDirectory should be called with a test folder in test dir");
        }
        const tempPrefix = ranbomize ?
            "/tempTest/"+ StringUtils.randomString(10): "/tempTest";
        const testDir = getTestPath(pathInTestDir);
        const testTempDir = getTestPath(tempPrefix+pathInTestDir);
        const testTempDirRoot = getTestPath("/tempTest");
        await awaitsForDone(deletePath(testTempDirRoot, true));
        await awaitsForDone(copyPath(testDir, testTempDir));
        return testTempDir;
    }

    /**
     * Create the temporary unit test project directory.
     */
    async function createTempDirectory() {
        let deferred = new $.Deferred();
        _getFileSystem().getDirectoryForPath(getTempDirectory()).create(function (err) {
            if (err && err !== FileSystemError.ALREADY_EXISTS) {
                deferred.reject(err);
            } else {
                deferred.resolve();
            }
        });
        await awaitsForDone(deferred);
    }

    function _resetPermissionsOnSpecialTempFolders() {
        var entries = [],
            result = new $.Deferred(),
            promise,
            entryPromise = new $.Deferred(),
            tempDir;

        function visitor(entry) {
            entries.push(entry.fullPath);
            return true;
        }
        tempDir = FileSystem.getDirectoryForPath(getTempDirectory());
        tempDir.visit(visitor, function(err){
            if (!err) {
                entryPromise.resolve(entries);
            } else {
                if (err === FileSystemError.NOT_FOUND) {
                    entryPromise.resolve(entries);
                } else {
                    entryPromise.reject();
                }
            }
        });
        entryPromise.done(function(entries){
            promise = Async.doSequentially(entries, function (entry) {
                var deferred = new $.Deferred();

                FileSystem.resolve(entry, function (err, item) {
                    if (!err) {
                        // Change permissions if the directory exists
                        deferred.resolve();
                    } else {
                        if (err === FileSystemError.NOT_FOUND) {
                            // Resolve the promise since the folder to reset doesn't exist
                            deferred.resolve();
                        } else {
                            deferred.reject();
                        }
                    }
                });

                return deferred.promise();
            }, true);
            promise.then(result.resolve, result.reject);
        }).fail(function() {
            result.reject();
        });

        return result.promise();
    }

    /**
     * Remove temp folder used for temporary unit tests files
     */
    async function removeTempDirectory() {
        return new Promise((resolve, reject)=>{
            let baseDir     = getTempDirectory();
            _resetPermissionsOnSpecialTempFolders().done(function () {
                deletePath(baseDir, true).then(resolve, reject);
            }).fail(function () {
                reject();
            });
        });
    }

    function getBracketsSourceRoot() {
        var path = window.location.pathname;
        path = path.split("/");
        path = path.slice(0, path.length - 2);
        path.push("src");
        let url = window.location.origin + path.join("/");
        if (!url.endsWith("/")){
            url = url + "/";
        }
        return url;
    }

    /**
     * Returns a Document suitable for use with an Editor in isolation, but that can be registered with
     * DocumentManager via addRef() so it is maintained for global updates like name and language changes.
     *
     * Like a normal Document, if you cause an addRef() on this you MUST call releaseRef() later.
     *
     * @param {!{language:?string, filename:?string, content:?string }} options
     * Language defaults to JavaScript, filename defaults to a placeholder name, and
     * content defaults to "".
     */
    function createMockActiveDocument(options) {
        var language    = options.language || LanguageManager.getLanguage("javascript"),
            filename    = options.filename || (absPathPrefix + "_unitTestDummyPath_/_dummyFile_" + Date.now() + "." + language._fileExtensions[0]),
            content     = options.content || "";

        // Use unique filename to avoid collissions in open documents list
        var dummyFile = _getFileSystem().getFileForPath(filename);
        var docToShim = new DocumentManager.Document(dummyFile, new Date(), content);

        // Prevent adding doc to working set by not dispatching "dirtyFlagChange".
        // TODO: Other functionality here needs to be kept in sync with Document._handleEditorChange(). In the
        // future, we should fix things so that we either don't need mock documents or that this
        // is factored so it will just run in both.
        docToShim._handleEditorChange = function (event, editor, changeList) {
            this.isDirty = !editor._codeMirror.isClean();
            this._notifyDocumentChange(changeList);
        };
        docToShim.notifySaved = function () {
            throw new Error("Cannot notifySaved() a unit-test dummy Document");
        };

        return docToShim;
    }

    /**
     * Returns a Document suitable for use with an Editor in isolation: i.e., a Document that will
     * never be set as the currentDocument or added to the working set.
     *
     * Unlike a real Document, does NOT need to be explicitly cleaned up.
     *
     * @param {?string} initialContent  Defaults to ""
     * @param {?string} languageId      Defaults to JavaScript
     * @param {?string} filename        Defaults to an auto-generated filename with the language's extension
     */
    function createMockDocument(initialContent, languageId, filename) {
        var language    = LanguageManager.getLanguage(languageId) || LanguageManager.getLanguage("javascript"),
            options     = { language: language, content: initialContent, filename: filename },
            docToShim   = createMockActiveDocument(options);

        // Prevent adding doc to global 'open docs' list; prevents leaks or collisions if a test
        // fails to clean up properly (if test fails, or due to an apparent bug with afterEach())
        docToShim.addRef = function () {};
        docToShim.releaseRef = function () {};
        docToShim._ensureMasterEditor = function () {
            if (!this._masterEditor) {
                // Don't let Document create an Editor itself via EditorManager; the unit test can't clean that up
                throw new Error("Use create/destroyMockEditor() to test edit operations");
            }
        };

        return docToShim;
    }

    /**
     * Returns a mock element (in the test runner window) that's offscreen, for
     * parenting UI you want to unit-test. When done, make sure to delete it with
     * remove().
     * @return {jQueryObject} a jQuery object for an offscreen div
     */
    function createMockElement() {
        return $("<div/>")
            .css({
                position: "absolute",
                left: "-10000px",
                top: "-10000px"
            })
            .appendTo($("body"));
    }

    function createEditorInstance(doc, pane, visibleRange) {
        var $editorHolder = pane.$el || pane; // To handle actual pane mock or a fake container
        var editor = new Editor(doc, true, $editorHolder.get(0), visibleRange);

        Editor.setUseTabChar(EDITOR_USE_TABS);
        Editor.setSpaceUnits(EDITOR_SPACE_UNITS);

        if (pane.addView) {
            pane.addView(editor);
            editor._paneId = pane.id;
        }

        EditorManager._notifyActiveEditorChanged(editor);

        return editor;
    }

    /**
     * Returns an Editor tied to the given Document, but suitable for use in isolation
     * (without being placed inside the surrounding Brackets UI). The Editor *will* be
     * reported as the "active editor" by EditorManager.
     *
     * Must be cleaned up by calling destroyMockEditor(document) later.
     *
     * @param {!Document} doc
     * @param {{startLine: number, endLine: number}=} visibleRange
     * @return {!Editor}
     */
    function createMockEditorForDocument(doc, visibleRange) {
        // Initialize EditorManager/WorkspaceManager and position the editor-holder offscreen
        // (".content" may not exist, but that's ok for headless tests where editor height doesn't matter)
        var $editorHolder = createMockElement().css("width", "1000px").attr("id", "hidden-editors");
        WorkspaceManager._setMockDOM($(".content"), $editorHolder);

        // create Editor instance
        return createEditorInstance(doc, $editorHolder, visibleRange);
    }

    /**
     * Returns a Document and Editor suitable for use in isolation: the Document
     * will never be set as the currentDocument or added to the working set and the
     * Editor does not live inside a full-blown Brackets UI layout. The Editor *will* be
     * reported as the "active editor" by EditorManager, however.
     *
     * Must be cleaned up by calling destroyMockEditor(document) later.
     *
     * @param {string=} initialContent
     * @param {string=} languageId
     * @param {{startLine: number, endLine: number}=} visibleRange
     * @param {{filename:string}} options
     * @return {!{doc:!Document, editor:!Editor}}
     */
    function createMockEditor(initialContent, languageId, visibleRange, options={}) {
        // create dummy Document, then Editor tied to it
        var doc = createMockDocument(initialContent, languageId, options.filename);
        return { doc: doc, editor: createMockEditorForDocument(doc, visibleRange) };
    }

    function createMockPane($el, paneId) {
        createMockElement()
            .attr("class", "pane-header")
            .appendTo($el);
        var $fakeContent = createMockElement()
            .attr("class", "pane-content")
            .appendTo($el);

        return {
            $el: $el,
            id: paneId || 'first-pane',
            $content: $fakeContent,
            addView: function (editor) {
                this.$content.append(editor.$el);
            },
            showView: function (editor) {
            }
        };
    }

    /**
     * Destroy the Editor instance for a given mock Document.
     * @param {!Document} doc  Document whose master editor to destroy
     */
    function destroyMockEditor(doc) {
        EditorManager._notifyActiveEditorChanged(null);
        MainViewManager._destroyEditorIfNotNeeded(doc);

        // Clear editor holder so EditorManager doesn't try to resize destroyed object
        $("#hidden-editors").remove();
    }

    /**
     * Dismiss the currently open dialog as if the user had chosen the given button. Dialogs close
     * asynchronously; after calling this, you need to start a new runs() block before testing the
     * outcome. Also, in cases where asynchronous tasks are performed after the dialog closes,
     * clients must also wait for any additional promises.
     * @param {string} buttonId  One of the Dialogs.DIALOG_BTN_* symbolic constants.
     * @param {boolean=} enableFirst  If true, then enable the button before clicking.
     */
    async function clickDialogButton(buttonId = Dialogs.DIALOG_BTN_OK, enableFirst = false) {
        // Make sure there's one and only one dialog open
        var $dlg = _testWindow.$(".modal.instance"),
            promise = $dlg.data("promise");

        expect($dlg.length).toBe(1);

        // Make sure desired button exists
        var $dismissButton = $dlg.find(".dialog-button[data-button-id='" + buttonId + "']");
        expect($dismissButton.length).toBe(1);

        if (enableFirst) {
            // Remove the disabled prop.
            $dismissButton.prop("disabled", false);
        }

        // Click the button
        $dismissButton.click();

        // Dialog should resolve/reject the promise
        await awaitsForDone(promise);
    }

    async function waitForModalDialog(timeout=2000) {
        // Make sure there's one and only one dialog open
        await awaitsFor(()=>{
            let $dlg = _testWindow.$(".modal.instance");
            return $dlg.length >= 1;
        }, timeout);
    }

    async function waitForNoModalDialog(timeout=2000) {
        // Make sure there's one and only one dialog open
        await awaitsFor(()=>{
            let $dlg = _testWindow.$(".modal.instance");
            return $dlg.length === 0;
        }, timeout);
    }


    function _isBracketsDoneLoading() {
        return _testWindow && _testWindow.brackets && _testWindow.brackets.test && _testWindow.brackets.test.doneLoading;
    }

    function _setupTestWindow() {
        // Displays the primary console messages from the test window in the
        // test runner's console as well.
        ["debug", "log", "info", "warn", "error"].forEach(function (method) {
            var originalMethod = _testWindow.console[method];
            _testWindow.console[method] = function () {
                var log = ["[testWindow] "].concat(Array.prototype.slice.call(arguments, 0));
                console[method].apply(console, log);
                if(!_testWindow){
                    return;
                }
                originalMethod.apply(_testWindow.console, arguments);
            };
        });

        _testWindow.isBracketsTestWindow = true;
        _testWindow.isBracketsTestWindowSetup = true;

        _testWindow.executeCommand = function executeCommand(cmd, args) {
            return _testWindow.brackets.test.CommandManager.execute(cmd, args);
        };

        _testWindow.closeAllFiles = async function closeAllFiles() {
            if(!_testWindow.executeCommand) {
                return;
            }
            let promise = _testWindow.executeCommand(_testWindow.brackets.test.Commands.FILE_CLOSE_ALL, {
                _forceClose: true,
                PaneId: _testWindow.brackets.test.MainViewManager.ALL_PANES
            });
            _testWindow.brackets.test.Dialogs.cancelModalDialogIfOpen(
                _testWindow.brackets.test.DefaultDialogs.DIALOG_ID_SAVE_CLOSE,
                _testWindow.brackets.test.DefaultDialogs.DIALOG_BTN_DONTSAVE
            );

            await jsPromise(promise);
        };
    }

    async function waitForBracketsDoneLoading() {
        // FIXME (issue #249): Need an event or something a little more reliable...
        await awaitsFor(
            _isBracketsDoneLoading,
            "brackets.test.doneLoading",
            60000
        );
        console.log("test window loaded");
    }

    // the phoenix test window is only created once, it should be reused for the full suite run.
    // subsequent calls to this function will only return the existing test window. This is to prevent
    // browser hangs that was quite frequent as we created and dropped iframes in the DOM.
    async function createTestWindowAndRun(options={
        forceReload: false,
        useWindowInsteadOfIframe: false // if this is set,
    }) {
        let params = new UrlParams();

        // disable loading of sample project
        params.put("skipSampleProjectLoad", true);
        if(window._getPlatformOverride()){
            params.put("platform", window._getPlatformOverride());
        }

        // disable initial dialog for live development
        params.put("skipLiveDevelopmentInfo", true);

        // signals that main.js should configure RequireJS for tests
        params.put("testEnvironment", true);

        if (options) {
            // option to set the params
            if (options.hasOwnProperty("params")) {
                throw new Error("unexpected params object on create test window, not supported!");
            }

            // option to launch test window with either native or HTML menus
            if (options.hasOwnProperty("hasNativeMenus")) {
                params.put("hasNativeMenus", (options.hasNativeMenus ? "true" : "false"));
            }
        }

        let _testWindowURL = getBracketsSourceRoot() + "?" + params.toString();
        if(_testWindow &&(
            options.forceReload ||
            (_testWindow.isActualWindow && !options.useWindowInsteadOfIframe)
        )) {
            const urlParams = new URLSearchParams(window.location.search || "");
            if(urlParams.get('category') === 'integration'){
                const errorString = "Test config error!!\nTests with category `integration` are not" +
                    " supposed to use `forceReload` when calling `SpecRunnerUtils.createTestWindowAndRun`" +
                    " This will severally impact test run times for modern phcode tests.\nYou should use" +
                    " `LegacyInteg` category in such cases!!!";
                console.error(errorString);
                alert(errorString);
            }
            await closeTestWindow(true);
        }

        if(!_testWindow){
            if(options.useWindowInsteadOfIframe) {
                _testWindow = window.open(_testWindowURL, "integTestWindow", "width=1500,height=1024");
                _testWindow.isActualWindow = true;
            } else {
                const testIframe = window.openIframeRunner(_testWindowURL);
                _testWindow = testIframe.contentWindow;
            }
        } else if(!_testWindow.brackets || !_testWindow.executeCommand){
            _testWindow.location.href = 'about:blank';
            _testWindow.location.href = _testWindowURL;
        } else {
            if(!_testWindow.closeAllFiles){
                _setupTestWindow();
            }
            await _testWindow.closeAllFiles();
        }

        await waitForBracketsDoneLoading();

        if(!_testWindow.isBracketsTestWindowSetup) {
            _setupTestWindow();
        }
        return _testWindow;
    }
    async function reloadWindow() {
        //we need to mark the documents as not dirty before we close
        //or the window will stay open prompting to save
        var openDocs = _testWindow.brackets.test.DocumentManager.getAllOpenDocuments();
        openDocs.forEach(function resetDoc(doc) {
            if (doc.isDirty) {
                //just refresh it back to it's current text. This will mark it
                //clean to save
                doc.refreshText(doc.getText(), doc.diskTimestamp);
            }
        });
        let savedHref = _testWindow.location.href;
        _testWindow.brackets = null;
        _testWindow.location.href = "about:blank";
        _testWindow.location.href = savedHref;

        // FIXME (issue #249): Need an event or something a little more reliable...
        await awaitsFor(
            _isBracketsDoneLoading,
            "brackets.test.doneLoading",
            60000,
            100
        );

        _setupTestWindow();
        return _testWindow;
    }

    async function closeTestWindow(force, blankTestWindow) {
        //we need to mark the documents as not dirty before we close
        //or the window will stay open prompting to save
        if(!_testWindow){
            return;
        }
        if(_isBracketsDoneLoading()) {
            if(!_testWindow.closeAllFiles){
                _setupTestWindow();
            }
            await _testWindow.closeAllFiles();
            if(!force){
                await jsPromise(_testWindow.brackets.test.CommandManager.execute(Commands.CMD_SPLITVIEW_NONE));
                _testWindow.brackets.test.MainViewManager._closeAll(_testWindow.brackets.test.MainViewManager.ALL_PANES);
                await window.Phoenix.VFS.ensureExistsDirAsync("/test/parked");
                await loadProjectInTestWindow("/test/parked");
            }
        }

        if(force) {
            _testWindow.executeCommand = null;
            await awaits(3000); // UTS will crap without these time waits, esp in chromium. Browser freezes
            if(_testWindow.brackets) {
                await awaitsFor(function () {
                    return _testWindow.brackets.test.FindInFiles.isProjectIndexingComplete();
                }, "Indexing complete", 10000);
                for(let key of Object.keys(_testWindow.brackets.test)){
                    delete _testWindow.brackets.test[key];
                }
                delete _testWindow.brackets.test;
                delete _testWindow.brackets;
                delete _testWindow.appshell;
                delete _testWindow.fs;

            }
            _testWindow.PhNodeEngine && _testWindow.PhNodeEngine.terminateNode();
            if(blankTestWindow){
                _testWindow.location.href = "about:blank";
                await awaits(2000); // UTS will crap without these time waits, esp in chromium. Browser freezes
            }
            if(_testWindow.isActualWindow){
                _testWindow.close();
            } else {
                window.closeIframeRunner();
            }
            _testWindow = null;
            await awaits(2000); // UTS will crap without these time waits, esp in chromium. Browser freezes
        }
    }


    async function loadProjectInTestWindow(path) {
        let result = _testWindow.brackets.test.ProjectManager.openProject(path);
        await awaitsForDone(result);
    }

    /**
     * Parses offsets from text offset markup (e.g. "{{1}}" for offset 1).
     * @param {!string} text Text to parse
     * @return {!{offsets:!Array.<{line:number, ch:number}>, text:!string, original:!string}}
     */
    function parseOffsetsFromText(text) {
        var offsets = [],
            output  = [],
            i       = 0,
            line    = 0,
            charAt  = 0,
            ch      = 0,
            length  = text.length,
            exec    = null,
            found   = false;

        while (i < length) {
            found = false;

            if (text.slice(i, i + OPEN_TAG.length) === OPEN_TAG) {
                // find "{{[0-9]+}}"
                RE_MARKER.lastIndex = i;
                exec = RE_MARKER.exec(text);
                found = (exec !== null && exec.index === i);

                if (found) {
                    // record offset info
                    offsets[exec[1]] = {line: line, ch: ch};

                    // advance
                    i += exec[0].length;
                }
            }

            if (!found) {
                charAt = text.substr(i, 1);
                output.push(charAt);

                if (charAt === '\n') {
                    line++;
                    ch = 0;
                } else {
                    ch++;
                }

                i++;
            }
        }

        return {offsets: offsets, text: output.join(""), original: text};
    }

    /**
     * Creates absolute paths based on the test window's current project
     * @param {!Array.<string>|string} paths Project relative file path(s) to convert. May pass a single string path or array.
     * @return {!Array.<string>|string} Absolute file path(s)
     */
    function makeAbsolute(paths) {
        var fullPath = _testWindow.brackets.test.ProjectManager.getProjectRoot().fullPath;

        function prefixProjectPath(path) {
            if (path.indexOf(fullPath) === 0) {
                return path;
            }

            return fullPath + path;
        }

        if (Array.isArray(paths)) {
            return paths.map(prefixProjectPath);
        }
        return prefixProjectPath(paths);

    }

    /**
     * Creates relative paths based on the test window's current project. Any paths,
     * outside the project are included in the result, but left as absolute paths.
     * @param {!Array.<string>|string} paths Absolute file path(s) to convert. May pass a single string path or array.
     * @return {!Array.<string>|string} Relative file path(s)
     */
    function makeRelative(paths) {
        var fullPath = _testWindow.brackets.test.ProjectManager.getProjectRoot().fullPath,
            fullPathLength = fullPath.length;

        function removeProjectPath(path) {
            if (path.indexOf(fullPath) === 0) {
                return path.substring(fullPathLength);
            }

            return path;
        }

        if (Array.isArray(paths)) {
            return paths.map(removeProjectPath);
        }
        return removeProjectPath(paths);

    }

    function makeArray(arg) {
        if (!Array.isArray(arg)) {
            return [arg];
        }

        return arg;
    }

    /**
     * Opens project relative file paths in the test window
     * @param {!(Array.<string>|string)} paths Project relative file path(s) to open
     * @param {string} [paneId] - optional
     * @return {!$.Promise} A promise resolved with a mapping of project-relative path
     *  keys to a corresponding Document
     */
    function openProjectFiles(paths, paneId) {
        var result = new $.Deferred(),
            fullpaths = makeArray(makeAbsolute(paths)),
            keys = makeArray(makeRelative(paths)),
            docs = {},
            FileViewController = _testWindow.brackets.test.FileViewController,
            DocumentManager = _testWindow.brackets.test.DocumentManager;

        Async.doSequentially(fullpaths, function (path, i) {
            var one = new $.Deferred();

            FileViewController.openFileAndAddToWorkingSet(path, paneId).done(function (file) {
                docs[keys[i]] = DocumentManager.getOpenDocumentForPath(file.fullPath);
                one.resolve();
            }).fail(function (err) {
                one.reject(err);
            });

            return one.promise();
        }, false).done(function () {
            result.resolve(docs);
        }).fail(function (err) {
            result.reject(err);
        }).always(function () {
            docs = null;
            FileViewController = null;
        });

        return result.promise();
    }

    /**
     * Opens full file paths in the test window editor
     * @param {!(Array.<string>|string)} paths absolute file path(s) to open
     * @return {!$.Promise} A promise resolved with a mapping of project-relative path
     *  keys to a corresponding Document
     */
    function openFiles(paths) {
        var result = new $.Deferred(),
            docs = {},
            FileViewController = _testWindow.brackets.test.FileViewController,
            DocumentManager = _testWindow.brackets.test.DocumentManager;

        Async.doSequentially(paths, function (path, i) {
            var one = new $.Deferred();

            FileViewController.openFileAndAddToWorkingSet(path).done(function (file) {
                docs[i] = DocumentManager.getOpenDocumentForPath(file.fullPath);
                one.resolve();
            }).fail(function (err) {
                one.reject(err);
            });

            return one.promise();
        }, false).done(function () {
            result.resolve(docs);
        }).fail(function (err) {
            result.reject(err);
        }).always(function () {
            docs = null;
            FileViewController = null;
        });

        return result.promise();
    }

    /**
     * Create or overwrite a text file
     * @param {!string} path Path for a file to be created/overwritten
     * @param {!string} text Text content for the new file
     * @param {!FileSystem} fileSystem FileSystem instance to use. Normally, use the instance from
     *      testWindow so the test copy of Brackets is aware of the newly-created file.
     * @return {$.Promise} A promise resolved when the file is written or rejected when an error occurs.
     */
    function createTextFile(path, text, fileSystem) {
        fileSystem = fileSystem || _getFileSystem();
        var deferred = new $.Deferred(),
            file = fileSystem.getFileForPath(path),
            options = {
                blind: true // overwriting previous files is OK
            };

        file.write(text, options, function (err) {
            if (!err) {
                deferred.resolve(file);
            } else {
                deferred.reject(err);
            }
        });

        return deferred.promise();
    }

    function createTextFileAsync(path, text) {
        return jsPromise(createTextFile(path, text, _getFileSystem()));
    }

    function readTextFileAsync(path, fileSystem) {
        fileSystem = fileSystem || _getFileSystem();
        return new Promise((resolve, reject)=>{
            const file = fileSystem.getFileForPath(path);
            file.read({}, function (err, text) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(text);
            });
        });
    }

    /**
     * Copy a file source path to a destination
     * @param {!File} source Entry for the source file to copy
     * @param {!string} destination Destination path to copy the source file
     * @param {?{parseOffsets:boolean}} options parseOffsets allows optional
     *     offset markup parsing. File is written to the destination path
     *     without offsets. Offset data is passed to the doneCallbacks of the
     *     promise.
     * @return {$.Promise} A promise resolved when the file is copied to the
     *     destination.
     */
    function copyFileEntry(source, destination, options) {
        options = options || {};

        var deferred = new $.Deferred();

        // read the source file
        FileUtils.readAsText(source).done(function (text, modificationTime) {
            getRoot().done(function (nfs) {
                var offsets;

                // optionally parse offsets
                if (options.parseOffsets) {
                    var parseInfo = parseOffsetsFromText(text);
                    text = parseInfo.text;
                    offsets = parseInfo.offsets;
                }

                // create the new File
                createTextFile(destination, text, _getFileSystem()).done(function (entry) {
                    deferred.resolve(entry, offsets, text);
                }).fail(function (err) {
                    deferred.reject(err);
                });
            });
        }).fail(function (err) {
            deferred.reject(err);
        });

        return deferred.promise();
    }

    /**
     * Copy a directory source to a destination
     * @param {!Directory} source Directory to copy
     * @param {!string} destination Destination path to copy the source directory to
     * @param {?{parseOffsets:boolean, infos:Object, removePrefix:boolean}}} options
     *     parseOffsets - allows optional offset markup parsing. File is written to the
     *       destination path without offsets. Offset data is passed to the
     *       doneCallbacks of the promise.
     *     infos - an optional Object used when parseOffsets is true. Offset
     *       information is attached here, indexed by the file destination path.
     *     removePrefix - When parseOffsets is true, set removePrefix true
     *       to add a new key to the infos array that drops the destination
     *       path root.
     * @return {$.Promise} A promise resolved when the directory and all it's
     *     contents are copied to the destination or rejected immediately
     *     upon the first error.
     */
    function copyDirectoryEntry(source, destination, options) {
        options = options || {};
        options.infos = options.infos || {};

        var parseOffsets    = options.parseOffsets || false,
            removePrefix    = options.removePrefix || true,
            deferred        = new $.Deferred(),
            destDir         = _getFileSystem().getDirectoryForPath(destination);

        // create the destination folder
        destDir.create(function (err) {
            if (err && err !== FileSystemError.ALREADY_EXISTS) {
                deferred.reject();
                return;
            }

            source.getContents(function (err, contents) {
                if (!err) {
                    // copy all children of this directory
                    var copyChildrenPromise = Async.doInParallel(
                        contents,
                        function copyChild(child) {
                            var childDestination = destination + "/" + child.name,
                                promise;

                            if (child.isDirectory) {
                                promise = copyDirectoryEntry(child, childDestination, options);
                            } else {
                                promise = copyFileEntry(child, childDestination, options);

                                if (parseOffsets) {
                                    // save offset data for each file path
                                    promise.done(function (destinationEntry, offsets, text) {
                                        options.infos[childDestination] = {
                                            offsets: offsets,
                                            fileEntry: destinationEntry,
                                            text: text
                                        };
                                    });
                                }
                            }

                            return promise;
                        }
                    );

                    copyChildrenPromise.then(deferred.resolve, deferred.reject);
                } else {
                    deferred.reject(err);
                }
            });
        });

        deferred.always(function () {
            // remove destination path prefix
            if (removePrefix && options.infos) {
                var shortKey;
                Object.keys(options.infos).forEach(function (key) {
                    shortKey = key.substr(destination.length + 1);
                    options.infos[shortKey] = options.infos[key];
                });
            }
        });

        return deferred.promise();
    }

    /**
     * Copy a file or directory source path to a destination
     * @param {!string} source Path for the source file or directory to copy
     * @param {!string} destination Destination path to copy the source file or directory
     * @param {?{parseOffsets:boolean, infos:Object, removePrefix:boolean}}} options
     *     parseOffsets - allows optional offset markup parsing. File is written to the
     *       destination path without offsets. Offset data is passed to the
     *       doneCallbacks of the promise.
     *     infos - an optional Object used when parseOffsets is true. Offset
     *       information is attached here, indexed by the file destination path.
     *     removePrefix - When parseOffsets is true, set removePrefix true
     *       to add a new key to the infos array that drops the destination
     *       path root.
     * @return {$.Promise} A promise resolved when the directory and all it's
     *     contents are copied to the destination or rejected immediately
     *     upon the first error.
     */
    function copyPath(source, destination, options) {
        var deferred = new $.Deferred();

        resolveNativeFileSystemPath(source).done(function (entry) {
            var promise;

            if (entry.isDirectory) {
                promise = copyDirectoryEntry(entry, destination, options);
            } else {
                promise = copyFileEntry(entry, destination, options);
            }

            promise.then(deferred.resolve, function (err) {
                console.error(destination);
                deferred.reject();
            });
        }).fail(function () {
            deferred.reject();
        });

        return deferred.promise();
    }

    /**
     * Set editor cursor position to the given offset then activate an inline editor.
     * @param {!Editor} editor
     * @param {!{line:number, ch:number}} offset
     * @return {$.Promise} a promise that will be resolved when an inline
     *  editor is created or rejected when no inline editors are available.
     */
    function toggleQuickEditAtOffset(editor, offset) {
        editor.setCursorPos(offset.line, offset.ch);

        return _testWindow.executeCommand(Commands.TOGGLE_QUICK_EDIT);
    }

    /**
     * Simulate a key event.
     * @param {Number} key Key code
     * @param (String) event Key event to simulate
     * @param {HTMLElement} element Element to receive event
     * @param {KeyboardEventInit} options Optional arguments for key event
     */
    function simulateKeyEvent(key, event, element, options) {
        var doc = element.ownerDocument;

        if(typeof options === 'undefined') {
            options = {
                view: doc.defaultView,
                bubbles: true,
                cancelable: true,
                keyIdentifer: key
            };
        } else {
            options.view = doc.defaultView;
            options.bubbles = true;
            options.cancelable = true;
            options.keyIdentifier = key;
        }
        var oEvent = new KeyboardEvent(event, options);

        if (event !== "keydown" && event !== "keyup" && event !== "keypress") {
            console.log("SpecRunnerUtils.simulateKeyEvent() - unsupported keyevent: " + event);
            return;
        }

        // Chromium Hack: need to override the 'which' property.
        // Note: this code is not designed to work in IE, Safari,
        // or other browsers. Well, maybe with Firefox. YMMV.
        Object.defineProperty(oEvent, 'keyCode', {
            get: function () {
                return this.keyCodeVal;
            }
        });
        Object.defineProperty(oEvent, 'which', {
            get: function () {
                return this.keyCodeVal;
            }
        });
        Object.defineProperty(oEvent, 'charCode', {
            get: function () {
                return this.keyCodeVal;
            }
        });

        oEvent.keyCodeVal = key;
        if (oEvent.keyCode !== key) {
            console.log("SpecRunnerUtils.simulateKeyEvent() - keyCode mismatch: " + oEvent.keyCode);
        }

        element.dispatchEvent(oEvent);
    }

    function getTestWindow() {
        return _testWindow;
    }

    function setLoadExtensionsInTestWindow(doLoadExtensions) {
        _doLoadExtensions = doLoadExtensions;
    }

    /**
     * Change the size of an editor. The window size is not affected by this function.
     * CodeMirror will change it's size withing Brackets.
     *
     * @param {!Editor} editor - instance of Editor
     * @param {?number} width - the new width of the editor in pixel
     * @param {?number} height - the new height of the editor in pixel
     */
    function resizeEditor(editor, width, height) {
        var oldSize = {};

        if (editor) {
            var jquery = editor.getRootElement().ownerDocument.defaultView.$,
                $editorHolder = jquery('#editor-holder'),
                $content = jquery('.content');

            // preserve old size
            oldSize.width = $editorHolder.width();
            oldSize.height = $editorHolder.height();

            if (width) {
                $content.width(width);
                $editorHolder.width(width);
                editor.setSize(width, null); // Update CM size
            }

            if (height) {
                $content.height(height);
                $editorHolder.height(height);
                editor.setSize(null, height); // Update CM size
            }

            editor.refreshAll(true); // update CM
        }

        return oldSize;
    }

    /**
     * Searches the DOM tree for text containing the given content. Useful for verifying
     * that data you expect to show up in the UI somewhere is actually there.
     *
     * @param {jQueryObject|Node} root The root element to search from. Can be either a jQuery object
     *     or a raw DOM node.
     * @param {string} content The content to find.
     * @param {boolean} asLink If true, find the content in the href of an <a> tag, otherwise find it in text nodes.
     * @return true if content was found
     */
    function findDOMText(root, content, asLink) {
        // Unfortunately, we can't just use jQuery's :contains() selector, because it appears that
        // you can't escape quotes in it.
        var i;
        if (root.jquery) {
            root = root.get(0);
        }
        if (!root) {
            return false;
        } else if (!asLink && root.nodeType === 3) { // text node
            return root.textContent.indexOf(content) !== -1;
        }
        if (asLink && root.nodeType === 1 && root.tagName.toLowerCase() === "a" && root.getAttribute("href") === content) {
            return true;
        }
        var children = root.childNodes;
        for (i = 0; i < children.length; i++) {
            if (findDOMText(children[i], content, asLink)) {
                return true;
            }
        }
        return false;

    }


    /**
     * Patches ProjectManager.getAllFiles() in the given test window (for just the current it() block) so that it
     * includes one extra file in its results. The file need not actually exist on disk.
     * @param {!Window} testWindow  Brackets popup window
     * @param {string} extraFilePath  Absolute path for the extra result file
     */
    function injectIntoGetAllFiles(testWindow, extraFilePath) {
        var ProjectManager  = testWindow.brackets.test.ProjectManager,
            FileSystem      = testWindow.brackets.test.FileSystem,
            origGetAllFiles = ProjectManager.getAllFiles;

        spyOn(ProjectManager, "getAllFiles").and.callFake(function () {
            var testResult = new testWindow.$.Deferred();
            origGetAllFiles.apply(ProjectManager, arguments).done(function (result) {
                var dummyFile = FileSystem.getFileForPath(extraFilePath);
                var newResult = result.concat([dummyFile]);
                testResult.resolve(newResult);
            }).fail(function (error) {
                testResult.reject(error);
            });
            return testResult;
        });
    }


    /**
     * Counts the number of active specs in the current suite. Includes all
     * descendants.
     * @param {(jasmine.Suite|jasmine.Spec)} suiteOrSpec
     * @return {number}
     */
    function countSpecs(suiteOrSpec) {
        var children = suiteOrSpec.children && typeof suiteOrSpec.children === "function" && suiteOrSpec.children();

        if (Array.isArray(children)) {
            var childCount = 0;

            children.forEach(function (child) {
                childCount += countSpecs(child);
            });

            return childCount;
        }

        if (jasmine.getEnv().specFilter(suiteOrSpec)) {
            return 1;
        }

        return 0;
    }

    async function ensureExistsDirAsync(pathToExist) {
        await window.Phoenix.VFS.ensureExistsDirAsync(pathToExist);
    }

    async function pathExists(pathToCheck, isFolder = true) {
        let entry = isFolder ? FileSystem.getDirectoryForPath(pathToCheck)
            : FileSystem.getFileForPath(pathToCheck);
        return entry.existsAsync(pathToCheck);
    }

    async function waitTillPathExists(pathToCheck, isFolder = true, timeout = 2000, pollingInterval = 50) {
        for(let i=0; i<timeout/pollingInterval; i++){
            let exists = await pathExists(pathToCheck, isFolder);
            if(exists){
                return true;
            }
            await awaits(pollingInterval);
        }
        throw "Path exist check failed: " + pathToCheck;
    }

    async function waitTillPathNotExists(pathToCheck, isFolder = true, timeout = 2000, pollingInterval = 10) {
        for(let i=0; i<timeout/pollingInterval; i++){
            let exists = await pathExists(pathToCheck, isFolder);
            if(!exists){
                return true;
            }
            await awaits(pollingInterval);
        }
        throw "Path not exist check failed: " + pathToCheck;
    }

    // "global" custom matchers
    function editorHasCursorPosition(editor, line, ch, ignoreSelection) {
        let selection = editor.getSelection();
        let start = selection.start;
        let end = selection.end;
        let selectionMoreThanOneCharacter = start.line !== end.line || start.ch !== end.ch;
        let positionsMatch = start.line === line && start.ch === ch;
        if (ignoreSelection) {
            return positionsMatch;
        }
        return !selectionMoreThanOneCharacter && positionsMatch;
    }

    function setUnitTestReporter(reporter) {
        _unitTestReporter = reporter;
    }

    exports.TEST_PREFERENCES_KEY            = TEST_PREFERENCES_KEY;
    exports.EDITOR_USE_TABS                 = EDITOR_USE_TABS;
    exports.EDITOR_SPACE_UNITS              = EDITOR_SPACE_UNITS;
    exports.remove                          = remove;
    exports.copy                            = copy;
    exports.rename                          = rename;
    exports.getTestRoot                     = getTestRoot;
    exports.getTestPath                     = getTestPath;
    exports.getTempDirectory                = getTempDirectory;
    exports.getTempTestDirectory            = getTempTestDirectory;
    exports.createTempDirectory             = createTempDirectory;
    exports.getBracketsSourceRoot           = getBracketsSourceRoot;
    exports.makeAbsolute                    = makeAbsolute;
    exports.resolveNativeFileSystemPath     = resolveNativeFileSystemPath;
    exports.createEditorInstance            = createEditorInstance;
    exports.createMockDocument              = createMockDocument;
    exports.createMockActiveDocument        = createMockActiveDocument;
    exports.createMockElement               = createMockElement;
    exports.createMockEditorForDocument     = createMockEditorForDocument;
    exports.createMockEditor                = createMockEditor;
    exports.createMockPane                  = createMockPane;
    exports.createTestWindowAndRun          = createTestWindowAndRun;
    exports.reloadWindow                    = reloadWindow;
    exports.closeTestWindow                 = closeTestWindow;
    exports.clickDialogButton               = clickDialogButton;
    exports.destroyMockEditor               = destroyMockEditor;
    exports.loadProjectInTestWindow         = loadProjectInTestWindow;
    exports.openProjectFiles                = openProjectFiles;
    exports.openFiles                       = openFiles;
    exports.toggleQuickEditAtOffset         = toggleQuickEditAtOffset;
    exports.createTextFile                  = createTextFile;
    exports.createTextFileAsync             = createTextFileAsync;
    exports.readTextFileAsync             = readTextFileAsync;
    exports.copyDirectoryEntry              = copyDirectoryEntry;
    exports.copyFileEntry                   = copyFileEntry;
    exports.copyPath                        = copyPath;
    exports.deletePath                      = deletePath;
    exports.deletePathAsync                 = deletePathAsync;
    exports.pathExists                      = pathExists;
    exports.ensureExistsDirAsync            = ensureExistsDirAsync;
    exports.waitTillPathExists              = waitTillPathExists;
    exports.waitTillPathNotExists           = waitTillPathNotExists;
    exports.waitForModalDialog              = waitForModalDialog;
    exports.waitForNoModalDialog            = waitForNoModalDialog;
    exports.waitForBracketsDoneLoading      = waitForBracketsDoneLoading;
    exports.getTestWindow                   = getTestWindow;
    exports.simulateKeyEvent                = simulateKeyEvent;
    exports.setLoadExtensionsInTestWindow   = setLoadExtensionsInTestWindow;
    exports.parseOffsetsFromText            = parseOffsetsFromText;
    exports.findDOMText                     = findDOMText;
    exports.injectIntoGetAllFiles           = injectIntoGetAllFiles;
    exports.countSpecs                      = countSpecs;
    exports.removeTempDirectory             = removeTempDirectory;
    exports.setUnitTestReporter             = setUnitTestReporter;
    exports.resizeEditor                    = resizeEditor;
    exports.editorHasCursorPosition            = editorHasCursorPosition;
    exports.jsPromise                       = jsPromise;
});
