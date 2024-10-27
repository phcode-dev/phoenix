### Import :
```js
const FindInFiles = brackets.getModule("search/FindInFiles")
```

<a name="searchModel"></a>

## searchModel : <code>SearchModel</code>
The search query and results model.

**Kind**: global variable  
<a name="@type"></a>

## @type : <code>Object</code>
Token used to indicate a specific reason for zero search results

**Kind**: global constant  
<a name="getCandidateFiles"></a>

## getCandidateFiles(scope) ⇒ <code>$.Promise</code>
Finds all candidate files to search in the given scope's subtree that are not binary content. Does NOT apply
the current filter yet.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise that will be resolved with the list of files in the scope. Never rejected.  

| Param | Type | Description |
| --- | --- | --- |
| scope | <code>FileSystemEntry</code> | Search scope, or null if whole project |

<a name="doSearchInScope"></a>

## doSearchInScope(queryInfo, scope, filter, replaceText, candidateFilesPromise) ⇒ <code>$.Promise</code>
Does a search in the given scope with the given filter. Used when you want to start a search
programmatically. Make sure that project indexing is complete by calling isProjectIndexingComplete()
Else, an empty result will be returned if search is invoked before any files are indexed.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise that's resolved with the search results or rejected when the find competes.  

| Param | Type | Description |
| --- | --- | --- |
| queryInfo | <code>Object</code> | Query info object |
| scope | <code>Entry</code> | Project file/subfolder to search within; else searches whole project. |
| filter | <code>string</code> | A "compiled" filter as returned by FileFilters.compile(), or null for no filter |
| replaceText | <code>string</code> | If this is a replacement, the text to replace matches with. This is just      stored in the model for later use - the replacement is not actually performed right now. |
| candidateFilesPromise | <code>$.Promise</code> | If specified, a promise that should resolve with the same set of files that      getCandidateFiles(scope) would return. |

<a name="doReplace"></a>

## doReplace(results, replaceText, options, item, error) ⇒ <code>$.Promise</code>
Replaces a set of search results with the specified `replaceText`, either on disk or in memory.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise that resolves when the replacement is finished or is rejected with an array of errors if any occur. 
    Each item in the array will be an object containing:  

| Param | Type | Description |
| --- | --- | --- |
| results | <code>Object</code> | - The list of results to replace, as returned from `_doSearch`. |
| replaceText | <code>string</code> | The text to replace each result with. |
| options | <code>Object</code> | An options object: |
| options.forceFilesOpen | <code>boolean</code> | Whether to open all files in editors and perform replacements there instead of on disk.          Note that even if this is false, replacements will still occur in memory for files already open in editors. |
| options.isRegexp | <code>boolean</code> | Indicates if the original query was a regular expression. If true, $-substitution is applied to the `replaceText`. |
| item | <code>string</code> | The full path to the file that could not be updated. |
| error | <code>string</code> | Either a FileSystem error or one of the `FindInFiles.ERROR_*` constants. |

<a name="getNextPageofSearchResults"></a>

## getNextPageofSearchResults() ⇒ <code>object</code>
Gets the next page of search results to append to the result set.

**Kind**: global function  
**Returns**: <code>object</code> - A promise that's resolved with the search results or rejected when the find competes.  
<a name="getAllSearchResults"></a>

## getAllSearchResults() ⇒ <code>object</code>
Get all the search results.

**Kind**: global function  
**Returns**: <code>object</code> - A promise that's resolved with the search results or rejected when the find competes.  
