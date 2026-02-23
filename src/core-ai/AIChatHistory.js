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
 * AI Chat History — manages storage, loading, and visual restoration of
 * past AI chat sessions. Sessions are stored per-project using StateManager
 * for metadata and JSON files on disk for full chat history.
 */
define(function (require, exports, module) {

    const StateManager   = require("preferences/StateManager"),
        ProjectManager = require("project/ProjectManager"),
        FileSystem     = require("filesystem/FileSystem"),
        Strings        = require("strings"),
        StringUtils    = require("utils/StringUtils"),
        marked         = require("thirdparty/marked.min");

    const SESSION_HISTORY_KEY = "ai.sessionHistory";
    const MAX_SESSION_HISTORY = 50;
    const SESSION_TITLE_MAX_LEN = 80;

    // --- Hash utility (reused from FileRecovery pattern) ---

    function _simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            // eslint-disable-next-line no-bitwise
            hash = ((hash << 5) - hash) + char;
            // eslint-disable-next-line no-bitwise
            hash = hash & hash;
        }
        return Math.abs(hash) + "";
    }

    // --- Storage infrastructure ---

    /**
     * Get the per-project history directory path.
     * @return {string|null} directory path or null if no project is open
     */
    function _getHistoryDir() {
        const projectRoot = ProjectManager.getProjectRoot();
        if (!projectRoot) {
            return null;
        }
        const fullPath = projectRoot.fullPath;
        const baseName = fullPath.split("/").filter(Boolean).pop() || "default";
        const hash = _simpleHash(fullPath);
        return Phoenix.VFS.getAppSupportDir() + "aiHistory/" + baseName + "_" + hash + "/";
    }

    /**
     * Load session metadata from StateManager (project-scoped).
     * @return {Array} array of session metadata objects
     */
    function loadSessionHistory() {
        return StateManager.get(SESSION_HISTORY_KEY, StateManager.PROJECT_CONTEXT) || [];
    }

    /**
     * Save session metadata to StateManager (project-scoped).
     * @param {Array} history - array of session metadata objects
     */
    function _saveSessionHistory(history) {
        // Trim to max entries
        if (history.length > MAX_SESSION_HISTORY) {
            history = history.slice(0, MAX_SESSION_HISTORY);
        }
        StateManager.set(SESSION_HISTORY_KEY, history, StateManager.PROJECT_CONTEXT);
    }

    /**
     * Record a session in metadata. Most recent first.
     * @param {string} sessionId
     * @param {string} title - first user message, truncated
     */
    function recordSessionMetadata(sessionId, title) {
        const history = loadSessionHistory();
        // Remove existing entry with same id (update case)
        const filtered = history.filter(function (h) { return h.id !== sessionId; });
        filtered.unshift({
            id: sessionId,
            title: (title || "Untitled").slice(0, SESSION_TITLE_MAX_LEN),
            timestamp: Date.now()
        });
        _saveSessionHistory(filtered);
    }

    /**
     * Save full chat history to disk.
     * @param {string} sessionId
     * @param {Object} data - {id, title, timestamp, messages}
     * @param {Function} [callback] - optional callback(err)
     */
    function saveChatHistory(sessionId, data, callback) {
        const dir = _getHistoryDir();
        if (!dir) {
            if (callback) { callback(new Error("No project open")); }
            return;
        }
        Phoenix.VFS.ensureExistsDirAsync(dir)
            .then(function () {
                const file = FileSystem.getFileForPath(dir + sessionId + ".json");
                file.write(JSON.stringify(data), function (err) {
                    if (err) {
                        console.warn("[AI History] Failed to save chat history:", err);
                    }
                    if (callback) { callback(err); }
                });
            })
            .catch(function (err) {
                console.warn("[AI History] Failed to create history dir:", err);
                if (callback) { callback(err); }
            });
    }

    /**
     * Load full chat history from disk.
     * @param {string} sessionId
     * @param {Function} callback - callback(err, data)
     */
    function loadChatHistory(sessionId, callback) {
        const dir = _getHistoryDir();
        if (!dir) {
            callback(new Error("No project open"));
            return;
        }
        const file = FileSystem.getFileForPath(dir + sessionId + ".json");
        file.read(function (err, content) {
            if (err) {
                callback(err);
                return;
            }
            try {
                callback(null, JSON.parse(content));
            } catch (parseErr) {
                callback(parseErr);
            }
        });
    }

    /**
     * Delete a single session's history file and remove from metadata.
     * @param {string} sessionId
     * @param {Function} [callback] - optional callback()
     */
    function deleteSession(sessionId, callback) {
        // Remove from metadata
        const history = loadSessionHistory();
        const filtered = history.filter(function (h) { return h.id !== sessionId; });
        _saveSessionHistory(filtered);

        // Delete file
        const dir = _getHistoryDir();
        if (dir) {
            const file = FileSystem.getFileForPath(dir + sessionId + ".json");
            file.unlink(function (err) {
                if (err) {
                    console.warn("[AI History] Failed to delete session file:", err);
                }
                if (callback) { callback(); }
            });
        } else {
            if (callback) { callback(); }
        }
    }

    /**
     * Clear all session history (metadata + files).
     * @param {Function} [callback] - optional callback()
     */
    function clearAllHistory(callback) {
        _saveSessionHistory([]);
        const dir = _getHistoryDir();
        if (dir) {
            const directory = FileSystem.getDirectoryForPath(dir);
            directory.unlink(function (err) {
                if (err) {
                    console.warn("[AI History] Failed to delete history dir:", err);
                }
                if (callback) { callback(); }
            });
        } else {
            if (callback) { callback(); }
        }
    }

    // --- Time formatting ---

    /**
     * Format a timestamp as a relative time string.
     * @param {number} timestamp
     * @return {string}
     */
    function formatRelativeTime(timestamp) {
        const diff = Date.now() - timestamp;
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) {
            return Strings.AI_CHAT_HISTORY_JUST_NOW;
        }
        if (minutes < 60) {
            return StringUtils.format(Strings.AI_CHAT_HISTORY_MINS_AGO, minutes);
        }
        const hours = Math.floor(minutes / 60);
        if (hours < 24) {
            return StringUtils.format(Strings.AI_CHAT_HISTORY_HOURS_AGO, hours);
        }
        const days = Math.floor(hours / 24);
        return StringUtils.format(Strings.AI_CHAT_HISTORY_DAYS_AGO, days);
    }

    // --- Visual state restoration ---

    /**
     * Inject a copy-to-clipboard button into each <pre> block.
     * Idempotent: skips <pre> elements that already have a .ai-copy-btn.
     */
    function _addCopyButtons($container) {
        $container.find("pre").each(function () {
            const $pre = $(this);
            if ($pre.find(".ai-copy-btn").length) {
                return;
            }
            const $btn = $('<button class="ai-copy-btn" title="' + Strings.AI_CHAT_COPY_CODE + '">' +
                '<i class="fa-solid fa-copy"></i></button>');
            $btn.on("click", function (e) {
                e.stopPropagation();
                const $code = $pre.find("code");
                const text = ($code.length ? $code[0] : $pre[0]).textContent;
                Phoenix.app.copyToClipboard(text);
                const $icon = $btn.find("i");
                $icon.removeClass("fa-copy").addClass("fa-check");
                $btn.attr("title", Strings.AI_CHAT_COPIED_CODE);
                setTimeout(function () {
                    $icon.removeClass("fa-check").addClass("fa-copy");
                    $btn.attr("title", Strings.AI_CHAT_COPY_CODE);
                }, 1500);
            });
            $pre.append($btn);
        });
    }

    function _escapeAttr(str) {
        return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    /**
     * Show a lightbox overlay with the full-size image.
     */
    function _showImageLightbox(src, $panel) {
        const $overlay = $(
            '<div class="ai-image-lightbox">' +
                '<img />' +
            '</div>'
        );
        $overlay.find("img").attr("src", src);
        $overlay.on("click", function () {
            $overlay.remove();
        });
        $panel.append($overlay);
    }

    /**
     * Render restored chat messages into the given $messages container.
     * Creates static (non-interactive) versions of all recorded message types.
     *
     * @param {Array} messages - array of recorded message objects
     * @param {jQuery} $messages - the messages container
     * @param {jQuery} $panel - the panel container (for lightbox)
     */
    function renderRestoredChat(messages, $messages, $panel) {
        if (!messages || !messages.length) {
            return;
        }

        let isFirstAssistant = true;

        messages.forEach(function (msg) {
            switch (msg.type) {
            case "user":
                _renderRestoredUser(msg, $messages, $panel);
                break;
            case "assistant":
                _renderRestoredAssistant(msg, $messages, isFirstAssistant);
                if (isFirstAssistant) {
                    isFirstAssistant = false;
                }
                break;
            case "tool":
                _renderRestoredTool(msg, $messages);
                break;
            case "tool_edit":
                _renderRestoredToolEdit(msg, $messages);
                break;
            case "error":
                _renderRestoredError(msg, $messages);
                break;
            case "question":
                _renderRestoredQuestion(msg, $messages);
                break;
            case "edit_summary":
                _renderRestoredEditSummary(msg, $messages);
                break;
            case "complete":
                // Skip — just a save marker
                break;
            default:
                break;
            }
        });
    }

    function _renderRestoredUser(msg, $messages, $panel) {
        const $msg = $(
            '<div class="ai-msg ai-msg-user">' +
                '<div class="ai-msg-label">' + Strings.AI_CHAT_LABEL_YOU + '</div>' +
                '<div class="ai-msg-content"></div>' +
            '</div>'
        );
        $msg.find(".ai-msg-content").text(msg.text);
        if (msg.images && msg.images.length > 0) {
            const $imgDiv = $('<div class="ai-user-images"></div>');
            msg.images.forEach(function (img) {
                const $thumb = $('<img class="ai-user-image-thumb" />');
                $thumb.attr("src", img.dataUrl);
                $thumb.on("click", function () {
                    _showImageLightbox(img.dataUrl, $panel);
                });
                $imgDiv.append($thumb);
            });
            $msg.find(".ai-msg-content").append($imgDiv);
        }
        $messages.append($msg);
    }

    function _renderRestoredAssistant(msg, $messages, isFirst) {
        const $msg = $(
            '<div class="ai-msg ai-msg-assistant">' +
                (isFirst ? '<div class="ai-msg-label">' + Strings.AI_CHAT_LABEL_CLAUDE + '</div>' : '') +
                '<div class="ai-msg-content"></div>' +
            '</div>'
        );
        try {
            $msg.find(".ai-msg-content").html(marked.parse(msg.markdown || "", { breaks: true, gfm: true }));
            _addCopyButtons($msg);
        } catch (e) {
            $msg.find(".ai-msg-content").text(msg.markdown || "");
        }
        $messages.append($msg);
    }

    // Tool type configuration (duplicated from AIChatPanel for independence)
    const TOOL_CONFIG = {
        Glob:  { icon: "fa-solid fa-magnifying-glass", color: "#6b9eff" },
        Grep:  { icon: "fa-solid fa-magnifying-glass-location", color: "#6b9eff" },
        Read:  { icon: "fa-solid fa-file-lines", color: "#6bc76b" },
        Edit:  { icon: "fa-solid fa-pen", color: "#e8a838" },
        Write: { icon: "fa-solid fa-file-pen", color: "#e8a838" },
        Bash:  { icon: "fa-solid fa-terminal", color: "#c084fc" },
        Skill: { icon: "fa-solid fa-puzzle-piece", color: "#e0c060" },
        TodoWrite: { icon: "fa-solid fa-list-check", color: "#66bb6a" },
        AskUserQuestion: { icon: "fa-solid fa-circle-question", color: "#66bb6a" },
        Task: { icon: "fa-solid fa-diagram-project", color: "#6b9eff" },
        "mcp__phoenix-editor__getEditorState":      { icon: "fa-solid fa-code", color: "#6bc76b" },
        "mcp__phoenix-editor__takeScreenshot":      { icon: "fa-solid fa-camera", color: "#c084fc" },
        "mcp__phoenix-editor__execJsInLivePreview": { icon: "fa-solid fa-eye", color: "#66bb6a" },
        "mcp__phoenix-editor__controlEditor":       { icon: "fa-solid fa-code", color: "#6bc76b" },
        "mcp__phoenix-editor__resizeLivePreview":   { icon: "fa-solid fa-arrows-left-right", color: "#66bb6a" },
        "mcp__phoenix-editor__wait":                { icon: "fa-solid fa-hourglass-half", color: "#adb9bd" },
        "mcp__phoenix-editor__getUserClarification": { icon: "fa-solid fa-comment-dots", color: "#6bc76b" }
    };

    function _renderRestoredTool(msg, $messages) {
        const config = TOOL_CONFIG[msg.toolName] || { icon: "fa-solid fa-gear", color: "#adb9bd" };
        const icon = msg.icon || config.icon;
        const color = msg.color || config.color;
        const $tool = $(
            '<div class="ai-msg ai-msg-tool ai-tool-done">' +
                '<div class="ai-tool-header">' +
                    '<span class="ai-tool-icon" style="color:' + color + '">' +
                        '<i class="' + icon + '"></i>' +
                    '</span>' +
                    '<span class="ai-tool-label"></span>' +
                    (msg.elapsed ? '<span class="ai-tool-elapsed">' + msg.elapsed.toFixed(1) + 's</span>' : '') +
                '</div>' +
            '</div>'
        );
        $tool.css("--tool-color", color);
        $tool.find(".ai-tool-label").text(msg.summary || msg.toolName);
        $messages.append($tool);
    }

    function _renderRestoredToolEdit(msg, $messages) {
        const color = "#e8a838";
        const fileName = (msg.file || "").split("/").pop();
        const $tool = $(
            '<div class="ai-msg ai-msg-tool ai-tool-done">' +
                '<div class="ai-tool-header">' +
                    '<span class="ai-tool-icon" style="color:' + color + '">' +
                        '<i class="fa-solid fa-pen"></i>' +
                    '</span>' +
                    '<span class="ai-tool-label"></span>' +
                    '<span class="ai-tool-elapsed">' +
                        '<span class="ai-edit-summary-add">+' + (msg.linesAdded || 0) + '</span> ' +
                        '<span class="ai-edit-summary-del">-' + (msg.linesRemoved || 0) + '</span>' +
                    '</span>' +
                '</div>' +
            '</div>'
        );
        $tool.css("--tool-color", color);
        $tool.find(".ai-tool-label").text("Edit " + fileName);
        $messages.append($tool);
    }

    function _renderRestoredError(msg, $messages) {
        const $msg = $(
            '<div class="ai-msg ai-msg-error">' +
                '<div class="ai-msg-content"></div>' +
            '</div>'
        );
        $msg.find(".ai-msg-content").text(msg.text);
        $messages.append($msg);
    }

    function _renderRestoredQuestion(msg, $messages) {
        const questions = msg.questions || [];
        const answers = msg.answers || {};
        if (!questions.length) {
            return;
        }

        const $container = $('<div class="ai-msg ai-msg-question"></div>');

        questions.forEach(function (q) {
            const $qBlock = $('<div class="ai-question-block"></div>');
            const $qText = $('<div class="ai-question-text"></div>');
            $qText.text(q.question);
            $qBlock.append($qText);

            const $options = $('<div class="ai-question-options"></div>');
            const answerValue = answers[q.question] || "";

            q.options.forEach(function (opt) {
                const $opt = $('<button class="ai-question-option" disabled></button>');
                const $label = $('<span class="ai-question-option-label"></span>');
                $label.text(opt.label);
                $opt.append($label);
                if (opt.description) {
                    const $desc = $('<span class="ai-question-option-desc"></span>');
                    $desc.text(opt.description);
                    $opt.append($desc);
                }
                // Highlight selected option
                if (answerValue === opt.label || answerValue.split(", ").indexOf(opt.label) !== -1) {
                    $opt.addClass("selected");
                }
                $options.append($opt);
            });

            $qBlock.append($options);

            // If answered with a custom "Other" value, show it
            if (answerValue && !q.options.some(function (o) { return o.label === answerValue; })) {
                const isMultiAnswer = answerValue.split(", ").some(function (a) {
                    return q.options.some(function (o) { return o.label === a; });
                });
                if (!isMultiAnswer) {
                    const $other = $('<div class="ai-question-other"></div>');
                    const $input = $('<input type="text" class="ai-question-other-input" disabled>');
                    $input.val(answerValue);
                    $other.append($input);
                    $qBlock.append($other);
                }
            }

            $container.append($qBlock);
        });

        $messages.append($container);
    }

    function _renderRestoredEditSummary(msg, $messages) {
        const files = msg.files || [];
        const fileCount = files.length;
        const $summary = $('<div class="ai-msg ai-msg-edit-summary"></div>');
        const $header = $(
            '<div class="ai-edit-summary-header">' +
                '<span class="ai-edit-summary-title">' +
                    StringUtils.format(Strings.AI_CHAT_FILES_CHANGED, fileCount,
                        fileCount === 1 ? Strings.AI_CHAT_FILE_SINGULAR : Strings.AI_CHAT_FILE_PLURAL) +
                '</span>' +
            '</div>'
        );
        $summary.append($header);

        files.forEach(function (f) {
            const displayName = (f.file || "").split("/").pop();
            const $file = $(
                '<div class="ai-edit-summary-file">' +
                    '<span class="ai-edit-summary-name"></span>' +
                    '<span class="ai-edit-summary-stats">' +
                        '<span class="ai-edit-summary-add">+' + (f.added || 0) + '</span>' +
                        '<span class="ai-edit-summary-del">-' + (f.removed || 0) + '</span>' +
                    '</span>' +
                '</div>'
            );
            $file.find(".ai-edit-summary-name").text(displayName);
            $summary.append($file);
        });

        $messages.append($summary);
    }

    // Public API
    exports.loadSessionHistory = loadSessionHistory;
    exports.recordSessionMetadata = recordSessionMetadata;
    exports.saveChatHistory = saveChatHistory;
    exports.loadChatHistory = loadChatHistory;
    exports.deleteSession = deleteSession;
    exports.clearAllHistory = clearAllHistory;
    exports.formatRelativeTime = formatRelativeTime;
    exports.renderRestoredChat = renderRestoredChat;
    exports.SESSION_TITLE_MAX_LEN = SESSION_TITLE_MAX_LEN;
});
