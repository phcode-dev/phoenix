/*
 * GNU AGPL-3.0 License
 *
 * Modified work Copyright (c) 2021 - present Core.ai
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
    ERR_CODES: ERR_CODES
};

if(!window.appshell){
    window.appshell = Phoenix;
}
