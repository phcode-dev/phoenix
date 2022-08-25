/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2015 - 2021 Adobe Systems Incorporated. All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

/*global virtualfs*/

const urlParams = new URLSearchParams(location.search);
const debugMode = (urlParams.get('debug') === 'true');
// eslint-disable-next-line no-unused-vars
const Phoenix = {
    // exported to be used by extensions that extend the indexing worker
    baseURL: '../'
};
importScripts('../phoenix/virtualfs.js');
importScripts('../utils/EventDispatcher.js');
importScripts('./WorkerComm.js');

virtualfs.debugMode = debugMode;

console.log("Extensions worker loaded in debug mode: ", debugMode);

if(!debugMode){
    console.log = console.info = function () {
        // swallow logs
    };
}

// global variables now available are: virtualfs, fs, WorkerComm
