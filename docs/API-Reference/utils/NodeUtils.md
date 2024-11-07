### Import :
```js
const NodeUtils = brackets.getModule("utils/NodeUtils")
```

<a name="isNodeReady"></a>

## isNodeReady ⇒ <code>boolean</code>
checks if Node connector is ready

**Kind**: global variable  
**Returns**: <code>boolean</code> - returns true if it's ready, otherwise false  
<a name="Strings"></a>

## Strings
Generic node util APIs connector. see `src-node/utils.js` for node peer

**Kind**: global constant  
<a name="fetchURLText"></a>

## fetchURLText(url, encoding) ⇒ <code>Promise.&lt;string&gt;</code>
Fetches text content from a URL
This is only available in the native app

**Kind**: global function  

| Param | Type |
| --- | --- |
| url | <code>string</code> | 
| encoding | <code>string</code> | 

<a name="getPhoenixBinaryVersion"></a>

## getPhoenixBinaryVersion() ⇒ <code>Promise.&lt;string&gt;</code>
Gets the version of the Phoenix binary
This is only available in the native app

**Kind**: global function  
<a name="getLinuxOSFlavorName"></a>

## getLinuxOSFlavorName() ⇒ <code>Promise.&lt;(string\|null)&gt;</code>
Retrieves the Linux OS flavor name
This is only available in the native app on Linux

**Kind**: global function  
<a name="openUrlInBrowser"></a>

## openUrlInBrowser(url, browserName)
Opens a URL in the default browser.
This is only available in the native app.

**Kind**: global function  

| Param | Type |
| --- | --- |
| url | <code>string</code> | 
| browserName | <code>string</code> | 

<a name="getEnvironmentVariable"></a>

## getEnvironmentVariable(varName) ⇒ <code>Promise.&lt;string&gt;</code>
Gets an environment variable's value
This is only available in the native app

**Kind**: global function  

| Param | Type |
| --- | --- |
| varName | <code>string</code> | 

<a name="ESLintFile"></a>

## ESLintFile(text, fullFilePath, projectFullPath)
Runs ESLint on a file
This is only available in the native app

**Kind**: global function  

| Param | Type |
| --- | --- |
| text | <code>string</code> | 
| fullFilePath | <code>string</code> | 
| projectFullPath | <code>string</code> | 

