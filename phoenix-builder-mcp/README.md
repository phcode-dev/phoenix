# Phoenix Builder MCP

An MCP (Model Context Protocol) server that lets Claude Code or Codex launch, control, and inspect a running Phoenix Code instance. It also includes a Chrome extension that enables screenshot capture when Phoenix runs in a browser.

## Prerequisites

- Node.js
- The [phoenix-desktop](https://github.com/nicedoc/phoenix-desktop) repo cloned alongside this repo (i.e. `../phoenix-desktop`)

## Setup

### 1. Install dependencies

```bash
cd phoenix-builder-mcp
npm install
```

### 2. Configure your coding agent

#### Claude Code

The project root already contains `.mcp.json` which registers the server automatically:

```json
{
    "mcpServers": {
        "phoenix-builder": {
            "command": "node",
            "args": ["phoenix-builder-mcp/index.js"],
            "env": {
                "PHOENIX_DESKTOP_PATH": "../phoenix-desktop"
            }
        }
    }
}
```

Set `PHOENIX_DESKTOP_PATH` to the path of your phoenix-desktop checkout if it is not at `../phoenix-desktop`.

You can also set `PHOENIX_MCP_WS_PORT` (default `38571`) to change the WebSocket port used for communication between the MCP server and the Phoenix browser runtime.

#### Codex

The repository includes [`.codex/config.toml`](../.codex/config.toml), which registers the same `phoenix-builder` server for local Codex clients. Each teammate gets this configuration with their checkout; there are no usernames or absolute paths to edit, and no global `codex mcp add` command is needed.

1. Install the dependencies above (the repository's root `npm install` also installs them).
2. Open this checkout in Codex and trust the project when prompted. Codex only loads project MCP configuration for trusted projects.
3. Restart Codex after pulling this configuration. In the CLI, run `codex mcp list` from this checkout to check registration, or use `/mcp` in an interactive session to check the connection.
4. Ask Codex to check `get_phoenix_status` and reuse a connected dev instance, or launch one with `start_phoenix`.

The launcher works from the repository root or a subdirectory, including checkout paths containing spaces. It uses Node.js directly, so it does not depend on a Unix shell. The default desktop checkout is `../phoenix-desktop`, resolved relative to this checkout. For a different layout (including Git worktrees), set `PHOENIX_DESKTOP_PATH` in the environment that starts Codex. `PHOENIX_MCP_WS_PORT` is also forwarded. Alternatively, put machine-specific overrides in your personal `~/.codex/config.toml`, not in the shared project file:

```toml
[mcp_servers.phoenix-builder.env]
PHOENIX_DESKTOP_PATH = "/absolute/path/to/phoenix-desktop"
```

For Windows TOML paths, use forward slashes (for example `C:/dev/phoenix-desktop`) or literal single-quoted strings. Node.js and npm must be on the PATH available to Codex.

Codex also reads the existing [`CLAUDE.md`](../CLAUDE.md) through `project_doc_fallback_filenames`, so both agents use the same development rules and Phoenix testing guidance. Claude's `.mcp.json` and instructions continue to work as before. This setup controls the dev build externally; it does not replace the Claude SDK used inside Phoenix's AI sidebar.

See the official [Codex MCP documentation](https://developers.openai.com/codex/mcp/) for configuration and [instruction discovery](https://developers.openai.com/codex/guides/agents-md/) for fallback filenames.

#### Switching between clients

The current Builder server supports **one coding-agent connection per checkout at a time**. Close the active Claude/Codex MCP session before switching clients. Starting a second server terminates the previous server and may stop the desktop app it launched. Separate ports alone do not provide simultaneous support, because the server also shares a PID file. This is an existing server limitation; the Codex configuration does not change it.

### 3. Enable the connection in Phoenix

Use a **dev build**, open the **Phoenix Builder MCP…** command, enable the connection, and use `ws://localhost:38571` (or your configured port). Reload Phoenix after first enabling it: the connection is initialized during boot. The dialog still labels its configuration example as Claude Code; Codex connects to the same server using the project configuration above.

### 4. Chrome extension (for browser screenshots)

Screenshots work out of the box in the Electron/Tauri desktop app. If you are running Phoenix in a browser (e.g. `localhost` or `phcode.dev`), you need to install the Chrome extension:

#### Loading as an unpacked extension (development)

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the `phoenix-builder-mcp/chrome_extension/` directory.
5. The extension will appear as "Phoenix Code Screenshot".

Once loaded, any Phoenix page on `localhost` or `phcode.dev` will have `window._phoenixScreenshotExtensionAvailable` set to `true`, and the `take_screenshot` MCP tool and `Phoenix.app.screenShotBinary()` API will work in the browser.

#### Building a .zip for distribution

```bash
cd phoenix-builder-mcp/chrome_extension
./build.sh
```

This produces `chrome_extension/build/phoenix-screenshot-extension.zip`.

To build a signed `.crx` you need the Chrome binary and a private key:

```bash
chrome --pack-extension=./phoenix-builder-mcp/chrome_extension --pack-extension-key=key.pem
```

## MCP Tools

Once the MCP server is running, the following tools are available in Claude Code and Codex:

### `start_phoenix`
Launches the Phoenix Code Electron app by running `npm run serve:electron` in the phoenix-desktop directory. Returns the process PID and WebSocket port.

### `stop_phoenix`
Stops the running Phoenix Code process (SIGTERM, then SIGKILL after 5s).

### `get_phoenix_status`
Returns process status, PID, WebSocket connection state, connected instance names, and the WS port.

### `get_terminal_logs`
Returns stdout/stderr from the Electron process. By default returns only new logs since the last call. Pass `clear: true` to get all logs and clear the buffer.

### `get_browser_console_logs`
Returns `console.log`/`warn`/`error` output forwarded from the Phoenix browser runtime over WebSocket. Supports the same `clear` flag. When multiple Phoenix instances are connected, pass `instance` to target a specific one (e.g. `"Phoenix-a3f2"`).

### `take_screenshot`
Captures a PNG screenshot of the Phoenix window. Optionally pass a `selector` (CSS selector string) to capture a specific element. Returns the image directly as `image/png`.

In Electron/Tauri this uses the native capture API. In the browser it requires the Chrome extension (see above).

### `exec_js`
Runs JavaScript inside Phoenix with access to jQuery and `brackets.test.*` modules. Use it to inspect the editor, click UI elements, enter text, or call layout APIs. Supports `await`; explicitly `return` a value to see the result. For example, `return document.title;` inspects the connected page.

### `exec_js_in_live_preview`
Runs JavaScript inside the HTML page being previewed. Use it for DOM inspection and interactions with the preview, rather than the Phoenix UI. This tool uses synchronous evaluation and does not support `await`.

### `run_tests` / `get_test_results`
Run and inspect tests in a separately opened, MCP-enabled `SpecRunner.html` window. Follow [`CLAUDE.md`](../CLAUDE.md) for supported categories, suite discovery, and test-runner instance selection.

### `reload_phoenix`
Reloads the Phoenix app. Prompts to save unsaved files before reloading.

### `force_reload_phoenix`
Force-reloads the Phoenix app without saving unsaved changes.

### `run_ai_test_suite`
Starts (or resumes) the AI panel model tests and hands the session everything it needs: installs the fixture project, gathers git revisions / CLI version / connected instance, opens a run record, and returns the runner briefing plus the test documents from `src/extensionsIntegrated/phoenix-pro/unit-tests/ai_model_tests/`. The session is the runner and the judge. `suite`: `quick` (default), `all`, or a suite name; or `tests: ["EC-1","UB-2"]` for specific tests; or `resumeRunId` to continue a stopped run. Ask Claude: *"run the AI test suite"*, *"run just the plan-mode tests"*, *"run EC-1 and UB-2"*.

### `ai_test_progress`
Called by the runner after every test to record the result; also answers *"how far along is it?"* (`{ runId }`), lists runs (`{}`), and stops a run (`{ runId, stop: true }`). Progress lives in `reports/runs/<runId>.json`, which you can open at any time.

### `save_ai_test_report`
Writes the finished report to `reports/latest.md` inside the suite folder, overwriting the previous run (git history keeps earlier runs; `baseline.md` is never touched). A stopped run is saved with a Partial section listing the unrun tests.

### `compare_ai_test_reports`
Diffs two reports test by test — by default `latest.md` against `baseline.md`, or `against: "previous"` for the last committed run — and flags regressions, quality drops, and slower runs using the thresholds in `model_tests.md`.

## Typical workflow (Claude Code or Codex)

```
> get_phoenix_status     # reuse an already-connected instance when possible
> start_phoenix          # launches the app if needed
> take_screenshot        # see what the UI looks like
> get_browser_console_logs   # check for errors
> reload_phoenix         # pick up code changes
> take_screenshot        # verify the fix
> stop_phoenix           # done
```

## Architecture

```
Claude Code or Codex  <--stdio-->  MCP Server (index.js)
                              |
                              +-- process-manager.js  (spawns/kills Electron)
                              +-- ws-control-server.js (WebSocket on port 38571)
                                       |
                              Phoenix browser runtime
                              (connects back over WS for logs, screenshots, reload)
```

For browser-mode screenshots the flow is:

```
MCP Server  --WS-->  Phoenix runtime  --postMessage-->  Content Script  --chrome.runtime-->  Background SW
                                                                    (captureVisibleTab)
```
