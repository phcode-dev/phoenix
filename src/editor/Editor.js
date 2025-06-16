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

// @INCLUDE_IN_API_DOCS

/**
 * Editor is a 1-to-1 wrapper for a CodeMirror editor instance. It layers on Brackets-specific
 * functionality and provides APIs that cleanly pass through the bits of CodeMirror that the rest
 * of our codebase may want to interact with. An Editor is always backed by a Document, and stays
 * in sync with its content; because Editor keeps the Document alive, it's important to always
 * destroy() an Editor that's going away so it can release its Document ref.
 *
 * For now, there's a distinction between the "master" Editor for a Document - which secretly acts
 * as the Document's internal model of the text state - and the multitude of secondary Editors
 * which, via Document, sync their changes to and from that master.
 *
 * For now, direct access to the underlying CodeMirror object is still possible via `_codeMirror` --
 * but this is considered deprecated and may go away.
 *
 * The Editor object dispatches the following events: (available as `Editor.EVENT_*` constants. see below)
 *    - keydown, keypress, keyup -- When any key event happens in the editor (whether it changes the
 *      text or not). Handlers are passed `(BracketsEvent, Editor, KeyboardEvent)`. The 3nd arg is the
 *      raw DOM event. Note: most listeners will only want to listen for "keypress".
 *    - change - Triggered with an array of change objects. Parameters: (editor, changeList)
 *    - beforeChange - (self, changeObj)
 *    - beforeSelectionChange - (selectionObj)
 *    - focus - Fired when an editor is focused
 *    - blur - Fired when an editor loses focused
 *    - update - Will be fired whenever Editor updates its DOM display.
 *    - cursorActivity -- When the user moves the cursor or changes the selection, or an edit occurs.
 *      Note: do not listen to this in order to be generally informed of edits--listen to the
 *      "change" event on Document instead.
 *    - scroll -- When the editor is scrolled, either by user action or programmatically.
 *    - viewportChange - (from: number, to: number) Fires whenever the view port of the editor changes
 *      (due to scrolling, editing, or any other factor). The from and to arguments give the new start
 *      and end of the viewport. This is combination with `editorInstance.getViewPort()` can be used to
 *      selectively redraw visual elements in code like syntax analyze only parts of code instead
 *      of the full code everytime.
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


    let CommandManager = require("command/CommandManager"),
        Commands = require("command/Commands"),
        CodeMirror = require("thirdparty/CodeMirror/lib/codemirror"),
        LanguageManager = require("language/LanguageManager"),
        EventDispatcher = require("utils/EventDispatcher"),
        PerfUtils = require("utils/PerfUtils"),
        PreferencesManager = require("preferences/PreferencesManager"),
        StateManager = require("preferences/StateManager"),
        TextRange = require("document/TextRange").TextRange,
        TokenUtils = require("utils/TokenUtils"),
        HTMLUtils = require("language/HTMLUtils"),
        MainViewManager = require("view/MainViewManager"),
        Metrics = require("utils/Metrics"),
        _ = require("thirdparty/lodash");

    const tabSpacesStateManager = StateManager._createInternalStateManager(StateManager._INTERNAL_STATES.TAB_SPACES);

    /* Editor helpers */

    let IndentHelper = require("./EditorHelper/IndentHelper"),
        EditorPreferences = require("./EditorHelper/EditorPreferences"),
        ChangeHelper = require("./EditorHelper/ChangeHelper"),
        ErrorPopupHelper = require("./EditorHelper/ErrorPopupHelper"),
        InlineWidgetHelper = require("./EditorHelper/InlineWidgetHelper");

    /* Editor preferences */

    /**
     * A list of gutter name and priorities currently registered for editors.
     * The line number gutter is defined as \{ name: LINE_NUMBER_GUTTER, priority: 100 }
     * @private
     * @type {Array<Object>} items - An array of objects, where each object contains the following properties:
     * @property {string} name - The name of the item.
     * @property {number} priority - The priority of the item.
     * @property {Array} languageIds - An array of language IDs.
     */
    let registeredGutters = [];

    let cmOptions = {};

    EditorPreferences.init(cmOptions);

    const CLOSE_BRACKETS = EditorPreferences.CLOSE_BRACKETS,
        CLOSE_TAGS = EditorPreferences.CLOSE_TAGS,
        DRAG_DROP = EditorPreferences.DRAG_DROP,
        HIGHLIGHT_MATCHES = EditorPreferences.HIGHLIGHT_MATCHES,
        LINEWISE_COPY_CUT = EditorPreferences.LINEWISE_COPY_CUT,
        SCROLL_PAST_END = EditorPreferences.SCROLL_PAST_END,
        SHOW_CURSOR_SELECT = EditorPreferences.SHOW_CURSOR_SELECT,
        SHOW_LINE_NUMBERS = EditorPreferences.SHOW_LINE_NUMBERS,
        SMART_INDENT = EditorPreferences.SMART_INDENT,
        SPACE_UNITS = EditorPreferences.SPACE_UNITS,
        STYLE_ACTIVE_LINE = EditorPreferences.STYLE_ACTIVE_LINE,
        TAB_SIZE = EditorPreferences.TAB_SIZE,
        AUTO_TAB_SPACES = EditorPreferences.AUTO_TAB_SPACES,
        USE_TAB_CHAR = EditorPreferences.USE_TAB_CHAR,
        WORD_WRAP = EditorPreferences.WORD_WRAP,
        INDENT_LINE_COMMENT = EditorPreferences.INDENT_LINE_COMMENT,
        INPUT_STYLE = EditorPreferences.INPUT_STYLE;

    const LINE_NUMBER_GUTTER = EditorPreferences.LINE_NUMBER_GUTTER,
        LINE_NUMBER_GUTTER_PRIORITY = EditorPreferences.LINE_NUMBER_GUTTER_PRIORITY,
        CODE_FOLDING_GUTTER_PRIORITY = EditorPreferences.CODE_FOLDING_GUTTER_PRIORITY;

    let editorOptions = [...Object.keys(cmOptions), AUTO_TAB_SPACES];

    /* Editor preferences */

    /**
     * Guard flag to prevent focus() reentrancy (via blur handlers), even across Editors
     * @private
     * @type {boolean}
     */
    var _duringFocus = false;

    /**
     * Constant: Normal boundary check when centering text.
     * @type {number}
     */
    const BOUNDARY_CHECK_NORMAL = 0;

    /**
     * Constant: Ignore the upper boundary when centering text.
     * @type {number}
     */
    const BOUNDARY_IGNORE_TOP = 1;

    /**
     * Constant: Bulls-eye mode, strictly center the text always.
     * @type {number}
     */
    const BOUNDARY_BULLSEYE = 2;


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
     * @private
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
     * @private
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
     * @private
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
                if (!self.canConsumeEscapeKeyEvent()) {
                    return;
                }
                if (self.getSelections().length > 1) { // multi cursor
                    self.clearSelection();
                } else if (self.hasSelection()) {
                    self.clearSelection();
                } else {
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
            if (event.ctrlKey || event.metaKey) {
                setTimeout(() => {
                    CommandManager.execute(Commands.NAVIGATE_JUMPTO_DEFINITION);
                    Metrics.countEvent(Metrics.EVENT_TYPE.EDITOR, "ctrlClick", _cm.getMode().name);
                }, 100);
            }
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
        Object.defineProperty(this, "$el", {
            get: function () {
                return $(this.getRootElement());
            }
        });

        const $cmElement = this.$el;
        $cmElement[0].addEventListener("wheel", (event) => {
            const $editor = $cmElement.find(".CodeMirror-scroll");
            // we need to slow down the scroll by the factor of line height. else the scrolling is too fast.
            // this became a problem after we added the custom line height feature causing jumping scrolls esp in safari
            // and mac if we dont do this scroll scaling.
            const lineHeight = parseFloat(getComputedStyle($editor[0]).lineHeight);
            const defaultHeight = 14, scrollScaleFactor = lineHeight/defaultHeight;

            // when user is pressing the 'Shift' key or deltaX is present, we should handle horizontal scrolling
            if (event.shiftKey || event.deltaX !== 0) {
                let horizontalDelta = event.deltaX;

                if (event.shiftKey && event.deltaY !== 0) {
                    horizontalDelta = event.deltaY;
                }

                // apply the horizontal scrolling
                if (horizontalDelta !== 0) {
                    $editor[0].scrollLeft += horizontalDelta;
                    event.preventDefault();
                    return;
                }
            }

            // apply the vertical scrolling normally
            if (event.deltaY !== 0) {
                const scrollDelta = event.deltaY;
                $editor[0].scrollTop += (scrollDelta/scrollScaleFactor);
                event.preventDefault();
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
        return self.getAllInlineWidgetsForLine(line);
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
        var self = this,
            instance = this._codeMirror,
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
     * @private
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
     * @private
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
     * @private
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
     *
     * Cursor positions can be converted to index(0 based character offsets in editor text string)
     * using `editor.indexFromPos` API.
     * @param {boolean} [expandTabs]  If true, return the actual visual column number instead of the character offset in
     *      the "ch" property.
     * @param {string} [which] Optional string indicating which end of the
     *  selection to return. It may be "start", "end", "head" (the side of the
     *  selection that moves when you press shift+arrow), or "anchor" (the
     *  fixed side of the selection). Omitting the argument is the same as
     *  passing "head". A {'line', 'ch'} object will be returned.)
     * @return {{line:number, ch:number}}
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
     * Gets the cursor position of the last charected in the editor.
     * @param {boolean} [expandTabs]  If true, return the actual visual column number instead of the character offset in
     *      the "ch" property.
     * @return {{line:number, ch:number}}
     */
    Editor.prototype.getEndingCursorPos = function (expandTabs) {
        let lastLine = this._codeMirror.lastLine();
        let cursor = {
            line: lastLine,
            ch: this._codeMirror.getLine(lastLine).length
        };

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
        var line = this._codeMirror.getRange({ line: pos.line, ch: 0 }, pos),
            tabSize = null,
            column = 0,
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
        var line = this._codeMirror.getLine(lineNum),
            tabSize = null,
            iCol = 0,
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
            ch = this.getColOffset({ line: line, ch: ch });
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


    /**
     * Returns a {'from', 'to'} object indicating the start (inclusive) and end (exclusive) of the currently rendered
     * part of the document. In big documents, when most content is scrolled out of view, Editor will only render
     * the visible part, and a margin around it. See also the `viewportChange` event fired on the editor.
     *
     * This is combination with `viewportChange` event can be used to selectively redraw visual elements in code
     * like syntax analyze only parts of code instead of the full code everytime.
     * @return {{from: number, to: number}}
     */
    Editor.prototype.getViewport = function () {
        return this._codeMirror.getViewport();
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

        if (centerOptions === BOUNDARY_BULLSEYE) {
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
     * @param {{line:number, ch:number}} cursorPos
     * @return {number}
     */
    Editor.prototype.indexFromPos = function (cursorPos) {
        return this._codeMirror.indexFromPos(cursorPos);
    };

    /**
     * Given a position, returns its index within the text (assuming \n newlines)
     * @param {number} index
     * @return {{line:number, ch:number}}
     */
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
                    (end.line > pos.line || end.ch >= pos.ch);      // inclusive
            }
            return (start.line < pos.line || start.ch <= pos.ch) &&  // inclusive
                (end.line > pos.line || end.ch > pos.ch);       // exclusive


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
     * Takes an anchor/head pair and returns a start/end pair where the start is guaranteed to be <= end, 
     * and a "reversed" flag indicating if the head is before the anchor.
     * @private
     * @typedef {Object} Position
     * @property {number} line - Line number
     * @property {number} ch - Character position
     * 
     * @typedef {Object} NormalizedRange
     * @property {Position} start - Start position
     * @property {Position} end - End position
     * @property {boolean} reversed - Whether the range is reversed
     * 
     * @param {Position} anchorPos - The anchor position
     * @param {Position} headPos - The head position
     * @return {NormalizedRange} The normalized range with start <= end
     */
    function _normalizeRange(anchorPos, headPos) {
        if (headPos.line < anchorPos.line || (headPos.line === anchorPos.line && headPos.ch < anchorPos.ch)) {
            return { start: _copyPos(headPos), end: _copyPos(anchorPos), reversed: true };
        }
        return { start: _copyPos(anchorPos), end: _copyPos(headPos), reversed: false };

    }

    /**
     * Gets the current selection; if there is more than one selection, returns the primary selection
     * (generally the last one made). Start is inclusive, end is exclusive. If there is no selection,
     * returns the current cursor position as both the start and end of the range (i.e. a selection
     * of length zero). If `reversed` is set, then the head of the selection (the end of the selection
     * that would be changed if the user extended the selection) is before the anchor.
     * @return {{start:{line:number, ch:number}, end:{line:number, ch:number}, reversed:boolean}}
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
     * @return {{start:{line:number, ch:number}, end:{line:number, ch:number}, reversed:boolean, primary:boolean[]}}
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
     * Check if the editor has multiple cursors or selections
     * @returns {boolean}
     */
    Editor.prototype.hasMultipleCursors = function () {
        const selections = this._codeMirror.listSelections();
        return selections.length > 1;
    };

    /**
     * Takes the given selections, and expands each selection so it encompasses whole lines. Merges
     * adjacent line selections together. Keeps track of each original selection associated with a given
     * line selection (there might be multiple if individual selections were merged into a single line selection).
     * Useful for doing multiple-selection-aware line edits.
     *
     * @param {{start:{line:number, ch:number}, end:{line:number, ch:number}, reversed:boolean, primary:boolean}} selections
     *      The selections to expand.
     * @param {{expandEndAtStartOfLine: boolean, mergeAdjacent: boolean}} options
     *      expandEndAtStartOfLine: true if a range selection that ends at the beginning of a line should be expanded
     *          to encompass the line. Default false.
     *      mergeAdjacent: true if adjacent line ranges should be merged. Default true.
     * @return {{selectionForEdit: {start: {line: number, ch: number}, end: {line: number, ch: number}, reversed: boolean, primary: boolean}, selectionsToTrack: {start: {line: number, ch: number}, end: {line: number, ch: number}, reversed: boolean, primary: boolean}}}
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
                newSel.end = { line: newSel.end.line + 1, ch: 0 };
            }

            // If the start of the new selection is within the range of the previous (expanded) selection, merge
            // the two selections together, but keep track of all the original selections that were related to this
            // selection, so they can be properly adjusted. (We only have to check for the start being inside the previous
            // range - it can't be before it because the selections started out sorted.)
            if (prevSel && self.posWithinRange(newSel.start, prevSel.selectionForEdit.start, prevSel.selectionForEdit.end, options.mergeAdjacent)) {
                prevSel.selectionForEdit.end.line = newSel.end.line;
                prevSel.selectionsToTrack.push(sel);
            } else {
                prevSel = { selectionForEdit: newSel, selectionsToTrack: [sel] };
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
     * Given an {'left', 'top'} object (e.g. coordinates of a mouse event) returns the {'line', 'ch'} position that
     * corresponds to it. The optional mode parameter determines relative to what the coordinates are interpreted.
     *
     * @param {{left: number, top:number}} coordinates can be obtained from Eg. coordinates of a mouse event
     * @param {string} [mode] It may be "window", "page" (the default), or "local".
     * @return {{line:number, ch: number}} for the given coordinates
     */
    Editor.prototype.coordsChar = function (coordinates, mode) {
        return this._codeMirror.coordsChar(coordinates, mode);
    };

    /**
     * Returns the position and dimensions of an arbitrary character given a cursor (Eg. from getCursorPos()).
     * It'll give the size of the whole character, rather than just the position that the cursor would have
     * when it would sit at that position.
     *
     * @param {{line:number, ch: number}} pos A cursor, can be obtained from Eg. getCursorPos()
     * @param {string} [mode] It may be "window", "page" (the default), or "local".
     * @return {{left:number, right:number, top:number, bottom:number}} coordinates for the given character position
     */
    Editor.prototype.charCoords = function (pos, mode) {
        return this._codeMirror.charCoords(pos, mode);
    };


    /**
     * Get the token at the given cursor position, or at the current cursor
     * if none is given.
     *
     * @param {?{line: number, ch: number}} [cursor] - Optional cursor position
     *      at which to retrieve a token. If not provided, the current position will be used.
     * @param {boolean} [precise] If given, results in more current results. Suppresses caching.
     * @return {{end: number, start:number, line: number, string: string, type: string|null}} -
     * the CodeMirror token at the given cursor position
     */
    Editor.prototype.getToken = function (cursor, precise) {
        let cm = this._codeMirror;
        cursor = Object.assign({}, cursor || this.getCursorPos());

        let token = TokenUtils.getTokenAt(cm, cursor, precise);
        token.line = cursor.line;
        return token;
    };

    /**
     * Retrieves a single character from the specified position in the editor.
     * x|y where `|` is the cursor, will return y
     * @param {CodeMirror.Position} pos - The position from which to retrieve the character.
     *                                    This should be an object with `line` and `ch` properties.
     * @returns {string|null} The character at the given position if within bounds,
     *                        otherwise `null` if the position is out of range.
     */
    Editor.prototype.getCharacterAtPosition = function (pos) {
        const cm = this._codeMirror;
        let lineText = cm.getLine(pos.line);
        if (pos.ch >= lineText.length || pos.line >= cm.lineCount()) {
            return null;
        }

        return cm.getRange(pos, { line: pos.line, ch: pos.ch + 1 });
    };

    /**
     * Retrieves a single line text
     * @param {number} lineNumber - The lineNumber to extract text from
     * @returns {string|null} The text at the given position if within bounds,
     *                        otherwise `null` if the position is out of range.
     */
    Editor.prototype.getLine = function (lineNumber) {
        const retrievedText = this._codeMirror.getLine(lineNumber);
        return retrievedText === undefined ? null : retrievedText;
    };

    /**
     * Retrieves a single character previous to the specified position in the editor in the same line if possible.
     * x|y where `|` is the cursor, will return x
     *
     * @param {CodeMirror.Position} pos - The position from which to retrieve the character.
     *                                    This should be an object with `line` and `ch` properties.
     * @returns {string|null} The character previous to the given position if within bounds,
     *                        otherwise `null` if the position is out of range.
     */
    Editor.prototype.getPrevCharacterAtPosition = function (pos) {
        if (pos.ch === 0) {
            return null;
        }
        return this.getCharacterAtPosition({ line: pos.line, ch: pos.ch - 1 });
    };

    /**
     * Get the token after the one at the given cursor position
     *
     * @param {{line: number, ch: number}} [cursor] - Optional cursor position after
     *      which a token should be retrieved
     * @param {boolean} [skipWhitespace] - true if this should skip over whitespace tokens. Default is true.
     * @param {boolean} [precise] If given, results in more current results. Suppresses caching.
     * @return {{end: number, start:number, line: number,string: string, type: string}} -
     * the CodeMirror token after the one at the given cursor position
     */
    Editor.prototype.getNextToken = function (cursor, skipWhitespace = true, precise) {
        cursor = Object.assign({}, cursor || this.getCursorPos());
        let token = this.getToken(cursor, precise),
            next = token,
            doc = this.document;
        next.line = cursor.line;

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
            next = this.getToken(cursor, precise);
            next.line = cursor.line;
        } while (skipWhitespace && !/\S/.test(next.string));

        return next;
    };

    /**
     * Get the token before the one at the given cursor position
     *
     * @param {{line: number, ch: number}} [cursor] - Optional cursor position before
     *      which a token should be retrieved
     * @param {boolean} [skipWhitespace] - true if this should skip over whitespace tokens. Default is true.
     * @param {boolean} [precise] If given, results in more current results. Suppresses caching.
     * @return {{end: number, start:number, line: number,string: string, type: string}} - the CodeMirror token before
     * the one at the given cursor position
     */
    Editor.prototype.getPreviousToken = function (cursor, skipWhitespace = true, precise) {
        cursor = Object.assign({}, cursor || this.getCursorPos());
        let token = this.getToken(cursor, precise),
            prev = token,
            doc = this.document;
        prev.line = cursor.line;

        do {
            if (prev.start < cursor.ch) {
                cursor.ch = prev.start;
            } else if (cursor.line > 0) {
                cursor.ch = doc.getLine(cursor.line - 1).length;
                cursor.line--;
            } else {
                break;
            }
            prev = this.getToken(cursor, precise);
            prev.line = cursor.line;
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

    function getMarkOptionUnderlineError() {
        return {
            className: "editor-text-fragment-error"
        };
    }

    function getMarkOptionUnderlineWarn() {
        return {
            className: "editor-text-fragment-warn"
        };
    }

    function getMarkOptionUnderlineInfo() {
        return {
            className: "editor-text-fragment-info"
        };
    }

    function getMarkOptionUnderlineSpellcheck() {
        return {
            className: "editor-text-fragment-spell-error"
        };
    }

    function getMarkOptionHyperlinkText() {
        return {
            className: "editor-text-fragment-hover"
        };
    }

    function getMarkOptionMatchingRefs() {
        return {
            className: "editor-text-fragment-matching-refs"
        };
    }

    function getMarkOptionRenameOutline() {
        return {
            className: "editor-text-rename-outline",
            startStyle: "editor-text-rename-outline-left",
            endStyle: "editor-text-rename-outline-right",
            clearWhenEmpty: false,
            inclusiveLeft: true,
            inclusiveRight: true
        };
    }

    /**
     * Mark option to underline errors.
     */
    Editor.getMarkOptionUnderlineError = getMarkOptionUnderlineError;

    /**
     * Mark option to underline warnings.
     */
    Editor.getMarkOptionUnderlineWarn = getMarkOptionUnderlineWarn;

    /**
     * Mark option to underline informational text.
     */
    Editor.getMarkOptionUnderlineInfo = getMarkOptionUnderlineInfo;

    /**
     * Mark option to underline spelling errors.
     */
    Editor.getMarkOptionUnderlineSpellcheck = getMarkOptionUnderlineSpellcheck;

    /**
     * Mark option to highlight hyperlinks.
     */
    Editor.getMarkOptionHyperlinkText = getMarkOptionHyperlinkText;

    /**
     * Mark option for matching references.
     */
    Editor.getMarkOptionMatchingRefs = getMarkOptionMatchingRefs;

    /**
     * Mark option for renaming outlines.
     */
    Editor.getMarkOptionRenameOutline = getMarkOptionRenameOutline;

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
     * @param {string} [options.metadata] - If you want to store any metadata object with the mark, use this.
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
        newMark.metadata = options && options.metadata;
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
        return this.markText(markType, { line: cursor.line, ch: token.start },
            { line: cursor.line, ch: token.end }, options);
    };

    /**
     * Inserts a bookmark, a handle that follows the text around it as it is being edited, at the given position.
     * Similar to mark text, but for just a point instead of range.
     * @param {string} markType - A String that can be used to label the mark type.
     * @param {{line: number, ch: number}} [cursorPos] - Where to place the mark. Optional, if not specified, will
     * use current pos
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
        cursorPos = cursorPos || this.getCursorPos();
        let newMark = this._codeMirror.setBookmark(cursorPos, options);
        newMark.markType = markType;
        return newMark;
    };

    /**
     * Returns an array of all the bookmarks and marked ranges found between the given positions (non-inclusive).
     * @param {{line: number, ch: number}} cursorFrom - Mark start position
     * @param {{line: number, ch: number}} cursorTo - Mark end position
     * @param {string} [markType] - Optional, if given will only return marks of that type. Else returns everything.
     * @returns {TextMarker[]} TextMarker - A text marker array
     */
    Editor.prototype.findMarks = function (cursorFrom, cursorTo, markType) {
        let marks = this._codeMirror.findMarks(cursorFrom, cursorTo) || [];
        return marks.filter(function (mark) {
            return markType ? mark.markType === markType : true;
        });
    };

    /**
     * Returns an array of all the bookmarks and marked ranges present at the given position.
     * @param {{line: number, ch: number}} cursorPos - cursor position
     * @param {string} [markType] - Optional, if given will only return marks of that type. Else returns everything.
     * @returns {TextMarker[]} TextMarker - A text marker array
     */
    Editor.prototype.findMarksAt = function (cursorPos, markType) {
        let marks = this._codeMirror.findMarksAt(cursorPos) || [];
        return marks.filter(function (mark) {
            return markType ? mark.markType === markType : true;
        });
    };

    /**
     * Returns the first mark of a specific type found after the given position.
     * @param {{line: number, ch: number}} position - The starting position to search from.
     * @param {string} markType - The type of mark to look for.
     * @returns {TextMarker[]} The array of text markers found, or an empty array if none are found.
     */
    Editor.prototype.getMarksAfter = function (position, markType) {
        return this.findMarks(position, { line: this.lineCount(), ch: 0 }, markType) || [];
    };

    /**
     * Returns the first mark of a specific type found before the given position.
     * @param {{line: number, ch: number}} position - The ending position to search up to.
     * @param {string} markType - The type of mark to look for.
     * @returns {TextMarker[]} The array of text markers found, or an empty array if none are found.
     */
    Editor.prototype.getMarksBefore = function (position, markType) {
        return this.findMarks({ line: 0, ch: 0 }, position, markType) || [];
    };

    /**
     * Returns an array containing all marked ranges in the document.
     * @param {string} [markType] - Optional, if given will only return marks of that type. Else returns everything.
     * @returns {TextMarker[]} TextMarker - A text marker array
     */
    Editor.prototype.getAllMarks = function (markType) {
        let marks = this._codeMirror.getAllMarks() || [];
        return marks.filter(function (mark) {
            return markType ? mark.markType === markType : true;
        });
    };

    /**
     * Clears all marks of the given type. If a lineNumbers array is given, only clears marks on those lines.
     * If no markType or lineNumbers are given, clears all marks (use cautiously).
     * @param {string} [markType] - Optional, if given will only delete marks of that type. Else delete everything.
     * @param {number[]} [lineNumbers] - Optional, array of line numbers where marks should be cleared.
     */
    Editor.prototype.clearAllMarks = function (markType, lineNumbers) {
        const self = this;

        self._codeMirror.operation(function () {
            let marks = self.getAllMarks(markType);

            if (lineNumbers && Array.isArray(lineNumbers)) {
                // Filter marks to only those within the specified line numbers
                marks = marks.filter(function (mark) {
                    const range = mark.find(); // Get the range of the mark
                    if (!range) {
                        return false;
                    }

                    const startLine = range.from.line;
                    const endLine = range.to.line;

                    // Check if the mark overlaps with any of the specified lines
                    return lineNumbers.some(line => line >= startLine && line <= endLine);
                });
            }

            // Clear the filtered marks
            for (let mark of marks) {
                mark.clear();
            }
        });
    };

    /**
     * Checks if two positions in the editor are the same.
     *
     * @param {{line: number, ch: number}} position1 - cursor position
     * @param {{line: number, ch: number}} position2 - cursor position
     * @returns {boolean} True if both positions are the same, false otherwise.
     */
    Editor.prototype.isSamePosition = function (position1, position2) {
        return position1.line === position2.line && position1.ch === position2.ch;
    };

    /**
     * Get a (JSON-serializable) representation of the undo history.
     *
     * @returns {Array} The history of the editor.
     */
    Editor.prototype.getHistory = function () {
        return this._codeMirror.getHistory();
    };

    /**
     * Replace the editor's undo history with the one provided, which must be a value
     * as returned by getHistory. Note that this will have entirely undefined results
     * if the editor content isn't also the same as it was when getHistory was called.
     */
    Editor.prototype.setHistory = function () {
        return this._codeMirror.setHistory();
    };

    /**
     * Creates a named restore point in undo history. this can be later be restored to undo all
     * changed till the named restore point in one go.
     * @param {string} restorePointName - The name of the restore point to revert to.
     */
    Editor.prototype.createHistoryRestorePoint = function (restorePointName) {
        const history = this.getHistory();
        if (history.done && history.done.length) {
            history.done[history.done.length - 1].restorePointName = restorePointName;
        }
        // the current history event should be ‘closed’, meaning it can't be combined with further changes
        // (rapid typing or deleting events are typically combined) as we need to effectively snapshot this history
        // point at this time.
        this._codeMirror.changeGeneration(true);
    };

    /**
     * To restore the editor to a named restore point
     * if the restore point is found, it reverts all changes made after that point.
     *
     * @param {string} restorePointName - The name of the restore point to revert to.
     */
    Editor.prototype.restoreHistoryPoint = function (restorePointName) {
        const history = this.getHistory();
        if (!history.done && !history.done.length) {
            return;
        }
        let canRestore = false;
        for (let i = history.done.length - 1; i >= 0; i--) {
            // history is a stack
            const historyEntry = history.done[i];
            if (historyEntry.restorePointName === restorePointName) {
                canRestore = true;
                break;
            }
        }
        if (!canRestore) {
            return;
        }
        const cm = this._codeMirror;
        const self = this;
        cm.operation(function () {
            let newHistory = self.getHistory(), historyLength;
            let lastHistoryItem = newHistory.done && newHistory.done.length
                && history.done[history.done.length - 1];
            while (lastHistoryItem && lastHistoryItem.restorePointName !== restorePointName) {
                newHistory = self.getHistory();
                historyLength = newHistory.done.length;
                cm.undoSelection();
                newHistory = self.getHistory();
                if (historyLength === newHistory.done.length) {
                    // undo selection didnt do anything, try undo
                    cm.undo();
                    newHistory = self.getHistory();
                    if (historyLength === newHistory.done.length) {
                        // we cant undo, and this will go into an infinite loop if we continue.
                        console.error("Could not undo history to restore snapshot!");
                        break;
                    }
                }
                lastHistoryItem = newHistory.done && newHistory.done.length
                    && newHistory.done[newHistory.done.length - 1];
            }
        });
    };

    /**
     * Sets the current selection. Start is inclusive, end is exclusive. Places the cursor at the
     * end of the selection range. Optionally centers around the cursor after
     * making the selection
     *
     * @param {{line:number, ch:number}} start
     * @param {{line:number, ch:number}} [end] If not specified, defaults to start.
     * @param {boolean} [center] true to center the viewport
     * @param {number} [centerOptions] Option value, or 0 for no options; one of the BOUNDARY_* constants above.
     * @param {?string} [origin] An optional string that describes what other selection or edit operations this
     *      should be merged with for the purposes of undo. See {@link Document::Document#replaceRange} for more details.
     */
    Editor.prototype.setSelection = function (start, end, center, centerOptions, origin) {
        this.setSelections([{ start: start, end: end || start }], center, centerOptions, origin);
    };

    /**
     * Replace the selection with the given string.
     * @param {string} replacement the text to replace the current selection
     * @param {string} [select] The optional select argument can be used to change selection. Passing "around"
     * will cause the new text to be selected, passing "start" will collapse the selection to the start
     * of the inserted text.
     */
    Editor.prototype.replaceSelection = function (replacement, select) {
        this._codeMirror.replaceSelection(replacement, select);
    };

    /**
     * Replaces the content of multiple selections with the strings in the array. The length of the given
     * array should be the same as the number of active selections.
     * @param {Array<string>} replacement the text array to replace the current selections with
     * @param {string} [select] The optional select argument can be used to change selection. Passing "around"
     * will cause the new text to be selected, passing "start" will collapse the selection to the start
     * of the inserted text.
     */
    Editor.prototype.replaceSelections = function (replacement, select) {
        this._codeMirror.replaceSelections(replacement, select);
    };

    /**
     * Replace the part of the document between from and to with the given string.
     * @param {string} replacement the text to replace the current selection
     * @param {{line:number, ch:number}} from the strat position to replace
     * @param {{line:number, ch:number}} [to] the end position to replace. to can be left off to simply
     * insert the string at position from.
     * @param {string} origin When origin is given, it will be passed on to "change" events, and its first
     * letter will be used to determine whether this change can be merged with previous history events
     * of the inserted text.
     */
    Editor.prototype.replaceRange = function (replacement, from, to, origin) {
        this._codeMirror.replaceRange(replacement, from, to, origin);
    };


    /**
     * Replaces multiple ranges in the editor with the specified texts.
     *
     * @method
     * @param {Array} ranges - An array of range objects, each containing `from`, `to`, and `text` properties.
     * @param {Object} ranges[].from - The start position of the range to be replaced. It should have `line` and `ch` properties.
     * @param {Object} ranges[].to - The end position of the range to be replaced. It should have `line` and `ch` properties.
     * @param {string} ranges[].text - The text to replace the specified range.
     * @param {string} [origin] - An optional origin identifier to be associated with the changes.
     * @example
     * editor.replaceMultipleRanges([
     *   { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 }, text: 'Hello' },
     *   { from: { line: 1, ch: 0 }, to: { line: 1, ch: 4 }, text: 'World' }
     * ], 'exampleOrigin');
     */
    Editor.prototype.replaceMultipleRanges = function (ranges, origin) {
        // Sort ranges in descending order by start position so that they dont step over each other
        let self = this;
        self.operation(() => {
            ranges.sort((a, b) => {
                if (a.from.line === b.from.line) {
                    return b.from.ch - a.from.ch;
                }
                return b.from.line - a.from.line;
            });

            // Replace each range with its corresponding replacement text
            ranges.forEach(range => {
                self.replaceRange(range.text, range.from, range.to, origin);
            });
        });
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
     * @param {!{start:{line:number, ch:number}, end:{line:number, ch:number}, primary:boolean, reversed: boolean}} selections
     *      The selection ranges to set. If the start and end of a range are the same, treated as a cursor.
     *      If reversed is true, set the anchor of the range to the end instead of the start.
     *      If primary is true, this is the primary selection. Behavior is undefined if more than
     *      one selection has primary set to true. If none has primary set to true, the last one is primary.
     * @param {boolean} center true to center the viewport around the primary selection.
     * @param {number} centerOptions Option value, or 0 for no options; one of the BOUNDARY_* constants above.
     * @param {?string} origin An optional string that describes what other selection or edit operations this
     *      should be merged with for the purposes of undo. See {@link Document::Document#replaceRange} for more details.
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
     * To get the text between the starting position and the ending position
     * @param {!{line:number, ch:number}} startPos | The starting position
     * @param {!{line:number, ch:number}} endPos | The ending position
     * @returns {string} The text between the starting position and the ending position
     */
    Editor.prototype.getTextBetween = function (startPos, endPos) {
        const text = this._codeMirror.getRange(startPos, endPos);
        return text;
    };

    /**
     * Gets word at the given pos lies within or adjacent to. If pos isn't touching a word
     * (e.g. within a token like "//"), returns null
     * @param pos
     * @return {{text:string, startPos:{line:number, ch:number}, endPos: {line:number, ch:number}}}
     */
    Editor.prototype.getWordAt = function (pos) {
        const wordRange = this._codeMirror.findWordAt(pos);
        const text = this._codeMirror.getRange(wordRange.anchor, wordRange.head);
        return {
            text,
            startPos: wordRange.anchor,
            endPos: wordRange.head
        };
    };

    /**
     * Gets number string of (upto 10 digits default) at the given pos lies within or adjacent to.
     * If pos isn't touching a number, returns null. If the number in string is greater than max digits
     *  returns null.
     * @param pos
     * @param {number} maxDigits - number of digits allowed. This is to prevent massive digit strings.
     * @return {{text:string, startPos:{line:number, ch:number}, endPos: {line:number, ch:number}}}
     */
    Editor.prototype.getNumberAt = function (pos, maxDigits = 10) {
        // Eg: string "margin:1.4em;" the position maybe at the location 4, . or 1
        const token = this._codeMirror.getTokenAt(pos);
        const maxDigitsOverflow = maxDigits + 1;

        if (token.type === "string" || token.type === "number") {
            const str = token.string;
            let left = pos.ch - token.start; // Start scanning from the given position
            let right = left;
            let decimalAlreadyFound = false,
                digitCount = 0;

            // Scan left to find the start of the number
            while (left - 1 >= 0 && (/\d|\.|-/).test(str[left - 1]) && digitCount < maxDigitsOverflow) {
                // Make sure not to count multiple decimal points in a number
                if (str[left - 1] === '.' && !decimalAlreadyFound) {
                    decimalAlreadyFound = true;
                } else if (str[left - 1] === '.' && decimalAlreadyFound) {
                    break;
                } else if (str[left - 1] === '-') {
                    left--;
                    break;
                }
                digitCount++;
                left--;
            }

            // Scan right to find the end of the number
            while (right < str.length && (/\d|\./).test(str[right]) && digitCount < maxDigitsOverflow) {
                // Make sure not to count multiple decimal points in a number
                if (str[right] === '.' && !decimalAlreadyFound) {
                    decimalAlreadyFound = true;
                } else if (str[right] === '.' && decimalAlreadyFound) {
                    break;
                }
                digitCount++;
                right++;
            }

            // If we found a number, and it is withing the original max digit count, return the result
            if (left !== right && digitCount !== maxDigitsOverflow) {
                const text = str.substring(left, right);
                if (text !== "." && text !== "-") {
                    return {
                        text: str.substring(left, right),
                        startPos: { line: pos.line, ch: token.start + left },
                        endPos: { line: pos.line, ch: token.start + right }
                    };
                }
            }
        }

        return null;
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
        var coords = this._codeMirror.charCoords({ line: line, ch: 0 }, "local"),
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

    /**
     * Hides the specified line number in the editor
     * @private
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
            { line: from, ch: 0 },
            { line: to - 1, ch: this._codeMirror.getLine(to - 1).length },
            { collapsed: true, inclusiveLeft: true, inclusiveRight: true, clearWhenEmpty: false }
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
     * @private
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

    /**
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
     * @return {!{id:number, data:Object[]}}
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
     * @typedef {scrollPos:{x:number, y:number},{start:{line:number, ch:number},end:{line:number, ch:number}}} EditorViewState
     */

    /**
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
     * @param {{start:{line:number, ch:number}, end:{line:number, ch:number}, reversed:boolean}} selection
     * @return {?(Object|string)} Name of syntax-highlighting mode, or object containing a "name" property
     *     naming the mode along with configuration options required by the mode.
     * @see {@link LanguageManager::#getLanguageForPath} and {@link LanguageManager::Language#getMode}.
     */
    Editor.prototype.getModeForSelection = function (selection) {
        // Check for mixed mode info
        var self = this,
            sels = selection ? [selection] : this.getSelections(),
            primarySel = selection || this.getSelection(),
            outerMode = this._codeMirror.getMode(),
            startMode = TokenUtils.getModeAt(this._codeMirror, primarySel.start),
            isMixed = (outerMode.name !== startMode.name);

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
     * gets the language for the selection. (Javascript selected from an HTML document or CSS selected from an HTML
     * document, etc...)
     * @return {!Language}
     */
    Editor.prototype.getLanguageForPosition = function (pos) {
        let self = this;
        pos = pos || self.getCursorPos();
        return this.document.getLanguage().getLanguageForMode(self.getModeForSelection({ start: pos, end: pos }));
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
     * @private
     * @type {?number}
     */
    Editor.prototype._lastEditorWidth = null;


    /**
     * If true, we're in the middle of syncing to/from the Document. Used to ignore spurious change
     * events caused by us (vs. change events caused by others, which we need to pay attention to).
     * @private
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
     * @type {!{id:number, data:Object[]}}
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


    const SPACING_OPTIONS = new Set([
        AUTO_TAB_SPACES,
        USE_TAB_CHAR,
        SPACE_UNITS,
        TAB_SIZE
    ]);
    /**
     * @private
     *
     * Updates the editor to the current value of prefName for the file being edited.
     *
     * @param {string} prefName Name of the preference to visibly update
     */
    Editor.prototype._updateOption = function (prefName) {
        let oldValue = this._currentOptions[prefName],
            newValue = this._getOption(prefName);

        const fullPath = this.document.file.fullPath;
        if (SPACING_OPTIONS.has(prefName)) {
            const newUseAutoTabs = Editor.getAutoTabSpaces(fullPath);
            if (newUseAutoTabs) {
                _computeTabSpaces(this);
            }
            const newUseTabCharCfg = Editor.getUseTabChar(fullPath);
            const newSpaceUnits = Editor.getSpaceUnits(fullPath);
            const newTabSize = Editor.getTabSize(fullPath);
            const newTabUnits = Editor.getAutoTabUnits(fullPath);
            if (this._currentOptions[AUTO_TAB_SPACES] === newUseAutoTabs &&
                this._currentOptions[USE_TAB_CHAR] === newUseTabCharCfg &&
                this._currentOptions[SPACE_UNITS] === newSpaceUnits &&
                this._currentOptions[TAB_SIZE] === newTabSize) {
                // no change
                const currentIndentUnit = this._codeMirror.getOption("indentUnit");
                let expectedIndentUnit;
                if (newUseAutoTabs) {
                    expectedIndentUnit = newUseTabCharCfg ?
                        newTabUnits * this._currentOptions[TAB_SIZE] :
                        this._currentOptions[SPACE_UNITS];
                } else {
                    expectedIndentUnit = newUseTabCharCfg ?
                        this._currentOptions[TAB_SIZE] :
                        this._currentOptions[SPACE_UNITS];
                }
                if (currentIndentUnit === expectedIndentUnit) {
                    return;
                }
            }
            this._currentOptions[AUTO_TAB_SPACES] = newUseAutoTabs;
            this._currentOptions[USE_TAB_CHAR] = newUseTabCharCfg;
            this._currentOptions[SPACE_UNITS] = newSpaceUnits;
            this._currentOptions[TAB_SIZE] = newTabSize;
            this._codeMirror.setOption(cmOptions[USE_TAB_CHAR], newUseTabCharCfg);
            if (newUseAutoTabs) {
                if (newUseTabCharCfg) {
                    this._codeMirror.setOption(cmOptions[TAB_SIZE], this._currentOptions[TAB_SIZE]);
                    this._codeMirror.setOption("indentUnit", newTabUnits * this._currentOptions[TAB_SIZE]);
                } else {
                    this._codeMirror.setOption(cmOptions[TAB_SIZE], this._currentOptions[TAB_SIZE]);
                    this._codeMirror.setOption("indentUnit", this._currentOptions[SPACE_UNITS]);
                }
            } else {
                this._codeMirror.setOption("indentUnit", newUseTabCharCfg === true ?
                    this._currentOptions[TAB_SIZE] :
                    this._currentOptions[SPACE_UNITS]
                );
                this._codeMirror.setOption(cmOptions[TAB_SIZE], this._currentOptions[TAB_SIZE]);
            }
            this._codeMirror.setOption(cmOptions[USE_TAB_CHAR], newUseTabCharCfg);
            this.trigger("optionChange", AUTO_TAB_SPACES, newUseAutoTabs);
            this.trigger("optionChange", USE_TAB_CHAR, newUseTabCharCfg);
            return;
        }

        if (oldValue !== newValue) {
            this._currentOptions[prefName] = newValue;

            if (prefName === STYLE_ACTIVE_LINE) {
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

    Editor.prototype._getRegisteredGutters = function () {
        const languageId = this.document.getLanguage().getId();

        function _filterByLanguages(gutter) {
            return !gutter.languages || gutter.languages.indexOf(languageId) > -1;
        }

        function _sortByPriority(a, b) {
            return a.priority - b.priority;
        }

        function _getName(gutter) {
            return gutter.name;
        }

        // If the line numbers gutter has not been explicitly registered and the CodeMirror lineNumbes option is
        // set to true, we explicitly add the line numbers gutter. This case occurs the first time the editor loads
        // and showLineNumbers is set to true in preferences
        const gutters = registeredGutters.map(_getName);
        if (gutters.indexOf(LINE_NUMBER_GUTTER) < 0 && this._codeMirror.getOption(cmOptions[SHOW_LINE_NUMBERS])) {
            registeredGutters.push({ name: LINE_NUMBER_GUTTER, priority: LINE_NUMBER_GUTTER_PRIORITY });
        }

        return  registeredGutters.sort(_sortByPriority)
            .filter(_filterByLanguages)
            .map(_getName);
    };

    /**
     * Renders all registered gutters
     * @private
     */
    Editor.prototype._renderGutters = function () {
        const rootElement = this.getRootElement();
        const gutters = this._getRegisteredGutters();

        this._codeMirror.setOption("gutters", gutters);
        this._codeMirror.refresh();

        if (gutters.indexOf(LINE_NUMBER_GUTTER) < 0) {
            $(rootElement).addClass("linenumber-disabled");
        } else {
            $(rootElement).removeClass("linenumber-disabled");
        }
    };

    /**
     * Sets the marker for the specified gutter on the specified line number
     * @param   {number}   lineNumber The line number for the inserted gutter marker
     * @param   {string}   gutterName The name of the gutter
     * @param   {object}   marker     The dom element representing the marker to the inserted in the gutter
     * @returns {{lineNo : function}}   lineHandle   this can be used to track the gutter line as the line number
     *                                  changes as the user edits code.
     */
    Editor.prototype.setGutterMarker = function (lineNumber, gutterName, marker) {
        if (!Editor.isGutterRegistered(gutterName)) {
            console.warn("Gutter name must be registered before calling editor.setGutterMarker");
            return;
        }

        return this._codeMirror.setGutterMarker(lineNumber, gutterName, marker);
    };

    /**
     * Gets the gutter marker of the given name if found on the current line, else returns undefined.
     * @param   {number}   lineNumber The line number for the inserted gutter marker
     * @param   {string}   gutterName The name of the gutter
     */
    Editor.prototype.getGutterMarker = function (lineNumber, gutterName) {
        if (!Editor.isGutterRegistered(gutterName)) {
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
     * Returns true if this editor has the named gutter activated. gutters are considered active if the gutter is
     * registered for the language of the file currently shown in the editor.
     * @param {string} gutterName The name of the gutter to check
     */
    Editor.prototype.isGutterActive = function (gutterName) {
        const gutters = this._getRegisteredGutters();
        return gutters.includes(gutterName);
    };

    /**
     * Clears all marks from the gutter with the specified name.
     * @param {string} gutterName The name of the gutter to clear.
     */
    Editor.prototype.clearGutter = function (gutterName) {
        if (!Editor.isGutterRegistered(gutterName)) {
            console.warn("Gutter name must be registered before calling editor.clearGutter");
            return;
        }
        this._codeMirror.clearGutter(gutterName);
    };

    /**
     * Tries to uncomment the current selection, and if that fails, line-comments it.
     * This is internal private api used by phoenix line toggle command
     * @private
     */
    Editor.prototype._toggleComment = function () {
        const indentLineComment = Editor.getIndentLineComment(this.document.file.fullPath);
        this._codeMirror.toggleComment({
            indent: indentLineComment
        });
    };

    /**
     * Returns the list of gutters current registered on all editors.
     * @return {!{name: string, priority: number}}
     */
    Editor.getRegisteredGutters = function () {
        return registeredGutters;
    };

    /**
     * Return true if gutter of the given name is registered
     * @param   {string}   gutterName The name of the gutter
     * @return {boolean}
     */
    Editor.isGutterRegistered = function (gutterName) {
        return registeredGutters.some(function (gutter) {
            return gutter.name === gutterName;
        });
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

        var gutter = { name: name, priority: priority, languages: languageIds },
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
    let computedTabSpaces = new Map();
    function _getCachedSpaceCfg(key) {
        // there are two storages for auto detected spaces for files. IF the user has explicitly set the spacing
        // through the status bar, its stored permanently. else its computed on the fly
        let cachedCfg = tabSpacesStateManager.get(key);
        if (cachedCfg) {
            return cachedCfg;
        }
        return computedTabSpaces.get(key);
    }

    /**
     * Sets whether to use tab characters (vs. spaces) when inserting new text.
     * Affects any editors that share the same preference location.
     * @param {boolean} value
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean} true if value was valid
     */
    Editor.setUseTabChar = function (value, fullPath) {
        let computedValues = _getCachedSpaceCfg(fullPath);
        if (Editor.getAutoTabSpaces(fullPath) && computedValues) {
            computedValues.useTabChar = value;
            // persist explicitly user set values to storage
            tabSpacesStateManager.set(fullPath, computedValues);
            Editor.forEveryEditor(editor => {
                editor._updateOption(USE_TAB_CHAR);
            }, fullPath);
            return true;
        }
        var options = fullPath && { context: fullPath };
        return PreferencesManager.set(USE_TAB_CHAR, value, options);
    };

    /**
     * Gets whether the specified or current file uses tab characters (vs. spaces) when inserting new text
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean}
     */
    Editor.getUseTabChar = function (fullPath) {
        let computedValues = _getCachedSpaceCfg(fullPath);
        if (Editor.getAutoTabSpaces(fullPath) && computedValues) {
            return computedValues.useTabChar;
        }
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
        let computedValues = _getCachedSpaceCfg(fullPath);
        if (Editor.getAutoTabSpaces(fullPath) && computedValues) {
            if (EditorPreferences.isValidTabSize(value)) {
                computedValues.tabSize = value;
                // persist explicitly user set values to storage
                tabSpacesStateManager.set(fullPath, computedValues);
                Editor.forEveryEditor(editor => {
                    editor._updateOption(TAB_SIZE);
                }, fullPath);
            }
            return true;
        }
        var options = fullPath && { context: fullPath };
        return PreferencesManager.set(TAB_SIZE, value, options);
    };

    /**
     * Get indent unit
     * @param {string=} fullPath Path to file to get preference for
     * @return {number}
     */
    Editor.getTabSize = function (fullPath) {
        let computedValues = _getCachedSpaceCfg(fullPath);
        if (Editor.getAutoTabSpaces(fullPath) && computedValues && computedValues.tabSize) {
            return computedValues.tabSize;
        }
        return PreferencesManager.get(TAB_SIZE, _buildPreferencesContext(fullPath));
    };

    /**
     * Gets the number of tabs for the file. Will
     * @param fullPath
     * @returns {number|*}
     */
    Editor.getAutoTabUnits = function (fullPath) {
        let computedValues = _getCachedSpaceCfg(fullPath);
        if (Editor.getAutoTabSpaces(fullPath) && computedValues && computedValues.tabUnits) {
            return computedValues.tabUnits;
        }
        return EditorPreferences.MIN_SPACE_UNITS;
    };

    const MAX_LINES_TO_SCAN_FOR_INDENT = 700; // this is high to account for any js docs/ file comments
    function _computeTabSpaces(editor, scanFullFile, recompute) {
        const fullPath = editor.document.file.fullPath;
        if (_getCachedSpaceCfg(fullPath) && !recompute) {
            return;
        }
        // we only scan the first 200 lines of text to determine the spaces.
        const detectedVals = editor._detectIndent(scanFullFile ? undefined : MAX_LINES_TO_SCAN_FOR_INDENT);
        const useTabChar = (detectedVals.type === "tab");
        let amount = detectedVals.amount;
        if (!detectedVals.type || !amount) {
            // this happens if the util cant find out the tab/spacing config
            amount = EditorPreferences.DEFAULT_SPACE_UNITS;
        }
        tabSpacesStateManager.set(fullPath, null); // we dont have a remove api, so just nulling for now
        computedTabSpaces.set(fullPath, {
            useTabChar,
            tabSize: EditorPreferences.DEFAULT_TAB_SIZE,
            spaceUnits: useTabChar ? 0 : Math.min(amount, EditorPreferences.MAX_SPACE_UNITS),
            tabUnits: useTabChar ? Math.min(amount, EditorPreferences.MAX_AUTO_TAB_UNITS) : 0
        });
    }
    Editor._autoDetectTabSpaces = function (editor, scanFullFile, recompute) {
        if (!editor) {
            return;
        }
        const fullPath = editor.document.file.fullPath;
        if (!Editor.getAutoTabSpaces(fullPath)) {
            return; // auto detect is disabled
        }
        if (_getCachedSpaceCfg(fullPath) && !recompute) {
            editor._updateOption(AUTO_TAB_SPACES);
            return;
        }
        _computeTabSpaces(editor, scanFullFile, recompute);
        editor._updateOption(AUTO_TAB_SPACES);
    };

    /**
     * When set, the tabs and spaces to be used will be auto detected from the current file or fall back to defaults.
     * Affects any editors that share the same preference location.
     * @param {boolean} value
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean} true if value was valid
     */
    Editor.setAutoTabSpaces = function (value, fullPath) {
        const options = fullPath && { context: fullPath };
        return PreferencesManager.set(AUTO_TAB_SPACES, value, options);
    };

    /**
     * Get auto tabbing/spacing option
     * @param {string=} fullPath Path to file to get preference for
     * @return {number}
     */
    Editor.getAutoTabSpaces = function (fullPath) {
        return PreferencesManager.get(AUTO_TAB_SPACES, _buildPreferencesContext(fullPath));
    };

    /**
     * Sets indentation width.
     * Affects any editors that share the same preference location.
     * @param {number} value
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean} true if value was valid
     */
    Editor.setSpaceUnits = function (value, fullPath) {
        let computedValues = _getCachedSpaceCfg(fullPath);
        if (Editor.getAutoTabSpaces(fullPath) && computedValues) {
            if (EditorPreferences.isValidSpaceUnit(value)) {
                computedValues.spaceUnits = value;
                // persist explicitly user set values to storage
                tabSpacesStateManager.set(fullPath, computedValues);
                Editor.forEveryEditor(editor => {
                    editor._updateOption(SPACE_UNITS);
                }, fullPath);
            }
            return true;
        }
        var options = fullPath && { context: fullPath };
        return PreferencesManager.set(SPACE_UNITS, value, options);
    };

    /**
     * Get indentation width
     * @param {string=} fullPath Path to file to get preference for
     * @return {number}
     */
    Editor.getSpaceUnits = function (fullPath) {
        let computedValues = _getCachedSpaceCfg(fullPath);
        if (Editor.getAutoTabSpaces(fullPath) && computedValues && computedValues.spaceUnits) {
            return computedValues.spaceUnits;
        }
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
        var options = fullPath && { context: fullPath };
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
        var options = fullPath && { context: fullPath };
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
        var options = fullPath && { context: fullPath };
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
        var options = fullPath && { context: fullPath };
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
     * Runs callback for every Editor instance that currently exists or only the editors matching the given fullPath.
     * @param {!function(!Editor)} callback
     * @param {string} [fullPath] an optional second argument, if given will only callback for all editors
     *  that is editing the file for the given fullPath
     */
    Editor.forEveryEditor = function (callback, fullPath) {
        _instances.forEach(function (editor) {
            if (!fullPath) {
                callback(editor);
            } else if (editor.document.file.fullPath === fullPath) {
                callback(editor);
            }
        });
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
     * @private
     * Each Editor instance object dispatches the following events:
     *    - keydown, keypress, keyup -- When any key event happens in the editor (whether it changes the
     *      text or not). Handlers are passed `(BracketsEvent, Editor, KeyboardEvent)`. The 3nd arg is the
     *      raw DOM event. Note: most listeners will only want to listen for "keypress".
     *    - change - Triggered with an array of change objects. Parameters: (editor, changeList)
     *    - beforeChange - (self, changeObj)
     *    - beforeSelectionChange - (selectionObj)
     *    - focus - Fired when an editor is focused
     *    - blur - Fired when an editor loses focused
     *    - update - Will be fired whenever Editor updates its DOM display.
     *    - cursorActivity -- When the user moves the cursor or changes the selection, or an edit occurs.
     *      Note: do not listen to this in order to be generally informed of edits--listen to the
     *      "change" event on Document instead.
     *    - scroll -- When the editor is scrolled, either by user action or programmatically.
     *    - viewportChange - (from: number, to: number) Fires whenever the view port of the editor changes
     *      (due to scrolling, editing, or any other factor). The from and to arguments give the new start
     *      and end of the viewport. This is combination with `editorInstance.getViewPort()` can be used to
     *      selectively redraw visual elements in code like syntax analyze only parts of code instead
     *      of the full code everytime.
     *    - lostContent -- When the backing Document changes in such a way that this Editor is no longer
     *      able to display accurate text. This occurs if the Document's file is deleted, or in certain
     *      Document->editor syncing edge cases that we do not yet support (the latter cause will
     *      eventually go away).
     *    - optionChange -- Triggered when an option for the editor is changed. The 2nd arg to the listener
     *      is a string containing the editor option that is changing. The 3rd arg, which can be any
     *      data type, is the new value for the editor option.
     *    - beforeDestroy - Triggered before the object is about to dispose of all its internal state data
     *      so that listeners can cache things like scroll pos, etc...
     */
    Editor.EVENT_BEFORE_CHANGE = "beforeChange";
    Editor.EVENT_CHANGE = "change";
    Editor.EVENT_BEFORE_SELECTION_CHANGE = "beforeSelectionChange";
    Editor.EVENT_CURSOR_ACTIVITY = "cursorActivity";
    Editor.EVENT_KEY_PRESS = "keypress";
    Editor.EVENT_KEY_DOWN = "keydown";
    Editor.EVENT_KEY_UP = "keyup";
    Editor.EVENT_FOCUS = "focus";
    Editor.EVENT_BLUR = "blur";
    Editor.EVENT_UPDATE = "update";
    Editor.EVENT_SCROLL = "scroll";
    Editor.EVENT_VIEW_PORT_CHANGE = "viewportChange";
    Editor.EVENT_LOST_CONTENT = "lostContent";
    Editor.EVENT_OPTION_CHANGE = "optionChange";

    // Set up listeners for preference changes
    editorOptions.forEach(function (prefName) {
        PreferencesManager.on("change", prefName, function () {
            _instances.forEach(function (editor) {
                editor._updateOption(prefName);
            });
        });
    });

    // Define public API
    exports.Editor = Editor;
    exports.BOUNDARY_CHECK_NORMAL = BOUNDARY_CHECK_NORMAL;
    exports.BOUNDARY_IGNORE_TOP = BOUNDARY_IGNORE_TOP;
    exports.BOUNDARY_BULLSEYE = BOUNDARY_BULLSEYE;
});
