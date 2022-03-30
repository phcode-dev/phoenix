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
/*global Filer*/
/*eslint no-console: 0*/
/*eslint strict: ["error", "global"]*/


/** Setup phoenix shell components
 *
 * This module should be functionally as light weight as possible with minimal deps as it is a shell component.
 * **/
import init from "./init_vfs.js";
import ERR_CODES from "./errno.js";

let Phoenix = {};
let startTime = Date.now();

window.Phoenix = Phoenix;

init(Phoenix, Filer);

Phoenix.app = {
    getNodeState: function (cbfn){
        cbfn(new Error('Node cannot be run in phoenix browser mode'));
    },
    openURLInDefaultBrowser: function (url){
        window.open(url);
    },
    getApplicationSupportDirectory: Phoenix.VFS.getAppSupportDir,
    getUserDocumentsDirectory: Phoenix.VFS.getUserDocumentsDirectory,
    ERR_CODES: ERR_CODES,
    getElapsedMilliseconds: function () {
        return Date.now() - startTime; // milliseconds elapsed since app start
    }
};

if(!window.appshell){
    window.appshell = Phoenix;
}

// logger setup
function swallowLogs() {
    // Do nothing
}
const savedLoggingFn = console.log;
const savedInfoFn = console.info;

window.setupLogging = function () {
    const urlParams = new URLSearchParams(window.location.search);
    const logToConsoleOverride = urlParams.get('logToConsole');
    const logToConsolePref = localStorage.getItem("logToConsole");
    if((logToConsoleOverride && logToConsoleOverride.toLowerCase() === 'true')
        || (logToConsolePref && logToConsolePref.toLowerCase() === 'true' && !logToConsoleOverride)){
        console.log= savedLoggingFn;
        console.info= savedInfoFn;
        window.logToConsolePref = 'true';
        return true;
    } else {
        console.info = console.log = swallowLogs;
        window.logToConsolePref = 'false';
        return false;
    }
};

window.setupLogging();
