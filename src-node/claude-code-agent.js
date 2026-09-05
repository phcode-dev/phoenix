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
 * Claude Code SDK integration via NodeConnector.
 *
 * Provides AI chat capabilities by bridging the Claude Code CLI/SDK
 * with Phoenix's browser-side chat panel. Handles streaming responses,
 * edit/write interception, and session management.
 */

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createEditorMcpServer } = require("./mcp-editor-tools");

const isWindows = process.platform === "win32";

const CONNECTOR_ID = "ph_ai_claude";

// The user's follow-up is addressed to the main agent, like a queued
// message in the Claude Code CLI. Hooks fire inside subagents too
// (input.agent_id is set there), and a subagent that reads the queue
// consumes it — the main agent then finds it empty and never sees what
// the user asked. Subagents also lack the conversation context to apply
// it sensibly. So they get neither the hint nor the tool; the main agent
// reads it as soon as it regains control.
function _clarificationHintFor(hookInput) {
    if (!_queuedClarification || (hookInput && hookInput.agent_id)) {
        return "";
    }
    return CLARIFICATION_HINT;
}

const CLARIFICATION_HINT =
    " IMPORTANT: The user has typed a follow-up clarification while you were working." +
    " Call the getUserClarification tool to read it before proceeding.";

// Nudge the model when it has edited files that render in the user's live
// preview without ever looking at the result. Deliberately phrased as an FYI
// the model may act on or ignore — whether a change is worth verifying, and
// with which tool, is its call.
//
// Stated as a count rather than "you just edited…" because the PostToolUse
// fallback path can deliver this a tool call after the edit, and because
// naming the number makes it read as a summary rather than a per-edit echo.
function _livePreviewHintText(count) {
    return "FYI: " + count + " file(s) you edited are rendered in the user's live preview," +
        " and you have not inspected it since. Decide for yourself whether looking is worth" +
        " a tool call here — a trivial or self-evident change usually is not. If it is, you" +
        " pick the tool: execJsInLivePreview to read the DOM / computed styles / console," +
        " takeScreenshot with selector='#panel-live-preview-frame' for a visual check, or" +
        " resizeLivePreview for responsive behavior.";
}

// Reason returned when a file-rewriting shell command is stopped on its first
// attempt. A speed bump, not a wall: re-running the identical command goes
// through (see _shellEditNeedsConfirm). That protects the first edit — which a
// note after the fact cannot, since by then undo is already gone — while
// leaving the final call with the model, at the cost of one extra round trip.
//
// Preferring Edit/Write is a default, not a rule. Shell rewrites genuinely win
// on mechanical bulk changes and on large files where Edit would burn tokens
// re-reading to change a little, so the text asks the model to weigh that
// against the lost undo rather than treating the shell as forbidden. One round
// trip is negligible next to the bulk operation it is gating.
function _shellEditDenyText(what) {
    return "Phoenix did not run that. It rewrites a file from the shell (" + what + "), which" +
        " bypasses the editor: the user's open buffer is not refreshed, no reviewable diff is" +
        " rendered, and the change cannot be undone from the AI panel's Undo button. For an" +
        " ordinary content change, use Edit for existing files or Write for new ones — those" +
        " keep all three. But this is a default, not a rule: if the shell is genuinely the" +
        " better tool here — the user named this command, the change is mechanical across many" +
        " files or matches, doing it with Edit would mean dozens of calls or reading a very" +
        " large file to change a little of it, or the target is generated / build output / a" +
        " log — then run it again unchanged and it will go through. Weigh the token cost" +
        " against the user losing undo for that file, and tell them which way you went.";
}

// Nudge on the first unverified live preview edit, then stay quiet until this
// many more pile up without the model ever looking at the preview.
const LP_NUDGE_REPEAT_AFTER = 5;

// Hard ceiling per user request. Without it a long unverified run (30 edits)
// would emit ~6 nudges, and every one persists in the transcript. If two
// haven't changed the model's behavior, a third won't either.
const LP_MAX_NUDGES_PER_REQUEST = 2;

// Calling any of these means the model is already looking at the preview, so
// there is nothing to nag about — seeing one resets the pending count.
const LP_INSPECT_TOOLS = [
    "mcp__phoenix-editor__takeScreenshot",
    "mcp__phoenix-editor__execJsInLivePreview",
    "mcp__phoenix-editor__resizeLivePreview"
];

// Lazy-loaded ESM module reference
let queryModule = null;

// Session state
let currentSessionId = null;

// Model list from the SDK's supportedModels() — fetched once per process,
// best-effort, from the first live query. null until available.
let cachedModelList = null;

/**
 * Fetch the model list from a live Query once per process. Best-effort:
 * the control request can fail on older CLIs or non-streaming input —
 * the browser keeps its static fallback list in that case.
 */
function _fetchModelListOnce(queryResult) {
    if (cachedModelList) {
        return;
    }
    queryResult.supportedModels().then(function (models) {
        if (models && models.length) {
            cachedModelList = models;
            nodeConnector.triggerPeer("aiModelList", { models: models });
        }
    }).catch(function () {});
}

// Active query state
let currentAbortController = null;

// Lazily-initialized in-process MCP server for editor context
let editorMcpServer = null;

// Streaming throttle
const TEXT_STREAM_THROTTLE_MS = 50;

// Pending browser answers (question, plan, toolConfirm, planModeConfirm
// cards), keyed by card kind and then by confirm id. The SDK runs
// PreToolUse hooks and permission prompts for parallel tool calls
// concurrently, so several cards can be up at once — a single resolver
// slot per kind kept only the last one, and clicking any earlier card did
// nothing. Each card carries its confirmId back in the answer; an answer
// without one resolves the oldest card of that kind.
const _pendingAnswers = {};
let _confirmSeq = 0;

// Stores the last plan content written to .claude/plans/
let _lastPlanContent = null;

// Queued clarification from the user (typed while AI is streaming)
// Shape: { text: string, images: [{mediaType, base64Data}] } or null
let _queuedClarification = null;

// Module-level "runtime" permission mode that hooks read at decision time.
// One of "plan" | "acceptEdits" | "auto" (SDK classifier-approved) |
// "bypassPermissions" (Allow Everything). Updated on every sendPrompt and
// via the setPermissionMode peer when the user cycles the panel's
// permission bar mid-stream — without this, the Bash hook would close over
// the value at query start and continue prompting for confirmation even
// after the user has flipped to Allow Everything. Defaults to "auto" to
// match the browser's default (see AIChatPanel.js's _permissionMode).
let _runtimePermissionMode = "auto";

const nodeConnector = global.createNodeConnector(CONNECTOR_ID, exports);

// Tools whose permission request in Plan Mode means "the model wants to
// start editing user files" — they share the plan-mode write-confirm card.
const FILE_WRITE_TOOLS = ["Edit", "Write", "MultiEdit", "NotebookEdit"];

// Handed to the model right after the user approves a plan. The CLI leaves
// plan mode on approval and the model carries on in the same turn, so this
// is where "proceed" gets spelled out for Phoenix.
const PLAN_APPROVED_HINT = "The user approved the plan. Proceed with the " +
    "implementation now, in this same turn. After building, verify by using " +
    "execJsInLivePreview to check the result and takeScreenshot to confirm it " +
    "looks correct.";

/**
 * Register a card that waits for a browser answer through one of the
 * answer* peers. Returns {id, promise}: send `id` to the browser as
 * confirmId, then await `promise`. It resolves with the browser's payload,
 * or null when the query is cancelled while the card is still up.
 */
function _registerAnswer(kind, signal) {
    const id = ++_confirmSeq;
    const bucket = _pendingAnswers[kind] || (_pendingAnswers[kind] = new Map());
    const promise = new Promise((resolve) => {
        if (signal.aborted) {
            resolve(null);
            return;
        }
        const onAbort = () => {
            bucket.delete(id);
            resolve(null);
        };
        bucket.set(id, (response) => {
            signal.removeEventListener("abort", onAbort);
            bucket.delete(id);
            resolve(response);
        });
        signal.addEventListener("abort", onAbort, { once: true });
    });
    return { id: id, promise: promise };
}

/**
 * Deliver a browser answer to the matching pending card (by confirmId, else
 * the oldest card of that kind). Returns false if nothing was waiting.
 */
function _resolveAnswer(kind, params) {
    const bucket = _pendingAnswers[kind];
    if (!bucket || !bucket.size) {
        return false;
    }
    let resolve;
    if (params && params.confirmId !== undefined) {
        resolve = bucket.get(params.confirmId);
    }
    if (!resolve) {
        resolve = bucket.values().next().value;
    }
    resolve(params || {});
    return true;
}

function _clearPendingAnswers() {
    Object.keys(_pendingAnswers).forEach((kind) => _pendingAnswers[kind].clear());
}

/**
 * Ask the user to allow or deny a tool call (the Allow/Deny card). Used by
 * the Edit Mode Bash hook and for every permission request the CLI hands to
 * canUseTool that no more specific card covers. Resolves true on Allow,
 * false on Deny or when the query is aborted while the card is up.
 */
async function _askToolConfirm(requestId, toolName, toolInput, signal) {
    const pending = _registerAnswer("toolConfirm", signal);
    nodeConnector.triggerPeer("aiBashConfirm", {
        requestId: requestId,
        confirmId: pending.id,
        toolName: toolName,
        command: toolName === "Bash" ? ((toolInput && toolInput.command) || "") : "",
        toolInput: toolInput || {}
    });
    const response = await pending.promise;
    return !!(response && response.allowed);
}

/**
 * Ask the user (via the browser's plan-mode write-confirm card) whether an
 * Edit/Write on a user file may go through while the panel is in Plan Mode.
 * Resolves true for "Allow & Switch to Auto", false for "Stay in Plan
 * Mode" or when the query is aborted while the card is up.
 */
async function _askPlanModeWriteConfirm(requestId, toolName, filePath, signal) {
    const pending = _registerAnswer("planModeConfirm", signal);
    nodeConnector.triggerPeer("aiPlanModeWriteConfirm", {
        requestId: requestId,
        confirmId: pending.id,
        toolName: toolName,
        filePath: filePath
    });
    const response = await pending.promise;
    return !!(response && response.approved);
}

/**
 * Show the AskUserQuestion card in the browser and wait for the answers.
 * Resolves the browser's {answers} payload, or null on abort.
 */
async function _askUserQuestions(requestId, questions, signal) {
    const pending = _registerAnswer("question", signal);
    nodeConnector.triggerPeer("aiQuestion", {
        requestId: requestId,
        confirmId: pending.id,
        questions: questions
    });
    return pending.promise;
}

/**
 * Format AskUserQuestion answers as readable text for the model.
 */
function _formatAnswers(answer) {
    let answerText = "";
    if (answer && answer.answers) {
        Object.keys(answer.answers).forEach(function (q) {
            answerText += "Q: " + q + "\nA: " + answer.answers[q] + "\n\n";
        });
    }
    return answerText.trim();
}

/**
 * Detect whether a PostToolUse `tool_response` represents an error result.
 * Used to suppress diff-card painting when the SDK's native Edit/Write itself
 * failed (e.g. oldText not found on disk). The shape of tool_response is
 * `unknown` per the SDK types — handle the common variants defensively.
 */
function _isToolResponseError(toolResponse) {
    if (!toolResponse) { return false; }
    if (typeof toolResponse === "object") {
        if (toolResponse.is_error === true || toolResponse.isError === true) { return true; }
        if (Array.isArray(toolResponse.content)) {
            for (const c of toolResponse.content) {
                if (c && typeof c.text === "string" && /<tool_use_error>/i.test(c.text)) {
                    return true;
                }
            }
        }
    }
    if (typeof toolResponse === "string" && /<tool_use_error>/i.test(toolResponse)) {
        return true;
    }
    return false;
}

// Bash commands the agent can run without prompting the user in Edit
// Mode. Mirrors the CLI's default "permissions.allow" set
// (cli.js:2925) plus a small handful of universally read-only shell
// utilities. The safety belt in _isSafeReadOnlyBash splits on
// `;` / `&&` / `||` and checks every segment, so chaining safe
// commands (e.g. `git status && git log`, `sleep 1; echo done`)
// works while `git status; rm -rf /` correctly falls through.
const _SAFE_BASH_PATTERNS = [
    // git read-only
    /^git\s+status(\s|$)/,
    /^git\s+log(\s|$)/,
    /^git\s+diff(\s|$)/,
    /^git\s+show(\s|$)/,
    /^git\s+branch(\s|$)/,
    /^git\s+ls-files(\s|$)/,
    /^git\s+rev-parse(\s|$)/,
    /^git\s+remote\s+show(\s|$)/,
    /^git\s+--version$/,
    // generic read-only shell
    /^ls(\s|$)/,
    /^pwd$/,
    /^echo(\s|$)/,
    /^which\s/,
    /^cat(\s|$)/,
    /^head(\s|$)/,
    /^tail(\s|$)/,
    /^wc(\s|$)/,
    /^file\s/,
    /^stat\s/,
    // numeric-only sleep — no `sleep $(...)` since process substitution
    // is rejected separately, but be explicit so `sleep $VAR` also fails.
    /^sleep\s+\d+(\.\d+)?$/,
    // version probes
    /^node\s+--version$/,
    /^npm\s+--version$/,
    /^yarn\s+--version$/,
    /^pnpm\s+--version$/
];

// Shell constructs whose purpose is rewriting a file in place. Bash is not
// interchangeable with Edit/Write here: the Edit/Write PostToolUse hooks
// refresh the open buffer, paint the diff card that backs the panel's Undo
// button, and carry the live preview signal. A shell rewrite skips all
// three, so the user silently loses undo for that change.
//
// A match stops the command once and offers a retry (see _shellEditDenyText),
// so the cost of a false positive is one wasted round trip rather than a
// refusal. Still worth keeping narrow: only constructs that exist to rewrite
// files belong here.
const _INPLACE_EDIT_PATTERNS = [
    // sed -i / -i.bak / -ri / --in-place. The lookahead stops at a pipe or
    // separator so `grep -i x | sed 's/a/b/'` isn't caught by the grep flag.
    { rx: /\bsed\b(?=[^|;&]*\s-(?:-in-place|[a-zA-Z]*i))/, what: "sed -i" },
    // perl -pi -e / perl -i.bak
    { rx: /\bperl\b(?=[^|;&]*\s-[a-zA-Z]*i)/, what: "perl -i" },
    { rx: /\bawk\b(?=[^|;&]*\s-i\s+inplace)/, what: "awk -i inplace" },
    { rx: /\bed\s+-s\b/, what: "ed -s" },
    { rx: /\bex\s+-s(c|\s)/, what: "ex -s" },
    // PowerShell equivalents — on Windows the model may reach for these
    // instead of sed. Set-Content/Add-Content/Out-File all rewrite a file.
    { rx: /\b(?:Set-Content|Add-Content|Out-File)\b/i, what: "PowerShell Set-Content / Out-File" }
];

// Redirection / tee targets that aren't the user's files: device sinks and
// scratch dirs. `> /dev/null` and `> $TMPDIR/x` are ubiquitous and carry no
// undo cost, so hinting about them would be pure noise.
//
// Covers all three platforms, since the model may be driving bash, PowerShell
// or cmd depending on where Phoenix is running: macOS puts TMPDIR under
// /var/folders, Windows under %TEMP% / AppData\Local\Temp, and the null sink
// is /dev/null, NUL or $null respectively.
const _EXEMPT_WRITE_TARGETS = [
    /^\/dev\//,
    /^\/proc\//,
    /^\/(?:private\/)?tmp\//,
    /^\/var\/(?:tmp|folders)\//,
    /^(?:nul|\$null)$/i,
    /^\$\{?TMPDIR\}?[\\/]/i,
    /^%(?:TEMP|TMP)%[\\/]/i,
    /^[a-zA-Z]:[\\/](?:temp|tmp)[\\/]/i,
    // Git Bash rewrites C:\Temp to MSYS form (/c/temp), and it is the shell
    // the Bash tool actually uses on Windows.
    /^\/[a-zA-Z]\/(?:temp|tmp)\//i,
    /[\\/]AppData[\\/]Local[\\/]Temp[\\/]/i,
    /^[a-zA-Z]:[\\/]Windows[\\/]Temp[\\/]/i
];

function _isExemptWriteTarget(target) {
    if (target === "-") { return true; }
    return _EXEMPT_WRITE_TARGETS.some(function (rx) { return rx.test(target); });
}

// Walk the command tracking quote state so a `>` inside a string literal
// (`echo "a > b"`, `python -c "print(1 > 0)"`) is not mistaken for a
// redirection. Returns the write destinations found outside quotes.
// A heuristic guard, not a shell parser.
function _shellWriteTargets(rawCmd) {
    // Drop file-descriptor duplications (2>&1, >&2, 1>&2) up front.
    const cmd = (rawCmd || "").replace(/\d*>&\d*/g, " ");
    const targets = [];
    let quote = null;
    for (let i = 0; i < cmd.length; i++) {
        const ch = cmd[i];
        if (quote) {
            if (ch === quote && cmd[i - 1] !== "\\") { quote = null; }
            continue;
        }
        if (ch === "\"" || ch === "'") { quote = ch; continue; }
        if (ch !== ">") { continue; }
        // Skip the rest of a `>>` pair, then the whitespace before the target.
        let j = i + 1;
        while (cmd[j] === ">") { j++; }
        while (cmd[j] === " " || cmd[j] === "\t") { j++; }
        // Read the target, honouring quotes around a path with spaces.
        let target = "";
        if (cmd[j] === "\"" || cmd[j] === "'") {
            const closer = cmd[j];
            j++;
            while (j < cmd.length && cmd[j] !== closer) { target += cmd[j++]; }
        } else {
            while (j < cmd.length && !/[\s;|&()]/.test(cmd[j])) { target += cmd[j++]; }
        }
        if (target) { targets.push(target); }
        i = j - 1;
    }
    // tee writes to its path arguments rather than via redirection.
    const tee = /\btee\s+(?:-a\s+)?("[^"]*"|'[^']*'|[^\s;|&()-][^\s;|&()]*)/g;
    let m;
    while ((m = tee.exec(cmd)) !== null) {
        targets.push(m[1].replace(/^["']|["']$/g, ""));
    }
    return targets.filter(function (t) { return t && !_isExemptWriteTarget(t); });
}

/**
 * Classify a Bash command that would rewrite file content instead of going
 * through Edit/Write. Returns a short description of what was matched, or
 * null when the command is fine to run.
 */
function _describeInPlaceFileEdit(rawCmd) {
    const cmd = (rawCmd || "").trim();
    if (!cmd) { return null; }
    for (const entry of _INPLACE_EDIT_PATTERNS) {
        if (entry.rx.test(cmd)) { return entry.what; }
    }
    const targets = _shellWriteTargets(cmd);
    if (targets.length) {
        return "shell redirection to " + targets[0];
    }
    return null;
}

function _isSafeReadOnlyBash(rawCmd) {
    const cmd = (rawCmd || "").trim();
    if (!cmd) { return false; }
    // Reject command/process substitution, redirection, and pipes —
    // these can hide arbitrary commands or send output to dangerous
    // places. Backticks, `$(...)`, `<`, `>`, `|`. Plain `$VAR` is
    // allowed (substitution-without-command).
    if (/[`<>|]|\$\(/.test(cmd)) { return false; }
    // Split on `;`, `&&`, `||` and verify EVERY segment matches a safe
    // pattern. Quotes around delimiters are not handled — a command
    // like `echo "a; b"` will split mid-string and fail safe-check
    // (which is fine: false negatives are OK, false positives are not).
    const segments = cmd.split(/\s*(?:;|&&|\|\|)\s*/).filter(Boolean);
    return segments.every(function (seg) {
        return _SAFE_BASH_PATTERNS.some(function (rx) { return rx.test(seg); });
    });
}

/**
 * Lazily import the ESM Claude Agent SDK module.
 */
async function getQueryFn() {
    if (!queryModule) {
        // The JS SDK was split out of @anthropic-ai/claude-code in v2 and
        // moved to @anthropic-ai/claude-agent-sdk. The CLI binary still
        // ships under @anthropic-ai/claude-code (used by Phoenix's
        // terminal "claude" command); the SDK now lives in its own
        // package with the same query() signature and SDKResultMessage
        // shape, so the rest of this file is unchanged.
        queryModule = await import("@anthropic-ai/claude-agent-sdk");
    }
    return queryModule.query;
}

/**
 * Build ordered candidate paths on Windows, split into two tiers:
 *   - `native`: real PE binaries dropped by claude.ai/install.ps1 or the
 *     desktop installer. No node/cli.js shim chain to break, so file
 *     existence is enough confidence — we skip the `--version` validation.
 *   - `fallback`: PATH discovery via `where`, npm shim. Broken installs
 *     are common here (orphan `.cmd` whose cli.js got deleted, extensionless
 *     POSIX scripts Windows can't execute), so every candidate is verified
 *     with `claude --version` before we return it.
 */
function _winClaudeCandidates() {
    const userHome = process.env.USERPROFILE || process.env.HOME || "";
    const native = [
        path.join(userHome, ".local", "bin", "claude.exe"),
        path.join(process.env.LOCALAPPDATA || "", "Programs", "claude", "claude.exe")
    ];
    const fallback = [];

    // PATH discovery — filter to executable extensions (drop extensionless
    // POSIX scripts and .ps1, both of which our spawn path can't use),
    // and prefer .exe over .cmd/.bat shims when both resolve.
    try {
        const allPaths = execSync("where claude", { encoding: "utf8" })
            .trim()
            .split("\r\n")
            .filter(p => p && !p.includes("node_modules") && /\.(exe|cmd|bat)$/i.test(p));
        const exes = allPaths.filter(p => /\.exe$/i.test(p));
        const others = allPaths.filter(p => !/\.exe$/i.test(p));
        fallback.push(...exes, ...others);
    } catch { /* where not on PATH or returned nothing */ }

    // Explicit npm shim in case `where` wasn't reachable.
    fallback.push(path.join(process.env.APPDATA || "", "npm", "claude.cmd"));

    return { native, fallback };
}

/**
 * Build candidate nvm-installed claude paths. The previously hardcoded
 * `process.version` was the Node that Phoenix ships, not the Node the user
 * has selected in nvm — which mismatched in practice for ~every nvm user.
 *
 * Strategy: prefer the version named in `~/.nvm/alias/default` (or whatever
 * `$NVM_DIR` points at). Fall back to enumerating installed versions, newest
 * first, so we still find claude when the default alias is a label like
 * `lts/*` or `node` that we don't expand here.
 */
function _nvmClaudeCandidates(home) {
    const nvmRoot = process.env.NVM_DIR || path.join(home, ".nvm");
    const versionsDir = path.join(nvmRoot, "versions", "node");
    const candidates = [];
    try {
        const aliasFile = path.join(nvmRoot, "alias", "default");
        if (fs.existsSync(aliasFile)) {
            const alias = fs.readFileSync(aliasFile, "utf8").trim();
            if (/^v?\d/.test(alias)) {
                const v = alias.startsWith("v") ? alias : "v" + alias;
                candidates.push(path.join(versionsDir, v, "bin", "claude"));
            }
        }
    } catch { /* nvm not installed or unreadable */ }
    try {
        if (fs.existsSync(versionsDir)) {
            const versions = fs.readdirSync(versionsDir)
                .filter(v => /^v\d/.test(v))
                .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
            for (const v of versions) {
                candidates.push(path.join(versionsDir, v, "bin", "claude"));
            }
        }
    } catch { /* ignore */ }
    return candidates;
}

/**
 * Build ordered candidate paths on macOS/Linux. See _winClaudeCandidates for
 * the native/fallback rationale.
 */
function _posixClaudeCandidates() {
    const home = process.env.HOME || "";
    const native = [
        path.join(home, ".local", "bin", "claude")        // claude.ai/install.sh default
    ];
    const fallback = [];

    // PATH discovery. Matters most on macOS when Phoenix is launched from
    // Finder/Dock — that PATH is the minimal `/usr/bin:/bin:/usr/sbin:/sbin`,
    // so `which` may miss user-managed dirs and the known locations below
    // are what saves us.
    try {
        const allPaths = execSync("which -a claude 2>/dev/null || which claude", { encoding: "utf8" })
            .trim()
            .split("\n")
            .filter(p => p && !p.includes("node_modules"));
        fallback.push(...allPaths);
    } catch { /* which not available */ }

    fallback.push(
        "/usr/local/bin/claude",                           // System-wide / Intel Mac Homebrew
        "/usr/bin/claude",                                 // Distro package
        ..._nvmClaudeCandidates(home),                     // npm global via nvm
        "/opt/homebrew/bin/claude",                        // Homebrew on Apple Silicon
        "/home/linuxbrew/.linuxbrew/bin/claude"            // Linuxbrew
    );

    return { native, fallback };
}

/**
 * Existence + executability check. On Windows executability is derived from
 * extension/PATHEXT not a file attribute, so existsSync is the right test;
 * on posix we want the +x bit.
 */
function _canAccess(p) {
    if (!p) { return false; }
    try {
        if (isWindows) {
            return fs.existsSync(p);
        }
        fs.accessSync(p, fs.constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * Spawn claude with argv and resolve to { stdout, stderr, status, error }.
 * Async so callers don't block the event loop while claude runs — `auth
 * status` can take up to 10 s, `--version` up to 3 s, and the integrated
 * terminal and file watchers share this Node process.
 *
 * For .exe/posix binaries: shell-less spawn, paths-with-spaces and special
 * chars pass through verbatim. For Windows .cmd/.bat shims: shell:true
 * (Node refuses to spawn batch files without it per CVE-2024-27980
 * hardening) plus manual command-name quoting (Node intentionally does NOT
 * escape the command name under shell:true).
 *
 * Mimics the spawnSync result shape so callers read .status/.error/.stdout
 * unchanged. `opts.timeout` (ms) kills the process with SIGKILL on expiry
 * and surfaces an Error with message "timeout".
 */
function _spawnClaude(claudePath, args, opts) {
    return new Promise(function (resolve) {
        const isCmdShim = isWindows && /\.(cmd|bat)$/i.test(claudePath);
        const spawnCmd = isCmdShim ? `"${claudePath}"` : claudePath;
        const spawnOpts = isCmdShim ? Object.assign({ shell: true }, opts) : opts;
        const encoding = (opts && opts.encoding) || "utf8";
        const timeoutMs = (opts && opts.timeout) || 0;
        let child;
        try {
            child = spawn(spawnCmd, args, spawnOpts);
        } catch (err) {
            resolve({ stdout: "", stderr: "", status: null, error: err });
            return;
        }
        let stdout = "";
        let stderr = "";
        let settled = false;
        let timer = null;
        function finish(result) {
            if (settled) { return; }
            settled = true;
            if (timer) { clearTimeout(timer); }
            resolve(result);
        }
        if (child.stdout) {
            child.stdout.setEncoding(encoding);
            child.stdout.on("data", function (chunk) { stdout += chunk; });
        }
        if (child.stderr) {
            child.stderr.setEncoding(encoding);
            child.stderr.on("data", function (chunk) { stderr += chunk; });
        }
        child.on("error", function (err) {
            finish({ stdout, stderr, status: null, error: err });
        });
        child.on("close", function (code) {
            finish({ stdout, stderr, status: code, error: null });
        });
        if (timeoutMs > 0) {
            timer = setTimeout(function () {
                try { child.kill("SIGKILL"); } catch { /* already exited */ }
                finish({ stdout, stderr, status: null, error: new Error("timeout") });
            }, timeoutMs);
        }
    });
}

/**
 * Validate that a fallback candidate actually runs. Catches broken installs
 * the existence check misses — e.g. an npm `.cmd` shim whose referenced
 * cli.js was deleted by a half-completed uninstall. `claude --version` is
 * fast (~200 ms healthy) and outputs a version string starting with a digit.
 */
async function _validateClaudeBinary(claudePath) {
    try {
        const result = await _spawnClaude(claudePath, ["--version"], {
            encoding: "utf8",
            timeout: 3000
        });
        return !result.error && result.status === 0 && /^\d/.test((result.stdout || "").trim());
    } catch {
        return false;
    }
}

// undefined = not yet probed; null = probed, nothing works; string = resolved path
let _cachedClaudePath;
let _cachedAt = 0;
// In-flight discovery promise so concurrent callers share one walk of the
// fallback chain instead of each spawning their own --version probes.
let _inFlightDiscovery = null;
// Negative results expire so a fresh `claude` install completes during a
// session can be detected on the next checkAvailability (the install-poll
// flow depends on this). Positive results are cached indefinitely — the
// self-heal in checkAvailability handles the mid-session-uninstall case
// by passing { force: true } when a cached path stops spawning.
const NULL_CACHE_TTL_MS = 15000;

function _setCache(p) {
    _cachedClaudePath = p;
    _cachedAt = Date.now();
    return p;
}

/**
 * Resolve the user's globally installed Claude CLI. Walks a fallback chain:
 * native candidates first (existence is enough), then PATH/known-location
 * candidates, each validated by spawning `--version` so broken shims get
 * skipped instead of returned. Pass `{ force: true }` to invalidate the
 * cache after a runtime spawn failure.
 */
function findGlobalClaudeCli(opts) {
    const force = !!(opts && opts.force);
    if (!force && _cachedClaudePath !== undefined) {
        const fresh = _cachedClaudePath !== null
            || (Date.now() - _cachedAt) < NULL_CACHE_TTL_MS;
        if (fresh) {
            return Promise.resolve(_cachedClaudePath);
        }
    }
    if (!force && _inFlightDiscovery) {
        return _inFlightDiscovery;
    }
    const discovery = (async function () {
        const { native, fallback } = isWindows ? _winClaudeCandidates() : _posixClaudeCandidates();
        for (const p of native) {
            if (_canAccess(p)) {
                console.log("[Phoenix AI] Found native Claude CLI at:", p);
                return _setCache(p);
            }
        }
        for (const p of fallback) {
            if (_canAccess(p) && await _validateClaudeBinary(p)) {
                console.log("[Phoenix AI] Validated Claude CLI at:", p);
                return _setCache(p);
            }
        }
        console.log("[Phoenix AI] Global Claude CLI not found");
        return _setCache(null);
    })();
    if (!force) {
        _inFlightDiscovery = discovery;
        discovery.finally(function () {
            if (_inFlightDiscovery === discovery) {
                _inFlightDiscovery = null;
            }
        });
    }
    return discovery;
}

/**
 * Check whether Claude CLI is available.
 * Called from browser via execPeer("checkAvailability").
 */
exports.checkAvailability = async function (opts) {
    try {
        // Poll loops (install/login screens) pass { refresh: true } because
        // they're explicitly waiting on state changes — the cached null
        // would otherwise make detection lag by up to NULL_CACHE_TTL_MS.
        const refresh = !!(opts && opts.refresh);
        let claudePath = await findGlobalClaudeCli(refresh ? { force: true } : undefined);
        if (!claudePath) {
            return { available: false, claudePath: null, error: "Claude Code CLI not found" };
        }
        // Check if user is logged in
        let loggedIn = false;
        let result;
        try {
            result = await _spawnClaude(claudePath, ["auth", "status"], {
                encoding: "utf8",
                timeout: 10000
            });
            // Spawn-level failure (ENOENT/EACCES — e.g. user uninstalled
            // mid-session) means the cached binary is unusable. Invalidate
            // and re-discover once. Distinct from "binary ran but exited
            // non-zero", which we still treat as "not logged in".
            if (result.error && result.status === null) {
                claudePath = await findGlobalClaudeCli({ force: true });
                if (!claudePath) {
                    return { available: false, claudePath: null, error: "Claude Code CLI not found" };
                }
                result = await _spawnClaude(claudePath, ["auth", "status"], {
                    encoding: "utf8",
                    timeout: 10000
                });
            }
            if (result.status === 0 && result.stdout) {
                const authStatus = JSON.parse(result.stdout);
                loggedIn = authStatus.loggedIn === true;
            }
        } catch (e) {
            // auth status failed — treat as not logged in
        }
        return { available: true, claudePath: claudePath, loggedIn: loggedIn };
    } catch (err) {
        return { available: false, claudePath: null, error: err.message };
    }
};

/**
 * Send a prompt to Claude and stream results back to the browser.
 * Called from browser via execPeer("sendPrompt", {prompt, projectPath, sessionAction, model}).
 *
 * Returns immediately with a requestId. Results are sent as events:
 *   aiProgress, aiTextStream, aiToolEdit, aiError, aiComplete
 */
exports.sendPrompt = async function (params) {
    const { prompt, projectPath, sessionAction, model, locale, selectionContext, images, envOverrides, permissionMode, additionalDirectories } = params;
    const requestId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    // Handle session
    if (sessionAction === "new") {
        currentSessionId = null;
    }

    // Clear any stale clarification from a previous turn
    _queuedClarification = null;

    // Cancel any in-flight query
    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
    }

    currentAbortController = new AbortController();

    // Prepend selection context to the prompt if available
    let enrichedPrompt = prompt;
    if (selectionContext) {
        if (selectionContext.selectedText) {
            enrichedPrompt =
                "The user has selected the following text in " + selectionContext.filePath +
                " (lines " + selectionContext.startLine + "-" + selectionContext.endLine + "):\n" +
                "```\n" + selectionContext.selectedText + "\n```\n\n" + prompt;
        } else {
            let previewSnippet = "";
            if (selectionContext.selectionPreview) {
                previewSnippet = "\nPreview of selection:\n```\n" +
                    selectionContext.selectionPreview + "\n```\n";
            }
            enrichedPrompt =
                "The user has selected lines " + selectionContext.startLine + "-" +
                selectionContext.endLine + " in " + selectionContext.filePath +
                ". Use the Read tool with offset=" + (selectionContext.startLine - 1) +
                " and limit=" + (selectionContext.endLine - selectionContext.startLine + 1) +
                " to read the selected content if needed." + previewSnippet + "\n" + prompt;
        }
    }

    // Run the query asynchronously — don't await here so we return requestId immediately
    _runQuery(requestId, enrichedPrompt, projectPath, model, currentAbortController.signal, locale, images, envOverrides, permissionMode, additionalDirectories)
        .catch(err => {
            console.error("[Phoenix AI] Query error:", err);
        });

    return { requestId: requestId };
};

/**
 * Cancel the current in-flight query.
 */
exports.cancelQuery = async function () {
    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
        // Keep currentSessionId so the next prompt resumes the same SDK session.
        // Aborts leave an interrupt marker in the session log, not a corrupted state.
        // Drop any cards still waiting for an answer
        _clearPendingAnswers();
        _queuedClarification = null;
        return { success: true };
    }
    return { success: false };
};

/**
 * Receive the user's answer to an AskUserQuestion prompt.
 * Called from browser via execPeer("answerQuestion", {answers}).
 */
exports.answerQuestion = async function (params) {
    _resolveAnswer("question", params);
    return { success: true };
};

/**
 * Receive the user's response to a proposed plan.
 * Called from browser via execPeer("answerPlan", {approved, feedback}).
 */
exports.answerPlan = async function (params) {
    _resolveAnswer("plan", params);
    return { success: true };
};

/**
 * Receive the user's response to a bash confirmation prompt (Edit Mode).
 * Called from browser via execPeer("answerBashConfirm", {allowed}).
 */
exports.answerBashConfirm = async function (params) {
    _resolveAnswer("toolConfirm", params);
    return { success: true };
};

/**
 * Receive the user's response to a plan-mode write confirmation prompt.
 * Called from browser via execPeer("answerPlanModeWriteConfirm", {approved}).
 */
exports.answerPlanModeWriteConfirm = async function (params) {
    _resolveAnswer("planModeConfirm", params);
    return { success: true };
};

/**
 * Apply a mid-stream permission-mode change so hooks running for the rest
 * of the turn use the new value. Called from the browser when the user
 * cycles the permission bar (so e.g. Bash stops prompting immediately
 * after switching from Edit Mode to Allow Everything). The next sendPrompt also
 * passes permissionMode in params, so this peer is only strictly required
 * during streaming — but calling it on every cycle keeps the agent's
 * tracker authoritative.
 */
exports.setPermissionMode = async function (params) {
    if (params && typeof params.mode === "string") {
        _runtimePermissionMode = params.mode;
    }
    return { success: true };
};

/**
 * Return the model list fetched from the SDK, or null if no query has
 * populated it yet (browser falls back to a static alias list).
 * Called from browser via execPeer("getSupportedModels").
 */
exports.getSupportedModels = async function () {
    return { models: cachedModelList };
};

/**
 * Resume a previous session by setting the session ID.
 * The next sendPrompt call will use queryOptions.resume with this session ID.
 */
exports.resumeSession = async function (params) {
    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
    }
    _clearPendingAnswers();
    _queuedClarification = null;
    currentSessionId = params.sessionId;
    return { success: true };
};

/**
 * Destroy the current session (clear session ID).
 */
exports.destroySession = async function () {
    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
    }
    currentSessionId = null;
    _queuedClarification = null;
    return { success: true };
};

/**
 * Queue a clarification message from the user (typed while AI is streaming).
 * If text is already queued, appends with a newline.
 */
exports.queueClarification = async function (params) {
    const newImages = params.images || [];
    if (_queuedClarification) {
        if (params.text) {
            _queuedClarification.text += "\n" + params.text;
        }
        _queuedClarification.images = _queuedClarification.images.concat(newImages);
    } else {
        _queuedClarification = {
            text: params.text || "",
            images: newImages
        };
    }
    return { success: true };
};

/**
 * Get and clear the queued clarification (text + images). Called by the
 * getUserClarification MCP tool; tells the panel so the queue bubble
 * becomes a sent message.
 */
exports.getAndClearClarification = async function () {
    const result = _queuedClarification;
    _queuedClarification = null;
    if (result && (result.text || result.images.length)) {
        nodeConnector.triggerPeer("aiClarificationRead", { text: result.text || "" });
    }
    return result || { text: null, images: [] };
};

/**
 * Clear any queued clarification without reading it.
 * Used when the user clicks Edit on the queue bubble.
 */
exports.clearClarification = async function () {
    _queuedClarification = null;
    return { success: true };
};

/**
 * Internal: run a Claude SDK query and stream results back to the browser.
 */
async function _runQuery(requestId, prompt, projectPath, model, signal, locale, images, envOverrides, permissionMode, additionalDirectories) {
    // Sync the runtime mutable that hooks read for permission decisions —
    // setPermissionMode (peer) updates this same variable when the user
    // cycles modes mid-stream.
    _runtimePermissionMode = permissionMode || "auto";
    let editCount = 0;
    let toolCounter = 0;
    // SDK tool_use id (e.g. "toolu_01...") → our sequential toolCounter so a
    // tool_result block can be mapped back to its indicator on the browser.
    const _toolUseIdToCounter = {};
    // Set true once the user clicks "Allow & Switch to Edit Mode" on a
    // plan-mode write confirmation. Subsequent Edit/Write attempts in the same
    // turn skip the prompt and use the cached "allow" decision so a multi-edit
    // turn doesn't pop a dialog before every edit.
    let _planExitApprovedThisTurn = false;
    // Live preview nudge bookkeeping, per request so each new user prompt
    // re-arms it. _lpPendingEdits counts live-preview-related edits since the
    // model last inspected the preview; _lpNudgeCount enforces the hard cap.
    let _lpPendingEdits = 0;
    let _lpNudgeCount = 0;
    // Shell-rewrite confirmation, scoped per request rather than per
    // conversation: a new user prompt is a new intent, so the next request's
    // first rewrite gets its own speed bump instead of riding on a
    // confirmation given for something else.
    let _shellEditAwaitingRetry = null;
    let _shellEditConfirmed = false;

    // True when this command should be stopped and offered a retry. The
    // identical command coming back means it was meant, so it goes through —
    // and having confirmed once, the rest of the request goes through too.
    //
    // That last part matters: the model often has to fix its own command after
    // the first attempt (BSD `sed -i ''` failing on GNU sed, say). Keying only
    // on the exact string charged a second bump for what is one operation, so
    // one confirmation now covers the request. The first edit is still
    // protected, which is the whole point of the bump.
    function _shellEditNeedsConfirm(command) {
        if (_shellEditConfirmed) {
            return false;
        }
        if (_shellEditAwaitingRetry === command) {
            _shellEditAwaitingRetry = null;
            _shellEditConfirmed = true;
            return false;
        }
        _shellEditAwaitingRetry = command;
        return true;
    }
    let queryFn;
    let connectionTimer = null;

    try {
        queryFn = await getQueryFn();
        if (!editorMcpServer) {
            editorMcpServer = createEditorMcpServer(queryModule, nodeConnector, {
                hasClarification: function () { return !!_queuedClarification; },
                getAndClearClarification: exports.getAndClearClarification
            });
        }
    } catch (err) {
        nodeConnector.triggerPeer("aiError", {
            requestId: requestId,
            error: "Failed to load Claude Code SDK: " + err.message
        });
        return;
    }

    // Send initial progress
    nodeConnector.triggerPeer("aiProgress", {
        requestId: requestId,
        message: "Analyzing...",
        phase: "start"
    });

    if (envOverrides) {
        const keys = Object.keys(envOverrides);
        console.log("[AI] Using env overrides:", keys.map(k => k + "=" + (k.includes("TOKEN") || k.includes("KEY") ? "***" : envOverrides[k])).join(", "));
    }

    let _lastStderrLines = [];
    const MAX_STDERR_LINES = 50;
    let _hookErrorBuffer = "";
    let _hookErrorTimer = null;
    const HOOK_ERROR_FLUSH_MS = 200;

    function _flushHookError() {
        if (_hookErrorBuffer) {
            const trimmed = _hookErrorBuffer.trim();
            console.error("[AI hook callback error] SDK threw delivering hook payload" +
                " — tool likely ran natively in acceptEdits mode:\n" + trimmed);
            try {
                nodeConnector.triggerPeer("aiHookError", {
                    requestId: requestId,
                    error: trimmed
                });
            } catch (e) { /* peer may be gone — ignore */ }
            _hookErrorBuffer = "";
        }
        _hookErrorTimer = null;
    }

    // Validate the user-attached extra directories the browser sent.
    // Drop entries that aren't absolute, don't exist, or duplicate cwd.
    // Returns undefined for empty results so the SDK ignores the option
    // rather than seeing a literal []. Each sendPrompt rebuilds this
    // list, so adding/removing in the UI takes effect on the next turn.
    const _cwdForValidation = projectPath || process.cwd();
    // Where Edit/Write may land without asking: the project, any extra
    // directories the user attached, and scratch space. Anything else gets
    // the permission card — the same "write outside the working directory?"
    // check Claude Code makes on its own, which the Write/Edit entries in
    // allowedTools would otherwise skip. Seen in the wild: after
    // `mkdir -p notes-app` in the project, the model wrote the files to
    // /home/<user>/notes-app and nobody was asked.
    function _isOutsideWriteRoots(filePath) {
        if (!filePath || !path.isAbsolute(filePath)) {
            return false;
        }
        const target = path.resolve(filePath);
        const roots = [_cwdForValidation, os.tmpdir(), "/tmp"].concat(validatedExtraDirs || []);
        return !roots.some(function (root) {
            const r = path.resolve(root);
            return target === r || target.startsWith(r + path.sep);
        });
    }
    async function _denyUnlessOutsideWriteAllowed(toolName, toolInput, promptSignal) {
        const filePath = toolInput && toolInput.file_path;
        if (_runtimePermissionMode === "bypassPermissions" || !_isOutsideWriteRoots(filePath)) {
            return null;
        }
        _log("Write outside project roots:", filePath);
        const allowed = await _askToolConfirm(requestId, toolName, toolInput, promptSignal);
        if (allowed) {
            return null;
        }
        return {
            hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: "User declined to write outside the project folder (" +
                    filePath + "). Keep project files under " + _cwdForValidation + "."
            }
        };
    }
    const validatedExtraDirs = (Array.isArray(additionalDirectories)
        ? additionalDirectories.filter(function (p) {
            if (typeof p !== "string" || !path.isAbsolute(p)) { return false; }
            if (p === _cwdForValidation) { return false; }
            try { return fs.existsSync(p); } catch (e) { return false; }
        })
        : []);

    // Permission-prompt handler (SDK canUseTool). Passing it makes the SDK
    // launch the CLI with --permission-prompt-tool, and that is what keeps
    // ExitPlanMode, EnterPlanMode and AskUserQuestion in the model's tool
    // list: the CLI drops every tool that needs user interaction from a
    // non-interactive session that has no prompt tool. Without it the model
    // in Plan Mode writes the plan file and then has nothing to propose it
    // with — it ends the turn, or (worse, after a subagent hands back
    // research) keeps circling looking for a way out of plan mode.
    //
    // The PreToolUse hooks below still run first and settle most calls;
    // the CLI only sends here what its permission pipeline marks "ask".
    // Tools flagged requiresUserInteraction (ExitPlanMode, AskUserQuestion)
    // always land here regardless of allowedTools.
    async function _onPermissionRequest(toolName, input, opts) {
        const promptSignal = (opts && opts.signal) || signal;
        // Why the CLI is asking. In Auto this is the classifier deciding it
        // wants a human, which is the whole point of the mode — logging it
        // tells a genuine ask apart from a silent auto-allow.
        const askParts = ["Permission ask:", toolName, "mode=" + _runtimePermissionMode];
        if (opts && opts.decisionReason) {
            askParts.push("reason=" + opts.decisionReason);
        }
        if (opts && opts.blockedPath) {
            askParts.push("blockedPath=" + opts.blockedPath);
        }
        _log.apply(null, askParts);
        if (toolName === "ExitPlanMode") {
            return _onExitPlanModeRequest(input, promptSignal);
        }
        if (toolName === "AskUserQuestion") {
            // Normally intercepted by the PreToolUse hook; kept as a
            // fallback so a question can never dead-end in a deny.
            const questions = (input && input.questions) || [];
            const answer = await _askUserQuestions(requestId, questions, promptSignal);
            if (!answer) {
                return { behavior: "deny", message: "Question cancelled." };
            }
            return {
                behavior: "allow",
                updatedInput: Object.assign({}, input, { answers: answer.answers || {} })
            };
        }
        if (FILE_WRITE_TOOLS.indexOf(toolName) !== -1 && _runtimePermissionMode === "plan") {
            // Plan mode entered mid-turn via EnterPlanMode: the Edit/Write
            // hooks saw the query-start mode and passed the call through,
            // so the CLI's own plan-mode block asks us. Same card as the
            // hook path, same one-shot approval for the rest of the turn.
            if (_planExitApprovedThisTurn) {
                return { behavior: "allow", updatedInput: input };
            }
            const filePath = (input && input.file_path) || "";
            const approved = await _askPlanModeWriteConfirm(
                requestId, toolName, filePath, promptSignal);
            if (!approved) {
                return {
                    behavior: "deny",
                    message: "User chose to stay in Plan Mode. Use the ExitPlanMode " +
                        "tool to propose your changes for approval before editing."
                };
            }
            _planExitApprovedThisTurn = true;
            _runtimePermissionMode = "auto";
            return { behavior: "allow", updatedInput: input };
        }
        // Anything else the CLI wants a human decision on: Bash or a
        // non-read-only MCP tool in Plan Mode, a classifier ask in Auto, a
        // tool outside allowedTools. With no prompt tool the CLI used to
        // deny these on its own and nothing ever reached the panel — the
        // user just saw the model give up. Put up the card.
        const allowed = await _askToolConfirm(requestId, toolName, input, promptSignal);
        if (allowed) {
            return { behavior: "allow", updatedInput: input };
        }
        return { behavior: "deny", message: "User denied permission for " + toolName + "." };
    }

    // ExitPlanMode permission prompt: render the plan card in the browser and
    // block the tool until the user decides. Approve → "allow": the CLI leaves
    // plan mode and the model keeps going in this turn (PLAN_APPROVED_HINT
    // rides in on the PostToolUse hook). Revise → "deny" with the feedback:
    // the model stays in plan mode, reworks the plan and calls ExitPlanMode
    // again, which lands right back here with a fresh card.
    async function _onExitPlanModeRequest(input, promptSignal) {
        const planText = (input && input.plan) || _lastPlanContent || "";
        _lastPlanContent = null;
        if (!planText) {
            _log("ExitPlanMode with no plan content");
            return {
                behavior: "deny",
                message: "No plan content found. Write the plan to your plan file " +
                    "(or pass it in the plan argument) and call ExitPlanMode again."
            };
        }
        _log("ExitPlanMode plan (" + planText.length + "ch), waiting for user");
        const pending = _registerAnswer("plan", promptSignal);
        nodeConnector.triggerPeer("aiPlanProposed", {
            requestId: requestId,
            confirmId: pending.id,
            plan: planText
        });
        const response = await pending.promise;
        if (!response) {
            _log("Plan review cancelled");
            return { behavior: "deny", message: "Plan review cancelled by the user." };
        }
        if (!response.approved) {
            _log("Plan rejected by user, asking for a revision");
            const feedback = response.feedback || "Please revise the plan.";
            return {
                behavior: "deny",
                message: "The user rejected the plan and wants changes: " + feedback +
                    "\nStay in plan mode, revise the plan based on this feedback, and " +
                    "call ExitPlanMode again to propose the updated plan for approval."
            };
        }
        _log("Plan approved by user, continuing in this turn");
        _planExitApprovedThisTurn = true;
        // The browser pushes the restored UI mode via setPermissionMode
        // before answering; only fill in if it hasn't. Auto (classifier
        // approved) is the landing mode after a plan — it suits the
        // implementation phase better than manual Edit Mode confirms.
        if (_runtimePermissionMode === "plan") {
            _runtimePermissionMode = "auto";
        }
        return { behavior: "allow", updatedInput: input };
    }

    const queryOptions = {
        cwd: projectPath || process.cwd(),
        additionalDirectories: validatedExtraDirs.length ? validatedExtraDirs : undefined,
        maxTurns: undefined,
        stderr: (data) => {
            console.log("[AI stderr]", data);
            _lastStderrLines.push(data);
            if (_lastStderrLines.length > MAX_STDERR_LINES) {
                _lastStderrLines.shift();
            }
            // Collect consecutive lines belonging to a hook callback error so
            // we can log the full burst as one block. The SDK fragments the
            // error across multiple stderr writes which is hard to read.
            if (_hookErrorBuffer || /Error in hook callback/.test(data)) {
                _hookErrorBuffer += data + "\n";
                clearTimeout(_hookErrorTimer);
                _hookErrorTimer = setTimeout(_flushHookError, HOOK_ERROR_FLUSH_MS);
            }
        },
        // Permission allow-rules, not a tool availability list. Bash is
        // deliberately absent so that nothing here can pre-approve a shell
        // command: every one is judged by the permission pipeline, and in
        // Auto that means the SDK's classifier, whose "ask" verdicts reach
        // canUseTool below as the panel's Allow/Deny card. The CLI happens
        // to ignore a Bash allow rule anyway ("Ignoring dangerous permission
        // Bash(*) from cliArg (bypasses classifier)"), so leaving it out
        // simply stops the list from implying otherwise. Edit Mode still
        // uses the manual confirm in the Bash PreToolUse hook below, and
        // Allow Everything (bypassPermissions) skips permission checks.
        allowedTools: [
            "Read", "Edit", "Write", "Glob", "Grep",
            "AskUserQuestion", "Task", "Agent",
            // Background-subagent plumbing: lets the main agent relay a
            // user follow-up to a running subagent (SendMessage), read its
            // output, or stop it — the CLI's own way of steering subagents.
            "SendMessage", "TaskOutput", "TaskStop",
            "TodoRead", "TodoWrite",
            "TaskCreate", "TaskUpdate", "TaskList", "TaskGet",
            "WebFetch", "WebSearch",
            "EnterPlanMode", "ExitPlanMode",
            "mcp__phoenix-editor__getEditorState",
            "mcp__phoenix-editor__takeScreenshot",
            "mcp__phoenix-editor__execJsInLivePreview",
            "mcp__phoenix-editor__execJsInEditor",
            "mcp__phoenix-editor__editorPreferences",
            "mcp__phoenix-editor__editorDocs",
            "mcp__phoenix-editor__controlEditor",
            "mcp__phoenix-editor__resizeLivePreview",
            "mcp__phoenix-editor__wait",
            "mcp__phoenix-editor__getUserClarification"
        ],
        agents: {
            "researcher": {
                description: "Explores the codebase, reads files, and searches" +
                    " for patterns. Use for research tasks.",
                prompt: "You are a code research assistant. Search and read" +
                    " files to answer questions. Do not modify files.",
                tools: ["Read", "Glob", "Grep",
                    "mcp__phoenix-editor__getEditorState",
                    "mcp__phoenix-editor__takeScreenshot",
                    "mcp__phoenix-editor__execJsInLivePreview",
                    "mcp__phoenix-editor__editorDocs"]
            },
            "coder": {
                description: "Reads, edits, and writes code files." +
                    " Use for implementation tasks.",
                prompt: "You are a coding assistant. Implement the requested" +
                    " changes using Edit for existing files and Write" +
                    " only for new files.",
                tools: ["Read", "Edit", "Write", "Glob", "Grep",
                    "mcp__phoenix-editor__getEditorState",
                    "mcp__phoenix-editor__takeScreenshot",
                    "mcp__phoenix-editor__execJsInLivePreview",
                    "mcp__phoenix-editor__execJsInEditor",
                    "mcp__phoenix-editor__editorPreferences",
                    "mcp__phoenix-editor__editorDocs"]
            }
        },
        mcpServers: { "phoenix-editor": editorMcpServer },
        permissionMode: permissionMode || "auto",
        appendSystemPrompt:
            "When modifying an existing file, always prefer the Edit tool " +
            "(find-and-replace) instead of the Write tool. The Write tool should ONLY be used " +
            "to create brand new files that do not exist yet. For existing files, always use " +
            "multiple Edit calls to make targeted changes rather than rewriting the entire " +
            "file with Write. This is critical because Write replaces the entire file content " +
            "which is slow and loses undo history." +
            "\n\nThe user's project root is " + (projectPath || process.cwd()) + ". For files " +
            "under it, default to Edit and Write over shell rewrites (sed -i, perl -i, tee, " +
            "Set-Content/Out-File, `>` / `>>` redirection). Phoenix routes Edit and Write " +
            "through the editor, so they refresh the user's open buffer, render a reviewable " +
            "diff, and stay undoable from the AI panel; a shell rewrite skips all three, and " +
            "the user cannot undo it. Outside the project root — scratch files, temp output, " +
            "logs — the shell is fine and needs no thought. " +
            "\nThis is a default, not a prohibition. The shell is the better call when the " +
            "change is mechanical across many files or matches, when Edit would mean dozens of " +
            "calls or reading a large file to alter a little of it, or when the target is " +
            "generated output. Phoenix stops the first shell rewrite of each command and " +
            "explains why; re-run it unchanged and it goes through. Judge it on the merits — " +
            "tokens saved against undo lost — and tell the user when you take the shell route. " +
            "When the saving would be marginal, take Edit: one shell call and one Edit call " +
            "cost about the same, so a handful of files is not a reason to give up undo. The " +
            "shell has to earn it." +
            "\n\nALWAYS call getEditorState as your FIRST tool call on any question that " +
            "references the user's current work — not just \"what file am I on\". This includes " +
            "implicit-context questions like \"the page\", \"this layout\", \"the nav bar\", " +
            "\"the button\", \"why is X behaving like this\", \"can you fix the styling\", " +
            "\"scroll down on the page\", etc. The user is sitting in front of an editor and a " +
            "live preview — without getEditorState you don't know which file they mean, which " +
            "rules out targeted Read / Grep and makes you blindly grep the whole codebase. Run " +
            "getEditorState first; THEN decide whether to Read the active file, Grep within it, " +
            "or takeScreenshot the live preview to see what they're describing." +
            "\n\nAlways use full absolute paths for all file operations (Read, Edit, Write, " +
            "controlEditor). Never use relative paths." +
            "\n\nWhen a tool response mentions the user has typed a clarification, immediately " +
            "call getUserClarification to read it and incorporate the user's feedback into your current work." +
            "\n\nYou are running inside Phoenix Code, a web-focused code editor with built-in " +
            "live preview for both HTML/CSS/JS/SVG and Markdown. When the user asks to create " +
            "mockups, prototypes, or web pages, prefer vanilla HTML/CSS/JS so the live preview " +
            "can render and edit them — unless the user specifically requests a framework. " +
            "Build responsive layouts by default for web content. For images, prefer real " +
            "<img> tags over div background-image so the user can swap, inspect, and resize " +
            "them in the editor — only fall back to background-image when an effect (parallax, " +
            "cover-with-overlay, repeating tile) genuinely requires it." +
            "\n\nThe live preview is the rendered view of the HTML/CSS/JS/SVG or Markdown file " +
            "currently active in the editor." +
            "\n\nYou ALWAYS have live visibility into the editor through the phoenix-editor tools " +
            "listed below. NEVER tell the user you can't see what's open / what they're looking " +
            "at / what file they're on / what's selected / what's in the live preview — call " +
            "getEditorState (and takeScreenshot / execJsInLivePreview as needed) instead. " +
            "ALWAYS prefer the phoenix-editor MCP for ANY preview interaction — screenshots, " +
            "JS evaluation, DOM inspection, console/network reads, viewport resizing, reloads. " +
            "Do NOT reach for other MCP servers like chrome-devtools to open a separate browser " +
            "session for the same things; the user's live preview inside Phoenix reflects their " +
            "current (possibly unsaved) edits, while a fresh browser session would miss those. " +
            "phoenix-editor.takeScreenshot, phoenix-editor.execJsInLivePreview, " +
            "phoenix-editor.resizeLivePreview, and phoenix-editor.controlEditor cover virtually " +
            "every \"look at / poke at the page\" need. Only fall back to chrome-devtools or " +
            "another browser MCP if the user explicitly asks for a non-Phoenix browser context. " +
            "These tools are for active iteration AND for checking your own work — " +
            "use them as you go, not only when the user asks:" +
            "\n- takeScreenshot: see the rendered HTML preview, the rendered Markdown preview, " +
            "the editor, or any panel. Use it to confirm visual output, diagnose layout/styling " +
            "bugs, or check that HTML or Markdown rendered as expected. Simple selector rule: " +
            "if the question is about the rendered live preview pass " +
            "selector='#panel-live-preview-frame' (targeted shot is easier to reason about); for " +
            "anything else — Problems panel, file tree, toolbar, any other Phoenix UI, or just " +
            "\"what is the user looking at\" — omit the selector and capture the full editor " +
            "window. Pass reload=true to force-reload the preview before capturing (useful after " +
            "JS edits) — saves a tool call vs. reloading separately." +
            "\n- execJsInLivePreview: run JS inside the HTML preview iframe to read the DOM, " +
            "query computed styles, click elements, or capture console output. Use it to debug " +
            "behavior and to confirm an edit actually took effect." +
            "\n- resizeLivePreview: change the preview viewport width to test responsive " +
            "breakpoints." +
            "\n- controlEditor: open files, move the cursor, change selection, toggle the live " +
            "preview panel, or reload it (reloadLivePreview operation — use after JS edits if " +
            "you're not also taking a screenshot)." +
            "\n- getEditorState: report active file, working set, cursor/selection, and the " +
            "livePreviewFile. The live preview normally follows the active editor file, so " +
            "assume that. Rarely the user pins the preview to a specific file — if a " +
            "screenshot doesn't match the file you just edited, check " +
            "getEditorState.livePreviewFile to rule that out." +
            "\n- execJsInEditor: eval JS in Phoenix's OWN JS space (parent window — NOT the live " +
            "preview iframe). Use when controlEditor's fixed ops aren't enough — split panes, " +
            "click dialog buttons, send synthetic key events, dispatch any CommandManager " +
            "command, configure indentation, etc. `__PR` exposes the modules and helpers; see " +
            "the tool description for the full list. Before writing non-trivial JS, call " +
            "editorDocs and Read / Grep the bundled API reference so you call real APIs." +
            "\n- editorPreferences: read or write Phoenix preferences. `list` enumerates every " +
            "registered pref with id/type/default/current/description/scope; `get` for a single " +
            "pref; `set` writes into user (global), project (.phcode.json in repo), or session " +
            "(in-memory) scope." +
            "\n- editorDocs: returns the on-disk path to the bundled API reference plus the " +
            "feature-docs URL and the GitHub source repo URL. Call once near the start of any " +
            "non-trivial editor-control task; then Read / Grep the apiDocsPath and WebFetch the " +
            "featureDocsURL as needed. Do NOT search the codebase blindly when this exists." +
            "\n\nEDITS THAT LAND IN THE LIVE PREVIEW: when you edit the file getEditorState " +
            "reported as livePreviewFile — or a CSS / JS / SVG file it links to — the user is " +
            "watching the result render. Whether that is worth checking is your judgement call, " +
            "and so is how: execJsInLivePreview to read the DOM / computed styles / console, " +
            "takeScreenshot with selector='#panel-live-preview-frame' for a visual check, " +
            "resizeLivePreview for responsive behavior, or nothing at all when the change is " +
            "trivial or self-evident. Weigh it at meaningful checkpoints (after a section lands, " +
            "before you report done) rather than after every small edit. Files outside the live " +
            "preview do not raise the question at all." +
            "\n\nName-collision rule: \"Phoenix Code\" (the editor the user is sitting inside) " +
            "and \"Claude Code\" (the SDK / CLI you happen to run on) BOTH have settings, " +
            "configs, auto-update toggles, themes, etc. When the user says \"set / change / " +
            "configure / disable X\" without naming a product, they ALWAYS mean PHOENIX — " +
            "your first action is editorPreferences.list (or .get/.set), not anything else.\n\n" +
            "DO NOT INVOKE the built-in `update-config` skill, do not Read / Write / cat / Bash " +
            "anything under ~/.claude/, ~/.claude.json, or any Claude Code / SDK config path, " +
            "unless the user EXPLICITLY says \"Claude\" / \"Claude Code\" / \"SDK\" / \"agent\" / " +
            "\"~/.claude\" in their message. The `update-config` skill modifies Claude Code's own " +
            "config, NEVER Phoenix's — if your first instinct on a config / setting / pref / " +
            "auto-update / theme question is to fire that skill, STOP and reach for " +
            "editorPreferences instead.\n\n" +
            "If a request is genuinely ambiguous (Phoenix has no matching pref), say so and ask " +
            "the user which product they meant before changing anything." +
            "\n\nUse your best judgement for when to enter plan mode. Use it when the task " +
            "involves creating new applications, extensive modifications, or architectural " +
            "changes — propose a plan for user approval before writing code." +
            (locale && !locale.startsWith("en")
                ? "\n\nThe user's display language is " + locale + ". " +
                  "Respond in this language unless they write in a different language."
                : ""),
        includePartialMessages: true,
        canUseTool: _onPermissionRequest,
        abortController: currentAbortController,
        // Background tasks off: the CLI otherwise auto-backgrounds a
        // subagent that runs longer than ~10s, hands the main agent an
        // "async agent launched" result, and once the main turn ends the
        // backgrounded agent's tool context stays aborted — every tool it
        // calls afterwards comes back as "The user doesn't want to take
        // this action right now", and the model stops and waits for a
        // user who never said no. Keeping subagents synchronous is the
        // flow the panel can actually drive (and the CLI's own default
        // for non-interactive use is the same waiting behaviour).
        env: Object.assign({}, process.env,
            { CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1" }, envOverrides || {}),
        hooks: {
            PreToolUse: [
                {
                    matcher: "Edit",
                    hooks: [
                        async (input) => {
                            console.log("[Phoenix AI] Intercepted Edit tool");
                            // Plan file edits: capture content, write to disk, skip editor
                            const editPath = (input.tool_input.file_path || "").replace(/\\/g, "/");
                            if (editPath.includes("/.claude/plans/")) {
                                try {
                                    let content = "";
                                    if (fs.existsSync(input.tool_input.file_path)) {
                                        content = fs.readFileSync(input.tool_input.file_path, "utf8");
                                    }
                                    if (input.tool_input.old_string && input.tool_input.new_string) {
                                        if (input.tool_input.replace_all === true) {
                                            content = content.split(input.tool_input.old_string)
                                                .join(input.tool_input.new_string);
                                        } else {
                                            content = content.replace(input.tool_input.old_string,
                                                input.tool_input.new_string);
                                        }
                                    }
                                    const dir = path.dirname(input.tool_input.file_path);
                                    if (!fs.existsSync(dir)) {
                                        fs.mkdirSync(dir, { recursive: true });
                                    }
                                    fs.writeFileSync(input.tool_input.file_path, content, "utf8");
                                    _lastPlanContent = content;
                                    console.log("[Phoenix AI] Captured plan edit content:", content.length + "ch");
                                } catch (err) {
                                    console.warn("[Phoenix AI] Failed to edit plan file:", err.message);
                                }
                                const planReason = "Plan file updated." + _clarificationHintFor(input);
                                return {
                                    hookSpecificOutput: {
                                        hookEventName: "PreToolUse",
                                        permissionDecision: "deny",
                                        permissionDecisionReason: planReason
                                    }
                                };
                            }
                            const outsideDenial = await _denyUnlessOutsideWriteAllowed(
                                "Edit", input.tool_input, signal);
                            if (outsideDenial) {
                                return outsideDenial;
                            }
                            // Plan mode + user-file Edit: ask the user whether
                            // to switch to Edit Mode. Mirrors the Bash confirm
                            // pattern (matcher: "Bash"). Once approved, the
                            // _planExitApprovedThisTurn flag suppresses the
                            // prompt for subsequent edits in the same turn.
                            const filePath = input.tool_input.file_path;
                            if (permissionMode === "plan" && !_planExitApprovedThisTurn) {
                                const approved = await _askPlanModeWriteConfirm(
                                    requestId, "Edit", filePath, signal);
                                if (!approved) {
                                    return {
                                        hookSpecificOutput: {
                                            hookEventName: "PreToolUse",
                                            permissionDecision: "deny",
                                            permissionDecisionReason: "User chose to stay in Plan Mode. " +
                                                "Use the ExitPlanMode tool to propose your changes for " +
                                                "approval before editing."
                                        }
                                    };
                                }
                                _planExitApprovedThisTurn = true;
                            }
                            // New flow: flush dirty buffer to disk so SDK reads
                            // the latest content, capture pre-edit content for
                            // snapshot tracking, then return {} (or "allow" if
                            // we're auto-exiting plan mode) so SDK runs native
                            // Edit on disk. Its mtime/read tracker stays
                            // consistent and the next Edit won't trip the
                            // "modified since read" safety check.
                            const oldString = input.tool_input.old_string;
                            let captured = { content: "" };
                            try {
                                await nodeConnector.execPeer("saveBufferToDisk", { filePath });
                                captured = await nodeConnector.execPeer(
                                    "captureFileContent", { filePath }) || captured;
                            } catch (err) {
                                console.warn("[Phoenix AI] Edit prep failed:", filePath, err.message);
                            }
                            // Pre-check: if the text to replace is no longer in
                            // the file (user typed/changed it since the last
                            // Read), deny with an informative reason instead of
                            // letting the SDK fail with a generic "oldText not
                            // found". Phoenix sees the buffer state the SDK
                            // can't, so this is a more useful failure.
                            if (oldString && (captured.content || "").indexOf(oldString) === -1) {
                                const reason = "Edit FAILED: the text you wanted to replace is not " +
                                    "present in the file. It may have been modified by the user " +
                                    "or by another tool since you last read it. Read the file again " +
                                    "to see the current content before retrying." +
                                    _clarificationHintFor(input);
                                return {
                                    hookSpecificOutput: {
                                        hookEventName: "PreToolUse",
                                        permissionDecision: "deny",
                                        permissionDecisionReason: reason
                                    }
                                };
                            }
                            editCount++;
                            // In plan mode, after the user approved the
                            // confirmation prompt, we need an explicit "allow"
                            // to override the SDK's default plan-mode block.
                            if (permissionMode === "plan") {
                                return {
                                    hookSpecificOutput: {
                                        hookEventName: "PreToolUse",
                                        permissionDecision: "allow"
                                    }
                                };
                            }
                            return {};
                        }
                    ]
                },
                {
                    matcher: "Read",
                    hooks: [
                        async (input) => {
                            if (!input || !input.tool_input || !input.tool_input.file_path) {
                                return {};
                            }
                            // Flush dirty buffer to disk so the SDK's native
                            // Read sees what the user is actually looking at.
                            // Returning {} lets the SDK run native Read so its
                            // read-tracker updates — required to avoid "file
                            // not read yet" rejections on subsequent edits.
                            try {
                                await nodeConnector.execPeer("saveBufferToDisk",
                                    { filePath: input.tool_input.file_path });
                            } catch (err) {
                                console.warn("[Phoenix AI] Read prep failed:",
                                    input.tool_input.file_path, err.message);
                            }
                            return {};
                        }
                    ]
                },
                {
                    matcher: "Write",
                    hooks: [
                        async (input) => {
                            console.log("[Phoenix AI] Intercepted Write tool");
                            // Capture plan content when writing to .claude/plans/
                            // Plan files: capture content for plan card, write to disk
                            // but don't open in editor
                            const writePath = input.tool_input.file_path || "";
                            const normalizedPath = writePath.replace(/\\/g, "/");
                            if (normalizedPath.includes("/.claude/plans/")) {
                                _lastPlanContent = input.tool_input.content || "";
                                console.log("[Phoenix AI] Captured plan content:",
                                    _lastPlanContent.length + "ch");
                                // Write to disk so Claude can read it back later
                                try {
                                    const dir = path.dirname(writePath);
                                    if (!fs.existsSync(dir)) {
                                        fs.mkdirSync(dir, { recursive: true });
                                    }
                                    fs.writeFileSync(writePath, input.tool_input.content || "", "utf8");
                                } catch (err) {
                                    console.warn("[Phoenix AI] Failed to write plan file:", err.message);
                                }
                                const planReason = "Plan file saved." + _clarificationHintFor(input);
                                return {
                                    hookSpecificOutput: {
                                        hookEventName: "PreToolUse",
                                        permissionDecision: "deny",
                                        permissionDecisionReason: planReason
                                    }
                                };
                            }
                            const outsideDenial = await _denyUnlessOutsideWriteAllowed(
                                "Write", input.tool_input, signal);
                            if (outsideDenial) {
                                return outsideDenial;
                            }
                            // Plan mode + user-file Write: same confirmation
                            // path as Edit. See Edit hook above for rationale.
                            const filePath = input.tool_input.file_path;
                            if (permissionMode === "plan" && !_planExitApprovedThisTurn) {
                                const approved = await _askPlanModeWriteConfirm(
                                    requestId, "Write", filePath, signal);
                                if (!approved) {
                                    return {
                                        hookSpecificOutput: {
                                            hookEventName: "PreToolUse",
                                            permissionDecision: "deny",
                                            permissionDecisionReason: "User chose to stay in Plan Mode. " +
                                                "Use the ExitPlanMode tool to propose your changes for " +
                                                "approval before writing."
                                        }
                                    };
                                }
                                _planExitApprovedThisTurn = true;
                            }
                            // Mirror Edit: flush dirty buffer, capture pre-write
                            // content, return {} (or "allow" in plan mode) so
                            // SDK writes natively.
                            try {
                                await nodeConnector.execPeer("saveBufferToDisk", { filePath });
                                await nodeConnector.execPeer("captureFileContent", { filePath });
                            } catch (err) {
                                console.warn("[Phoenix AI] Write prep failed:", filePath, err.message);
                            }
                            editCount++;
                            if (permissionMode === "plan") {
                                return {
                                    hookSpecificOutput: {
                                        hookEventName: "PreToolUse",
                                        permissionDecision: "allow"
                                    }
                                };
                            }
                            return {};
                        }
                    ]
                },
                {
                    matcher: "Bash",
                    hooks: [
                        async (input) => {
                            // Stop a file rewrite the first time it is tried,
                            // in every permission mode — "auto" hands the call
                            // to the SDK classifier, which happily approves
                            // sed -i. Denying here is what actually protects
                            // the edit: a note after the fact arrives once undo
                            // is already gone. Re-running the same command
                            // confirms intent and goes through.
                            const command = (input.tool_input && input.tool_input.command) || "";
                            const inPlaceEdit = _describeInPlaceFileEdit(command);
                            if (inPlaceEdit && _shellEditNeedsConfirm(command)) {
                                console.log("[Phoenix AI] Stopped shell file rewrite (" +
                                    inPlaceEdit + "), offering retry: " + command.slice(0, 70));
                                return {
                                    hookSpecificOutput: {
                                        hookEventName: "PreToolUse",
                                        permissionDecision: "deny",
                                        permissionDecisionReason: _shellEditDenyText(inPlaceEdit)
                                    }
                                };
                            }
                            if (inPlaceEdit) {
                                console.log("[Phoenix AI] Shell file rewrite confirmed by retry: " +
                                    command.slice(0, 70));
                            }
                            // Read from the runtime mutable so mid-stream
                            // permission-mode flips (e.g. user switches Edit
                            // Mode → Allow Everything while bash is in flight)
                            // take effect on the NEXT bash call without
                            // waiting for the next prompt.
                            if (_runtimePermissionMode !== "acceptEdits") {
                                // Plan mode: SDK handles. Auto: SDK's own
                                // classifier decides. Allow Everything: allow
                                // freely. Either way, Phoenix's own
                                // confirm-dialog/safe-bash-allowlist below is
                                // only for Edit Mode's manual approval flow.
                                return {};
                            }
                            // Edit Mode: ask user confirmation before running bash.
                            // `command` is read above, for the rewrite check.
                            // Skip prompting for well-known read-only commands
                            // that mirror the Claude Code CLI's default safe
                            // patterns. Cuts down on prompt fatigue during
                            // typical "look around the repo" turns.
                            if (_isSafeReadOnlyBash(command)) {
                                console.log("[Phoenix AI] Auto-allowing safe bash:", command.slice(0, 80));
                                return {
                                    hookSpecificOutput: {
                                        hookEventName: "PreToolUse",
                                        permissionDecision: "allow"
                                    }
                                };
                            }
                            console.log("[Phoenix AI] Bash confirmation requested:", command.slice(0, 80));
                            const allowed = await _askToolConfirm(
                                requestId, "Bash", input.tool_input, signal);
                            if (allowed) {
                                // Explicit allow, not {}: with Bash off the
                                // allow list, "no opinion" would send a
                                // command the user just approved on to the
                                // CLI's own permission check.
                                return {
                                    hookSpecificOutput: {
                                        hookEventName: "PreToolUse",
                                        permissionDecision: "allow"
                                    }
                                };
                            }
                            return {
                                hookSpecificOutput: {
                                    hookEventName: "PreToolUse",
                                    permissionDecision: "deny",
                                    permissionDecisionReason: "User denied this command."
                                }
                            };
                        }
                    ]
                },
                {
                    // Built-in agents (Explore, Plan, general-purpose) inherit
                    // every tool, including this one. Keep the user's follow-up
                    // for the main agent — see _clarificationHintFor.
                    matcher: "mcp__phoenix-editor__getUserClarification",
                    hooks: [
                        async (input) => {
                            if (!input || !input.agent_id) {
                                return {};
                            }
                            console.log("[Phoenix AI] Blocked getUserClarification from subagent");
                            return {
                                hookSpecificOutput: {
                                    hookEventName: "PreToolUse",
                                    permissionDecision: "deny",
                                    permissionDecisionReason: "Only the main agent reads the user's " +
                                        "follow-up. Finish your task and return your findings; " +
                                        "the main agent will handle the user's message."
                                }
                            };
                        }
                    ]
                },
                {
                    matcher: "AskUserQuestion",
                    hooks: [
                        async (input) => {
                            console.log("[Phoenix AI] Intercepted AskUserQuestion");
                            const questions = input.tool_input.questions || [];
                            // Wait for the user's answer from the browser UI
                            const answer = await _askUserQuestions(requestId, questions, signal);
                            return {
                                hookSpecificOutput: {
                                    hookEventName: "PreToolUse",
                                    permissionDecision: "deny",
                                    permissionDecisionReason: _formatAnswers(answer) || "No answer provided"
                                }
                            };
                        }
                    ]
                }
            ],
            PostToolUse: [
                {
                    // Model flipped itself into plan mode: keep the runtime
                    // tracker honest so the Bash hook and canUseTool see it.
                    matcher: "EnterPlanMode",
                    hooks: [
                        async () => {
                            _runtimePermissionMode = "plan";
                            return {};
                        }
                    ]
                },
                {
                    // Runs only when ExitPlanMode was allowed, i.e. the
                    // user approved the plan.
                    matcher: "ExitPlanMode",
                    hooks: [
                        async () => {
                            return {
                                hookSpecificOutput: {
                                    hookEventName: "PostToolUse",
                                    additionalContext: PLAN_APPROVED_HINT
                                }
                            };
                        }
                    ]
                },
                {
                    matcher: "Edit",
                    hooks: [
                        async (input, toolUseID) => {
                            const filePath = input && input.tool_input && input.tool_input.file_path;
                            if (!filePath) { return {}; }
                            // Plan files don't go through the editor
                            if (filePath.replace(/\\/g, "/").includes("/.claude/plans/")) {
                                return {};
                            }
                            // If the SDK's native Edit itself failed (e.g.
                            // oldText not found on disk), don't paint a diff
                            // card. The existing aiToolResult flow will
                            // classify the indicator from the tool_result.
                            if (_isToolResponseError(input.tool_response)) {
                                return {};
                            }
                            const editPayload = {
                                file: filePath,
                                oldText: input.tool_input.old_string,
                                newText: input.tool_input.new_string,
                                replaceAll: input.tool_input.replace_all === true
                            };
                            // 1. Prefer applying the edit directly to the open
                            //    buffer via doc.replaceRange — preserves
                            //    CodeMirror marks outside the edit region (live
                            //    preview HTML element marks). Falls back to a
                            //    full refreshDocumentFromDisk if no doc is open
                            //    or the buffer no longer contains old_string
                            //    (e.g. user typed since save).
                            let result = {};
                            try {
                                result = await nodeConnector.execPeer(
                                    "applyEditToOpenBufferOnly", editPayload) || {};
                            } catch (err) {
                                console.warn("[Phoenix AI] applyEditToOpenBufferOnly failed:", filePath, err.message);
                            }
                            if (!result.applied) {
                                try {
                                    result = await nodeConnector.execPeer(
                                        "refreshDocumentFromDisk", { filePath }) || result;
                                } catch (err) {
                                    console.warn("[Phoenix AI] Edit refresh fallback failed:", filePath, err.message);
                                }
                            }
                            // 2. Count it toward the live preview nudge. Only
                            //    incrementing here — the read-and-clear happens
                            //    in one owner, since PostToolUse hooks can run
                            //    concurrently for parallel tool calls.
                            if (result.isLivePreviewRelated) {
                                _lpPendingEdits++;
                            }
                            // 3. Trigger aiToolEdit so the AI panel renders the
                            //    diff card and the snapshot store records it.
                            const counterId = _toolUseIdToCounter[toolUseID];
                            if (counterId !== undefined) {
                                editPayload.isLivePreviewRelated = !!result.isLivePreviewRelated;
                                nodeConnector.triggerPeer("aiToolEdit", {
                                    requestId: requestId,
                                    toolId: counterId,
                                    edit: editPayload
                                });
                            }
                            // Catch-all PostToolUse below handles clarification.
                            return {};
                        }
                    ]
                },
                {
                    matcher: "Write",
                    hooks: [
                        async (input, toolUseID) => {
                            const filePath = input && input.tool_input && input.tool_input.file_path;
                            if (!filePath) { return {}; }
                            if (filePath.replace(/\\/g, "/").includes("/.claude/plans/")) {
                                return {};
                            }
                            if (_isToolResponseError(input.tool_response)) {
                                return {};
                            }
                            let refreshResult = {};
                            try {
                                refreshResult = await nodeConnector.execPeer(
                                    "refreshDocumentFromDisk", { filePath }) || {};
                            } catch (err) {
                                console.warn("[Phoenix AI] Write refresh failed:", filePath, err.message);
                            }
                            if (refreshResult.isLivePreviewRelated) {
                                _lpPendingEdits++;
                            }
                            const counterId = _toolUseIdToCounter[toolUseID];
                            if (counterId !== undefined) {
                                nodeConnector.triggerPeer("aiToolEdit", {
                                    requestId: requestId,
                                    toolId: counterId,
                                    edit: {
                                        file: filePath,
                                        oldText: null,
                                        newText: input.tool_input.content,
                                        isLivePreviewRelated: !!refreshResult.isLivePreviewRelated
                                    }
                                });
                            }
                            // Catch-all PostToolUse below handles clarification.
                            return {};
                        }
                    ]
                },
                {
                    // Catch-all: surface a queued user follow-up after every
                    // tool. Edit/Write/Read have their own hooks above, but
                    // any tool can be a meaningful checkpoint (Bash, Grep,
                    // Glob, WebFetch, Task, the Phoenix MCP tools, etc.) so
                    // we register one matcher-less hook that returns the
                    // clarification context if any is queued. Once
                    // getUserClarification runs and clears _queuedClarification,
                    // that part becomes a no-op.
                    //
                    // It also carries the live preview nudge as a fallback for
                    // Claude CLI versions that predate PostToolBatch: the batch
                    // hook below is the primary path, but we run the user's
                    // global CLI (findGlobalClaudeCli) so we can't assume it.
                    // Whichever fires first takes the hint; the other sees a
                    // cleared counter.
                    hooks: [
                        async (input) => {
                            return _buildPostToolUseHint(input);
                        }
                    ]
                }
            ],
            PostToolBatch: [
                {
                    // Primary emit point for the live preview nudge. Fires once
                    // after every tool call in a batch resolves, so unlike
                    // PostToolUse (which may run concurrently for parallel tool
                    // calls) it can safely read-and-clear shared state, and it
                    // sees the whole batch — including whether the model already
                    // inspected the preview itself.
                    hooks: [
                        async (input) => {
                            const names = (input.tool_calls || []).map(function (call) {
                                return call.tool_name;
                            });
                            const hint = _takeLivePreviewHint(names);
                            if (!hint) { return {}; }
                            return {
                                hookSpecificOutput: {
                                    hookEventName: "PostToolBatch",
                                    additionalContext: hint
                                }
                            };
                        }
                    ]
                }
            ]
        }
    };

    // Read-and-clear for the live preview nudge. Returns the hint text when the
    // model has piled up unverified live-preview edits, else null. Called from
    // the PostToolBatch hook (primary) and the PostToolUse catch-all (fallback
    // for older CLIs) — the body is synchronous, so whichever gets here first
    // takes the hint and the other finds the counter already cleared.
    //
    // toolNames is what the model just called: seeing it inspect the preview
    // itself means there is nothing to nag about.
    function _takeLivePreviewHint(toolNames) {
        if (toolNames && toolNames.some(function (name) {
            return LP_INSPECT_TOOLS.indexOf(name) !== -1;
        })) {
            _lpPendingEdits = 0;
            return null;
        }
        if (_lpNudgeCount >= LP_MAX_NUDGES_PER_REQUEST) {
            return null;
        }
        const threshold = _lpNudgeCount === 0 ? 1 : LP_NUDGE_REPEAT_AFTER;
        if (_lpPendingEdits < threshold) {
            return null;
        }
        const text = _livePreviewHintText(_lpPendingEdits);
        console.log("[Phoenix AI] live preview nudge:", _lpPendingEdits, "edit(s) unverified");
        _lpPendingEdits = 0;
        _lpNudgeCount++;
        return text;
    }

    // Returns a PostToolUse SyncHookJSONOutput carrying whatever the model
    // should see after a tool call: the clarification hint when the user has
    // typed a follow-up while the AI is streaming, and/or the live preview
    // nudge. With our PreToolUse hooks now returning {} (allow), the old
    // practice of appending CLARIFICATION_HINT to permissionDecisionReason no
    // longer reaches Claude — PostToolUse additionalContext is the new path.
    //
    // _queuedClarification is deliberately not cleared here; it clears only
    // when the model calls getUserClarification. The live preview counter is
    // cleared by _takeLivePreviewHint, so that half cannot repeat.
    function _buildPostToolUseHint(input) {
        const parts = [];
        const clarificationHint = _clarificationHintFor(input);
        if (clarificationHint) {
            parts.push(clarificationHint);
        }
        const lpHint = _takeLivePreviewHint(input && input.tool_name ? [input.tool_name] : null);
        if (lpHint) {
            parts.push(lpHint);
        }
        if (!parts.length) { return {}; }
        return {
            hookSpecificOutput: {
                hookEventName: "PostToolUse",
                additionalContext: parts.join("\n\n")
            }
        };
    }

    // Set Claude CLI path if found
    const claudePath = await findGlobalClaudeCli();
    if (claudePath) {
        queryOptions.pathToClaudeCodeExecutable = claudePath;
    }

    if (model) {
        queryOptions.model = model;
    }


    // Resume session if we have an existing one (already cleared if sessionAction was "new")
    if (currentSessionId) {
        queryOptions.resume = currentSessionId;
    }

    const _log = (...args) => console.log("[AI]", ...args);

    try {
        _log("Query start:", JSON.stringify(prompt).slice(0, 80), "cwd=" + (projectPath || "?"));

        // Build prompt: multi-modal with images, or plain string
        let sdkPrompt = prompt;
        if (images && images.length > 0) {
            const contentBlocks = [{ type: "text", text: prompt }];
            images.forEach(function (img, idx) {
                // Infer media type from base64 header if missing
                let mediaType = img.mediaType;
                if (!mediaType && img.base64Data) {
                    if (img.base64Data.startsWith("iVBOR")) {
                        mediaType = "image/png";
                    } else if (img.base64Data.startsWith("/9j/")) {
                        mediaType = "image/jpeg";
                    } else if (img.base64Data.startsWith("R0lGOD")) {
                        mediaType = "image/gif";
                    } else if (img.base64Data.startsWith("UklGR")) {
                        mediaType = "image/webp";
                    } else {
                        mediaType = "image/png";
                    }
                }
                _log("Image[" + idx + "]:", "mediaType=" + mediaType,
                    "base64Len=" + (img.base64Data ? img.base64Data.length : "null"));
                contentBlocks.push({
                    type: "image",
                    source: { type: "base64", media_type: mediaType, data: img.base64Data }
                });
            });
            sdkPrompt = (async function* () {
                yield {
                    type: "user",
                    session_id: currentSessionId || "",
                    message: { role: "user", content: contentBlocks },
                    parent_tool_use_id: null
                };
            })();
        }

        const result = queryFn({
            prompt: sdkPrompt,
            options: queryOptions
        });

        let accumulatedText = "";
        let lastStreamTime = 0;

        // Tool input tracking (parent-level). activeToolCounter is the id
        // announced at content_block_start; every later event for the block
        // must reuse it. toolCounter itself keeps moving while the block
        // streams — a subagent's batched tool_use can land in between — so
        // reading toolCounter at delta/stop time sends the parent's input to
        // the subagent's card and leaves the parent card spinning forever.
        let activeToolName = null;
        let activeToolIndex = null;
        let activeToolCounter = null;
        let activeToolInputJson = "";
        let lastToolStreamTime = 0;

        // Sub-agent tool tracking
        let subagentToolName = null;
        let subagentToolIndex = null;
        let subagentToolInputJson = "";
        let subagentToolCounter = null;
        let subagentParentToolId;
        let lastSubagentToolStreamTime = 0;

        // Trace counters (logged at tool/query completion, not per-delta)
        let toolDeltaCount = 0;
        let toolStreamSendCount = 0;
        let textDeltaCount = 0;
        let textStreamSendCount = 0;

        // Connection timeout — abort if no messages within 60s
        let receivedFirstMessage = false;
        const CONNECTION_TIMEOUT_MS = 60000;
        connectionTimer = setTimeout(() => {
            if (!receivedFirstMessage && !signal.aborted) {
                _log("Connection timeout — no response in " + (CONNECTION_TIMEOUT_MS / 1000) + "s");
                const stderrHint = _lastStderrLines
                    .filter(line => !line.startsWith("Spawning Claude Code"))
                    .join("\n").trim();
                let timeoutMsg = "Connection timed out — no response from API after " +
                    (CONNECTION_TIMEOUT_MS / 1000) + " seconds.";
                if (envOverrides && envOverrides.ANTHROPIC_BASE_URL) {
                    timeoutMsg += " Check that the Base URL (" + envOverrides.ANTHROPIC_BASE_URL +
                        ") is correct and reachable.";
                }
                if (stderrHint) {
                    timeoutMsg += "\n" + stderrHint;
                }
                nodeConnector.triggerPeer("aiError", {
                    requestId: requestId,
                    error: timeoutMsg
                });
                currentAbortController.abort();
            }
        }, CONNECTION_TIMEOUT_MS);

        for await (const message of result) {
            if (!receivedFirstMessage) {
                receivedFirstMessage = true;
                clearTimeout(connectionTimer);
                _fetchModelListOnce(result);
            }
            // Check abort
            if (signal.aborted) {
                _log("Aborted");
                break;
            }

            // Capture session_id from first message
            if (message.session_id && !currentSessionId) {
                currentSessionId = message.session_id;
                _log("Session:", currentSessionId);
            }

            // The init message carries the fully-resolved model for the
            // session — with no model param this is the user's saved
            // Claude Code default. requestedModel lets the browser tell
            // an explicit pick apart from default resolution.
            if (message.type === "system" && message.subtype === "init" && message.model) {
                nodeConnector.triggerPeer("aiSessionInfo", {
                    model: message.model,
                    requestedModel: model || null
                });
            }

            // Subagent tool extraction. The SDK delivers the parent
            // agent's tool calls as a stream of stream_event messages
            // (content_block_start / content_block_delta / content_block_
            // stop), but the new Agent dispatcher's *subagent* tool calls
            // arrive batched on a single assistant message with
            // parent_tool_use_id set — there is no streaming path. We have
            // to fish them out here, otherwise the UI sees the parent
            // Agent card finish and then nothing until the subagent
            // returns. Each tool_use block emits aiProgress + aiToolInfo
            // back-to-back (no streaming preview — the SDK never gave us
            // one); the tool_use id is registered in _toolUseIdToCounter
            // so the existing tool_result handler routes the response
            // back to the right indicator card.
            if (message.type === "assistant" &&
                    message.parent_tool_use_id &&
                    message.message && Array.isArray(message.message.content)) {
                const parentToolId = _toolUseIdToCounter[message.parent_tool_use_id];
                for (const block of message.message.content) {
                    if (block && block.type === "tool_use") {
                        if (block.id && _toolUseIdToCounter[block.id] !== undefined) {
                            // Already announced from the stream_event path.
                            continue;
                        }
                        toolCounter++;
                        if (block.id) {
                            _toolUseIdToCounter[block.id] = toolCounter;
                        }
                        _log("Subagent tool:", block.name, "#" + toolCounter,
                            "parent=#" + (parentToolId !== undefined ? parentToolId : "?"));
                        nodeConnector.triggerPeer("aiProgress", {
                            requestId: requestId,
                            toolName: block.name,
                            toolId: toolCounter,
                            parentToolId: parentToolId,
                            phase: "tool_use"
                        });
                        nodeConnector.triggerPeer("aiToolInfo", {
                            requestId: requestId,
                            toolName: block.name,
                            toolId: toolCounter,
                            parentToolId: parentToolId,
                            toolInput: block.input || {}
                        });
                    }
                }
            }

            // Per-turn token usage: each SDKAssistantMessage carries the
            // wrapped Anthropic API message whose `.usage` reflects what
            // that single turn consumed. Useful for diagnosing runaway
            // loops; logged but not metric'd individually (the result
            // message rolls up the session totals).
            if (message.type === "assistant" &&
                    message.message && message.message.usage) {
                const u = message.message.usage;
                _log("Turn usage:",
                    "in=" + (u.input_tokens || 0),
                    "out=" + (u.output_tokens || 0),
                    "cacheRead=" + (u.cache_read_input_tokens || 0),
                    "cacheCreate=" + (u.cache_creation_input_tokens || 0),
                    message.parent_tool_use_id ? "(subagent)" : "");
            }

            // Aggregate session usage on the terminal `result` message.
            // The SDK emits exactly one of these per query (success or
            // error_*) with totals across all turns and the per-model
            // breakdown.
            if (message.type === "result") {
                const u = message.usage || {};
                const mu = message.modelUsage || {};
                _log("Result:",
                    "turns=" + (message.num_turns || 0),
                    "in=" + (u.input_tokens || 0),
                    "out=" + (u.output_tokens || 0),
                    "cacheRead=" + (u.cache_read_input_tokens || 0),
                    "cacheCreate=" + (u.cache_creation_input_tokens || 0),
                    "cost=$" + (message.total_cost_usd || 0).toFixed(4),
                    "ms=" + (message.duration_ms || 0),
                    "apiMs=" + (message.duration_api_ms || 0),
                    "subtype=" + message.subtype);
                for (const modelName of Object.keys(mu)) {
                    const m = mu[modelName];
                    _log("Model usage[" + modelName + "]:",
                        "in=" + (m.inputTokens || 0),
                        "out=" + (m.outputTokens || 0),
                        "cacheRead=" + (m.cacheReadInputTokens || 0),
                        "cacheCreate=" + (m.cacheCreationInputTokens || 0),
                        "websearch=" + (m.webSearchRequests || 0),
                        "cost=$" + (m.costUSD || 0).toFixed(4),
                        "ctxWindow=" + (m.contextWindow || 0));
                }
                // Forward to the browser so AIChatPanel can raise metrics.
                // Stuck on its own event so the existing aiComplete handler
                // doesn't have to change shape.
                nodeConnector.triggerPeer("aiUsage", {
                    requestId: requestId,
                    sessionId: currentSessionId,
                    subtype: message.subtype,
                    isError: !!message.is_error,
                    numTurns: message.num_turns || 0,
                    durationMs: message.duration_ms || 0,
                    durationApiMs: message.duration_api_ms || 0,
                    totalCostUSD: message.total_cost_usd || 0,
                    usage: u,
                    modelUsage: mu
                });
            }

            // Handle streaming events
            if (message.type === "stream_event") {
                const event = message.event;
                const isSubagent = !!message.parent_tool_use_id;

                if (isSubagent) {
                    // --- Sub-agent events ---

                    // Sub-agent tool use start
                    if (event.type === "content_block_start" &&
                        event.content_block?.type === "tool_use") {
                        subagentToolName = event.content_block.name;
                        subagentToolIndex = event.index;
                        subagentToolInputJson = "";
                        subagentParentToolId = _toolUseIdToCounter[message.parent_tool_use_id];
                        toolCounter++;
                        subagentToolCounter = toolCounter;
                        lastSubagentToolStreamTime = 0;
                        // Register the id so the batched assistant message
                        // for the same call is skipped and tool_result maps
                        // back to this indicator.
                        if (event.content_block.id) {
                            _toolUseIdToCounter[event.content_block.id] = subagentToolCounter;
                        }
                        _log("Subagent tool start:", subagentToolName, "#" + subagentToolCounter,
                            "parent=#" + (subagentParentToolId !== undefined ? subagentParentToolId : "?"));
                        nodeConnector.triggerPeer("aiProgress", {
                            requestId: requestId,
                            toolName: subagentToolName,
                            toolId: subagentToolCounter,
                            parentToolId: subagentParentToolId,
                            phase: "tool_use"
                        });
                    }

                    // Sub-agent tool input streaming
                    if (event.type === "content_block_delta" &&
                        event.delta?.type === "input_json_delta" &&
                        event.index === subagentToolIndex) {
                        subagentToolInputJson += event.delta.partial_json;
                        const now = Date.now();
                        if (subagentToolInputJson &&
                            now - lastSubagentToolStreamTime >= TEXT_STREAM_THROTTLE_MS) {
                            lastSubagentToolStreamTime = now;
                            nodeConnector.triggerPeer("aiToolStream", {
                                requestId: requestId,
                                toolId: subagentToolCounter,
                                toolName: subagentToolName,
                                partialJson: subagentToolInputJson
                            });
                        }
                    }

                    // Sub-agent tool block complete
                    if (event.type === "content_block_stop" &&
                        event.index === subagentToolIndex &&
                        subagentToolName) {
                        if (subagentToolInputJson) {
                            nodeConnector.triggerPeer("aiToolStream", {
                                requestId: requestId,
                                toolId: subagentToolCounter,
                                toolName: subagentToolName,
                                partialJson: subagentToolInputJson
                            });
                        }
                        let toolInput = {};
                        try {
                            toolInput = JSON.parse(subagentToolInputJson);
                        } catch (e) {
                            // ignore parse errors
                        }
                        _log("Subagent tool done:", subagentToolName, "#" + subagentToolCounter,
                            "json=" + subagentToolInputJson.length + "ch");
                        nodeConnector.triggerPeer("aiToolInfo", {
                            requestId: requestId,
                            toolName: subagentToolName,
                            toolId: subagentToolCounter,
                            parentToolId: subagentParentToolId,
                            toolInput: toolInput
                        });
                        subagentToolName = null;
                        subagentToolIndex = null;
                        subagentToolCounter = null;
                        subagentToolInputJson = "";
                    }

                    // Sub-agent text deltas — stream as regular text
                    if (event.type === "content_block_delta" &&
                        event.delta?.type === "text_delta") {
                        accumulatedText += event.delta.text;
                        textDeltaCount++;
                        const now = Date.now();
                        if (now - lastStreamTime >= TEXT_STREAM_THROTTLE_MS) {
                            lastStreamTime = now;
                            textStreamSendCount++;
                            nodeConnector.triggerPeer("aiTextStream", {
                                requestId: requestId,
                                text: accumulatedText
                            });
                            accumulatedText = "";
                        }
                    }
                } else {
                    // --- Parent-level events (unchanged) ---

                    // Tool use start — send initial indicator
                    if (event.type === "content_block_start" &&
                        event.content_block?.type === "tool_use") {
                        activeToolName = event.content_block.name;
                        activeToolIndex = event.index;
                        activeToolInputJson = "";
                        toolCounter++;
                        activeToolCounter = toolCounter;
                        toolDeltaCount = 0;
                        toolStreamSendCount = 0;
                        lastToolStreamTime = 0;
                        // Map the SDK's tool_use id → our toolCounter so we can
                        // correlate later tool_result blocks back to the indicator.
                        if (event.content_block.id) {
                            _toolUseIdToCounter[event.content_block.id] = activeToolCounter;
                        }
                        _log("Tool start:", activeToolName, "#" + activeToolCounter);
                        nodeConnector.triggerPeer("aiProgress", {
                            requestId: requestId,
                            toolName: activeToolName,
                            toolId: activeToolCounter,
                            phase: "tool_use"
                        });
                    }

                    // Accumulate tool input JSON and stream preview
                    if (event.type === "content_block_delta" &&
                        event.delta?.type === "input_json_delta" &&
                        event.index === activeToolIndex) {
                        activeToolInputJson += event.delta.partial_json;
                        toolDeltaCount++;
                        const now = Date.now();
                        if (activeToolInputJson &&
                            now - lastToolStreamTime >= TEXT_STREAM_THROTTLE_MS) {
                            lastToolStreamTime = now;
                            toolStreamSendCount++;
                            nodeConnector.triggerPeer("aiToolStream", {
                                requestId: requestId,
                                toolId: activeToolCounter,
                                toolName: activeToolName,
                                partialJson: activeToolInputJson
                            });
                        }
                    }

                    // Tool block complete — flush final stream preview and send details
                    if (event.type === "content_block_stop" &&
                        event.index === activeToolIndex &&
                        activeToolName) {
                        // Final flush of tool stream (bypasses throttle)
                        if (activeToolInputJson) {
                            toolStreamSendCount++;
                            nodeConnector.triggerPeer("aiToolStream", {
                                requestId: requestId,
                                toolId: activeToolCounter,
                                toolName: activeToolName,
                                partialJson: activeToolInputJson
                            });
                        }
                        let toolInput = {};
                        try {
                            toolInput = JSON.parse(activeToolInputJson);
                        } catch (e) {
                            // ignore parse errors
                        }
                        _log("Tool done:", activeToolName, "#" + activeToolCounter,
                            "deltas=" + toolDeltaCount, "sent=" + toolStreamSendCount,
                            "json=" + activeToolInputJson.length + "ch");
                        nodeConnector.triggerPeer("aiToolInfo", {
                            requestId: requestId,
                            toolName: activeToolName,
                            toolId: activeToolCounter,
                            toolInput: toolInput
                        });

                        activeToolName = null;
                        activeToolIndex = null;
                        activeToolCounter = null;
                        activeToolInputJson = "";
                    }

                    // Stream text deltas (throttled)
                    if (event.type === "content_block_delta" &&
                        event.delta?.type === "text_delta") {
                        accumulatedText += event.delta.text;
                        textDeltaCount++;
                        const now = Date.now();
                        if (now - lastStreamTime >= TEXT_STREAM_THROTTLE_MS) {
                            lastStreamTime = now;
                            textStreamSendCount++;
                            nodeConnector.triggerPeer("aiTextStream", {
                                requestId: requestId,
                                text: accumulatedText
                            });
                            accumulatedText = "";
                        }
                    }
                }
            }

            // Tool results come back as user-typed messages with content blocks
            // of type tool_result. Log isError + content size so we can correlate
            // a "Tool done" (input stream) with what Claude actually saw as the reply.
            if (message.type === "user" && message.message && Array.isArray(message.message.content)) {
                for (const block of message.message.content) {
                    if (block && block.type === "tool_result") {
                        let len = 0;
                        let preview = "";
                        if (typeof block.content === "string") {
                            len = block.content.length;
                            preview = block.content.slice(0, 120);
                        } else if (Array.isArray(block.content)) {
                            for (const c of block.content) {
                                if (c && c.type === "text" && typeof c.text === "string") {
                                    len += c.text.length;
                                    if (!preview) { preview = c.text.slice(0, 120); }
                                } else if (c && c.type === "image" && typeof c.data === "string") {
                                    len += c.data.length;
                                    if (!preview) { preview = "[image " + c.data.length + "ch]"; }
                                }
                            }
                        }
                        _log("Tool result:", block.tool_use_id || "?",
                            "isError=" + !!block.is_error,
                            "len=" + len + "ch",
                            preview ? ("preview=" + JSON.stringify(preview)) : "");
                        // Forward the result so the browser can reflect outcome
                        // on the corresponding tool indicator (errored vs ran).
                        const counterId = _toolUseIdToCounter[block.tool_use_id];
                        if (counterId !== undefined) {
                            nodeConnector.triggerPeer("aiToolResult", {
                                requestId: requestId,
                                toolId: counterId,
                                isError: !!block.is_error,
                                preview: preview
                            });
                        }
                    }
                }
            }
        }

        // Flush any remaining accumulated text
        if (accumulatedText) {
            textStreamSendCount++;
            nodeConnector.triggerPeer("aiTextStream", {
                requestId: requestId,
                text: accumulatedText
            });
        }

        clearTimeout(connectionTimer);
        _log("Complete: tools=" + toolCounter, "edits=" + editCount,
            "textDeltas=" + textDeltaCount, "textSent=" + textStreamSendCount);

        // Signal completion
        nodeConnector.triggerPeer("aiComplete", {
            requestId: requestId,
            sessionId: currentSessionId
        });

    } catch (err) {
        clearTimeout(connectionTimer);
        const errMsg = err.message || String(err);
        const isAbort = signal.aborted || /abort/i.test(errMsg);

        if (isAbort) {
            _log("Cancelled");
            // Keep currentSessionId so the next prompt can resume the same SDK
            // session — the abort just leaves an interrupt marker in the log.
            nodeConnector.triggerPeer("aiComplete", {
                requestId: requestId,
                sessionId: currentSessionId
            });
            return;
        }

        _log("Error:", errMsg.slice(0, 200));

        // Build a detailed error message including stderr context
        let detailedError = errMsg;
        const stderrContext = _lastStderrLines
            .filter(line => !line.startsWith("Spawning Claude Code"))
            .join("\n").trim();
        if (stderrContext) {
            detailedError += "\n" + stderrContext;
        }
        // Add hint for custom API settings when process exits with code 1
        if (/exited with code 1/.test(errMsg) && envOverrides) {
            if (envOverrides.ANTHROPIC_AUTH_TOKEN) {
                detailedError += "\nThis may be caused by an invalid API key. " +
                    "Check your API key in Claude Code Settings.";
            }
            if (envOverrides.ANTHROPIC_BASE_URL) {
                detailedError += "\nCustom Base URL: " + envOverrides.ANTHROPIC_BASE_URL;
            }
        }

        // Keep currentSessionId so the user can retry — errors are often
        // transient (network, rate limit), and if the session really is broken
        // the next attempt will surface a fresh error of its own.

        // Expired/revoked OAuth logins only surface at request time — `claude
        // auth status` still reports loggedIn because the credentials exist,
        // but the CLI exits non-zero with a /login hint. Flag it so the
        // panel can offer a re-login action instead of a raw exit-code
        // error. Custom API-key providers are excluded — their fix is the
        // settings-dialog hint appended above.
        const usingApiKey = !!(envOverrides && envOverrides.ANTHROPIC_AUTH_TOKEN);
        // `\b401\b` is the load-bearing match: error phrasing keeps changing
        // across CLI/SDK versions ("Failed to authenticate", "OAuth access
        // token has expired", "token revoked"...) but the status code stays
        // 401. Phrase alternatives remain for exit-code failures where the
        // CLI prints a /login hint without any status code. 403 is
        // deliberately excluded — it means "forbidden", not "re-login".
        const isAuthError = !usingApiKey &&
            /run \/login|invalid api key|not logged in|oauth[\w ]*token|\b401\b|re-?authenticate|revoke|authentication[_ ]?error/i
                .test(detailedError);

        nodeConnector.triggerPeer("aiError", {
            requestId: requestId,
            error: detailedError,
            isAuthError: isAuthError
        });

        // Always send aiComplete after aiError so the UI exits streaming state
        nodeConnector.triggerPeer("aiComplete", {
            requestId: requestId,
            sessionId: currentSessionId
        });
    }
}
