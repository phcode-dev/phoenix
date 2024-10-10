### Import :
```js
const FindInFiles = brackets.getModule("search/FindInFiles")
```

<a name="searchModel"></a>

## searchModel : <code>SearchModel</code>
The search query and results model.

**Kind**: global variable  
<a name="_cachedFileSystemEvents"></a>

## \_cachedFileSystemEvents
This stores file system events emitted by watchers that were not yet processed

**Kind**: global variable  
<a name="_processCachedFileSystemEvents"></a>

## \_processCachedFileSystemEvents
Debounced function to process emitted file system eventsfor cases when there's a lot of fs events emitted in a very short period of time

**Kind**: global variable  
<a name="@type"></a>

## @type : <code>Object</code>
Token used to indicate a specific reason for zero search results

**Kind**: global constant  
<a name="MAX_DISPLAY_LENGTH"></a>

## MAX\_DISPLAY\_LENGTH
Maximum length of text displayed in search results panel

**Kind**: global constant  
<a name="FILE_SYSTEM_EVENT_DEBOUNCE_TIME"></a>

## FILE\_SYSTEM\_EVENT\_DEBOUNCE\_TIME
Waits for FS changes to stack up until processing them(scripts like npm install can do a lot of movements on the disk)

**Kind**: global constant  
<a name="_removeListeners"></a>

## \_removeListeners()
Remove the listeners that were tracking potential search result changes

**Kind**: global function  
<a name="_addListeners"></a>

## \_addListeners()
Add listeners to track events that might change the search result set

**Kind**: global function  
<a name="_subtreeFilter"></a>

## \_subtreeFilter(file, scope) ⇒ <code>boolean</code>
Checks that the file matches the given subtree scope. To fully check whether the fileshould be in the search set, use _inSearchScope() instead - a supserset of this.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| file | <code>File</code> |  |
| scope | <code>FileSystemEntry</code> | Search scope, or null if whole project |

<a name="_isReadableFileType"></a>

## \_isReadableFileType(fullPath) ⇒ <code>boolean</code>
Filters out files that are known binary types.

**Kind**: global function  
**Returns**: <code>boolean</code> - True if the file's contents can be read as text  

| Param | Type |
| --- | --- |
| fullPath | <code>string</code> | 

<a name="getCandidateFiles"></a>

## getCandidateFiles(scope) ⇒ <code>$.Promise</code>
Finds all candidate files to search in the given scope's subtree that are not binary content. Does NOT applythe current filter yet.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise that will be resolved with the list of files in the scope. Never rejected.  

| Param | Type | Description |
| --- | --- | --- |
| scope | <code>FileSystemEntry</code> | Search scope, or null if whole project |

<a name="_inSearchScope"></a>

## \_inSearchScope(file) ⇒ <code>boolean</code>
Checks that the file is eligible for inclusion in the search (matches the user's subtree scope andfile exclusion filters, and isn't binary). Used when updating results incrementally - during theinitial search, these checks are done in bulk via getCandidateFiles() and the filterFileList() callafter it.

**Kind**: global function  

| Param | Type |
| --- | --- |
| file | <code>File</code> | 

<a name="doSearchInScope"></a>

## doSearchInScope(queryInfo, scope, filter, replaceText, candidateFilesPromise) ⇒ <code>$.Promise</code>
Does a search in the given scope with the given filter. Used when you want to start a searchprogrammatically. Make sure that project indexing is complete by calling isProjectIndexingComplete()Else, an empty result will be returned if search is invoked before any files are indexed.

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
**Returns**: <code>$.Promise</code> - A promise that resolves when the replacement is finished or is rejected with an array of errors if any occur.     Each item in the array will be an object containing:  

| Param | Type | Description |
| --- | --- | --- |
| results | <code>Object</code> | - The list of results to replace, as returned from `_doSearch`. |
| replaceText | <code>string</code> | The text to replace each result with. |
| options | <code>Object</code> | An options object: |
| options.forceFilesOpen | <code>boolean</code> | Whether to open all files in editors and perform replacements there instead of on disk.          Note that even if this is false, replacements will still occur in memory for files already open in editors. |
| options.isRegexp | <code>boolean</code> | Indicates if the original query was a regular expression. If true, $-substitution is applied to the `replaceText`. |
| item | <code>string</code> | The full path to the file that could not be updated. |
| error | <code>string</code> | Either a FileSystem error or one of the `FindInFiles.ERROR_*` constants. |

<a name="_searchcollapseResults"></a>

## \_searchcollapseResults()
Notify worker that the results should be collapsed

**Kind**: global function  
<a name="filesChanged"></a>

## filesChanged(fileList)
Inform worker that the list of files has changed.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| fileList | <code>array</code> | The list of files that changed. |

<a name="filesRemoved"></a>

## filesRemoved(fileList)
Inform worker that the list of files have been removed.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| fileList | <code>array</code> | The list of files that was removed. |

<a name="_debouncedFileSystemChangeHandler"></a>

## \_debouncedFileSystemChangeHandler()
Wrapper function for _fileSystemChangeHandler which handles all incoming fs eventsputting them to cache and executing a debounced function

**Kind**: global function  
<a name="_initCache"></a>

## \_initCache()
On project change, inform worker about the new list of files that needs to be crawled.Instant search is also disabled for the time being till the crawl is complete in worker.This should never be called directly and only called via _scheduleCacheInit() belowto not affect project load performance.

**Kind**: global function  
<a name="getNextPageofSearchResults"></a>

## getNextPageofSearchResults() ⇒ <code>object</code>
Gets the next page of search results to append to the result set.

**Kind**: global function  
**Returns**: <code>object</code> - A promise that's resolved with the search results or rejected when the find competes.  
