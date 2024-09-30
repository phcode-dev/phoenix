### Import :
```js
brackets.getModule("utils/EventDispatcher")
```

<a name="module_utils/EventDispatcher"></a>

## utils/EventDispatcher
Implements a jQuery-like event dispatch pattern for non-DOM objects (works in web workers and phoenix node as well):
 - Listeners are attached via on()/one() & detached via off()
 - Listeners can use namespaces for easy removal
 - Listeners can attach to multiple events at once via a space-separated list
 - Events are fired via trigger()
 - The same listener can be attached twice, and will be called twice; but off() will detach all
   duplicate copies at once ('duplicate' means '===' equality - see http://jsfiddle.net/bf4p29g5/1/)

But it has some important differences from jQuery's non-DOM event mechanism:
 - More robust to listeners that throw exceptions (other listeners will still be called, and
   trigger() will still return control to its caller).
 - Events can be marked deprecated, causing on() to issue warnings
 - Easier to debug, since the dispatch code is much simpler
 - Faster, for the same reason
 - Uses less memory, since $(nonDOMObj).on() leaks memory in jQuery
 - API is simplified:
     - Event handlers do not have 'this' set to the event dispatcher object
     - Event object passed to handlers only has 'type' and 'target' fields
     - trigger() uses a simpler argument-list signature (like Promise APIs), rather than requiring
       an Array arg and ignoring additional args
     - trigger() does not support namespaces
     - For simplicity, on() does not accept a map of multiple events -> multiple handlers, nor a
       missing arg standing in for a bare 'return false' handler.

For now, Brackets uses a jQuery patch to ensure $(obj).on() and obj.on() (etc.) are identical
for any obj that has the EventDispatcher pattern. In the future, this may be deprecated.

To add EventDispatcher methods to any object, call EventDispatcher.makeEventDispatcher(obj).

## Usage
### Importing from an extension

**Example**  
```js
const EventDispatcher = brackets.getModule("utils/EventDispatcher");
```
### Using the global object
The EventDispatcher Object is available within the global context, be it phoenix or phoenix core web workers or node.
**Example**  
```js
window.EventDispatcher.makeEventDispatcher(exports); // within phoenix require module
self.EventDispatcher.makeEventDispatcher(object); // within web worker
global.EventDispatcher.makeEventDispatcher(exports); // within node module that has an export
```

If you wish to import event dispatcher to your custom web worker, use the following
**Example**  
```js
importScripts('<relative path from your extension>/utils/EventDispatcher');
// this will add the global EventDispatcher to your web-worker. Note that the EventDispatcher in the web worker
// and node is a separate domain and cannot raise or listen to events in phoenix/other workers. For triggering events
// between different domains like between node and phcode, see `nodeConnector.triggerPeer` or
// `WorkerComm.triggerPeer` API for communication between phcode and web workers.
self.EventDispatcher.trigger("someEvent"); // within web worker
```
### Sample Usage within extension
**Example**  
```js
// in your extension js file.
define (function (require, exports, module) {
    const EventDispatcher     = brackets.getModule("utils/EventDispatcher");
    EventDispatcher.makeEventDispatcher(exports); // This extension triggers some events
    let eventHandler = function (event, paramObject, paramVal) {
        console.log(event, paramObject, paramVal);
    };
    exports.on("sampleEvent", eventHandler); // listen to our own event for demo
    exports.trigger("sampleEvent", { // trigger a sample event. This will activate the above listener 'on' function.
            param: 1,
            param2: "sample"
    }, "value");
    // If needed, the event listener can be removed with `off`. But it is not a requirement at shutdown.
    exports.off("sampleEvent", eventHandler);
}
```

* [utils/EventDispatcher](#module_utils/EventDispatcher)
    * [.splitNs(eventName)](#module_utils/EventDispatcher..splitNs) ⇒ <code>Object</code>
    * [.setLeakThresholdForEvent(eventName, threshold)](#module_utils/EventDispatcher..setLeakThresholdForEvent) : <code>function</code>
    * [.on(events, fn)](#module_utils/EventDispatcher..on) : <code>function</code>
    * [.off(events, fn)](#module_utils/EventDispatcher..off) : <code>function</code>
    * [.one(events, fn)](#module_utils/EventDispatcher..one) : <code>function</code>
    * [.trigger(eventName)](#module_utils/EventDispatcher..trigger) : <code>function</code>
    * [.makeEventDispatcher(obj)](#module_utils/EventDispatcher..makeEventDispatcher) : <code>function</code>
    * [.triggerWithArray(dispatcher, eventName, argsArray)](#module_utils/EventDispatcher..triggerWithArray) : <code>function</code>
    * [.on_duringInit(futureDispatcher, events, fn)](#module_utils/EventDispatcher..on_duringInit) : <code>function</code>
    * [.markDeprecated(obj, eventName, [insteadStr])](#module_utils/EventDispatcher..markDeprecated) : <code>function</code>

<a name="module_utils/EventDispatcher..splitNs"></a>

### utils/EventDispatcher.splitNs(eventName) ⇒ <code>Object</code>
Split "event.namespace" string into its two parts; both parts are optional.

**Kind**: inner method of [<code>utils/EventDispatcher</code>](#module_utils/EventDispatcher)  
**Returns**: <code>Object</code> - Uses "" for missing parts.  

| Param | Type | Description |
| --- | --- | --- |
| eventName | <code>string</code> | Event name and/or trailing ".namespace" |

<a name="module_utils/EventDispatcher..setLeakThresholdForEvent"></a>

### utils/EventDispatcher.setLeakThresholdForEvent(eventName, threshold) : <code>function</code>
By default, we consider any events having more than 15 listeners to be leaky. But sometimes there may be
genuine use cases where an event can have a large number of listeners. For those events, it is recommended
to increase the leaky warning threshold individually with this API.

**Kind**: inner method of [<code>utils/EventDispatcher</code>](#module_utils/EventDispatcher)  

| Param | Type | Description |
| --- | --- | --- |
| eventName | <code>string</code> |  |
| threshold | <code>number</code> | The new threshold to set. Will only be set if the new threshold is greater than the current threshold. |

<a name="module_utils/EventDispatcher..on"></a>

### utils/EventDispatcher.on(events, fn) : <code>function</code>
Adds the given handler function to 'events': a space-separated list of one or more event names, each
with an optional ".namespace" (used by off() - see below). If the handler is already listening to this
event, a duplicate copy is added.

**Kind**: inner method of [<code>utils/EventDispatcher</code>](#module_utils/EventDispatcher)  

| Param | Type |
| --- | --- |
| events | <code>string</code> | 
| fn | <code>function</code> | 

<a name="module_utils/EventDispatcher..off"></a>

### utils/EventDispatcher.off(events, fn) : <code>function</code>
Removes one or more handler functions based on the space-separated 'events' list. Each item in
'events' can be: bare event name, bare .namespace, or event.namespace pair. This yields a set of
matching handlers. If 'fn' is omitted, all these handlers are removed. If 'fn' is provided,
only handlers exactly equal to 'fn' are removed (there may still be >1, if duplicates were added).

**Kind**: inner method of [<code>utils/EventDispatcher</code>](#module_utils/EventDispatcher)  

| Param | Type |
| --- | --- |
| events | <code>string</code> | 
| fn | <code>function</code> | 

<a name="module_utils/EventDispatcher..one"></a>

### utils/EventDispatcher.one(events, fn) : <code>function</code>
Attaches a handler so it's only called once (per event in the 'events' list).

**Kind**: inner method of [<code>utils/EventDispatcher</code>](#module_utils/EventDispatcher)  

| Param | Type |
| --- | --- |
| events | <code>string</code> | 
| fn | <code>function</code> | 

<a name="module_utils/EventDispatcher..trigger"></a>

### utils/EventDispatcher.trigger(eventName) : <code>function</code>
Invokes all handlers for the given event (in the order they were added).

**Kind**: inner method of [<code>utils/EventDispatcher</code>](#module_utils/EventDispatcher)  

| Param | Type | Description |
| --- | --- | --- |
| eventName | <code>string</code> |  |
| ... | <code>\*</code> | Any additional args are passed to the event handler after the event object |

<a name="module_utils/EventDispatcher..makeEventDispatcher"></a>

### utils/EventDispatcher.makeEventDispatcher(obj) : <code>function</code>
Adds the EventDispatcher APIs to the given object: on(), one(), off(), and trigger(). May also be
called on a prototype object - each instance will still behave independently.

**Kind**: inner method of [<code>utils/EventDispatcher</code>](#module_utils/EventDispatcher)  

| Param | Type | Description |
| --- | --- | --- |
| obj | <code>Object</code> | Object to add event-dispatch methods to |

<a name="module_utils/EventDispatcher..triggerWithArray"></a>

### utils/EventDispatcher.triggerWithArray(dispatcher, eventName, argsArray) : <code>function</code>
Utility for calling on() with an array of arguments to pass to event handlers (rather than a varargs
list). makeEventDispatcher() must have previously been called on 'dispatcher'.

**Kind**: inner method of [<code>utils/EventDispatcher</code>](#module_utils/EventDispatcher)  

| Param | Type |
| --- | --- |
| dispatcher | <code>Object</code> | 
| eventName | <code>string</code> | 
| argsArray | <code>Array.&lt;\*&gt;</code> | 

<a name="module_utils/EventDispatcher..on_duringInit"></a>

### utils/EventDispatcher.on\_duringInit(futureDispatcher, events, fn) : <code>function</code>
Utility for attaching an event handler to an object that has not YET had makeEventDispatcher() called
on it, but will in the future. Once 'futureDispatcher' becomes a real event dispatcher, any handlers
attached here will be retained.

Useful with core modules that have circular dependencies (one module initially gets an empty copy of the
other, with no on() API present yet). Unlike other strategies like waiting for htmlReady(), this helper
guarantees you won't miss any future events, regardless of how soon the other module finishes init and
starts calling trigger().

**Kind**: inner method of [<code>utils/EventDispatcher</code>](#module_utils/EventDispatcher)  

| Param | Type |
| --- | --- |
| futureDispatcher | <code>Object</code> | 
| events | <code>string</code> | 
| fn | <code>function</code> | 

<a name="module_utils/EventDispatcher..markDeprecated"></a>

### utils/EventDispatcher.markDeprecated(obj, eventName, [insteadStr]) : <code>function</code>
Mark a given event name as deprecated, such that on() will emit warnings when called with it.
May be called before makeEventDispatcher(). May be called on a prototype where makeEventDispatcher()
is called separately per instance (i.e. in the constructor). Should be called before clients have
a chance to start calling on().

**Kind**: inner method of [<code>utils/EventDispatcher</code>](#module_utils/EventDispatcher)  

| Param | Type | Description |
| --- | --- | --- |
| obj | <code>Object</code> | Event dispatcher object |
| eventName | <code>string</code> | Name of deprecated event |
| [insteadStr] | <code>string</code> | Suggested thing to use instead |

