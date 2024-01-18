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
import initTauriShell from "./tauriShell.js";

initVFS();

// We can only have a maximum of 30 windows that have access to tauri apis
// This limit is set in file `tauri.conf.json` in phoenix-desktop repo at json paths
// this limit is there due to our use of phtauri:// custom protocol.
// /tauri/security/dangerousRemoteDomainIpcAccess/0/windows and
// /tauri/security/dangerousRemoteDomainIpcAccess/1/windows
const MAX_ALLOWED_TAURI_WINDOWS = 30;
let cliArgs;

async function getTauriWindowLabel() {
    const tauriWindows = await window.__TAURI__.window.getAll();
    const windowLabels = {};
    for(let {label} of tauriWindows) {
        windowLabels[label]=true;
    }
    for(let i=1; i<=MAX_ALLOWED_TAURI_WINDOWS; i++){
        const windowLabel = `phcode-${i}`;
        if(!windowLabels[windowLabel]){
            return windowLabel;
        }
    }
    throw new Error("Could not get a free window label to create tauri window");
}
Phoenix.app = {
    getNodeState: function (cbfn){
        cbfn(new Error('Node cannot be run in phoenix browser mode'));
    },
    closeWindow: function () {
        if(!Phoenix.browser.isTauri){
            throw new Error("closeWindow is not supported in browsers");
        }
        window.__TAURI__.window.appWindow.close();
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
    openURLInPhoenixWindow: async function (url, {
        windowTitle, fullscreen, resizable,
        height, minHeight, width, minWidth, acceptFirstMouse, preferTabs
    } = {}){
        const defaultHeight = 900, defaultWidth = 1366;
        if(window.__TAURI__){
            const windowLabel = await getTauriWindowLabel();
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
    },
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

if(Phoenix.browser.isTauri) {
    initTauriShell(Phoenix.app);
}
