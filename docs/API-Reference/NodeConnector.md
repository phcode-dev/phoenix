### Import :
```js
const NodeConnector = brackets.getModule("NodeConnector")
```

<a name="module_NodeConnector"></a>

## NodeConnector
Node Connector Communication Module

**Example**  
```js
**Example**  
```js
**Example**  
```js
**Example**  
```js
**Example**  
```js
**Example**  
```js
**Example**  
```js
**Example**  
```js
**Example**  
```js

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
Creates a new node connector with the specified ID and module exports.

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