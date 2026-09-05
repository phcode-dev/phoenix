import { z } from "zod";
import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const DEFAULT_MAX_CHARS = 10000;

function _trimToCharBudget(lines, maxChars) {
    let total = 0;
    // Walk backwards (newest first) to keep the most recent entries
    let startIdx = lines.length;
    for (let i = lines.length - 1; i >= 0; i--) {
        const cost = lines[i].length + 1; // +1 for newline
        if (total + cost > maxChars) { break; }
        total += cost;
        startIdx = i;
    }
    return { lines: lines.slice(startIdx), trimmed: startIdx };
}

// ---- AI model test suite ---------------------------------------------------
// The suites are markdown procedures run by a Claude session against the
// connected Phoenix instance; the session is the runner and the judge. These
// tools do the deterministic parts — install the fixture, gather the
// environment, hand over the documents, file the report — so that "run the AI
// test suite" is a single request.

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AI_TESTS_DIR = path.join(REPO_ROOT, "src", "extensionsIntegrated", "phoenix-pro",
    "unit-tests", "ai_model_tests");
const AI_TESTS_FIXTURE_DEST = path.join(os.homedir(), "Documents",
    "Phoenix Code Experimental Build", "ai-model-tests", "taskboard");
const AI_TEST_SUITES = {
    "editor-context": "suite-editor-context.md",
    "tool-discovery": "suite-tool-discovery.md",
    "unsaved-buffers": "suite-unsaved-buffers.md",
    "self-sufficiency": "suite-self-sufficiency.md",
    "bug-fixing": "suite-bug-fixing.md",
    "plan-mode": "suite-plan-mode.md",
    "permissions": "suite-permissions.md"
};
// The four model runs that have caught every regression seen so far, plus the
// free deterministic/piggyback checks. See model_tests.md, "Deterministic first".
const AI_TEST_QUICK = {
    suites: ["editor-context", "unsaved-buffers", "self-sufficiency", "bug-fixing"],
    tests: ["UB-1", "EC-5", "EC-2", "SS-4", "EC-1", "UB-2", "SS-1", "BF-1"]
};

function _gitInfo(cwd) {
    try {
        const rev = execSync("git rev-parse --short HEAD", { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
        const branch = execSync("git branch --show-current", { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
        const dirty = execSync("git status --porcelain", { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim() ? " (uncommitted changes)" : "";
        return `${rev} on ${branch}${dirty}`;
    } catch (e) {
        return "unknown";
    }
}

function _claudeCliVersion() {
    try {
        return execSync("claude --version", { stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).toString().trim();
    } catch (e) {
        return "unknown (read it from the panel's logs)";
    }
}

// Two committed files only: baseline.md (the reference, edited by hand) and
// latest.md (overwritten every run — git history is the archive). Anything
// else in the folder is listed but not special.
const AI_TEST_REPORT_LATEST = "latest.md";
const AI_TEST_REPORT_BASELINE = "baseline.md";
function _listReports() {
    const dir = path.join(AI_TESTS_DIR, "reports");
    if (!fs.existsSync(dir)) { return []; }
    return fs.readdirSync(dir).filter(f => f.endsWith(".md")).sort();
}
// The committed version of a report file, for `against: "previous"`.
function _gitHeadVersion(fileName) {
    const proDir = path.join(REPO_ROOT, "src", "extensionsIntegrated", "phoenix-pro");
    const rel = path.posix.join("unit-tests", "ai_model_tests", "reports", fileName);
    try {
        return execSync(`git show HEAD:${rel}`, { cwd: proDir, stdio: ["ignore", "pipe", "ignore"] }).toString();
    } catch (e) {
        return null;
    }
}

function _countTests(markdown) {
    return (markdown.match(/^## [A-Z]{2}-\d+/gm) || []).length;
}

function _todayStamp() {
    return new Date().toISOString().slice(0, 10);
}

const AI_TEST_RUNS_DIR = path.join(AI_TESTS_DIR, "reports", "runs");

function _runPath(runId) {
    return path.join(AI_TEST_RUNS_DIR, runId.replace(/[^a-zA-Z0-9-]+/g, "-") + ".json");
}
function _saveRun(run) {
    fs.mkdirSync(AI_TEST_RUNS_DIR, { recursive: true });
    fs.writeFileSync(_runPath(run.runId), JSON.stringify(run, null, 2) + "\n", "utf8");
}
function _loadRun(runId) {
    const p = _runPath(runId);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}
function _listRuns() {
    if (!fs.existsSync(AI_TEST_RUNS_DIR)) { return []; }
    return fs.readdirSync(AI_TEST_RUNS_DIR).filter(f => f.endsWith(".json")).map(f => f.slice(0, -5)).sort().reverse();
}
function _countResults(results) {
    const c = { PASS: 0, FAIL: 0, FLAKY: 0, BLOCKED: 0, good: 0, acceptable: 0, poor: 0 };
    for (const r of results) {
        if (c[r.invariants] !== undefined) { c[r.invariants]++; }
        if (c[r.judgement] !== undefined) { c[r.judgement]++; }
    }
    return c;
}
// Every "## XX-n — title" heading across the suite files, keyed by id.
function _loadTestCatalog() {
    const catalog = {};
    for (const [suite, file] of Object.entries(AI_TEST_SUITES)) {
        const full = path.join(AI_TESTS_DIR, file);
        if (!fs.existsSync(full)) { continue; }
        for (const m of fs.readFileSync(full, "utf8").matchAll(/^## ([A-Z]{2}-\d+)\s*—\s*(.+)$/gm)) {
            catalog[m[1]] = { suite, file, title: m[2].trim() };
        }
    }
    return catalog;
}
// Rows of a report's "## Results" table, keyed by test id. Tolerates the
// baseline's range rows ("EC-2..EC-6") by keying them as written.
function _parseResults(markdown) {
    const out = {};
    const sec = markdown.split(/^## Results/m)[1];
    if (!sec) { return out; }
    for (const line of sec.split("\n")) {
        if (!line.startsWith("|") || /^\|\s*-/.test(line) || /^\|\s*Suite/.test(line)) { continue; }
        const cells = line.split("|").slice(1, -1).map(c => c.trim());
        if (cells.length < 4) { continue; }
        const id = cells[1];
        if (!/^[A-Z]{2}-\d/.test(id)) { continue; }
        const num = v => { const m = String(v || "").match(/[\d.]+/); return m ? parseFloat(m[0]) : null; };
        // Result cell is "PASS · poor" (or older reports: separate Invariants
        // and Judgement columns). Detect which by whether column 3 looks like a
        // judgement word.
        const parts = (cells[2] || "").split(/\s*[·/]\s*/);
        const separate = /^(good|acceptable|poor|n\/a|—|-)$/i.test(cells[3] || "");
        const inv = parts[0].split(/\s/)[0].toUpperCase();
        const jud = (separate ? cells[3] : (parts[1] || "")).split(/\s/)[0].toLowerCase();
        const off = separate ? 4 : 3;
        out[id] = { inv, jud, tools: num(cells[off]), turns: num(cells[off + 1]), timeS: num(cells[off + 2]), cost: num(cells[off + 3]) };
    }
    return out;
}

export function registerTools(server, processManager, wsControlServer, phoenixDesktopPath) {
    server.tool(
        "start_phoenix",
        "Start the Phoenix Code desktop app (Electron). Launches npm run serve:electron in the phoenix-desktop directory.",
        {},
        async () => {
            try {
                if (processManager.isRunning()) {
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                error: "Phoenix is already running",
                                pid: processManager.getPid()
                            })
                        }]
                    };
                }
                const result = await processManager.start(phoenixDesktopPath);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            pid: result.pid,
                            wsPort: wsControlServer.getPort()
                        })
                    }]
                };
            } catch (err) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ success: false, error: err.message })
                    }]
                };
            }
        }
    );

    server.tool(
        "stop_phoenix",
        "Stop the running Phoenix Code desktop app.",
        {},
        async () => {
            try {
                const result = await processManager.stop();
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(result)
                    }]
                };
            } catch (err) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ success: false, error: err.message })
                    }]
                };
            }
        }
    );

    server.tool(
        "get_terminal_logs",
        "Get stdout/stderr output from the Electron process. Returns last 50 entries by default. " +
        "USAGE: Start with default tail=50. Use filter (regex) to narrow results (e.g. filter='error|warn'). " +
        "Use before=N (from previous totalEntries) to page back. Avoid tail=0 unless necessary — " +
        "prefer filter + small tail to keep responses compact.",
        {
            clear: z.boolean().default(false).describe("If true, return all logs and clear the buffer. If false, return only new logs since last read."),
            tail: z.number().default(50).describe("Return last N entries. 0 = all."),
            before: z.number().optional().describe("Cursor: return entries before this totalEntries position. Use the totalEntries value from a previous response to page back stably."),
            filter: z.string().optional().describe("Optional regex to filter log entries by text content. Applied before tail/before."),
            maxChars: z.number().default(DEFAULT_MAX_CHARS).describe("Max character budget for log content. Oldest entries are dropped first to fit. 0 = unlimited.")
        },
        async ({ clear, tail, before, filter, maxChars }) => {
            let logs;
            if (clear) {
                logs = processManager.getTerminalLogs(false);
                processManager.clearTerminalLogs();
            } else {
                logs = processManager.getTerminalLogs(true);
            }
            const totalEntries = processManager.getTerminalLogsTotalPushed();
            let filterRe;
            if (filter) {
                try {
                    filterRe = new RegExp(filter, "i");
                } catch (e) {
                    return {
                        content: [{
                            type: "text",
                            text: `Invalid filter regex: ${e.message}`
                        }]
                    };
                }
                logs = logs.filter(e => filterRe.test(e.text));
            }
            const matchedEntries = logs.length;
            const endIdx = before != null ? Math.max(0, Math.min(matchedEntries, before)) : matchedEntries;
            if (tail > 0) {
                const startIdx = Math.max(0, endIdx - tail);
                logs = logs.slice(startIdx, endIdx);
            } else {
                logs = logs.slice(0, endIdx);
            }
            let lines = logs.map(e => `[${e.stream}] ${e.text}`);
            let trimmed = 0;
            if (maxChars > 0) {
                const result = _trimToCharBudget(lines, maxChars);
                lines = result.lines;
                trimmed = result.trimmed;
            }
            const showing = lines.length;
            const rangeEnd = endIdx;
            const rangeStart = rangeEnd - logs.length;
            const actualStart = rangeStart + trimmed;
            const hasMore = actualStart > 0;
            let header = `[Logs: ${totalEntries} total`;
            if (filter) {
                header += `, ${matchedEntries} matched /${filter}/i`;
            }
            header += `, showing ${actualStart}-${rangeEnd} (${showing} entries).`;
            if (trimmed > 0) {
                header += ` ${trimmed} entries trimmed to fit maxChars=${maxChars}.`;
            }
            if (hasMore) {
                header += ` hasMore=true, use before=${actualStart} to page back.`;
            }
            header += `]`;
            const text = lines.join("");
            return {
                content: [{
                    type: "text",
                    text: text ? header + "\n" + text : "(no terminal logs)"
                }]
            };
        }
    );

    server.tool(
        "get_browser_console_logs",
        "Get console logs from the Phoenix browser runtime. Returns last 50 entries by default. " +
        "This includes both browser-side console logs and Node.js (PhNode) logs, which are prefixed with 'PhNode:'. " +
        "USAGE: Start with default tail=50. Use filter (regex) to narrow results (e.g. filter='error|warn'). " +
        "Use before=N (from previous totalEntries) to page back. Avoid tail=0 unless necessary — " +
        "prefer filter + small tail to keep responses compact.",
        {
            instance: z.string().optional().describe("Target a specific Phoenix instance by name (e.g. 'Phoenix-a3f2'). Required when multiple instances are connected."),
            tail: z.number().default(50).describe("Return last N entries. 0 = all."),
            before: z.number().optional().describe("Cursor: return entries before this totalEntries position. Use the totalEntries value from a previous response to page back stably."),
            filter: z.string().optional().describe("Optional regex to filter log entries by message content. Applied before tail/before."),
            maxChars: z.number().default(DEFAULT_MAX_CHARS).describe("Max character budget for log content. Oldest entries are dropped first to fit. 0 = unlimited.")
        },
        async ({ instance, tail, before, filter, maxChars }) => {
            try {
                const result = await wsControlServer.requestLogs(instance, { tail, before, filter });
                const entries = result.entries || [];
                const totalEntries = result.totalEntries || entries.length;
                const matchedEntries = result.matchedEntries != null ? result.matchedEntries : entries.length;
                const rangeEnd = result.rangeEnd != null ? result.rangeEnd : matchedEntries;
                let lines = entries.map(e => {
                    let ts = "";
                    if (e.timestamp) {
                        // Show HH:MM:SS.mmm for compact display
                        const d = new Date(e.timestamp);
                        ts = d.toTimeString().slice(0, 8) + "." +
                            String(d.getMilliseconds()).padStart(3, "0") + " ";
                    }
                    return `[${ts}${e.level}] ${e.message}`;
                });
                let trimmed = 0;
                if (maxChars > 0) {
                    const trimResult = _trimToCharBudget(lines, maxChars);
                    lines = trimResult.lines;
                    trimmed = trimResult.trimmed;
                }
                const showing = lines.length;
                const rangeStart = rangeEnd - entries.length;
                const actualStart = rangeStart + trimmed;
                const hasMore = actualStart > 0;
                let header = `[Logs: ${totalEntries} total`;
                if (filter) {
                    header += `, ${matchedEntries} matched /${filter}/i`;
                }
                header += `, showing ${actualStart}-${rangeEnd} (${showing} entries).`;
                if (trimmed > 0) {
                    header += ` ${trimmed} entries trimmed to fit maxChars=${maxChars}.`;
                }
                if (hasMore) {
                    header += ` hasMore=true, use before=${actualStart} to page back.`;
                }
                header += `]`;
                if (showing === 0) {
                    return {
                        content: [{
                            type: "text",
                            text: "(no browser logs)"
                        }]
                    };
                }
                const text = lines.join("\n");
                return {
                    content: [{
                        type: "text",
                        text: header + "\n" + text
                    }]
                };
            } catch (err) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ error: err.message })
                    }]
                };
            }
        }
    );

    server.tool(
        "take_screenshot",
        "Take a screenshot of the Phoenix Code app window. Returns a PNG image.",
        {
            selector: z.string().optional().describe("Optional CSS selector to capture a specific element"),
            instance: z.string().optional().describe("Target a specific Phoenix instance by name (e.g. 'Phoenix-a3f2'). Required when multiple instances are connected.")
        },
        async ({ selector, instance }) => {
            try {
                const base64Data = await wsControlServer.requestScreenshot(selector, instance);
                return {
                    content: [{
                        type: "image",
                        data: base64Data,
                        mimeType: "image/png"
                    }]
                };
            } catch (err) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ error: err.message })
                    }]
                };
            }
        }
    );

    server.tool(
        "reload_phoenix",
        "Reload the Phoenix Code app. Closes all open files (prompting to save unsaved changes) then reloads the app.",
        {
            instance: z.string().optional().describe("Target a specific Phoenix instance by name (e.g. 'Phoenix-a3f2'). Required when multiple instances are connected.")
        },
        async ({ instance }) => {
            try {
                const result = await wsControlServer.requestReload(false, instance);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ success: true, message: "Phoenix is reloading" })
                    }]
                };
            } catch (err) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ error: err.message })
                    }]
                };
            }
        }
    );

    server.tool(
        "force_reload_phoenix",
        "Force reload the Phoenix Code app without saving. Closes all open files without saving unsaved changes, then reloads the app.",
        {
            instance: z.string().optional().describe("Target a specific Phoenix instance by name (e.g. 'Phoenix-a3f2'). Required when multiple instances are connected.")
        },
        async ({ instance }) => {
            try {
                const result = await wsControlServer.requestReload(true, instance);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ success: true, message: "Phoenix is force reloading (unsaved changes discarded)" })
                    }]
                };
            } catch (err) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ error: err.message })
                    }]
                };
            }
        }
    );

    server.tool(
        "exec_js",
        "Execute JavaScript in the Phoenix Code browser runtime and return the result. " +
        "Code runs async in the page context with access to: " +
        "$ (jQuery) for DOM queries/clicks, " +
        "brackets.test.CommandManager, brackets.test.EditorManager, " +
        "brackets.test.ProjectManager, brackets.test.DocumentManager, " +
        "brackets.test.FileSystem, brackets.test.FileUtils, " +
        "and 50+ other modules on brackets.test.* — supports await. " +
        "__kernalModeTrust is available as a parameter " +
        "(deleted from window after boot, preserved here for dev/test).",
        {
            code: z.string().describe("JavaScript code to execute in Phoenix"),
            instance: z.string().optional().describe("Target a specific Phoenix instance by name (e.g. 'Phoenix-a3f2'). Required when multiple instances are connected.")
        },
        async ({ code, instance }) => {
            try {
                const result = await wsControlServer.requestExecJs(code, instance);
                return {
                    content: [{
                        type: "text",
                        text: result !== undefined ? String(result) : "(undefined)"
                    }]
                };
            } catch (err) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ error: err.message })
                    }]
                };
            }
        }
    );

    server.tool(
        "exec_js_in_live_preview",
        "Execute JavaScript in the live preview iframe (the page being previewed), NOT in Phoenix itself. " +
        "Auto-opens the live preview panel if it is not already visible. " +
        "Code is evaluated via eval() in the global scope of the previewed page. " +
        "Note: eval() is synchronous — async/await is NOT supported. " +
        "Only available when an HTML file is selected in the live preview — " +
        "does not work for markdown or other non-HTML file types. " +
        "Use this to inspect or manipulate the user's live-previewed web page (e.g. document.title, DOM queries).",
        {
            code: z.string().describe("JavaScript code to execute in the live preview iframe"),
            instance: z.string().optional().describe("Target a specific Phoenix instance by name (e.g. 'Phoenix-a3f2'). Required when multiple instances are connected.")
        },
        async ({ code, instance }) => {
            try {
                const result = await wsControlServer.requestExecJsLivePreview(code, instance);
                return {
                    content: [{
                        type: "text",
                        text: result !== undefined ? String(result) : "(undefined)"
                    }]
                };
            } catch (err) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ error: err.message })
                    }]
                };
            }
        }
    );

    server.tool(
        "exec_js_in_test_iframe",
        "Execute JavaScript in the embedded test Phoenix iframe inside the SpecRunner, NOT in the SpecRunner itself. " +
        "The iframe is usually not present during unit tests, but for other categories tests may spawn it as needed — " +
        "it can come and go at any time. " +
        "Code runs async in the iframe's page context with access to the test Phoenix instance's globals " +
        "(jQuery $, brackets.test.*, etc.). " +
        "Returns an error if no iframe is present. " +
        "Use exec_js to control the SpecRunner (run tests, get results); use this tool to inspect the test Phoenix instance.",
        {
            code: z.string().describe("JavaScript code to execute in the test Phoenix iframe"),
            instance: z.string().optional().describe("Target a specific test runner instance by name. Required when multiple instances are connected.")
        },
        async ({ code, instance }) => {
            try {
                const result = await wsControlServer.requestExecJsInTestIframe(code, instance);
                return {
                    content: [{
                        type: "text",
                        text: result !== undefined ? String(result) : "(undefined)"
                    }]
                };
            } catch (err) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ error: err.message })
                    }]
                };
            }
        }
    );

    server.tool(
        "run_tests",
        "Run tests in the Phoenix test runner (SpecRunner.html). Reloads the test runner with the specified " +
        "category and optional spec filter. The test runner must already be open in a browser with MCP enabled. " +
        "Supported categories: unit, integration, LegacyInteg, livepreview, mainview. " +
        "WARNING: Do NOT use 'all', 'performance', 'extension', or 'individualrun' categories — they are " +
        "not actively supported and the full 'all' suite should never be run. " +
        "To run all tests in a category, omit the spec parameter. " +
        "To run a single suite, pass the suite name as spec (e.g. spec='unit: HTML Code Hinting'). " +
        "Suite names are prefixed with the category and a colon, e.g. 'unit: Editor', 'unit: CSS Parsing'. " +
        "You can also run individual specs by passing the full spec name, but note that individual specs " +
        "may fail when run alone because suites often run tests in order with shared state — prefer " +
        "running the full suite instead of individual specs. " +
        "After calling run_tests, use get_test_results to poll for results.",
        {
            category: z.string().describe("Test category to run: unit, integration, LegacyInteg, livepreview, or mainview."),
            spec: z.string().optional().describe("Optional suite or spec name to run within the category. " +
                "Use the full name including category prefix, e.g. 'unit: CSS Parsing' for a suite. " +
                "Prefer running full suites over individual specs, as specs may depend on suite execution order. " +
                "Omit to run all tests in the category."),
            instance: z.string().optional().describe("Target a specific test runner instance by name. Required when multiple instances are connected.")
        },
        async ({ category, spec, instance }) => {
            try {
                const result = await wsControlServer.requestRunTests(category, spec, instance);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            message: result.message || "Test runner is reloading with category=" + category
                        })
                    }]
                };
            } catch (err) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ error: err.message })
                    }]
                };
            }
        }
    );

    server.tool(
        "get_test_results",
        "Get structured test results from the Phoenix test runner. Returns running status, pass/fail counts, " +
        "failure details, and the currently executing spec. The test runner must already be open with MCP enabled.",
        {
            instance: z.string().optional().describe("Target a specific test runner instance by name. Required when multiple instances are connected.")
        },
        async ({ instance }) => {
            try {
                const result = await wsControlServer.requestTestResults(instance);
                // Remove internal WS fields
                delete result.type;
                delete result.id;
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2)
                    }]
                };
            } catch (err) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ error: err.message })
                    }]
                };
            }
        }
    );

    server.tool(
        "get_phoenix_status",
        "Check the status of the Phoenix process and WebSocket connection.",
        {},
        async () => {
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        processRunning: processManager.isRunning(),
                        pid: processManager.getPid(),
                        wsConnected: wsControlServer.isClientConnected(),
                        connectedInstances: wsControlServer.getConnectedInstances(),
                        wsPort: wsControlServer.getPort()
                    })
                }]
            };
        }
    );

    server.tool(
        "run_ai_test_suite",
        "Start (or resume) the AI panel model tests. You (the calling session) are the runner and the judge: " +
        "this installs the fixture, gathers the environment, opens a run record for progress tracking, and " +
        "returns the runner briefing plus the test documents to follow step by step. Scope: suite = 'quick' " +
        "(default, ~4 model runs + free checks) | 'all' (~20 model runs) | one of " +
        Object.keys(AI_TEST_SUITES).join(", ") + "; or tests = explicit IDs like ['EC-1','UB-2'] to run only " +
        "those. resumeRunId continues an earlier run's remaining tests. After every test call ai_test_progress; " +
        "when done (or told to stop) call save_ai_test_report and tell the user where it is.",
        {
            suite: z.string().optional().describe("quick | all | " + Object.keys(AI_TEST_SUITES).join(" | ")),
            tests: z.array(z.string()).optional().describe("Explicit test IDs to run, e.g. [\"EC-1\",\"UB-2\"]. Overrides suite."),
            resumeRunId: z.string().optional().describe("Run id from a previous briefing; runs only its remaining tests")
        },
        async ({ suite, tests, resumeRunId }) => {
            if (!fs.existsSync(path.join(AI_TESTS_DIR, "model_tests.md"))) {
                return { content: [{ type: "text", text: "Test suite not found at " + AI_TESTS_DIR +
                    ". Is phoenix-pro checked out inside this phoenix repo?" }], isError: true };
            }
            const catalog = _loadTestCatalog(); // { "EC-1": { suite, file, title }, ... }

            let which, planned, run;
            if (resumeRunId) {
                run = _loadRun(resumeRunId);
                if (!run) {
                    return { content: [{ type: "text", text: "No run record '" + resumeRunId + "'. Known runs: " +
                        _listRuns().join(", ") }], isError: true };
                }
                const done = new Set(run.results.map(r => r.test));
                planned = run.planned.filter(t => !done.has(t));
                which = run.scope;
                run.status = "running";
                run.resumedAt = new Date().toISOString();
            } else if (tests && tests.length) {
                const unknown = tests.filter(t => !catalog[t.toUpperCase()]);
                if (unknown.length) {
                    return { content: [{ type: "text", text: "Unknown test id(s): " + unknown.join(", ") +
                        ". Known: " + Object.keys(catalog).join(", ") }], isError: true };
                }
                planned = tests.map(t => t.toUpperCase());
                which = "selected";
            } else {
                which = (suite || "quick").trim().toLowerCase();
                if (which !== "quick" && which !== "all" && !AI_TEST_SUITES[which]) {
                    return { content: [{ type: "text", text: "Unknown suite '" + which + "'. Use quick, all, or one of: " +
                        Object.keys(AI_TEST_SUITES).join(", ") }], isError: true };
                }
                planned = which === "quick" ? AI_TEST_QUICK.tests.slice()
                    : Object.keys(catalog).filter(id => which === "all" || catalog[id].suite === which);
            }
            if (!run) {
                run = {
                    runId: _todayStamp() + "-" + new Date().toTimeString().slice(0, 5).replace(":", "") + "-" + which,
                    scope: which, planned, results: [], status: "running",
                    startedAt: new Date().toISOString(), env: {}
                };
            }

            // H0: install the fixture. Deterministic, so do it here rather than ask the runner.
            const fixtureSrc = path.join(AI_TESTS_DIR, "fixtures", "taskboard");
            fs.mkdirSync(AI_TESTS_FIXTURE_DEST, { recursive: true });
            for (const f of fs.readdirSync(fixtureSrc)) {
                fs.copyFileSync(path.join(fixtureSrc, f), path.join(AI_TESTS_FIXTURE_DEST, f));
            }

            const instances = wsControlServer.getConnectedInstances();
            const electron = instances.filter(i => i.startsWith("phoenix-electron-"));
            const proDir = path.join(REPO_ROOT, "src", "extensionsIntegrated", "phoenix-pro");
            run.env = { phoenix: _gitInfo(REPO_ROOT), phoenixPro: _gitInfo(proDir), claudeCli: _claudeCliVersion(), instance: electron[0] || null };
            _saveRun(run);

            const suiteFiles = [...new Set(planned.map(id => catalog[id].file))];
            const docs = suiteFiles.map(file => ({ file, md: fs.readFileSync(path.join(AI_TESTS_DIR, file), "utf8") }));
            const index = fs.readFileSync(path.join(AI_TESTS_DIR, "model_tests.md"), "utf8");
            const reports = _listReports();
            const baseline = reports.includes(AI_TEST_REPORT_BASELINE) ? AI_TEST_REPORT_BASELINE : null;
            const reportName = AI_TEST_REPORT_LATEST;

            const briefing = [
                "# AI model tests — runner briefing",
                "",
                "You are the runner and the judge. Follow the documents below exactly. Do every step as written,",
                "check every invariant, apply every judgement rubric, and write one or two sentences of reasoning",
                "per test. Run the deterministic checks first, and stop if one fails.",
                "",
                "## Progress, stopping, and the user",
                `- Run id: **${run.runId}**. After EVERY test, call ai_test_progress({ runId, test, invariants, judgement,`,
                "  tools, turns, timeMs, cost, reasoning }). It returns done/total and what remains.",
                "- After every test, tell the user one line: `<test> <PASS|FAIL|FLAKY> <good|acceptable|poor> — n/total done`.",
                `- The run record the user can open at any time: ${_runPath(run.runId)}`,
                "- If the user says stop: finish the step you are in, call ai_test_progress({ runId, stop: true }),",
                "  then save_ai_test_report with what you have — the report is marked partial and lists what was not run.",
                "  It can be resumed later with run_ai_test_suite({ resumeRunId }).",
                "",
                "## What will run",
                `- Scope: **${which}** — ${planned.length} test(s)${resumeRunId ? " remaining" : ""}: ${planned.join(", ")}`,
                ...suiteFiles.map(f => `  - ${f}`),
                which === "quick" ? "- Quick means ONLY the listed tests. Skip everything else in those documents." : "",
                which === "selected" ? "- Selected means ONLY the listed tests. Skip everything else in those documents." : "",
                "",
                "## Environment (put this at the top of the report)",
                "- Runner model: <you — state your model name>",
                "- Model under test: <read the model selector above the panel's chat box>",
                `- phoenix: ${run.env.phoenix}`,
                `- phoenix-pro: ${run.env.phoenixPro}`,
                `- Claude CLI: ${run.env.claudeCli}`,
                `- Connected instances: ${instances.length ? instances.join(", ") : "none — start Phoenix first"}`,
                electron.length ? `- Use instance: ${electron[0]}` : "- No phoenix-electron-* instance is connected. Ask the user to open the desktop app, then call get_phoenix_status.",
                "",
                "## Where things are",
                `- Fixture installed (H0 done for you): ${AI_TESTS_FIXTURE_DEST}`,
                `- In the documents, replace <realpath> with: ${AI_TESTS_FIXTURE_DEST}`,
                `- Transcript folder for H10: ~/.claude/projects/${AI_TESTS_FIXTURE_DEST.replace(/[\/ ]/g, "-")}`,
                `- Test documents: ${AI_TESTS_DIR}`,
                `- Reports folder: ${path.join(AI_TESTS_DIR, "reports")}`,
                `- Compare against: ${baseline ? path.join(AI_TESTS_DIR, "reports", baseline) : "no baseline found — this run becomes the baseline"}`,
                `- Reports in the folder: ${reports.length ? reports.join(", ") : "none"} (earlier runs live in git history of ${reportName})`,
                `- Your report will be saved as: ${reportName} (overwrites the previous run) — call save_ai_test_report({ content, runId: "${run.runId}" }).`,
                "  Then call compare_ai_test_reports({}) to diff it against the baseline — or { against: \"previous\" } for the last committed run — and relay the result.",
                "",
                "---",
                "",
                "# Document 1 of " + (docs.length + 1) + ": model_tests.md (rules, harness, report format)",
                "",
                index,
                ...docs.flatMap((d, i) => ["", "---", "", `# Document ${i + 2} of ${docs.length + 1}: ${d.file}`, "", d.md])
            ].filter(l => l !== null).join("\n");

            return { content: [{ type: "text", text: briefing }] };
        }
    );

    server.tool(
        "ai_test_progress",
        "Record one test's result during an AI model test run, or read a run's progress, or stop it. With test + " +
        "result fields: appends the result and returns done/total/remaining. With only runId: returns current " +
        "progress (use this to answer 'how far along is it?'). With stop: true: marks the run stopped and returns " +
        "what was not run. With no runId at all: lists known runs.",
        {
            runId: z.string().optional().describe("Run id from the briefing"),
            test: z.string().optional().describe("Test id, e.g. EC-1"),
            invariants: z.enum(["PASS", "FAIL", "FLAKY", "BLOCKED"]).optional(),
            judgement: z.enum(["good", "acceptable", "poor", "n/a"]).optional(),
            tools: z.number().optional(), turns: z.number().optional(),
            timeMs: z.number().optional(), cost: z.number().optional(),
            reasoning: z.string().optional().describe("One or two sentences: what the AI did and why that verdict"),
            stop: z.boolean().optional().describe("Mark the run stopped (user asked to stop)")
        },
        async (args) => {
            if (!args.runId) {
                const runs = _listRuns().map(id => { const r = _loadRun(id); return `${id}: ${r.status}, ${r.results.length}/${r.planned.length}`; });
                return { content: [{ type: "text", text: runs.length ? "Known runs:\n" + runs.join("\n") : "No runs recorded." }] };
            }
            const run = _loadRun(args.runId);
            if (!run) {
                return { content: [{ type: "text", text: "No run record '" + args.runId + "'. Known: " + _listRuns().join(", ") }], isError: true };
            }
            if (args.test) {
                const id = args.test.toUpperCase();
                run.results = run.results.filter(r => r.test !== id); // a rerun replaces
                run.results.push({
                    test: id, invariants: args.invariants || "BLOCKED", judgement: args.judgement || "n/a",
                    tools: args.tools, turns: args.turns, timeMs: args.timeMs, cost: args.cost,
                    reasoning: args.reasoning || "", at: new Date().toISOString()
                });
            }
            if (args.stop) {
                run.status = "stopped";
                run.stoppedAt = new Date().toISOString();
            } else if (run.results.length >= run.planned.length && run.planned.every(t => run.results.some(r => r.test === t))) {
                run.status = "complete";
                run.completedAt = new Date().toISOString();
            }
            _saveRun(run);
            const done = run.planned.filter(t => run.results.some(r => r.test === t));
            const remaining = run.planned.filter(t => !done.includes(t));
            const counts = _countResults(run.results);
            return { content: [{ type: "text", text: JSON.stringify({
                runId: run.runId, status: run.status, done: done.length, total: run.planned.length,
                remaining, counts, record: _runPath(run.runId),
                progressLine: `${done.length}/${run.planned.length} done · PASS ${counts.PASS} FAIL ${counts.FAIL} FLAKY ${counts.FLAKY} BLOCKED ${counts.BLOCKED}` +
                    (remaining.length ? ` · next: ${remaining[0]}` : " · all done")
            }, null, 2) }] };
        }
    );

    server.tool(
        "save_ai_test_report",
        "File an AI model test report as reports/latest.md, overwriting the previous run (git history keeps " +
        "earlier runs; baseline.md is never touched). If runId is given and the run was stopped, the report is " +
        "marked partial and the unrun tests are appended. Returns the saved path and the baseline to compare " +
        "against — relay the path to the user.",
        {
            content: z.string().describe("The full report markdown, following the skeleton in model_tests.md"),
            runId: z.string().optional().describe("Run id from the briefing; links the report to its progress record"),
            label: z.string().optional().describe("Ignored for the filename (always latest.md); kept for compatibility")
        },
        async ({ content, runId }) => {
            const dir = path.join(AI_TESTS_DIR, "reports");
            fs.mkdirSync(dir, { recursive: true });
            let body = content.endsWith("\n") ? content : content + "\n";
            const run = runId ? _loadRun(runId) : null;
            let partial = false;
            if (run) {
                const notRun = run.planned.filter(t => !run.results.some(r => r.test === t));
                if (run.status === "stopped" || notRun.length) {
                    partial = true;
                    body += `\n## Partial run\nStopped ${run.stoppedAt || "before completion"}. Not run: ${notRun.join(", ") || "none"}.\n` +
                        `Resume with run_ai_test_suite({ resumeRunId: "${run.runId}" }).\n`;
                }
            }
            const full = path.join(dir, AI_TEST_REPORT_LATEST);
            const hadPrevious = fs.existsSync(full);
            fs.writeFileSync(full, body, "utf8");
            if (run) {
                // A finished run's progress record has done its job; only a
                // stopped (resumable) run keeps its file. Keeps runs/ from piling up.
                if (partial) { run.report = full; _saveRun(run); }
                else if (fs.existsSync(_runPath(run.runId))) { fs.unlinkSync(_runPath(run.runId)); }
            }
            const hasBaseline = fs.existsSync(path.join(dir, AI_TEST_REPORT_BASELINE));
            return { content: [{ type: "text", text: JSON.stringify({
                saved: full,
                partial,
                overwrotePrevious: hadPrevious,
                compareAgainst: hasBaseline ? path.join(dir, AI_TEST_REPORT_BASELINE) : null,
                tellTheUser: "Report saved to " + full + (partial ? " (partial run)" : "") +
                    (hadPrevious ? "; the previous run is in git history" : "") +
                    (hasBaseline ? "; compare with compare_ai_test_reports({}) or { against: \"previous\" }" : "") + "."
            }, null, 2) }] };
        }
    );

    server.tool(
        "compare_ai_test_reports",
        "Diff two AI model test reports test by test: invariant changes (REGRESSION / fixed), judgement changes " +
        "(quality drop / improved), and tool/turn/time deltas with the thresholds from model_tests.md (tools " +
        ">1.5x or time >2x = 'slower'). Defaults: report = latest.md, against = baseline.md. against: 'previous' " +
        "compares latest.md with its last committed version (git HEAD). File names or absolute paths also accepted.",
        {
            report: z.string().optional().describe("Report to evaluate. Default: latest.md"),
            against: z.string().optional().describe("Reference: 'baseline' (default), 'previous' (git HEAD of latest.md), a file name, or a path")
        },
        async ({ report, against }) => {
            const dir = path.join(AI_TESTS_DIR, "reports");
            const reports = _listReports();
            const resolve = (n, fallback) => {
                const pick = n || fallback;
                if (!pick) { return null; }
                const full = path.isAbsolute(pick) ? pick : path.join(dir, pick);
                return fs.existsSync(full) ? full : null;
            };
            const a = resolve(report, AI_TEST_REPORT_LATEST);
            let b, bLabel;
            if ((against || "").toLowerCase() === "previous") {
                const prev = _gitHeadVersion(AI_TEST_REPORT_LATEST);
                if (!prev) {
                    return { content: [{ type: "text", text: "No committed version of " + AI_TEST_REPORT_LATEST +
                        " in git HEAD to compare against." }], isError: true };
                }
                b = path.join(os.tmpdir(), "ai-model-tests-previous-latest.md"); fs.writeFileSync(b, prev, "utf8");
                bLabel = AI_TEST_REPORT_LATEST + " @ git HEAD";
            } else {
                b = resolve((against || "").toLowerCase() === "baseline" ? null : against, AI_TEST_REPORT_BASELINE);
                bLabel = b ? path.basename(b) : null;
            }
            if (!a || !b) {
                return { content: [{ type: "text", text: "Need two reports. Have: " + (reports.join(", ") || "none") +
                    (a ? "" : " — report not found") + (b ? "" : " — reference not found") }], isError: true };
            }
            const A = _parseResults(fs.readFileSync(a, "utf8")), B = _parseResults(fs.readFileSync(b, "utf8"));
            const ids = [...new Set([...Object.keys(B), ...Object.keys(A)])].sort();
            const rows = [], flags = { regression: [], fixed: [], qualityDrop: [], improved: [], slower: [], faster: [], onlyInReport: [], onlyInReference: [] };
            const rank = { good: 2, acceptable: 1, poor: 0 };
            for (const id of ids) {
                const x = A[id], y = B[id];
                if (!x) { flags.onlyInReference.push(id); rows.push(`| ${id} | — | ${y.inv}/${y.jud} | not in report |`); continue; }
                if (!y) { flags.onlyInReport.push(id); rows.push(`| ${id} | ${x.inv}/${x.jud} | — | new |`); continue; }
                const notes = [];
                if (y.inv === "PASS" && x.inv === "FAIL") { flags.regression.push(id); notes.push("**REGRESSION**"); }
                if (y.inv === "FAIL" && x.inv === "PASS") { flags.fixed.push(id); notes.push("fixed"); }
                if (rank[x.jud] !== undefined && rank[y.jud] !== undefined) {
                    if (rank[x.jud] < rank[y.jud]) { flags.qualityDrop.push(id); notes.push("quality drop"); }
                    if (rank[x.jud] > rank[y.jud]) { flags.improved.push(id); notes.push("improved"); }
                }
                if (x.tools && y.tools && x.tools > 1.5 * y.tools) { flags.slower.push(id); notes.push(`tools ${y.tools}→${x.tools}`); }
                if (x.timeS && y.timeS && x.timeS > 2 * y.timeS) { if (!flags.slower.includes(id)) { flags.slower.push(id); } notes.push(`time ${y.timeS}s→${x.timeS}s`); }
                if (x.timeS && y.timeS && x.timeS < 0.5 * y.timeS && x.inv === "PASS") { flags.faster.push(id); notes.push(`faster ${y.timeS}s→${x.timeS}s`); }
                rows.push(`| ${id} | ${x.inv}/${x.jud} | ${y.inv}/${y.jud} | ${notes.join(", ") || "same"} |`);
            }
            const out = [
                `# Comparison: ${path.basename(a)} vs ${bLabel}`,
                "",
                `Regressions: ${flags.regression.length ? flags.regression.join(", ") : "none"}`,
                `Quality drops: ${flags.qualityDrop.length ? flags.qualityDrop.join(", ") : "none"}`,
                `Slower (tools >1.5x or time >2x): ${flags.slower.length ? flags.slower.join(", ") : "none"}`,
                `Fixed: ${flags.fixed.join(", ") || "none"} · Improved judgement: ${flags.improved.join(", ") || "none"} · Faster: ${flags.faster.join(", ") || "none"}`,
                flags.onlyInReport.length ? `Only in report (no reference): ${flags.onlyInReport.join(", ")}` : "",
                flags.onlyInReference.length ? `Not run this time: ${flags.onlyInReference.join(", ")}` : "",
                "",
                "| Test | report (inv/judg) | reference (inv/judg) | change |",
                "| --- | --- | --- | --- |",
                ...rows
            ].filter(Boolean).join("\n");
            return { content: [{ type: "text", text: out }] };
        }
    );

}
