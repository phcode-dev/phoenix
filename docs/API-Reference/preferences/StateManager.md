### Import :
```js
const StateManager = brackets.getModule("preferences/StateManager")
```

<a name="_"></a>

## \_
StateManager

**Kind**: global constant  
<a name="getVal"></a>

## getVal(id, [context])
Convenience function that gets a view state

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | preference to get |
| [context] | <code>Object</code> \| <code>string</code> | Optional additional information about the request, can be:  - ScopeManager.PROJECT_CONTEXT  if you want to get project specific value  or  - ScopeManager.GLOBAL_CONTEXT if you want to get it from global context and not the project context.  - null/undefined if you want to get from project context first, and then global context if not found in project context. |
| [context.scope] | <code>string</code> | Eg. user - deprecated, do not use |
| [context.layer] | <code>string</code> | Eg. project - deprecated, do not use |
| [context.layerID] | <code>string</code> | Eg. /tauri/path/to/project - deprecated, do not use |

<a name="setVal"></a>

## setVal(id, value, [context])
Convenience function that sets a view state and then saves the file

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | preference to set |
| value | <code>\*</code> | new value for the preference |
| [context] | <code>Object</code> \| <code>string</code> | Optional additional information about the request, can be:  ScopeManager.PROJECT_CONTEXT  if you want to get project specific value  or  ScopeManager.GLOBAL_CONTEXT or null if you want to set globally. |
| [context.scope] | <code>string</code> | Eg. user - deprecated, do not use |
| [context.layer] | <code>string</code> | Eg. project - deprecated, do not use |
| [context.layerID] | <code>string</code> | Eg. /tauri/path/to/project - deprecated, do not use |

<a name="definePreferenceInternal"></a>

## definePreferenceInternal(id, type, initial, options) ⇒ <code>Object</code>
returns a preference instance that can be listened `.on("change", cbfn(changeType))` . The callback fucntion will be called

**Kind**: global function  

| Param |
| --- |
| id | 
| type | 
| initial | 
| options | 
