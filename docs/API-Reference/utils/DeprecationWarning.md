### Import :
```js
const DeprecationWarning = brackets.getModule("utils/DeprecationWarning")
```

<a name="EventDispatcher"></a>

## EventDispatcher
Utilities functions to display deprecation warning in the console.

**Kind**: global variable  
<a name="deprecationWarning"></a>

## deprecationWarning(message, [oncePerCaller], [callerStackPos])
Show deprecation warning with the call stack if it
has never been displayed before.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| message | <code>string</code> | The deprecation message to be displayed. |
| [oncePerCaller] | <code>boolean</code> | If true, displays the message once for each unique call location.     If false (the default), only displays the message once no matter where it's called from.     Note that setting this to true can cause a slight performance hit (because it has to generate     a stack trace), so don't set this for functions that you expect to be called from performance-     sensitive code (e.g. tight loops). |
| [callerStackPos] | <code>number</code> | Only used if oncePerCaller=true. Overrides the `Error().stack` depth     where the client-code caller can be found. Only needed if extra shim layers are involved. |

<a name="deprecateEvent"></a>

## deprecateEvent(outbound, inbound, oldEventName, newEventName, [canonicalOutboundName], [canonicalInboundName])
Show a deprecation warning if there are listeners for the event

```
   DeprecationWarning.deprecateEvent(exports,
                                     MainViewManager,
                                     "workingSetAdd",
                                     "workingSetAdd",
                                     "DocumentManager.workingSetAdd",
                                     "MainViewManager.workingSetAdd");
```

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| outbound | <code>Object</code> | the object with the old event to dispatch |
| inbound | <code>Object</code> | the object with the new event to map to the old event |
| oldEventName | <code>string</code> | the name of the old event |
| newEventName | <code>string</code> | the name of the new event |
| [canonicalOutboundName] | <code>string</code> | the canonical name of the old event |
| [canonicalInboundName] | <code>string</code> | the canonical name of the new event |

<a name="deprecateConstant"></a>

## deprecateConstant(obj, oldId, newId)
Create a deprecation warning and action for updated constants

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| obj | <code>Object</code> |  |
| oldId | <code>string</code> | Menu Id |
| newId | <code>string</code> | Menu Id |

