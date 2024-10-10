### Import :
```js
const search = brackets.getModule("search/worker/search")
```

<a name="offsetToLineNum"></a>

## offsetToLineNum(textOrLines, offset) ⇒ <code>number</code>
Copied from StringUtils.jsReturns a line number corresponding to an offset in some text. The text canbe specified as a single string or as an array of strings that correspond tothe lines of the string.Specify the text in lines when repeatedly calling the function on the sametext in a loop. Use getLines() to divide the text into lines, then repeatedly callthis function to compute a line number from the offset.

**Kind**: global function  
**Returns**: <code>number</code> - line number  

| Param | Type | Description |
| --- | --- | --- |
| textOrLines | <code>string</code> \| <code>Array.&lt;string&gt;</code> | string or array of lines from which      to compute the line number from the offset |
| offset | <code>number</code> |  |

<a name="getSearchMatches"></a>

## getSearchMatches(contents, queryExpr) ⇒ <code>Object</code>
Searches through the contents and returns an array of matches

**Kind**: global function  

| Param | Type |
| --- | --- |
| contents | <code>string</code> | 
| queryExpr | <code>RegExp</code> | 

<a name="setResults"></a>

## setResults(fullpath, resultInfo)
Sets the list of matches for the given path, removing the previous match info, if any, and updatingthe total match count. Note that for the count to remain accurate, the previous match info must not havebeen mutated since it was set.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| fullpath | <code>string</code> | Full path to the file containing the matches. |
| resultInfo | <code>Object</code> | Info for the matches to set:      matches - Array of matches, in the format returned by FindInFiles.getSearchMatches()      collapsed - Optional: whether the results should be collapsed in the UI (default false). |

<a name="doSearchInOneFile"></a>

## doSearchInOneFile(filepath, text, queryExpr, maxResultsToReturn)
Finds search results in the given file and adds them to 'results'

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| filepath | <code>string</code> |  |
| text | <code>string</code> | contents of the file |
| queryExpr | <code>Object</code> |  |
| maxResultsToReturn | <code>number</code> | the maximum of results that should be returned in the current search. |

<a name="doSearchInFiles"></a>

## doSearchInFiles(fileList, queryExpr, startFileIndex, maxResultsToReturn)
Search in the list of files given and populate the results

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| fileList | <code>array</code> | array of file paths |
| queryExpr | <code>Object</code> |  |
| startFileIndex | <code>number</code> | the start index of the array from which the search has to be done |
| maxResultsToReturn | <code>number</code> | the maximum number of results to return in this search |

<a name="parseQueryInfo"></a>

## parseQueryInfo(queryInfo) ⇒ <code>Object</code>
Parses the given query into a regexp, and returns whether it was valid or not.

**Kind**: global function  
**Returns**: <code>Object</code> - queryExpr - the regexp representing the query     valid - set to true if query is a nonempty string or a valid regexp.     empty - set to true if query was empty.     error - set to an error string if valid is false and query is nonempty.  

| Param | Type |
| --- | --- |
| queryInfo | <code>Object</code> | 

<a name="countNumMatches"></a>

## countNumMatches(contents, queryExpr) ⇒ <code>number</code>
Counts the number of matches matching the queryExpr in the given contents

**Kind**: global function  
**Returns**: <code>number</code> - number of matches  

| Param | Type | Description |
| --- | --- | --- |
| contents | <code>String</code> | The contents to search on |
| queryExpr | <code>Object</code> |  |

<a name="getNumMatches"></a>

## getNumMatches(fileList, queryExpr) ⇒ <code>Number</code>
Get the total number of matches from all the files in fileList

**Kind**: global function  
**Returns**: <code>Number</code> - total number of matches  

| Param | Type | Description |
| --- | --- | --- |
| fileList | <code>array</code> | file path array |
| queryExpr | <code>Object</code> |  |

<a name="doSearch"></a>

## doSearch(searchObject, nextPages) ⇒ <code>Object</code>
Do a search with the searchObject context and return the results

**Kind**: global function  
**Returns**: <code>Object</code> - search results  

| Param | Type | Description |
| --- | --- | --- |
| searchObject | <code>Object</code> |  |
| nextPages | <code>boolean</code> | set to true if to indicate that next page of an existing page is being fetched |

<a name="getNextPage"></a>

## getNextPage() ⇒ <code>Object</code>
Gets the next page of results of the ongoing search

**Kind**: global function  
**Returns**: <code>Object</code> - search results  
<a name="getAllResults"></a>

## getAllResults() ⇒ <code>Object</code>
Gets all the results for the saved search query if present or empty search results

**Kind**: global function  
**Returns**: <code>Object</code> - The results object  
<a name="setCollapseResults"></a>

## setCollapseResults(collapse)
Sets if the results should be collapsed

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| collapse | <code>boolean</code> | true to collapse |

