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

### 2. Start the shared hub and configure your coding agent

Run `npm run serve` from the Phoenix repository. It serves the app on port 8000 and supervises
one Builder hub on localhost:38571. Each coding agent runs its own small stdio adapter; several
adapters can use that hub together. The adapter can list tools while serve is offline, and
reconnects when the hub returns. It never retries an uncertain tool call automatically.

Set `PHOENIX_DESKTOP_PATH` in the environment that starts **serve** if the desktop checkout is
not `../phoenix-desktop`. Set `PHOENIX_MCP_WS_PORT` consistently for serve, adapters and Phoenix
if using a different port. `PHOENIX_BUILDER_HUB=0` disables the hub on a secondary web server.
Source notes are stored in `phoenix-builder-mcp/.state/source-notes.json`; set
`PHOENIX_BUILDER_STATE_DIR` on serve to choose another directory.

#### Claude Code

The project root already contains `.mcp.json` which registers the server automatically:

```json
{
    "mcpServers": {
        "phoenix-builder": {
            "command": "node",
            "args": ["phoenix-builder-mcp/index.js"]
        }
    }
}
```

Optionally set `PHOENIX_BUILDER_AGENT_NAME` on an adapter to label it `claude`, `codex`, or another
friendly name. Otherwise the MCP client name is used. The hub adds a unique suffix and maintains
a separate UUID session identity; display names are not ownership credentials.

#### Codex

The repository includes [`.codex/config.toml`](../.codex/config.toml), which registers the same `phoenix-builder` server for local Codex clients. Each teammate gets this configuration with their checkout; there are no usernames or absolute paths to edit, and no global `codex mcp add` command is needed.

1. Install the dependencies above (the repository's root `npm install` also installs them).
2. Open this checkout in Codex and trust the project when prompted. Codex only loads project MCP configuration for trusted projects.
3. Restart Codex after pulling this configuration. In the CLI, run `codex mcp list` from this checkout to check registration, or use `/mcp` in an interactive session to check the connection.
4. Ask Codex to check `get_phoenix_status` and reuse a connected dev instance, or launch one with `start_phoenix`.

The launcher works from the repository root or a subdirectory, including paths containing spaces.
It uses Node.js directly and does not require a Unix shell. Node.js and npm must be on the PATH
available to Codex. The desktop path belongs to the hub's `npm run serve` environment, rather
than an individual adapter's configuration.

Codex also reads the existing [`CLAUDE.md`](../CLAUDE.md) through `project_doc_fallback_filenames`, so both agents use the same development rules and Phoenix testing guidance. Claude's `.mcp.json` and instructions continue to work as before. This setup controls the dev build externally; it does not replace the Claude SDK used inside Phoenix's AI sidebar.

See the official [Codex MCP documentation](https://developers.openai.com/codex/mcp/) for configuration and [instruction discovery](https://developers.openai.com/codex/guides/agents-md/) for fallback filenames.

#### Switching between clients and upgrading an existing session

Adapters no longer own the app listener or the local Phoenix process. Closing one adapter ends
only its agent session; the hub and other adapters remain available. Stop/restart serve to stop
its owned hub. An occupied Builder port is reported without terminating its current owner;
web serving continues, but the new hub is unavailable until the conflict is resolved.

For the first upgrade from the old single-owner server, disconnect the old Builder MCP,
restart `npm run serve`, then reconnect each coding agent's Builder MCP. Existing Phoenix
windows reconnect to the same port. Do not run a second hub over the old listener or kill a
process merely because it occupies the port.

#### Reserve a machine

Use canonical `machineId` values from Builder status or remote-control (`local` for this
controller). Unknown/legacy app identities are shown as unidentified; names are never parsed
into IDs. Reservations also work before an app connects, so a machine can be reserved for setup.

1. Call `reserve_machine({machineId, reason, queue: true})`. A free machine is granted immediately;
   otherwise the request joins FIFO. Without `queue: true`, a busy result leaves the queue unchanged.
2. Read `sourceCodeChangedNote` on every grant and inspect existing source and jobs. Notes are
   peer context, not permission to discard another person's uncommitted or unsaved work.
3. Before editing/syncing, call `update_source_code_note` with the reservation ID, affected checkout,
   disposition (`disposable`, `preserve`, `unknown`), phase and optional sync/job ID. Await persistence.
4. Update after success/failure, then `release_machine`. Release may include a final note, persisted
   before the next grant. `dequeue_machine` removes your pending request at any position; an already
   granted request needs release. `get_reservation_status` lists owners, queues, notes and agents.

One reservation covers the entire machine, including Builder and remote-control activity.
Reservations are explicit coordination: ordinary Phoenix messages neither enforce nor change them.
There are no partial locks, upgrades, leases or heartbeats. A local adapter's socket close/error
releases its ownership and queued entries. An idle turn or app reload does not. A hung but still
connected adapter retains ownership until disconnected. Reconnecting creates a new session.

Source notes survive release, disconnect and hub restart. Ownership and wait queues are in RAM
and are not restored after restart. A new owner receives existing notes with its grant, even if
source work was interrupted; there is no separate approval gate in the pool. The agent must still
inspect source state and any remaining processes before changing that machine.

#### Wait for a queued request

The reservation response includes a read-only `pollUrl`:

```sh
node phoenix-builder-mcp/wait-for-reservation.js POLL_URL --timeout-ms 3600000
```

The monitor polls with backoff and emits one JSON result when granted (exit 0). Cancellation,
release or session loss ends without a grant (exit 2); timeout/error exits 1. A monitor timeout
does not dequeue the request. Polling never acquires a reservation or keeps the adapter alive.

For an agent host that exposes a supported wakeup command:

```sh
node phoenix-builder-mcp/wait-for-reservation.js POLL_URL --notify node /path/to/host-wakeup.js
```

The command runs once, with the grant JSON in `PHOENIX_BUILDER_GRANT`. It is spawned directly,
without shell evaluation; notes are data. Run the monitor in the agent's supported background
worker/task mechanism. Plain stdout or a desktop notification is not proof that an idle model
has resumed. The executable notification bridge is verified; host-specific idle-turn wakeup
requires configuration and verification in that host. Do not start a second agent session and
assume it owns the original adapter's reservation.

The hub holds one terminal log history capped at 10,000 entries in RAM. Each adapter keeps only
read/clear positions into it. Reading or clearing one adapter's view does not delete another's
history; old entries are evicted once for everyone. The cap is by entries, not bytes. Phoenix's
existing browser-console buffers remain in their app windows.

Builder binds to `localhost` and intentionally trusts every renderer Origin, including custom `phtaur://…` and `phtauri://…` URLs. The listener is for trusted development apps. The optional remote framework has separate authentication for workers and its dashboard.

### Enable Builder MCP in a production desktop build

From the repository root or this `phoenix-builder-mcp` directory, run:

```sh
npm run enableBuilderMcpInProd
```

The single [Node.js script](enable-in-prod/index.cjs) works on Windows, macOS and Linux and needs
no npm dependencies. It asks whether to **Enable for today**, **Disable**, or **Cancel** (the default).
After you choose an action, it requests `sudo` access on Linux/macOS or Windows administrator
approval through UAC. You do not need to run npm itself as administrator.

It sets today's **local** date in `prodMCPOverrideDate` in the existing system override file:

| Platform | File |
| --- | --- |
| Windows | `C:\Program Files\Phoenix Code Control\phoenix_override_config.json` |
| macOS | `/Library/Application Support/Phoenix Code Control/phoenix_override_config.json` |
| Linux | `/etc/phoenix-code-control/phoenix_override_config.json` |

Other override settings are preserved. Disable removes only the Builder permission, deleting the
file if no settings remain. Invalid JSON is left untouched and reported instead of overwritten.

**Restart the production app twice after enabling or disabling.** Boot uses a cached permission:
the first start refreshes it from the file and the second applies it. The permission is valid only
for that local calendar day; run this command again on another day to renew it. This does not
disconnect an already running session. Start the Builder MCP server separately using the setup
above; the script only manages the desktop app's permission file.

### Optional remote machines

Use two independent MCP servers: **Phoenix Builder** for app interaction, screenshots and Jasmine tests, and **remote-control** for machine discovery, remote commands, file transfers, Git sync and agent coordination. Builder has no framework package dependency and opens no orchestrator agent session. Local Builder use needs no remote framework.

1. Start `npm run controller` in `remote-agent-control`. Its worker port accepts localhost and LAN connections by default; `-- --worker-host <address>` optionally restricts the listener. The dashboard stays localhost-only.
2. Run `npm run worker` only on remote machines. Pair them in the controller's localhost dashboard and give each a distinct name and plain-text context notes. The controller computer is already **This machine**; it needs no worker process, local connection, or pairing.
3. In **Port forwarding**, forward the remote workers' localhost port `38571` to port `38571` on **This machine** (`local`). Leave Phoenix's connection URL at `ws://localhost:38571`.
4. Activate the standalone remote-control MCP from the dashboard's **MCP** tab, then reconnect your coding agent's MCP servers. Existing Builder tools such as `exec_js`, screenshots and Jasmine tests address the remote app by its displayed instance name.

Phoenix probes `http://localhost:38572/v1/metadata` for at most 500 ms before connecting. When a paired worker is connected, the displayed name becomes `<machine-name>-<existing-window-name>`. The stored window name and custom WebSocket URL are preserved. Missing, rejected or invalid metadata falls back to the existing name. Keep the probe permitted by the worker's metadata-origin configuration when using a custom host; `phtauri://localhost` is permitted by default.

The app's existing WebSocket `hello` also includes `machineId` from valid metadata: the paired
remote-control host ID, or `local` for the controller's own machine. The field is omitted when
metadata is unavailable or invalid and is refreshed on every connection attempt. Existing
Builder servers accept this additional field. The shared hub's status includes a `machines`
array grouping instance names by that ID, alongside the existing `connectedInstances` list.

All `remote_*` tools belong to the standalone remote-control MCP. Use it to inspect machine context, sync source and launch the remote app; then use Builder tools with the exact machine-prefixed app or test-runner name. Forwarding carries the existing app WebSocket protocol without a Builder-side proxy client.

Native app tests need development checkouts and dependencies installed on the executing machine. On Ubuntu, building `src-node` dependencies can require `build-essential`, `pkg-config`, and `libsecret-1-dev`. Review any npm lifecycle approvals for the required native packages. Start the worker from the intended desktop session so GUI jobs inherit its display access; an SSH connection alone does not establish desktop readiness.

Wait for a verified sync snapshot before running tests. SpecRunner uses fresh module URLs on each load so reruns observe saved source edits, including native custom-protocol pages. Node helper or desktop-shell changes can still require restarting the remote app. Select the machine-prefixed app and runner names explicitly when local and remote windows are connected together.

Remote jobs and transfers belong to the standalone remote-control MCP connection and are cleaned up when that connection ends. Closing one Builder adapter releases its reservations but leaves shared app connections running.
Stopping the hub ends its app-control sockets and its managed local process. Neither action ends
the independent remote-control session. Persisted forwarding rules remain machine configuration. The existing `start_phoenix`/`stop_phoenix` and terminal logs concern the local desktop process; use remote-control execution to launch a remote app. AI-model fixture installation and report tooling remain local and are not made remote-aware by forwarding an app socket.

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
