### Import :
```js
const StateManager = brackets.getModule("preferences/StateManager")
```

<a name="_"></a>

## \_
StateManager

**Kind**: global constant  
<a name="PROJECT_CONTEXT"></a>

## PROJECT\_CONTEXT : <code>string</code>
Project specific context

**Kind**: global constant  
<a name="GLOBAL_CONTEXT"></a>

## GLOBAL\_CONTEXT : <code>string</code>
Global context

**Kind**: global constant  
<a name="PROJECT_THEN_GLOBAL_CONTEXT"></a>

## PROJECT\_THEN\_GLOBAL\_CONTEXT : <code>string</code>
Project or global context

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
whenever there is a change in the supplied id with a changeType argument. The change type can be one of the two:
CHANGE_TYPE_INTERNAL - if change is made within the current app window/browser tap
CHANGE_TYPE_EXTERNAL - if change is made in a different app window/browser tab

**Kind**: global function  

| Param |
| --- |
| id | 
| type | 
| initial | 
| options | 

<a name="getPreferenceInternal"></a>

## getPreferenceInternal(id) ⇒ <code>Object</code>
Get the preference instance for the given ID.

**Kind**: global function  

| Param | Type |
| --- | --- |
| id | <code>string</code> | 

<a name="createExtensionStateManager"></a>

## createExtensionStateManager(extensionID) ⇒ <code>object</code>
create a state manager for an extension.
ensure that the IDs are unique.

**Kind**: global function  
**Returns**: <code>object</code> - Object with methods to manage the extension's state and preferences.
- `get(id, context)`: Get the value from the extension's state.
- `set(id, value, context)`: Set the value in the extension's state.
- `definePreference(id, type, initial, options)`: define a preference for the extension.
- `getPreference(id)`: retrieve a defined preference.
- `PROJECT_CONTEXT`, `GLOBAL_CONTEXT`, `PROJECT_THEN_GLOBAL_CONTEXT`: constant for context management.  

| Param | Type |
| --- | --- |
| extensionID | <code>string</code> | 

