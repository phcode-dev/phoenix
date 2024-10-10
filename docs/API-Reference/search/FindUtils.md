### Import :
```js
const FindUtils = brackets.getModule("search/FindUtils")
```

<a name="parseDollars"></a>

## parseDollars(replaceWith, match) ⇒ <code>string</code>
Given a replace string that contains $-expressions, replace them with data from the givenregexp match info.NOTE: we can't just use the ordinary replace() function here because the string has beenextracted from the original text and so might be missing some context that the regexp matched.

**Kind**: global function  
**Returns**: <code>string</code> - The replace text with the $-expressions substituted.  

| Param | Type | Description |
| --- | --- | --- |
| replaceWith | <code>string</code> | The string containing the $-expressions. |
| match | <code>Object</code> | The match data from the regexp. |

<a name="_doReplaceInDocument"></a>

## \_doReplaceInDocument(doc, matchInfo, replaceText, [isRegexp]) ⇒ <code>$.Promise</code>
Does a set of replacements in a single document in memory.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise that's resolved when the replacement is finished or rejected with an error if there were one or more errors.  

| Param | Type | Description |
| --- | --- | --- |
| doc | <code>Document</code> | The document to do the replacements in. |
| matchInfo | <code>Object</code> | The match info for this file, as returned by `_addSearchMatches()`. Might be mutated. |
| replaceText | <code>string</code> | The text to replace each result with. |
| [isRegexp] | <code>boolean</code> | Whether the original query was a regexp. |

<a name="_doReplaceOnDisk"></a>

## \_doReplaceOnDisk(fullPath, matchInfo, replaceText, [isRegexp]) ⇒ <code>$.Promise</code>
Does a set of replacements in a single file on disk.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise that's resolved when the replacement is finished or rejected with an error if there were one or more errors.  

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> | The full path to the file. |
| matchInfo | <code>Object</code> | The match info for this file, as returned by `_addSearchMatches()`. |
| replaceText | <code>string</code> | The text to replace each result with. |
| [isRegexp] | <code>boolean</code> | Whether the original query was a regexp. |

<a name="_doReplaceInOneFile"></a>

## \_doReplaceInOneFile(fullPath, matchInfo, replaceText, [options]) ⇒ <code>$.Promise</code>
Does a set of replacements in a single file. If the file is already open in a Document in memory,will do the replacement there, otherwise does it directly on disk.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise that's resolved when the replacement is finished or rejected with an error if there were one or more errors.  

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> | The full path to the file. |
| matchInfo | <code>Object</code> | The match info for this file, as returned by `_addSearchMatches()`. |
| replaceText | <code>string</code> | The text to replace each result with. |
| [options] | <code>Object</code> | An options object:      forceFilesOpen: boolean - Whether to open the file in an editor and do replacements there rather than doing the          replacements on disk. Note that even if this is false, files that are already open in editors will have replacements          done in memory.      isRegexp: boolean - Whether the original query was a regexp. If true, $-substitution is performed on the replaceText. |

<a name="performReplacements"></a>

## performReplacements(results, replaceText, options) ⇒ <code>$.Promise</code>
Given a set of search results, replaces them with the given `replaceText`, either on disk or in memory.Checks timestamps to ensure replacements are not performed in files that have changed on disk sincethe original search results were generated. However, does *not* check whether edits have been performedin in-memory documents since the search; it's up to the caller to guarantee this hasn't happened.(When called from the standard Find in Files UI, `SearchResultsView` guarantees this. If called headlessly,the caller needs to track changes.)Replacements in documents that are already open in memory at the start of the replacement are guaranteed tohappen synchronously; replacements in files on disk will return an error if the on-disk file changes betweenthe time `performReplacements()` is called and the time the replacement actually happens.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise that's resolved when the replacement is finished or rejected with an array of errors    if there were one or more errors. Each individual item in the array will be a `{item: string, error: string}` object,    where `item` is the full path to the file that could not be updated, and `error` is either a FileSystem error or one    of the `FindUtils.ERROR_*` constants.  

| Param | Type | Description |
| --- | --- | --- |
| results | <code>Object</code> | The list of results to replace, as returned from `_doSearch`. |
| replaceText | <code>string</code> | The text to replace each result with. |
| options | <code>Object</code> | An options object: |
| [options.forceFilesOpen] | <code>boolean</code> | Whether to open all files in editors and do replacements there rather than doing the         replacements on disk. Note that even if this is false, files that are already open in editors will have replacements         done in memory. |
| [options.isRegexp] | <code>boolean</code> | Whether the original query was a regexp. If true, $-substitution is performed on the replaceText. |

<a name="labelForScope"></a>

## labelForScope(scope) ⇒ <code>string</code>
Returns label text to indicate the search scope. Already HTML-escaped.

**Kind**: global function  

| Param | Type |
| --- | --- |
| scope | <code>Entry</code> | 

<a name="parseQueryInfo"></a>

## parseQueryInfo(queryInfo) ⇒ <code>Object</code>
Parses the given query into a regexp, and returns whether it was valid or not.

**Kind**: global function  
**Returns**: <code>Object</code> - queryExpr - the regexp representing the query     valid - set to true if query is a nonempty string or a valid regexp.     empty - set to true if query was empty.     error - set to an error string if valid is false and query is nonempty.  

| Param | Type |
| --- | --- |
| queryInfo | <code>Object</code> | 

<a name="prioritizeOpenFile"></a>

## prioritizeOpenFile(files, firstFile) ⇒ <code>Array.&lt;\*&gt;</code>
Prioritizes the open file and then the working set files to the starting of the list of files

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| files | <code>Array.&lt;\*&gt;</code> | An array of file paths or file objects to sort |
| firstFile | <code>string</code> | If specified, the path to the file that should be sorted to the top. |

<a name="getOpenFilePath"></a>

## getOpenFilePath() ⇒ <code>string</code>
Returns the path of the currently open file or null if there isn't one open

**Kind**: global function  
<a name="setInstantSearchDisabled"></a>

## setInstantSearchDisabled(disable)
enable/disable instant search

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| disable | <code>boolean</code> | true to disable web worker based search |

<a name="isInstantSearchDisabled"></a>

## isInstantSearchDisabled() ⇒ <code>boolean</code>
if instant search is disabled, this will return true we can only do instant search through worker

**Kind**: global function  
<a name="isWorkerSearchInProgress"></a>

## isWorkerSearchInProgress() ⇒ <code>Boolean</code>
check if a search is progressing in worker

**Kind**: global function  
**Returns**: <code>Boolean</code> - true if search is processing in worker  
<a name="notifyFileFiltersChanged"></a>

## notifyFileFiltersChanged()
Raises an event when the file filters applied to a search changes

**Kind**: global function  
<a name="notifySearchScopeChanged"></a>

## notifySearchScopeChanged()
Raises an event when the search scope changes[say search in a subdirectory in the project]

**Kind**: global function  
<a name="notifyWorkerSearchStarted"></a>

## notifyWorkerSearchStarted()
Notifies that a worker search has started so that we FindUtils can figure outif any outstanding worker search requests are pending

**Kind**: global function  
<a name="notifyWorkerSearchFinished"></a>

## notifyWorkerSearchFinished()
Notifies that a worker search has finished so that we FindUtils can figure outif any outstanding worker search requests are pending

**Kind**: global function  
<a name="notifyIndexingStarted"></a>

## notifyIndexingStarted()
Notifies that a worker has started indexing the files

**Kind**: global function  
<a name="notifyIndexingProgress"></a>

## notifyIndexingProgress()
Notifies that a worker has started indexing the files

**Kind**: global function  
<a name="notifyIndexingFinished"></a>

## notifyIndexingFinished()
Notifies that a worker has finished indexing the files

**Kind**: global function  
<a name="isIndexingInProgress"></a>

## isIndexingInProgress() ⇒ <code>boolean</code>
Return true if indexing is in progress in worker

**Kind**: global function  
**Returns**: <code>boolean</code> - true if files are being indexed in worker  
<a name="setCollapseResults"></a>

## setCollapseResults(collapse)
Set if we need to collapse all results in the results pane

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| collapse | <code>boolean</code> | true to collapse |

<a name="isCollapsedResults"></a>

## isCollapsedResults() ⇒ <code>boolean</code>
check if results should be collapsed

**Kind**: global function  
**Returns**: <code>boolean</code> - true if results should be collapsed  
