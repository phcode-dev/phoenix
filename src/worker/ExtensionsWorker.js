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
 * This is a generic web worker that is available for use by extensions to offload extension related tasks. This
 * should only be used for performing small compute tasks and should not be used for long-running compute tasks.
 *
 * * Extensions are advised to use [worker/IndexingWorker](IndexingWorker-API) if they are performing large number of
 *   file operations to utilize the file cache.
 * * Extensions performing large compute tasks should create their own worker and may use easy util methods in
 *   [worker/WorkerComm](WorkerComm-API) to communicate with the web worker.
 *
 * ## Import
 * ```js
 * // usage within extensions:
 * const ExtensionsWorker = brackets.getModule("worker/ExtensionsWorker");
 * ```
 * ## Extending the ExtensionsWorker
 * You can add your own custom scripts to the ExtensionsWorker by following the below example. Suppose you have an
 * extension folder with the following structure:
 * ```
 * myExtensionFolder
 * │  my_worker.js // the script that you need to attach to the web worker
 * │  main.js
 * ```
 * In `main.js` extension module, we can import `my_worker.js` script into `ExtensionsWorker` by:
 * ```js
 * let ExtensionUtils = brackets.getModule("utils/ExtensionUtils");
 * let workerPath = ExtensionUtils.getModulePath(module, "my_worker.js")
 * ExtensionsWorker.loadScriptInWorker(workerPath);
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
 * NB: You can use all util methods available in `worker/WorkerComm` as `ExtensionsWorker` internally uses `WorkerComm`
 * to communicate with the underlying worker thread.
 *
 * @module worker/ExtensionsWorker
 */
define(function (require, exports, module) {
    const WorkerComm = require("worker/WorkerComm"),
        EventDispatcher = require("utils/EventDispatcher");

    const _ExtensionsWorker = new Worker(
        `${Phoenix.baseURL}worker/extensions-worker-thread.js?debug=${window.logToConsolePref === 'true'}`);

    if(!_ExtensionsWorker){
        console.error("Could not load Extensions worker! Some extensions may not work as expected.");
    }
    EventDispatcher.makeEventDispatcher(exports);
    WorkerComm.createWorkerComm(_ExtensionsWorker, exports);
    /**
     * To communicate between the ExtensionsWorker and Phoenix, the following methods are available:
     * `loadScriptInWorker`, `execPeer`, `setExecHandler`, `triggerPeer` and other APIs described
     * in module `worker/WorkerComm`.
     * The above methods can be used with either `ExtensionsWorker` reference within Phoenix
     * or the global `WorkerComm` reference within the Indexing worker. (See example below.)
     *
     * See [worker/WorkerComm](WorkerComm-API) for detailed API docs.
     *
     * @example <caption>To Execute a named function `sayHello` in the worker from phoenix</caption>
     * // in my_worker.js
     * WorkerComm.setExecHandler("sayHello", (arg)=>{
     *     console.log("hello from worker ", arg); // prints "hello from worker phoenix"
     *     return "Hello Phoenix";
     *   });
     * // In Phoenix/extension
     * let workerMessage = await ExtensionsWorker.execPeer("sayHello", "phoenix");
     * console.log(workerMessage); // prints "Hello Phoenix"
     * @name WorkerComm-APIS
     */
});
