### Import :
```js
const JSUtils = brackets.getModule("language/JSUtils")
```

<a name="_"></a>

## \_
Set of utilities for simple parsing of JS text.

**Kind**: global variable  
<a name="_changedDocumentTracker"></a>

## \_changedDocumentTracker : <code>ChangedDocumentTracker</code>
Tracks dirty documents between invocations of findMatchingFunctions.

**Kind**: global variable  
<a name="_shouldGetFromCache"></a>

## \_shouldGetFromCache(fileInfo) ⇒ <code>$.Promise</code>
Determines if the document function cache is up to date.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise resolved with true with true when a function cache is available for the document. Resolves  with false when there is no cache or the cache is stale.  

| Param | Type |
| --- | --- |
| fileInfo | <code>FileInfo</code> | 

<a name="_getFunctionsForFile"></a>

## \_getFunctionsForFile(fileInfo) ⇒ <code>$.Promise</code>
Resolves with a record containing the Document or FileInfo and an Array of allfunction names with offsets for the specified file. Results may be cached.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise resolved with a document info object that  contains a map of all function names from the document and each function's start offset.  

| Param | Type |
| --- | --- |
| fileInfo | <code>FileInfo</code> | 

<a name="findMatchingFunctions"></a>

## findMatchingFunctions(functionName, fileInfos, [keepAllFiles]) ⇒ <code>$.Promise</code>
Return all functions that have the specified name, searching across all the given files.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - that will be resolved with an Array of objects containing the     source document, start line, and end line (0-based, inclusive range) for each matching function list.     Does not addRef() the documents returned in the array.  

| Param | Type | Description |
| --- | --- | --- |
| functionName | <code>String</code> | The name to match. |
| fileInfos | <code>Array.&lt;File&gt;</code> | The array of files to search. |
| [keepAllFiles] | <code>boolean</code> | If true, don't ignore non-javascript files. |

<a name="findAllMatchingFunctionsInText"></a>

## findAllMatchingFunctionsInText(text, searchName) ⇒ <code>Object</code>
Finds all instances of the specified searchName in "text".Returns an Array of Objects with start and end properties.

**Kind**: global function  
**Returns**: <code>Object</code> - Array of objects containing the start offset for each matched function name.  

| Param | Type | Description |
| --- | --- | --- |
| text | <code>String</code> | JS text to search |
| searchName | <code>String</code> | function name to search for |

