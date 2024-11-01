### Import :
```js
const Async = brackets.getModule("utils/Async")
```

<a name="PromiseQueue"></a>

## PromiseQueue
**Kind**: global class  

* [PromiseQueue](#PromiseQueue)
    * [new PromiseQueue()](#new_PromiseQueue_new)
    * [.add(op)](#PromiseQueue+add)
    * [.removeAll()](#PromiseQueue+removeAll)

<a name="new_PromiseQueue_new"></a>

### new PromiseQueue()
Creates a queue of async operations that will be executed sequentially. Operations can be added to the
queue at any time. If the queue is empty and nothing is currently executing when an operation is added,
it will execute immediately. Otherwise, it will execute when the last operation currently in the queue
has finished.

<a name="PromiseQueue+add"></a>

### promiseQueue.add(op)
Adds an operation to the queue. If nothing is currently executing, it will execute immediately (and
the next operation added to the queue will wait for it to complete). Otherwise, it will wait until
the last operation in the queue (or the currently executing operation if nothing is in the queue) is
finished. The operation must return a promise that will be resolved or rejected when it's finished;
the queue will continue with the next operation regardless of whether the current operation's promise
is resolved or rejected.

**Kind**: instance method of [<code>PromiseQueue</code>](#PromiseQueue)  

| Param | Type | Description |
| --- | --- | --- |
| op | <code>function</code> | The operation to add to the queue. |

<a name="PromiseQueue+removeAll"></a>

### promiseQueue.removeAll()
Removes all pending promises from the queue.

**Kind**: instance method of [<code>PromiseQueue</code>](#PromiseQueue)  
<a name="ERROR_TIMEOUT"></a>

## ERROR\_TIMEOUT : <code>Object</code>
Value passed to fail() handlers that have been triggered due to withTimeout()'s timeout

**Kind**: global variable  
<a name="doInParallel"></a>

## doInParallel(items, beginProcessItem, failFast) ⇒ <code>$.Promise</code>
Executes a series of tasks in parallel, returning a "master" Promise that is resolved once
all the tasks have resolved. If one or more tasks fail, behavior depends on the failFast
flag:
  - If true, the master Promise is rejected as soon as the first task fails. The remaining
    tasks continue to completion in the background.
  - If false, the master Promise is rejected after all tasks have completed.

If nothing fails:          (M = master promise; 1-4 = tasks; d = done; F = fail)
 M  ------------d
 1 >---d        .
 2 >------d     .
 3 >---------d  .
 4 >------------d

With failFast = false:
 M  ------------F
 1 >---d     .  .
 2 >------d  .  .
 3 >---------F  .
 4 >------------d

With failFast = true: -- equivalent to $.when()
 M  ---------F
 1 >---d     .
 2 >------d  .
 3 >---------F
 4 >------------d   (#4 continues even though master Promise has failed)
(Note: if tasks finish synchronously, the behavior is more like failFast=false because you
won't get a chance to respond to the master Promise until after all items have been processed)

To perform task-specific work after an individual task completes, attach handlers to each
Promise before beginProcessItem() returns it.

Note: don't use this if individual tasks (or their done/fail handlers) could ever show a user-
visible dialog: because they run in parallel, you could show multiple dialogs atop each other.

**Kind**: global function  

| Param | Type |
| --- | --- |
| items | <code>Array.&lt;\*&gt;</code> | 
| beginProcessItem | <code>function</code> | 
| failFast | <code>boolean</code> | 

<a name="doSequentially"></a>

## doSequentially(items, beginProcessItem, failAndStopFast) ⇒ <code>$.Promise</code>
Executes a series of tasks in serial (task N does not begin until task N-1 has completed).
Returns a "master" Promise that is resolved once all the tasks have resolved. If one or more
tasks fail, behavior depends on the failAndStopFast flag:
  - If true, the master Promise is rejected as soon as the first task fails. The remaining
    tasks are never started (the serial sequence is stopped).
  - If false, the master Promise is rejected after all tasks have completed.

If nothing fails:
 M  ------------d
 1 >---d        .
 2     >--d     .
 3        >--d  .
 4           >--d

With failAndStopFast = false:
 M  ------------F
 1 >---d     .  .
 2     >--d  .  .
 3        >--F  .
 4           >--d

With failAndStopFast = true:
 M  ---------F
 1 >---d     .
 2     >--d  .
 3        >--F
 4          (#4 never runs)

To perform task-specific work after an individual task completes, attach handlers to each
Promise before beginProcessItem() returns it.

**Kind**: global function  

| Param | Type |
| --- | --- |
| items | <code>Array.&lt;\*&gt;</code> | 
| beginProcessItem | <code>function</code> | 
| failAndStopFast | <code>boolean</code> | 

<a name="doSequentiallyInBackground"></a>

## doSequentiallyInBackground(items, fnProcessItem, [maxBlockingTime], [idleTime]) ⇒ <code>$.Promise</code>
Executes a series of synchronous tasks sequentially spread over time-slices less than maxBlockingTime.
Processing yields by idleTime between time-slices.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| items | <code>Array.&lt;\*&gt;</code> |  |
| fnProcessItem | <code>function</code> | Function that synchronously processes one item |
| [maxBlockingTime] | <code>number</code> |  |
| [idleTime] | <code>number</code> |  |

<a name="firstSequentially"></a>

## firstSequentially(items, beginProcessItem) ⇒ <code>$.Promise</code>
Executes a series of tasks in serial (task N does not begin until task N-1 has completed).
Returns a "master" Promise that is resolved when the first task has resolved. If all tasks
fail, the master Promise is rejected.

**Kind**: global function  

| Param | Type |
| --- | --- |
| items | <code>Array.&lt;\*&gt;</code> | 
| beginProcessItem | <code>function</code> | 

<a name="doInParallel_aggregateErrors"></a>

## doInParallel\_aggregateErrors(items, beginProcessItem) ⇒ <code>$.Promise</code>
Executes a series of tasks in parallel, saving up error info from any that fail along the way.
Returns a Promise that is only resolved/rejected once all tasks are complete. This is
essentially a wrapper around doInParallel(..., false).

If one or more tasks failed, the entire "master" promise is rejected at the end - with one
argument: an array objects, one per failed task. Each error object contains:
 - item -- the entry in items whose task failed
 - error -- the first argument passed to the fail() handler when the task failed

**Kind**: global function  

| Param | Type |
| --- | --- |
| items | <code>Array.&lt;\*&gt;</code> | 
| beginProcessItem | <code>function</code> | 

<a name="withTimeout"></a>

## withTimeout(promise, timeout, [resolveTimeout]) ⇒ <code>$.Promise</code>
Adds timeout-driven termination to a Promise: returns a new Promise that is resolved/rejected when
the given original Promise is resolved/rejected, OR is resolved/rejected after the given delay -
whichever happens first.

If the original Promise is resolved/rejected first, done()/fail() handlers receive arguments
piped from the original Promise. If the timeout occurs first instead, then resolve() or
fail() (with Async.ERROR_TIMEOUT) is called based on value of resolveTimeout.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| promise | <code>$.Promise</code> |  |
| timeout | <code>number</code> |  |
| [resolveTimeout] | <code>boolean</code> | If true, then resolve deferred on timeout, otherwise reject. Default is false. |

<a name="waitForAll"></a>

## waitForAll(promises, [failOnReject], [timeout]) ⇒ <code>$.Promise</code>
Allows waiting for all the promises to be either resolved or rejected.
Unlike $.when(), it does not call .fail() or .always() handlers on first
reject. The caller should take all the precaution to make sure all the
promises passed to this function are completed to avoid blocking.

If failOnReject is set to true, promise returned by the function will be
rejected if at least one of the promises was rejected. The default value
is false, which will cause the call to this function to be always
successfully resolved.

If timeout is specified, the promise will be rejected on timeout as per
Async.withTimeout.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A Promise which will be resolved once all dependent promises are resolved.
                    It is resolved with an array of results from the successfully resolved dependent promises.
                    The resulting array may not be in the same order or contain as many items as there were
                    promises to wait on and it will contain 'undefined' entries for those promises that resolve
                    without a result.  

| Param | Type | Description |
| --- | --- | --- |
| promises | <code>Array.&lt;$.Promise&gt;</code> | Array of promises to wait for |
| [failOnReject] | <code>boolean</code> | Whether to reject or not if one of the promises has been rejected. |
| [timeout] | <code>number</code> | Number of milliseconds to wait until rejecting the promise |

<a name="chain"></a>

## chain(functions, args) ⇒ <code>jQuery.Promise</code>
Chains a series of synchronous and asynchronous (jQuery promise-returning) functions
together, using the result of each successive function as the argument(s) to the next.
A promise is returned that resolves with the result of the final call if all calls
resolve or return normally. Otherwise, if any of the functions reject or throw, the
computation is halted immediately and the promise is rejected with this halting error.

**Kind**: global function  
**Returns**: <code>jQuery.Promise</code> - A promise that resolves with the result of the final call, or
     rejects with the first error.  

| Param | Type | Description |
| --- | --- | --- |
| functions | <code>Array.&lt;function(\*)&gt;</code> | Functions to be chained |
| args | <code>Array</code> | Arguments to call the first function with |

<a name="promisify"></a>

## promisify(obj, method, ...varargs) ⇒ <code>$.Promise</code>
Utility for converting a method that takes (error, callback) to one that returns a promise;
useful for using FileSystem methods (or other Node-style API methods) in a promise-oriented
workflow. For example, instead of
```js
     var deferred = new $.Deferred();
     file.read(function (err, contents) {
         if (err) {
             deferred.reject(err);
         } else {
             // ...process the contents...
             deferred.resolve();
         }
     }
     return deferred.promise();
```
you can just do

     return Async.promisify(file, "read").then(function (contents) {
         // ...process the contents...
     });

The object/method are passed as an object/string pair so that we can
properly call the method without the caller having to deal with "bind" all the time.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise that is resolved with the arguments that were passed to the
     errback (not including the err argument) if err is null, or rejected with the err if
     non-null.  

| Param | Type | Description |
| --- | --- | --- |
| obj | <code>Object</code> | The object to call the method on. |
| method | <code>string</code> | The name of the method. The method should expect the errback      as its last parameter. |
| ...varargs | <code>Object</code> | The arguments you would have normally passed to the method      (excluding the errback itself). |

