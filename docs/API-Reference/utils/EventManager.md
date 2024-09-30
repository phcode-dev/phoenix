### Import :
```js
brackets.getModule("utils/EventManager")
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

<a name="onmessage"></a>

## onmessage(event)
This function acts as a secure event handler for all 'message' events targeted at the window object.
This is useful if you have to send/receive messaged from an embedded cross-domain iframe inside phoenix.
https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage
Instead of directly overriding window.onmessage, extensions or other elements that need to
listen to these events should register their named eventHandler with `EventManager`.

By default, only origins part of `window.Phoenix.TRUSTED_ORIGINS` are whitelisted. If your extension is
bringing in a cross-origin ifrmame say [`http://mydomain.com`], you should add it to the whitelist by setting
`window.Phoenix.TRUSTED_ORIGINS ["http://mydomain.com"] = true;`

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>MessageEvent</code> | The 'message' event targeted at the window object. The event's   'data' property should have a 'handlerName' and `eventName` property that will be triggered in phcode. // We will try to communicate within an embedded iframe and an extension // In your extension in phoenix, register a handlerName to process a new kind of event. const EventDispatcher = brackets.getModule("utils/EventDispatcher"), EventDispatcher.makeEventDispatcher(exports); const EventManager = brackets.getModule("utils/EventManager"); // Note: for event handler names, please change the `extensionName` to your extension name // to prevent collisions. EventHandlers starting with `ph-` and `br-` are reserved as system handlers // and not available for use in extensions. window.Phoenix.TRUSTED_ORIGINS ["http://mydomain.com"] = true; ```js EventManager.registerEventHandler("`extensionName`-iframeMessageHandler", exports); exports.on("iframeHelloEvent", function(_ev, event){    console.log(event.data.message); }); ``` // Now from your iframe, send a message to the above event handler using: ```js window.parent.postMessage({     handlerName: "`extensionName`-iframeMessageHandler",     eventName: "iframeHelloEvent",     message: "hello world" }, '*'); ``` // `you should replace * with the trusted domains list in production for security.` See how this can be // done securely with this example: https://github.com/phcode-dev/phcode.live/blob/6d64386fbb9d671cdb64622bc48ffe5f71959bff/docs/virtual-server-loader.js#L43 // Abstract is that, pass in the parentOrigin as a query string parameter in iframe, and validate it against // a trusted domains list in your iframe. |

