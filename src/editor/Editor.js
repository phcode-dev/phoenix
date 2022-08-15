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

/**
 * Editor is a 1-to-1 wrapper for a CodeMirror editor instance. It layers on Brackets-specific
 * functionality and provides APIs that cleanly pass through the bits of CodeMirror that the rest
 * of our codebase may want to interact with. An Editor is always backed by a Document, and stays
 * in sync with its content; because Editor keeps the Document alive, it's important to always
 * destroy() an Editor that's going away so it can release its Document ref.
 *
 * For now, there's a distinction between the "master" Editor for a Document - which secretly acts
 * as the Document's internal model of the text state - and the multitude of "slave" secondary Editors
 * which, via Document, sync their changes to and from that master.
 *
 * For now, direct access to the underlying CodeMirror object is still possible via `_codeMirror` --
 * but this is considered deprecated and may go away.
 *
 * The Editor object dispatches the following events:
 *    - keydown, keypress, keyup -- When any key event happens in the editor (whether it changes the
 *      text or not). Handlers are passed `(BracketsEvent, Editor, KeyboardEvent)`. The 3nd arg is the
 *      raw DOM event. Note: most listeners will only want to listen for "keypress".
 *    - cursorActivity -- When the user moves the cursor or changes the selection, or an edit occurs.
 *      Note: do not listen to this in order to be generally informed of edits--listen to the
 *      "change" event on Document instead.
 *    - scroll -- When the editor is scrolled, either by user action or programmatically.
 *    - lostContent -- When the backing Document changes in such a way that this Editor is no longer
 *      able to display accurate text. This occurs if the Document's file is deleted, or in certain
 *      Document->editor syncing edge cases that we do not yet support (the latter cause will
 *      eventually go away).
 *    - optionChange -- Triggered when an option for the editor is changed. The 2nd arg to the listener
 *      is a string containing the editor option that is changing. The 3rd arg, which can be any
 *      data type, is the new value for the editor option.
 *    - beforeDestroy - Triggered before the object is about to dispose of all its internal state data
 *      so that listeners can cache things like scroll pos, etc...
 *
 * The Editor also dispatches "change" events internally, but you should listen for those on
 * Documents, not Editors.
 *
 * To listen for events, do something like this: (see EventDispatcher for details on this pattern)
 *     `editorInstance.on("eventname", handler);`
 */
define(function (require, exports, module) {


    let AnimationUtils     = require("utils/AnimationUtils"),
        Async              = require("utils/Async"),
        CodeMirror         = require("thirdparty/CodeMirror/lib/codemirror"),
        LanguageManager    = require("language/LanguageManager"),
        EventDispatcher    = require("utils/EventDispatcher"),
        PerfUtils          = require("utils/PerfUtils"),
        PreferencesManager = require("preferences/PreferencesManager"),
        TextRange          = require("document/TextRange").TextRange,
        TokenUtils         = require("utils/TokenUtils"),
        HTMLUtils          = require("language/HTMLUtils"),
        MainViewManager    = require("view/MainViewManager"),
        _                  = require("thirdparty/lodash");

    /** Editor helpers */

    let IndentHelper = require("./EditorHelper/IndentHelper"),
        EditorPreferences = require("./EditorHelper/EditorPreferences"),
        ChangeHelper = require("./EditorHelper/ChangeHelper"),
        ErrorPopupHelper = require("./EditorHelper/ErrorPopupHelper"),
        InlineWidgetHelper = require("./EditorHelper/InlineWidgetHelper");

    /** Editor preferences */

    /**
     * A list of gutter name and priorities currently registered for editors.
     * The line number gutter is defined as { name: LINE_NUMBER_GUTTER, priority: 100 }
     * @type {Array.<{name: string, priority: number, languageIds: Array}}
     */
    let registeredGutters = [];

    let cmOptions         = {};

    EditorPreferences.init(cmOptions);

    const CLOSE_BRACKETS    = EditorPreferences.CLOSE_BRACKETS,
        CLOSE_TAGS          = EditorPreferences.CLOSE_TAGS,
        DRAG_DROP           = EditorPreferences.DRAG_DROP,
        HIGHLIGHT_MATCHES   = EditorPreferences.HIGHLIGHT_MATCHES,
        LINEWISE_COPY_CUT   = EditorPreferences.LINEWISE_COPY_CUT,
        SCROLL_PAST_END     = EditorPreferences.SCROLL_PAST_END,
        SHOW_CURSOR_SELECT  = EditorPreferences.SHOW_CURSOR_SELECT,
        SHOW_LINE_NUMBERS   = EditorPreferences.SHOW_LINE_NUMBERS,
        SMART_INDENT        = EditorPreferences.SMART_INDENT,
        SPACE_UNITS         = EditorPreferences.SPACE_UNITS,
        STYLE_ACTIVE_LINE   = EditorPreferences.STYLE_ACTIVE_LINE,
        TAB_SIZE            = EditorPreferences.TAB_SIZE,
        USE_TAB_CHAR        = EditorPreferences.USE_TAB_CHAR,
        WORD_WRAP           = EditorPreferences.WORD_WRAP,
        INDENT_LINE_COMMENT   = EditorPreferences.INDENT_LINE_COMMENT,
        INPUT_STYLE         = EditorPreferences.INPUT_STYLE;

    const LINE_NUMBER_GUTTER = EditorPreferences.LINE_NUMBER_GUTTER,
        LINE_NUMBER_GUTTER_PRIORITY     = EditorPreferences.LINE_NUMBER_GUTTER_PRIORITY,
        CODE_FOLDING_GUTTER_PRIORITY    = EditorPreferences.CODE_FOLDING_GUTTER_PRIORITY;

    let editorOptions = Object.keys(cmOptions);

    /** Editor preferences */

    /**
     * Guard flag to prevent focus() reentrancy (via blur handlers), even across Editors
     * @type {boolean}
     */
    var _duringFocus = false;

    /**
     * Constant: ignore upper boundary when centering text
     * Constant: bulls-eye = strictly centre always
     * @type {number}
     */
    var BOUNDARY_CHECK_NORMAL   = 0,
        BOUNDARY_IGNORE_TOP     = 1,
        BOUNDARY_BULLSEYE      = 2;

    /**
     * @private
     * Create a copy of the given CodeMirror position
     * @param {!CodeMirror.Pos} pos
     * @return {CodeMirror.Pos}
     */
    function _copyPos(pos) {
        return new CodeMirror.Pos(pos.line, pos.ch);
    }

    /**
     * Helper functions to check options.
     * @param {number} options BOUNDARY_CHECK_NORMAL or BOUNDARY_IGNORE_TOP
     */
    function _checkTopBoundary(options) {
        return (options !== BOUNDARY_IGNORE_TOP);
    }

    function _checkBottomBoundary(options) {
        return true;
    }

    /**
     * Helper function to build preferences context based on the full path of
     * the file.
     *
     * @param {string} fullPath Full path of the file
     *
     * @return {*} A context for the specified file name
     */
    function _buildPreferencesContext(fullPath) {
        return PreferencesManager._buildContext(fullPath,
            fullPath ? LanguageManager.getLanguageForPath(fullPath).getId() : undefined);
    }

    /**
     * List of all current (non-destroy()ed) Editor instances. Needed when changing global preferences
     * that affect all editors, e.g. tabbing or color scheme settings.
     * @type {Array.<Editor>}
     */
    var _instances = [];

    /**
     * Creates a new CodeMirror editor instance bound to the given Document. The Document need not have
     * a "master" Editor realized yet, even if makeMasterEditor is false; in that case, the first time
     * an edit occurs we will automatically ask EditorManager to create a "master" editor to render the
     * Document modifiable.
     *
     * ALWAYS call destroy() when you are done with an Editor - otherwise it will leak a Document ref.
     *
     * @constructor
     *
     * @param {!Document} document
     * @param {!boolean} makeMasterEditor  If true, this Editor will set itself as the (secret) "master"
     *          Editor for the Document. If false, this Editor will attach to the Document as a "slave"/
     *          secondary editor.
     * @param {!jQueryObject|DomNode} container  Container to add the editor to.
     * @param {{startLine: number, endLine: number}=} range If specified, range of lines within the document
     *          to display in this editor. Inclusive.
     * @param {!Object} options If specified, contains editor options that can be passed to CodeMirror
     */
    function Editor(document, makeMasterEditor, container, range, options) {
        var self = this;

        var isReadOnly = (options && options.isReadOnly) || !document.editable;

        _instances.push(this);

        // Attach to document: add ref & handlers
        this.document = document;
        document.addRef();

        if (container.jquery) {
            // CodeMirror wants a DOM element, not a jQuery wrapper
            container = container.get(0);
        }

        let $container = $(container);
        $container.addClass("editor-holder");

        if (range) {    // attach this first: want range updated before we process a change
            this._visibleRange = new TextRange(document, range.startLine, range.endLine);
        }

        // store this-bound version of listeners so we can remove them later
        this._handleDocumentChange = this._handleDocumentChange.bind(this);
        this._handleDocumentDeleted = this._handleDocumentDeleted.bind(this);
        this._handleDocumentLanguageChanged = this._handleDocumentLanguageChanged.bind(this);
        this._doWorkingSetSync = this._doWorkingSetSync.bind(this);
        document.on("change", this._handleDocumentChange);
        document.on("deleted", this._handleDocumentDeleted);
        document.on("languageChanged", this._handleDocumentLanguageChanged);
        // To sync working sets if the view is for same doc across panes
        document.on("_dirtyFlagChange", this._doWorkingSetSync);

        var mode = this._getModeFromDocument();

        // (if makeMasterEditor, we attach the Doc back to ourselves below once we're fully initialized)

        this._inlineWidgets = [];
        this._inlineWidgetQueues = {};
        this._hideMarks = [];
        this._lastEditorWidth = null;

        this._markTypesMap = {};

        this._$messagePopover = null;

        // To track which pane the editor is being attached to if it's a full editor
        this._paneId = null;

        // To track the parent editor ( host editor at that time of creation) of an inline editor
        this._hostEditor = null;

        // Editor supplies some standard keyboard behavior extensions of its own
        var codeMirrorKeyMap = {
            "Tab": function () { self._handleTabKey(); },
            "Shift-Tab": "indentLess",

            "Left": function (instance) {
                self._handleSoftTabNavigation(-1, "moveH");
            },
            "Right": function (instance) {
                self._handleSoftTabNavigation(1, "moveH");
            },
            "Backspace": function (instance) {
                self._handleSoftTabNavigation(-1, "deleteH");
            },
            "Delete": function (instance) {
                self._handleSoftTabNavigation(1, "deleteH");
            },
            "Esc": function (_instance) {
                if(!self.canConsumeEscapeKeyEvent()){
                    return;
                }
                if (self.getSelections().length > 1) { // multi cursor
                    self.clearSelection();
                } else if(self.hasSelection()){
                    self.clearSelection();
                }else {
                    self.removeAllInlineWidgets();
                }
            },
            "Home": "goLineLeftSmart",
            "Cmd-Left": "goLineLeftSmart",
            "End": "goLineRight",
            "Cmd-Right": "goLineRight"
        };

        var currentOptions = this._currentOptions = _.zipObject(
            editorOptions,
            _.map(editorOptions, function (prefName) {
                return self._getOption(prefName);
            })
        );

        //cm: CodeMirror, repeat: "single" | "double" | "triple", event: Event
        // The function is called when the left mouse button is pressed in codemirror
        function _mouseHandlerOverride(_cm, _repeat, event) {
            return {
                addNew: event.altKey // alt key will init multi cursor instead of ctrl-key
            };
        }

        // When panes are created *after* the showLineNumbers option has been turned off
        //  we need to apply the show-line-padding class or the text will be juxtaposed
        //  to the edge of the editor which makes it not easy to read.  The code below to handle
        //  that the option change only applies the class to panes that have already been created
        // This line ensures that the class is applied to any editor created after the fact
        $container.toggleClass("show-line-padding", Boolean(!this._getOption("showLineNumbers")));

        // Create the CodeMirror instance
        // (note: CodeMirror doesn't actually require using 'new', but jslint complains without it)
        this._codeMirror = new CodeMirror(container, {
            autoCloseBrackets: currentOptions[CLOSE_BRACKETS],
            autoCloseTags: currentOptions[CLOSE_TAGS],
            coverGutterNextToScrollbar: true,
            continueComments: true,
            cursorScrollMargin: 3,
            dragDrop: currentOptions[DRAG_DROP],
            electricChars: true,
            configureMouse: _mouseHandlerOverride,
            extraKeys: codeMirrorKeyMap,
            highlightSelectionMatches: currentOptions[HIGHLIGHT_MATCHES],
            indentUnit: currentOptions[USE_TAB_CHAR] ? currentOptions[TAB_SIZE] : currentOptions[SPACE_UNITS],
            indentWithTabs: currentOptions[USE_TAB_CHAR],
            inputStyle: currentOptions[INPUT_STYLE],
            lineNumbers: currentOptions[SHOW_LINE_NUMBERS],
            lineWiseCopyCut: currentOptions[LINEWISE_COPY_CUT],
            lineWrapping: currentOptions[WORD_WRAP],
            matchBrackets: { maxScanLineLength: 50000, maxScanLines: 1000 },
            matchTags: { bothTags: true },
            scrollPastEnd: !range && currentOptions[SCROLL_PAST_END],
            showCursorWhenSelecting: currentOptions[SHOW_CURSOR_SELECT],
            smartIndent: currentOptions[SMART_INDENT],
            styleActiveLine: currentOptions[STYLE_ACTIVE_LINE],
            tabSize: currentOptions[TAB_SIZE],
            readOnly: isReadOnly
        });

        // Can't get CodeMirror's focused state without searching for
        // CodeMirror-focused. Instead, track focus via onFocus and onBlur
        // options and track state with this._focused
        this._focused = false;

        this._installEditorListeners();

        this._renderGutters();

        this.on("cursorActivity", function (event, editor) {
            self._handleCursorActivity(event);
        });
        this.on("keypress", function (event, editor, domEvent) {
            self._handleKeypressEvents(domEvent);
        });
        this.on("change", function (event, editor, changeList) {
            self._handleEditorChange(changeList);
        });
        this.on("focus", function (event, editor) {
            if (self._hostEditor) {
                // Mark the host editor as the master editor for the hosting document
                self._hostEditor.document._toggleMasterEditor(self._hostEditor);
            } else {
                // Set this full editor as master editor for the document
                self.document._toggleMasterEditor(self);
            }
        });

        // Set code-coloring mode BEFORE populating with text, to avoid a flash of uncolored text
        this._codeMirror.setOption("mode", mode);

        // Initially populate with text. This will send a spurious change event, so need to make
        // sure this is understood as a 'sync from document' case, not a genuine edit
        this._duringSync = true;
        this._resetText(document.getText());
        this._duringSync = false;

        if (range) {
            this._updateHiddenLines();
            this.setCursorPos(range.startLine, 0);
        }

        // Now that we're fully initialized, we can point the document back at us if needed
        if (makeMasterEditor) {
            document._makeEditable(this);
        }

        // Add scrollTop property to this object for the scroll shadow code to use
        Object.defineProperty(this, "scrollTop", {
            get: function () {
                return this._codeMirror.getScrollInfo().top;
            }
        });

        // Add an $el getter for Pane Views
        Object.defineProperty(this,  "$el", {
            get: function () {
                return $(this.getRootElement());
            }
        });
    }

    EventDispatcher.makeEventDispatcher(Editor.prototype);
    EventDispatcher.markDeprecated(Editor.prototype, "keyEvent", "'keydown/press/up'");

    IndentHelper.addHelpers(Editor);
    ChangeHelper.addHelpers(Editor);
    InlineWidgetHelper.addHelpers(Editor);

    Editor.prototype.markPaneId = function (paneId) {
        this._paneId = paneId;

        // Also add this to the pool of full editors
        this.document._associateEditor(this);

        // In case this Editor is initialized not as the first full editor for the document
        // and the document is already dirty and present in another working set, make sure
        // to add this documents to the new panes working set.
        this._doWorkingSetSync(null, this.document);
    };

    /**
     * Gets the inline widgets below the current cursor position or null.
     * @return {boolean}
     */
    Editor.prototype.getInlineWidgetsBelowCursor = function () {
        let self = this;
        let cursor = self.getCursorPos();
        let line = cursor.line;
        return  self.getAllInlineWidgetsForLine(line);
    };

    /**
     * returns true if the editor can do something an escape key event. Eg. Disable multi cursor escape
     */
    Editor.prototype.canConsumeEscapeKeyEvent = function () {
        let self = this;
        return (self.getSelections().length > 1) // multi cursor should go away on escape
            || (self.hasSelection()) // selection should go away on escape
            || self.getInlineWidgetsBelowCursor() // inline widget is below cursor
            || self.getFocusedInlineWidget(); // inline widget
    };

    Editor.prototype._doWorkingSetSync = function (event, doc) {
        if (doc === this.document && this._paneId && this.document.isDirty) {
            MainViewManager.addToWorkingSet(this._paneId, this.document.file, -1, false);
        }
    };

    /**
     * Removes this editor from the DOM and detaches from the Document. If this is the "master"
     * Editor that is secretly providing the Document's backing state, then the Document reverts to
     * a read-only string-backed mode.
     */
    Editor.prototype.destroy = function () {
        this.trigger("beforeDestroy", this);

        // CodeMirror docs for getWrapperElement() say all you have to do is "Remove this from your
        // tree to delete an editor instance."
        $(this.getRootElement()).remove();

        _instances.splice(_instances.indexOf(this), 1);

        // Disconnect from Document
        this.document.releaseRef();
        this.document.off("change", this._handleDocumentChange);
        this.document.off("deleted", this._handleDocumentDeleted);
        this.document.off("languageChanged", this._handleDocumentLanguageChanged);
        this.document.off("_dirtyFlagChange", this._doWorkingSetSync);

        if (this._visibleRange) {   // TextRange also refs the Document
            this._visibleRange.dispose();
        }

        // If we're the Document's master editor, disconnecting from it has special meaning
        if (this.document._masterEditor === this) {
            this.document._makeNonEditable();
        } else {
            this.document._disassociateEditor(this);
        }

        // Destroying us destroys any inline widgets we're hosting. Make sure their closeCallbacks
        // run, at least, since they may also need to release Document refs
        var self = this;
        this._inlineWidgets.forEach(function (inlineWidget) {
            self._removeInlineWidgetInternal(inlineWidget);
        });
    };

    /**
     * @private
     * Handle any cursor movement in editor, including selecting and unselecting text.
     * @param {!Event} event
     */
    Editor.prototype._handleCursorActivity = function (event) {
        this._updateStyleActiveLine();
    };

    /**
     * @private
     * Removes any whitespace after one of ]{}) to prevent trailing whitespace when auto-indenting
     */
    Editor.prototype._handleWhitespaceForElectricChars = function () {
        var self        = this,
            instance    = this._codeMirror,
            selections,
            lineStr;

        selections = this.getSelections().map(function (sel) {
            lineStr = instance.getLine(sel.end.line);

            if (lineStr && !/\S/.test(lineStr)) {
                // if the line is all whitespace, move the cursor to the end of the line
                // before indenting so that embedded whitespace such as indents are not
                // orphaned to the right of the electric char being inserted
                sel.end.ch = self.document.getLine(sel.end.line).length;
            }
            return sel;
        });
        this.setSelections(selections);
    };

    /**
     * @private
     * Handle CodeMirror key events.
     * @param {!Event} event
     */
    Editor.prototype._handleKeypressEvents = function (event) {
        var keyStr = String.fromCharCode(event.which || event.keyCode);

        if (/[\]\{\}\)]/.test(keyStr)) {
            this._handleWhitespaceForElectricChars();
        }
    };

    /**
     * Determine the mode to use from the document's language
     * Uses "text/plain" if the language does not define a mode
     * @return {string} The mode to use
     */
    Editor.prototype._getModeFromDocument = function () {
        // We'd like undefined/null/"" to mean plain text mode. CodeMirror defaults to plaintext for any
        // unrecognized mode, but it complains on the console in that fallback case: so, convert
        // here so we're always explicit, avoiding console noise.
        return this.document.getLanguage().getMode() || "text/plain";
    };


    /**
     * Selects all text and maintains the current scroll position.
     */
    Editor.prototype.selectAllNoScroll = function () {
        var cm = this._codeMirror,
            info = this._codeMirror.getScrollInfo();

        // Note that we do not have to check for the visible range here. This
        // concern is handled internally by code mirror.
        cm.operation(function () {
            cm.scrollTo(info.left, info.top);
            cm.execCommand("selectAll");
        });
    };

    /**
     * @return {boolean} True if editor is not showing the entire text of the document (i.e. an inline editor)
     */
    Editor.prototype.isTextSubset = function () {
        return Boolean(this._visibleRange);
    };

    /**
     * Ensures that the lines that are actually hidden in the inline editor correspond to
     * the desired visible range.
     */
    Editor.prototype._updateHiddenLines = function () {
        if (this._visibleRange) {
            var cm = this._codeMirror,
                self = this;
            cm.operation(function () {
                self._hideMarks.forEach(function (mark) {
                    if (mark) {
                        mark.clear();
                    }
                });
                self._hideMarks = [];
                self._hideMarks.push(self._hideLines(0, self._visibleRange.startLine));
                self._hideMarks.push(self._hideLines(self._visibleRange.endLine + 1, self.lineCount()));
            });
        }
    };

    /**
     * Sets the contents of the editor, clears the undo/redo history and marks the document clean. Dispatches a change event.
     * Semi-private: only Document should call this.
     * @param {!string} text
     */
    Editor.prototype._resetText = function (text) {
        var currentText = this._codeMirror.getValue();

        // compare with ignoring line-endings, issue #11826
        var textLF = text ? text.replace(/(\r\n|\r|\n)/g, "\n") : null;
        var currentTextLF = currentText ? currentText.replace(/(\r\n|\r|\n)/g, "\n") : null;
        if (textLF === currentTextLF) {
            // there's nothing to reset
            return;
        }

        var perfTimerName = PerfUtils.markStart("Editor._resetText()\t" + (!this.document || this.document.file.fullPath));

        var cursorPos = this.getCursorPos(),
            scrollPos = this.getScrollPos();

        // This *will* fire a change event, but we clear the undo immediately afterward
        this._codeMirror.setValue(text);
        this._codeMirror.refresh();

        // Make sure we can't undo back to the empty state before setValue(), and mark
        // the document clean.
        this._codeMirror.clearHistory();
        this._codeMirror.markClean();

        // restore cursor and scroll positions
        this.setCursorPos(cursorPos);
        this.setScrollPos(scrollPos.x, scrollPos.y);

        PerfUtils.addMeasurement(perfTimerName);
    };

   /**
    * Gets the file associated with this editor
    * This is a required Pane-View interface method
    * @return {!File} the file associated with this editor
    */
    Editor.prototype.getFile = function () {
        return this.document.file;
    };

    /**
     * Gets the current cursor position within the editor.
     * @param {?boolean} [expandTabs]  If true, return the actual visual column number instead of the character offset in
     *      the "ch" property.
     * @param {?string} [which] Optional string indicating which end of the
     *  selection to return. It may be "start", "end", "head" (the side of the
     *  selection that moves when you press shift+arrow), or "anchor" (the
     *  fixed side of the selection). Omitting the argument is the same as
     *  passing "head". A {line, ch} object will be returned.)
     * @return {!{line:number, ch:number}}
     */
    Editor.prototype.getCursorPos = function (expandTabs, which) {
        // Translate "start" and "end" to the official CM names (it actually
        // supports them as-is, but that isn't documented and we don't want to
        // rely on it).
        if (which === "start") {
            which = "from";
        } else if (which === "end") {
            which = "to";
        }
        var cursor = _copyPos(this._codeMirror.getCursor(which));

        if (expandTabs) {
            cursor.ch = this.getColOffset(cursor);
        }
        return cursor;
    };

    /**
     * Returns the display column (zero-based) for a given string-based pos. Differs from pos.ch only
     * when the line contains preceding \t chars. Result depends on the current tab size setting.
     * @param {!{line:number, ch:number}} pos
     * @return {number}
     */
    Editor.prototype.getColOffset = function (pos) {
        var line    = this._codeMirror.getRange({line: pos.line, ch: 0}, pos),
            tabSize = null,
            column  = 0,
            i;

        for (i = 0; i < line.length; i++) {
            if (line[i] === '\t') {
                if (tabSize === null) {
                    tabSize = Editor.getTabSize();
                }
                if (tabSize > 0) {
                    column += (tabSize - (column % tabSize));
                }
            } else {
                column++;
            }
        }
        return column;
    };

    /**
     * Returns the string-based pos for a given display column (zero-based) in given line. Differs from column
     * only when the line contains preceding \t chars. Result depends on the current tab size setting.
     * @param {number} lineNum Line number
     * @param {number} column Display column number
     * @return {number}
     */
    Editor.prototype.getCharIndexForColumn = function (lineNum, column) {
        var line    = this._codeMirror.getLine(lineNum),
            tabSize = null,
            iCol    = 0,
            i;

        for (i = 0; iCol < column; i++) {
            if (line[i] === '\t') {
                if (tabSize === null) {
                    tabSize = Editor.getTabSize();
                }
                if (tabSize > 0) {
                    iCol += (tabSize - (iCol % tabSize));
                }
            } else {
                iCol++;
            }
        }
        return i;
    };

    /**
     * Sets the cursor position within the editor. Removes any selection.
     * @param {number} line  The 0 based line number.
     * @param {number} ch  The 0 based character position; treated as 0 if unspecified.
     * @param {boolean=} center  True if the view should be centered on the new cursor position.
     * @param {boolean=} expandTabs  If true, use the actual visual column number instead of the character offset as
     *      the "ch" parameter.
     */
    Editor.prototype.setCursorPos = function (line, ch, center, expandTabs) {
        if (expandTabs) {
            ch = this.getColOffset({line: line, ch: ch});
        }
        this._codeMirror.setCursor(line, ch);
        if (center) {
            this.centerOnCursor();
        }
    };

    /**
     * Set the editor size in pixels or percentage
     * @param {(number|string)} width
     * @param {(number|string)} height
     */
    Editor.prototype.setSize = function (width, height) {
        this._codeMirror.setSize(width, height);
    };

    /** @const */
    var CENTERING_MARGIN = 0.15;

    /**
     * Scrolls the editor viewport to vertically center the line with the cursor,
     * but only if the cursor is currently near the edges of the viewport or
     * entirely outside the viewport.
     *
     * This does not alter the horizontal scroll position.
     *
     * @param {number} centerOptions Option value, or 0 for no options; one of the BOUNDARY_* constants above.
     */
    Editor.prototype.centerOnCursor = function (centerOptions) {
        let $scrollerElement = $(this.getScrollerElement());
        let editorHeight = $scrollerElement.height();

        // we need to make adjustments for the statusbar's padding on the bottom and the menu bar on top.
        let statusBarHeight = $("#status-bar").height();

        let documentCursorPosition = this._codeMirror.cursorCoords(null, "local").bottom;
        let screenCursorPosition = this._codeMirror.cursorCoords(null, "page").bottom;

        if(centerOptions === BOUNDARY_BULLSEYE){
            let pos = documentCursorPosition - editorHeight / 2 + statusBarHeight;
            this.setScrollPos(null, pos);
            return;
        }
        // If the cursor is already reasonably centered, we won't
        // make any change. "Reasonably centered" is defined as
        // not being within CENTERING_MARGIN of the top or bottom
        // of the editor (where CENTERING_MARGIN is a percentage
        // of the editor height).
        // For finding the first item (i.e. find while typing), do
        // not center if hit is in first half of screen because this
        // appears to be an unnecesary scroll.
        if ((_checkTopBoundary(centerOptions) && (screenCursorPosition < editorHeight * CENTERING_MARGIN)) ||
                (_checkBottomBoundary(centerOptions) && (screenCursorPosition > editorHeight * (1 - CENTERING_MARGIN)))) {

            var pos = documentCursorPosition - editorHeight / 2 + statusBarHeight;
            var info = this._codeMirror.getScrollInfo();
            pos = Math.min(Math.max(pos, 0), (info.height - info.clientHeight));
            this.setScrollPos(null, pos);
        }
    };

    /**
     * Given a position, returns its index within the text (assuming \n newlines)
     * @param {!{line:number, ch:number}}
     * @return {number}
     */
    Editor.prototype.indexFromPos = function (coords) {
        return this._codeMirror.indexFromPos(coords);
    };

    Editor.prototype.posFromIndex = function (index) {
        return this._codeMirror.posFromIndex(index);
    };

    /**
     * Returns true if pos is between start and end (INclusive at start; EXclusive at end by default,
     * but overridable via the endInclusive flag).
     * @param {{line:number, ch:number}} pos
     * @param {{line:number, ch:number}} start
     * @param {{line:number, ch:number}} end
     * @param {boolean} endInclusive
     *
     */
    Editor.prototype.posWithinRange = function (pos, start, end, endInclusive) {
        if (start.line <= pos.line && end.line >= pos.line) {
            if (endInclusive) {
                return (start.line < pos.line || start.ch <= pos.ch) &&  // inclusive
                    (end.line > pos.line   || end.ch >= pos.ch);      // inclusive
            }
            return (start.line < pos.line || start.ch <= pos.ch) &&  // inclusive
                    (end.line > pos.line   || end.ch > pos.ch);       // exclusive


        }
        return false;
    };

    /**
     * @return {boolean} True if there's a text selection; false if there's just an insertion point
     */
    Editor.prototype.hasSelection = function () {
        return this._codeMirror.somethingSelected();
    };

    /**
     * @private
     * Takes an anchor/head pair and returns a start/end pair where the start is guaranteed to be <= end, and a "reversed" flag indicating
     * if the head is before the anchor.
     * @param {!{line: number, ch: number}} anchorPos
     * @param {!{line: number, ch: number}} headPos
     * @return {!{start:{line:number, ch:number}, end:{line:number, ch:number}}, reversed:boolean} the normalized range with start <= end
     */
    function _normalizeRange(anchorPos, headPos) {
        if (headPos.line < anchorPos.line || (headPos.line === anchorPos.line && headPos.ch < anchorPos.ch)) {
            return {start: _copyPos(headPos), end: _copyPos(anchorPos), reversed: true};
        }
        return {start: _copyPos(anchorPos), end: _copyPos(headPos), reversed: false};

    }

    /**
     * Gets the current selection; if there is more than one selection, returns the primary selection
     * (generally the last one made). Start is inclusive, end is exclusive. If there is no selection,
     * returns the current cursor position as both the start and end of the range (i.e. a selection
     * of length zero). If `reversed` is set, then the head of the selection (the end of the selection
     * that would be changed if the user extended the selection) is before the anchor.
     * @return {!{start:{line:number, ch:number}, end:{line:number, ch:number}}, reversed:boolean}
     */
    Editor.prototype.getSelection = function () {
        return _normalizeRange(this.getCursorPos(false, "anchor"), this.getCursorPos(false, "head"));
    };

    /**
     * Returns an array of current selections, nonoverlapping and sorted in document order.
     * Each selection is a start/end pair, with the start guaranteed to come before the end.
     * Cursors are represented as a range whose start is equal to the end.
     * If `reversed` is set, then the head of the selection
     * (the end of the selection that would be changed if the user extended the selection)
     * is before the anchor.
     * If `primary` is set, then that selection is the primary selection.
     * @return {Array.<{start:{line:number, ch:number}, end:{line:number, ch:number}, reversed:boolean, primary:boolean}>}
     */
    Editor.prototype.getSelections = function () {
        var primarySel = this.getSelection();
        return _.map(this._codeMirror.listSelections(), function (sel) {
            var result = _normalizeRange(sel.anchor, sel.head);
            if (result.start.line === primarySel.start.line && result.start.ch === primarySel.start.ch &&
                    result.end.line === primarySel.end.line && result.end.ch === primarySel.end.ch) {
                result.primary = true;
            } else {
                result.primary = false;
            }
            return result;
        });
    };

    /**
     * Takes the given selections, and expands each selection so it encompasses whole lines. Merges
     * adjacent line selections together. Keeps track of each original selection associated with a given
     * line selection (there might be multiple if individual selections were merged into a single line selection).
     * Useful for doing multiple-selection-aware line edits.
     *
     * @param {Array.<{start:{line:number, ch:number}, end:{line:number, ch:number}, reversed:boolean, primary:boolean}>} selections
     *      The selections to expand.
     * @param {{expandEndAtStartOfLine: boolean, mergeAdjacent: boolean}} options
     *      expandEndAtStartOfLine: true if a range selection that ends at the beginning of a line should be expanded
     *          to encompass the line. Default false.
     *      mergeAdjacent: true if adjacent line ranges should be merged. Default true.
     * @return {Array.<{selectionForEdit: {start:{line:number, ch:number}, end:{line:number, ch:number}, reversed:boolean, primary:boolean},
     *                  selectionsToTrack: Array.<{start:{line:number, ch:number}, end:{line:number, ch:number}, reversed:boolean, primary:boolean}>}>}
     *      The combined line selections. For each selection, `selectionForEdit` is the line selection, and `selectionsToTrack` is
     *      the set of original selections that combined to make up the given line selection. Note that the selectionsToTrack will
     *      include the original objects passed in `selections`, so if it is later mutated the original passed-in selections will be
     *      mutated as well.
     */
    Editor.prototype.convertToLineSelections = function (selections, options) {
        var self = this;
        options = options || {};
        _.defaults(options, { expandEndAtStartOfLine: false, mergeAdjacent: true });

        // Combine adjacent lines with selections so they don't collide with each other, as they would
        // if we did them individually.
        var combinedSelections = [], prevSel;
        _.each(selections, function (sel) {
            var newSel = _.cloneDeep(sel);

            // Adjust selection to encompass whole lines.
            newSel.start.ch = 0;
            // The end of the selection becomes the start of the next line, if it isn't already
            // or if expandEndAtStartOfLine is set.
            var hasSelection = (newSel.start.line !== newSel.end.line) || (newSel.start.ch !== newSel.end.ch);
            if (options.expandEndAtStartOfLine || !hasSelection || newSel.end.ch !== 0) {
                newSel.end = {line: newSel.end.line + 1, ch: 0};
            }

            // If the start of the new selection is within the range of the previous (expanded) selection, merge
            // the two selections together, but keep track of all the original selections that were related to this
            // selection, so they can be properly adjusted. (We only have to check for the start being inside the previous
            // range - it can't be before it because the selections started out sorted.)
            if (prevSel && self.posWithinRange(newSel.start, prevSel.selectionForEdit.start, prevSel.selectionForEdit.end, options.mergeAdjacent)) {
                prevSel.selectionForEdit.end.line = newSel.end.line;
                prevSel.selectionsToTrack.push(sel);
            } else {
                prevSel = {selectionForEdit: newSel, selectionsToTrack: [sel]};
                combinedSelections.push(prevSel);
            }
        });
        return combinedSelections;
    };

    /**
     * Returns the currently selected text, or "" if no selection. Includes \n if the
     * selection spans multiple lines (does NOT reflect the Document's line-endings style). By
     * default, returns only the contents of the primary selection, unless `allSelections` is true.
     * @param {boolean=} allSelections Whether to return the contents of all selections (separated
     *     by newlines) instead of just the primary selection. Default false.
     * @return {!string} The selected text.
     */
    Editor.prototype.getSelectedText = function (allSelections) {
        if (allSelections) {
            return this._codeMirror.getSelection();
        }
        var sel = this.getSelection();
        return this.document.getRange(sel.start, sel.end);

    };

    /**
     * Get the token at the given cursor position, or at the current cursor
     * if none is given.
     *
     * @param {?{line: number, ch: number}} [cursor] - Optional cursor position
     *      at which to retrieve a token. If not provided, the current position will be used.
     * @return {{end: number, start:number, string: string, type: string}} -
     * the CodeMirror token at the given cursor position
     */
    Editor.prototype.getToken = function (cursor) {
        let cm = this._codeMirror;

        if (cursor) {
            return TokenUtils.getTokenAt(cm, cursor);
        }
        return TokenUtils.getTokenAt(cm, this.getCursorPos());
    };

    /**
     * Get the token after the one at the given cursor position
     *
     * @param {{line: number, ch: number}} [cursor] - Optional cursor position after
     *      which a token should be retrieved
     * @param {boolean} [skipWhitespace] - true if this should skip over whitespace tokens. Default is true.
     * @return {{end: number, start:number, string: string, type: string}} -
     * the CodeMirror token after the one at the given cursor position
     */
    Editor.prototype.getNextToken = function (cursor, skipWhitespace = true) {
        cursor = cursor || this.getCursorPos();
        let token   = this.getToken(cursor),
            next    = token,
            doc     = this.document;

        do {
            if (next.end < doc.getLine(cursor.line).length) {
                cursor.ch = next.end + 1;
            } else if (doc.getLine(cursor.line + 1)) {
                cursor.ch = 0;
                cursor.line++;
            } else {
                next = null;
                break;
            }
            next = this.getToken(cursor);
        } while (skipWhitespace && !/\S/.test(next.string));

        return next;
    };

    /**
     * Get the token before the one at the given cursor position
     *
     * @param {{line: number, ch: number}} [cursor] - Optional cursor position before
     *      which a token should be retrieved
     * @param {boolean} [skipWhitespace] - true if this should skip over whitespace tokens. Default is true.
     * @return {{end: number, start:number, string: string, type: string}} - the CodeMirror token before
     * the one at the given cursor position
     */
    Editor.prototype.getPreviousToken = function (cursor, skipWhitespace = true) {
        cursor = cursor || this.getCursorPos();
        let token   = this.getToken(cursor),
            prev    = token,
            doc     = this.document;

        do {
            if (prev.start < cursor.ch) {
                cursor.ch = prev.start;
            } else if (cursor.line > 0) {
                cursor.ch = doc.getLine(cursor.line - 1).length;
                cursor.line--;
            } else {
                break;
            }
            prev = this.getToken(cursor);
        } while (skipWhitespace && !/\S/.test(prev.string));

        return prev;
    };

    /**
     * Use This if you are making large number of editor changes in a single workflow to improve performance.
     * The editor internally buffers changes and only updates its DOM structure after it has finished performing
     * some operation. If you need to perform a lot of operations on a CodeMirror instance, you can call this method
     * with a function argument. It will call the function, buffering up all changes, and only doing the expensive
     * update after the function returns. This can be a lot faster. The return value from this method will be the
     * return value of your function.
     * @param execFn The function that will be called to make all editor changes.
     * @return {*}
     */
    Editor.prototype.operation = function (execFn) {
        return this._codeMirror.operation(execFn);
    };

    const MARK_OPTION_UNDERLINE_ERROR = {
            className: "editor-text-fragment-error"
        }, MARK_OPTION_UNDERLINE_WARN = {
            className: "editor-text-fragment-warn"
        }, MARK_OPTION_UNDERLINE_INFO = {
            className: "editor-text-fragment-info"
        }, MARK_OPTION_UNDERLINE_SPELLCHECK = {
            className: "editor-text-fragment-spell-error"
        };

    /**
     * Can be used to mark a range of text with a specific CSS class name. cursorFrom and cursorTo should be {line, ch}
     * objects. The options parameter is optional.
     *
     * @param {string} markType - A String that can be used to label the mark type.
     * @param {{line: number, ch: number}} cursorFrom - Mark start position
     * @param {{line: number, ch: number}} cursorTo - Mark end position
     * @param {Object} [options] - When given, it should be  one of the predefined `Editor.MARK_OPTION_UNDERLINE*` or
     * it should be an object that may contain the following configuration options:
     *
     * @param {string} [options.className] -Assigns a CSS class to the marked stretch of text.
     * @param {string} [options.css] -A string of CSS to be applied to the covered text. For example "color: #fe3".
     * @param {string} [options.startStyle] -Can be used to specify an extra CSS class to be applied to the leftmost
     * span that is part of the marker.
     * @param {string} [options.endStyle] -Equivalent to startStyle, but for the rightmost span.
     * @param {object} [options.attributes] -When given, add the attributes in the given object to the elements created
     * for the marked text. Adding class or style attributes this way is not supported.
     * @param {boolean} [options.inclusiveLeft] - Determines whether text inserted on the left of the marker will end
     * up inside or outside of it.
     * @param {boolean} [options.inclusiveRight] - Like inclusiveLeft, but for the right side.
     * @param {boolean} [options.atomic] -Atomic ranges act as a single unit when cursor movement is concerned—i.e.
     * it is impossible to place the cursor inside of them. You can control whether the cursor is allowed to be placed
     * directly before or after them using selectLeft or selectRight. If selectLeft (or right) is not provided, then
     * inclusiveLeft (or right) will control this behavior.
     * @param {boolean} [options.selectLeft] -For atomic ranges, determines whether the cursor is allowed to be placed
     * directly to the left of the range. Has no effect on non-atomic ranges.
     * @param {boolean} [options.selectRight] - Like selectLeft, but for the right side.
     * @param {boolean} [options.collapsed] - Collapsed ranges do not show up in the display.
     * Setting a range to be collapsed will automatically make it atomic.
     * @param {boolean} [options.clearOnEnter] - When enabled, will cause the mark to clear itself whenever the cursor
     * enters its range. This is mostly useful for text-replacement widgets that need to 'snap open' when the user
     * tries to edit them. The "clear" event fired on the range handle can be used to be notified when this happens.
     * @param {boolean} [options.clearWhenEmpty] - Determines whether the mark is automatically cleared when it becomes
     * empty. Default is true.
     * @param {Element} [options.replacedWith] - Use a given node to display this range. Implies both collapsed and
     * atomic. The given DOM node must be an inline element (as opposed to a block element).
     * @param {boolean} [options.handleMouseEvents] - When replacedWith is given, this determines whether the editor
     * will capture mouse and drag events occurring in this widget. Default is false—the events will be left alone
     * for the default browser handler, or specific handlers on the widget, to capture.
     * @param {boolean} [options.readOnly] - A read-only span can, as long as it is not cleared, not be modified except
     * by calling setValue to reset the whole document. Note: adding a read-only span currently clears the undo history
     * of the editor, because existing undo events being partially nullified by read-only spans would corrupt the
     * history (in the current implementation).
     * @param {boolean} [options.addToHistory] - When set to true (default is false), adding this marker will create an
     * event in the undo history that can be individually undone (clearing the marker).
     *
     * @return {{clear, find, changed}} TextMarker - The method will return an object(TextMarker) that represents
     * the marker which exposes three methods:
     * clear(), to remove the mark, find(), which returns a {from, to} object (both holding document positions),
     * indicating the current position of the marked range, or undefined if the marker is no longer in the document,
     * and finally changed(), which you can call if you've done something that might change the size of the marker
     * (for example changing the content of a replacedWith node), and want to cheaply update the display.
     *
     * The Returned TextMarker emits the following events that can be listened with the on and off methods.
     * @event beforeCursorEnter Fired on TextMarker when the cursor enters the marked range. From this event handler,
     * the editor state may be inspected but not modified, with the exception that the range on which the event
     * fires may be cleared.
     * @event clear (from: {line, ch}, to: {line, ch}) Fired when the range is cleared, either through cursor movement
     * in combination with clearOnEnter or through a call to its clear() method. Will only be fired once per handle.
     * Note that deleting the range through text editing does not fire this event, because an undo action might
     * bring the range back into existence. from and to give the part of the document that the range spanned
     * when it was cleared.
     * @event hide Fired when the last part of the marker is removed from the document by editing operations.
     * @event unhide Fired when, after the marker was removed by editing, a undo operation brought the marker back.
     */
    Editor.prototype.markText = function (markType, cursorFrom, cursorTo, options) {
        let newMark = this._codeMirror.markText(cursorFrom, cursorTo, options);
        newMark.markType = markType;
        return newMark;
    };

    /**
     * Same as markText, but will apply to the token at the given position or current position
     * @param {string} markType - A String that can be used to label the mark type.
     * @param {{line: number, ch: number}} cursor - The position of the token
     * @param [options] same as markText
     * @return {Object} TextMarker
     */
    Editor.prototype.markToken = function (markType, cursor, options) {
        let token = this.getToken(cursor);
        return this.markText(markType, {line: cursor.line, ch: token.start},
            {line: cursor.line, ch: token.end}, options);
    };

    /**
     * Inserts a bookmark, a handle that follows the text around it as it is being edited, at the given position.
     * Similar to mark text, but for just a point instead of range.
     * @param {string} markType - A String that can be used to label the mark type.
     * @param {{line: number, ch: number}} cursorPos - Where to place the mark
     * @param {Object} [options] - When given, it should be an object that may contain the following
     * configuration options:
     * @param {Element} [options.widget] - Can be used to display a DOM node at the current location of the bookmark
     * (analogous to the replacedWith option to markText).
     * @param {boolean} [options.insertLeft] - By default, text typed when the cursor is on top of the bookmark will
     * end up to the right of the bookmark. Set this option to true to make it go to the left instead.
     * @param {boolean} [options.handleMouseEvents] - As with markText, this determines whether mouse events on the
     * widget inserted for this bookmark are handled by CodeMirror. The default is false.
     *
     * @return {{clear, find}} TextMarker- A bookmark has two methods find() and clear(). `find` returns the current
     * position of the bookmark, if it is still in the document, and `clear` explicitly removes the bookmark.
     */
    Editor.prototype.setBookmark = function (markType, cursorPos, options) {
        let newMark = this._codeMirror.setBookmark(cursorPos, options);
        newMark.markType = markType;
        return newMark;
    };

    /**
     * Returns an array of all the bookmarks and marked ranges found between the given positions (non-inclusive).
     * @param {{line: number, ch: number}} cursorFrom - Mark start position
     * @param {{line: number, ch: number}} cursorTo - Mark end position
     * @param {string} [markType] - Optional, if given will only return marks of that type. Else returns everything.
     * @returns {Array[TextMarker]} TextMarker - A text marker array
     */
    Editor.prototype.findMarks = function (cursorFrom, cursorTo, markType) {
        let marks = this._codeMirror.findMarks(cursorFrom, cursorTo) || [];
        return marks.filter(function (mark){
            return markType ? mark.markType === markType : true;
        });
    };

    /**
     * Returns an array of all the bookmarks and marked ranges present at the given position.
     * @param {{line: number, ch: number}} cursorPos - cursor position
     * @param {string} [markType] - Optional, if given will only return marks of that type. Else returns everything.
     * @returns {Array[TextMarker]} TextMarker - A text marker array
     */
    Editor.prototype.findMarksAt = function (cursorPos, markType) {
        let marks = this._codeMirror.findMarksAt(cursorPos) || [];
        return marks.filter(function (mark){
            return markType ? mark.markType === markType : true;
        });
    };

    /**
     * Returns an array containing all marked ranges in the document.
     * @param {string} [markType] - Optional, if given will only return marks of that type. Else returns everything.
     * @returns {Array[TextMarker]} TextMarker - A text marker array
     */
    Editor.prototype.getAllMarks = function (markType) {
        let marks = this._codeMirror.getAllMarks() || [];
        return marks.filter(function (mark){
            return markType ? mark.markType === markType : true;
        });
    };

    /**
     * Clears all mark of the given type. If nothing is given, clears all marks(Don't use this API without types!).
     * @param {string} [markType] - Optional, if given will only delete marks of that type. Else delete everything.
     */
    Editor.prototype.clearAllMarks = function (markType) {
        let marks = this.getAllMarks(markType);
        for(let mark of marks){
            mark.clear();
        }
    };

    /**
     * Sets the current selection. Start is inclusive, end is exclusive. Places the cursor at the
     * end of the selection range. Optionally centers around the cursor after
     * making the selection
     *
     * @param {!{line:number, ch:number}} start
     * @param {{line:number, ch:number}=} end If not specified, defaults to start.
     * @param {boolean} center true to center the viewport
     * @param {number} centerOptions Option value, or 0 for no options; one of the BOUNDARY_* constants above.
     * @param {?string} origin An optional string that describes what other selection or edit operations this
     *      should be merged with for the purposes of undo. See {@link Document#replaceRange} for more details.
     */
    Editor.prototype.setSelection = function (start, end, center, centerOptions, origin) {
        this.setSelections([{start: start, end: end || start}], center, centerOptions, origin);
    };

    /**
     * Clears any active selection if present.
     */
    Editor.prototype.clearSelection = function () {
        let pos = this.getCursorPos();
        this.setCursorPos(pos.line, pos.ch);
    };

    /**
     * Sets a multiple selection, with the "primary" selection (the one returned by
     * getSelection() and getCursorPos()) defaulting to the last if not specified.
     * Overlapping ranges will be automatically merged, and the selection will be sorted.
     * Optionally centers around the primary selection after making the selection.
     * @param {!Array<{start:{line:number, ch:number}, end:{line:number, ch:number}, primary:boolean, reversed: boolean}>} selections
     *      The selection ranges to set. If the start and end of a range are the same, treated as a cursor.
     *      If reversed is true, set the anchor of the range to the end instead of the start.
     *      If primary is true, this is the primary selection. Behavior is undefined if more than
     *      one selection has primary set to true. If none has primary set to true, the last one is primary.
     * @param {boolean} center true to center the viewport around the primary selection.
     * @param {number} centerOptions Option value, or 0 for no options; one of the BOUNDARY_* constants above.
     * @param {?string} origin An optional string that describes what other selection or edit operations this
     *      should be merged with for the purposes of undo. See {@link Document#replaceRange} for more details.
     */
    Editor.prototype.setSelections = function (selections, center, centerOptions, origin) {
        var primIndex = selections.length - 1, options;
        if (origin) {
            options = { origin: origin };
        }
        this._codeMirror.setSelections(_.map(selections, function (sel, index) {
            if (sel.primary) {
                primIndex = index;
            }
            return { anchor: sel.reversed ? sel.end : sel.start, head: sel.reversed ? sel.start : sel.end };
        }), primIndex, options);
        if (center) {
            this.centerOnCursor(centerOptions);
        }
    };

    /**
     * Sets the editors overwrite mode state. If null is passed, the state is toggled.
     *
     * @param {?boolean} start
     */
    Editor.prototype.toggleOverwrite = function (state) {
        this._codeMirror.toggleOverwrite(state);
    };

    /**
     * Selects word that the given pos lies within or adjacent to. If pos isn't touching a word
     * (e.g. within a token like "//"), moves the cursor to pos without selecting a range.
     * @param {!{line:number, ch:number}}
     */
    Editor.prototype.selectWordAt = function (pos) {
        var word = this._codeMirror.findWordAt(pos);
        this.setSelection(word.anchor, word.head);
    };

    /**
     * Gets the total number of lines in the document (includes lines not visible in the viewport)
     * @return {!number}
     */
    Editor.prototype.lineCount = function () {
        return this._codeMirror.lineCount();
    };

    /**
     * Deterines if line is fully visible.
     * @param {number} zero-based index of the line to test
     * @return {boolean} true if the line is fully visible, false otherwise
     */
    Editor.prototype.isLineVisible = function (line) {
        var coords = this._codeMirror.charCoords({line: line, ch: 0}, "local"),
            scrollInfo = this._codeMirror.getScrollInfo(),
            top = scrollInfo.top,
            bottom = scrollInfo.top + scrollInfo.clientHeight;

        // Check top and bottom and return false for partially visible lines.
        return (coords.top >= top && coords.bottom <= bottom);
    };

    /**
     * Gets the number of the first visible line in the editor.
     * @return {number} The 0-based index of the first visible line.
     */
    Editor.prototype.getFirstVisibleLine = function () {
        return (this._visibleRange ? this._visibleRange.startLine : 0);
    };

    /**
     * Gets the number of the last visible line in the editor.
     * @return {number} The 0-based index of the last visible line.
     */
    Editor.prototype.getLastVisibleLine = function () {
        return (this._visibleRange ? this._visibleRange.endLine : this.lineCount() - 1);
    };

    /* Hides the specified line number in the editor
     * @param {!from} line to start hiding from (inclusive)
     * @param {!to} line to end hiding at (exclusive)
     * @return {TextMarker} The CodeMirror mark object that's hiding the lines
     */
    Editor.prototype._hideLines = function (from, to) {
        if (to <= from) {
            return;
        }

        // We set clearWhenEmpty: false so that if there's a blank line at the beginning or end of
        // the document, and that's the only hidden line, we can still actually hide it. Doing so
        // requires us to create a 0-length marked span, which would ordinarily be cleaned up by CM
        // if clearWithEmpty is true. See https://groups.google.com/forum/#!topic/codemirror/RB8VNF8ow2w
        var value = this._codeMirror.markText(
            {line: from, ch: 0},
            {line: to - 1, ch: this._codeMirror.getLine(to - 1).length},
            {collapsed: true, inclusiveLeft: true, inclusiveRight: true, clearWhenEmpty: false}
        );

        return value;
    };

    /**
     * Gets the total height of the document in pixels (not the viewport)
     * @return {!number} height in pixels
     */
    Editor.prototype.totalHeight = function () {
        return this.getScrollerElement().scrollHeight;
    };

    /**
     * Gets the scroller element from the editor.
     * @return {!HTMLDivElement} scroller
     */
    Editor.prototype.getScrollerElement = function () {
        return this._codeMirror.getScrollerElement();
    };

    /**
     * Gets the root DOM node of the editor.
     * @return {!HTMLDivElement} The editor's root DOM node.
     */
    Editor.prototype.getRootElement = function () {
        return this._codeMirror.getWrapperElement();
    };


    /**
     * Gets the lineSpace element within the editor (the container around the individual lines of code).
     * FUTURE: This is fairly CodeMirror-specific. Logic that depends on this may break if we switch
     * editors.
     * @return {!HTMLDivElement} The editor's lineSpace element.
     */
    Editor.prototype._getLineSpaceElement = function () {
        return $(".CodeMirror-lines", this.getScrollerElement()).children().get(0);
    };

    /**
     * Returns the current scroll position of the editor.
     * @return {{x:number, y:number}} The x,y scroll position in pixels
     */
    Editor.prototype.getScrollPos = function () {
        var scrollInfo = this._codeMirror.getScrollInfo();
        return { x: scrollInfo.left, y: scrollInfo.top };
    };

    /**
     * Restores and adjusts the current scroll position of the editor.
     * @param {{x:number, y:number}} scrollPos - The x,y scroll position in pixels
     * @param {!number} heightDelta - The amount of delta H to apply to the scroll position
     */
    Editor.prototype.adjustScrollPos = function (scrollPos, heightDelta) {
        this._codeMirror.scrollTo(scrollPos.x, scrollPos.y + heightDelta);
    };

    /**
     * Sets the current scroll position of the editor.
     * @param {number} x scrollLeft position in pixels
     * @param {number} y scrollTop position in pixels
     */
    Editor.prototype.setScrollPos = function (x, y) {
        this._codeMirror.scrollTo(x, y);
    };

    /*
     * Returns the current text height of the editor.
     * @return {number} Height of the text in pixels
     */
    Editor.prototype.getTextHeight = function () {
        return this._codeMirror.defaultTextHeight();
    };

    /**
     * Adds an inline widget below the given line. If any inline widget was already open for that
     * line, it is closed without warning.
     * @param {!{line:number, ch:number}} pos  Position in text to anchor the inline.
     * @param {!InlineWidget} inlineWidget The widget to add.
     * @param {boolean=} scrollLineIntoView Scrolls the associated line into view. Default true.
     * @return {$.Promise} A promise object that is resolved when the widget has been added (but might
     *     still be animating open). Never rejected.
     */
    Editor.prototype.addInlineWidget = InlineWidgetHelper.addInlineWidget;

    /**
     * Removes all inline widgets
     */
    Editor.prototype.removeAllInlineWidgets = InlineWidgetHelper.removeAllInlineWidgets;

    /**
     * Removes the given inline widget.
     * @param {number} inlineWidget The widget to remove.
     * @return {$.Promise} A promise that is resolved when the inline widget is fully closed and removed from the DOM.
     */
    Editor.prototype.removeInlineWidget = InlineWidgetHelper.removeInlineWidget;

    /**
     * Removes all inline widgets for a given line
     * @param {number} lineNum The line number to modify
     */
    Editor.prototype.removeAllInlineWidgetsForLine = InlineWidgetHelper.removeAllInlineWidgetsForLine;

    /**
     * ****** Update actual public API doc in Editor.js *****
     * Gets all inline widgets for a given line
     * @param {number} lineNum The line number to modify
     */
    Editor.prototype.getAllInlineWidgetsForLine = InlineWidgetHelper.getAllInlineWidgetsForLine;

    /**
     * Returns a list of all inline widgets currently open in this editor. Each entry contains the
     * inline's id, and the data parameter that was passed to addInlineWidget().
     * @return {!Array.<{id:number, data:Object}>}
     */
    Editor.prototype.getInlineWidgets = InlineWidgetHelper.getInlineWidgets;

    /**
     * Returns the currently focused inline widget, if any.
     * @return {?InlineWidget}
     */
    Editor.prototype.getFocusedInlineWidget = InlineWidgetHelper.getFocusedInlineWidget;

    /**
     * Sets the height of an inline widget in this editor.
     * @param {!InlineWidget} inlineWidget The widget whose height should be set.
     * @param {!number} height The height of the widget.
     * @param {boolean=} ensureVisible Whether to scroll the entire widget into view. Default false.
     */
    Editor.prototype.setInlineWidgetHeight = InlineWidgetHelper.setInlineWidgetHeight;

    /**
     * Display temporary popover message at current cursor position. Display message above
     * cursor if space allows, otherwise below.
     *
     * @param {string} errorMsg Error message to display
     * @function
     */
    Editor.prototype.displayErrorMessageAtCursor = ErrorPopupHelper.displayErrorMessageAtCursor;

    /**
     * Returns the offset of the top of the virtual scroll area relative to the browser window (not the editor
     * itself). Mainly useful for calculations related to scrollIntoView(), where you're starting with the
     * offset() of a child widget (relative to the browser window) and need to figure out how far down it is from
     * the top of the virtual scroll area (excluding the top padding).
     * @return {number}
     */
    Editor.prototype.getVirtualScrollAreaTop = function () {
        var topPadding = this._getLineSpaceElement().offsetTop, // padding within mover
            scroller = this.getScrollerElement();
        return $(scroller).offset().top - scroller.scrollTop + topPadding;
    };

    /** Gives focus to the editor control */
    Editor.prototype.focus = function () {
        // Focusing an editor synchronously triggers focus/blur handlers. If a blur handler attemps to focus
        // another editor, we'll put CM in a bad state (because CM assumes programmatically focusing itself
        // will always succeed, and if you're in the middle of another focus change that appears to be untrue).
        // So instead, we simply ignore reentrant focus attempts.
        // See bug #2951 for an example of this happening and badly hosing things.
        if (_duringFocus) {
            return;
        }

        _duringFocus = true;
        try {
            this._codeMirror.focus();
        } finally {
            _duringFocus = false;
        }
    };

    /** Returns true if the editor has focus */
    Editor.prototype.hasFocus = function () {
        return this._focused;
    };

    /*
     * @typedef {scrollPos:{x:number, y:number},Array.<{start:{line:number, ch:number},end:{line:number, ch:number}}>} EditorViewState
     */

    /*
     * returns the view state for the editor
     * @return {!EditorViewState}
     */
    Editor.prototype.getViewState = function () {
        return {
            selections: this.getSelections(),
            scrollPos: this.getScrollPos()
        };

    };

    /**
     * Restores the view state
     * @param {!EditorViewState} viewState - the view state object to restore
     */
    Editor.prototype.restoreViewState = function (viewState) {
        if (viewState.selection) {
            // We no longer write out single-selection, but there might be some view state
            // from an older version.
            this.setSelection(viewState.selection.start, viewState.selection.end);
        }
        if (viewState.selections) {
            this.setSelections(viewState.selections);
        }
        if (viewState.scrollPos) {
            this.setScrollPos(viewState.scrollPos.x, viewState.scrollPos.y);
        }
    };

    /**
     * Re-renders the editor UI
     * @param {boolean=} handleResize true if this is in response to resizing the editor. Default false.
     */
    Editor.prototype.refresh = function (handleResize) {
        // If focus is currently in a child of the CodeMirror editor (e.g. in an inline widget), but not in
        // the CodeMirror input field itself, remember the focused item so we can restore focus after the
        // refresh (which might cause the widget to be removed from the display list temporarily).
        var focusedItem = window.document.activeElement,
            restoreFocus = $.contains(this._codeMirror.getScrollerElement(), focusedItem);
        this._codeMirror.refresh();
        if (restoreFocus) {
            focusedItem.focus();
        }
    };

    /**
     * Re-renders the editor, and all children inline editors.
     * @param {boolean=} handleResize true if this is in response to resizing the editor. Default false.
     */
    Editor.prototype.refreshAll = function (handleResize) {
        this.refresh(handleResize);
        this.getInlineWidgets().forEach(function (inlineWidget) {
            inlineWidget.refresh();
        });
    };

    /** Undo the last edit. */
    Editor.prototype.undo = function () {
        this._codeMirror.undo();
    };

    /** Redo the last un-done edit. */
    Editor.prototype.redo = function () {
        this._codeMirror.redo();
    };

    /**
     * View API Visibility Change Notification handler.  This is also
     * called by the native "setVisible" API which refresh can be optimized
     * @param {boolean} show true to show the editor, false to hide it
     * @param {boolean} refresh true (default) to refresh the editor, false to skip refreshing it
     */
    Editor.prototype.notifyVisibilityChange = function (show, refresh) {
        if (show && (refresh || refresh === undefined)) {
            this.refresh();
        }
        if (show) {
            this._inlineWidgets.forEach(function (inlineWidget) {
                inlineWidget.onParentShown();
            });
        }
    };

    /**
     * Shows or hides the editor within its parent. Does not force its ancestors to
     * become visible.
     * @param {boolean} show true to show the editor, false to hide it
     * @param {boolean} refresh true (default) to refresh the editor, false to skip refreshing it
     */
    Editor.prototype.setVisible = function (show, refresh) {
        this.$el.css("display", (show ? "" : "none"));
        this.notifyVisibilityChange(show, refresh);
    };

    /**
     * Returns true if the editor is fully visible--i.e., is in the DOM, all ancestors are
     * visible, and has a non-zero width/height.
     */
    Editor.prototype.isFullyVisible = function () {
        return $(this.getRootElement()).is(":visible");
    };

    /**
     * Gets the syntax-highlighting mode for the given range.
     * Returns null if the mode at the start of the selection differs from the mode at the end -
     * an *approximation* of whether the mode is consistent across the whole range (a pattern like
     * A-B-A would return A as the mode, not null).
     *
     * @param {!{line: number, ch: number}} start The start of the range to check.
     * @param {!{line: number, ch: number}} end The end of the range to check.
     * @param {boolean=} knownMixed Whether we already know we're in a mixed mode and need to check both
     *     the start and end.
     * @return {?(Object|string)} Name of syntax-highlighting mode, or object containing a "name" property
     *     naming the mode along with configuration options required by the mode.
     * @see {@link LanguageManager::#getLanguageForPath} and {@link LanguageManager::Language#getMode}.
     */
    Editor.prototype.getModeForRange = function (start, end, knownMixed) {
        var outerMode = this._codeMirror.getMode(),
            startMode = TokenUtils.getModeAt(this._codeMirror, start),
            endMode = TokenUtils.getModeAt(this._codeMirror, end);
        if (!knownMixed && outerMode.name === startMode.name) {
            // Mode does not vary: just use the editor-wide mode name
            return this._codeMirror.getOption("mode");
        } else if (!startMode || !endMode || startMode.name !== endMode.name) {
            return null;
        }
        return startMode;

    };

    /**
     * Gets the syntax-highlighting mode for the current selection or cursor position. (The mode may
     * vary within one file due to embedded languages, e.g. JS embedded in an HTML script block). See
     * `getModeForRange()` for how this is determined for a single selection.
     *
     * If there are multiple selections, this will return a mode only if all the selections are individually
     * consistent and resolve to the same mode.
     *
     * @return {?(Object|string)} Name of syntax-highlighting mode, or object containing a "name" property
     *     naming the mode along with configuration options required by the mode.
     * @see {@link LanguageManager::#getLanguageForPath} and {@link LanguageManager::Language#getMode}.
     */
    Editor.prototype.getModeForSelection = function () {
        // Check for mixed mode info
        var self        = this,
            sels        = this.getSelections(),
            primarySel  = this.getSelection(),
            outerMode   = this._codeMirror.getMode(),
            startMode   = TokenUtils.getModeAt(this._codeMirror, primarySel.start),
            isMixed     = (outerMode.name !== startMode.name);

        if (isMixed) {
            // This is the magic code to let the code view know that we are in 'css' context
            // if the CodeMirror outermode is 'htmlmixed' and we are in 'style' attributes
            // value context. This has to be done as CodeMirror doesn't yet think this as 'css'
            // This magic is executed only when user is having a cursor and not selection
            // We will enable selection handling one we figure a way out to handle mixed scope selection
            if (outerMode.name === 'htmlmixed' && primarySel.start.line === primarySel.end.line && primarySel.start.ch === primarySel.end.ch) {
                var tagInfo = HTMLUtils.getTagInfo(this, primarySel.start, true),
                    tokenType = tagInfo.position.tokenType;

                if (tokenType === HTMLUtils.ATTR_VALUE && tagInfo.attr.name.toLowerCase() === 'style') {
                    return 'css';
                }
            }
            // Shortcut the first check to avoid getModeAt(), which can be expensive
            if (primarySel.start.line !== primarySel.end.line || primarySel.start.ch !== primarySel.end.ch) {
                var endMode = TokenUtils.getModeAt(this._codeMirror, primarySel.end);

                if (startMode.name !== endMode.name) {
                    return null;
                }
            }

            // If mixed mode, check that mode is the same at start & end of each selection
            var hasMixedSel = _.some(sels, function (sel) {
                if (sels === primarySel) {
                    // We already checked this before, so we know it's not mixed.
                    return false;
                }

                var rangeMode = self.getModeForRange(sel.start, sel.end, true);
                return (!rangeMode || rangeMode.name !== startMode.name);
            });
            if (hasMixedSel) {
                return null;
            }

            return startMode.name;
        }
            // Mode does not vary: just use the editor-wide mode
        return this._codeMirror.getOption("mode");

    };

    /**
     * gets the language for the selection. (Javascript selected from an HTML document or CSS selected from an HTML
     * document, etc...)
     * @return {!Language}
     */
    Editor.prototype.getLanguageForSelection = function () {
        return this.document.getLanguage().getLanguageForMode(this.getModeForSelection());
    };

    /**
     * Gets the syntax-highlighting mode for the document.
     *
     * @return {Object|String} Object or Name of syntax-highlighting mode
     * @see {@link LanguageManager::#getLanguageForPath|LanguageManager.getLanguageForPath} and {@link LanguageManager::Language#getMode|Language.getMode}.
     */
    Editor.prototype.getModeForDocument = function () {
        return this._codeMirror.getOption("mode");
    };

    /**
     * The Document we're bound to
     * @type {!Document}
     */
    Editor.prototype.document = null;


    /**
     * The Editor's last known width.
     * Used in conjunction with updateLayout to recompute the layout
     * if the parent container changes its size since our last layout update.
     * @type {?number}
     */
    Editor.prototype._lastEditorWidth = null;


    /**
     * If true, we're in the middle of syncing to/from the Document. Used to ignore spurious change
     * events caused by us (vs. change events caused by others, which we need to pay attention to).
     * @type {!boolean}
     */
    Editor.prototype._duringSync = false;

    /**
     * @private
     * NOTE: this is actually "semi-private": EditorManager also accesses this field... as well as
     * a few other modules. However, we should try to gradually move most code away from talking to
     * CodeMirror directly.
     * @type {!CodeMirror}
     */
    Editor.prototype._codeMirror = null;

    /**
     * @private
     * @type {!Array.<{id:number, data:Object}>}
     */
    Editor.prototype._inlineWidgets = null;

    /**
     * @private
     * @type {?TextRange}
     */
    Editor.prototype._visibleRange = null;

    /**
     * @private
     * @type {Object}
     * Promise queues for inline widgets being added to a given line.
     */
    Editor.prototype._inlineWidgetQueues = null;

    /**
     * @private
     * @type {Array}
     * A list of objects corresponding to the markers that are hiding lines in the current editor.
     */
    Editor.prototype._hideMarks = null;

    /**
     * @private
     *
     * Retrieve the value of the named preference for this document.
     *
     * @param {string} prefName Name of preference to retrieve.
     * @return {*} current value of that pref
     */
    Editor.prototype._getOption = function (prefName) {
        return PreferencesManager.get(prefName, PreferencesManager._buildContext(this.document.file.fullPath, this.document.getLanguage().getId()));
    };

    /**
     * @private
     *
     * Updates the editor to the current value of prefName for the file being edited.
     *
     * @param {string} prefName Name of the preference to visibly update
     */
    Editor.prototype._updateOption = function (prefName) {
        var oldValue = this._currentOptions[prefName],
            newValue = this._getOption(prefName);

        if (oldValue !== newValue) {
            this._currentOptions[prefName] = newValue;

            if (prefName === USE_TAB_CHAR) {
                this._codeMirror.setOption(cmOptions[prefName], newValue);
                this._codeMirror.setOption("indentUnit", newValue === true ?
                                           this._currentOptions[TAB_SIZE] :
                                           this._currentOptions[SPACE_UNITS]
                                          );
            } else if (prefName === STYLE_ACTIVE_LINE) {
                this._updateStyleActiveLine();
            } else if (prefName === SCROLL_PAST_END && this._visibleRange) {
                // Do not apply this option to inline editors
                return;
            } else if (prefName === SHOW_LINE_NUMBERS) {
                Editor._toggleLinePadding(!newValue);
                this._codeMirror.setOption(cmOptions[SHOW_LINE_NUMBERS], newValue);
                if (newValue) {
                    Editor.registerGutter(LINE_NUMBER_GUTTER, LINE_NUMBER_GUTTER_PRIORITY);
                } else {
                    Editor.unregisterGutter(LINE_NUMBER_GUTTER);
                }
                this.refreshAll();
            } else {
                this._codeMirror.setOption(cmOptions[prefName], newValue);
            }

            this.trigger("optionChange", prefName, newValue);
        }
    };

    /**
     * @private
     *
     * Used to ensure that "style active line" is turned off when there is a selection.
     */
    Editor.prototype._updateStyleActiveLine = function () {
        if (this.hasSelection()) {
            if (this._codeMirror.getOption("styleActiveLine")) {
                this._codeMirror.setOption("styleActiveLine", false);
            }
        } else {
            this._codeMirror.setOption("styleActiveLine", this._currentOptions[STYLE_ACTIVE_LINE]);
        }
    };

    /**
     * resizes the editor to fill its parent container
     * should not be used on inline editors
     * @param {boolean=} forceRefresh - forces the editor to update its layout
     *                                   even if it already matches the container's height / width
     */
    Editor.prototype.updateLayout = function (forceRefresh) {
        var curRoot = this.getRootElement(),
            curWidth = $(curRoot).width(),
            $editorHolder = this.$el.parent(),
            editorAreaHt = $editorHolder.height();

        if (!curRoot.style.height || $(curRoot).height() !== editorAreaHt) {
            // Call setSize() instead of $.height() to allow CodeMirror to
            // check for options like line wrapping
            this.setSize(null, editorAreaHt);
            if (forceRefresh === undefined) {
                forceRefresh = true;
            }
        } else if (curWidth !== this._lastEditorWidth) {
            if (forceRefresh === undefined) {
                forceRefresh = true;
            }
        }
        this._lastEditorWidth = curWidth;

        if (forceRefresh) {
            this.refreshAll(forceRefresh);
        }
    };

    /**
     * Renders all registered gutters
     * @private
     */
    Editor.prototype._renderGutters = function () {
        var languageId = this.document.getLanguage().getId();

        function _filterByLanguages(gutter) {
            return !gutter.languages || gutter.languages.indexOf(languageId) > -1;
        }

        function _sortByPriority(a, b) {
            return a.priority - b.priority;
        }

        function _getName(gutter) {
            return gutter.name;
        }

        var gutters = registeredGutters.map(_getName),
            rootElement = this.getRootElement();

        // If the line numbers gutter has not been explicitly registered and the CodeMirror lineNumbes option is
        // set to true, we explicitly add the line numbers gutter. This case occurs the first time the editor loads
        // and showLineNumbers is set to true in preferences
        if (gutters.indexOf(LINE_NUMBER_GUTTER) < 0 && this._codeMirror.getOption(cmOptions[SHOW_LINE_NUMBERS])) {
            registeredGutters.push({name: LINE_NUMBER_GUTTER, priority: LINE_NUMBER_GUTTER_PRIORITY});
        }

        gutters = registeredGutters.sort(_sortByPriority)
            .filter(_filterByLanguages)
            .map(_getName);

        this._codeMirror.setOption("gutters", gutters);
        this._codeMirror.refresh();

        if (gutters.indexOf(LINE_NUMBER_GUTTER) < 0) {
            $(rootElement).addClass("linenumber-disabled");
        } else {
            $(rootElement).removeClass("linenumber-disabled");
        }
    };

    /**
     * Return true if gutter of the given name is registered
     * @param   {string}   gutterName The name of the gutter
     * @return {boolean}
     */
    Editor.prototype.isGutterRegistered = function (gutterName) {
        return registeredGutters.some(function (gutter) {
            return gutter.name === gutterName;
        });
    };

    /**
     * Sets the marker for the specified gutter on the specified line number
     * @param   {number}   lineNumber The line number for the inserted gutter marker
     * @param   {string}   gutterName The name of the gutter
     * @param   {object}   marker     The dom element representing the marker to the inserted in the gutter
     */
    Editor.prototype.setGutterMarker = function (lineNumber, gutterName, marker) {
        if (!this.isGutterRegistered(gutterName)) {
            console.warn("Gutter name must be registered before calling editor.setGutterMarker");
            return;
        }

        this._codeMirror.setGutterMarker(lineNumber, gutterName, marker);
    };

    /**
     * Gets the gutter marker of the given name if found on the current line, else returns undefined.
     * @param   {number}   lineNumber The line number for the inserted gutter marker
     * @param   {string}   gutterName The name of the gutter
     */
    Editor.prototype.getGutterMarker = function (lineNumber, gutterName) {
        if (!this.isGutterRegistered(gutterName)) {
            console.warn("Gutter name must be registered before calling editor.getGutterMarker");
            return;
        }
        let lineInfo = this._codeMirror.lineInfo(lineNumber);
        let gutterMarkers = lineInfo && lineInfo.gutterMarkers || {};
        return gutterMarkers[gutterName];
    };

    /**
     * Clears the marker for the specified gutter on the specified line number. Does nothing if there was no marker
     * on the line.
     * @param   {number}   lineNumber The line number for the inserted gutter marker
     * @param   {string}   gutterName The name of the gutter
     */
    Editor.prototype.clearGutterMarker = function (lineNumber, gutterName) {
        this.setGutterMarker(lineNumber, gutterName, null);
    };

    /**
     * Clears all marks from the gutter with the specified name.
     * @param {string} gutterName The name of the gutter to clear.
     */
    Editor.prototype.clearGutter = function (gutterName) {
        if (!this.isGutterRegistered(gutterName)) {
            console.warn("Gutter name must be registered before calling editor.clearGutter");
            return;
        }
        this._codeMirror.clearGutter(gutterName);
    };

    /**
     * Returns the list of gutters current registered on all editors.
     * @return {!Array.<{name: string, priority: number}>}
     */
    Editor.getRegisteredGutters = function () {
        return registeredGutters;
    };

    /**
     * Registers the gutter with the specified name at the given priority.
     * @param {string} name    The name of the gutter.
     * @param {number} priority  A number denoting the priority of the gutter. Priorities higher than LINE_NUMBER_GUTTER_PRIORITY appear after the line numbers. Priority less than LINE_NUMBER_GUTTER_PRIORITY appear before.
     * @param {?Array<string>} [languageIds] A list of language ids that this gutter is valid for. If no language ids are passed, then the gutter is valid in all languages.
     */
    Editor.registerGutter = function (name, priority, languageIds) {
        if (isNaN(priority)) {
            console.warn("A non-numeric priority value was passed to registerGutter. The value will default to 0.");
            priority = 0;
        }

        if (!name || typeof name !== "string") {
            console.error("The name of the registered gutter must be a string.");
            return;
        }

        var gutter = {name: name, priority: priority, languages: languageIds},
            gutterExists = registeredGutters.some(function (gutter) {
                return gutter.name === name;
            });

        if (!gutterExists) {
            registeredGutters.push(gutter);
        }

        Editor.forEveryEditor(function (editor) {
            editor._renderGutters();
        });
    };

    /**
     * Unregisters the gutter with the specified name and removes it from the UI.
     * @param {string} name The name of the gutter to be unregistered.
     */
    Editor.unregisterGutter = function (name) {
        var i, gutter;
        registeredGutters = registeredGutters.filter(function (gutter) {
            return gutter.name !== name;
        });

        Editor.forEveryEditor(function (editor) {
            editor._renderGutters();
        });
    };

    // Global settings that affect Editor instances that share the same preference locations

    /**
     * Sets whether to use tab characters (vs. spaces) when inserting new text.
     * Affects any editors that share the same preference location.
     * @param {boolean} value
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean} true if value was valid
     */
    Editor.setUseTabChar = function (value, fullPath) {
        var options = fullPath && {context: fullPath};
        return PreferencesManager.set(USE_TAB_CHAR, value, options);
    };

    /**
     * Gets whether the specified or current file uses tab characters (vs. spaces) when inserting new text
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean}
     */
    Editor.getUseTabChar = function (fullPath) {
        return PreferencesManager.get(USE_TAB_CHAR, _buildPreferencesContext(fullPath));
    };

    /**
     * Sets tab character width.
     * Affects any editors that share the same preference location.
     * @param {number} value
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean} true if value was valid
     */
    Editor.setTabSize = function (value, fullPath) {
        var options = fullPath && {context: fullPath};
        return PreferencesManager.set(TAB_SIZE, value, options);
    };

    /**
     * Get indent unit
     * @param {string=} fullPath Path to file to get preference for
     * @return {number}
     */
    Editor.getTabSize = function (fullPath) {
        return PreferencesManager.get(TAB_SIZE, _buildPreferencesContext(fullPath));
    };

    /**
     * Sets indentation width.
     * Affects any editors that share the same preference location.
     * @param {number} value
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean} true if value was valid
     */
    Editor.setSpaceUnits = function (value, fullPath) {
        var options = fullPath && {context: fullPath};
        return PreferencesManager.set(SPACE_UNITS, value, options);
    };

    /**
     * Get indentation width
     * @param {string=} fullPath Path to file to get preference for
     * @return {number}
     */
    Editor.getSpaceUnits = function (fullPath) {
        return PreferencesManager.get(SPACE_UNITS, _buildPreferencesContext(fullPath));
    };

    /**
     * Sets the auto close brackets.
     * Affects any editors that share the same preference location.
     * @param {boolean} value
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean} true if value was valid
     */
    Editor.setCloseBrackets = function (value, fullPath) {
        var options = fullPath && {context: fullPath};
        return PreferencesManager.set(CLOSE_BRACKETS, value, options);
    };

    /**
     * Gets whether the specified or current file uses auto close brackets
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean}
     */
    Editor.getCloseBrackets = function (fullPath) {
        return PreferencesManager.get(CLOSE_BRACKETS, _buildPreferencesContext(fullPath));
    };

    /**
     * Sets show line numbers option.
     * Affects any editors that share the same preference location.
     * @param {boolean} value
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean} true if value was valid
     */
    Editor.setShowLineNumbers = function (value, fullPath) {
        var options = fullPath && {context: fullPath};
        return PreferencesManager.set(SHOW_LINE_NUMBERS, value, options);
    };

    /**
     * Returns true if show line numbers is enabled for the specified or current file
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean}
     */
    Editor.getShowLineNumbers = function (fullPath) {
        return PreferencesManager.get(SHOW_LINE_NUMBERS, _buildPreferencesContext(fullPath));
    };

    /**
     * Sets show active line option.
     * Affects any editors that share the same preference location.
     * @param {boolean} value
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean} true if value was valid
     */
    Editor.setShowActiveLine = function (value, fullPath) {
        return PreferencesManager.set(STYLE_ACTIVE_LINE, value);
    };

    /**
     * Returns true if show active line is enabled for the specified or current file
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean}
     */
    Editor.getShowActiveLine = function (fullPath) {
        return PreferencesManager.get(STYLE_ACTIVE_LINE, _buildPreferencesContext(fullPath));
    };

    /**
     * Sets word wrap option.
     * Affects any editors that share the same preference location.
     * @param {boolean} value
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean} true if value was valid
     */
    Editor.setWordWrap = function (value, fullPath) {
        var options = fullPath && {context: fullPath};
        return PreferencesManager.set(WORD_WRAP, value, options);
    };

    /**
     * Returns true if word wrap is enabled for the specified or current file
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean}
     */
    Editor.getWordWrap = function (fullPath) {
        return PreferencesManager.get(WORD_WRAP, _buildPreferencesContext(fullPath));
    };

    /**
     * Sets indentLineComment option.
     * Affects any editors that share the same preference location.
     * @param {boolean} value
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean} true if value was valid
     */
    Editor.setIndentLineComment = function (value, fullPath) {
        var options = fullPath && {context: fullPath};
        return PreferencesManager.set(INDENT_LINE_COMMENT, value, options);
    };

    /**
     * Returns true if indentLineComment is enabled for the specified or current file
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean}
     */
    Editor.getIndentLineComment = function (fullPath) {
        return PreferencesManager.get(INDENT_LINE_COMMENT, _buildPreferencesContext(fullPath));
    };

    /**
     * Runs callback for every Editor instance that currently exists
     * @param {!function(!Editor)} callback
     */
    Editor.forEveryEditor = function (callback) {
        _instances.forEach(callback);
    };

    /**
     * @private
     * Toggles the left padding of all code editors.  Used to provide more
     * space between the code text and the left edge of the editor when
     * line numbers are hidden.
     * @param {boolean} showLinePadding
     */
    Editor._toggleLinePadding = function (showLinePadding) {
        // apply class to all pane DOM nodes
        var $holders = [];
        _instances.forEach(function (editor) {
            var $editorHolder = editor.$el.parent();
            if ($holders.indexOf($editorHolder) === -1) {
                $holders.push($editorHolder);
            }
        });

        _.each($holders, function ($holder) {
            $holder.toggleClass("show-line-padding", Boolean(showLinePadding));
        });
    };

    Editor.LINE_NUMBER_GUTTER_PRIORITY = LINE_NUMBER_GUTTER_PRIORITY;
    Editor.CODE_FOLDING_GUTTER_PRIORITY = CODE_FOLDING_GUTTER_PRIORITY;

    /**
     * Mark options to use with API with Editor.markText or Editor.markToken.
     */
    Editor.MARK_OPTION_UNDERLINE_ERROR = MARK_OPTION_UNDERLINE_ERROR;
    Editor.MARK_OPTION_UNDERLINE_WARN = MARK_OPTION_UNDERLINE_WARN;
    Editor.MARK_OPTION_UNDERLINE_INFO = MARK_OPTION_UNDERLINE_INFO;
    Editor.MARK_OPTION_UNDERLINE_SPELLCHECK = MARK_OPTION_UNDERLINE_SPELLCHECK;

    // Set up listeners for preference changes
    editorOptions.forEach(function (prefName) {
        PreferencesManager.on("change", prefName, function () {
            _instances.forEach(function (editor) {
                editor._updateOption(prefName);
            });
        });
    });

    // Define public API
    exports.Editor                  = Editor;
    exports.BOUNDARY_CHECK_NORMAL   = BOUNDARY_CHECK_NORMAL;
    exports.BOUNDARY_IGNORE_TOP     = BOUNDARY_IGNORE_TOP;
    exports.BOUNDARY_BULLSEYE      = BOUNDARY_BULLSEYE;
});
