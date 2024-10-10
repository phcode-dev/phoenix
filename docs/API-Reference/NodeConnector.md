### Import :
```js
const NodeConnector = brackets.getModule("NodeConnector")
```

<a name="module_NodeConnector"></a>

## NodeConnector
Node Connector Communication ModuleThis module simplifies communication between Node.js and Phoenix (phcode). A `NodeConnector` acts as an intermediary,allowing you to execute functions in Node.js from Phoenix and vice versa. You can use the `execPeer` method to callfunctions on the other side and handle communication seamlessly. Use `triggerPeer` to trigger eventson the other side.## Setting Up a `NodeConnector`To establish communication between two modules, such as `x.js` in Phoenix and `y.js` in Node.js, follow these steps:### Create `NodeConnector` in Phoenix (`x.js`)

**Example**  
```jsconst NodeConnector = require('NodeConnector');const XY_NODE_CONNECTOR_ID = 'ext_x_y'; // Use a unique IDlet nodeConnector = NodeConnector.createNodeConnector(XY_NODE_CONNECTOR_ID, exports);exports.modifyImage = async function(imageName, imageArrayBuffer) {  // Perform image operations with the imageArrayBuffer  // To return an ArrayBuffer, return an object with a `buffer` key.  return {    operationDone: 'colored, cropped',    buffer: imageArrayBuffer,  };};```### Create `NodeConnector` in Node.js (`y.js`)
**Example**  
```jsconst XY_NODE_CONNECTOR_ID = 'ext_x_y'; // Use the same unique IDlet nodeConnector = global.createNodeConnector(XY_NODE_CONNECTOR_ID, exports);exports.getPWDRelative = async function(subPath) {  return process.cwd + '/' + subPath;};```With these steps, a `NodeConnector` is set up, enabling two-way communication.## Executing FunctionsTo call a Node.js function from Phoenix, use the `execPeer` method.
**Example**  
```js// In `x.js` (Phoenix)const fullPath = await nodeConnector.execPeer('getPWDRelative', 'sub/path.html');```To execute a Phoenix function from Node.js and transfer binary data, pass an optional ArrayBuffer.
**Example**  
```js// In `y.js` (Node.js)const { operationDone, buffer } = await nodeConnector.execPeer('modifyImage', {name:'theHills.png'}, imageAsArrayBuffer);```## Event HandlingThe `NodeConnector` object implements all the APIs supported by `utils/EventDispatcher`. You can trigger and listento events between Node.js and Phoenix using the `triggerPeer` and (`on`, `one` or `off`) methods.
**Example**  
```js// In `y.js` (Node.js)nodeConnector.on('phoenixProjectOpened', (_event, projectPath) => {  console.log(projectPath);});nodeConnector.one('phoenixProjectOpened', (_event, projectPath) => {  console.log(projectPath + "will be received only once");});```To raise an event from Phoenix to Node.js:
**Example**  
```js// In `x.js` (Phoenix)nodeConnector.triggerPeer('phoenixProjectOpened', '/x/project/folder');```To Switch off events
**Example**  
```jsnodeConnector.off('phoenixProjectOpened'); // will switch off all event handlers of that name.```By Default, all events handlers with the eventName is removed when you call `nodeConnector.off(eventName)` fn.To selectively switch off event handlers, please see reference for `utils/EventDispatcher` module.### Handling ArrayBuffer Data in Function ExecutionWhen executing functions that send or receive binary data, ensure that the functions are asynchronous and accept anoptional ArrayBuffer as a parameter. To return binary data, use an object with a `buffer` key.Example of calling a function in Node.js with binary data transfer:
**Example**  
```js// In `y.js` (Node.js)const { operationDone, buffer } = await nodeConnector.execPeer('modifyImage', {name:'name.png'}, imageArrayBuffer);```### Handling ArrayBuffer Data in Event HandlingUse the `triggerPeer` method to send binary data in events. Include the ArrayBuffer as an optional parameter.Example of sending binary data in an event from Phoenix to Node.js:
**Example**  
```js// In `x.js` (Phoenix)const imageArrayBuffer = getSomeImageArrayBuffer(); // Get the ArrayBuffernodeConnector.triggerPeer('imageEdited', 'name.png', imageArrayBuffer);```## Caveats- Be cautious when sending large binary data, as it may affect performance and memory usage. Transferring large  data is fully supported, but be mindful of performance.- Functions called with `execPeer` and `triggerPeer` must be asynchronous and accept a single argument. An optional  second argument can be used to transfer large binary data as an ArrayBuffer.For more event handling operations and details, refer to the documentation for the `utils/EventDispatcher` module.

* [NodeConnector](#module_NodeConnector)
    * [.createNodeConnector(nodeConnectorID, moduleExports)](#module_NodeConnector..createNodeConnector) ⇒ <code>Object</code>
    * [.isNodeAvailable()](#module_NodeConnector..isNodeAvailable) ⇒ <code>boolean</code>
    * [.isNodeReady()](#module_NodeConnector..isNodeReady) ⇒ <code>boolean</code>
    * [.terminateNode()](#module_NodeConnector..terminateNode) ⇒ <code>Promise</code>
    * [.setInspectEnabled(enabled)](#module_NodeConnector..setInspectEnabled)
    * [.isInspectEnabled()](#module_NodeConnector..isInspectEnabled) ⇒ <code>boolean</code>
    * [.getInspectPort()](#module_NodeConnector..getInspectPort) ⇒ <code>number</code>

<a name="module_NodeConnector..createNodeConnector"></a>

### NodeConnector.createNodeConnector(nodeConnectorID, moduleExports) ⇒ <code>Object</code>
Creates a new node connector with the specified ID and module exports.Returns a NodeConnector Object (which is an EventDispatcher withadditional `execPeer` and `triggerPeer` methods. `peer` here means, if you are executing `execPeer`in Phoenix, it will execute the named function in node side, and vice versa. You can right away startusing `execPeer`, `triggerPeer`(to send/receive events) APIs without waiting to check if theother side nodeConnector is created.Note: If the NodeConnector has not been created on the other end, requests made with `execPeer` or`triggerPeer` will be temporarily queued for up to 10 seconds to allow time for the connector to be created.If the connector is not created within this timeout period, all queued `execPeer` requests will be rejected,and all queued events will be dropped. It is recommended to call the `createNodeConnector` API on both endswithin a timeframe of less than 10 seconds(ideally same time) for seamless communication.- execPeer: A function that executes a peer function with specified parameters.- triggerPeer: A function that triggers an event to be sent to a peer.- Also contains all the APIs supported by `utils/EventDispatcher` module.

**Kind**: inner method of [<code>NodeConnector</code>](#module_NodeConnector)  
**Returns**: <code>Object</code> - - A NodeConnector Object. Also contains all the APIs supported by `utils/EventDispatcher` module.  
**Throws**:

- <code>Error</code> - If a node connector with the same ID already exists/invalid args passed.


| Param | Type | Description |
| --- | --- | --- |
| nodeConnectorID | <code>string</code> | The unique identifier for the new node connector. |
| moduleExports | <code>Object</code> | The exports of the module that contains the functions to be executed on the other side. |

<a name="module_NodeConnector..isNodeAvailable"></a>

### NodeConnector.isNodeAvailable() ⇒ <code>boolean</code>
Checks if Node.js Engine is available. (returns true even if the node instance is terminated)

**Kind**: inner method of [<code>NodeConnector</code>](#module_NodeConnector)  
**Returns**: <code>boolean</code> - Returns true if Node.js Engine is available.  
<a name="module_NodeConnector..isNodeReady"></a>

### NodeConnector.isNodeReady() ⇒ <code>boolean</code>
Node is available and is ready to exec requests

**Kind**: inner method of [<code>NodeConnector</code>](#module_NodeConnector)  
<a name="module_NodeConnector..terminateNode"></a>

### NodeConnector.terminateNode() ⇒ <code>Promise</code>
Terminate the PhNodeEngine node if it is available. Else does nothing.

**Kind**: inner method of [<code>NodeConnector</code>](#module_NodeConnector)  
**Returns**: <code>Promise</code> - promise that resolves when node process is terminated and exits.  
<a name="module_NodeConnector..setInspectEnabled"></a>

### NodeConnector.setInspectEnabled(enabled)
Sets weather to enable node inspector in next boot.

**Kind**: inner method of [<code>NodeConnector</code>](#module_NodeConnector)  

| Param | Type | Description |
| --- | --- | --- |
| enabled | <code>boolean</code> | true to enable, else false. |

<a name="module_NodeConnector..isInspectEnabled"></a>

### NodeConnector.isInspectEnabled() ⇒ <code>boolean</code>
Returns whether node inspector is enabled. If node is not present, always returns false.

**Kind**: inner method of [<code>NodeConnector</code>](#module_NodeConnector)  
**Returns**: <code>boolean</code> - True if inspect mode is enabled, false otherwise.  
<a name="module_NodeConnector..getInspectPort"></a>

### NodeConnector.getInspectPort() ⇒ <code>number</code>
Retrieves the node inspector port for the Phoenix Node.js engine.

**Kind**: inner method of [<code>NodeConnector</code>](#module_NodeConnector)  
**Returns**: <code>number</code> - The inspection port number.  
