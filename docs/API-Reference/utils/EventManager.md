### Import :
```js
const EventManager = brackets.getModule("utils/EventManager")
```

<a name="module_utils/EventManager"></a>

## utils/EventManager
The global EventManager can be used to register named EventDispatchers so that events
can be triggered from anywhere without using require context. This should also be used to handle custom
`window.onmessage` handlers.

A global `window.EventManager` object is made available in phoenix that can be called anytime after AppStart.

## Usage
For Eg. Let's say we have an extension `drawImage` installed that wants to expose custom functionality to phoenix.
The Extension will first register named EventHandler like this:

**Example**  
```js
// in drawImage/someExtensionModule.js module within the extension, do the following:
const EventDispatcher = brackets.getModule("utils/EventDispatcher"),
EventManager = brackets.getModule("utils/EventManager");
EventDispatcher.makeEventDispatcher(exports);

EventManager.registerEventHandler("drawImage-Handler", exports);
```
Once the event handler is registered, we can trigger events on the named handler anywhere in phoenix
(inside or outside the extension) by using:
**Example**  
```js
EventManager.triggerEvent("drawImage-Handler", "someEventName", "param1", "param2", ...);
```

* [utils/EventManager](#module_utils/EventManager)
    * [.registerEventHandler(handlerName, eventDispatcher)](#module_utils/EventManager..registerEventHandler) ⇒ <code>boolean</code>
    * [.isExistsEventHandler(handlerName)](#module_utils/EventManager..isExistsEventHandler) ⇒ <code>boolean</code>
    * [.triggerEvent(handlerName, eventName, ...eventParams)](#module_utils/EventManager..triggerEvent) : <code>function</code>
    * [.setTrustedOrigin(origin, isTrusted)](#module_utils/EventManager..setTrustedOrigin)

<a name="module_utils/EventManager..registerEventHandler"></a>

### utils/EventManager.registerEventHandler(handlerName, eventDispatcher) ⇒ <code>boolean</code>
Registers a named EventHandler. Event handlers are created using the call:
`EventDispatcher.makeEventDispatcher(Command.prototype);`

To register a close dialogue event handler in an extension:
// in close-dialogue.js module winthin the extension, do the following:
const EventDispatcher = brackets.getModule("utils/EventDispatcher"),
EventDispatcher.makeEventDispatcher(exports);
const EventManager = brackets.getModule("utils/EventManager");

// Note: for event handler names, please change the `extensionName` to your extension name
// to prevent collisions. EventHandlers starting with `ph-` and `br-` are reserved as system handlers
// and not available for use in extensions.
EventManager.registerEventHandler("`extensionName`-closeDialogueHandler", exports);
// Once the event handler is registered, see triggerEvent API on how to raise events

**Kind**: inner method of [<code>utils/EventManager</code>](#module_utils/EventManager)  

| Param | Type | Description |
| --- | --- | --- |
| handlerName | <code>string</code> | a unique name of the handler. |
| eventDispatcher | <code>object</code> | An EventDispatcher that will be used to trigger events. |

<a name="module_utils/EventManager..isExistsEventHandler"></a>

### utils/EventManager.isExistsEventHandler(handlerName) ⇒ <code>boolean</code>
Returns true is an EventHandler of the given name exists.

**Kind**: inner method of [<code>utils/EventManager</code>](#module_utils/EventManager)  

| Param | Type |
| --- | --- |
| handlerName | <code>string</code> | 

<a name="module_utils/EventManager..triggerEvent"></a>

### utils/EventManager.triggerEvent(handlerName, eventName, ...eventParams) : <code>function</code>
Triggers an event on the named event handler.

To trigger an event to the `closeDialogue` event handler registered above
// anywhere in code, do the following:
const EventManager = brackets.getModule("utils/EventManager");
EventManager.triggerEvent("closeDialogueHandler", "someEvent", "param1", "param2", ...);

**Kind**: inner method of [<code>utils/EventManager</code>](#module_utils/EventManager)  

| Param | Type | Description |
| --- | --- | --- |
| handlerName | <code>string</code> |  |
| eventName |  | the event name as recognised by the handler. this is usually a string. |
| ...eventParams |  | Can be a comma seperated list of args or a single argument. |

<a name="module_utils/EventManager..setTrustedOrigin"></a>

### utils/EventManager.setTrustedOrigin(origin, isTrusted)
add or remove a domain, in the list of trusted origin

**Kind**: inner method of [<code>utils/EventManager</code>](#module_utils/EventManager)  

| Param | Type | Description |
| --- | --- | --- |
| origin | <code>string</code> | the origin to be added or removed |
| isTrusted | <code>boolean</code> | if `true` adds the origin to the list, else removes it. |

