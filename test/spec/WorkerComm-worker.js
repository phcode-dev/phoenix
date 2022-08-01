/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*global WorkerComm*/

const urlParams = new URLSearchParams(location.search);
importScripts(urlParams.get('eventDispatcherURL'));
importScripts(urlParams.get('workerCommUrl'));

WorkerComm.setExecHandler("echoNoPromise", function (args) {
    return args;
});

WorkerComm.setExecHandler("echoPromise", function (args) {
    return new Promise(resolve=>{
        resolve(args);
    });
});

WorkerComm.setExecHandler("throwingNoPromise", function () {
    throw new Error("oops");
});

WorkerComm.setExecHandler("rejectPromise", function () {
    return new Promise((_resolve, reject)=>{
        reject("nono");
    });
});

WorkerComm.setExecHandler("execInMainThread", function () {
    return new Promise(resolve=>{
        WorkerComm.execPeer("mainSayHi").then((response)=>{
            resolve(response);
        });
    });
});

WorkerComm.setExecHandler("execAndRejectInMainThread", function () {
    return new Promise(resolve=>{
        WorkerComm.execPeer("mainThrow").catch((response)=>{
            resolve(response);
        });
    });
});

WorkerComm.on("echoNotify1", function (evt, val) {
    WorkerComm.triggerPeer("echoNotify1", val);
});

// two handlers on same notification, one errors out
WorkerComm.on("echoNotify2", function () {
    throw Error("e");
});
WorkerComm.on("echoNotify2", function (evt, val) {
    WorkerComm.triggerPeer("echoNotify2", val);
});
