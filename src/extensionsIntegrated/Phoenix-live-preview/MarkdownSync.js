/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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
 * Bidirectional sync between Phoenix's CM5 document editor and the mdviewr iframe.
 * Handles content sync, theme sync, locale sync, and edit mode relay.
 */

define(function (require, exports, module) {

    const ThemeManager = require("view/ThemeManager"),
        NativeApp = require("utils/NativeApp"),
        EditorManager = require("editor/EditorManager"),
        utils = require("./utils");

    let _active = false;
    let _doc = null;
    let _$iframe = null;
    let _mdIframeRef = null; // persistent reference to the md iframe DOM element, survives deactivate
    let _baseURL = "";
    let _syncId = 0;
    let _lastReceivedSyncId = -1;
    let _syncingFromIframe = false;
    let _activeCM = null; // direct CM reference from activation
    let _iframeReady = false;
    let _debounceTimer = null;
    let _scrollSyncTimer = null;
    let _selectionSyncTimer = null;
    let _messageHandler = null;
    let _docChangeHandler = null;
    let _themeChangeHandler = null;
    let _cursorHandler = null;
    let _focusHandler = null;
    let _changeHandler = null;
    let _scrollHandler = null;
    let _scrollSyncFromIframe = false; // prevents feedback loops
    let _onEditModeRequest = null;
    let _onIframeReadyCallback = null;
    let _cursorSyncEnabled = true;
    // Stacks of cursor positions { sourceLine, offsetInBlock } for undo/redo restore
    let _cursorUndoStack = [];
    let _cursorRedoStack = [];

    const DEBOUNCE_TO_IFRAME_MS = 150;
    const SCROLL_SYNC_DEBOUNCE_MS = 16;
    const SELECTION_SYNC_DEBOUNCE_MS = 200;

    /**
     * Start syncing for the given document and iframe.
     * If the iframe is the same as the previous activation (e.g. switching between markdown files),
     * content is sent immediately without waiting for mdviewrReady.
     *
     * @param {Document} doc - Phoenix CM5 Document
     * @param {jQuery} $iframe - The iframe jQuery element
     * @param {string} baseURL - Base URL for resolving relative image/resource paths
     */
    function activate(doc, $iframe, baseURL) {
        if (_active) {
            deactivate();
        }

        _doc = doc;
        // Check if this is the same iframe we've used before (persistent md iframe)
        const reusingIframe = _mdIframeRef && $iframe[0] === _mdIframeRef;
        _$iframe = $iframe;
        _mdIframeRef = $iframe[0];
        _baseURL = baseURL;
        _active = true;
        _iframeReady = reusingIframe;
        _syncId = 0;
        _lastReceivedSyncId = -1;

        // Listen for messages from iframe
        _messageHandler = function (event) {
            if (!_active) {
                return;
            }
            const data = event.data;
            if (!data || data.type !== "MDVIEWR_EVENT") {
                return;
            }
            // Verify message is from our iframe
            if (_$iframe && _$iframe[0] && event.source !== _$iframe[0].contentWindow) {
                return;
            }

            switch (data.eventName) {
            case "mdviewrReady":
                _onIframeReady();
                break;
            case "mdviewrContentChanged":
                _onIframeContentChanged(data);
                break;
            case "mdviewrUndo":
                _handleUndo();
                break;
            case "mdviewrRedo":
                _handleRedo();
                break;
            case "mdviewrEditModeChanged":
                // When switching to reader, send CM content so the iframe
                // can re-render with accurate data-source-line for cursor sync.
                if (!data.editMode && _doc) {
                    const iframeWindow = _getIframeWindow();
                    if (iframeWindow) {
                        iframeWindow.postMessage({
                            type: "MDVIEWR_RERENDER_CONTENT",
                            markdown: _doc.getText()
                        }, "*");
                    }
                }
                break;
            case "mdviewrRequestEditMode":
                if (_onEditModeRequest) {
                    _onEditModeRequest();
                }
                break;
            case "mdviewrCursorSyncToggle":
                _cursorSyncEnabled = !!data.enabled;
                break;
            case "mdviewrThemeToggle":
                sendThemeOverride(data.theme);
                // Persist via StateManager (accessed through main.js callback)
                if (_onThemeToggle) {
                    _onThemeToggle(data.theme);
                }
                break;
            case "mdviewrImageUploadRequest":
                _handleImageUploadFromIframe(data);
                break;
            case "mdviewrKeyboardShortcut":
                _forwardKeyboardShortcut(data);
                break;
            case "embeddedIframeFocusEditor":
                if (_cursorSyncEnabled && data.sourceLine != null) {
                    _scrollCMToLine(data.sourceLine);
                }
                utils.focusActiveEditorIfFocusInLivePreview();
                break;
            case "mdviewrScrollSync":
                if (_cursorSyncEnabled && data.sourceLine != null) {
                    if (data.fromScroll) {
                        _scrollCMToLineNoFeedback(data.sourceLine);
                    } else {
                        _scrollCMToLine(data.sourceLine);
                    }
                }
                break;
            case "mdviewrCursorLine":
                // Fast path: just update CM line highlight, no scroll
                if (_cursorSyncEnabled && data.sourceLine != null) {
                    const cm = _getCM();
                    if (cm) {
                        _flashCMLine(cm, Math.max(0, data.sourceLine - 1));
                    }
                }
                break;
            case "mdviewrSelectionSync":
                if (_cursorSyncEnabled) {
                    _handleSelectionFromIframe(data);
                }
                break;
            case "embeddedIframeHrefClick":
                _handleHrefClick(data);
                break;
            case "embeddedEscapeKeyPressed":
                utils.focusActiveEditorIfFocusInLivePreview();
                break;
            }
        };
        window.addEventListener("message", _messageHandler);

        // Listen for CM5 document changes (Phoenix → iframe)
        let _lastChangeOrigin = null;
        _docChangeHandler = function () {
            if (_syncingFromIframe) {
                return;
            }
            if (!_iframeReady) {
                return;
            }
            clearTimeout(_debounceTimer);
            _debounceTimer = setTimeout(function () {
                _sendUpdate(_lastChangeOrigin);
                _lastChangeOrigin = null;
            }, DEBOUNCE_TO_IFRAME_MS);
        };
        _doc.on("change", _docChangeHandler);

        // Listen for theme changes
        _themeChangeHandler = function () {
            _sendTheme();
        };
        ThemeManager.on("themeChange", _themeChangeHandler);

        // Listen for cursor activity in CM5 for scroll sync, selection sync, and toolbar state (CM5 → iframe)
        _cursorHandler = function () {
            if (_syncingFromIframe || !_iframeReady) {
                return;
            }
            // Toolbar state sync always runs (independent of cursor sync toggle)
            _syncToolbarStateToIframe();
            if (!_cursorSyncEnabled) {
                return;
            }
            clearTimeout(_scrollSyncTimer);
            _scrollSyncTimer = setTimeout(function () {
                _syncScrollToIframe();
            }, SCROLL_SYNC_DEBOUNCE_MS);
            clearTimeout(_selectionSyncTimer);
            _selectionSyncTimer = setTimeout(function () {
                _syncSelectionToIframe();
            }, SELECTION_SYNC_DEBOUNCE_MS);
        };
        const cm = _getCM();
        _activeCM = cm;
        if (cm) {
            // Clear sync highlight when CM gets focus (user is editing in CM)
            _focusHandler = function () {
                if (_highlightLineHandle) {
                    cm.removeLineClass(_highlightLineHandle, "background", "cm-cursor-sync-highlight");
                    _highlightLineHandle = null;
                }
            };
            // Listen for change origin (undo/redo detection)
            _changeHandler = function (_cm, changeObj) {
                if (changeObj) {
                    _lastChangeOrigin = changeObj.origin;
                }
            };
            // off→on to prevent duplicate listeners on re-activation
            cm.off("cursorActivity", _cursorHandler);
            cm.on("cursorActivity", _cursorHandler);
            cm.off("focus", _focusHandler);
            cm.on("focus", _focusHandler);
            cm.off("change", _changeHandler);
            cm.on("change", _changeHandler);
            // Scroll sync: scroll CM → scroll iframe to matching source line (real-time)
            let _scrollRAF = null;
            _scrollHandler = function () {
                if (_syncingFromIframe || _scrollSyncFromIframe || !_cursorSyncEnabled || !_iframeReady) {
                    return;
                }
                if (_scrollRAF) { cancelAnimationFrame(_scrollRAF); }
                _scrollRAF = requestAnimationFrame(function () {
                    _scrollRAF = null;
                    _syncScrollPositionToIframe();
                });
            };
            cm.off("scroll", _scrollHandler);
            cm.on("scroll", _scrollHandler);
        }

        // If iframe is already ready (reusing same iframe), switch file using cache
        if (_iframeReady) {
            _switchFile();
            _sendTheme();
            _sendLocale();
        }
    }

    /**
     * Stop syncing, remove all listeners.
     */
    function deactivate() {
        if (!_active) {
            return;
        }

        clearTimeout(_debounceTimer);
        clearTimeout(_scrollSyncTimer);
        clearTimeout(_selectionSyncTimer);

        const cm = _getCM();
        if (cm) {
            if (_cursorHandler) {
                cm.off("cursorActivity", _cursorHandler);
            }
            if (_focusHandler) {
                cm.off("focus", _focusHandler);
            }
            if (_changeHandler) {
                cm.off("change", _changeHandler);
            }
            if (_scrollHandler) {
                cm.off("scroll", _scrollHandler);
            }
            if (_highlightLineHandle) {
                cm.removeLineClass(_highlightLineHandle, "background", "cm-cursor-sync-highlight");
                _highlightLineHandle = null;
            }
        }

        if (_doc && _docChangeHandler) {
            _doc.off("change", _docChangeHandler);
        }

        if (_messageHandler) {
            window.removeEventListener("message", _messageHandler);
        }

        if (_themeChangeHandler) {
            ThemeManager.off("themeChange", _themeChangeHandler);
        }

        _doc = null;
        _$iframe = null;
        _activeCM = null;
        _active = false;
        _iframeReady = false;
        _docChangeHandler = null;
        _messageHandler = null;
        _themeChangeHandler = null;
        _cursorHandler = null;
        _focusHandler = null;
        _changeHandler = null;
        _scrollHandler = null;
    }

    /**
     * @return {boolean} Whether mdviewr sync is currently active
     */
    function isActive() {
        return _active;
    }

    // --- iframe ready ---

    function _onIframeReady() {
        _iframeReady = true;
        _sendContent();
        _sendTheme();
        _sendLocale();
        if (_onIframeReadyCallback) {
            _onIframeReadyCallback();
        }
    }

    // --- Phoenix → iframe ---

    /**
     * Send a cache-aware file switch message. The iframe decides whether
     * to use its cached DOM or re-render based on content comparison.
     */
    function _switchFile() {
        if (!_active || !_iframeReady || !_doc) {
            return;
        }
        const iframeWindow = _getIframeWindow();
        if (!iframeWindow) {
            return;
        }

        iframeWindow.postMessage({
            type: "MDVIEWR_SWITCH_FILE",
            markdown: _doc.getText(),
            baseURL: _baseURL,
            filePath: _doc.file.fullPath
        }, "*");
    }

    function _sendContent() {
        if (!_active || !_iframeReady || !_doc) {
            return;
        }
        const iframeWindow = _getIframeWindow();
        if (!iframeWindow) {
            return;
        }

        iframeWindow.postMessage({
            type: "MDVIEWR_SET_CONTENT",
            markdown: _doc.getText(),
            baseURL: _baseURL,
            filePath: _doc.file.fullPath
        }, "*");
    }

    function _sendUpdate(changeOrigin) {
        if (!_active || !_iframeReady || !_doc) {
            return;
        }
        const iframeWindow = _getIframeWindow();
        if (!iframeWindow) {
            return;
        }

        _syncId++;
        const msg = {
            type: "MDVIEWR_UPDATE_CONTENT",
            markdown: _doc.getText(),
            filePath: _doc.file.fullPath,
            _syncId: _syncId
        };

        // Include cursor position for undo/redo restore
        if (_pendingCursorPos !== undefined) {
            msg.cursorPos = _pendingCursorPos;
            _pendingCursorPos = undefined;
        }

        iframeWindow.postMessage(msg, "*");
    }

    // User's explicit theme choice (null = use editor theme)
    let _themeOverride = null;
    let _onThemeToggle = null;

    function _sendTheme() {
        if (!_active || !_iframeReady) {
            return;
        }
        const iframeWindow = _getIframeWindow();
        if (!iframeWindow) {
            return;
        }

        let theme;
        if (_themeOverride) {
            theme = _themeOverride;
        } else {
            const currentTheme = ThemeManager.getCurrentTheme();
            theme = (currentTheme && currentTheme.dark) ? "dark" : "light";
        }
        iframeWindow.postMessage({
            type: "MDVIEWR_SET_THEME",
            theme: theme
        }, "*");
    }

    function sendThemeOverride(theme) {
        _themeOverride = theme;
        _sendTheme();
    }

    function _sendLocale() {
        if (!_active || !_iframeReady) {
            return;
        }
        const iframeWindow = _getIframeWindow();
        if (!iframeWindow) {
            return;
        }

        iframeWindow.postMessage({
            type: "MDVIEWR_SET_LOCALE",
            locale: brackets.getLocale()
        }, "*");
    }

    // --- iframe → Phoenix ---

    /**
     * Apply new text to the CM5 editor using a minimal diff so that the undo stack
     * records only the changed region instead of a full-document replacement.
     */
    function _applyDiffToEditor(newText) {
        const cm = _getCM();
        if (!cm) {
            return;
        }

        const oldText = cm.getValue();
        if (oldText === newText) {
            return;
        }

        // Find first differing character
        let prefixLen = 0;
        const minLen = Math.min(oldText.length, newText.length);
        while (prefixLen < minLen && oldText[prefixLen] === newText[prefixLen]) {
            prefixLen++;
        }

        // Find last differing character (from the end)
        let oldSuffix = oldText.length;
        let newSuffix = newText.length;
        while (oldSuffix > prefixLen && newSuffix > prefixLen &&
               oldText[oldSuffix - 1] === newText[newSuffix - 1]) {
            oldSuffix--;
            newSuffix--;
        }

        const fromPos = cm.posFromIndex(prefixLen);
        const toPos = cm.posFromIndex(oldSuffix);
        const replacement = newText.substring(prefixLen, newSuffix);

        _syncingFromIframe = true;
        cm.replaceRange(replacement, fromPos, toPos, "+mdviewr");
        _syncingFromIframe = false;
    }

    function _onIframeContentChanged(data) {
        if (!_active || !_doc) {
            return;
        }

        const markdown = data.markdown;
        const remoteSyncId = data._syncId;

        // Ignore stale updates
        if (remoteSyncId !== undefined && remoteSyncId <= _lastReceivedSyncId) {
            return;
        }
        if (remoteSyncId !== undefined) {
            _lastReceivedSyncId = remoteSyncId;
        }

        _applyDiffToEditor(markdown);

        // Send back the actual CM text so the iframe can compute accurate
        // data-source-line attributes. The markdown from convertToMarkdown
        // may differ slightly from CM's content (e.g. table formatting),
        // causing line number drift if used directly.
        const iframeWindow = _getIframeWindow();
        if (iframeWindow && _doc) {
            iframeWindow.postMessage({
                type: "MDVIEWR_SOURCE_LINES",
                markdown: _doc.getText()
            }, "*");
        }

        // Push cursor position for undo/redo restore
        if (data.cursorPos) {
            _cursorUndoStack.push(data.cursorPos);
            _cursorRedoStack = [];
        }
    }

    let _pendingCursorPos = undefined;

    function _handleUndo() {
        if (!_active) {
            return;
        }
        const cm = _getCM();
        if (cm) {
            const pos = _cursorUndoStack.pop();
            if (pos) {
                _cursorRedoStack.push(pos);
                _pendingCursorPos = pos;
            }
            cm.undo();
        }
    }

    function _handleRedo() {
        if (!_active) {
            return;
        }
        const cm = _getCM();
        if (cm) {
            const pos = _cursorRedoStack.pop();
            if (pos) {
                _cursorUndoStack.push(pos);
                _pendingCursorPos = pos;
            }
            cm.redo();
        }
    }

    function _handleHrefClick(data) {
        const href = data.href;
        if (!href) {
            return;
        }
        NativeApp.openURLInDefaultBrowser(href);
    }

    // --- Scroll sync ---

    /**
     * Send the current CM5 cursor line to the iframe so it can scroll to the
     * corresponding rendered element (only if it's not already visible).
     */
    function _syncScrollToIframe() {
        if (!_active || !_iframeReady) {
            return;
        }
        const iframeWindow = _getIframeWindow();
        if (!iframeWindow) {
            return;
        }
        const cm = _getCM();
        if (!cm) {
            return;
        }
        // CM5 cursor line is 0-based; source lines in markdown are 1-based
        const cursor = cm.getCursor();
        const line = cursor.line + 1;
        // For table rows, determine column by counting | before cursor
        const lineText = cm.getLine(cursor.line) || "";
        let tableCol = null;
        if (lineText.trim().startsWith("|")) {
            const beforeCursor = lineText.substring(0, cursor.ch);
            // Count pipe characters (column separators) — first | is before col 0
            const pipes = (beforeCursor.match(/\|/g) || []).length;
            tableCol = Math.max(0, pipes - 1);
        }
        iframeWindow.postMessage({
            type: "MDVIEWR_SCROLL_TO_LINE",
            line: line,
            tableCol: tableCol
        }, "*");
    }

    /**
     * Scroll CM to a source line without triggering the CM scroll handler
     * (prevents viewer→CM→viewer feedback loop).
     */
    function _scrollCMToLineNoFeedback(sourceLine) {
        const cm = _getCM();
        if (!cm) { return; }
        const cmLine = Math.max(0, sourceLine - 1);
        if (cmLine >= cm.lineCount()) { return; }

        _scrollSyncFromIframe = true;
        // Always scroll to align the line at the top of the editor
        const lineTop = cm.charCoords({ line: cmLine, ch: 0 }, "local").top;
        cm.scrollTo(null, lineTop);
        setTimeout(function () { _scrollSyncFromIframe = false; }, 150);
    }

    /**
     * Sync CM scroll position to iframe: find the first visible line in CM and
     * tell the iframe to scroll the corresponding element into view.
     */
    function _syncScrollPositionToIframe() {
        if (!_active || !_iframeReady) {
            return;
        }
        const iframeWindow = _getIframeWindow();
        if (!iframeWindow) {
            return;
        }
        const cm = _getCM();
        if (!cm) {
            return;
        }
        // Get the first visible line in the CM viewport
        const scrollInfo = cm.getScrollInfo();
        const firstVisiblePos = cm.coordsChar({ left: 0, top: scrollInfo.top }, "local");
        const line = firstVisiblePos.line + 1; // 1-based source line
        iframeWindow.postMessage({
            type: "MDVIEWR_SCROLL_TO_LINE",
            line: line,
            fromScroll: true // flag to prevent re-triggering CM scroll
        }, "*");
    }

    /**
     * Parse the current CM line to determine the block type and formatting context,
     * then send it to the iframe so the toolbar can reflect CM cursor position.
     */
    function _syncToolbarStateToIframe() {
        if (!_active || !_iframeReady) {
            return;
        }
        const iframeWindow = _getIframeWindow();
        if (!iframeWindow) {
            return;
        }
        const cm = _getCM();
        if (!cm) {
            return;
        }
        const cursor = cm.getCursor();
        const lineText = cm.getLine(cursor.line) || "";
        const trimmed = lineText.trimStart();

        // Determine block type from markdown syntax
        let blockType = "P";
        if (/^#{1}\s/.test(trimmed)) { blockType = "H1"; }
        else if (/^#{2}\s/.test(trimmed)) { blockType = "H2"; }
        else if (/^#{3}\s/.test(trimmed)) { blockType = "H3"; }
        else if (/^#{4}\s/.test(trimmed)) { blockType = "H4"; }
        else if (/^#{5}\s/.test(trimmed)) { blockType = "H5"; }
        else if (/^#{6}\s/.test(trimmed)) { blockType = "H6"; }

        // Check context by scanning surrounding lines
        let inList = /^\s*[-*+]\s/.test(lineText) || /^\s*\d+\.\s/.test(lineText);
        let inTable = lineText.trim().startsWith("|") && lineText.trim().endsWith("|");
        let inCodeBlock = false;

        // Check if we're inside a fenced code block by counting ``` above
        let fenceCount = 0;
        for (let i = 0; i < cursor.line; i++) {
            if (/^```/.test(cm.getLine(i).trimStart())) {
                fenceCount++;
            }
        }
        inCodeBlock = fenceCount % 2 === 1;

        // Detect formatting around cursor
        let bold = false;
        let italic = false;
        let underline = false;
        let strikethrough = false;

        // Simple inline format detection: check if cursor is within ** ** or * * etc.
        const beforeCursor = lineText.substring(0, cursor.ch);
        const afterCursor = lineText.substring(cursor.ch);
        const fullContext = beforeCursor + afterCursor;
        // Count unescaped markers before cursor
        const boldBefore = (beforeCursor.match(/\*\*/g) || []).length;
        const italicBefore = (beforeCursor.replace(/\*\*/g, "").match(/\*/g) || []).length;
        bold = boldBefore % 2 === 1;
        italic = italicBefore % 2 === 1;
        strikethrough = (beforeCursor.match(/~~/g) || []).length % 2 === 1;

        iframeWindow.postMessage({
            type: "MDVIEWR_TOOLBAR_STATE",
            state: {
                blockType: blockType,
                bold: bold,
                italic: italic,
                underline: underline,
                strikethrough: strikethrough,
                inTable: inTable,
                inList: inList,
                inCodeBlock: inCodeBlock,
                inHeading: blockType !== "P"
            }
        }, "*");
    }

    /**
     * Move the CM5 cursor to the given source line (1-based) and scroll
     * the editor to show it if it's not already visible.
     */
    function _scrollCMToLine(sourceLine) {
        const cm = _getCM();
        if (!cm) {
            return;
        }
        // Convert 1-based source line to 0-based CM5 line
        const cmLine = Math.max(0, sourceLine - 1);
        const lineCount = cm.lineCount();
        if (cmLine >= lineCount) {
            return;
        }

        // Set cursor without CM's default scroll, then center manually
        _syncingFromIframe = true;
        cm.setCursor({ line: cmLine, ch: 0 }, null, { scroll: false });
        _syncingFromIframe = false;

        // Always center the cursor line in the editor
        const scrollInfo = cm.getScrollInfo();
        const lineTop = cm.charCoords({ line: cmLine, ch: 0 }, "local").top;
        const lineBottom = cm.charCoords({ line: cmLine, ch: 0 }, "local").bottom;
        const viewTop = scrollInfo.top;
        const viewBottom = scrollInfo.top + scrollInfo.clientHeight;

        if (lineTop < viewTop || lineBottom > viewBottom) {
            const targetScrollTop = lineTop - (scrollInfo.clientHeight / 2);
            cm.scrollTo(null, targetScrollTop);
        }

        // Brief flash on the CM line to show cursor sync feedback
        _flashCMLine(cm, cmLine);
    }

    let _highlightLineHandle = null;

    function _flashCMLine(cm, line) {
        if (_highlightLineHandle) {
            cm.removeLineClass(_highlightLineHandle, "background", "cm-cursor-sync-highlight");
        }
        _highlightLineHandle = cm.addLineClass(line, "background", "cm-cursor-sync-highlight");
    }

    // --- Selection sync ---

    /**
     * Send the current CM5 selection range to the iframe so it can highlight
     * the corresponding rendered elements.
     */
    function _syncSelectionToIframe() {
        if (!_active || !_iframeReady) {
            console.log("[SYNC-DBG2] skip: active=", _active, "ready=", _iframeReady);
            return;
        }
        const iframeWindow = _getIframeWindow();
        const cm = _getCM();
        if (!iframeWindow || !cm) {
            return;
        }

        const from = cm.getCursor("from");
        const to = cm.getCursor("to");
        const hasSelection = from.line !== to.line || from.ch !== to.ch;

        if (hasSelection) {
            const selectedText = cm.getSelection();
            iframeWindow.postMessage({
                type: "MDVIEWR_HIGHLIGHT_SELECTION",
                fromLine: from.line + 1, // convert to 1-based
                toLine: to.line + 1,
                selectedText: selectedText
            }, "*");
        } else {
            // Clear highlight when no selection
            iframeWindow.postMessage({
                type: "MDVIEWR_HIGHLIGHT_SELECTION",
                fromLine: null,
                toLine: null,
                selectedText: null
            }, "*");
        }
    }

    /**
     * Handle a selection coming from the iframe. Finds the corresponding text
     * in CM5 and sets the selection there.
     */
    function _handleSelectionFromIframe(data) {
        const cm = _getCM();
        if (!cm || !_active) {
            return;
        }

        const { sourceLine, selectedText } = data;
        if (!sourceLine) {
            return;
        }

        const cmLine = Math.max(0, sourceLine - 1);
        const lineCount = cm.lineCount();
        if (cmLine >= lineCount) {
            return;
        }

        _syncingFromIframe = true;

        if (!selectedText) {
            // No selection — just move cursor to clear any existing selection
            cm.setCursor({ line: cmLine, ch: 0 });
            _flashCMLine(cm, cmLine);
            _syncingFromIframe = false;
            return;
        }

        // Search for the selected text starting from the source line
        const searchStart = Math.max(0, cmLine);
        const searchEnd = Math.min(lineCount, cmLine + 20);
        let found = false;

        for (let line = searchStart; line < searchEnd && !found; line++) {
            const lineText = cm.getLine(line);
            const idx = lineText.indexOf(selectedText);
            if (idx !== -1 && selectedText.indexOf("\n") === -1) {
                // Single-line match
                cm.setSelection(
                    { line: line, ch: idx },
                    { line: line, ch: idx + selectedText.length }
                );
                found = true;
            }
        }

        if (!found) {
            // Multi-line or not found in single line — try searching the full text
            const fullText = cm.getValue();
            const startIndex = cm.indexFromPos({ line: searchStart, ch: 0 });
            const matchIdx = fullText.indexOf(selectedText, startIndex);
            if (matchIdx !== -1) {
                const fromPos = cm.posFromIndex(matchIdx);
                const toPos = cm.posFromIndex(matchIdx + selectedText.length);
                cm.setSelection(fromPos, toPos);
                found = true;
            }
        }

        if (!found) {
            // Fallback: just move cursor to the source line
            cm.setCursor({ line: cmLine, ch: 0 });
        }

        _syncingFromIframe = false;
    }

    // --- Keyboard shortcut forwarding ---

    /**
     * Forward an unhandled keyboard shortcut from the mdviewer iframe to Phoenix's
     * keybinding manager by dispatching a synthetic KeyboardEvent on the document.
     */

    /**
     * Handle image upload request from the mdviewer iframe.
     * Reconstructs the blob from ArrayBuffer, uploads via ImageUploadManager,
     * and sends the result back to the iframe.
     */
    function _handleImageUploadFromIframe(data) {
        const ImageUploadManager = require("features/ImageUploadManager");
        const Dialogs = require("widgets/Dialogs");
        const Strings = require("strings");

        const { arrayBuffer, mimeType, filename, uploadId } = data;
        const iframeWindow = _getIframeWindow();

        if (!ImageUploadManager.isImageUploadAvailable()) {
            if (iframeWindow) {
                iframeWindow.postMessage({
                    type: "MDVIEWR_IMAGE_UPLOAD_RESULT",
                    uploadId,
                    error: "not_available"
                }, "*");
            }
            return;
        }

        const blob = new Blob([arrayBuffer], { type: mimeType });
        const provider = ImageUploadManager.getImageUploadProvider();

        provider.uploadImage(blob, filename).then(function (result) {
            if (iframeWindow) {
                if (result.embedURL) {
                    iframeWindow.postMessage({
                        type: "MDVIEWR_IMAGE_UPLOAD_RESULT",
                        uploadId,
                        embedURL: result.embedURL
                    }, "*");
                } else if (result.error === "login_required") {
                    iframeWindow.postMessage({
                        type: "MDVIEWR_IMAGE_UPLOAD_RESULT",
                        uploadId,
                        error: "login_required"
                    }, "*");
                    const dialog = Dialogs.showModalDialog(
                        "",
                        Strings.IMAGE_UPLOAD_LOGIN_REQUIRED_TITLE,
                        Strings.IMAGE_UPLOAD_LOGIN_REQUIRED_MSG,
                        [
                            { className: Dialogs.DIALOG_BTN_CLASS_NORMAL, id: Dialogs.DIALOG_BTN_CANCEL,
                                text: Strings.CANCEL },
                            { className: Dialogs.DIALOG_BTN_CLASS_PRIMARY, id: "login",
                                text: Strings.IMAGE_UPLOAD_LOGIN_BTN }
                        ]
                    );
                    dialog.done(function (id) {
                        if (id === "login") {
                            const profileBtn = document.getElementById("user-profile-button");
                            if (profileBtn) {
                                profileBtn.click();
                            }
                        }
                    });
                } else if (result.error !== "cancelled") {
                    iframeWindow.postMessage({
                        type: "MDVIEWR_IMAGE_UPLOAD_RESULT",
                        uploadId,
                        error: result.error
                    }, "*");
                    if (result.errorCode === "UPGRADE_TO_PRO") {
                        const EventManager = require("utils/EventManager");
                        EventManager.triggerEvent(Dialogs.PRO_DIALOGS_EVENT_MANAGER,
                            "imageUploadUpgradeToPro",
                            Strings.IMAGE_UPLOAD_LIMIT_TITLE, result.errorLoc);
                    } else {
                        Dialogs.showModalDialog("", Strings.IMAGE_UPLOAD_FAILED, result.errorLoc || Strings.IMAGE_UPLOAD_FAILED);
                    }
                } else {
                    // cancelled — remove placeholder
                    iframeWindow.postMessage({
                        type: "MDVIEWR_IMAGE_UPLOAD_RESULT",
                        uploadId,
                        error: "cancelled"
                    }, "*");
                }
            }
        }).catch(function (err) {
            console.error("Image upload from iframe failed:", err);
            if (iframeWindow) {
                iframeWindow.postMessage({
                    type: "MDVIEWR_IMAGE_UPLOAD_RESULT",
                    uploadId,
                    error: "upload_failed"
                }, "*");
            }
        });
    }

    function _forwardKeyboardShortcut(data) {
        const event = new KeyboardEvent("keydown", {
            key: data.key,
            code: data.code,
            ctrlKey: data.ctrlKey,
            metaKey: data.metaKey,
            shiftKey: data.shiftKey,
            altKey: data.altKey,
            bubbles: true,
            cancelable: true
        });
        // KeyBindingManager listens on document.body, not document
        document.body.dispatchEvent(event);
    }

    // --- Helpers ---

    function _getIframeWindow() {
        if (!_$iframe || !_$iframe[0]) {
            return null;
        }
        return _$iframe[0].contentWindow;
    }

    function _getCM() {
        if (_doc && _doc._masterEditor) {
            return _doc._masterEditor._codeMirror;
        }
        // Fallback: _masterEditor can be null when the editor pane doesn't have
        // focus (e.g. md viewer is focused). Try EditorManager lookups first,
        // then fall back to the CM reference captured during activation.
        const fullEditor = EditorManager.getCurrentFullEditor();
        if (fullEditor) {
            return fullEditor._codeMirror;
        }
        const activeEditor = EditorManager.getActiveEditor();
        if (activeEditor) {
            return activeEditor._codeMirror;
        }
        return _activeCM;
    }

    /**
     * Clear the current file's cache in the mdviewer iframe and force re-render.
     * Called on reload button click.
     */
    function reloadCurrentFile() {
        if (!_active || !_iframeReady || !_doc) {
            return;
        }
        const iframeWindow = _getIframeWindow();
        if (!iframeWindow) {
            return;
        }
        iframeWindow.postMessage({
            type: "MDVIEWR_RELOAD_FILE",
            filePath: _doc.file.fullPath
        }, "*");
    }

    /**
     * Re-send the current document's content to the iframe without clearing cache.
     * Uses cache-aware switch to preserve scroll position.
     */
    function resendContent() {
        _switchFile();
    }

    /**
     * Set a callback for when the iframe requests edit mode.
     * The callback should check entitlements and approve/deny.
     */
    function setEditModeRequestHandler(handler) {
        _onEditModeRequest = handler;
    }

    /**
     * Send edit mode state to the iframe.
     */
    function setEditMode(editMode) {
        if (!_active || !_iframeReady) {
            return;
        }
        const iframeWindow = _getIframeWindow();
        if (iframeWindow) {
            iframeWindow.postMessage({ type: "MDVIEWR_SET_EDIT_MODE", editMode: editMode }, "*");
        }
    }

    /**
     * Set a callback for when the iframe signals it's ready (first load only).
     */
    function setIframeReadyHandler(handler) {
        _onIframeReadyCallback = handler;
    }

    /**
     * Enable or disable cursor/scroll sync between CM and mdviewer.
     * Content sync still works regardless.
     */
    function setCursorSyncEnabled(enabled) {
        _cursorSyncEnabled = enabled;
    }

    // Expose internal state for test debugging
    exports._getDebugState = function () {
        return { _active, _iframeReady, _cursorSyncEnabled, _syncingFromIframe,
            hasDoc: !!_doc, hasCursorHandler: !!_cursorHandler,
            iframeId: _$iframe && _$iframe[0] ? _$iframe[0].id : null,
            hasIframeWindow: !!(_$iframe && _$iframe[0] && _$iframe[0].contentWindow) };
    };

    exports._syncSelectionToIframe = _syncSelectionToIframe; // exposed for tests

    exports.activate = activate;
    exports.deactivate = deactivate;
    exports.isActive = isActive;
    exports.reloadCurrentFile = reloadCurrentFile;
    exports.resendContent = resendContent;
    exports.setEditModeRequestHandler = setEditModeRequestHandler;
    exports.setEditMode = setEditMode;
    exports.setIframeReadyHandler = setIframeReadyHandler;
    exports.setCursorSyncEnabled = setCursorSyncEnabled;
    exports.sendThemeOverride = sendThemeOverride;
    exports.setThemeToggleHandler = function(handler) { _onThemeToggle = handler; };
});
