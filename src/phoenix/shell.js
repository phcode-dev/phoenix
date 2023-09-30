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

let windowLabelCount = 0;
Phoenix.app = {
    getNodeState: function (cbfn){
        cbfn(new Error('Node cannot be run in phoenix browser mode'));
    },
    openURLInDefaultBrowser: function (url){
        return window.open(url, '_blank', 'noopener,noreferrer');
    },
    openURLInPhoenixWindow: function (url, {
        windowTitle, windowLabel, fullscreen, resizable,
        height, minHeight, width, minWidth, acceptFirstMouse, preferTabs
    }){
        const defaultHeight = 900, defaultWidth = 1366;
        if(window.__TAURI__){
            const tauriWindow = new window.__TAURI__.window.WebviewWindow(windowLabel || `phcode-win-${windowLabelCount++}`, {
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
    getApplicationSupportDirectory: Phoenix.VFS.getAppSupportDir,
    getUserDocumentsDirectory: Phoenix.VFS.getUserDocumentsDirectory,
    ERR_CODES: ERR_CODES,
    getElapsedMilliseconds: function () {
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
