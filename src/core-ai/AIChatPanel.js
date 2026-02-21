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
 */

/**
 * AI Chat Panel — renders the chat UI in the AI sidebar tab, handles streaming
 * responses from Claude Code, and manages edit application to documents.
 */
define(function (require, exports, module) {

    const SidebarTabs         = require("view/SidebarTabs"),
        DocumentManager     = require("document/DocumentManager"),
        CommandManager      = require("command/CommandManager"),
        Commands            = require("command/Commands"),
        ProjectManager      = require("project/ProjectManager"),
        EditorManager       = require("editor/EditorManager"),
        FileSystem          = require("filesystem/FileSystem"),
        LiveDevMain         = require("LiveDevelopment/main"),
        WorkspaceManager    = require("view/WorkspaceManager"),
        SnapshotStore       = require("core-ai/AISnapshotStore"),
        PhoenixConnectors   = require("core-ai/aiPhoenixConnectors"),
        Strings             = require("strings"),
        StringUtils         = require("utils/StringUtils"),
        marked              = require("thirdparty/marked.min");

    let _nodeConnector = null;
    let _isStreaming = false;
    let _currentRequestId = null;
    let _segmentText = "";       // text for the current segment only
    let _autoScroll = true;
    let _hasReceivedContent = false; // tracks if we've received any text/tool in current response
    let _currentEdits = [];          // edits in current response, for summary card
    let _firstEditInResponse = true; // tracks first edit per response for initial PUC
    let _undoApplied = false;        // whether undo/restore has been clicked on any card
    // --- AI event trace logging (compact, non-flooding) ---
    let _traceTextChunks = 0;
    let _traceToolStreamCounts = {}; // toolId → count
    let _toolStreamStaleTimer = null;    // timer to start rotating activity text
    let _toolStreamRotateTimer = null;   // interval for cycling activity phrases

    // Context bar state
    let _selectionDismissed = false;    // user dismissed selection chip
    let _lastSelectionInfo = null;      // {filePath, fileName, startLine, endLine, selectedText}
    let _lastCursorLine = null;         // cursor line when no selection
    let _lastCursorFile = null;         // file name for cursor chip
    let _cursorDismissed = false;       // user dismissed cursor chip
    let _cursorDismissedLine = null;    // line that was dismissed
    let _livePreviewActive = false;     // live preview panel is open
    let _livePreviewDismissed = false;  // user dismissed live preview chip
    let $contextBar;                    // DOM ref

    // DOM references
    let $panel, $messages, $status, $statusText, $textarea, $sendBtn, $stopBtn;

    // Live DOM query for $messages — the cached $messages reference can become stale
    // after SidebarTabs reparents the panel. Use this for any deferred operations
    // (click handlers, callbacks) where the cached reference may no longer be in the DOM.
    function _$msgs() {
        return $(".ai-chat-messages");
    }

    const PANEL_HTML =
        '<div class="ai-chat-panel">' +
            '<div class="ai-chat-header">' +
                '<span class="ai-chat-title">' + Strings.AI_CHAT_TITLE + '</span>' +
                '<button class="ai-new-session-btn" title="' + Strings.AI_CHAT_NEW_SESSION_TITLE + '">' +
                    '<i class="fa-solid fa-plus"></i> ' + Strings.AI_CHAT_NEW_BTN +
                '</button>' +
            '</div>' +
            '<div class="ai-chat-messages"></div>' +
            '<div class="ai-chat-status">' +
                '<span class="ai-status-spinner"></span>' +
                '<span class="ai-status-text">' + Strings.AI_CHAT_THINKING + '</span>' +
            '</div>' +
            '<div class="ai-chat-input-area">' +
                '<div class="ai-chat-context-bar"></div>' +
                '<div class="ai-chat-input-wrap">' +
                    '<textarea class="ai-chat-textarea" placeholder="' + Strings.AI_CHAT_PLACEHOLDER + '" rows="1"></textarea>' +
                    '<button class="ai-send-btn" title="' + Strings.AI_CHAT_SEND_TITLE + '">' +
                        '<i class="fa-solid fa-paper-plane"></i>' +
                    '</button>' +
                    '<button class="ai-stop-btn" title="' + Strings.AI_CHAT_STOP_TITLE + '" style="display:none">' +
                        '<i class="fa-solid fa-stop"></i>' +
                    '</button>' +
                '</div>' +
            '</div>' +
        '</div>';

    const UNAVAILABLE_HTML =
        '<div class="ai-chat-panel">' +
            '<div class="ai-unavailable">' +
                '<div class="ai-unavailable-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div>' +
                '<div class="ai-unavailable-title">' + Strings.AI_CHAT_CLI_NOT_FOUND + '</div>' +
                '<div class="ai-unavailable-message">' +
                    Strings.AI_CHAT_CLI_INSTALL_MSG +
                '</div>' +
                '<button class="ai-retry-btn">' + Strings.AI_CHAT_RETRY + '</button>' +
            '</div>' +
        '</div>';

    const PLACEHOLDER_HTML =
        '<div class="ai-chat-panel">' +
            '<div class="ai-unavailable">' +
                '<div class="ai-unavailable-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div>' +
                '<div class="ai-unavailable-title">' + Strings.AI_CHAT_TITLE + '</div>' +
                '<div class="ai-unavailable-message">' +
                    Strings.AI_CHAT_DESKTOP_ONLY +
                '</div>' +
            '</div>' +
        '</div>';

    /**
     * Initialize the chat panel with a NodeConnector instance.
     * @param {Object} nodeConnector - NodeConnector for communicating with the node-side Claude agent.
     */
    function init(nodeConnector) {
        _nodeConnector = nodeConnector;

        // Wire up events from node side
        _nodeConnector.on("aiTextStream", _onTextStream);
        _nodeConnector.on("aiProgress", _onProgress);
        _nodeConnector.on("aiToolInfo", _onToolInfo);
        _nodeConnector.on("aiToolStream", _onToolStream);
        _nodeConnector.on("aiToolEdit", _onToolEdit);
        _nodeConnector.on("aiError", _onError);
        _nodeConnector.on("aiComplete", _onComplete);

        // Check availability and render appropriate UI
        _checkAvailability();
    }

    /**
     * Show placeholder UI for non-native (browser) builds.
     */
    function initPlaceholder() {
        const $placeholder = $(PLACEHOLDER_HTML);
        SidebarTabs.addToTab("ai", $placeholder);
    }

    /**
     * Check if Claude CLI is available and render the appropriate UI.
     */
    function _checkAvailability() {
        _nodeConnector.execPeer("checkAvailability")
            .then(function (result) {
                if (result.available) {
                    _renderChatUI();
                } else {
                    _renderUnavailableUI(result.error);
                }
            })
            .catch(function (err) {
                _renderUnavailableUI(err.message || String(err));
            });
    }

    /**
     * Render the full chat UI.
     */
    function _renderChatUI() {
        $panel = $(PANEL_HTML);
        $messages = $panel.find(".ai-chat-messages");
        $status = $panel.find(".ai-chat-status");
        $statusText = $panel.find(".ai-status-text");
        $textarea = $panel.find(".ai-chat-textarea");
        $sendBtn = $panel.find(".ai-send-btn");
        $stopBtn = $panel.find(".ai-stop-btn");

        // Event handlers
        $sendBtn.on("click", _sendMessage);
        $stopBtn.on("click", _cancelQuery);
        $panel.find(".ai-new-session-btn").on("click", _newSession);

        // Hide "+ New" button initially (no conversation yet)
        $panel.find(".ai-new-session-btn").hide();

        $textarea.on("keydown", function (e) {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                _sendMessage();
            }
            if (e.key === "Escape") {
                if (_isStreaming) {
                    _cancelQuery();
                } else {
                    $textarea.val("");
                }
            }
        });

        // Auto-resize textarea
        $textarea.on("input", function () {
            this.style.height = "auto";
            this.style.height = Math.min(this.scrollHeight, 96) + "px"; // max ~6rem
        });

        // Track scroll position for auto-scroll
        $messages.on("scroll", function () {
            const el = $messages[0];
            _autoScroll = (el.scrollHeight - el.scrollTop - el.clientHeight) < 50;
        });

        // Context bar
        $contextBar = $panel.find(".ai-chat-context-bar");

        // Track editor selection/cursor for context chips
        EditorManager.off("activeEditorChange.aiChat");
        EditorManager.on("activeEditorChange.aiChat", function (_event, newEditor, oldEditor) {
            if (oldEditor) {
                oldEditor.off("cursorActivity.aiContext");
            }
            if (newEditor) {
                newEditor.off("cursorActivity.aiContext");
                newEditor.on("cursorActivity.aiContext", _updateSelectionChip);
            }
            _updateSelectionChip();
        });
        // Bind to current editor if already active
        const currentEditor = EditorManager.getActiveEditor();
        if (currentEditor) {
            currentEditor.off("cursorActivity.aiContext");
            currentEditor.on("cursorActivity.aiContext", _updateSelectionChip);
        }
        _updateSelectionChip();

        // Track live preview status — listen to both LiveDev status changes
        // and panel show/hide events so the chip updates when the panel is closed
        LiveDevMain.off("statusChange.aiChat");
        LiveDevMain.on("statusChange.aiChat", _updateLivePreviewChip);
        LiveDevMain.off(LiveDevMain.EVENT_OPEN_PREVIEW_URL + ".aiChat");
        LiveDevMain.on(LiveDevMain.EVENT_OPEN_PREVIEW_URL + ".aiChat", function () {
            _livePreviewDismissed = false;
            _updateLivePreviewChip();
        });
        WorkspaceManager.off(WorkspaceManager.EVENT_WORKSPACE_PANEL_SHOWN + ".aiChat");
        WorkspaceManager.on(WorkspaceManager.EVENT_WORKSPACE_PANEL_SHOWN + ".aiChat", _updateLivePreviewChip);
        WorkspaceManager.off(WorkspaceManager.EVENT_WORKSPACE_PANEL_HIDDEN + ".aiChat");
        WorkspaceManager.on(WorkspaceManager.EVENT_WORKSPACE_PANEL_HIDDEN + ".aiChat", _updateLivePreviewChip);
        _updateLivePreviewChip();

        // When a screenshot is captured, attach the image to the awaiting tool indicator
        PhoenixConnectors.off("screenshotCaptured.aiChat");
        PhoenixConnectors.on("screenshotCaptured.aiChat", function (_event, base64) {
            const $tool = _$msgs().find('.ai-msg-tool').filter(function () {
                return $(this).data("awaitingScreenshot");
            }).last();
            if ($tool.length) {
                $tool.data("awaitingScreenshot", false);
                const $detail = $tool.find(".ai-tool-detail");
                const $img = $('<img class="ai-tool-screenshot" src="data:image/png;base64,' + base64 + '">');
                $img.on("click", function (e) {
                    e.stopPropagation();
                    $img.toggleClass("expanded");
                    _scrollToBottom();
                });
                $img.on("load", function () {
                    // Force scroll — the image load changes height after insertion,
                    // which can cause the scroll listener to clear _autoScroll
                    if ($messages && $messages.length) {
                        $messages[0].scrollTop = $messages[0].scrollHeight;
                    }
                });
                $detail.html($img);
                $tool.addClass("ai-tool-expanded");
                _scrollToBottom();
            }
        });

        SidebarTabs.addToTab("ai", $panel);
    }

    /**
     * Render the unavailable UI (CLI not found).
     */
    function _renderUnavailableUI(error) {
        const $unavailable = $(UNAVAILABLE_HTML);
        $unavailable.find(".ai-retry-btn").on("click", function () {
            $unavailable.remove();
            _checkAvailability();
        });
        SidebarTabs.addToTab("ai", $unavailable);
    }

    // --- Context bar chip management ---

    /**
     * Update the selection/cursor chip based on the active editor state.
     */
    function _updateSelectionChip() {
        const editor = EditorManager.getActiveEditor();
        if (!editor) {
            _lastSelectionInfo = null;
            _lastCursorLine = null;
            _lastCursorFile = null;
            _renderContextBar();
            return;
        }

        let filePath = editor.document.file.fullPath;
        if (filePath.startsWith("/tauri/")) {
            filePath = filePath.replace("/tauri", "");
        }
        const fileName = filePath.split("/").pop();

        if (editor.hasSelection()) {
            const sel = editor.getSelection();
            const startLine = sel.start.line + 1;
            const endLine = sel.end.line + 1;
            const selectedText = editor.getSelectedText();

            // Reset dismissed flag when selection changes
            if (!_lastSelectionInfo ||
                _lastSelectionInfo.startLine !== startLine ||
                _lastSelectionInfo.endLine !== endLine ||
                _lastSelectionInfo.filePath !== filePath) {
                _selectionDismissed = false;
            }

            _lastSelectionInfo = {
                filePath: filePath,
                fileName: fileName,
                startLine: startLine,
                endLine: endLine,
                selectedText: selectedText
            };
            _lastCursorLine = null;
            _lastCursorFile = null;
        } else {
            const cursor = editor.getCursorPos();
            const cursorLine = cursor.line + 1;
            // Reset cursor dismissed when cursor moves to a different line
            if (_cursorDismissed && _cursorDismissedLine !== cursorLine) {
                _cursorDismissed = false;
            }
            _lastSelectionInfo = null;
            _lastCursorLine = cursorLine;
            _lastCursorFile = fileName;
        }

        _renderContextBar();
    }

    /**
     * Update the live preview chip based on panel visibility.
     */
    function _updateLivePreviewChip() {
        const panel = WorkspaceManager.getPanelForID("live-preview-panel");
        const wasActive = _livePreviewActive;
        _livePreviewActive = !!(panel && panel.isVisible());
        // Reset dismissed when live preview is re-opened
        if (_livePreviewActive && !wasActive) {
            _livePreviewDismissed = false;
        }
        _renderContextBar();
    }

    /**
     * Rebuild the context bar chips from current state.
     */
    function _renderContextBar() {
        if (!$contextBar) {
            return;
        }
        $contextBar.empty();

        // Live preview chip
        if (_livePreviewActive && !_livePreviewDismissed) {
            const $lpChip = $(
                '<span class="ai-context-chip ai-context-chip-livepreview">' +
                    '<span class="ai-context-chip-icon"><i class="fa-solid fa-eye"></i></span>' +
                    '<span class="ai-context-chip-label">' + Strings.AI_CHAT_CONTEXT_LIVE_PREVIEW + '</span>' +
                    '<button class="ai-context-chip-close">&times;</button>' +
                '</span>'
            );
            $lpChip.find(".ai-context-chip-close").on("click", function () {
                _livePreviewDismissed = true;
                _renderContextBar();
            });
            $contextBar.append($lpChip);
        }

        // Selection or cursor chip
        if (_lastSelectionInfo && !_selectionDismissed) {
            const label = StringUtils.format(Strings.AI_CHAT_CONTEXT_SELECTION,
                _lastSelectionInfo.startLine, _lastSelectionInfo.endLine) +
                " in " + _lastSelectionInfo.fileName;
            const $chip = $(
                '<span class="ai-context-chip ai-context-chip-selection">' +
                    '<span class="ai-context-chip-icon"><i class="fa-solid fa-i-cursor"></i></span>' +
                    '<span class="ai-context-chip-label"></span>' +
                    '<button class="ai-context-chip-close">&times;</button>' +
                '</span>'
            );
            $chip.find(".ai-context-chip-label").text(label);
            $chip.find(".ai-context-chip-close").on("click", function () {
                _selectionDismissed = true;
                _renderContextBar();
            });
            $contextBar.append($chip);
        } else if (_lastCursorLine !== null && !_lastSelectionInfo && !_cursorDismissed) {
            const label = StringUtils.format(Strings.AI_CHAT_CONTEXT_CURSOR, _lastCursorLine) +
                " in " + _lastCursorFile;
            const $cursorChip = $(
                '<span class="ai-context-chip ai-context-chip-selection">' +
                    '<span class="ai-context-chip-icon"><i class="fa-solid fa-i-cursor"></i></span>' +
                    '<span class="ai-context-chip-label"></span>' +
                    '<button class="ai-context-chip-close">&times;</button>' +
                '</span>'
            );
            $cursorChip.find(".ai-context-chip-label").text(label);
            $cursorChip.find(".ai-context-chip-close").on("click", function () {
                _cursorDismissed = true;
                _cursorDismissedLine = _lastCursorLine;
                _renderContextBar();
            });
            $contextBar.append($cursorChip);
        }

        // Toggle visibility
        $contextBar.toggleClass("has-chips", $contextBar.children().length > 0);
    }

    /**
     * Send the current input as a message to Claude.
     */
    function _sendMessage() {
        const text = $textarea.val().trim();
        if (!text || _isStreaming) {
            return;
        }

        // Show "+ New" button once a conversation starts
        $panel.find(".ai-new-session-btn").show();

        // Append user message
        _appendUserMessage(text);

        // Clear input
        $textarea.val("");
        $textarea.css("height", "auto");

        // Set streaming state
        _setStreaming(true);

        // Reset segment tracking and show thinking indicator
        _segmentText = "";
        _hasReceivedContent = false;
        _currentEdits = [];
        _firstEditInResponse = true;
        SnapshotStore.startTracking();
        _appendThinkingIndicator();

        // Remove restore highlights from previous interactions
        _$msgs().find(".ai-restore-highlighted").removeClass("ai-restore-highlighted");

        // Get project path
        const projectPath = _getProjectRealPath();

        _traceTextChunks = 0;
        _traceToolStreamCounts = {};

        const prompt = text;
        console.log("[AI UI] Sending prompt:", text.slice(0, 60));

        // Gather selection context if available and not dismissed
        let selectionContext = null;
        if (_lastSelectionInfo && !_selectionDismissed && _lastSelectionInfo.selectedText) {
            let selectedText = _lastSelectionInfo.selectedText;
            if (selectedText.length > 10000) {
                selectedText = selectedText.slice(0, 10000);
            }
            selectionContext = {
                filePath: _lastSelectionInfo.filePath,
                startLine: _lastSelectionInfo.startLine,
                endLine: _lastSelectionInfo.endLine,
                selectedText: selectedText
            };
        }

        _nodeConnector.execPeer("sendPrompt", {
            prompt: prompt,
            projectPath: projectPath,
            sessionAction: "continue",
            locale: brackets.getLocale(),
            selectionContext: selectionContext
        }).then(function (result) {
            _currentRequestId = result.requestId;
            console.log("[AI UI] RequestId:", result.requestId);
        }).catch(function (err) {
            _setStreaming(false);
            _appendErrorMessage(StringUtils.format(Strings.AI_CHAT_SEND_ERROR, err.message || String(err)));
        });
    }

    /**
     * Cancel the current streaming query.
     */
    function _cancelQuery() {
        if (_nodeConnector && _isStreaming) {
            _nodeConnector.execPeer("cancelQuery").catch(function () {
                // ignore cancel errors
            });
        }
    }

    /**
     * Start a new session: destroy server-side session and clear chat.
     */
    function _newSession() {
        if (_nodeConnector) {
            _nodeConnector.execPeer("destroySession").catch(function () {
                // ignore
            });
        }
        _currentRequestId = null;
        _segmentText = "";
        _hasReceivedContent = false;
        _isStreaming = false;
        _firstEditInResponse = true;
        _undoApplied = false;
        _selectionDismissed = false;
        _lastSelectionInfo = null;
        _lastCursorLine = null;
        _lastCursorFile = null;
        _cursorDismissed = false;
        _cursorDismissedLine = null;
        _livePreviewDismissed = false;
        SnapshotStore.reset();
        PhoenixConnectors.clearPreviousContentMap();
        if ($messages) {
            $messages.empty();
        }
        // Hide "+ New" button since we're back to empty state
        if ($panel) {
            $panel.find(".ai-new-session-btn").hide();
        }
        if ($status) {
            $status.removeClass("active");
        }
        if ($textarea) {
            $textarea.prop("disabled", false);
            $textarea[0].focus({ preventScroll: true });
        }
        if ($sendBtn) {
            $sendBtn.prop("disabled", false);
        }
    }

    // --- Event handlers for node-side events ---

    function _onTextStream(_event, data) {
        _traceTextChunks++;
        if (_traceTextChunks === 1) {
            console.log("[AI UI]", "First text chunk");
        }

        // Remove thinking indicator on first content
        if (!_hasReceivedContent) {
            _hasReceivedContent = true;
            $messages.find(".ai-thinking").remove();
        }

        // If no active stream target exists, create a new text segment
        if (!$messages.find(".ai-stream-target").length) {
            _appendAssistantSegment();
        }

        _segmentText += data.text;
        _renderAssistantStream();
    }

    // Tool type configuration: icon, color, label
    const TOOL_CONFIG = {
        Glob:  { icon: "fa-solid fa-magnifying-glass", color: "#6b9eff", label: Strings.AI_CHAT_TOOL_SEARCH_FILES },
        Grep:  { icon: "fa-solid fa-magnifying-glass-location", color: "#6b9eff", label: Strings.AI_CHAT_TOOL_SEARCH_CODE },
        Read:  { icon: "fa-solid fa-file-lines", color: "#6bc76b", label: Strings.AI_CHAT_TOOL_READ },
        Edit:  { icon: "fa-solid fa-pen", color: "#e8a838", label: Strings.AI_CHAT_TOOL_EDIT },
        Write: { icon: "fa-solid fa-file-pen", color: "#e8a838", label: Strings.AI_CHAT_TOOL_WRITE },
        Bash:  { icon: "fa-solid fa-terminal", color: "#c084fc", label: Strings.AI_CHAT_TOOL_RUN_CMD },
        Skill: { icon: "fa-solid fa-puzzle-piece", color: "#e0c060", label: Strings.AI_CHAT_TOOL_SKILL },
        "mcp__phoenix-editor__getEditorState":     { icon: "fa-solid fa-code", color: "#6bc76b", label: Strings.AI_CHAT_TOOL_EDITOR_STATE },
        "mcp__phoenix-editor__takeScreenshot":     { icon: "fa-solid fa-camera", color: "#c084fc", label: Strings.AI_CHAT_TOOL_SCREENSHOT },
        "mcp__phoenix-editor__execJsInLivePreview": { icon: "fa-solid fa-eye", color: "#66bb6a", label: Strings.AI_CHAT_TOOL_LIVE_PREVIEW_JS }
    };

    function _onProgress(_event, data) {
        console.log("[AI UI]", "Progress:", data.phase, data.toolName ? data.toolName + " #" + data.toolId : "");
        if ($statusText) {
            const toolName = data.toolName || "";
            const config = TOOL_CONFIG[toolName];
            $statusText.text(config ? config.label + "..." : Strings.AI_CHAT_THINKING);
        }
        if (data.phase === "tool_use") {
            _appendToolIndicator(data.toolName, data.toolId);
        }
    }

    function _onToolInfo(_event, data) {
        const uid = (_currentRequestId || "") + "-" + data.toolId;
        const streamCount = _traceToolStreamCounts[uid] || 0;
        console.log("[AI UI]", "ToolInfo:", data.toolName, "#" + data.toolId,
            "file=" + (data.toolInput && data.toolInput.file_path || "?").split("/").pop(),
            "streamEvents=" + streamCount);
        _updateToolIndicator(data.toolId, data.toolName, data.toolInput);

        // Capture content of files the AI reads (for snapshot delete tracking)
        if (data.toolName === "Read" && data.toolInput && data.toolInput.file_path) {
            const filePath = data.toolInput.file_path;
            const vfsPath = SnapshotStore.realToVfsPath(filePath);
            const openDoc = DocumentManager.getOpenDocumentForPath(vfsPath);
            if (openDoc) {
                SnapshotStore.recordFileRead(filePath, openDoc.getText());
            } else {
                const file = FileSystem.getFileForPath(vfsPath);
                file.read(function (err, readData) {
                    if (!err && readData) {
                        SnapshotStore.recordFileRead(filePath, readData);
                    }
                });
            }
        }
    }

    function _onToolStream(_event, data) {
        const uniqueToolId = (_currentRequestId || "") + "-" + data.toolId;
        _traceToolStreamCounts[uniqueToolId] = (_traceToolStreamCounts[uniqueToolId] || 0) + 1;
        const $tool = $messages.find('.ai-msg-tool[data-tool-id="' + uniqueToolId + '"]');
        if (!$tool.length) {
            return;
        }

        // Update label with filename as soon as file_path is available
        if (!$tool.data("labelUpdated")) {
            const filePath = _extractJsonStringValue(data.partialJson, "file_path");
            if (filePath) {
                const fileName = filePath.split("/").pop();
                const config = TOOL_CONFIG[data.toolName] || {};
                $tool.find(".ai-tool-label").text((config.label || data.toolName) + " " + fileName + "...");
                $tool.data("labelUpdated", true);
            }
        }

        const preview = _extractToolPreview(data.toolName, data.partialJson);
        const count = _traceToolStreamCounts[uniqueToolId];
        if (count === 1) {
            console.log("[AI UI]", "ToolStream first:", data.toolName, "#" + data.toolId,
                "json=" + (data.partialJson || "").length + "ch");
        }
        if (preview) {
            $tool.find(".ai-tool-preview").text(preview);
            _scrollToBottom();
        }

        // Reset staleness timer — if no new stream event arrives within 2s,
        // rotate through activity phrases so the user sees something is happening.
        clearTimeout(_toolStreamStaleTimer);
        clearInterval(_toolStreamRotateTimer);
        _toolStreamStaleTimer = setTimeout(function () {
            const phrases = [
                Strings.AI_CHAT_WORKING,
                Strings.AI_CHAT_WRITING,
                Strings.AI_CHAT_PROCESSING
            ];
            let idx = 0;
            const $livePreview = $tool.find(".ai-tool-preview");
            if ($livePreview.length && !$tool.hasClass("ai-tool-done")) {
                $livePreview.text(phrases[idx]);
            }
            _toolStreamRotateTimer = setInterval(function () {
                idx = (idx + 1) % phrases.length;
                const $p = $tool.find(".ai-tool-preview");
                if ($p.length && !$tool.hasClass("ai-tool-done")) {
                    $p.text(phrases[idx]);
                } else {
                    clearInterval(_toolStreamRotateTimer);
                }
            }, 3000);
        }, 2000);
    }

    /**
     * Extract a complete string value for a given key from partial JSON.
     * Returns null if the key isn't found or the value isn't complete yet.
     */
    function _extractJsonStringValue(partialJson, key) {
        // Try both with and without space after colon: "key":"val" or "key": "val"
        let pattern = '"' + key + '":"';
        let idx = partialJson.indexOf(pattern);
        if (idx === -1) {
            pattern = '"' + key + '": "';
            idx = partialJson.indexOf(pattern);
        }
        if (idx === -1) {
            return null;
        }
        const start = idx + pattern.length;
        // Find the closing quote (not escaped)
        let end = start;
        while (end < partialJson.length) {
            if (partialJson[end] === '"' && partialJson[end - 1] !== '\\') {
                return partialJson.slice(start, end).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            }
            end++;
        }
        return null; // value not complete yet
    }

    /**
     * Extract a readable one-line preview from partial tool input JSON.
     * Looks for the "interesting" key per tool type (e.g. content for Write).
     */
    function _extractToolPreview(toolName, partialJson) {
        if (!partialJson) {
            return "";
        }
        // Map tool names to the key whose value we want to preview.
        // Tools not listed here get no streaming preview.
        const interestingKey = {
            Write: "content",
            Edit: "new_string",
            Bash: "command",
            Grep: "pattern",
            Glob: "pattern",
            "mcp__phoenix-editor__execJsInLivePreview": "code"
        }[toolName];

        if (!interestingKey) {
            return "";
        }

        let raw = "";
        // Find the interesting key and grab everything after it
        const keyPattern = '"' + interestingKey + '":';
        const idx = partialJson.indexOf(keyPattern);
        if (idx !== -1) {
            raw = partialJson.slice(idx + keyPattern.length).slice(-120);
        }
        // If the interesting key hasn't appeared yet, show a byte counter
        // so the user sees streaming activity during the file_path phase
        if (!raw && partialJson.length > 3) {
            return StringUtils.format(Strings.AI_CHAT_RECEIVING_BYTES, partialJson.length);
        }
        if (!raw) {
            return "";
        }
        // Clean up JSON syntax noise into readable text
        let preview = raw
            .replace(/\\n/g, " ")
            .replace(/\\t/g, " ")
            .replace(/\\"/g, '"')
            .replace(/\s+/g, " ")
            .trim();
        // Strip leading JSON artifacts (quotes, whitespace)
        preview = preview.replace(/^[\s"]+/, "");
        // Strip trailing incomplete JSON artifacts
        preview = preview.replace(/["{}\[\]]*$/, "").trim();
        return preview;
    }

    function _onToolEdit(_event, data) {
        const edit = data.edit;
        const uniqueToolId = (_currentRequestId || "") + "-" + data.toolId;
        console.log("[AI UI]", "ToolEdit:", edit.file.split("/").pop(), "#" + data.toolId);

        // Track for summary card
        const oldLines = edit.oldText ? edit.oldText.split("\n").length : 0;
        const newLines = edit.newText ? edit.newText.split("\n").length : 0;
        _currentEdits.push({
            file: edit.file,
            linesAdded: newLines,
            linesRemoved: oldLines
        });

        // Capture pre-edit content for snapshot tracking
        const previousContent = PhoenixConnectors.getPreviousContent(edit.file);
        const isNewFile = (edit.oldText === null && (previousContent === undefined || previousContent === ""));

        // On first edit per response, insert initial PUC if needed.
        // Create initial snapshot *before* recordFileBeforeEdit so it pushes
        // an empty {} that recordFileBeforeEdit will back-fill directly.
        if (_firstEditInResponse) {
            _firstEditInResponse = false;
            if (SnapshotStore.getSnapshotCount() === 0) {
                const initialIndex = SnapshotStore.createInitialSnapshot();
                // Insert initial restore point PUC before the current tool indicator
                const $puc = $(
                    '<div class="ai-msg ai-msg-restore-point" data-snapshot-index="' + initialIndex + '">' +
                        '<button class="ai-restore-point-btn" disabled>' + Strings.AI_CHAT_RESTORE_POINT + '</button>' +
                    '</div>'
                );
                $puc.find(".ai-restore-point-btn").on("click", function () {
                    if (!_isStreaming) {
                        _onRestoreClick(initialIndex);
                    }
                });
                // Find the last tool indicator and insert the PUC right before it
                const $liveMsg = _$msgs();
                const $lastTool = $liveMsg.find(".ai-msg-tool").last();
                if ($lastTool.length) {
                    $lastTool.before($puc);
                } else {
                    $liveMsg.append($puc);
                }
            }
        }

        // Record pre-edit content into pending snapshot and back-fill
        SnapshotStore.recordFileBeforeEdit(edit.file, previousContent, isNewFile);

        // Find the oldest Edit/Write tool indicator for this file that doesn't
        // already have edit actions. This is more robust than matching by toolId
        // because the SDK with includePartialMessages may re-emit tool_use blocks
        // as phantom indicators, causing toolId mismatches.
        const fileName = edit.file.split("/").pop();
        const $tool = $messages.find('.ai-msg-tool').filter(function () {
            const label = $(this).find(".ai-tool-label").text();
            const hasActions = $(this).find(".ai-tool-edit-actions").length > 0;
            return !hasActions && (label.includes("Edit " + fileName) || label.includes("Write " + fileName));
        }).first();
        if (!$tool.length) {
            return;
        }

        // Remove any existing edit actions (in case of duplicate events)
        $tool.find(".ai-tool-edit-actions").remove();

        // Build the inline edit actions (diff toggle only — undo is on summary card)
        const $actions = $('<div class="ai-tool-edit-actions"></div>');

        // Diff toggle
        const $diffToggle = $('<button class="ai-tool-diff-toggle">' + Strings.AI_CHAT_SHOW_DIFF + '</button>');
        const $diff = $('<div class="ai-tool-diff"></div>');

        if (edit.oldText) {
            edit.oldText.split("\n").forEach(function (line) {
                $diff.append($('<div class="ai-diff-old"></div>').text("- " + line));
            });
            edit.newText.split("\n").forEach(function (line) {
                $diff.append($('<div class="ai-diff-new"></div>').text("+ " + line));
            });
        } else {
            // Write (new file) — show all as new
            edit.newText.split("\n").forEach(function (line) {
                $diff.append($('<div class="ai-diff-new"></div>').text("+ " + line));
            });
        }

        $diffToggle.on("click", function () {
            $diff.toggleClass("expanded");
            $diffToggle.text($diff.hasClass("expanded") ? Strings.AI_CHAT_HIDE_DIFF : Strings.AI_CHAT_SHOW_DIFF);
        });

        $actions.append($diffToggle);
        $tool.append($actions);
        $tool.append($diff);
        _scrollToBottom();
    }

    function _onError(_event, data) {
        console.log("[AI UI]", "Error:", (data.error || "").slice(0, 200));
        _appendErrorMessage(data.error);
        // Don't stop streaming — the node side may continue (partial results)
    }

    async function _onComplete(_event, data) {
        console.log("[AI UI]", "Complete. textChunks=" + _traceTextChunks,
            "toolStreams=" + JSON.stringify(_traceToolStreamCounts));
        // Reset trace counters for next query
        _traceTextChunks = 0;
        _traceToolStreamCounts = {};

        // Append edit summary if there were edits (finalizeResponse called inside)
        if (_currentEdits.length > 0) {
            await _appendEditSummary();
        }

        SnapshotStore.stopTracking();
        _setStreaming(false);
    }

    /**
     * Append a compact summary card showing all files modified during this response.
     */
    async function _appendEditSummary() {
        // Finalize snapshot and get the after-snapshot index
        const afterIndex = await SnapshotStore.finalizeResponse();
        _undoApplied = false;

        // Aggregate per-file stats
        const fileStats = {};
        const fileOrder = [];
        _currentEdits.forEach(function (e) {
            if (!fileStats[e.file]) {
                fileStats[e.file] = { added: 0, removed: 0 };
                fileOrder.push(e.file);
            }
            fileStats[e.file].added += e.linesAdded;
            fileStats[e.file].removed += e.linesRemoved;
        });

        const fileCount = fileOrder.length;
        const $summary = $('<div class="ai-msg ai-msg-edit-summary" data-snapshot-index="' + afterIndex + '"></div>');
        const $header = $(
            '<div class="ai-edit-summary-header">' +
                '<span class="ai-edit-summary-title">' +
                    StringUtils.format(Strings.AI_CHAT_FILES_CHANGED, fileCount,
                        fileCount === 1 ? Strings.AI_CHAT_FILE_SINGULAR : Strings.AI_CHAT_FILE_PLURAL) +
                '</span>' +
            '</div>'
        );

        if (afterIndex >= 0) {
            // Update any previous summary card buttons to say "Restore to this point"
            _$msgs().find('.ai-edit-restore-btn').text(Strings.AI_CHAT_RESTORE_POINT)
                .attr("title", Strings.AI_CHAT_RESTORE_TITLE)
                .data("action", "restore");

            // Determine button label: "Undo" if not undone, else "Restore to this point"
            const isUndo = !_undoApplied;
            const label = isUndo ? Strings.AI_CHAT_UNDO : Strings.AI_CHAT_RESTORE_POINT;
            const title = isUndo ? Strings.AI_CHAT_UNDO_TITLE : Strings.AI_CHAT_RESTORE_TITLE;

            const $restoreBtn = $(
                '<button class="ai-edit-restore-btn" data-snapshot-index="' + afterIndex + '" ' +
                'title="' + title + '">' + label + '</button>'
            );
            $restoreBtn.data("action", isUndo ? "undo" : "restore");
            $restoreBtn.on("click", function (e) {
                e.stopPropagation();
                if (_isStreaming) {
                    return;
                }
                if ($(this).data("action") === "undo") {
                    _onUndoClick(afterIndex);
                } else {
                    _onRestoreClick(afterIndex);
                }
            });
            $header.append($restoreBtn);
        }
        $summary.append($header);

        fileOrder.forEach(function (filePath) {
            const stats = fileStats[filePath];
            const displayName = filePath.split("/").pop();
            const $file = $(
                '<div class="ai-edit-summary-file" data-path="' + _escapeAttr(filePath) + '">' +
                    '<span class="ai-edit-summary-name"></span>' +
                    '<span class="ai-edit-summary-stats">' +
                        '<span class="ai-edit-summary-add">+' + stats.added + '</span>' +
                        '<span class="ai-edit-summary-del">-' + stats.removed + '</span>' +
                    '</span>' +
                '</div>'
            );
            $file.find(".ai-edit-summary-name").text(displayName);
            $file.on("click", function () {
                const vfsPath = SnapshotStore.realToVfsPath(filePath);
                CommandManager.execute(Commands.CMD_OPEN, { fullPath: vfsPath });
            });
            $summary.append($file);
        });

        $messages.append($summary);
        _scrollToBottom();
    }

    /**
     * Handle "Restore to this point" click on any restore point element.
     * @param {number} snapshotIndex - index into the snapshots array
     */
    function _onRestoreClick(snapshotIndex) {
        const $msgs = _$msgs();
        // Remove all existing highlights
        $msgs.find(".ai-restore-highlighted").removeClass("ai-restore-highlighted");

        // Once any "Restore to this point" is clicked, undo is no longer applicable
        _undoApplied = true;

        // Reset all buttons to "Restore to this point"
        $msgs.find('.ai-edit-restore-btn').each(function () {
            $(this).text(Strings.AI_CHAT_RESTORE_POINT)
                .attr("title", Strings.AI_CHAT_RESTORE_TITLE)
                .data("action", "restore");
        });
        $msgs.find('.ai-restore-point-btn').text(Strings.AI_CHAT_RESTORE_POINT);

        SnapshotStore.restoreToSnapshot(snapshotIndex, function (errorCount) {
            if (errorCount > 0) {
                console.warn("[AI UI] Restore had", errorCount, "errors");
            }

            // Mark the clicked element as "Restored"
            const $m = _$msgs();
            const $target = $m.find('[data-snapshot-index="' + snapshotIndex + '"]');
            if ($target.length) {
                $target.addClass("ai-restore-highlighted");
                const $btn = $target.find(".ai-edit-restore-btn, .ai-restore-point-btn");
                $btn.text(Strings.AI_CHAT_RESTORED);
            }
        });
    }

    /**
     * Handle "Undo" click on the latest summary card.
     * @param {number} afterIndex - snapshot index of the latest after-snapshot
     */
    function _onUndoClick(afterIndex) {
        const $msgs = _$msgs();
        _undoApplied = true;
        const targetIndex = afterIndex - 1;

        // Reset all buttons to "Restore to this point"
        $msgs.find('.ai-edit-restore-btn').each(function () {
            $(this).text(Strings.AI_CHAT_RESTORE_POINT)
                .attr("title", Strings.AI_CHAT_RESTORE_TITLE)
                .data("action", "restore");
        });
        $msgs.find('.ai-restore-point-btn').text(Strings.AI_CHAT_RESTORE_POINT);

        SnapshotStore.restoreToSnapshot(targetIndex, function (errorCount) {
            if (errorCount > 0) {
                console.warn("[AI UI] Undo had", errorCount, "errors");
            }

            // Find the DOM element for the target snapshot and highlight it
            const $m = _$msgs();
            const $target = $m.find('[data-snapshot-index="' + targetIndex + '"]');
            if ($target.length) {
                $m.find(".ai-restore-highlighted").removeClass("ai-restore-highlighted");
                $target.addClass("ai-restore-highlighted");
                $target[0].scrollIntoView({ behavior: "smooth", block: "center" });
                // Mark the target as "Restored"
                const $btn = $target.find(".ai-edit-restore-btn, .ai-restore-point-btn");
                $btn.text(Strings.AI_CHAT_RESTORED);
            }
        });
    }

    // --- DOM helpers ---

    function _appendUserMessage(text) {
        const $msg = $(
            '<div class="ai-msg ai-msg-user">' +
                '<div class="ai-msg-label">' + Strings.AI_CHAT_LABEL_YOU + '</div>' +
                '<div class="ai-msg-content"></div>' +
            '</div>'
        );
        $msg.find(".ai-msg-content").text(text);
        $messages.append($msg);
        _scrollToBottom();
    }

    /**
     * Append a thinking/typing indicator while waiting for first content.
     */
    function _appendThinkingIndicator() {
        const $thinking = $(
            '<div class="ai-msg ai-msg-assistant ai-thinking">' +
                '<div class="ai-msg-label">' + Strings.AI_CHAT_LABEL_CLAUDE + '</div>' +
                '<div class="ai-msg-content">' +
                    '<span class="ai-thinking-dots">' +
                        '<span></span><span></span><span></span>' +
                    '</span>' +
                '</div>' +
            '</div>'
        );
        $messages.append($thinking);
        _scrollToBottom();
    }

    /**
     * Append a new assistant text segment. Creates a fresh content block
     * that subsequent text deltas will stream into. Shows the "Claude" label
     * only for the first segment in a response.
     */
    function _appendAssistantSegment() {
        // Check if this is a continuation (there's already assistant content or tools above)
        const isFirst = !$messages.find(".ai-msg-assistant").not(".ai-thinking").length;
        const $msg = $(
            '<div class="ai-msg ai-msg-assistant">' +
                (isFirst ? '<div class="ai-msg-label">Claude</div>' : '') +
                '<div class="ai-msg-content ai-stream-target"></div>' +
            '</div>'
        );
        $messages.append($msg);
    }

    /**
     * Re-render the current streaming segment from accumulated segment text.
     */
    function _renderAssistantStream() {
        const $target = $messages.find(".ai-stream-target").last();
        if ($target.length) {
            try {
                $target.html(marked.parse(_segmentText, { breaks: true, gfm: true }));
            } catch (e) {
                $target.text(_segmentText);
            }
            _scrollToBottom();
        }
    }

    function _appendToolIndicator(toolName, toolId) {
        // Remove thinking indicator on first content
        if (!_hasReceivedContent) {
            _hasReceivedContent = true;
            $messages.find(".ai-thinking").remove();
        }

        // Finalize the current text segment so tool appears after it, not at the end
        $messages.find(".ai-stream-target").removeClass("ai-stream-target");
        _segmentText = "";

        // Mark any previous active tool indicator as done
        _finishActiveTools();

        const config = TOOL_CONFIG[toolName] || { icon: "fa-solid fa-gear", color: "#adb9bd", label: toolName };

        // Use requestId + toolId to ensure globally unique data-tool-id
        const uniqueToolId = (_currentRequestId || "") + "-" + toolId;
        const $tool = $(
            '<div class="ai-msg ai-msg-tool" data-tool-id="' + uniqueToolId + '">' +
                '<div class="ai-tool-header">' +
                    '<span class="ai-tool-spinner"></span>' +
                    '<span class="ai-tool-label"></span>' +
                '</div>' +
                '<div class="ai-tool-preview"></div>' +
            '</div>'
        );
        $tool.find(".ai-tool-label").text(config.label + "...");
        $tool.css("--tool-color", config.color);
        $tool.attr("data-tool-icon", config.icon);
        $messages.append($tool);
        _scrollToBottom();
    }

    /**
     * Update an existing tool indicator with details once tool input is known.
     */
    function _updateToolIndicator(toolId, toolName, toolInput) {
        const uniqueToolId = (_currentRequestId || "") + "-" + toolId;
        const $tool = $messages.find('.ai-msg-tool[data-tool-id="' + uniqueToolId + '"]');
        if (!$tool.length) {
            return;
        }

        const config = TOOL_CONFIG[toolName] || { icon: "fa-solid fa-gear", color: "#adb9bd", label: toolName };
        const detail = _getToolDetail(toolName, toolInput);

        // Replace spinner with colored icon immediately
        $tool.find(".ai-tool-spinner").replaceWith(
            '<span class="ai-tool-icon" style="color:' + config.color + '">' +
                '<i class="' + config.icon + '"></i>' +
            '</span>'
        );

        // Update label to include summary
        $tool.find(".ai-tool-label").text(detail.summary);

        // For screenshot tools, add a detail container that will be populated
        // when the screenshot capture completes (via screenshotCaptured event)
        if (toolName === "mcp__phoenix-editor__takeScreenshot") {
            const $detail = $('<div class="ai-tool-detail"></div>');
            $tool.append($detail);
            $tool.data("awaitingScreenshot", true);
            $tool.find(".ai-tool-header").on("click", function () {
                $tool.toggleClass("ai-tool-expanded");
            }).css("cursor", "pointer");
        } else if (detail.lines && detail.lines.length) {
            // Add expandable detail if available
            const $detail = $('<div class="ai-tool-detail"></div>');
            detail.lines.forEach(function (line) {
                $detail.append($('<div class="ai-tool-detail-line"></div>').text(line));
            });
            $tool.append($detail);

            // Make header clickable to expand
            $tool.find(".ai-tool-header").on("click", function () {
                $tool.toggleClass("ai-tool-expanded");
            }).css("cursor", "pointer");
        }

        // For file-related tools, make label clickable to open the file
        if (toolInput && toolInput.file_path &&
            (toolName === "Read" || toolName === "Write" || toolName === "Edit")) {
            const filePath = toolInput.file_path;
            $tool.find(".ai-tool-label").on("click", function (e) {
                e.stopPropagation();
                const vfsPath = SnapshotStore.realToVfsPath(filePath);
                CommandManager.execute(Commands.CMD_OPEN, { fullPath: vfsPath });
            }).css("cursor", "pointer").addClass("ai-tool-label-clickable");
        }

        // Clear any stale-preview timers now that tool info arrived
        clearTimeout(_toolStreamStaleTimer);
        clearInterval(_toolStreamRotateTimer);

        // Delay marking as done so the streaming preview stays visible briefly.
        // The ai-tool-done class hides the preview via CSS; deferring it lets the
        // browser paint the preview before it disappears.
        setTimeout(function () {
            $tool.addClass("ai-tool-done");
            $tool.find(".ai-tool-preview").text("");
        }, 1500);

        _scrollToBottom();
    }

    /**
     * Extract a summary and detail lines from tool input.
     */
    function _getToolDetail(toolName, input) {
        if (!input) {
            return { summary: toolName, lines: [] };
        }
        switch (toolName) {
        case "Glob":
            return {
                summary: StringUtils.format(Strings.AI_CHAT_TOOL_SEARCHED, input.pattern || ""),
                lines: input.path ? [StringUtils.format(Strings.AI_CHAT_TOOL_IN_PATH, input.path)] : []
            };
        case "Grep":
            return {
                summary: StringUtils.format(Strings.AI_CHAT_TOOL_GREP, input.pattern || ""),
                lines: [
                    input.path ? StringUtils.format(Strings.AI_CHAT_TOOL_IN_PATH, input.path) : "",
                    input.include ? StringUtils.format(Strings.AI_CHAT_TOOL_INCLUDE, input.include) : ""
                ].filter(Boolean)
            };
        case "Read":
            return {
                summary: StringUtils.format(Strings.AI_CHAT_TOOL_READ_FILE, (input.file_path || "").split("/").pop()),
                lines: [input.file_path || ""]
            };
        case "Edit":
            return {
                summary: StringUtils.format(Strings.AI_CHAT_TOOL_EDIT_FILE, (input.file_path || "").split("/").pop()),
                lines: [input.file_path || ""]
            };
        case "Write":
            return {
                summary: StringUtils.format(Strings.AI_CHAT_TOOL_WRITE_FILE, (input.file_path || "").split("/").pop()),
                lines: [input.file_path || ""]
            };
        case "Bash":
            return {
                summary: Strings.AI_CHAT_TOOL_RAN_CMD,
                lines: input.command ? [input.command] : []
            };
        case "Skill":
            return {
                summary: input.skill ? StringUtils.format(Strings.AI_CHAT_TOOL_SKILL_NAME, input.skill) : Strings.AI_CHAT_TOOL_SKILL,
                lines: input.args ? [input.args] : []
            };
        case "mcp__phoenix-editor__getEditorState":
            return { summary: Strings.AI_CHAT_TOOL_EDITOR_STATE, lines: [] };
        case "mcp__phoenix-editor__takeScreenshot": {
            let screenshotTarget = Strings.AI_CHAT_TOOL_SCREENSHOT_FULL_PAGE;
            if (input.selector) {
                if (input.selector.indexOf("live-preview") !== -1 || input.selector.indexOf("panel-live-preview") !== -1) {
                    screenshotTarget = Strings.AI_CHAT_TOOL_SCREENSHOT_LIVE_PREVIEW;
                } else {
                    screenshotTarget = input.selector;
                }
            }
            return {
                summary: StringUtils.format(Strings.AI_CHAT_TOOL_SCREENSHOT_OF, screenshotTarget),
                lines: input.selector ? [input.selector] : []
            };
        }
        case "mcp__phoenix-editor__execJsInLivePreview":
            return {
                summary: Strings.AI_CHAT_TOOL_LIVE_PREVIEW_JS,
                lines: input.code ? input.code.split("\n").slice(0, 20) : []
            };
        default: {
            // Fallback: use TOOL_CONFIG label if available
            const cfg = TOOL_CONFIG[toolName];
            return { summary: cfg ? cfg.label : toolName, lines: [] };
        }
        }
    }

    /**
     * Mark all active (non-done) tool indicators as finished.
     * Tools that already received _updateToolIndicator (spinner replaced with
     * .ai-tool-icon) are skipped — their delayed timeout will add .ai-tool-done.
     * This only force-finishes tools that never got a toolInfo (e.g. interrupted).
     */
    function _finishActiveTools() {
        $messages.find(".ai-msg-tool:not(.ai-tool-done)").each(function () {
            const $prev = $(this);
            // _updateToolIndicator already ran — let the delayed timeout handle it
            if ($prev.find(".ai-tool-icon").length) {
                return;
            }
            $prev.addClass("ai-tool-done");
            const iconClass = $prev.attr("data-tool-icon") || "fa-solid fa-check";
            const color = $prev.css("--tool-color") || "#adb9bd";
            $prev.find(".ai-tool-spinner").replaceWith(
                '<span class="ai-tool-icon" style="color:' + color + '">' +
                    '<i class="' + iconClass + '"></i>' +
                '</span>'
            );
        });
    }


    function _appendErrorMessage(text) {
        const $msg = $(
            '<div class="ai-msg ai-msg-error">' +
                '<div class="ai-msg-content"></div>' +
            '</div>'
        );
        $msg.find(".ai-msg-content").text(text);
        $messages.append($msg);
        _scrollToBottom();
    }

    function _setStreaming(streaming) {
        _isStreaming = streaming;
        if ($status) {
            $status.toggleClass("active", streaming);
        }
        if ($textarea) {
            $textarea.prop("disabled", streaming);
            $textarea.closest(".ai-chat-input-wrap").toggleClass("disabled", streaming);
            if (!streaming) {
                $textarea[0].focus({ preventScroll: true });
            }
        }
        if ($sendBtn && $stopBtn) {
            if (streaming) {
                $sendBtn.hide();
                $stopBtn.show();
            } else {
                $stopBtn.hide();
                $sendBtn.show();
            }
        }
        // Disable/enable all restore buttons during streaming (use live query)
        _$msgs().find(".ai-restore-point-btn, .ai-edit-restore-btn")
            .prop("disabled", streaming);
        if (!streaming && $messages) {
            // Clean up thinking indicator if still present
            $messages.find(".ai-thinking").remove();

            // Finalize: remove ai-stream-target class so future messages get their own container
            $messages.find(".ai-stream-target").removeClass("ai-stream-target");

            // Mark all active tool indicators as done
            _finishActiveTools();
        }
    }

    function _scrollToBottom() {
        if (_autoScroll && $messages && $messages.length) {
            const el = $messages[0];
            el.scrollTop = el.scrollHeight;
        }
    }

    function _escapeAttr(str) {
        return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // --- Path utilities ---

    /**
     * Get the real filesystem path for the current project root.
     */
    function _getProjectRealPath() {
        const root = ProjectManager.getProjectRoot();
        if (!root) {
            return "/";
        }
        const fullPath = root.fullPath;
        // Desktop (Tauri) paths: /tauri/real/path → /real/path
        if (fullPath.startsWith("/tauri/")) {
            return fullPath.replace("/tauri", "");
        }
        return fullPath;
    }

    // Public API
    exports.init = init;
    exports.initPlaceholder = initPlaceholder;
});
