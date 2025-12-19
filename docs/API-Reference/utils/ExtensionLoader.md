### Import :
```js
const ExtensionLoader = brackets.getModule("utils/ExtensionLoader")
```

<a name="EVENT_EXTENSION_LOADED"></a>

## EVENT\_EXTENSION\_LOADED : <code>string</code>
Extension loaded event

**Kind**: global constant  
<a name="EVENT_EXTENSION_DISABLED"></a>

## EVENT\_EXTENSION\_DISABLED : <code>string</code>
Extension disabled event

**Kind**: global constant  
<a name="EVENT_EXTENSION_LOAD_FAILED"></a>

## EVENT\_EXTENSION\_LOAD\_FAILED : <code>string</code>
Extension load failed event

**Kind**: global constant  
<a name="getDefaultExtensionPath"></a>

## getDefaultExtensionPath() ⇒ <code>string</code>
Responsible to get the default extension path

**Kind**: global function  
<a name="getUserExtensionPath"></a>

## getUserExtensionPath()
Returns the full path of the default user extensions directory. This is in the users
application support directory, which is typically
/Users/"user"/Application Support/Brackets/extensions/user on the mac, and
C:\Users\"user"\AppData\Roaming\Brackets\extensions\user on windows.

**Kind**: global function  
<a name="getRequireContextForExtension"></a>

## getRequireContextForExtension(name) ⇒ <code>Object</code>
Returns the require.js require context used to load an extension

**Kind**: global function  
**Returns**: <code>Object</code> - A require.js require object used to load the extension, or undefined if
there is no require object with that name  

| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> | used to identify the extension |

<a name="loadExtension"></a>

## loadExtension(name, config, entryPoint) ⇒ <code>$.Promise</code>
Loads the extension that lives at baseUrl into its own Require.js context

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that is resolved when the extension is loaded, or rejected
             if the extension fails to load or throws an exception immediately when loaded.
             (Note: if extension contains a JS syntax error, promise is resolved not rejected).  

| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> | used to identify the extension |
| config | <code>Object</code> | object with baseUrl property containing absolute path of extension |
| entryPoint | <code>string</code> | name of the main js file to load |

<a name="testExtension"></a>

## testExtension(name, config, entryPoint) ⇒ <code>$.Promise</code>
Runs unit tests for the extension that lives at baseUrl into its own Require.js context

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that is resolved when all extensions complete loading.  

| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> | used to identify the extension |
| config | <code>Object</code> | object with baseUrl property containing absolute path of extension |
| entryPoint | <code>string</code> | name of the main js file to load |

<a name="loadAllDefaultExtensions"></a>

## loadAllDefaultExtensions() ⇒ <code>$.Promise</code>
Loads All brackets default extensions from brackets base https URL.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that is resolved when all extensions complete loading.  
<a name="loadAllExtensionsInNativeDirectory"></a>

## loadAllExtensionsInNativeDirectory(directory) ⇒ <code>$.Promise</code>
Loads the extension that lives at baseUrl into its own Require.js context

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that is resolved when all extensions complete loading.  

| Param | Type | Description |
| --- | --- | --- |
| directory | <code>string</code> | an absolute native path that contains a directory of extensions.                  each subdirectory is interpreted as an independent extension |

<a name="loadExtensionFromNativeDirectory"></a>

## loadExtensionFromNativeDirectory(directory) ⇒ <code>Promise</code>
Loads a given extension at the path from virtual fs. Used by `debug menu> load project as extension`

**Kind**: global function  

| Param |
| --- |
| directory | 

<a name="testAllExtensionsInNativeDirectory"></a>

## testAllExtensionsInNativeDirectory(directory) ⇒ <code>$.Promise</code>
Runs unit test for the extension that lives at baseUrl into its own Require.js context

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that is resolved when all extensions complete loading.  

| Param | Type | Description |
| --- | --- | --- |
| directory | <code>string</code> | an absolute native path that contains a directory of extensions.                  each subdirectory is interpreted as an independent extension |

<a name="testAllDefaultExtensions"></a>

## testAllDefaultExtensions() ⇒ <code>$.Promise</code>
Runs unit test for the extension that lives at baseUrl into its own Require.js context

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that is resolved when all extensions complete loading.  
<a name="getSourcePathForExtension"></a>

## getSourcePathForExtension(extensionPath) ⇒ <code>string</code>
To get the source path for extension

**Kind**: global function  

| Param |
| --- |
| extensionPath | 

<a name="init"></a>

## init(A) ⇒ <code>$.Promise</code>
Load extensions.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that is resolved when all extensions complete loading.  

| Param | Type | Description |
| --- | --- | --- |
| A | <code>Array.&lt;string&gt;</code> | list containing references to extension source      location. A source location may be either (a) a folder name inside      src/extensions or (b) an absolute path. |

<a name="uninstallExtension"></a>

## uninstallExtension(extensionID) ⇒ <code>Promise</code>
Uninstall a deprecated extension

**Kind**: global function  
**Returns**: <code>Promise</code> - A promise that resolves when the extension is uninstalled successfully  

| Param | Type | Description |
| --- | --- | --- |
| extensionID | <code>string</code> | The ID of the extension to uninstall |

