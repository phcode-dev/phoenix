### Import :
```js
const JSUtils = brackets.getModule("language/JSUtils")
```

<a name="_"></a>

## \_
Set of utilities for simple parsing of JS text.

**Kind**: global variable  
<a name="findMatchingFunctions"></a>

## findMatchingFunctions(functionName, fileInfos, [keepAllFiles]) ⇒ <code>$.Promise</code>
Return all functions that have the specified name, searching across all the given files.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - that will be resolved with an Array of objects containing the
     source document, start line, and end line (0-based, inclusive range) for each matching function list.
     Does not addRef() the documents returned in the array.  

| Param | Type | Description |
| --- | --- | --- |
| functionName | <code>String</code> | The name to match. |
| fileInfos | <code>Array.&lt;File&gt;</code> | The array of files to search. |
| [keepAllFiles] | <code>boolean</code> | If true, don't ignore non-javascript files. |

<a name="findAllMatchingFunctionsInText"></a>

## findAllMatchingFunctionsInText(text, searchName) ⇒ <code>Object</code>
Finds all instances of the specified searchName in "text".
Returns an Array of Objects with start and end properties.

**Kind**: global function  
**Returns**: <code>Object</code> - Array of objects containing the start offset for each matched function name.  

| Param | Type | Description |
| --- | --- | --- |
| text | <code>String</code> | JS text to search |
| searchName | <code>String</code> | function name to search for |

