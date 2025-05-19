define(function (require, exports, module) {
    var PreferencesManager = require("preferences/PreferencesManager"),
        CommandManager = require("command/CommandManager"),
        Menus = require("command/Menus"),
        DocumentManager = require("document/DocumentManager"),
        EditorManager = require("editor/EditorManager"),
        _ = require("thirdparty/lodash");

    const AppInit = require("utils/AppInit");

    var BookmarksView = require("./bookmarksView").BookmarksView;

    /** @const {string} Extension Command ID */
    var MY_MODULENAME = "bracketsEditorBookmarks";
    var CMD_TOGGLE_BOOKMARK = "bracketsEditorBookmarks.toggleBookmark",
        CMD_GOTO_NEXT_BOOKMARK = "bracketsEditorBookmarks.gotoNextBookmark",
        CMD_GOTO_PREV_BOOKMARK = "bracketsEditorBookmarks.gotoPrevBookmark",
        CMD_TOGGLE_BOOKKMARK_VIEW = "bracketsEditorBookmarks.toggleBookmarksPanel";

    const ExtensionStrings = {
        TOGGLE_BOOKMARK: "Toggle Bookmark",
        GOTO_PREV_BOOKMARK: "Go to previous Bookmark",
        GOTO_NEXT_BOOKMARK: "Go to next Bookmark",
        TOGGLE_BOOKMARKS_PANEL: "Toggle Bookmarks panel"
    };

    /* Our extension's preferences */
    var prefs = PreferencesManager.getExtensionPrefs(MY_MODULENAME);

    // Bookmarks Data Model
    var _bookmarks = {};

    // Bookmarks Panel
    var _bookmarksPanel = null;

    /**
     * Saves bookmarks to the data model for the specified editor instance
     * @param {Editor=} editor - brackets editor instance. current editor if null
     * @return {?Array.<Number>} array of cached bookmarked line numbers
     */
    function saveBookmarks(editor) {
        if (!editor) {
            editor = EditorManager.getCurrentFullEditor();
        }
        if (editor) {
            var i,
                fullPath = editor.document.file.fullPath,
                cm = editor._codeMirror,
                lineCount = cm.doc.lineCount(),
                bookmarkedLines = [];

            for (i = 0; i < lineCount; i++) {
                var lineInfo = cm.lineInfo(i);

                if (lineInfo.wrapClass && lineInfo.wrapClass.indexOf("bookmark") >= 0) {
                    bookmarkedLines.push(i);
                }
            }

            // we need to sort so that go to next bookmark works
            bookmarkedLines.sort(function (a, b) {
                return a > b;
            });

            _bookmarks[fullPath] = bookmarkedLines;
            prefs.set("bookmarks", _bookmarks);

            $(_bookmarks).triggerHandler("change");

            // return the bookmarks for the editor
            return bookmarkedLines;
        }
        return null;
    }

    /**
     * Updates bookmarks for the current editor if necessary
     * @param {Editor=} editor - brackets editor instance. current editor if null
     * @return {Boolean} true if there are bookmarks for the current editor, false if not
     */
    function updateBookmarksForCurrentEditor() {
        var result = false,
            editor = EditorManager.getCurrentFullEditor();
        if (editor) {
            var fullPath = editor.document.file.fullPath,
                bm = _bookmarks[fullPath];

            // if there was already data then we
            //  don't need to rebuild it
            result = bm && bm.length;

            if (!result) {
                // there was no deta for this file so
                //  rebuild the model just for this file
                //  from what is in the editor currently
                result = Boolean(saveBookmarks(editor));
            }
        }

        return result;
    }

    /**
     * Resets the bookmarks for the file opened in the specified editor
     * NOTE: When the bookmarks for the current editor are needed
     *          (for traversal or to update the bookmarks panel),
     *          updateBookmarksForCurrentEditor is called which updates
     *          incrementally the bookmarks for the current file
     * @param {!Editor} editor - brackets editor instance
     */
    function resetBookmarks(editor) {
        if (editor) {
            delete _bookmarks[editor.document.file.fullPath];
            $(_bookmarks).triggerHandler("change");
        }
    }

    /**
     * Loads the cached bookmarks into the specified editor instance
     * @param {Editor=} editor - brackets editor instance. current editor if null
     */
    function loadBookmarks(editor) {
        if (!editor) {
            editor = EditorManager.getCurrentFullEditor();
        }
        if (editor) {
            var cm = editor._codeMirror,
                bm = _bookmarks[editor.document.file.fullPath];

            if (bm) {
                bm.forEach(function (lineNo) {
                    if (lineNo < cm.doc.lineCount()) {
                        cm.addLineClass(lineNo, "wrap", "bookmark");
                    }
                });
            }
        }
    }

    /**
     * Removes all bookmarks from the editor
     * @param {!Editor} editor - brackets editor instance.
     */
    function clearBookmarks(editor) {
        var i,
            cm = editor._codeMirror,
            lineCount = cm.doc.lineCount();

        for (i = 0; i < lineCount; i++) {
            cm.removeLineClass(i, "wrap", "bookmark");
        }
    }

    /**
     * Resets all bookmark model data so it can be re-read from prefs
     */
    function resetModel() {
        Object.keys(_bookmarks).forEach(function (prop) {
            delete _bookmarks[prop];
        });
    }

    /**
     * Loads bookmark model from prefs
     */
    function loadModel() {
        resetModel();
        _.assign(_bookmarks, prefs.get("bookmarks"));
    }

    /**
     * Reloads the bookmark model, clearing the current bookmarks
     * @param {!Editor} editor - brackets editor instance.
     */
    function reloadModel() {
        DocumentManager.getAllOpenDocuments().forEach(function (doc) {
            if (doc._masterEditor) {
                clearBookmarks(doc._masterEditor);
            }
        });

        loadModel();

        DocumentManager.getAllOpenDocuments().forEach(function (doc) {
            if (doc._masterEditor) {
                loadBookmarks(doc._masterEditor);
            }
        });

        // update the panel
        $(_bookmarks).triggerHandler("change");
    }

    /**
     * Moves the cursor position of the current editor to the next bookmark
     * @param {!Editor} editor - brackets editor instance
     */
    function gotoNextBookmark(forward) {
        if (updateBookmarksForCurrentEditor()) {
            var editor = EditorManager.getCurrentFullEditor(),
                cursor = editor.getCursorPos(),
                bm = _bookmarks[editor.document.file.fullPath];

            var doJump = function (lineNo) {
                editor.setCursorPos(lineNo, 0);

                var cm = editor._codeMirror;
                cm.addLineClass(lineNo, "wrap", "bookmark-notify");
                setTimeout(function () {
                    cm.removeLineClass(lineNo, "wrap", "bookmark-notify");
                }, 100);
            };

            // find next bookmark
            var index;
            for (
                index = forward ? 0 : bm.length - 1;
                forward ? index < bm.length : index >= 0;
                forward ? index++ : index--
            ) {
                if (forward) {
                    if (bm[index] > cursor.line) {
                        doJump(bm[index]);
                        return;
                    }
                    if (index === bm.length - 1) {
                        // wrap around just pick the first one in the list
                        if (bm[0] !== cursor.line) {
                            doJump(bm[0]);
                        }
                        return;
                    }
                } else {
                    if (bm[index] < cursor.line) {
                        doJump(bm[index]);
                        return;
                    }
                    if (index === 0) {
                        // wrap around just pick the last one in the list
                        if (bm[bm.length - 1] !== cursor.line) {
                            doJump(bm[bm.length - 1]);
                        }
                        return;
                    }
                }
            }
        }
    }

    /**
     * Toogles the bookmarked state of the current line of the current editor
     */
    function toggleBookmark() {
        var editor = EditorManager.getCurrentFullEditor();
        if (editor) {
            var cursor = editor.getCursorPos(),
                lineNo = cursor.line,
                cm = editor._codeMirror,
                lineInfo = cm.lineInfo(cursor.line);

            if (!lineInfo.wrapClass || lineInfo.wrapClass.indexOf("bookmark") === -1) {
                cm.addLineClass(lineNo, "wrap", "bookmark");
            } else {
                cm.removeLineClass(lineNo, "wrap", "bookmark");
            }
            resetBookmarks(editor);
        }
    }

    /**
     * Creates the bookmarks panel if it's truly needed
     * @param {Boolean} panelRequired - true if panel is required. False if not
     */
    function createBookmarksPanelIfNecessary(panelRequired) {
        if (!_bookmarksPanel && panelRequired) {
            _bookmarksPanel = new BookmarksView(_bookmarks, updateBookmarksForCurrentEditor);

            $(_bookmarksPanel).on("close", function () {
                CommandManager.get(CMD_TOGGLE_BOOKKMARK_VIEW).setChecked(_bookmarksPanel.isOpen());
            });
        }
    }

    /**
     * Shows the bookmarks panel
     * @param {Boolean} show - true to show the panel, false to hide it
     * @param {{show:string=}=} options - undefined, {show: undefined|"opened"|"project"|"all"}, defaults to "opened"
     */
    function showBookmarksPanel(show, options) {
        // we only need to create it if we're showing it
        createBookmarksPanelIfNecessary(show);
        if (!_bookmarksPanel) {
            // nothing to do, panel wasn't created
            return;
        }

        // show/hide the panel
        if (show) {
            _bookmarksPanel.open(options);
        } else {
            _bookmarksPanel.close();
        }

        // update the command state
        CommandManager.get(CMD_TOGGLE_BOOKKMARK_VIEW).setChecked(_bookmarksPanel.isOpen());
    }

    /**
     * Creates and/or Shows or Hides the bookmarks panel
     */
    function toggleBookmarksPanel() {
        // always create it
        createBookmarksPanelIfNecessary(true);
        showBookmarksPanel(!_bookmarksPanel.isOpen(), prefs.get("viewOptions"));
        // Since this is the only user-facing command then
        //  we can safely update the prefs here...
        // Updating it in showBookmarksPanel could result in
        //  a race condition so we would need a way to
        //  indicate whether we were initializing from prefs
        //  or some other method in showBookmarksPanel.
        // For now, we can just assume that showBookmarksPanel
        //  is not a consumable API, just a helper
        prefs.set("panelVisible", _bookmarksPanel.isOpen());
    }

    /**
     * Updates the state from prefs
     */
    function updateFromPrefs() {
        reloadModel();
        showBookmarksPanel(prefs.get("panelVisible"), prefs.get("viewOptions"));
    }

    AppInit.appReady(function () {
        // register our commands
        CommandManager.register(ExtensionStrings.TOGGLE_BOOKMARK, CMD_TOGGLE_BOOKMARK, toggleBookmark);
        CommandManager.register(
            ExtensionStrings.GOTO_PREV_BOOKMARK,
            CMD_GOTO_PREV_BOOKMARK,
            _.partial(gotoNextBookmark, false)
        );
        CommandManager.register(
            ExtensionStrings.GOTO_NEXT_BOOKMARK,
            CMD_GOTO_NEXT_BOOKMARK,
            _.partial(gotoNextBookmark, true)
        );

        // add our menu items
        var menu = Menus.getMenu(Menus.AppMenuBar.NAVIGATE_MENU);

        menu.addMenuDivider();
        menu.addMenuItem(CMD_TOGGLE_BOOKMARK, "Ctrl-Shift-K");
        menu.addMenuItem(CMD_GOTO_NEXT_BOOKMARK, "Ctrl-P");
        menu.addMenuItem(CMD_GOTO_PREV_BOOKMARK, "Ctrl-Shift-P");

        menu = Menus.getMenu(Menus.AppMenuBar.VIEW_MENU);
        CommandManager.register(
            ExtensionStrings.TOGGLE_BOOKMARKS_PANEL,
            CMD_TOGGLE_BOOKKMARK_VIEW,
            toggleBookmarksPanel
        );
        menu.addMenuDivider();
        menu.addMenuItem(CMD_TOGGLE_BOOKKMARK_VIEW);

        // define prefs
        prefs.definePreference("bookmarks", "object", {});
        prefs.definePreference("panelVisible", "boolean", false);
        prefs.definePreference("viewOptions", "object", {});

        // Initialize
        loadModel();
        showBookmarksPanel(prefs.get("panelVisible"), prefs.get("viewOptions"));

        // event handlers
        // NOTE: this is an undocumented, unsupported event fired when an editor is created
        // @TODO: invent a standard event
        EditorManager.on("_fullEditorCreatedForDocument", function (e, document, editor) {
            editor.on("beforeDestroy.bookmarks", function () {
                saveBookmarks(editor);
                editor.off(".bookmarks");
                document.off(".bookmarks");
            });
            document.on("change.bookmarks", function () {
                resetBookmarks(editor);
            });
            loadBookmarks(editor);
        });

        // prefs change handler, dump everything and reload from prefs
        prefs.on("change", updateFromPrefs);
    });
});
