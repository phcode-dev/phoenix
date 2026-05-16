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
 * MCP server factory for exposing Phoenix editor context to Claude Code.
 *
 * Provides three tools:
 *   - getEditorState: returns active file, working set, and live preview file
 *   - takeScreenshot: captures a screenshot of the Phoenix window as base64 PNG
 *   - execJsInLivePreview: executes JS in the live preview iframe
 *
 * Uses the Claude Code SDK's in-process MCP server support (createSdkMcpServer / tool).
 */

const path = require("path");
const fs = require("fs");
const { z } = require("zod");

// Absolute path to the bundled API reference, mirrored from
// docs/API-Reference/ at build time by build/api-docs-generator.js.
// Git-ignored — see root .gitignore. Surfaced to the AI via the
// editorDocs MCP tool so it can Read / Grep these directly.
const PHOENIX_API_DOCS_DIR = path.join(__dirname, "apiDocs");
const PHOENIX_FEATURE_DOCS_URL = "https://docs.phcode.dev/docs/intro";
const PHOENIX_API_DOCS_URL = "https://docs.phcode.dev/api/getting-started";
const PHOENIX_SOURCE_REPO_URL = "https://github.com/phcode-dev/phoenix";

const CLARIFICATION_HINT =
    "IMPORTANT: The user has typed a follow-up clarification while you were working." +
    " Call the getUserClarification tool to read it before proceeding.";

// Per-tool safety-net budgets for the browser round-trip. The node connector
// is reliable in practice, so these should never fire during normal use —
// they exist so a stalled promise chain (live preview wedged, etc.) surfaces
// a deterministic error to Claude instead of the handler hanging forever.
const EXEC_PEER_TIMEOUT_MS = {
    getEditorState: 5000,
    takeScreenshot: 15000,
    controlEditor: 5000,
    resizeLivePreview: 5000
};

// Floor for caller-provided timeouts (e.g. execJsInLivePreview's
// timeoutMs). 5s minimum stops the model from spamming impatient retries
// on a preview that's just taking a beat to settle. No ceiling — the
// model picks the upper bound based on the task (a user can legitimately
// ask for a long-running inspection).
const MIN_CALLER_TIMEOUT_MS = 5000;

function _execPeerWithTimeout(nodeConnector, fn, args, label, overrideMs) {
    const ms = overrideMs || EXEC_PEER_TIMEOUT_MS[fn];
    const call = nodeConnector.execPeer(fn, args);
    if (!ms) {
        return call; // no timeout configured for this tool
    }
    let timer;
    const timeout = new Promise(function (_resolve, reject) {
        timer = setTimeout(function () {
            reject(new Error(label + " timed out after " + ms + "ms"));
        }, ms);
    });
    return Promise.race([call, timeout]).finally(function () {
        clearTimeout(timer);
    });
}

/**
 * Clamp a caller-supplied timeoutMs into the allowed range. Returns a
 * sane default when missing/invalid.
 */
function _resolveCallerTimeout(timeoutMs, defaultMs) {
    if (typeof timeoutMs !== "number" || !isFinite(timeoutMs)) {
        return defaultMs;
    }
    return Math.max(MIN_CALLER_TIMEOUT_MS, timeoutMs);
}

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
 * Create an in-process MCP server exposing editor context tools.
 *
 * @param {Object} sdkModule - The imported @anthropic-ai/claude-code ESM module
 * @param {Object} nodeConnector - The NodeConnector instance for communicating with the browser
 * @param {Object} [clarificationAccessors] - Optional accessors for user clarification queue
 * @param {Function} clarificationAccessors.hasClarification - Returns true if a clarification is queued
 * @param {Function} clarificationAccessors.getAndClearClarification - Returns {text} and clears the queue
 * @returns {McpSdkServerConfigWithInstance} MCP server config ready for queryOptions.mcpServers
 */
function createEditorMcpServer(sdkModule, nodeConnector, clarificationAccessors) {
    const hasClarification = clarificationAccessors && clarificationAccessors.hasClarification;
    const getEditorStateTool = sdkModule.tool(
        "getEditorState",
        "Get the current Phoenix editor state: active file, working set (open files with isDirty flag), live preview file, " +
        "cursor/selection info (current line text with surrounding context, or selected text), " +
        "the currently selected element in the live preview (tag, selector, text preview) if any, " +
        "and inDesignMode (true when the code editor is hidden and the live preview is expanded " +
        "to fill the workspace — full-bleed, content-focused view). " +
        "The live preview selected element may differ from the editor cursor — use execJsInLivePreview to inspect it further. " +
        "Long lines are trimmed to 200 chars and selections to 10K chars — use the Read tool for full content.",
        {},
        async function () {
            let result;
            try {
                const state = await _execPeerWithTimeout(nodeConnector, "getEditorState", {}, "getEditorState");
                // Append a fallback hint so the model has a clear next step if the
                // state alone doesn't answer the user's question — e.g. they're
                // pointing at a UI panel (Problems, search, sidebar) that's
                // visible on screen but not represented in this JSON.
                const hint = "\n\nIf this state isn't enough to identify what the user is " +
                    "asking about (e.g. they're pointing at a Phoenix UI panel like the " +
                    "Problems panel, search bar, or sidebar that isn't represented here), " +
                    "call takeScreenshot with no selector to capture the full editor window " +
                    "and see what's on their screen.";
                result = {
                    content: [{ type: "text", text: JSON.stringify(state) + hint }]
                };
            } catch (err) {
                result = {
                    content: [{ type: "text", text: "Error getting editor state: " + err.message }],
                    isError: true
                };
            }
            return _maybeAppendHint(result, hasClarification);
        }
    );

    const takeScreenshotTool = sdkModule.tool(
        "takeScreenshot",
        "Take a screenshot of the Phoenix Code editor application window (or a region within it). " +
        "This captures the EDITOR APPLICATION, not the rendered web page on its own — the editor window " +
        "contains a toolbar at the top, a file tree sidebar on the left, the code editor area in the " +
        "center, and optionally a live preview panel on the right. The preview panel shows either an " +
        "HTML/CSS/JS browser view or a rendered markdown preview (when a markdown file is open, the " +
        "panel shows a WYSIWYG markdown editor/viewer). " +
        "Returns the screenshot as an inline PNG image; if filePath is specified, saves to that file " +
        "and returns the path instead. " +
        "Simple rule for the selector parameter:" +
        "\n- If the question is about the rendered live preview (\"how does it look\", \"is the page " +
        "rendering\", \"check the preview\", layout/styling/markdown verification): pass " +
        "selector='#panel-live-preview-frame'. The targeted shot is far easier to reason about than the " +
        "full editor." +
        "\n- For anything else — Problems panel, file tree, toolbar, search bar, any editor UI, or " +
        "\"what is the user looking at\" — omit the selector and capture the full editor window. " +
        "\n- You can also pass any CSS selector to capture just that DOM node — e.g. " +
        "'#problems-panel' to inspect inspector results, '.modal:visible' to inspect the active " +
        "dialog, '#sidebar' to inspect the file tree. Useful right after execJsInEditor mutates " +
        "the UI and you want to verify the change visually. " +
        "Note: live preview screenshots may include Phoenix toolbox overlays on selected elements. " +
        "Use purePreview=true to temporarily hide these overlays and render the page as it would appear in a real browser. " +
        "Use reload=true to force-reload the live preview before capturing — useful after editing JS, " +
        "and saves a tool call vs. calling controlEditor.reloadLivePreview separately.",
        {
            selector: z.string().optional().describe("CSS selector to capture a specific element. Use '#panel-live-preview-frame' for the preview panel (HTML live preview or markdown preview), '.editor-holder' for the code editor."),
            purePreview: z.boolean().optional().describe("When true, temporarily switches to preview mode to hide element highlight overlays and toolboxes before capturing, then restores the previous mode."),
            reload: z.boolean().optional().describe("When true, force-reloads the live preview before capturing. Use this instead of a separate reloadLivePreview call when you're about to screenshot anyway."),
            filePath: z.string().optional().describe("Absolute path to save the screenshot as a PNG file. If specified, returns the file path instead of inline image data.")
        },
        async function (args) {
            let toolResult;
            try {
                const result = await _execPeerWithTimeout(nodeConnector, "takeScreenshot", {
                    selector: args.selector || undefined,
                    purePreview: args.purePreview || false,
                    reload: args.reload || false,
                    filePath: args.filePath || undefined
                }, "takeScreenshot");
                if (result.filePath) {
                    toolResult = {
                        content: [{ type: "text", text: "Screenshot saved to: " + result.filePath }]
                    };
                } else if (result.base64) {
                    toolResult = {
                        content: [{ type: "image", data: result.base64, mimeType: "image/png" }]
                    };
                } else {
                    toolResult = {
                        content: [{ type: "text", text: result.error || "Screenshot failed" }],
                        isError: true
                    };
                }
            } catch (err) {
                toolResult = {
                    content: [{ type: "text", text: "Error taking screenshot: " + err.message }],
                    isError: true
                };
            }
            return _maybeAppendHint(toolResult, hasClarification);
        }
    );

    const execJsInLivePreviewTool = sdkModule.tool(
        "execJsInLivePreview",
        "Execute JavaScript in the live preview iframe (the page being previewed), NOT in Phoenix itself. " +
        "Auto-opens the live preview panel if it is not already visible. Code is evaluated via eval() in " +
        "the global scope of the previewed page. Note: eval() is synchronous — async/await is NOT supported. " +
        "Only available when an HTML file is selected in the live preview — does not work for markdown or " +
        "other non-HTML file types. Use this to inspect or manipulate the user's live-previewed web page " +
        "(e.g. document.title, DOM queries).\n\n" +
        "Pass timeoutMs to bound how long to wait if the live preview is wedged or slow to respond. " +
        "Defaults to 10000 (10s). Floored at 5000 (the preview frame may still be settling); no " +
        "upper limit — pick whatever fits the snippet you're running.",
        {
            code: z.string().describe("JavaScript code to execute in the live preview iframe"),
            timeoutMs: z.number().int().optional().describe(
                "Max wait in milliseconds before giving up on the live preview. " +
                "Floored at 5000, no upper limit. Default 10000."
            )
        },
        async function (args) {
            let toolResult;
            const timeoutMs = _resolveCallerTimeout(args.timeoutMs, 10000);
            try {
                const result = await _execPeerWithTimeout(nodeConnector, "execJsInLivePreview", {
                    code: args.code
                }, "execJsInLivePreview", timeoutMs);
                if (result.error) {
                    toolResult = {
                        content: [{ type: "text", text: "Error: " + result.error }],
                        isError: true
                    };
                } else {
                    toolResult = {
                        content: [{ type: "text", text: result.result || "undefined" }]
                    };
                }
            } catch (err) {
                toolResult = {
                    content: [{ type: "text", text: "Error executing JS in live preview: " + err.message }],
                    isError: true
                };
            }
            return _maybeAppendHint(toolResult, hasClarification);
        }
    );

    const controlEditorTool = sdkModule.tool(
        "controlEditor",
        "Control the Phoenix editor: open/close files, navigate to lines, and select text ranges. " +
        "Accepts an array of operations to batch multiple actions in one call. " +
        "All line and ch (column) parameters are 1-based.\n\n" +
        "Operations:\n" +
        "- open: Open a file in the active pane. Params: filePath\n" +
        "- close: Close a file (force, no save prompt). Params: filePath\n" +
        "- openInWorkingSet: Open a file and pin it to the working set. Params: filePath\n" +
        "- setSelection: Open a file and select a range. Params: filePath, startLine, startCh, endLine, endCh\n" +
        "- setCursorPos: Open a file and set cursor position. Params: filePath, line, ch\n" +
        "- toggleLivePreview: Show or hide the live preview panel. Params: showPreview (boolean)\n" +
        "- toggleDesignMode: Switch design mode on or off. Design mode hides the code editor and " +
        "expands the live preview to fill the workspace, giving the user a content-focused, " +
        "browser-like view of their page. Use it when the user wants to see how the page looks " +
        "without code chrome (e.g. presenting a draft, polishing visuals); turn it off when " +
        "switching back to code editing. Params: enabled (boolean — true for design mode on, " +
        "false to return to the code editor + side-by-side preview).\n" +
        "- reloadLivePreview: Force-reload the live preview iframe (and any popped-out preview tabs). " +
        "Use after editing JS that doesn't appear to have hot-reloaded. Note: if you're about to call " +
        "takeScreenshot anyway, prefer takeScreenshot({ reload: true }) — it reloads and captures in " +
        "one step. No params.",
        {
            operations: z.array(z.object({
                operation: z.enum(["open", "close", "openInWorkingSet", "setSelection", "setCursorPos", "toggleLivePreview", "toggleDesignMode", "reloadLivePreview"]),
                filePath: z.string().optional().describe("Absolute path to the file (not required for toggleLivePreview / toggleDesignMode / reloadLivePreview)"),
                startLine: z.number().optional().describe("Start line (1-based) for setSelection"),
                startCh: z.number().optional().describe("Start column (1-based) for setSelection"),
                endLine: z.number().optional().describe("End line (1-based) for setSelection"),
                endCh: z.number().optional().describe("End column (1-based) for setSelection"),
                line: z.number().optional().describe("Line number (1-based) for setCursorPos"),
                ch: z.number().optional().describe("Column (1-based) for setCursorPos"),
                showPreview: z.boolean().optional().describe("true to show, false to hide live preview (for toggleLivePreview)"),
                enabled: z.boolean().optional().describe("true to turn design mode on (full live preview, code editor hidden), false to return to code editor view (for toggleDesignMode)")
            })).describe("Array of editor operations to execute sequentially")
        },
        async function (args) {
            const results = [];
            let hasError = false;
            for (const op of args.operations) {
                console.log("[Phoenix AI] controlEditor:", op.operation, op.filePath);
                try {
                    const result = await _execPeerWithTimeout(nodeConnector, "controlEditor", op, "controlEditor:" + op.operation);
                    results.push(result);
                    if (!result.success) {
                        hasError = true;
                        console.warn("[Phoenix AI] controlEditor failed:", op.operation, op.filePath, result.error);
                    } else {
                        console.log("[Phoenix AI] controlEditor success:", op.operation, op.filePath);
                    }
                } catch (err) {
                    results.push({ success: false, error: err.message });
                    hasError = true;
                    console.error("[Phoenix AI] controlEditor error:", op.operation, op.filePath, err.message);
                }
            }
            const toolResult = {
                content: [{ type: "text", text: JSON.stringify(results) }],
                isError: hasError
            };
            return _maybeAppendHint(toolResult, hasClarification);
        }
    );

    const resizeLivePreviewTool = sdkModule.tool(
        "resizeLivePreview",
        "Resize the live preview panel to a specific width for responsive testing. " +
        "Provide a width in pixels based on the target device (e.g. 390 for a phone, 768 for a tablet, 1440 for desktop).",
        {
            width: z.number().describe("Target width in pixels")
        },
        async function (args) {
            let toolResult;
            try {
                const result = await _execPeerWithTimeout(nodeConnector, "resizeLivePreview", {
                    width: args.width
                }, "resizeLivePreview");
                if (result.error) {
                    toolResult = {
                        content: [{ type: "text", text: "Error: " + result.error }],
                        isError: true
                    };
                } else {
                    toolResult = {
                        content: [{ type: "text", text: JSON.stringify(result) }]
                    };
                }
            } catch (err) {
                toolResult = {
                    content: [{ type: "text", text: "Error resizing live preview: " + err.message }],
                    isError: true
                };
            }
            return _maybeAppendHint(toolResult, hasClarification);
        }
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
        }
    );

    const execJsInEditorTool = sdkModule.tool(
        "execJsInEditor",
        "Execute JavaScript in the Phoenix editor's OWN JS space (the parent window — NOT the live " +
        "preview iframe). Use execJsInLivePreview when you need to run code inside the page being " +
        "previewed; use this tool when you need to drive Phoenix itself: split panes, click dialog " +
        "buttons, dispatch arbitrary CommandManager commands, configure indentation, send synthetic " +
        "key events, etc. Same trust model as execJsInLivePreview — runs without a per-call prompt. " +
        "\n\n" +
        "The body is wrapped in `new AsyncFunction('__PR', 'KeyEvent', code)` so you can `await` " +
        "freely. `__PR` exposes:\n" +
        "- Modules: $, CommandManager, Commands, Dialogs, EditorManager, MainViewManager, " +
        "DocumentManager, WorkspaceManager, FileSystem, FileViewController, ProjectManager, " +
        "PreferencesManager. For anything else use `brackets.getModule(\"path/to/module\")`.\n" +
        "- __PR.EDITING.{splitVertical, splitHorizontal, splitNone, isSplit, getFirstPaneEditor, " +
        "getSecondPaneEditor, openFileInFirstPane(path,addToWS?), openFileInSecondPane(path,addToWS?), " +
        "focusFirstPane, focusSecondPane, setEditorSpacing(useTabs,count,isAuto)}\n" +
        "- __PR.awaitsFor(pollFn, msg?, timeoutMs?, pollInterval?) — poll until pollFn returns " +
        "truthy or timeout (rejects).\n" +
        "- __PR.waitForModalDialog(dialogClass?, name?, timeoutMs?) / waitForModalDialogClosed(...)\n" +
        "- __PR.clickDialogButtonID(buttonID, dialogClass?) / clickDialogButton(selector, dialogClass?)\n" +
        "- __PR.raiseKeyEvent(key, eventType?, element?, options?)\n" +
        "- __PR.execCommand(commandID, arg?) — wraps CommandManager.execute in a native Promise.\n" +
        "\n" +
        "Whatever value (or Promise that resolves) your code returns is JSON-stringified and " +
        "returned to you as `result`. If the return value isn't JSON-serializable you'll get a " +
        "string repr. Errors are caught and returned as `error` — your call won't crash.\n" +
        "\n" +
        "Before writing non-trivial JS that touches Phoenix internals, call the editorDocs tool to " +
        "find the local API reference path and Read / Grep the relevant module's .md file. " +
        "Guessing at Phoenix internals will waste a turn. If the API docs don't cover what you " +
        "need, the source is on GitHub at " + PHOENIX_SOURCE_REPO_URL + " — use the regular " +
        "WebFetch tool against the relevant raw file.\n" +
        "\n" +
        "After running, call takeScreenshot if you want to visually verify what changed — " +
        "pass no selector for the full editor, or pass a CSS selector (e.g. '#problems-panel', " +
        "'.modal:visible', '#sidebar') to capture just that DOM node. This is the easiest way " +
        "to confirm a UI mutation actually landed.\n" +
        "\n" +
        "Pass timeoutMs to bound how long to wait if the editor is wedged. Floored at 5000, no " +
        "upper limit. Default 10000.",
        {
            code: z.string().describe("JavaScript code to execute in the Phoenix editor's JS space"),
            timeoutMs: z.number().int().optional().describe(
                "Max wait in milliseconds before giving up. " +
                "Floored at 5000, no upper limit. Default 10000."
            )
        },
        async function (args) {
            let toolResult;
            const timeoutMs = _resolveCallerTimeout(args.timeoutMs, 10000);
            try {
                const result = await _execPeerWithTimeout(nodeConnector, "execJsInEditor", {
                    code: args.code
                }, "execJsInEditor", timeoutMs);
                if (result && result.error) {
                    toolResult = {
                        content: [{ type: "text", text: "Error: " + result.error }],
                        isError: true
                    };
                } else {
                    toolResult = {
                        content: [{ type: "text", text: (result && result.result) || "undefined" }]
                    };
                }
            } catch (err) {
                toolResult = {
                    content: [{ type: "text", text: "Error executing JS in editor: " + err.message }],
                    isError: true
                };
            }
            return _maybeAppendHint(toolResult, hasClarification);
        }
    );

    const editorPreferencesTool = sdkModule.tool(
        "editorPreferences",
        "Read and write Phoenix Code preferences. Three operations:\n" +
        "- list: Returns every registered preference (id, type, defaultValue, currentValue, " +
        "description, allowedValues if any, and the resolved scope of the current value).\n" +
        "- get: Same fields for a single preference id.\n" +
        "- set: Write a value into a specific scope. Calls PreferencesManager.save() after.\n\n" +
        "Scope hierarchy (highest precedence wins on read): session → project → user → default.\n" +
        "- default: built-in fallback declared by definePreference in source. READ-ONLY.\n" +
        "- user: the user's global settings (persisted across all projects). User-friendly name " +
        "when talking to the user: \"system-wide\" or \"globally\".\n" +
        "- project: per-project settings (persisted with the project, travels with the repo). " +
        "User-friendly name: \"for this project\" / \"in this repo\".\n" +
        "- session: in-memory only, lasts until Phoenix restarts. User-friendly name: \"just for " +
        "this session\". Useful for experimentation.\n\n" +
        "WHEN TALKING TO THE USER: never say the raw scope words user / project / session — say " +
        "\"system-wide\", \"for this project\", or \"just for this session\" instead. The raw " +
        "names are only for the tool's scope parameter.\n\n" +
        "PICKING THE RIGHT SCOPE: don't reflexively offer all three. Pick a sensible default " +
        "based on what the preference does:\n" +
        "  - System / app-level concerns (auto-update, telemetry, font, theme, the \"do you want " +
        "to install Node\" prompt): system-wide makes sense; project / session usually don't.\n" +
        "  - Code-style concerns (indent size, tabs vs spaces, word wrap, ruler): both " +
        "system-wide AND for-this-project are reasonable; default to for-this-project (the " +
        "convention travels with the repo). Mention system-wide only if the user implies it.\n" +
        "  - Experimentation / one-off (\"try this for now\"): just-this-session.\n" +
        "If you're not sure which scope fits, use the preference's description / id to judge, " +
        "and ask the user only when the call is genuinely unclear.\n\n" +
        "Only preferences registered via definePreference are enumerated by `list`. Raw values " +
        "in .phcode.json that were never defined won't appear.",
        {
            operation: z.enum(["list", "get", "set"]).describe("list / get / set"),
            id: z.string().optional().describe("Preference id (required for get and set, e.g. 'spaceUnits')"),
            value: z.any().optional().describe("New value (required for set)"),
            scope: z.enum(["user", "project", "session"]).optional().describe(
                "Required for set. Pick the scope that matches the preference's nature " +
                "(see tool description). user = system-wide / global; project = " +
                "per-project setting (persisted with the project); session = in-memory until " +
                "next restart."
            )
        },
        async function (args) {
            let toolResult;
            try {
                const result = await _execPeerWithTimeout(nodeConnector, "editorPreferences", {
                    operation: args.operation,
                    id: args.id,
                    value: args.value,
                    scope: args.scope
                }, "editorPreferences");
                if (result && result.error) {
                    toolResult = {
                        content: [{ type: "text", text: "Error: " + result.error }],
                        isError: true
                    };
                } else {
                    toolResult = {
                        content: [{ type: "text", text: JSON.stringify(result) }]
                    };
                }
            } catch (err) {
                toolResult = {
                    content: [{ type: "text", text: "Error in editorPreferences: " + err.message }],
                    isError: true
                };
            }
            return _maybeAppendHint(toolResult, hasClarification);
        }
    );

    const editorDocsTool = sdkModule.tool(
        "editorDocs",
        "Returns the locations of Phoenix Code's documentation. This tool DOES NOT fetch content " +
        "— it just hands you the absolute paths and URLs so you can read them with the standard " +
        "Read / Grep / WebFetch tools (which is far more flexible than a fixed-shape doc API).\n\n" +
        "The response includes:\n" +
        "- apiDocsPath: absolute filesystem path to the bundled API reference (Markdown files, " +
        "one per module). Read with the Read tool, or use Grep to find which module exposes a " +
        "given function. Version-matched to this Phoenix build.\n" +
        "- apiDocsAvailable: true if the directory exists; false if the build hasn't generated " +
        "them yet (rare — fall back to the apiDocsURL).\n" +
        "- apiDocsURL: live web copy of the API reference (latest version, may differ slightly " +
        "from the bundled docs).\n" +
        "- featureDocsURL: user-facing feature guides (\"how does Phoenix's X feature work\"). " +
        "Fetch with WebFetch.\n" +
        "- sourceRepoURL: GitHub repo for source-level lookups when the API docs don't cover " +
        "something. Use WebFetch on raw.githubusercontent.com URLs to read individual files.\n\n" +
        "Call this once near the start of any non-trivial editor-control task, then Read / " +
        "Grep / WebFetch into the surfaces it returns.",
        {},
        async function () {
            let apiDocsAvailable = false;
            try {
                apiDocsAvailable = fs.existsSync(PHOENIX_API_DOCS_DIR);
            } catch (e) { /* default false */ }
            const payload = {
                apiDocsPath: PHOENIX_API_DOCS_DIR,
                apiDocsAvailable: apiDocsAvailable,
                apiDocsURL: PHOENIX_API_DOCS_URL,
                featureDocsURL: PHOENIX_FEATURE_DOCS_URL,
                sourceRepoURL: PHOENIX_SOURCE_REPO_URL,
                hint: apiDocsAvailable
                    ? "Read or Grep apiDocsPath to find the module you need (e.g. " +
                      "Grep for the function name across the directory). Use WebFetch on " +
                      "featureDocsURL for user-facing feature guides."
                    : "Bundled API docs not present in this build. Use WebFetch on " +
                      "apiDocsURL for the live API reference and on featureDocsURL for feature " +
                      "guides."
            };
            const toolResult = {
                content: [{ type: "text", text: JSON.stringify(payload, null, 2) }]
            };
            return _maybeAppendHint(toolResult, hasClarification);
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
                    // Notify browser with the text so it can show it as a user message bubble
                    nodeConnector.triggerPeer("aiClarificationRead", {
                        text: result.text || ""
                    });
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
        }
    );

    return sdkModule.createSdkMcpServer({
        name: "phoenix-editor",
        tools: [getEditorStateTool, takeScreenshotTool, execJsInLivePreviewTool,
            execJsInEditorTool, editorPreferencesTool, editorDocsTool,
            controlEditorTool, resizeLivePreviewTool, waitTool, getUserClarificationTool]
    });
}

exports.createEditorMcpServer = createEditorMcpServer;
