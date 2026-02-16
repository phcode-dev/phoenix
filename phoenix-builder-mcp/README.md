# Phoenix Builder MCP

An MCP (Model Context Protocol) server that lets Claude Code launch, control, and inspect a running Phoenix Code instance. It also includes a Chrome extension that enables screenshot capture when Phoenix runs in a browser.

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

### 3. Chrome extension (for browser screenshots)

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

Once the MCP server is running, the following tools are available in Claude Code:

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

### `reload_phoenix`
Reloads the Phoenix app. Prompts to save unsaved files before reloading.

### `force_reload_phoenix`
Force-reloads the Phoenix app without saving unsaved changes.

## Typical Claude Code workflow

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
Claude Code  <--stdio-->  MCP Server (index.js)
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
