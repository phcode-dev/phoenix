### Import :
```js
const EventDispatcher = brackets.getModule("utils/EventDispatcher")
```

<a name="module_utils/EventDispatcher"></a>

## utils/EventDispatcher
Implements a jQuery-like event dispatch pattern for non-DOM objects (works in web workers and phoenix node as well):

**Example**  
```js
**Example**  
```js
**Example**  
```js
**Example**  
```js

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

**Kind**: inner method of [<code>utils/EventDispatcher</code>](#module_utils/EventDispatcher)  

| Param | Type | Description |
| --- | --- | --- |
| eventName | <code>string</code> |  |
| threshold | <code>number</code> | The new threshold to set. Will only be set if the new threshold is greater than the current threshold. |

<a name="module_utils/EventDispatcher..on"></a>

### utils/EventDispatcher.on(events, fn) : <code>function</code>
Adds the given handler function to 'events': a space-separated list of one or more event names, each

**Kind**: inner method of [<code>utils/EventDispatcher</code>](#module_utils/EventDispatcher)  

| Param | Type |
| --- | --- |
| events | <code>string</code> | 
| fn | <code>function</code> | 

<a name="module_utils/EventDispatcher..off"></a>

### utils/EventDispatcher.off(events, fn) : <code>function</code>
Removes one or more handler functions based on the space-separated 'events' list. Each item in

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

**Kind**: inner method of [<code>utils/EventDispatcher</code>](#module_utils/EventDispatcher)  

| Param | Type | Description |
| --- | --- | --- |
| obj | <code>Object</code> | Object to add event-dispatch methods to |

<a name="module_utils/EventDispatcher..triggerWithArray"></a>

### utils/EventDispatcher.triggerWithArray(dispatcher, eventName, argsArray) : <code>function</code>
Utility for calling on() with an array of arguments to pass to event handlers (rather than a varargs

**Kind**: inner method of [<code>utils/EventDispatcher</code>](#module_utils/EventDispatcher)  

| Param | Type |
| --- | --- |
| dispatcher | <code>Object</code> | 
| eventName | <code>string</code> | 
| argsArray | <code>Array.&lt;\*&gt;</code> | 

<a name="module_utils/EventDispatcher..on_duringInit"></a>

### utils/EventDispatcher.on\_duringInit(futureDispatcher, events, fn) : <code>function</code>
Utility for attaching an event handler to an object that has not YET had makeEventDispatcher() called

**Kind**: inner method of [<code>utils/EventDispatcher</code>](#module_utils/EventDispatcher)  

| Param | Type |
| --- | --- |
| futureDispatcher | <code>Object</code> | 
| events | <code>string</code> | 
| fn | <code>function</code> | 

<a name="module_utils/EventDispatcher..markDeprecated"></a>

### utils/EventDispatcher.markDeprecated(obj, eventName, [insteadStr]) : <code>function</code>
Mark a given event name as deprecated, such that on() will emit warnings when called with it.

**Kind**: inner method of [<code>utils/EventDispatcher</code>](#module_utils/EventDispatcher)  

| Param | Type | Description |
| --- | --- | --- |
| obj | <code>Object</code> | Event dispatcher object |
| eventName | <code>string</code> | Name of deprecated event |
| [insteadStr] | <code>string</code> | Suggested thing to use instead |
