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
// @INCLUDE_IN_API_DOCS
/**
 * Phoenix houses a file indexing worker which caches all cacheable files of a project in memory.
 * This module can be used to communicate with the Index and extend it by attaching new js worker scripts to the
 * indexing worker as discussed below. Any extension that works on a large number of files should use the indexing
 * worker cache to free up the main thread of heavy file access. This is similar to
 * [worker/ExtensionsWorker](ExtensionsWorker-API) but with a full file index.
 *
 * * Extensions are advised to use [worker/ExtensionsWorker](ExtensionsWorker-API) if they do not use the file index and
 *   just want to offload minor tasks.
 * * Extensions performing large compute tasks should create their own worker and may use easy util methods in
 *   [worker/WorkerComm](WorkerComm-API) to communicate with the web worker.
 *
 * ## Import
 * ```js
 * // usage within extensions:
 * const IndexingWorker = brackets.getModule("worker/IndexingWorker");
 * ```
 * ## Extending the indexing worker
 * You can add your own custom scripts to the indexing worker by following the below example. Suppose you have an
 * extension folder with the following structure:
 * ```
 * myExtensionFolder
 * │  my_worker.js // the script that you need to attach to the web worker
 * │  main.js
 * ```
 * In `main.js` extension module, we can import `my_worker.js` script into `IndexingWorker` by:
 * ```js
 * let ExtensionUtils = brackets.getModule("utils/ExtensionUtils");
 * let workerPath = ExtensionUtils.getModulePath(module, "my_worker.js")
 * IndexingWorker.loadScriptInWorker(workerPath);
 * ```
 *
 * Once the worker script is loaded with the above step:
 * * Phoenix can communicate with worker using the `IndexingWorker` reference in Phoenix.
 * * Worker can communicate with Phoenix with the global `WorkerComm` reference within the Indexing worker.
 * All utility methods in module [worker/WorkerComm](WorkerComm-API) can be used for worker communication.
 *
 * A global constant `Phoenix.baseURL` is available in the worker context to get the base url from which phoenix was
 * launched.
 *
 * NB: You can use all util methods available in `worker/WorkerComm` as `IndexingWorker` internally uses `WorkerComm`
 * to communicate with the underlying worker thread.
 *
 * @module worker/IndexingWorker
 */
define(function (require, exports, module) {
    const EventDispatcher = require("utils/EventDispatcher"),
        WorkerComm = require("worker/WorkerComm");

    const _FileIndexingWorker = new Worker(
        `${Phoenix.baseURL}worker/file-Indexing-Worker-thread.js?debug=${window.logger.logToConsolePref === 'true'}`);

    if(!_FileIndexingWorker){
        console.error("Could not load find in files worker! Search will be disabled.");
    }
    EventDispatcher.makeEventDispatcher(exports);
    WorkerComm.createWorkerComm(_FileIndexingWorker, exports);
    if(window.nodeSetupDonePromise){
        window.nodeSetupDonePromise.then(nodeConfig =>{
            exports.execPeer("setTauriFSWS", nodeConfig.phoenixFSURL);
        });
    }
    /**
     * To communicate between the IndexingWorker and Phoenix, the following methods are available:
     * `loadScriptInWorker`, `execPeer`, `setExecHandler`, `triggerPeer` and other APIs described
     * in module `worker/WorkerComm`.
     * The above methods can be used with either `IndexingWorker` reference within Phoenix
     * or the global `WorkerComm` reference within the Indexing worker. (See example below.)
     *
     * See [worker/WorkerComm](WorkerComm-API) for detailed API docs.
     *
     * @example <caption>To Execute a named function `extensionName.sayHello` in the worker from phoenix</caption>
     * // in my_worker.js. It is a good practice to prefix your `[extensionName]`
     * // to exec handler to prevent name collisions with other extensions.
     * WorkerComm.setExecHandler("extensionName.sayHello", (arg)=>{
     *     console.log("hello from worker ", arg); // prints "hello from worker phoenix"
     *     return "Hello Phoenix";
     *   });
     * // In Phoenix/extension
     * let workerMessage = await IndexingWorker.execPeer("extensionName.sayHello", "phoenix");
     * console.log(workerMessage); // prints "Hello Phoenix"
     * @name WorkerComm-APIS
     */

    /**
     * Raised when crawling started in the indexing worker.
     * @event EVENT_CRAWL_STARTED
     * @type {null}
     */
    exports.EVENT_CRAWL_STARTED = "crawlStarted";
    /**
     * Raised when crawling in progressing within the worker. The handler will receive the
     * following properties as parameter.
     * @event EVENT_CRAWL_PROGRESS
     * @type {object}
     * @property {number} processed The number of files cached till now.
     * @property {number} total Number of files to cache.
     */
    exports.EVENT_CRAWL_PROGRESS = "crawlProgress";
    /**
     * Raised when crawling is complete within the worker. The handler will receive the
     * following properties as parameter.
     * @event EVENT_CRAWL_COMPLETE
     * @type {object}
     * @property {number} numFilesCached
     * @property {number} cacheSizeBytes
     * @property {number} crawlTimeMs in milliseconds.
     */
    exports.EVENT_CRAWL_COMPLETE = "crawlComplete";
});
