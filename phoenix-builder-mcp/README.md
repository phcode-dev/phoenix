# Phoenix Builder MCP

An MCP (Model Context Protocol) server that lets Claude Code or Codex launch,
control, and inspect a running Phoenix Code instance. It also includes a Chrome
extension that enables screenshot capture when Phoenix runs in a browser.

## Prerequisites

- Node.js
- The [phoenix-desktop](https://github.com/nicedoc/phoenix-desktop) repo cloned alongside this repo (i.e. `../phoenix-desktop`)

## Setup

### 1. Install dependencies

```bash
cd phoenix-builder-mcp
npm install
```

### 2. Claude Code MCP configuration

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
The control socket listens only on `127.0.0.1`.

### 3. Codex MCP configuration

Register the same local stdio server with Codex. Use absolute paths because
Codex may start the server without your interactive shell's Node.js setup:

```bash
codex mcp add phoenix-builder \
    --env PATH=/absolute/path/to/node/bin:/usr/local/bin:/usr/bin:/bin \
    --env PHOENIX_PROJECT_PATH=/absolute/path/to/phoenix \
    --env PHOENIX_DESKTOP_PATH=/absolute/path/to/phoenix-desktop \
    --env PHOENIX_MCP_WS_PORT=38572 \
    -- /absolute/path/to/node /absolute/path/to/phoenix/phoenix-builder-mcp/index.js
```

The CLI stores this registration in `~/.codex/config.toml` by default. The
separate WebSocket port keeps this Codex server independent from a Claude Code
server using the default port (`38571`).

Verify the saved registration with:

```bash
codex mcp get phoenix-builder --json
```

The result should report an enabled `stdio` transport and the absolute command,
arguments, and environment shown above. An `auth_status` of `unsupported` is
normal for a local stdio server; it does not require HTTP authentication.
Start a new Codex session after adding or changing an MCP registration so the
session receives the server's current tool inventory.

Keep the Node.js installation directory in the configured `PATH` so the
`start_phoenix` and `build_phoenix` tools can find `npm`. The project path
defaults to the parent directory of `phoenix-builder-mcp`; set
`PHOENIX_PROJECT_PATH` explicitly when the server is installed elsewhere.
Adjust the remaining directories for your operating system.

Each concurrently running MCP server process must use a unique
`PHOENIX_MCP_WS_PORT`, and each Phoenix app or test-runner instance must connect
to its matching URL. For the example above, set the Phoenix Builder connection
URL to `ws://127.0.0.1:38572`. The Phoenix connection URL is stored in the app;
setting the MCP environment variable does not rewrite it automatically.

If another process already owns the configured port, the new MCP server exits
with an `EADDRINUSE` error. It never terminates or replaces the existing owner.
For a second concurrent Codex session, use a separate Codex configuration with
a different port, such as `38573`, and connect a separate Phoenix instance to
that port.

Codex exposes server-level `enabled_tools` and `disabled_tools` filters in
`config.toml`. Nested per-tool `approval_mode` tables are not part of the
configuration returned by `codex mcp get`; use the supported filters when tool
availability must be restricted.

On a Linux development host where Electron's setuid sandbox helper is
unavailable or does not have the required root ownership and mode, add
`--env ELECTRON_DISABLE_SANDBOX=1` to the command. This disables Electron's
sandbox for the launched development app, so use it only in an isolated local
development environment and omit it when the sandbox helper is configured
correctly.

Run the MCP server's isolated tests with:

```bash
cd phoenix-builder-mcp
npm test
```

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

Once the MCP server is running, the following tools are available in Claude Code
or Codex:

### `start_phoenix`
Launches the Phoenix Code Electron app by running `npm run serve:electron` in the phoenix-desktop directory. Returns the process PID and WebSocket port.

### `build_phoenix`
Starts an allowlisted Phoenix build and returns immediately. Supported targets
include the CM6 bundle, source builds, full builds, development/staging/
production release builds, and standalone distribution-size validation
(`validate-dist-size`). Use `get_build_status` and `get_build_logs` to monitor
it, or `stop_build` to terminate it.

### `get_build_status`
Returns the current or most recent build state, including its process ID, npm
script, timestamps, exit code, and signal.

### `get_build_logs`
Returns buffered stdout/stderr from the current or most recent build.

### `stop_build`
Stops the active build process tree, escalating from SIGTERM to SIGKILL after
the configured grace period.

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

### `reload_phoenix`
Reloads the Phoenix app. Prompts to save unsaved files before reloading.

### `force_reload_phoenix`
Force-reloads the Phoenix app without saving unsaved changes.

### `exec_js`
Executes asynchronous JavaScript in the connected Phoenix runtime.

### `exec_js_in_live_preview`
Executes synchronous JavaScript in the active HTML live-preview iframe.

### `exec_js_in_test_iframe`
Executes asynchronous JavaScript in the embedded Phoenix iframe created by
integration and legacy-integration tests.

### `run_tests`
Reloads a connected Phoenix test runner with one supported category: `unit`,
`integration`, `LegacyInteg`, `livepreview`, or `mainview`. The optional `spec`
must use the exact Jasmine suite or test name; suite names are not consistently
category-prefixed.

### `get_test_results`
Returns structured progress, counts, and failure details from the connected
test runner.

## Typical agent workflow

```
> start_phoenix          # launches the app
> take_screenshot        # see what the UI looks like
> get_browser_console_logs   # check for errors
> reload_phoenix         # pick up code changes
> take_screenshot        # verify the fix
> stop_phoenix           # done
```

## Architecture

```
Claude Code / Codex  <--stdio-->  MCP Server (index.js)
                                      |
                                      +-- process-manager.js  (spawns/kills Electron)
                                      +-- ws-control-server.js (WebSocket on configured port)
                                               |
                                      Phoenix browser runtime
                                      (connects back over WS for logs, screenshots, reload)
```

For browser-mode screenshots the flow is:

```
MCP Server  --WS-->  Phoenix runtime  --postMessage-->  Content Script  --chrome.runtime-->  Background SW
                                                                    (captureVisibleTab)
```
