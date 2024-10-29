### Import :
```js
const PreferencesManager = brackets.getModule("preferences/PreferencesManager")
```

<a name="AppInit"></a>

## AppInit
PreferencesManager

**Kind**: global variable  
<a name="CURRENT_PROJECT"></a>

## CURRENT\_PROJECT : <code>Object</code>
Context to look up preferences in the current project.

**Kind**: global variable  
<a name="scopeOrderWithProject"></a>

## scopeOrderWithProject
Cached copy of the scopeOrder with the project Scope

**Kind**: global variable  
<a name="scopeOrderWithoutProject"></a>

## scopeOrderWithoutProject
Cached copy of the scopeOrder without the project Scope

**Kind**: global variable  
<a name="getUserPrefFile"></a>

## getUserPrefFile() ⇒ <code>string</code>
Get the full path to the user-level preferences file.

**Kind**: global function  
**Returns**: <code>string</code> - Path to the preferences file  
<a name="getExtensionPrefs"></a>

## getExtensionPrefs(prefix)
Creates an extension-specific preferences manager using the prefix given.
A `.` character will be appended to the prefix. So, a preference named `foo`
with a prefix of `myExtension` will be stored as `myExtension.foo` in the
preferences files.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| prefix | <code>string</code> | Prefix to be applied |

<a name="getViewState"></a>

## getViewState(id, [context])
Convenience function that gets a view state

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | preference to get |
| [context] | <code>Object</code> | Optional additional information about the request |

<a name="setViewState"></a>

## setViewState(id, value, [context])
Convenience function that sets a view state and then saves the file

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | preference to set |
| value | <code>\*</code> | new value for the preference |
| [context] | <code>Object</code> | Optional additional information about the request |

