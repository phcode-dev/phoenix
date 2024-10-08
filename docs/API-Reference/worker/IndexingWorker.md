### Import :
```js
brackets.getModule("worker/IndexingWorker")
```

<a name="module_worker/IndexingWorker"></a>

## worker/IndexingWorker
Phoenix houses a file indexing worker which caches all cacheable files of a project in memory.
This module can be used to communicate with the Index and extend it by attaching new js worker scripts to the
indexing worker as discussed below. Any extension that works on a large number of files should use the indexing
worker cache to free up the main thread of heavy file access.

* Extensions performing large compute tasks should create their own worker and may use easy util methods in
  [worker/WorkerComm](./WorkerComm) to communicate with the web worker.

## Import

**Example**  
```js
// usage within extensions:
const IndexingWorker = brackets.getModule("worker/IndexingWorker");
```
## Extending the indexing worker
You can add your own custom scripts to the indexing worker by following the below example. Suppose you have an
extension folder with the following structure:
```
myExtensionFolder
│  my_worker.js // the script that you need to attach to the web worker
│  main.js
```
In `main.js` extension module, we can import `my_worker.js` script into `IndexingWorker` by:
**Example**  
```js
let ExtensionUtils = brackets.getModule("utils/ExtensionUtils");
let workerPath = ExtensionUtils.getModulePath(module, "my_worker.js")
IndexingWorker.loadScriptInWorker(workerPath);
```

Once the worker script is loaded with the above step:
* Phoenix can communicate with worker using the `IndexingWorker` reference in Phoenix.
* Worker can communicate with Phoenix with the global `WorkerComm` reference within the Indexing worker.
All utility methods in module [worker/WorkerComm](./WorkerComm) can be used for worker communication.

A global constant `Phoenix.baseURL` is available in the worker context to get the base url from which phoenix was
launched.

NB: You can use all util methods available in `worker/WorkerComm` as `IndexingWorker` internally uses `WorkerComm`
to communicate with the underlying worker thread.

* [worker/IndexingWorker](#module_worker/IndexingWorker)
    * [.WorkerComm](#module_worker/IndexingWorker..WorkerComm)
    * ["EVENT_CRAWL_STARTED"](#event_EVENT_CRAWL_STARTED)
    * ["EVENT_CRAWL_PROGRESS"](#event_EVENT_CRAWL_PROGRESS)
    * ["EVENT_CRAWL_COMPLETE"](#event_EVENT_CRAWL_COMPLETE)

<a name="module_worker/IndexingWorker..WorkerComm"></a>

### worker/IndexingWorker.WorkerComm
To communicate between the IndexingWorker and Phoenix, the following methods are available:
`loadScriptInWorker`, `execPeer`, `setExecHandler`, `triggerPeer` and other APIs described
in module `worker/WorkerComm`.
The above methods can be used with either `IndexingWorker` reference within Phoenix
or the global `WorkerComm` reference within the Indexing worker. (See example below.)

See [worker/WorkerComm](./WorkerComm) for detailed API docs.

```js
// To Execute a named function `extensionName.sayHello` in the worker from phoenix

// in my_worker.js. It is a good practice to prefix your `[extensionName]`
// to exec handler to prevent name collisions with other extensions.

WorkerComm.setExecHandler("extensionName.sayHello", (arg)=>{
    console.log("hello from worker ", arg); // prints "hello from worker phoenix"
    return "Hello Phoenix";
});

// In Phoenix/extension
let workerMessage = await IndexingWorker.execPeer("extensionName.sayHello", "phoenix");
console.log(workerMessage); // prints "Hello Phoenix"
```

**Kind**: inner property of [<code>worker/IndexingWorker</code>](#module_worker/IndexingWorker)  
<a name="event_EVENT_CRAWL_STARTED"></a>

### "EVENT_CRAWL_STARTED"
Raised when crawling started in the indexing worker.

**Kind**: event emitted by [<code>worker/IndexingWorker</code>](#module_worker/IndexingWorker)  
<a name="event_EVENT_CRAWL_PROGRESS"></a>

### "EVENT_CRAWL_PROGRESS"
Raised when crawling in progressing within the worker. The handler will receive the
following properties as parameter.

**Kind**: event emitted by [<code>worker/IndexingWorker</code>](#module_worker/IndexingWorker)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| processed | <code>number</code> | The number of files cached till now. |
| total | <code>number</code> | Number of files to cache. |

<a name="event_EVENT_CRAWL_COMPLETE"></a>

### "EVENT_CRAWL_COMPLETE"
Raised when crawling is complete within the worker. The handler will receive the
following properties as parameter.

**Kind**: event emitted by [<code>worker/IndexingWorker</code>](#module_worker/IndexingWorker)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| numFilesCached | <code>number</code> |  |
| cacheSizeBytes | <code>number</code> |  |
| crawlTimeMs | <code>number</code> | in milliseconds. |

