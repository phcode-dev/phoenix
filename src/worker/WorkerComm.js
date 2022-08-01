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

/*global Phoenix*/

/**
 * util methods to communicate with web workers. this module can be loaded from within brackets or from web workers.
 */

(function () {

    const ENV_BROWSER = 'browser',
        ENV_WORKER = 'worker',
        EVT_TYPE_EXEC = 'exec',
        EVT_TYPE_RESPONSE = 'response',
        EVT_TYPE_TRIGGER = 'trigger';

    const EXEC_LOAD_SCRIPT = 'loadScript',
        EVENT_WORKER_COMM_INIT_COMPLETE = "WorkerCommInitDone";

    let globalObject = {};
    let env;
    if(typeof window !== 'undefined'){
        globalObject = window; // browser
        env = ENV_BROWSER;
    } else if(typeof self !== 'undefined'){
        globalObject = self; // web worker
        env = ENV_WORKER;
    } else {
        console.error("unknown environment used to setup WorkerComm");
    }

    if(globalObject.WorkerComm){
        // already created
        return;
    }

    if(!globalObject.EventDispatcher){
        console.error(
            `${env}: Event dispatcher not loaded. Please importScripts utils/EventDispatcher.js before WorkerComm`);
        return;
    }

    function createWorkerComm(postTarget, eventDispatcher) {
        let postUniqueId = 0;
        let callBacks = {};
        let execHandlers = {};
        eventDispatcher.execPeer = function (fnName, paramObject) {
            postUniqueId++;
            return new Promise((resolve, reject)=>{
                postTarget.postMessage(JSON.stringify({
                    type: EVT_TYPE_EXEC,
                    exec: fnName,
                    params: paramObject,
                    postUniqueId: postUniqueId
                }));
                callBacks[postUniqueId] = {resolve, reject};
            });
        };

        eventDispatcher.setExecHandler = function (fnName, execHandlerFn) {
            if(execHandlers[fnName]){
                console.error(`${env}: Exec handler of same name already registered, will be overwritten: ${fnName}`);
            }
            execHandlers[fnName] = execHandlerFn;
        };

        eventDispatcher.triggerPeer = function (eventName, paramObject) {
            postTarget.postMessage(JSON.stringify({
                type: EVT_TYPE_TRIGGER,
                eventName: eventName,
                params: paramObject
            }));
        };

        if(env === ENV_BROWSER){
            // In browser main thread, loadScriptInWorker api will be present in WorkerComm. But we have to ensure that
            // within the web-worker thread, WorkerComm is inited to properly handle the script load message. So,
            // we queue all script load requests till we get EVENT_WORKER_COMM_INIT_COMPLETE and then load all pending
            // queued scripts.
            let loadScriptQueue = [],
                workerCommLoadCompleteInWorker = false;
            function loadPendingScripts() {
                workerCommLoadCompleteInWorker = true;
                for(let scriptUrl of loadScriptQueue){
                    eventDispatcher.loadScriptInWorker(scriptUrl);
                }
                loadScriptQueue = [];
            }
            eventDispatcher.on(EVENT_WORKER_COMM_INIT_COMPLETE, loadPendingScripts);
            eventDispatcher.loadScriptInWorker = function (scriptURL) {
                if(!workerCommLoadCompleteInWorker){
                    loadScriptQueue.push(scriptURL);
                    return;
                }
                eventDispatcher.execPeer(EXEC_LOAD_SCRIPT, scriptURL);
            };
        } else {
            function _loadScriptHandler(url) {
                console.log(`${env}: loading script from url: ${url}`);
                importScripts(url);
            }
            eventDispatcher.setExecHandler(EXEC_LOAD_SCRIPT, _loadScriptHandler);
        }


        function _processResponse(data) {
            if(data.type === EVT_TYPE_RESPONSE){
                // this is a response event
                let postUniqueId = data.postUniqueId;
                if(callBacks[postUniqueId]){
                    let {resolve, reject} = callBacks[postUniqueId];
                    if(data.err){
                        reject(data.err);
                    } else {
                        resolve(data.response);
                    }
                    delete callBacks[postUniqueId];
                }
                return true;
            }
            return false;
        }

        function _processTrigger(data) {
            if(data.type === EVT_TYPE_TRIGGER){
                // this is a trigger event
                eventDispatcher.trigger(data.eventName, data.params);
                return true;
            }
            return false;
        }

        async function _processExec(data) {
            let response = {
                type: EVT_TYPE_RESPONSE,
                err: null,
                response: null,
                postUniqueId: data.postUniqueId
            };
            let execHandlerFn = execHandlers[data.exec];
            try {
                if(!execHandlerFn){
                    console.error(`${env}: Unknown exec function received: ${JSON.stringify(data)}`);
                    response.err = `"Unknown exec function received" ${data}`;
                } else {
                    response.response = execHandlerFn(data.params);
                    if(response.response instanceof Promise){
                        response.response = await response.response;
                    }
                }
            } catch (err) {
                response.err = err;
            }
            postTarget.postMessage(JSON.stringify(response));
        }

        postTarget.onmessage = async function(e) {
            let data = JSON.parse(e.data);
            if(_processResponse(data)){
                return;
            }
            if(_processTrigger(data)){
                return;
            }
            await _processExec(data);
        };
    }

    if(env === ENV_BROWSER){
        // from browser thread, multiple worker thread can be created and attached to workerComm.
        globalObject.WorkerComm = {createWorkerComm};
    } else {
        // from worker thread, communication is only possible with parent main thread.
        // we create a global `WorkerComm` in worker for event handling within the worker
        globalObject.WorkerComm = {};
        globalObject.EventDispatcher.makeEventDispatcher(globalObject.WorkerComm);
        createWorkerComm(globalObject, globalObject.WorkerComm);
        globalObject.WorkerComm.triggerPeer(EVENT_WORKER_COMM_INIT_COMPLETE);
    }
}());
