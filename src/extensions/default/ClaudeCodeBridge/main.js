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
 * ClaudeCodeBridge Extension
 *
 * This extension provides a bridge between Phoenix Live Preview and Claude Code UI.
 * When users select elements in the live preview and provide AI prompts, this extension:
 * 1. Sends the context (element HTML, file path, prompt) to claudecodeui server
 * 2. Receives suggested edits from Claude
 * 3. Applies edits to the source files via Phoenix's editor APIs
 *
 * All changes go through Phoenix's undo/redo system.
 */
define(function (require, exports, module) {

    const AppInit = brackets.getModule("utils/AppInit");
    const WebSocketConnection = require("./WebSocketConnection");
    const EditApplicator = require("./EditApplicator");
    const PathMapper = require("./PathMapper");
    const Strings = brackets.getModule("strings");
    const StatusBar = brackets.getModule("widgets/StatusBar");
    const Dialogs = brackets.getModule("widgets/Dialogs");
    const DefaultDialogs = brackets.getModule("widgets/DefaultDialogs");
    const ProjectManager = brackets.getModule("project/ProjectManager");
    const HTMLInstrumentation = brackets.getModule("LiveDevelopment/MultiBrowserImpl/language/HTMLInstrumentation");

    // Connection instance
    let connection = null;

    // Map to track pending requests for progress updates
    const pendingRequests = new Map();

    // Configuration - phoenix-ai-server WebSocket URL
    const CLAUDECODEUI_WS_URL = "ws://localhost:3002/ws";

    /**
     * Generate a unique request ID
     * @returns {string} Unique request ID
     */
    function generateRequestId() {
        return "phoenix-ai-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Send project path mapping to the AI server
     * Maps Phoenix virtual paths to real filesystem paths
     */
    async function sendProjectPathMapping() {
        const mapping = await PathMapper.getProjectPathMapping();
        if (!mapping || !mapping.rootPath) {
            return;
        }

        if (connection && connection.isConnected()) {
            connection.send({
                type: 'phoenix-ai-set-path',
                projectName: mapping.projectName,
                rootPath: mapping.rootPath
            });
            console.log('[ClaudeCodeBridge] Path mapping sent:',
                mapping.projectName, '→', mapping.rootPath);
        }
    }

    /**
     * Initialize the ClaudeCodeBridge extension
     */
    function init() {
        // Create WebSocket connection to claudecodeui
        connection = new WebSocketConnection(CLAUDECODEUI_WS_URL, {
            onMessage: handleResponse,
            onConnect: function() {
                StatusBar.showBusyIndicator(false);
                sendProjectPathMapping();
            },
            onDisconnect: function() {
                // Connection lost - will auto-reconnect
            },
            onError: function(error) {
                console.error("[ClaudeCodeBridge] WebSocket error:", error);
            }
        });

        // Send path mapping when project changes
        ProjectManager.on("projectOpen", sendProjectPathMapping);
    }

    /**
     * Submit an AI edit request to claudecodeui
     *
     * @param {Object} AIData - Data from LivePreviewEdit._getRequiredDataForAI()
     *   - editor: The editor instance
     *   - fileName: Name of the file
     *   - filePath: Absolute path to the file
     *   - tagId: data-brackets-id of the selected element
     *   - range: {startPos, endPos} of the element in source code
     *   - text: Source code of the element
     *   - prompt: User's AI prompt
     *   - model: Selected model (fast, slow, moderate)
     * @returns {string|null} Request ID or null if failed
     */
    async function submitAIEditRequest(AIData) {
        if (!AIData) {
            console.error("[ClaudeCodeBridge] No AI data provided");
            return null;
        }

        // Ensure path mapping exists for virtual filesystem projects
        const mapping = await PathMapper.getProjectPathMapping();
        if (mapping && mapping.needsUserInput) {
            try {
                const realPath = await PathMapper.promptForRealPath(mapping.projectName);
                // Send the new mapping
                if (connection && connection.isConnected()) {
                    connection.send({
                        type: 'phoenix-ai-set-path',
                        projectName: mapping.projectName,
                        rootPath: realPath
                    });
                    console.log('[ClaudeCodeBridge] Path mapping sent:',
                        mapping.projectName, '→', realPath);
                }
            } catch (e) {
                Dialogs.showModalDialog(
                    DefaultDialogs.DIALOG_ID_ERROR,
                    "AI Setup Required",
                    "Please provide a local folder path to enable AI editing."
                );
                return null;
            }
        }

        if (!connection || !connection.isConnected()) {
            console.error("[ClaudeCodeBridge] Not connected to Claude Code UI");
            Dialogs.showModalDialog(
                DefaultDialogs.DIALOG_ID_ERROR,
                "Connection Error",
                "Cannot connect to Claude Code UI server. Please ensure the server is running at " + CLAUDECODEUI_WS_URL
            );
            return null;
        }

        const requestId = generateRequestId();

        // Store the request context for handling the response
        pendingRequests.set(requestId, {
            editor: AIData.editor,
            filePath: AIData.filePath,
            range: AIData.range,
            startTime: Date.now()
        });

        // Map model selection to API format
        const modelMap = {
            'fast': 'haiku',
            'moderate': 'sonnet',
            'slow': 'opus'
        };

        // Send request to claudecodeui
        const message = {
            type: 'phoenix-ai-edit',
            requestId: requestId,
            filePath: AIData.filePath,
            tagId: AIData.tagId,
            range: AIData.range,
            sourceCode: AIData.text,
            prompt: AIData.prompt,
            model: modelMap[AIData.model] || 'sonnet',
            newSession: AIData.newSession || false
        };

        connection.send(message);

        return requestId;
    }

    /**
     * Handle responses from claudecodeui
     * @param {Object} response - Response message from server
     */
    function handleResponse(response) {
        if (!response || !response.type) {
            return;
        }

        switch (response.type) {
            case 'phoenix-ai-progress':
                handleProgress(response);
                break;

            case 'phoenix-ai-text-stream':
                handleTextStream(response);
                break;

            case 'phoenix-ai-edit-result':
                handleEditResult(response);
                break;

            case 'phoenix-ai-error':
                handleError(response);
                break;

            default:
                // Ignore other message types (they may be for other handlers)
                break;
        }
    }

    /**
     * Handle progress updates during Claude processing
     * @param {Object} response - Progress message
     */
    function handleProgress(response) {
        const requestContext = pendingRequests.get(response.requestId);
        if (!requestContext) {
            return;
        }

        // Progress updates are handled by the AIPromptBox in RemoteFunctions.js
        // We broadcast a progress event that the live preview can listen to
        $(brackets).trigger("claudeCodeBridge.progress", {
            requestId: response.requestId,
            message: response.message,
            phase: response.phase
        });
    }

    /**
     * Handle streamed text from Claude
     * @param {Object} response - Text stream message
     */
    function handleTextStream(response) {
        const requestContext = pendingRequests.get(response.requestId);
        if (!requestContext) {
            return;
        }

        // Broadcast text stream event to the live preview
        $(brackets).trigger("claudeCodeBridge.textStream", {
            requestId: response.requestId,
            text: response.text
        });
    }

    /**
     * Handle successful edit results from Claude
     * @param {Object} response - Edit result message
     */
    function handleEditResult(response) {
        const requestContext = pendingRequests.get(response.requestId);
        if (!requestContext) {
            console.warn("[ClaudeCodeBridge] Received result for unknown request:", response.requestId);
            return;
        }

        // Remove from pending requests
        pendingRequests.delete(response.requestId);

        if (!response.success) {
            console.error("[ClaudeCodeBridge] AI edit failed:", response.error);
            Dialogs.showModalDialog(
                DefaultDialogs.DIALOG_ID_ERROR,
                "AI Edit Failed",
                response.error || "An unknown error occurred while processing your request."
            );
            return;
        }

        if (!response.edits || response.edits.length === 0) {
            Dialogs.showModalDialog(
                DefaultDialogs.DIALOG_ID_INFO,
                "No Changes Needed",
                "Claude analyzed your request but determined no changes were needed."
            );
            return;
        }

        // Apply edits using EditApplicator
        EditApplicator.applyEdits(response.edits).then(function(result) {
            if (result.success) {
                // Try to get the new tagId at the original edit position
                // This helps the live preview update its reference after the document changes
                let newTagId = -1;
                if (requestContext.editor && requestContext.range) {
                    try {
                        // Small delay to let HTMLInstrumentation update its marks
                        setTimeout(function() {
                            newTagId = HTMLInstrumentation._getTagIDAtDocumentPos(
                                requestContext.editor,
                                requestContext.range.startPos
                            );
                            $(brackets).trigger("claudeCodeBridge.complete", {
                                requestId: response.requestId,
                                editCount: response.edits.length,
                                newTagId: newTagId
                            });
                        }, 100);
                    } catch (e) {
                        console.warn("[ClaudeCodeBridge] Could not get new tagId:", e);
                        $(brackets).trigger("claudeCodeBridge.complete", {
                            requestId: response.requestId,
                            editCount: response.edits.length
                        });
                    }
                } else {
                    $(brackets).trigger("claudeCodeBridge.complete", {
                        requestId: response.requestId,
                        editCount: response.edits.length
                    });
                }
            } else {
                console.error("[ClaudeCodeBridge] Failed to apply some edits:", result.errors);
                Dialogs.showModalDialog(
                    DefaultDialogs.DIALOG_ID_ERROR,
                    "Edit Application Error",
                    "Some edits could not be applied: " + result.errors.join(", ")
                );
            }
        }).catch(function(error) {
            console.error("[ClaudeCodeBridge] Error applying edits:", error);
            Dialogs.showModalDialog(
                DefaultDialogs.DIALOG_ID_ERROR,
                "Edit Application Error",
                "Failed to apply edits: " + error.message
            );
        });
    }

    /**
     * Handle errors from claudecodeui
     * @param {Object} response - Error message
     */
    function handleError(response) {
        const requestContext = pendingRequests.get(response.requestId);
        if (requestContext) {
            pendingRequests.delete(response.requestId);
        }

        console.error("[ClaudeCodeBridge] Error:", response.error);
        Dialogs.showModalDialog(
            DefaultDialogs.DIALOG_ID_ERROR,
            "AI Error",
            response.error || "An error occurred while communicating with Claude."
        );

        $(brackets).trigger("claudeCodeBridge.error", {
            requestId: response.requestId,
            error: response.error
        });
    }

    /**
     * Cancel a pending AI edit request
     * @param {string} requestId - Request ID to cancel
     */
    function cancelRequest(requestId) {
        if (!pendingRequests.has(requestId)) {
            return false;
        }

        pendingRequests.delete(requestId);

        if (connection && connection.isConnected()) {
            connection.send({
                type: 'phoenix-ai-cancel',
                requestId: requestId
            });
        }

        $(brackets).trigger("claudeCodeBridge.cancelled", {
            requestId: requestId
        });

        return true;
    }

    /**
     * Start a new session - reset conversation history on the server
     */
    function startNewSession() {
        if (connection && connection.isConnected()) {
            connection.send({
                type: 'phoenix-ai-new-session'
            });
            console.log('[ClaudeCodeBridge] New session started');
        }
    }

    /**
     * Destroy the current session - called when AI dialog is closed
     */
    function destroySession() {
        if (connection && connection.isConnected()) {
            connection.send({
                type: 'phoenix-ai-destroy-session'
            });
            console.log('[ClaudeCodeBridge] Session destroyed');
        }
    }

    /**
     * Check if the bridge is connected to claudecodeui
     * @returns {boolean} Connection status
     */
    function isConnected() {
        return connection && connection.isConnected();
    }

    /**
     * Get connection status details
     * @returns {Object} Status object with isConnected, url, pendingRequests
     */
    function getStatus() {
        return {
            isConnected: isConnected(),
            url: CLAUDECODEUI_WS_URL,
            pendingRequests: pendingRequests.size
        };
    }

    // Initialize on app ready
    AppInit.appReady(function() {
        init();

        // Register globally so LivePreviewEdit can access it
        brackets.ClaudeCodeBridge = {
            submitAIEditRequest: submitAIEditRequest,
            cancelRequest: cancelRequest,
            startNewSession: startNewSession,
            destroySession: destroySession,
            isConnected: isConnected,
            getStatus: getStatus
        };
    });

    // Export public API
    exports.init = init;
    exports.submitAIEditRequest = submitAIEditRequest;
    exports.cancelRequest = cancelRequest;
    exports.startNewSession = startNewSession;
    exports.destroySession = destroySession;
    exports.isConnected = isConnected;
    exports.getStatus = getStatus;
});
