### Import :
```js
const QuickOpenHelper = brackets.getModule("search/QuickOpenHelper")
```

<a name="match"></a>

## match(query, returns)
**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| query | <code>string</code> | what the user is searching for |
| returns | <code>boolean</code> | true if this plug-in wants to provide results for this query |

<a name="itemFocus"></a>

## itemFocus(selectedItem, query, explicit)
Scroll to the selected item in the current document (unless no query string entered yet,in which case the topmost list item is irrelevant)

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| selectedItem | <code>SearchResult</code> |  |
| query | <code>string</code> |  |
| explicit | <code>boolean</code> | False if this is only highlighted due to being at top of list after search() |

<a name="itemSelect"></a>

## itemSelect(selectedItem, query)
Scroll to the selected item in the current document (unless no query string entered yet,in which case the topmost list item is irrelevant)

**Kind**: global function  

| Param | Type |
| --- | --- |
| selectedItem | <code>SearchResult</code> | 
| query | <code>string</code> | 

