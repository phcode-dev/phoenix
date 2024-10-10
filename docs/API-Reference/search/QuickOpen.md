### Import :
```js
const QuickOpen = brackets.getModule("search/QuickOpen")
```

<a name="QuickNavigateDialog"></a>

## QuickNavigateDialog
**Kind**: global class  

* [QuickNavigateDialog](#QuickNavigateDialog)
    * [new QuickNavigateDialog()](#new_QuickNavigateDialog_new)
    * [.isOpen](#QuickNavigateDialog+isOpen) : <code>boolean</code>
    * [._handleItemSelect()](#QuickNavigateDialog+_handleItemSelect)
    * [._handleItemHighlight()](#QuickNavigateDialog+_handleItemHighlight)
    * [.close()](#QuickNavigateDialog+close) ⇒ <code>$.Promise</code>
    * [._filterCallback(query)](#QuickNavigateDialog+_filterCallback) ⇒ <code>$.Promise</code> \| <code>Array.&lt;\*&gt;</code> \| <code>Object</code>
    * [._resultsFormatterCallback(item)](#QuickNavigateDialog+_resultsFormatterCallback) ⇒ <code>string</code>
    * [.setSearchFieldValue(prefix, initialString)](#QuickNavigateDialog+setSearchFieldValue)
    * [._updateDialogLabel(plugin, query)](#QuickNavigateDialog+_updateDialogLabel)
    * [.showDialog()](#QuickNavigateDialog+showDialog)

<a name="new_QuickNavigateDialog_new"></a>

### new QuickNavigateDialog()
QuickNavigateDialog class

<a name="QuickNavigateDialog+isOpen"></a>

### quickNavigateDialog.isOpen : <code>boolean</code>
True if the search bar is currently open. Note that this is set to false immediatelywhen the bar starts closing; it doesn't wait for the ModalBar animation to finish.

**Kind**: instance property of [<code>QuickNavigateDialog</code>](#QuickNavigateDialog)  
<a name="QuickNavigateDialog+_handleItemSelect"></a>

### quickNavigateDialog.\_handleItemSelect()
Navigates to the appropriate file and file location given the selected itemand closes the dialog.Note, if selectedItem is null quick search should inspect $searchField for textthat may have not matched anything in the list, but may have informationfor carrying out an action (e.g. go to line).

**Kind**: instance method of [<code>QuickNavigateDialog</code>](#QuickNavigateDialog)  
<a name="QuickNavigateDialog+_handleItemHighlight"></a>

### quickNavigateDialog.\_handleItemHighlight()
Opens the file specified by selected item if there is no current plug-in, otherwise defers handlingto the currentPlugin

**Kind**: instance method of [<code>QuickNavigateDialog</code>](#QuickNavigateDialog)  
<a name="QuickNavigateDialog+close"></a>

### quickNavigateDialog.close() ⇒ <code>$.Promise</code>
Closes the search bar; if search bar is already closing, returns the Promise that is tracking theexisting close activity.

**Kind**: instance method of [<code>QuickNavigateDialog</code>](#QuickNavigateDialog)  
**Returns**: <code>$.Promise</code> - Resolved when the search bar is entirely closed.  
<a name="QuickNavigateDialog+_filterCallback"></a>

### quickNavigateDialog.\_filterCallback(query) ⇒ <code>$.Promise</code> \| <code>Array.&lt;\*&gt;</code> \| <code>Object</code>
Handles changes to the current query in the search field.

**Kind**: instance method of [<code>QuickNavigateDialog</code>](#QuickNavigateDialog)  
**Returns**: <code>$.Promise</code> \| <code>Array.&lt;\*&gt;</code> \| <code>Object</code> - The filtered list of results, an error object, or a Promise that                                              yields one of those  

| Param | Type | Description |
| --- | --- | --- |
| query | <code>string</code> | The new query. |

<a name="QuickNavigateDialog+_resultsFormatterCallback"></a>

### quickNavigateDialog.\_resultsFormatterCallback(item) ⇒ <code>string</code>
Formats the entry for the given item to be displayed in the dropdown.

**Kind**: instance method of [<code>QuickNavigateDialog</code>](#QuickNavigateDialog)  
**Returns**: <code>string</code> - The HTML to be displayed.  

| Param | Type | Description |
| --- | --- | --- |
| item | <code>Object</code> | The item to be displayed. |

<a name="QuickNavigateDialog+setSearchFieldValue"></a>

### quickNavigateDialog.setSearchFieldValue(prefix, initialString)
Sets the value in the search field, updating the current mode and label based on thegiven prefix.

**Kind**: instance method of [<code>QuickNavigateDialog</code>](#QuickNavigateDialog)  

| Param | Type | Description |
| --- | --- | --- |
| prefix | <code>string</code> | The prefix that determines which mode we're in: must be empty (for file search),      "@" for go to definition, or ":" for go to line. |
| initialString | <code>string</code> | The query string to search for (without the prefix). |

<a name="QuickNavigateDialog+_updateDialogLabel"></a>

### quickNavigateDialog.\_updateDialogLabel(plugin, query)
Sets the dialog label based on the current plugin (if any) and the current query.

**Kind**: instance method of [<code>QuickNavigateDialog</code>](#QuickNavigateDialog)  

| Param | Type | Description |
| --- | --- | --- |
| plugin | <code>Object</code> | The current Quick Open plugin, or none if there is none. |
| query | <code>string</code> | The user's current query. |

<a name="QuickNavigateDialog+showDialog"></a>

### quickNavigateDialog.showDialog()
Shows the search dialog and initializes the auto suggestion list with filenames from the current project

**Kind**: instance method of [<code>QuickNavigateDialog</code>](#QuickNavigateDialog)  
<a name="currentPlugin"></a>

## currentPlugin : [<code>QuickOpenPlugin</code>](#QuickOpenPlugin)
Current plugin

**Kind**: global variable  
<a name="fileList"></a>

## fileList : <code>Array.&lt;File&gt;</code>
**Kind**: global variable  
<a name="fileListPromise"></a>

## fileListPromise : <code>$.Promise</code>
**Kind**: global variable  
<a name="_curDialog"></a>

## \_curDialog : [<code>QuickNavigateDialog</code>](#QuickNavigateDialog)
The currently open (or last open) QuickNavigateDialog

**Kind**: global variable  
<a name="CURSOR_POS_EXP"></a>

## CURSOR\_POS\_EXP : <code>RegExp</code>
The regular expression to check the cursor position

**Kind**: global constant  
<a name="QuickOpenPlugin"></a>

## QuickOpenPlugin()
Defines API for new QuickOpen plug-ins

**Kind**: global function  
<a name="addQuickOpenPlugin"></a>

## addQuickOpenPlugin(pluginDef)
Creates and registers a new QuickOpenPlugin

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| pluginDef | <code>Object</code> | Plugin definition object containing the following properties:   \{string} name - Plug-in name, **must be unique**.   \{Array(string)} languageIds - Language Ids array. Example: ["javascript", "css", "html"]. To allow any language, pass []. Required.   \{function()} [done] - Called when quick open is complete. Plug-in should clear its internal state. Optional.   \{function(string, StringMatch.StringMatcher): (Array(SearchResult|string)|$.Promise)} search - Takes a query string and a StringMatcher (the use of which is optional but can speed up your searches) and returns      an array of strings or result objects that match the query; or a Promise that resolves to such an array. Required.   \{function(string): boolean} match - Takes a query string and returns true if this plug-in wants to provide      results for this query. Required.   \{function(?SearchResult|string, string, boolean)} [itemFocus] - Performs an action when a result has been highlighted (via arrow keys, or by becoming top of the list).      Passed the highlighted search result item (as returned by search()), the current query string, and a flag that is true      if the item was highlighted explicitly (arrow keys), not implicitly (at top of list after last search()). Optional.   \{function(?SearchResult|string, string)} itemSelect - Performs an action when a result is chosen.      Passed the highlighted search result item (as returned by search()), and the current query string. Required.   \{function(SearchResult|string, string): string} [resultsFormatter] - Takes a query string and an item string and returns      a "LI" item to insert into the displayed search results. Optional.   \{Object} [matcherOptions] - Options to pass along to the StringMatcher (see StringMatch.StringMatcher          for available options). Optional.   \{string} [label] - If provided, the label to show before the query field. Optional. If itemFocus() makes changes to the current document or cursor/scroll position and then the user cancels Quick Open (via Esc), those changes are automatically reverted. |

<a name="extractCursorPos"></a>

## extractCursorPos(query) ⇒ <code>Object</code>
Attempts to extract a line number from the query where the line numberis followed by a colon. Callers should explicitly test result with isNaN()

**Kind**: global function  
**Returns**: <code>Object</code> - An object with     the extracted line and column numbers, and two additional fields: query with the original position     string and local indicating if the cursor position should be applied to the current file.     Or null if the query is invalid  

| Param | Type | Description |
| --- | --- | --- |
| query | <code>string</code> | string to extract line number from |

<a name="highlightMatch"></a>

## highlightMatch(item, matchClass, rangeFilter) ⇒ <code>string</code>
Formats item's label as properly escaped HTML text, highlighting sections that match 'query'.If item is a SearchResult generated by stringMatch(), uses its metadata about which string rangesmatched; else formats the label with no highlighting.

**Kind**: global function  
**Returns**: <code>string</code> - bolded, HTML-escaped result  

| Param | Type | Description |
| --- | --- | --- |
| item | <code>string</code> \| <code>SearchResult</code> |  |
| matchClass | <code>string</code> | CSS class for highlighting matched text |
| rangeFilter | <code>function</code> |  |

<a name="beginSearch"></a>

## beginSearch(prefix, initialString)
Opens the Quick Open bar prepopulated with the given prefix (to select a mode) and optionallywith the given query text too. Updates text field contents if Quick Open already open.

**Kind**: global function  

| Param | Type |
| --- | --- |
| prefix | <code>string</code> | 
| initialString | <code>string</code> | 

