### Import :
```js
const ExtensionUtils = brackets.getModule("utils/ExtensionUtils")
```

<a name="FileSystem"></a>

## FileSystem
ExtensionUtils defines utility methods for implementing extensions.

**Kind**: global constant  
<a name="addEmbeddedStyleSheet"></a>

## addEmbeddedStyleSheet(css) ⇒ <code>HTMLStyleElement</code>
Appends a "style" tag to the document's head.

**Kind**: global function  
**Returns**: <code>HTMLStyleElement</code> - The generated HTML node  

| Param | Type | Description |
| --- | --- | --- |
| css | <code>string</code> | CSS code to use as the tag's content |

<a name="addLinkedStyleSheet"></a>

## addLinkedStyleSheet(url, [deferred]) ⇒ <code>HTMLLinkElement</code>
Appends a "link" tag to the document's head.

**Kind**: global function  
**Returns**: <code>HTMLLinkElement</code> - The generated HTML node  

| Param | Type | Description |
| --- | --- | --- |
| url | <code>string</code> | URL to a style sheet |
| [deferred] | <code>$.Deferred</code> | Optionally check for load and error events |

<a name="isAbsolutePathOrUrl"></a>

## isAbsolutePathOrUrl(pathOrUrl) ⇒ <code>boolean</code>
getModuleUrl returns different urls for win platformso that's why we need a different check here

**Kind**: global function  
**Returns**: <code>boolean</code> - returns true if pathOrUrl is absolute url on win platform                   or when it's absolute path on other platforms  
**See**: #getModuleUrl  

| Param | Type | Description |
| --- | --- | --- |
| pathOrUrl | <code>string</code> | that should be checked if it's absolute |

<a name="parseLessCode"></a>

## parseLessCode(code, url) ⇒ <code>$.Promise</code>
Parses LESS code and returns a promise that resolves with plain CSS code.Pass the [url](url) argument to resolve relative URLs contained in the code.Make sure URLs in the code are wrapped in quotes, like so:    background-image: url("image.png");

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that is resolved with CSS code if the LESS code can be parsed  

| Param | Type | Description |
| --- | --- | --- |
| code | <code>string</code> | LESS code to parse |
| url | <code>string</code> | URL to the file containing the code |

<a name="getModulePath"></a>

## getModulePath(module, path) ⇒ <code>string</code>
Returns a path to an extension module.

**Kind**: global function  
**Returns**: <code>string</code> - The path to the module's folder  

| Param | Type | Description |
| --- | --- | --- |
| module | <code>module</code> | Module provided by RequireJS |
| path | <code>string</code> | Relative path from the extension folder to a file |

<a name="getModuleUrl"></a>

## getModuleUrl(module, path) ⇒ <code>string</code>
Returns a URL to an extension module.

**Kind**: global function  
**Returns**: <code>string</code> - The URL to the module's folder  

| Param | Type | Description |
| --- | --- | --- |
| module | <code>module</code> | Module provided by RequireJS |
| path | <code>string</code> | Relative path from the extension folder to a file |

<a name="loadFile"></a>

## loadFile(module, path) ⇒ <code>$.Promise</code>
Performs a GET request using a path relative to an extension module.The resulting URL can be retrieved in the resolve callback by accessing

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that is resolved with the contents of the requested file  

| Param | Type | Description |
| --- | --- | --- |
| module | <code>module</code> | Module provided by RequireJS |
| path | <code>string</code> | Relative path from the extension folder to a file |

<a name="loadStyleSheet"></a>

## loadStyleSheet(module, path) ⇒ <code>$.Promise</code>
Loads a style sheet (CSS or LESS) relative to the extension module.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that is resolved with an HTML node if the file can be loaded.  

| Param | Type | Description |
| --- | --- | --- |
| module | <code>module</code> | Module provided by RequireJS |
| path | <code>string</code> | Relative path from the extension folder to a CSS or LESS file |

<a name="_loadExtensionMetadata"></a>

## \_loadExtensionMetadata(baseExtensionUrl, extensionName) ⇒ <code>$.Promise</code>
Loads the package.json file in the given extension folder as well as any additionalmetadata.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that is resolved with the parsed contents of the package.json file,    or rejected if there is no package.json with the boolean indicating whether .disabled file exists.  

| Param | Type | Description |
| --- | --- | --- |
| baseExtensionUrl | <code>string</code> | The extension folder. |
| extensionName | <code>string</code> | optional extension name |

<a name="loadMetadata"></a>

## loadMetadata(metadataURL) ⇒ <code>$.Promise</code>
Loads the package.json file in the given extension folder as well as any additionalmetadata for default extensions in the source directory.If there's a .disabled file in the extension directory, then the content of package.jsonwill be augmented with disabled property set to true. It will override whatever value ofdisabled might be set.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that is resolved with the parsed contents of the package.json file,    or rejected if there is no package.json with the boolean indicating whether .disabled file exists.  

| Param | Type | Description |
| --- | --- | --- |
| metadataURL | <code>string</code> | The extension folder/base url for default extensions. |

