# Static `file://` live preview for HTML files outside the project (not shipped yet)

Status: **prototyped and verified on the Electron desktop shell on 2026-09-05, then rolled back**. Nothing
in this document is live in the product. Keep it until the feature is picked up again; the full working
patch for this repo is at the bottom, and the Electron main-process code is in the middle.

## Problem

Opening an HTML file that is not inside the current project shows the "Preview Unavailable!" page
(`Strings.DESCRIPTION_LIVEDEV_PREVIEW_RESTRICTED*`, built in `NodeStaticServer._getExternalPreviewURL`).
We deliberately refuse to serve such files over the live preview http server: a page served from a
non-project location could walk the disk with relative URLs (`../../.aws/credentials`), read the content
and post it to a remote server. Only project files are served, and only from the project root.

The degraded but safe alternative is to show the file as a plain `file://` page (what a browser does when
you double-click an html file) that reloads on save. No live edit transport, no instrumentation, no popout
tab routing. This works only on the desktop app; the browser build has no local file access at all.

## What we found (read this before re-implementing)

1. **A plain `<iframe>` cannot load `file://` in the desktop app.** Chromium refuses a `file://`
   navigation in a frame whose parent is not itself a `file://` page. The frame silently stays on
   `about:blank`, no `load` event, no console error. Tested with and without the `sandbox` attribute.
   `asset://localhost/...` and `phtauri://localhost/...` do not help either: the asset scope only covers
   `$APPLOCALDATA/assets`, and `phtauri://` only serves the app bundle.
2. **Tauri is out of scope.** WebKitGTK / WKWebView / WebView2 have the same iframe restriction and no
   `<webview>` element. A top-level Tauri `WebviewWindow` with a `file://` url does open, but that is a
   separate window, not the in-panel preview the UX needs. Tauri is being deprecated in favour of Electron,
   so the prototype targeted Electron only. Non-Electron builds keep the "Preview Unavailable!" page.
3. **Electron `<webview>` is the in-panel answer.** A `<webview src="file:///...">` guest loads the page
   fine from the `phtauri://localhost` app origin. It needs `webPreferences.webviewTag: true` on the hosting
   `BrowserWindow`, and `will-attach-webview` hardening in the main process. `webview.reload()` reloads in
   place (scroll position retained); `webview.getURL()`, `getTitle()`, `executeJavaScript()` all work.
   The element must be styled `display: inline-flex; width: 100%; height: 100%` (the `width`/`height`
   attributes used by the iframe are ignored by `<webview>`).
4. **Electron `file://` pages are NOT sandboxed like Chrome's, and this is the crucial part.** In the first
   working build the previewed page could do all of the following, which is exactly the secret-exfiltration
   scenario that motivated the restriction in the first place:
   - `fetch("file:///etc/hostname")` returned the file content (Chrome blocks this).
   - `<iframe src="file:///.../secret.txt">` + `contentDocument.body.innerText` read the file
     (Electron grants "file access from file urls", so all `file://` documents are same-origin).
   - `fetch("http://example.com/")` succeeded without CORS ("universal access from file urls").
   - `fetch("phtauri://localhost/src/index.html")` reached the app's own scheme.
   There is no documented `webPreferences` flag to turn these off per guest. The fix that worked is a
   request filter on the guest's session (`session.fromPartition(...).webRequest.onBeforeRequest`), which
   does intercept `file://` requests in Electron. Policy that passed all probes while the Bootstrap
   "sign-in" example page still rendered with its css/js/images:
   - `file://` allowed only for `resourceType` in `mainFrame, stylesheet, script, image, font, media`.
   - `file://` `xhr` (fetch), `subFrame`, `object`, `ping`, `webSocket`, `other`: cancelled.
   - `http(s)` / `ws(s)`: allowed (behaves like a browser tab).
   - every other scheme (`phtauri://`, `asset://`, ...): cancelled.
   - `setPermissionRequestHandler` denies everything (camera, notifications, ...).
   - `setWindowOpenHandler` on the guest denies popups and forwards `http(s)` to `shell.openExternal`.
   - `will-navigate` on the guest allows only `file://`; `http(s)` goes to `shell.openExternal`.
   This matches what a browser lets a `file://` page do: render its sub resources, never read them
   programmatically. Known residual exposure, same as in Chrome: `<script src="file:///x">` executes a
   local file if it happens to be valid JS, and CSS parsing side channels on `<link rel=stylesheet>`.
   A stricter option if ever needed: only allow `file://` sub resources under the previewed file's
   directory tree (Firefox's policy), at the cost of breaking `../assets/...` references.
5. **Which events fire on save.** Saving the previewed external html fires both `DocumentManager`
   `documentSaved` and `LiveDevelopment.EVENT_LIVE_PREVIEW_RELOAD` (LiveDevelopment is "active" for some
   other document). `ProjectManager.EVENT_PROJECT_FILE_CHANGED` does not fire for files outside the
   project. Without guards the webview was recreated (scroll lost) and reloaded twice. The patch reloads
   only from `documentSaved` and short-circuits the other paths while a file preview is showing.
6. **URL encoding.** `_loadPreview` does `encodeURI(previewDetails.URL)`; a `file://` url built with
   `encodeURIComponent` per path segment must skip that or `%20` becomes `%2520`. On Windows the drive
   letter segment (`C:`) must not be encoded: `file:///C:/x/y.html`.
7. **Cache busting when testing from source:** after editing, run
   `fetch(url, {cache: "reload"})` for every edited file in the app, then `force_reload_phoenix`,
   otherwise the heuristic http cache serves stale JS. The Electron main process needs an app restart
   (`npm run serve:electron` in `phoenix-desktop`, or the phoenix-builder MCP `start_phoenix`).

## Design of the prototype

Phoenix side (this folder):

- `NodeStaticServer.getPreviewDetails()` returns `{ URL: "file:///...", isFileProtocolPreview: true,
  isNoPreview: false }` for external html when `Phoenix.isNativeApp && window.__ELECTRON__`.
  It also makes `_lastPreviewedFilePath` sticky for external html, so switching to a sibling css/js
  keeps previewing the html and a save of the sibling reloads it.
- `main.js _loadPreview()` renders a `<webview id="panel-live-preview-frame" partition="live-preview-file">`
  instead of the iframe when `isFileProtocolPreview` is set, reloads in place when the same url is forced,
  skips `LiveDevelopment.openLivePreview()` and `StaticServer.redirectAllTabs()` (popped out tabs are
  served by the http server and cannot load `file://`), and shows a dismissible banner
  (`Strings.LIVE_PREVIEW_FILE_PROTOCOL_BANNER`, `.live-preview-file-banner` in `panel.html`).
- `_popoutLivePreview()` opens the `file://` url directly with `NodeUtils.openUrlInBrowser` instead of the
  tab loader page. Not verified on Windows (`Phoenix.app._openUrlInBrowserWin` path).
- The `partition` attribute value must match `FILE_PREVIEW_PARTITION` in the Electron main process, which
  refuses guests in any other partition.

Electron side (`phoenix-desktop/src-electron`), rolled back on 2026-09-05, reproduced here:

```js
// main.js -------------------------------------------------------------------------------------------
const { app, BrowserWindow, protocol, Menu, ipcMain, net, shell, session } = require('electron');

// createWindow(): add to webPreferences of the main window (main-window-ipc.js does the same for
// trusted-origin Phoenix windows created via 'create-window'):
//     webviewTag: true

// Session partition used by the live preview <webview> for file:// pages. In-memory (no `persist:`
// prefix), so nothing a previewed page stores outlives the app. Must match Phoenix's `partition` attr.
const FILE_PREVIEW_PARTITION = 'live-preview-file';
// file:// sub-resource types a previewed page may load from disk. Mirrors what a normal browser tab
// lets a file:// page do: render its scripts/styles/images/fonts/media.
const FILE_PREVIEW_ALLOWED_RESOURCE_TYPES = new Set(['mainFrame', 'stylesheet', 'script', 'image', 'font', 'media']);

function setupFilePreviewSession() {
    const ses = session.fromPartition(FILE_PREVIEW_PARTITION);
    ses.webRequest.onBeforeRequest((details, callback) => {
        const url = details.url || '';
        let allowed;
        if (url.startsWith('file://')) {
            allowed = FILE_PREVIEW_ALLOWED_RESOURCE_TYPES.has(details.resourceType);
        } else {
            // Remote resources behave as in a browser. Phoenix's own app schemes (phtauri://, asset://)
            // and anything else internal must not be reachable from a previewed page.
            allowed = /^(https?|wss?):/i.test(url);
        }
        if (!allowed) {
            console.warn('file preview: blocked', details.resourceType, 'request to', url);
        }
        callback({ cancel: !allowed });
    });
    ses.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
}

// Harden every <webview> guest created by any Phoenix window. The only legitimate use of <webview> in
// Phoenix is the live preview of file:// pages, so anything else is refused outright.
app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event, webPreferences, params) => {
        const src = params.src || '';
        if (!src.startsWith('file://') || params.partition !== FILE_PREVIEW_PARTITION) {
            console.error('webview attach denied - only file:// previews in the preview partition are allowed:',
                src, params.partition);
            event.preventDefault();
            return;
        }
        // Never let the guest inherit Phoenix's preload/IPC bridge or any node access.
        delete webPreferences.preload;
        delete webPreferences.preloadURL;
        webPreferences.nodeIntegration = false;
        webPreferences.nodeIntegrationInSubFrames = false;
        webPreferences.contextIsolation = true;
        webPreferences.sandbox = true;
        webPreferences.webSecurity = true;
        webPreferences.allowRunningInsecureContent = false;
        webPreferences.enableRemoteModule = false;
    });

    contents.on('did-attach-webview', (_evt, guest) => {
        // Popups from the previewed page go to the system browser; the guest never spawns windows.
        guest.setWindowOpenHandler(({ url }) => {
            if (/^https?:\/\//i.test(url)) {
                shell.openExternal(url);
            }
            return { action: 'deny' };
        });
        // The guest may only navigate between file:// pages. http(s) links open in the system browser
        // so the remote page never runs inside the editor window.
        guest.on('will-navigate', (evt, url) => {
            if (url.startsWith('file://')) {
                return;
            }
            evt.preventDefault();
            if (/^https?:\/\//i.test(url)) {
                shell.openExternal(url);
            }
        });
    });
});

app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    setupFilePreviewSession();   // before the first window is created
    // ...existing protocol.handle('phtauri'/'asset') registrations and createWindow()
});
```

## How it was verified (repeat this when re-implementing)

Test fixture outside any project, e.g. `/tmp/lp/`: `lp_test.html` referencing sibling `lp_test.css` and
`lp_test.js`, plus a `secret.txt`. With the file open in the editor and the panel visible, run from the
Phoenix window (`exec_js` via the phoenix-builder MCP):

```js
const wv = document.getElementById("panel-live-preview-frame");     // expect tagName === "WEBVIEW"
const run = (code) => wv.executeJavaScript(code).catch(e => "ERR:" + e.message);
await run("document.body.innerText");                                 // sibling script ran
await run("getComputedStyle(document.body).backgroundColor");         // sibling css applied
await run("fetch('file:///tmp/lp/secret.txt').then(r=>r.text()).catch(e=>'blocked')");   // blocked
await run("new Promise(r=>{const f=document.createElement('iframe');f.src='file:///tmp/lp/secret.txt';" +
    "f.onload=()=>{try{r('LEAK:'+f.contentDocument.body.innerText)}catch(e){r('blocked')}};" +
    "document.body.appendChild(f);setTimeout(()=>r('blocked'),3000)})");                 // blocked
await run("fetch('phtauri://localhost/src/index.html').then(r=>r.status).catch(e=>'blocked')"); // blocked
await run("JSON.stringify({require: typeof require, process: typeof process, electronAPI: typeof electronAPI})");
// all "undefined"
```

Then: edit + save the html (same element, `did-finish-load` once, text updated), open the sibling css,
edit + save (preview stays on the html and reloads), open a project html (iframe is back, banner hidden),
open the external html again (webview is back). Also check a path with spaces renders
(`file:///home/x/HTML%20Dashboard/signin.html`).

## Open items for the real implementation

- Windows popout via `_openUrlInBrowserWin` with a `file://` url is untested.
- Decide whether saving a *project* file should also reload an external preview (prototype reloads on
  every save while a file preview is showing; harmless but chatty).
- Integration test: none written. `window._livePreviewIntegTest.currentLivePreviewURL` is set to the
  `file://` url by the patch so a test can assert on it.
- The packaged Electron shell must be rebuilt for the main-process change; the AppImage in
  `~/.phoenix-code` will not pick it up.
- Consider surfacing the blocked-request warnings (`file preview: blocked ...` on the Electron stderr) in
  the panel so users understand why a fetch in their page fails.

## Full patch for this repo (as of 2026-09-05, applies on top of commit 22792888e)

```diff
diff --git a/src/extensionsIntegrated/Phoenix-live-preview/NodeStaticServer.js b/src/extensionsIntegrated/Phoenix-live-preview/NodeStaticServer.js
index 26f2c577a..597de0434 100644
--- a/src/extensionsIntegrated/Phoenix-live-preview/NodeStaticServer.js
+++ b/src/extensionsIntegrated/Phoenix-live-preview/NodeStaticServer.js
@@ -599,8 +599,43 @@ define(function (require, exports, module) {
             + `&isLoggingEnabled=${logger.loggingOptions.logLivePreview}`;
     }
 
+    /**
+     * Whether HTML files outside the project can be previewed as plain `file://` pages. Only the Electron desktop
+     * shell supports this: it hosts the page in a hardened `<webview>` (see the Electron main process), so the file
+     * gets the browser's own file:// sandbox instead of being served by the live preview http server, which could
+     * otherwise be used by a malicious page to walk the disk and exfiltrate files.
+     * @return {boolean}
+     */
+    function isFileProtocolPreviewSupported() {
+        return !!(Phoenix.isNativeApp && window.__ELECTRON__);
+    }
+
+    /**
+     * Converts a VFS path of a native file to a `file://` URL the desktop shell can load.
+     * @param {string} fullPath VFS path, Eg. `/tauri/home/user/x.html` or `/tauri/C:/x/y.html`
+     * @return {string} Eg. `file:///home/user/x.html` or `file:///C:/x/y.html`
+     */
+    function _getFileProtocolURL(fullPath) {
+        const platformPath = Phoenix.fs.getTauriPlatformPath(fullPath).replace(/\\/g, "/");
+        const segments = platformPath.split("/").map((segment, index) => {
+            if(index === 0 && /^[a-zA-Z]:$/.test(segment)) {
+                return segment; // windows drive letter `C:` should not be url encoded
+            }
+            return encodeURIComponent(segment);
+        });
+        const urlPath = segments.join("/");
+        return `file://${urlPath.startsWith("/") ? "" : "/"}${urlPath}`;
+    }
+
     function _getExternalPreviewURL(fullPath) {
         if(utils.isHTMLFile(fullPath)) {
+            if(isFileProtocolPreviewSupported()) {
+                return {
+                    url: _getFileProtocolURL(fullPath),
+                    isNoPreview: false,
+                    isFileProtocolPreview: true
+                };
+            }
             return {
                 url: getNoPreviewURL(Strings.DESCRIPTION_LIVEDEV_PREVIEW_RESTRICTED,
                     Strings.DESCRIPTION_LIVEDEV_PREVIEW_RESTRICTED_DETAILS),
@@ -664,12 +699,24 @@ define(function (require, exports, module) {
                 }
                 const projectRoot = ProjectManager.getProjectRoot().fullPath;
                 let fullPath = currentFile.fullPath;
+                if(!utils.isPreviewableFile(fullPath) && _lastPreviewedFilePath
+                    && !ProjectManager.isWithinProject(_lastPreviewedFilePath)
+                    && await FileSystem.existsAsync(_lastPreviewedFilePath)) {
+                    // The user is previewing an html file outside the project (as a file:// page) and switched
+                    // to a css/js/other non-previewable file. Keep showing the external page, same as we do for
+                    // project files below, so that reload on save of a related file refreshes the right page.
+                    fullPath = _lastPreviewedFilePath;
+                }
                 if(!ProjectManager.isWithinProject(fullPath)){
                     // external project file. Use secure external preview link.
                     const preview = _getExternalPreviewURL(fullPath);
+                    if(preview.isFileProtocolPreview) {
+                        _lastPreviewedFilePath = fullPath;
+                    }
                     resolve({
                         URL: preview.url,
                         isNoPreview: preview.isNoPreview,
+                        isFileProtocolPreview: !!preview.isFileProtocolPreview,
                         filePath: fullPath,
                         fullPath: fullPath,
                         isMarkdownFile: utils.isMarkdownFile(fullPath),
diff --git a/src/extensionsIntegrated/Phoenix-live-preview/main.js b/src/extensionsIntegrated/Phoenix-live-preview/main.js
index fa73d43a5..3b6df4593 100644
--- a/src/extensionsIntegrated/Phoenix-live-preview/main.js
+++ b/src/extensionsIntegrated/Phoenix-live-preview/main.js
@@ -151,6 +151,25 @@ define(function (require, exports, module) {
     </iframe>
     `;
 
+    /**
+     * Electron desktop only: HTML files outside the project are previewed as plain `file://` pages inside a
+     * `<webview>` (Chromium refuses `file://` in an `<iframe>` hosted by a non-file origin). The Electron main
+     * process hardens the guest (no preload/node, only file:// navigation, links open in the system browser).
+     * @param {string} fileURL the `file://` url to load
+     * @return {string} html
+     */
+    function _getFileProtocolWebviewHTML(fileURL) {
+        const $webview = $(`<webview id="${LIVE_PREVIEW_IFRAME_ID}" title="Live Preview"
+             partition="live-preview-file" style="border: none; display: inline-flex; width: 100%; height: 100%">
+        </webview>`);
+        $webview.attr("src", fileURL);
+        return $webview;
+    }
+
+    function _isFileProtocolWebview($el) {
+        return !!($el && $el[0] && $el[0].tagName && $el[0].tagName.toLowerCase() === "webview");
+    }
+
     // Mdviewer renders untrusted markdown — tighter sandbox than live preview:
     // no allow-same-origin (prevents malicious scripts from accessing Phoenix context),
     // no allow-forms, allow-pointer-lock (not needed for markdown editing).
@@ -197,6 +216,9 @@ define(function (require, exports, module) {
         $fullScreenBtn;
 
     let customLivePreviewBannerShown = false;
+    // true while the panel shows a non-project html file as a static file:// page (Electron desktop only)
+    let currentPreviewIsFileProtocol = false;
+    let fileProtocolBannerDismissed = false;
 
     // live Preview overlay variables (overlays are shown when live preview is connecting or there's a syntax error)
     let $statusOverlay = null; // reference to the static overlay element
@@ -240,7 +262,7 @@ define(function (require, exports, module) {
     }
 
     StaticServer.on(EVENT_EMBEDDED_IFRAME_WHO_AM_I, function () {
-        if($iframe && $iframe[0]) {
+        if($iframe && $iframe[0] && $iframe[0].contentWindow) {
             const iframeDom = $iframe[0];
             iframeDom.contentWindow.postMessage({
                 type: "WHO_AM_I_RESPONSE",
@@ -706,6 +728,21 @@ define(function (require, exports, module) {
 
     const ALLOWED_BROWSERS_NAMES = [`chrome`, `firefox`, `safari`, `edge`, `browser`, `browserPrivate`];
     function _popoutLivePreview(browserName) {
+        if(currentPreviewIsFileProtocol) {
+            // file:// pages cannot be routed through the live preview tab loader page; open them directly.
+            const browserToUse = ALLOWED_BROWSERS_NAMES.includes(browserName) ? browserName : "browser";
+            Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "popoutFile", browserToUse);
+            NodeUtils.openUrlInBrowser(currentLivePreviewURL, browserToUse)
+                .catch(err=>{
+                    console.error("Error opening file url in browser: ", browserToUse, err);
+                    Dialogs.showModalDialog(
+                        DefaultDialogs.DIALOG_ID_ERROR,
+                        StringUtils.format(Strings.LIVE_DEV_OPEN_ERROR_TITLE, browserToUse),
+                        StringUtils.format(Strings.LIVE_DEV_OPEN_ERROR_MESSAGE, browserToUse)
+                    );
+                });
+            return;
+        }
         // We cannot use $iframe.src here if panel is hidden
         const openURL = StaticServer.getTabPopoutURL(currentLivePreviewURL);
         // In design mode the LP panel fills the editor area — hiding it would
@@ -864,6 +901,10 @@ define(function (require, exports, module) {
         $panel.find(".custom-server-banner-close-icon").on("click", ()=>{
             $panel.find(".live-preview-custom-banner").addClass("forced-hidden");
         });
+        $panel.find(".file-banner-close-icon").on("click", ()=>{
+            fileProtocolBannerDismissed = true;
+            _hideFileProtocolBanner();
+        });
         // The previewed iframe does not reliably fire mouseout/mouseleave on a slow pointer exit,
         // leaving the hover highlight/box stuck. Detect the leave parent-side and forward a clear.
         $panel.on("mouseleave", "#panel-live-preview-frame", function () {
@@ -1022,6 +1063,51 @@ define(function (require, exports, module) {
         Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "render", "mdviewr");
     }
 
+    function _hideFileProtocolBanner() {
+        $panel.find(".live-preview-file-banner").addClass("forced-hidden");
+    }
+
+    /**
+     * Shows the given file:// url in a webview in place of the live preview iframe. A static page has no live
+     * edit transport, so any forced load of the url it already shows is a plain reload, done in place to retain
+     * scroll position etc.
+     * @param {string} fileURL
+     */
+    function _showFileProtocolPreview(fileURL) {
+        if(!fileProtocolBannerDismissed) {
+            $panel.find(".live-preview-file-banner").removeClass("forced-hidden");
+        }
+        if(_isFileProtocolWebview($iframe) && $iframe.attr('src') === fileURL) {
+            $iframe[0].reload();
+            return;
+        }
+        const newWebview = _getFileProtocolWebviewHTML(fileURL);
+        newWebview.insertAfter($iframe);
+        // Don't remove the md iframe — it's persistent and already hidden
+        if (!$mdviewrIframe || $iframe[0] !== $mdviewrIframe[0]) {
+            $iframe.remove();
+        }
+        $iframe = newWebview;
+        if(Phoenix.isTestWindow) {
+            window._livePreviewIntegTest.currentLivePreviewURL = fileURL;
+            window._livePreviewIntegTest.urlLoadCount++;
+        }
+    }
+
+    /**
+     * file:// previews have no live edit transport, so we reload the page on any document save while one is shown.
+     */
+    function _documentSaved() {
+        if(!currentPreviewIsFileProtocol || !panel.isVisible()) {
+            return;
+        }
+        if(_isFileProtocolWebview($iframe)) {
+            $iframe[0].reload();
+        } else {
+            _loadPreview(true, true);
+        }
+    }
+
     async function _loadPreview(force, isReload) {
         // we wait till the first server ready event is received till we render anything. else a 404-page may
         // briefly flash on first load of phoenix as we try to load the page before the server is available.
@@ -1082,7 +1168,8 @@ define(function (require, exports, module) {
             }
             _updateLPControlsForMdviewer();
         }
-        let newSrc = encodeURI(previewDetails.URL);
+        // file:// urls are already fully encoded; encodeURI would double encode the `%` escapes.
+        let newSrc = previewDetails.isFileProtocolPreview ? previewDetails.URL : encodeURI(previewDetails.URL);
         if($iframe.attr('src') === newSrc && !force){
             // we already have this url loaded in previews!
             return;
@@ -1094,7 +1181,7 @@ define(function (require, exports, module) {
             currentLivePreviewURL = newSrc;
             _setPreviewedFile(previewDetails.fullPath);
         }
-        if(isReload && previewDetails.isHTMLFile){
+        if(isReload && previewDetails.isHTMLFile && !previewDetails.isFileProtocolPreview){
             LiveDevelopment.openLivePreview();
         }
         let relativeOrFullPath= ProjectManager.makeProjectRelativeIfPossible(currentPreviewFile);
@@ -1111,25 +1198,35 @@ define(function (require, exports, module) {
                         LivePreviewSettings.getCustomServeBaseURL())
                 );
             }
-            let newIframe = $(LIVE_PREVIEW_IFRAME_HTML);
-            newIframe.insertAfter($iframe);
-            // Don't remove the md iframe — it's persistent and already hidden
-            if (!$mdviewrIframe || $iframe[0] !== $mdviewrIframe[0]) {
-                $iframe.remove();
-            }
-            $iframe = newIframe;
-            if(_isProjectPreviewTrusted()){
-                $iframe.attr('src', currentLivePreviewURL);
-                if(Phoenix.isTestWindow) {
-                    window._livePreviewIntegTest.currentLivePreviewURL = currentLivePreviewURL;
-                    window._livePreviewIntegTest.urlLoadCount++;
-                }
+            if(previewDetails.isFileProtocolPreview) {
+                _showFileProtocolPreview(currentLivePreviewURL);
             } else {
-                $iframe.attr('srcdoc', _getTrustProjectPage());
+                _hideFileProtocolBanner();
+                let newIframe = $(LIVE_PREVIEW_IFRAME_HTML);
+                newIframe.insertAfter($iframe);
+                // Don't remove the md iframe — it's persistent and already hidden
+                if (!$mdviewrIframe || $iframe[0] !== $mdviewrIframe[0]) {
+                    $iframe.remove();
+                }
+                $iframe = newIframe;
+                if(_isProjectPreviewTrusted()){
+                    $iframe.attr('src', currentLivePreviewURL);
+                    if(Phoenix.isTestWindow) {
+                        window._livePreviewIntegTest.currentLivePreviewURL = currentLivePreviewURL;
+                        window._livePreviewIntegTest.urlLoadCount++;
+                    }
+                } else {
+                    $iframe.attr('srcdoc', _getTrustProjectPage());
+                }
             }
         }
+        currentPreviewIsFileProtocol = !!previewDetails.isFileProtocolPreview;
         Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "render",
             utils.getExtension(previewDetails.fullPath));
+        if(currentPreviewIsFileProtocol) {
+            // popped out browser tabs are served by the live preview http server and cannot load file:// pages.
+            return;
+        }
         StaticServer.redirectAllTabs(currentLivePreviewURL, force);
         if(Phoenix.isTestWindow) {
             // for integ tests
@@ -1143,6 +1240,10 @@ define(function (require, exports, module) {
             // MarkdownSync handles live content updates for markdown files
             return;
         }
+        if(currentPreviewIsFileProtocol) {
+            // file:// previews are reloaded in place by _documentSaved on every save.
+            return;
+        }
         if(changedFile && changedFile.isFile && (utils.isPreviewableFile(changedFile.fullPath) ||
             utils.isServerRenderedFile(changedFile.fullPath))){
             // we are getting this change event somehow.
@@ -1234,6 +1335,7 @@ define(function (require, exports, module) {
         _switchToEditModeIfNeeded();
         customLivePreviewBannerShown = false;
         $panel.find(".live-preview-custom-banner").addClass("forced-hidden");
+        _hideFileProtocolBanner();
         _openReadmeMDIfFirstTime();
         _customServerMetrics();
         if(!LiveDevelopment.isActive()
@@ -1508,6 +1610,7 @@ define(function (require, exports, module) {
         StaticServer.init();
         LiveDevServerManager.registerServer({ create: _createStaticServer }, 5);
         ProjectManager.on(ProjectManager.EVENT_PROJECT_FILE_CHANGED, _projectFileChanges);
+        DocumentManager.on("documentSaved", _documentSaved);
         ProjectManager.on(ProjectManager.EVENT_PROJECT_OPEN, _projectOpened);
         ProjectManager.on(ProjectManager.EVENT_PROJECT_CLOSE, _projectClosed);
         EditorManager.on("activeEditorChange", _activeDocChanged);
@@ -1597,6 +1700,10 @@ define(function (require, exports, module) {
             // in firefox security posture, the third party live preview iframe phcode.live itself cannot activate
             // the service worker. So we have to reload the iframe from its parent- ie. phcode.dev. This is not
             // required in chrome, but we just keep it just for all platforms behaving the same.
+            if(currentPreviewIsFileProtocol) {
+                // static file:// previews are reloaded by _documentSaved; avoid a second reload here.
+                return;
+            }
             _loadPreview(true);
         });
 
diff --git a/src/extensionsIntegrated/Phoenix-live-preview/panel.html b/src/extensionsIntegrated/Phoenix-live-preview/panel.html
index 1a24d179a..72047a7a1 100644
--- a/src/extensionsIntegrated/Phoenix-live-preview/panel.html
+++ b/src/extensionsIntegrated/Phoenix-live-preview/panel.html
@@ -66,6 +66,12 @@
            style="margin-left: 10px;margin-right: 10px;cursor: pointer;"
            title="{{Strings.CLOSE}}"></i>
     </div>
+    <div class="live-preview-file-banner forced-hidden">
+        <span class="live-preview-banner-message">{{Strings.LIVE_PREVIEW_FILE_PROTOCOL_BANNER}}</span>
+        <i class="fa fa-close file-banner-close-icon"
+           style="margin-left: 10px;margin-right: 10px;cursor: pointer;"
+           title="{{Strings.CLOSE}}"></i>
+    </div>
     <div class="live-preview-status-overlay forced-hidden">
         <span class="live-preview-overlay-message"><!-- the msg will come here dynamically --></span>
         <i class="fa fa-times live-preview-overlay-close" title="{{Strings.LIVE_PREVIEW_HIDE_OVERLAY}}"></i>
diff --git a/src/nls/root/strings.js b/src/nls/root/strings.js
index a45d9cbae..d2fae8659 100644
--- a/src/nls/root/strings.js
+++ b/src/nls/root/strings.js
@@ -800,6 +800,7 @@ define({
     "IMAGE_SEARCH_PRO_THROTTLE_TITLE": "Image search limit reached",
     "IMAGE_SEARCH_PRO_THROTTLE_MESSAGE": "Image search is temporarily unavailable due to high demand. This usually clears within an hour — please try again shortly.",
     "LIVE_PREVIEW_CUSTOM_SERVER_BANNER": "Getting preview from your custom server {0}",
+    "LIVE_PREVIEW_FILE_PROTOCOL_BANNER": "This file is outside the project, so it is shown as a static page that reloads when you save. Live editing is unavailable.",
     "LIVE_PREVIEW_MODE_TOGGLE_PREVIEW": "Toggle Preview Mode (F8)",
     "LIVE_PREVIEW_MODE_TOGGLE_EDIT": "Toggle Edit Mode (F8)",
     "LIVE_PREVIEW_MODE_PREVIEW": "Preview Mode",
diff --git a/src/styles/brackets.less b/src/styles/brackets.less
index 003730747..f4146581b 100644
--- a/src/styles/brackets.less
+++ b/src/styles/brackets.less
@@ -4194,7 +4194,8 @@ label input {
 
 /* Live Preview */
 
-.live-preview-custom-banner {
+.live-preview-custom-banner,
+.live-preview-file-banner {
     display: flex;
     flex-direction: row;
     background-color: #1E90FF;
```
