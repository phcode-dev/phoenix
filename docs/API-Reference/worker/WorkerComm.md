### Import :
```js
const WorkerComm = brackets.getModule("worker/WorkerComm")
```

<a name="module_worker/WorkerComm"></a>

## worker/WorkerComm
WorkerComm provides util methods to communicate between web workers and Phoenix.This module can be loaded from within web-workers and a phoenix extension that loads the web-worker.### Creating a WebWorker from your extension and attaching `WorkerComm` to it.See an example extension code below that creates its own web worker and uses `WorkerComm` for communication.

**Example**  
```js// from within an extensionconst WorkerComm = brackets.getModule("worker/WorkerComm"),      EventDispatcher = brackets.getModule("utils/EventDispatcher"),      ExtensionUtils = brackets.getModule("utils/ExtensionUtils");// figure out the path of the web worker relative to your extensionlet workerPath = ExtensionUtils.getModulePath(module, "my_worker_path_within_extension.js")// we need to pass in the `workerCommUrl` so that the web-worker can// load`WorkerComm` within the worker context as described below.let workerCommUrl = `${Phoenix.baseURL}worker/WorkerComm.js`;let eventDispatcherURL = `${Phoenix.baseURL}utils/EventDispatcher.js`;// load the workerconst _myWorker = new Worker(`${workerPath}?workerCommUrl=${workerCommUrl}&eventDispatcherURL=${eventDispatcherURL}`);// Not create a `WorkerComm` object and attach to your extension module exports.EventDispatcher.makeEventDispatcher(exports);// all WorkerComm objects needs to be an EventDispatcher.WorkerComm.createWorkerComm(_myWorker, exports);// Now `exports` can be used to communicate with the web-worker// using `WorkerComm` APIs listed below.```### Loading `WorkerComm` from within your webWorkerThe Web Worker we created above also needs to load `WorkerComm` to be able to communicate with the `WorkerComm`instance in Phoenix. For this, we need to load `WorkerComm` from the URL parameters.(WorkerComm.js lib url needs to passed in while creating the web worker from Phoenix).
**Example**  
```jsconst urlParams = new URLSearchParams(location.search);importScripts(urlParams.get('workerCommUrl'));importScripts(urlParams.get('eventDispatcherURL'));// After this, a global `WorkerComm` object will be available within the// web-worker that can be used to communicate with Phoenix.```## APIs

* [worker/WorkerComm](#module_worker/WorkerComm)
    * [.createWorkerComm(postTarget, eventDispatcher)](#module_worker/WorkerComm..createWorkerComm) : <code>function</code>
    * ["EVENT_WORKER_COMM_INIT_COMPLETE"](#event_EVENT_WORKER_COMM_INIT_COMPLETE)

<a name="module_worker/WorkerComm..createWorkerComm"></a>

### worker/WorkerComm.createWorkerComm(postTarget, eventDispatcher) : <code>function</code>
Adds support for WorkerComm APIs to the provided web-Worker instance. Only available in the main thread.This API should be called immediately after creating the worker in main thread.Create a web-worker with `WorkerComm` in an extension.// load the worker [See API docs for full sample]const _myWorker = new Worker(`${workerPath}?workerCommUrl=${workerCommUrl}&eventDispatcherURL=${eventDispatcherURL}`);// Now create a `WorkerComm` object and attach to your extension module exports.EventDispatcher.makeEventDispatcher(exports);// all WorkerComm objects needs to be an EventDispatcher.WorkerComm.createWorkerComm(_myWorker, exports);

**Kind**: inner method of [<code>worker/WorkerComm</code>](#module_worker/WorkerComm)  

| Param | Type | Description |
| --- | --- | --- |
| postTarget | <code>string</code> | The web-worker reference. |
| eventDispatcher | <code>object</code> | created with `util/EventDispatcher`. |

<a name="event_EVENT_WORKER_COMM_INIT_COMPLETE"></a>

### "EVENT_WORKER_COMM_INIT_COMPLETE"
Raised on main thread when WorkerComm is loaded in the web-worker and is ready.

**Kind**: event emitted by [<code>worker/WorkerComm</code>](#module_worker/WorkerComm)  
