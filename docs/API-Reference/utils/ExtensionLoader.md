### Import :
```js
const ExtensionLoader = brackets.getModule("utils/ExtensionLoader")
```

<a name="contexts"></a>

## contexts : <code>Object.&lt;string, Object&gt;</code>
Stores require.js contexts of extensions

**Kind**: global variable  
<a name="DEFAULT_EXTENSIONS_PATH_BASE"></a>

## DEFAULT\_EXTENSIONS\_PATH\_BASE
Returns the path to the default extensions directory relative to Phoenix base URL

**Kind**: global constant  
<a name="_getExtensionPath"></a>

## \_getExtensionPath()
Returns the full path to the development extensions directory.

**Kind**: global function  
<a name="getDevExtensionPath"></a>

## getDevExtensionPath()
Returns the full path to the development extensions directory.

**Kind**: global function  
<a name="getUserExtensionPath"></a>

## getUserExtensionPath()
Returns the full path of the default user extensions directory. This is in the usersapplication support directory, which is typically/Users/"user"/Application Support/Brackets/extensions/user on the mac, andC:\Users\"user"\AppData\Roaming\Brackets\extensions\user on windows.

**Kind**: global function  
<a name="getRequireContextForExtension"></a>

## getRequireContextForExtension(name,) ⇒ <code>Object</code>
Returns the require.js require context used to load an extension

**Kind**: global function  
**Returns**: <code>Object</code> - A require.js require object used to load the extension, or undefined ifthere is no require object with that name  

| Param | Type | Description |
| --- | --- | --- |
| name, | <code>string</code> | used to identify the extension |

<a name="loadExtensionModule"></a>

## loadExtensionModule(name,, config, entryPoint, metadata) ⇒ <code>$.Promise</code>
Loads the extension module that lives at baseUrl into its own Require.js context

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that is resolved when the extension is loaded, or rejected             if the extension fails to load or throws an exception immediately when loaded.             (Note: if extension contains a JS syntax error, promise is resolved not rejected).  

| Param | Type | Description |
| --- | --- | --- |
| name, | <code>string</code> | used to identify the extension |
| config | <code>Object</code> | object with baseUrl property containing absolute path of extension |
| entryPoint | <code>string</code> | name of the main js file to load |
| metadata | <code>Object</code> |  |

<a name="loadExtension"></a>

## loadExtension(name,, config, entryPoint,) ⇒ <code>$.Promise</code>
Loads the extension that lives at baseUrl into its own Require.js context

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that is resolved when the extension is loaded, or rejected             if the extension fails to load or throws an exception immediately when loaded.             (Note: if extension contains a JS syntax error, promise is resolved not rejected).  

| Param | Type | Description |
| --- | --- | --- |
| name, | <code>string</code> | used to identify the extension |
| config | <code>Object</code> | object with baseUrl property containing absolute path of extension |
| entryPoint, | <code>string</code> | name of the main js file to load |

<a name="_testExtensionByURL"></a>

## \_testExtensionByURL(name,, config, entryPoint,) ⇒ <code>$.Promise</code>
Runs unit tests for the extension that lives at baseUrl into its own Require.js context

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that is resolved when all extensions complete loading.  

| Param | Type | Description |
| --- | --- | --- |
| name, | <code>string</code> | used to identify the extension |
| config | <code>Object</code> | object with baseUrl property containing absolute path of extension |
| entryPoint, | <code>string</code> | name of the main js file to load |

<a name="testExtension"></a>

## testExtension(name,, config, entryPoint,) ⇒ <code>$.Promise</code>
Runs unit tests for the extension that lives at baseUrl into its own Require.js context

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that is resolved when all extensions complete loading.  

| Param | Type | Description |
| --- | --- | --- |
| name, | <code>string</code> | used to identify the extension |
| config | <code>Object</code> | object with baseUrl property containing absolute path of extension |
| entryPoint, | <code>string</code> | name of the main js file to load |

<a name="loadAllDefaultExtensions"></a>

## loadAllDefaultExtensions() ⇒ <code>$.Promise</code>
Loads All brackets default extensions from brackets base https URL.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that is resolved when all extensions complete loading.  
<a name="loadAllExtensionsInNativeDirectory"></a>

## loadAllExtensionsInNativeDirectory(directory,) ⇒ <code>$.Promise</code>
Loads the extension that lives at baseUrl into its own Require.js context

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that is resolved when all extensions complete loading.  

| Param | Type | Description |
| --- | --- | --- |
| directory, | <code>string</code> | an absolute native path that contains a directory of extensions.                  each subdirectory is interpreted as an independent extension |

<a name="loadExtensionFromNativeDirectory"></a>

## loadExtensionFromNativeDirectory(directory) ⇒ <code>Promise</code>
Loads a given extension at the path from virtual fs. Used by `debug menu> load project as extension`

**Kind**: global function  

| Param |
| --- |
| directory | 

<a name="testAllExtensionsInNativeDirectory"></a>

## testAllExtensionsInNativeDirectory(directory,) ⇒ <code>$.Promise</code>
Runs unit test for the extension that lives at baseUrl into its own Require.js context

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that is resolved when all extensions complete loading.  

| Param | Type | Description |
| --- | --- | --- |
| directory, | <code>string</code> | an absolute native path that contains a directory of extensions.                  each subdirectory is interpreted as an independent extension |

<a name="testAllDefaultExtensions"></a>

## testAllDefaultExtensions() ⇒ <code>$.Promise</code>
Runs unit test for the extension that lives at baseUrl into its own Require.js context

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that is resolved when all extensions complete loading.  
<a name="init"></a>

## init(A) ⇒ <code>$.Promise</code>
Load extensions.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that is resolved when all extensions complete loading.  

| Param | Type | Description |
| --- | --- | --- |
| A | <code>Array.&lt;string&gt;</code> | list containing references to extension source      location. A source location may be either (a) a folder name inside      src/extensions or (b) an absolute path. |

