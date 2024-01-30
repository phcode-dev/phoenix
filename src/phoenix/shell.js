/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License along
 * with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

// jshint ignore: start
/*eslint no-console: 0*/
/*eslint strict: ["error", "global"]*/
/*global Phoenix*/


/** Setup phoenix shell components
 *
 * This module should be functionally as light weight as possible with minimal deps as it is a shell component.
 * **/
import initVFS from "./init_vfs.js";
import ERR_CODES from "./errno.js";

initVFS();

// We can only have a maximum of 30 windows that have access to tauri apis
// This limit is set in file `tauri.conf.json` in phoenix-desktop repo at json paths
// this limit is there due to our use of phtauri:// custom protocol.
// /tauri/security/dangerousRemoteDomainIpcAccess/0/windows and
// /tauri/security/dangerousRemoteDomainIpcAccess/1/windows
const MAX_ALLOWED_TAURI_WINDOWS = 30;
const CLI_ARGS_QUERY_PARAM = 'CLI_ARGS';
let cliArgs, singleInstanceCLIHandler;
const PHOENIX_WINDOW_PREFIX = 'phcode-';
const PHOENIX_EXTENSION_WINDOW_PREFIX = 'extn-';

async function _getTauriWindowLabel(prefix) {
    // cannot use tauri sync api here as it returns stale window list window.__TAURI__.window.getAll();
    const tauriWindowLabels = await window.__TAURI__.invoke('_get_window_labels');
    const windowLabels = {};
    for(let label of tauriWindowLabels) {
        if(label.startsWith(prefix)){
            windowLabels[label]=true;
        }
    }
    for(let i=1; i<=MAX_ALLOWED_TAURI_WINDOWS; i++){
        const windowLabel = `${prefix}${i}`;
        if(!windowLabels[windowLabel]){
            return windowLabel;
        }
    }
    throw new Error("Could not get a free window label to create tauri window");
}

async function openURLInPhoenixWindow(url, {
    windowTitle, fullscreen, resizable,
    height, minHeight, width, minWidth, acceptFirstMouse, preferTabs, _prefixPvt = PHOENIX_EXTENSION_WINDOW_PREFIX
} = {}){
    const defaultHeight = 900, defaultWidth = 1366;
    if(window.__TAURI__){
        const windowLabel = await _getTauriWindowLabel(_prefixPvt);
        const tauriWindow = new window.__TAURI__.window.WebviewWindow(windowLabel, {
            url,
            title: windowTitle || windowLabel || url,
            fullscreen,
            resizable: resizable === undefined ? true : resizable,
            height: height || defaultHeight,
            minHeight: minHeight || 600,
            width: width || defaultWidth,
            minWidth: minWidth || 800,
            acceptFirstMouse: acceptFirstMouse === undefined ? true : acceptFirstMouse
        });
        tauriWindow.isTauriWindow = true;
        return tauriWindow;
    }
    let features = 'toolbar=no,location=no, status=no, menubar=no, scrollbars=yes';
    features = `${features}, width=${width||defaultWidth}, height=${height||defaultHeight}`;
    if(resizable === undefined || resizable){
        features = features + ", resizable=yes";
    }
    if(preferTabs) {
        features = "";
    }
    const nativeWindow = window.open(url, '_blank', features);
    nativeWindow.isTauriWindow = false;
    return nativeWindow;
}

Phoenix.app = {
    getNodeState: function (cbfn){
        cbfn(new Error('Node cannot be run in phoenix browser mode'));
    },
    toggleDevtools: async function () {
        if(!Phoenix.browser.isTauri){
            throw new Error("toggle_devtools is not supported in browsers");
        }
        return window.__TAURI__.invoke("toggle_devtools", {});
    },
    closeWindow: function () {
        if(!Phoenix.browser.isTauri){
            throw new Error("closeWindow is not supported in browsers");
        }
        window.__TAURI__.window.getCurrent().close();
    },
    focusWindow: function () {
        if(!Phoenix.browser.isTauri){
            return Promise.reject(new Error("focusWindow is not supported in browsers"));
        }
        window.__TAURI__.window.getCurrent().setAlwaysOnTop(true);
        window.__TAURI__.window.getCurrent().setFocus();
        window.__TAURI__.window.getCurrent().setAlwaysOnTop(false);
    },
    clipboardReadText: function () {
        if(Phoenix.browser.isTauri){
            return window.__TAURI__.clipboard.readText();
        } else if(window.navigator && window.navigator.clipboard){
            return window.navigator.clipboard.readText();
        }
        return Promise.reject(new Error("clipboardReadText: Not supported."));
    },
    /**
     * Gets the commandline argument in desktop builds and null in browser builds.
     * @return {Promise<string[]|null>}
     */
    getCommandLineArgs: function () {
        return new Promise((resolve)=>{
            if(!Phoenix.browser.isTauri){
                resolve(null);
                return;
            }
            const phoenixURL = new URL(location.href);
            const cliQueryParam = phoenixURL.searchParams.get(CLI_ARGS_QUERY_PARAM);
            if(cliQueryParam){
                // the cli passed in through the url takes highest precedence as we have a single tauri instance,
                // new windows will be spawned with the cli query param url.
                cliArgs = JSON.parse(decodeURIComponent(cliQueryParam));
            }
            if(cliArgs){
                resolve(cliArgs);
                return;
            }
            cliArgs = null;
            window.__TAURI__.invoke('_get_commandline_args')
                .then(args=>{
                    cliArgs = args;
                })
                .finally(()=>{
                    resolve(cliArgs);
                });
        });
    },
    /**
     * Only a single instance of the app will be present at any time. When another instacne is opened from either cli or
     * double clicking a file in file explorer in os, the handler will be called with the command line args with the
     * file that was double-clicked (or folder using open with) in os file explorer/cli.
     * @param {function([string]cliArgs, cwd)} handlerFn - the handler function will receive two args on callback, the cliArgs
     *  of the other phoenix process that was invoked to open the file and its current working dir. cwd may be null
     * @return {*}
     */
    setSingleInstanceCLIArgsHandler: function (handlerFn) {
        if(singleInstanceCLIHandler){
            throw new Error("A single instance handler is already registered!");
        }
        if(handlerFn){
            singleInstanceCLIHandler = handlerFn;
        }
        if(Phoenix.browser.isTauri){
            window.__TAURI__.event.listen("single-instance", ({payload})=> {
                handlerFn(payload.args, payload.cwd);
            });
            window.__TAURI__.event.listen("scheme-request-received", (receivedEvent)=> {
                // this is for mac-os open with processing from finder.
                console.log("Macos received Event from OS:", receivedEvent);
                const fileURL = receivedEvent.payload;
                const fileURLArray = receivedEvent.payload.fileURLArray;
                window.__TAURI__.tauri.invoke("get_mac_deep_link_requests");// this will clear the cached queue in shell
                const eventToUse = ["macOSEvent"];
                if(typeof fileURL === 'string'){
                    eventToUse.push(fileURL.replace("file://", ""));
                } else if(fileURLArray){
                    for(let fileUrlEntry of fileURLArray){
                        eventToUse.push(fileUrlEntry.replace("file://", ""));
                    }
                }
                handlerFn(eventToUse, "");
            });
            window.__TAURI__.tauri.invoke("get_mac_deep_link_requests").then(filesURLList=>{
                if(!filesURLList.length){
                    return;
                }
                // this is special handling for open with to work from mac finder. Mac will raise and event which will
                // be buffered in the shell till the app reads the opened file list. Once read, the file list will be
                // emptied in shell and no other instances will get the data, so we have to process it here.
                window.__TAURI__.event.emit('scheme-request-received', {fileURLArray: filesURLList});
            });
        }
    },
    clipboardReadFiles: function () {
        return new Promise((resolve, reject)=>{
            if(Phoenix.browser.isTauri){
                window.__TAURI__.tauri.invoke('_get_clipboard_files')
                    .then(files =>{
                        if(!files){
                            resolve(files);
                            return;
                        }
                        const vfsPaths = [];
                        for(let platformPath of files) {
                            vfsPaths.push(Phoenix.VFS.getTauriVirtualPath(platformPath));
                        }
                        resolve(vfsPaths);
                    }).catch(reject);
            } else {
                resolve();
            }
        });
    },
    copyToClipboard: function (textToCopy) {
        if(Phoenix.browser.isTauri){
            return window.__TAURI__.clipboard.writeText(textToCopy);
        } else if(window.navigator && window.navigator.clipboard){
            return window.navigator.clipboard.writeText(textToCopy);
        }
        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        return Promise.resolve();
    },
    isFullscreen: function () {
        if(!Phoenix.browser.isTauri) {
            // use browser full screen api in browsers.
            return Promise.resolve(!!document.fullscreenElement);
        }
        return window.__TAURI__.window.appWindow.isFullscreen();
    },
    setFullscreen: function (enable) {
        if(!Phoenix.browser.isTauri) {
            // use browser full screen api in browsers.
            if (enable) {
                return document.documentElement.requestFullscreen();
            } else if (document.exitFullscreen) {
                return  document.exitFullscreen();
            } else {
                return Promise.resolve();
            }
        }
        return window.__TAURI__.window.appWindow.setFullscreen(enable);
    },
    getDisplayLocation: function (fullVFSPath) {
        // reruns a user-friendly location that can be shown to the user to make some sense of the virtual file path.
        // The returned path may not be an actual path if it is not resolvable to a platform path, but a text indicating
        // its location. Eg: "Stored in Your Browser"
        if (fullVFSPath.startsWith(Phoenix.VFS.getTauriDir())) {
            return Phoenix.fs.getTauriPlatformPath(fullVFSPath);
        }
        if (fullVFSPath.startsWith(Phoenix.VFS.getMountDir())) {
            return fullVFSPath.replace(Phoenix.VFS.getMountDir(), "");
        }
        return window.Strings.STORED_IN_YOUR_BROWSER;
    },
    getDisplayPath: function (fullOrRelativeVFSPath) {
        if(!fullOrRelativeVFSPath){
            return "";
        }
        // reruns a path that can be shown to the user to make some sense of the virtual file path.
        // The returned path is platform path for tauri,
        // a relative path of the form (folder/file.txt) starting with opened folder name for fs access- /mnt/paths
        // or virtual path if we cant figure out a tauri/fs access path
        if (fullOrRelativeVFSPath.startsWith(Phoenix.VFS.getTauriDir())) {
            return Phoenix.fs.getTauriPlatformPath(fullOrRelativeVFSPath);
        }
        if (fullOrRelativeVFSPath.startsWith(Phoenix.VFS.getMountDir())) {
            return fullOrRelativeVFSPath.replace(Phoenix.VFS.getMountDir(), "");
        }
        return fullOrRelativeVFSPath;
    },
    setWindowTitle: async function (title) {
        window.document.title = title;
        if(Phoenix.browser.isTauri) {
            await window.__TAURI__.window.appWindow.setTitle(title);
        }
    },
    getWindowTitle: async function () {
        if(Phoenix.browser.isTauri) {
            return window.__TAURI__.window.appWindow.title();
        }
        return window.document.title;
    },
    openPathInFileBrowser: function (fullVFSPath){
        return new Promise((resolve, reject)=>{
            if(!window.__TAURI__ ||
                !fullVFSPath.startsWith(Phoenix.VFS.getTauriDir())) {
                reject("openPathInFileBrowser is only currently supported in Native builds for tauri paths!");
                return;
            }
            if(fullVFSPath.toLowerCase().startsWith("http://")
                || fullVFSPath.toLowerCase().startsWith("https://")
                || fullVFSPath.toLowerCase().startsWith("file://")) {
                reject("Please use openPathInFileBrowser API to open URLs");
                return;
            }
            const platformPath = Phoenix.fs.getTauriPlatformPath(fullVFSPath);
            window.__TAURI__.tauri
                .invoke('show_in_folder', {path: platformPath})
                .then(resolve)
                .catch(reject);
        });
    },
    openURLInDefaultBrowser: function (url, tabIdentifier='_blank'){
        return new Promise((resolve, reject)=>{
            if(!window.__TAURI__) {
                resolve(window.open(url, tabIdentifier, 'noopener,noreferrer'));
                return;
            }
            if( !(url.toLowerCase().startsWith("http://") || url.toLowerCase().startsWith("https://")) ) {
                reject("openURLInDefaultBrowser: URL should be http or https, but was " + url);
                return;
            }
            window.__TAURI__.shell.open(url)
                .then(resolve)
                .catch(reject);
        });
    },
    /**
     * In a multi window setup in desktop, we operate in tauri single window mode. So there may be multiple windows
     * for different phoenix editors, but only a single tauri process. One of them is a leader who gets to do special
     * duties like opening a `new window` instance/ anything that needs a single responsibility. Note that the leader
     * will cycle though as new windows comes and goes. Usually the leader is a phoenix window with the lowest
     * tauri window label.
     * @return {Promise<boolean>}
     */
    isPrimaryDesktopPhoenixWindow: async function () {
        if(!Phoenix.browser.isTauri) {
            // there is no primary window concept in browsers. all are primary for now.
            console.error("isPrimaryDesktopPhoenixWindow is not supported in browsers!");
            return true;
        }
        const currentWindowLabel = window.__TAURI__.window.getCurrent().label;
        if(currentWindowLabel === 'main'){
            // main window if there will be the primary
            return true;
        }
        const allTauriWindowsLabels  = await window.__TAURI__.invoke('_get_window_labels');
        if(allTauriWindowsLabels.includes('main')){
            // we are not main and there is a main window in tauri windows
            return false;
        }
        // the main window has been closed and some other window is the primary now.
        // the one with the lowest label is primary
        for(let tauriWindowLabel of allTauriWindowsLabels){
            if(tauriWindowLabel && tauriWindowLabel.startsWith(PHOENIX_WINDOW_PREFIX) &&
                currentWindowLabel !== tauriWindowLabel && currentWindowLabel > tauriWindowLabel) {
                return false;
            }
        }
        return true;
    },
    openNewPhoenixEditorWindow: async function (preferredWidth, preferredHeight, _cliArgsArray) {
        const phoenixURL = new URL(location.href);
        if(_cliArgsArray){
            const cliVal = encodeURIComponent(JSON.stringify(_cliArgsArray));
            phoenixURL.searchParams.set(CLI_ARGS_QUERY_PARAM, cliVal);
        } else {
            phoenixURL.searchParams.delete(CLI_ARGS_QUERY_PARAM);
        }
        await openURLInPhoenixWindow(phoenixURL.href, {
            width: preferredWidth,
            height: preferredHeight,
            preferTabs: true,
            _prefixPvt: PHOENIX_WINDOW_PREFIX
        });
    },
    openURLInPhoenixWindow: openURLInPhoenixWindow,
    zoomWebView: function (scaleFactor = 1) {
        if(!Phoenix.browser.isTauri){
            throw new Error("zoomWebView is not supported in browsers");
        }
        if(scaleFactor < .1 || scaleFactor > 2) {
            throw new Error("zoomWebView scale factor should be between .1 and 2");
        }
        return window.__TAURI__.tauri.invoke("zoom_window", {scaleFactor: scaleFactor});
    },
    getApplicationSupportDirectory: Phoenix.VFS.getAppSupportDir,
    getExtensionsDirectory: Phoenix.VFS.getExtensionDir,
    getUserDocumentsDirectory: Phoenix.VFS.getUserDocumentsDirectory,
    getUserProjectsDirectory: Phoenix.VFS.getUserProjectsDirectory,
    getTempDirectory: Phoenix.VFS.getTempDir,
    ERR_CODES: ERR_CODES,
    getTimeSinceStartup: function () {
        return Date.now() - Phoenix.startTime; // milliseconds elapsed since app start
    },
    language: navigator.language
};

if(!window.appshell){
    window.appshell = Phoenix;
}
