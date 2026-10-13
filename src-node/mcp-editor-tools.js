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

/** In-process Agent SDK wrapper; clarification and chat-only tools stay here. */

const { z } = require("zod");
const {getEditorToolSpecs, execPeerWithTimeout: _execPeerWithTimeout} = require("./ai-editor-tool-specs");

const CLARIFICATION_HINT =
    "IMPORTANT: The user has typed a follow-up clarification while you were working." +
    " Call the getUserClarification tool to read it before proceeding.";

/**
 * Append a clarification hint to an MCP tool result if the user has queued a message.
 */
function _maybeAppendHint(result, hasClarification) {
    if (hasClarification && hasClarification()) {
        if (result && result.content && Array.isArray(result.content)) {
            result.content.push({ type: "text", text: CLARIFICATION_HINT });
        }
    }
    return result;
}

/**
 * Build the panel's MCP server from the shared tools plus panel-only context.
 * @param {Object} sdkModule Claude Agent SDK module.
 * @param {Object} nodeConnector Browser transport.
 * @param {Object} [clarificationAccessors] Panel follow-up queue accessors.
 * @return {Object} In-process MCP server configuration.
 */
function createEditorMcpServer(sdkModule, nodeConnector, clarificationAccessors) {
    const hasClarification = clarificationAccessors && clarificationAccessors.hasClarification;
    const tools = getEditorToolSpecs((fn, args) => nodeConnector.execPeer(fn, args)).map(spec =>
        sdkModule.tool(spec.name, spec.description, spec.inputSchema,
            async args => _maybeAppendHint(await spec.handler(args), hasClarification), {
                annotations: spec.annotations, alwaysLoad: spec.alwaysLoad, searchHint: spec.searchHint
            }));

    const getRenderedMdSelectionFollowUpTool = sdkModule.tool(
        "getRenderedMdSelectionFollowUp",
        "Use only to disambiguate a user-attached Markdown Live Preview selection when its supplied excerpts " +
        "are insufficient, including follow-up questions about that attachment. Requires the attachment's " +
        "selectionId; never invent an ID. This is not a general Markdown reader or a query of the current " +
        "preview. Returns logical rendered lines from " +
        "the original attachment snapshot with ⟦ and ⟧ marking the selected text. These are NOT source-file " +
        "lines or screen-wrapped lines. Use selectionId and renderedSelectionLines from the attachment. " +
        "Returns at most 50 lines and 12000 text characters; clipped lines include an ellipsis. " +
        "Snapshots may expire after reload or eviction; never substitute another selection if one expires.",
        {
            selectionId: z.string().describe("Copy selectionId from the user's Markdown selection attachment"),
            lineStart: z.number().int().min(1).describe("First logical rendered line, one-based inclusive"),
            lineEnd: z.number().int().min(1).describe("Last logical rendered line, one-based inclusive"),
            maxCharsClipPerLine: z.number().int().min(20).max(2000).optional()
                .describe("Maximum characters per rendered line; default 240. Increase to inspect clipped context.")
        },
        async function (args) {
            let result;
            try {
                const context = await _execPeerWithTimeout(nodeConnector, "getRenderedMdSelectionFollowUp", args,
                    "getRenderedMdSelectionFollowUp");
                result = {content: [{type: "text", text: JSON.stringify(context)}], isError: !!context.error};
            } catch (error) {
                result = {content: [{type: "text", text: error.message}], isError: true};
            }
            return _maybeAppendHint(result, hasClarification);
        },
        {annotations: {readOnlyHint: true},
            searchHint: "clarify a user-attached Markdown Live Preview selection snapshot using its selectionId"}
    );

    const previewImagesTool = sdkModule.tool(
        "previewImages",
        "Show actual image previews in the AI chat from an existing URL or list of URLs. Use this when saying " +
        "'here are the images' or presenting a shortlist, instead of only pasting links. Supports http://, https:// " +
        "and file:/// local image URLs, including mixed lists. Shows the same clickable preview and reply UI as " +
        "image search, without making a search or consuming search allowance. Returns a compact visual image to " +
        "you, or a numbered collage for 2–9 images matching each photo's number field. Set includePreview=false " +
        "if you already saw the images and only need to show them to the user. Missing previews are reported; " +
        "do not claim to have seen them. Local files are read through the desktop bridge without hosting them remotely. " +
        "Local files and native fallback downloads are limited to 8 MB each.",
        {
            urls: z.union([z.string().url(), z.array(z.string().url()).min(1).max(9)])
                .describe("One image URL or an ordered list of up to nine image URLs, including file:/// URLs"),
            title: z.string().max(200).optional().describe("Contextual title, e.g. Three hero image options"),
            includePreview: z.boolean().optional().describe("Return visual content to the AI too; default true")
        },
        async function (args) {
            try {
                const found = await _execPeerWithTimeout(nodeConnector, "previewImages", args, "previewImages");
                const metadata = Object.assign({}, found);
                delete metadata.collage;
                const content = [{type: "text", text: JSON.stringify(metadata)}];
                if (found.collage) {
                    content.push({type: "image", mimeType: "image/jpeg", data: found.collage.split(",")[1]});
                }
                return _maybeAppendHint({content: content, isError: !!found.error}, hasClarification);
            } catch (error) {
                return {content: [{type: "text", text: JSON.stringify({kind: "imagePreview",
                    query: args.title, photos: [], error: error.message})}], isError: true};
            }
        },
        {annotations: {readOnlyHint: true}, searchHint: "show display preview images photos pictures from URLs or local file paths, visual image collage shortlist"}
    );

    const waitTool = sdkModule.tool(
        "wait",
        "Wait for a specified number of seconds before continuing. " +
        "Useful for waiting after DOM changes, animations, live preview updates, or resize operations " +
        "before taking a screenshot or inspecting state. Maximum 60 seconds.",
        {
            seconds: z.number().min(0.1).max(60).describe("Number of seconds to wait (0.1–60)")
        },
        async function (args) {
            const ms = Math.round(args.seconds * 1000);
            await new Promise(function (resolve) { setTimeout(resolve, ms); });
            const toolResult = {
                content: [{ type: "text", text: "Waited " + args.seconds + " seconds." }]
            };
            return _maybeAppendHint(toolResult, hasClarification);
        },
        {
            annotations: { readOnlyHint: true },
            searchHint: "pause before re-checking the user's live preview browser"
        }
    );

    const getUserClarificationTool = sdkModule.tool(
        "getUserClarification",
        "Retrieve a follow-up clarification message the user typed while you were working. " +
        "Returns the clarification text and clears the queue. Only call this when a tool response " +
        "indicates the user has typed a clarification.",
        {},
        async function () {
            if (clarificationAccessors && clarificationAccessors.getAndClearClarification) {
                const result = await clarificationAccessors.getAndClearClarification();
                if (result && (result.text || (result.images && result.images.length > 0))) {
                    const content = [];
                    if (result.text) {
                        content.push({ type: "text", text: "User clarification: " + result.text });
                    }
                    if (result.images && result.images.length > 0) {
                        result.images.forEach(function (img) {
                            content.push({
                                type: "image",
                                data: img.base64Data,
                                mimeType: img.mediaType
                            });
                        });
                    }
                    return { content: content };
                }
            }
            return {
                content: [{ type: "text", text: "No clarification queued." }]
            };
        },
        {
            annotations: { readOnlyHint: true },
            searchHint: "read a follow-up the user typed into this conversation while you were still working"
        }
    );

    return sdkModule.createSdkMcpServer({
        name: "phoenix-editor",
        tools: tools.concat([getRenderedMdSelectionFollowUpTool, previewImagesTool, waitTool, getUserClarificationTool])
    });
}

/**
 * Extract only image-search metadata from a tool result for the matching UI card.
 * The collage remains in the model response; history and recordings store photo URLs.
 * @param {string|Array} content - SDK tool result content.
 * @return {Object|undefined} Search metadata, when present.
 */
function getImageSearchResult(content) {
    const blocks = typeof content === "string" ? [{type: "text", text: content}] : content;
    for (const block of blocks || []) {
        if (block.type !== "text") { continue; }
        try {
            const value = JSON.parse(block.text);
            if (["imageSearch", "imagePreview", "imageSelection"].includes(value.kind) && Array.isArray(value.photos)) {
                return value;
            }
        } catch (error) { /* Other text blocks can contain clarification hints. */ }
    }
    return undefined;
}

exports.createEditorMcpServer = createEditorMcpServer;
exports.getImageSearchResult = getImageSearchResult;
