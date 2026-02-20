### Import :
```js
const SearchResultsView = brackets.getModule("search/SearchResultsView")
```

<a name="Handles the search results panel.
Dispatches the following events_
     replaceBatch - when the Replace button is clicked.
     close - when the panel is closed."></a>

## Handles the search results panel.
Dispatches the following events:
     replaceBatch - when the Replace button is clicked.
     close - when the panel is closed.
**Kind**: global class  
<a name="new_Handles the search results panel.
Dispatches the following events_
     replaceBatch - when the Replace button is clicked.
     close - when the panel is closed._new"></a>

### new Handles the search results panel.
Dispatches the following events:
     replaceBatch - when the Replace button is clicked.
     close - when the panel is closed.(model, panelID, panelName, type, [title])

| Param | Type | Description |
| --- | --- | --- |
| model | <code>SearchModel</code> | The model that this view is showing. |
| panelID | <code>string</code> | The CSS ID to use for the panel. |
| panelName | <code>string</code> | The name to use for the panel, as passed to WorkspaceManager.createBottomPanel(). |
| type | <code>string</code> | type to identify if it is reference search or string match serach |
| [title] | <code>string</code> | Display title for the panel tab. |

