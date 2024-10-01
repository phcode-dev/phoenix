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

// @INCLUDE_IN_API_DOCS

/**
 * WorkerComm provides util methods to communicate between web workers and Phoenix.
 * This module can be loaded from within web-workers and a phoenix extension that loads the web-worker.
 *
 * ### Creating a WebWorker from your extension and attaching `WorkerComm` to it.
 * See an example extension code below that creates its own web worker and uses `WorkerComm` for communication.
 * @example
 * ```js
 * // from within an extension
 * const WorkerComm = brackets.getModule("worker/WorkerComm"),
 *       EventDispatcher = brackets.getModule("utils/EventDispatcher"),
 *       ExtensionUtils = brackets.getModule("utils/ExtensionUtils");
 *
 * // figure out the path of the web worker relative to your extension
 * let workerPath = ExtensionUtils.getModulePath(module, "my_worker_path_within_extension.js")
 *
 * // we need to pass in the `workerCommUrl` so that the web-worker can
 * // load`WorkerComm` within the worker context as described below.
 * let workerCommUrl = `${Phoenix.baseURL}worker/WorkerComm.js`;
 * let eventDispatcherURL = `${Phoenix.baseURL}utils/EventDispatcher.js`;
 *
 * // load the worker
 * const _myWorker = new Worker(
 * `${workerPath}?workerCommUrl=${workerCommUrl}&eventDispatcherURL=${eventDispatcherURL}`);
 *
 * // Not create a `WorkerComm` object and attach to your extension module exports.
 * EventDispatcher.makeEventDispatcher(exports);
 * // all WorkerComm objects needs to be an EventDispatcher.
 * WorkerComm.createWorkerComm(_myWorker, exports);
 *
 * // Now `exports` can be used to communicate with the web-worker
 * // using `WorkerComm` APIs listed below.
 * ```
 *
 * ### Loading `WorkerComm` from within your webWorker
 * The Web Worker we created above also needs to load `WorkerComm` to be able to communicate with the `WorkerComm`
 * instance in Phoenix. For this, we need to load `WorkerComm` from the URL parameters.
 * (WorkerComm.js lib url needs to passed in while creating the web worker from Phoenix).
 * @example
 * ```js
 * const urlParams = new URLSearchParams(location.search);
 * importScripts(urlParams.get('workerCommUrl'));
 * importScripts(urlParams.get('eventDispatcherURL'));
 * // After this, a global `WorkerComm` object will be available within the
 * // web-worker that can be used to communicate with Phoenix.
 * ```
 * ## APIs
 * @module worker/WorkerComm
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

    /**
     * Adds support for WorkerComm APIs to the provided web-Worker instance. Only available in the main thread.
     * This API should be called immediately after creating the worker in main thread.
     * Create a web-worker with `WorkerComm` in an extension.
     * // load the worker [See API docs for full sample]
     * const _myWorker = new Worker(
     * `${workerPath}?workerCommUrl=${workerCommUrl}&eventDispatcherURL=${eventDispatcherURL}`);
     *
     * // Now create a `WorkerComm` object and attach to your extension module exports.
     * EventDispatcher.makeEventDispatcher(exports);
     * // all WorkerComm objects needs to be an EventDispatcher.
     * WorkerComm.createWorkerComm(_myWorker, exports);
     * @param {string} postTarget - The web-worker reference.
     * @param {object} eventDispatcher created with `util/EventDispatcher`.
     * @type {function}
     */
    function createWorkerComm(postTarget, eventDispatcher) {
        let postUniqueId = 0;
        let callBacks = {};
        let execHandlers = {};

        /**
         * Sets a named function execution handler in the main thread or worker thread.
         * To set a named function `sayHello` in worker and phoenix
         *
         * function sayHello(arg)=>{
         *     console.log("hello from worker ", arg); // prints "hello from worker phoenix"
         *     return "Hello Phoenix";
         * }
         *
         * // For usage in web-worker say my_worker.js, use the global `WorkerComm` object.
         * WorkerComm.setExecHandler("sayHello", sayHello);
         * // For usage in phoenix extension side, use `eventDispatcher` object used with `createWorkerComm`.
         * YourWorker.setExecHandler("sayHello", sayHello);
         * @param {string} fnName - The name of the function to register as exec handler.
         * @param {function} execHandlerFn
         * @returns {Promise} That will be resolved or rejected based on function execution at the other end.
         * @type {function}
         */
        eventDispatcher.setExecHandler = function (fnName, execHandlerFn) {
            if(execHandlers[fnName]){
                console.error(`${env}: Exec handler of same name already registered, will be overwritten: ${fnName}`);
            }
            execHandlers[fnName] = execHandlerFn;
        };

        /**
         * Executes the named function at the other end if present. If this is called from the main thread, it will
         * execute the function at the worker thread and vice-versa. The function to execute
         * is set with API `setExecHandler`.
         * To Execute a named function `sayHello` in the worker from phoenix
         * // in my_worker.js
         * WorkerComm.setExecHandler("sayHello", (arg)=>{
         *     console.log("hello from worker ", arg); // prints "hello from worker phoenix"
         *     return "Hello Phoenix";
         *   });
         * // In Phoenix/extension
         * let workerMessage = await YourWorker.execPeer("sayHello", "phoenix");
         * console.log(workerMessage); // prints "Hello Phoenix"
         * @param {string} fnName - The name of the function to execute at the other end.
         * @param {object} paramObject to be passed on to the function at the other end.
         * @returns {Promise} That will be resolved or rejected based on function execution at the other end.
         * @type {function}
         */
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

        /**
         * Triggers events at the other end on the eventDispatcher. If this is called from the main thread, it will
         * trigger `WorkerComm` global at the worker thread. If this is called from the worker thread, it will
         * trigger `eventDispatcher` used in `createWorkerComm` API call when creating the worker.
         * To Trigger a named event `searchDone` from worker to phoenix
         * // in my_worker.js
         * WorkerComm.triggerPeer("searchDone", {matches: 2});
         *
         * // In Phoenix/extension, you can listen to these events
         * YourWorker.on("searchDone", (result)=>{
         *     console.log(result.matches);
         * });
         * @param {string} eventName to trigger at the other end
         * @param {object} paramObject to be passed on to the event listener at the other end.
         * @type {function}
         */
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
                for(let queuedLoads of loadScriptQueue){
                    eventDispatcher.loadScriptInWorker(queuedLoads.scriptURL, queuedLoads.isModule);
                }
                loadScriptQueue = [];
            }
            eventDispatcher.on(EVENT_WORKER_COMM_INIT_COMPLETE, loadPendingScripts);
            /**
             * Loads a script into the worker context. Only available within the main thread. This can be used
             * by the main Phoenix thread to dynamically load scripts in the worker-thread.
             * To load a script `add_worker_Script.js` into the your worker:
             * WorkerComm.createWorkerComm(_myWorker, exports);
             * .....
             * let ExtensionUtils = brackets.getModule("utils/ExtensionUtils");
             * let addWorkerScriptPath = ExtensionUtils.getModulePath(module, "add_worker_Script.js")
             * await exports.loadScriptInWorker(addWorkerScriptPath);
             * // if the worker is an es-module, then set optional isModule to true
             * // Eg.loadScriptInWorker(addWorkerScriptPath, true);
             * @param {string} scriptURL the Full url to load.
             * @param {boolean} isModule if the url is a module url
             * @type {function}
             */
            eventDispatcher.loadScriptInWorker = async function (scriptURL, isModule) {
                if(!workerCommLoadCompleteInWorker){
                    loadScriptQueue.push({scriptURL, isModule});
                    return;
                }
                await eventDispatcher.execPeer(EXEC_LOAD_SCRIPT, {scriptURL, isModule});
            };
        } else {
            function _loadScriptHandler({scriptURL, isModule}) {
                console.log(`${env}: loading script from url: ${scriptURL}, isModule: ${isModule}`);
                if(!isModule){
                    importScripts(scriptURL);
                } else {
                    return import(scriptURL);
                }
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
                    response.err = `"Unknown exec function received" ${data.exec}`;
                } else {
                    response.response = execHandlerFn(data.params);
                    if(response.response instanceof Promise){
                        response.response = await response.response;
                    }
                }
            } catch (err) {
                response.err = err.message || err.stack ?
                    {message: err.message, stack: err.stack}
                    : err.toString();
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

    if(globalObject.define && env === ENV_BROWSER){
        // for requirejs support
        define(function (require, exports, module) {
            exports.createWorkerComm = globalObject.WorkerComm.createWorkerComm;
            /**
             * Raised on main thread when WorkerComm is loaded in the web-worker and is ready.
             * @event EVENT_WORKER_COMM_INIT_COMPLETE
             */
            exports.EVENT_WORKER_COMM_INIT_COMPLETE = EVENT_WORKER_COMM_INIT_COMPLETE;
        });
    }
}());
