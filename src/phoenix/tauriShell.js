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
/*globals*/
const TAURI = window.__TAURI__;

const TAURI_KEYS = {
    LAST_WINDOW_WIDTH: "tauri.LAST_WINDOW_WIDTH",
    LAST_WINDOW_HEIGHT: "tauri.LAST_WINDOW_HEIGHT"
};

const appWindow = TAURI && TAURI.window.appWindow;

function _setupWindowResizeListeners() {
    appWindow.onResized(async ({ payload: size }) => {
        const maximized = await appWindow.isMaximized();
        if(!maximized) {
            localStorage.setItem(TAURI_KEYS.LAST_WINDOW_HEIGHT, size.height);
            localStorage.setItem(TAURI_KEYS.LAST_WINDOW_WIDTH, size.width);
        }
    });
}

async function positionWindow() {
    const phoenixAspectRatio = 1.6,  // phoenix looks good in aspect ratio 1.6w:1h
        minWidth = 800,
        minHeight = 600;
    let monitorSize = (await TAURI.window.currentMonitor()).size,
        targetWindowHeight = monitorSize.height * 2/3,
        targetWindowWidth = targetWindowHeight * phoenixAspectRatio;
    let targetHeight = parseInt(localStorage.getItem(TAURI_KEYS.LAST_WINDOW_HEIGHT) || `${targetWindowHeight}`),
        targetWidth =  parseInt(localStorage.getItem(TAURI_KEYS.LAST_WINDOW_WIDTH) || `${targetWindowWidth}`);
    if(targetHeight.height > monitorSize.height || targetWidth.width > monitorSize.width){
        // our window is larger than the monitor, so just maximise to fit to monitor
        appWindow.maximize();
        _setupWindowResizeListeners();
        return;
    }
    if(targetHeight < minHeight){
        targetHeight = minHeight;
    }
    if(targetWidth < minWidth){
        targetWidth = minWidth;
    }
    await appWindow.setSize(new TAURI.window.PhysicalSize(targetWidth, targetHeight));
    _setupWindowResizeListeners();
}

function injectTauriAPIs(appAPI) {
    const { invoke } = TAURI.tauri;
    appAPI.toggleDevtools = async function () {
        return invoke("toggle_devtools", {});
    };
}

function initTauriShell(appAPI) {
    injectTauriAPIs(appAPI);
    positionWindow();
}

export default initTauriShell;