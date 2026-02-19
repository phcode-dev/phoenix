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

    const SidebarTabs      = require("view/SidebarTabs"),
        DocumentManager  = require("document/DocumentManager"),
        CommandManager   = require("command/CommandManager"),
        Commands         = require("command/Commands"),
        ProjectManager   = require("project/ProjectManager"),
        FileSystem       = require("filesystem/FileSystem"),
        SnapshotStore    = require("core-ai/AISnapshotStore"),
        marked           = require("thirdparty/marked.min");

    let _nodeConnector = null;
    let _isStreaming = false;
    let _currentRequestId = null;
    let _segmentText = "";       // text for the current segment only
    let _autoScroll = true;
    let _hasReceivedContent = false; // tracks if we've received any text/tool in current response
    const _previousContentMap = {}; // filePath → previous content before edit, for undo support
    let _currentEdits = [];          // edits in current response, for summary card
    let _firstEditInResponse = true; // tracks first edit per response for initial PUC
    let _undoApplied = false;        // whether undo/restore has been clicked on any card
    // --- AI event trace logging (compact, non-flooding) ---
    let _traceTextChunks = 0;
    let _traceToolStreamCounts = {}; // toolId → count

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
                '<span class="ai-chat-title">AI Assistant</span>' +
                '<button class="ai-new-session-btn" title="Start a new conversation">' +
                    '<i class="fa-solid fa-plus"></i> New' +
                '</button>' +
            '</div>' +
            '<div class="ai-chat-messages"></div>' +
            '<div class="ai-chat-status">' +
                '<span class="ai-status-spinner"></span>' +
                '<span class="ai-status-text">Thinking...</span>' +
            '</div>' +
            '<div class="ai-chat-input-area">' +
                '<div class="ai-chat-input-wrap">' +
                    '<textarea class="ai-chat-textarea" placeholder="Ask Claude..." rows="1"></textarea>' +
                    '<button class="ai-send-btn" title="Send message">' +
                        '<i class="fa-solid fa-paper-plane"></i>' +
                    '</button>' +
                    '<button class="ai-stop-btn" title="Stop generation (Esc)" style="display:none">' +
                        '<i class="fa-solid fa-stop"></i>' +
                    '</button>' +
                '</div>' +
            '</div>' +
        '</div>';

    const UNAVAILABLE_HTML =
        '<div class="ai-chat-panel">' +
            '<div class="ai-unavailable">' +
                '<div class="ai-unavailable-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div>' +
                '<div class="ai-unavailable-title">Claude CLI Not Found</div>' +
                '<div class="ai-unavailable-message">' +
                    'Install the Claude CLI to use AI features:<br>' +
                    '<code>npm install -g @anthropic-ai/claude-code</code><br><br>' +
                    'Then run <code>claude login</code> to authenticate.' +
                '</div>' +
                '<button class="ai-retry-btn">Retry</button>' +
            '</div>' +
        '</div>';

    const PLACEHOLDER_HTML =
        '<div class="ai-chat-panel">' +
            '<div class="ai-unavailable">' +
                '<div class="ai-unavailable-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div>' +
                '<div class="ai-unavailable-title">AI Assistant</div>' +
                '<div class="ai-unavailable-message">' +
                    'AI features require the Phoenix desktop app.' +
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
        _appendThinkingIndicator();

        // Remove restore highlights from previous interactions
        _$msgs().find(".ai-restore-highlighted").removeClass("ai-restore-highlighted");

        // Get project path
        const projectPath = _getProjectRealPath();

        _traceTextChunks = 0;
        _traceToolStreamCounts = {};

        const prompt = text;
        console.log("[AI UI] Sending prompt:", text.slice(0, 60));

        _nodeConnector.execPeer("sendPrompt", {
            prompt: prompt,
            projectPath: projectPath,
            sessionAction: "continue"
        }).then(function (result) {
            _currentRequestId = result.requestId;
            console.log("[AI UI] RequestId:", result.requestId);
        }).catch(function (err) {
            _setStreaming(false);
            _appendErrorMessage("Failed to send message: " + (err.message || String(err)));
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
        SnapshotStore.reset();
        Object.keys(_previousContentMap).forEach(function (key) {
            delete _previousContentMap[key];
        });
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
        Glob:  { icon: "fa-solid fa-magnifying-glass", color: "#6b9eff", label: "Search files" },
        Grep:  { icon: "fa-solid fa-magnifying-glass-location", color: "#6b9eff", label: "Search code" },
        Read:  { icon: "fa-solid fa-file-lines", color: "#6bc76b", label: "Read" },
        Edit:  { icon: "fa-solid fa-pen", color: "#e8a838", label: "Edit" },
        Write: { icon: "fa-solid fa-file-pen", color: "#e8a838", label: "Write" },
        Bash:  { icon: "fa-solid fa-terminal", color: "#c084fc", label: "Run command" },
        Skill: { icon: "fa-solid fa-puzzle-piece", color: "#e0c060", label: "Skill" }
    };

    function _onProgress(_event, data) {
        console.log("[AI UI]", "Progress:", data.phase, data.toolName ? data.toolName + " #" + data.toolId : "");
        if ($statusText) {
            const toolName = data.toolName || "";
            const config = TOOL_CONFIG[toolName];
            $statusText.text(config ? config.label + "..." : "Thinking...");
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
            Glob: "pattern"
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
            return "receiving " + partialJson.length + " bytes...";
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
        const previousContent = _previousContentMap[edit.file];
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
                        '<button class="ai-restore-point-btn" disabled>Restore to this point</button>' +
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
        const $diffToggle = $('<button class="ai-tool-diff-toggle">Show diff</button>');
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
            $diffToggle.text($diff.hasClass("expanded") ? "Hide diff" : "Show diff");
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

    function _onComplete(_event, data) {
        console.log("[AI UI]", "Complete. textChunks=" + _traceTextChunks,
            "toolStreams=" + JSON.stringify(_traceToolStreamCounts));
        // Reset trace counters for next query
        _traceTextChunks = 0;
        _traceToolStreamCounts = {};

        // Append edit summary if there were edits (finalizeResponse called inside)
        if (_currentEdits.length > 0) {
            _appendEditSummary();
        }

        _setStreaming(false);
    }

    /**
     * Append a compact summary card showing all files modified during this response.
     */
    function _appendEditSummary() {
        // Finalize snapshot and get the after-snapshot index
        const afterIndex = SnapshotStore.finalizeResponse();
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
                    fileCount + (fileCount === 1 ? " file" : " files") + " changed" +
                '</span>' +
            '</div>'
        );

        if (afterIndex >= 0) {
            // Update any previous summary card buttons to say "Restore to this point"
            _$msgs().find('.ai-edit-restore-btn').text("Restore to this point")
                .attr("title", "Restore files to this point");

            // Determine button label: "Undo" if not undone, else "Restore to this point"
            const isUndo = !_undoApplied;
            const label = isUndo ? "Undo" : "Restore to this point";
            const title = isUndo ? "Undo changes from this response" : "Restore files to this point";

            const $restoreBtn = $(
                '<button class="ai-edit-restore-btn" data-snapshot-index="' + afterIndex + '" ' +
                'title="' + title + '">' + label + '</button>'
            );
            $restoreBtn.on("click", function (e) {
                e.stopPropagation();
                if (_isStreaming) {
                    return;
                }
                if ($(this).text() === "Undo") {
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
            $(this).text("Restore to this point")
                .attr("title", "Restore files to this point");
        });
        $msgs.find('.ai-restore-point-btn').text("Restore to this point");

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
                $btn.text("Restored");
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
            $(this).text("Restore to this point")
                .attr("title", "Restore files to this point");
        });
        $msgs.find('.ai-restore-point-btn').text("Restore to this point");

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
                $btn.text("Restored");
            }
        });
    }

    // --- DOM helpers ---

    function _appendUserMessage(text) {
        const $msg = $(
            '<div class="ai-msg ai-msg-user">' +
                '<div class="ai-msg-label">You</div>' +
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
                '<div class="ai-msg-label">Claude</div>' +
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

        // Add expandable detail if available
        if (detail.lines && detail.lines.length) {
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
                summary: "Searched: " + (input.pattern || ""),
                lines: input.path ? ["in " + input.path] : []
            };
        case "Grep":
            return {
                summary: "Grep: " + (input.pattern || ""),
                lines: [input.path ? "in " + input.path : "", input.include ? "include " + input.include : ""]
                    .filter(Boolean)
            };
        case "Read":
            return {
                summary: "Read " + (input.file_path || "").split("/").pop(),
                lines: [input.file_path || ""]
            };
        case "Edit":
            return {
                summary: "Edit " + (input.file_path || "").split("/").pop(),
                lines: [input.file_path || ""]
            };
        case "Write":
            return {
                summary: "Write " + (input.file_path || "").split("/").pop(),
                lines: [input.file_path || ""]
            };
        case "Bash":
            return {
                summary: "Ran command",
                lines: input.command ? [input.command] : []
            };
        case "Skill":
            return {
                summary: input.skill ? "Skill: " + input.skill : "Skill",
                lines: input.args ? [input.args] : []
            };
        default:
            return { summary: toolName, lines: [] };
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

    // --- Edit application ---

    /**
     * Apply a single edit to a document buffer and save to disk.
     * Called immediately when Claude's Write/Edit is intercepted, so
     * subsequent Reads see the new content both in the buffer and on disk.
     * @param {Object} edit - {file, oldText, newText}
     * @return {$.Promise} resolves with {previousContent} for undo support
     */
    function _applySingleEdit(edit) {
        const result = new $.Deferred();
        const vfsPath = SnapshotStore.realToVfsPath(edit.file);

        function _applyToDoc() {
            DocumentManager.getDocumentForPath(vfsPath)
                .done(function (doc) {
                    try {
                        const previousContent = doc.getText();
                        if (edit.oldText === null) {
                            // Write (new file or full replacement)
                            doc.setText(edit.newText);
                        } else {
                            // Edit — find oldText and replace
                            const docText = doc.getText();
                            const idx = docText.indexOf(edit.oldText);
                            if (idx === -1) {
                                result.reject(new Error("Text not found in file — it may have changed"));
                                return;
                            }
                            const startPos = doc._masterEditor ?
                                doc._masterEditor._codeMirror.posFromIndex(idx) :
                                _indexToPos(docText, idx);
                            const endPos = doc._masterEditor ?
                                doc._masterEditor._codeMirror.posFromIndex(idx + edit.oldText.length) :
                                _indexToPos(docText, idx + edit.oldText.length);
                            doc.replaceRange(edit.newText, startPos, endPos);
                        }
                        // Open the file in the editor and save to disk
                        CommandManager.execute(Commands.CMD_OPEN, { fullPath: vfsPath });
                        SnapshotStore.saveDocToDisk(doc).always(function () {
                            result.resolve({ previousContent: previousContent });
                        });
                    } catch (err) {
                        result.reject(err);
                    }
                })
                .fail(function (err) {
                    result.reject(err || new Error("Could not open document"));
                });
        }

        if (edit.oldText === null) {
            // Write — file may not exist yet. Only create on disk if it doesn't
            // already exist, to avoid triggering "external change" warnings.
            const file = FileSystem.getFileForPath(vfsPath);
            file.exists(function (existErr, exists) {
                if (exists) {
                    // File exists — just open and set content, no disk write
                    _applyToDoc();
                } else {
                    // New file — create on disk first so getDocumentForPath works
                    file.write("", function (writeErr) {
                        if (writeErr) {
                            result.reject(new Error("Could not create file: " + writeErr));
                            return;
                        }
                        _applyToDoc();
                    });
                }
            });
        } else {
            // Edit — file must already exist
            _applyToDoc();
        }

        return result.promise();
    }

    /**
     * Convert a character index in text to a {line, ch} position.
     */
    function _indexToPos(text, index) {
        let line = 0, ch = 0;
        for (let i = 0; i < index; i++) {
            if (text[i] === "\n") {
                line++;
                ch = 0;
            } else {
                ch++;
            }
        }
        return { line: line, ch: ch };
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

    /**
     * Check if a file has unsaved changes in the editor and return its content.
     * Used by the node-side Read hook to serve dirty buffer content to Claude.
     */
    function getFileContent(params) {
        const vfsPath = SnapshotStore.realToVfsPath(params.filePath);
        const doc = DocumentManager.getOpenDocumentForPath(vfsPath);
        if (doc && doc.isDirty) {
            return { isDirty: true, content: doc.getText() };
        }
        return { isDirty: false, content: null };
    }

    /**
     * Apply an edit to the editor buffer immediately (called by node-side hooks).
     * The file appears as a dirty tab so subsequent Reads see the new content.
     * @param {Object} params - {file, oldText, newText}
     * @return {Promise<{applied: boolean, error?: string}>}
     */
    function applyEditToBuffer(params) {
        const deferred = new $.Deferred();
        _applySingleEdit(params)
            .done(function (result) {
                if (result && result.previousContent !== undefined) {
                    _previousContentMap[params.file] = result.previousContent;
                }
                deferred.resolve({ applied: true });
            })
            .fail(function (err) {
                deferred.resolve({ applied: false, error: err.message || String(err) });
            });
        return deferred.promise();
    }

    // Public API
    exports.init = init;
    exports.initPlaceholder = initPlaceholder;
    exports.getFileContent = getFileContent;
    exports.applyEditToBuffer = applyEditToBuffer;
});
