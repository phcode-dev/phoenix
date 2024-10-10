### Import :
```js
const EventManager = brackets.getModule("utils/EventManager")
```

<a name="module_utils/EventManager"></a>

## utils/EventManager
The global EventManager can be used to register named EventDispatchers so that events

**Example**  
```js
**Example**  
```js

* [utils/EventManager](#module_utils/EventManager)
    * [.registerEventHandler(handlerName, eventDispatcher)](#module_utils/EventManager..registerEventHandler) ⇒ <code>boolean</code>
    * [.isExistsEventHandler(handlerName)](#module_utils/EventManager..isExistsEventHandler) ⇒ <code>boolean</code>
    * [.triggerEvent(handlerName, eventName, ...eventParams)](#module_utils/EventManager..triggerEvent) : <code>function</code>

<a name="module_utils/EventManager..registerEventHandler"></a>

### utils/EventManager.registerEventHandler(handlerName, eventDispatcher) ⇒ <code>boolean</code>
Registers a named EventHandler. Event handlers are created using the call:

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

**Kind**: inner method of [<code>utils/EventManager</code>](#module_utils/EventManager)  

| Param | Type | Description |
| --- | --- | --- |
| handlerName | <code>string</code> |  |
| eventName |  | the event name as recognised by the handler. this is usually a string. |
| ...eventParams |  | Can be a comma seperated list of args or a single argument. |

<a name="onmessage"></a>

## onmessage(event)
This function acts as a secure event handler for all 'message' events targeted at the window object.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>MessageEvent</code> | The 'message' event targeted at the window object. The event's   'data' property should have a 'handlerName' and `eventName` property that will be triggered in phcode. // We will try to communicate within an embedded iframe and an extension // In your extension in phoenix, register a handlerName to process a new kind of event. const EventDispatcher = brackets.getModule("utils/EventDispatcher"), EventDispatcher.makeEventDispatcher(exports); const EventManager = brackets.getModule("utils/EventManager"); // Note: for event handler names, please change the `extensionName` to your extension name // to prevent collisions. EventHandlers starting with `ph-` and `br-` are reserved as system handlers // and not available for use in extensions. window.Phoenix.TRUSTED_ORIGINS ["http://mydomain.com"] = true; ```js EventManager.registerEventHandler("`extensionName`-iframeMessageHandler", exports); exports.on("iframeHelloEvent", function(_ev, event){    console.log(event.data.message); }); ``` // Now from your iframe, send a message to the above event handler using: ```js window.parent.postMessage({     handlerName: "`extensionName`-iframeMessageHandler",     eventName: "iframeHelloEvent",     message: "hello world" }, '*'); ``` // `you should replace * with the trusted domains list in production for security.` See how this can be // done securely with this example: https://github.com/phcode-dev/phcode.live/blob/6d64386fbb9d671cdb64622bc48ffe5f71959bff/docs/virtual-server-loader.js#L43 // Abstract is that, pass in the parentOrigin as a query string parameter in iframe, and validate it against // a trusted domains list in your iframe. |
