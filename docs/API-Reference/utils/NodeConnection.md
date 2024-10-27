### Import :
```js
const NodeConnection = brackets.getModule("utils/NodeConnection")
```

<a name="NodeConnection"></a>

## NodeConnection
**Kind**: global class  

* [NodeConnection](#NodeConnection)
    * [new NodeConnection()](#new_NodeConnection_new)
    * [.domains](#NodeConnection+domains) : <code>Object</code>
    * [.connect(autoReconnect)](#NodeConnection+connect) ⇒ <code>jQuery.Promise</code>
    * [.connected()](#NodeConnection+connected) ⇒ <code>boolean</code>
    * [.disconnect()](#NodeConnection+disconnect)
    * [.loadDomains(List, autoReload)](#NodeConnection+loadDomains) ⇒ <code>jQuery.Promise</code>

<a name="new_NodeConnection_new"></a>

### new NodeConnection()
Provides an interface for interacting with the node server.

<a name="NodeConnection+domains"></a>

### nodeConnection.domains : <code>Object</code>
Exposes the domains registered with the server. This object willhave a property for each registered domain. Each of those propertieswill be an object containing properties for all the commands in thatdomain. So, myConnection.base.enableDebugger would point to the functionto call to enable the debugger.This object is automatically replaced every time the API changes (basedon the base:newDomains event from the server). Therefore, code thatuses this object should not keep their own pointer to the domain property.

**Kind**: instance property of [<code>NodeConnection</code>](#NodeConnection)  
<a name="NodeConnection+connect"></a>

### nodeConnection.connect(autoReconnect) ⇒ <code>jQuery.Promise</code>
Connect to the node server. After connecting, the NodeConnection
object will trigger a "close" event when the underlying socket
is closed. If the connection is set to autoReconnect, then the
event will also include a jQuery promise for the connection.

**Kind**: instance method of [<code>NodeConnection</code>](#NodeConnection)  
**Returns**: <code>jQuery.Promise</code> - Promise that resolves/rejects when the
   connection succeeds/fails  

| Param | Type | Description |
| --- | --- | --- |
| autoReconnect | <code>boolean</code> | Whether to automatically try to    reconnect to the server if the connection succeeds and then    later disconnects. Note if this connection fails initially, the    autoReconnect flag is set to false. Future calls to connect()    can reset it to true |

<a name="NodeConnection+connected"></a>

### nodeConnection.connected() ⇒ <code>boolean</code>
Determines whether the NodeConnection is currently connected

**Kind**: instance method of [<code>NodeConnection</code>](#NodeConnection)  
**Returns**: <code>boolean</code> - Whether the NodeConnection is connected.  
<a name="NodeConnection+disconnect"></a>

### nodeConnection.disconnect()
Explicitly disconnects from the server. Note that even if
autoReconnect was set to true at connection time, the connection
will not reconnect after this call. Reconnection can be manually done
by calling connect() again.

**Kind**: instance method of [<code>NodeConnection</code>](#NodeConnection)  
<a name="NodeConnection+loadDomains"></a>

### nodeConnection.loadDomains(List, autoReload) ⇒ <code>jQuery.Promise</code>
Load domains into the server by path

**Kind**: instance method of [<code>NodeConnection</code>](#NodeConnection)  
**Returns**: <code>jQuery.Promise</code> - Promise that resolves after the load has
   succeeded and the new API is availale at NodeConnection.domains,
   or that rejects on failure.  

| Param | Type | Description |
| --- | --- | --- |
| List | <code>Array.&lt;string&gt;</code> | of absolute paths to load |
| autoReload | <code>boolean</code> | Whether to auto-reload the domains if the server    fails and restarts. Note that the reload is initiated by the    client, so it will only happen after the client reconnects. |

