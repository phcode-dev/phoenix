### Import :
```js
const FindReplace = brackets.getModule("search/FindReplace")
```

<a name="CommandManager"></a>

## CommandManager
Adds Find and Replace commandsOriginally based on the code in CodeMirror/lib/util/search.js.

**Kind**: global variable  
<a name="findBar"></a>

## findBar : <code>FindBar</code>
Currently open Find or Find/Replace bar, if any

**Kind**: global variable  
<a name="FIND_MAX_FILE_SIZE"></a>

## FIND\_MAX\_FILE\_SIZE : <code>number</code>
Maximum file size to search within (in chars)

**Kind**: global constant  
<a name="FIND_HIGHLIGHT_MAX"></a>

## FIND\_HIGHLIGHT\_MAX : <code>number</code>
If the number of matches exceeds this limit, inline text highlighting and scroll-track tickmarks are disabled

**Kind**: global constant  
<a name="_getWordAt"></a>

## \_getWordAt(editor, pos) ⇒ <code>Object</code>
Returns the range of the word surrounding the given editor position. Similar to getWordAt() from CodeMirror.

**Kind**: global function  
**Returns**: <code>Object</code> - The range and content of the found word. If    there is no word, start will equal end and the text will be the empty string.  

| Param | Type | Description |
| --- | --- | --- |
| editor | <code>Editor</code> | The editor to search in |
| pos | <code>Object</code> | The position to find a word at. |

<a name="_expandWordAndAddNextToSelection"></a>

## \_expandWordAndAddNextToSelection(editor, [removePrimary])
Expands each empty range in the selection to the nearest word boundaries. Then, if the primary selectionwas already a range (even a non-word range), adds the next instance of the contents of that range as a selection.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| editor | <code>Editor</code> | The editor to search in |
| [removePrimary] | <code>boolean</code> | Whether to remove the current primary selection in addition to adding the next one. If true, we add the next match even if the current primary selection is a cursor (we expand it first to determine what to match). |

<a name="_findAllAndSelect"></a>

## \_findAllAndSelect()
Takes the primary selection, expands it to a word range if necessary, then sets the selection toinclude all instances of that range. Removes all other selections. Does nothing if the selectionis not a range after expansion.

**Kind**: global function  
<a name="clearCurrentMatchHighlight"></a>

## clearCurrentMatchHighlight()
Removes the current-match highlight, leaving all matches marked in the generic highlight style

**Kind**: global function  
<a name="findNext"></a>

## findNext(editor, searchBackwards, preferNoScroll, pos)
Selects the next match (or prev match, if searchBackwards==true) starting from either the current position(if pos unspecified) or the given position (if pos specified explicitly). The starting positionneed not be an existing match. If a new match is found, sets to state.lastMatch either the regexmatch result, or simply true for a plain-string match. If no match found, sets state.lastMatchto false.

**Kind**: global function  

| Param | Type |
| --- | --- |
| editor | <code>Editor</code> | 
| searchBackwards | <code>boolean</code> | 
| preferNoScroll | <code>boolean</code> | 
| pos | <code>Pos</code> | 

<a name="clearHighlights"></a>

## clearHighlights()
Clears all match highlights, including the current match

**Kind**: global function  
<a name="updateResultSet"></a>

## updateResultSet()
Called each time the search query changes or document is modified (via Replace). Updatesthe match count, match highlights and scrollbar tickmarks. Does not change the cursor pos.

**Kind**: global function  
<a name="handleQueryChange"></a>

## handleQueryChange(editor, state, initial)
Called each time the search query field changes. Updates state.parsedQuery (parsedQuery will be falsy if the fieldwas blank OR contained a regexp with invalid syntax). Then calls updateResultSet(), and then jumps tothe first matching result, starting from the original cursor position.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| editor | <code>Editor</code> | The editor we're searching in. |
| state | <code>Object</code> | The current query state. |
| initial | <code>boolean</code> | Whether this is the initial population of the query when the search bar opens.     In that case, we don't want to change the selection unnecessarily. |

<a name="openSearchBar"></a>

## openSearchBar(editor, replace)
Creates a Find bar for the current search session.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| editor | <code>Editor</code> |  |
| replace | <code>boolean</code> | Whether to show the Replace UI; default false |

<a name="doSearch"></a>

## doSearch()
If no search pending, opens the Find dialog. If search bar already open, moves tonext/prev result (depending on 'searchBackwards')

**Kind**: global function  
