### Import :
```js
const QuickSearchField = brackets.getModule("search/QuickSearchField")
```

<a name="QuickSearchField"></a>

## QuickSearchField
**Kind**: global class  

* [QuickSearchField](#QuickSearchField)
    * [new QuickSearchField($input)](#new_QuickSearchField_new)
    * [.options](#QuickSearchField+options) : <code>Object</code>
    * [.updateResults()](#QuickSearchField+updateResults)
    * [.setText(value)](#QuickSearchField+setText)
    * [.destroy()](#QuickSearchField+destroy)

<a name="new_QuickSearchField_new"></a>

### new QuickSearchField($input)
Attaches to an existing "input" tag


| Param | Type | Description |
| --- | --- | --- |
| $input | <code>jQueryObject</code> |  |
| options.resultProvider | <code>function</code> | Given the current search text, returns an array of result objects, an error object, or a          Promise that yields one of those. If the Promise is still outstanding when the query next          changes, resultProvider() will be called again (without waiting for the earlier Promise), and          the Promise's result will be ignored.          If the provider yields [], or a non-null error string, input is decorated with ".no-results"; if          the provider yields a null error string, input is not decorated. |
| options.formatter | <code>function</code> | Converts one result object to a string of HTML text. Passed the item and the current query. The          outermost element must be "li". The ".highlight" class can be ignored as it is applied automatically. |
| options.onCommit | <code>function</code> | Called when an item is selected by clicking or pressing Enter. Passed the committed item and the current          query and its index. If the current result list is not up to date with the query text at the time Enter is          pressed, waits until it is before running this callback. If Enter pressed with no results, passed          null. The popup remains open after this event. |
| options.onHighlight | <code>function</code> | Called when an item is highlighted in the list. Passed the item, the current query, and a flag that is          true if the item was highlighted explicitly (arrow keys), not simply due to a results list update. Since          the top item in the list is always initially highlighted, every time the list is updated onHighlight()          is called with the top item and with the explicit flag set to false. |
| options.onDelete | <code>function</code> | Called when delete key is pressed on a selected item in the list. Passed the item. |
| options.onDismiss | <code>function</code> | Called when popup is dismissed with escape key press. Popup is not usable after this point. |
| options.maxResults | <code>number</code> | Maximum number of items from resultProvider() to display in the popup. |
| options.verticalAdjust | <code>number</code> | Number of pixels to position the popup below where $input is when constructor is called. Useful          if UI is going to animate position after construction, but QuickSearchField may receive input          before the animation is done. |
| options.$positionEl | <code>jQueryObject</code> | If provided, the popup will be positioned based on this. |
| options.firstHighlightIndex | <code>number</code> | Index of the result that is highlighted by default. null to not highlight any result. |
| options.focusLastActiveElementOnClose | <code>boolean</code> | If set to true, focuses the last active element on close.          By default, the editor is always focused. |

<a name="QuickSearchField+options"></a>

### quickSearchField.options : <code>Object</code>
**Kind**: instance property of [<code>QuickSearchField</code>](#QuickSearchField)  
<a name="QuickSearchField+updateResults"></a>

### quickSearchField.updateResults()
Refresh the results dropdown, as if the user had changed the search text. Useful for providers that
want to show cached data initially, then update the results with fresher data once available.

**Kind**: instance method of [<code>QuickSearchField</code>](#QuickSearchField)  
<a name="QuickSearchField+setText"></a>

### quickSearchField.setText(value)
Programmatically changes the search text and updates the results.

**Kind**: instance method of [<code>QuickSearchField</code>](#QuickSearchField)  

| Param | Type |
| --- | --- |
| value | <code>string</code> | 

<a name="QuickSearchField+destroy"></a>

### quickSearchField.destroy()
Closes the dropdown, and discards any pending Promises.

**Kind**: instance method of [<code>QuickSearchField</code>](#QuickSearchField)  
<a name="KeyEvent"></a>

## KeyEvent
Text field with attached dropdown list that is updated (based on a provider) whenever the text changes.

For styling, the DOM structure of the popup is as follows:
 body
     ol.quick-search-container
         li
         li.highlight
         li
And the text field is:
     input
     input.no-results

**Kind**: global constant  
