### Import :
```js
const StatusBar = brackets.getModule("widgets/StatusBar")
```

<a name="AppInit"></a>

## AppInit
A status bar with support for file information and busy and status indicators. This is a semi-genericcontainer; for the code that decides what content appears in the status bar, see client modules likeEditorStatusBar. (Although in practice StatusBar's HTML structure and initializationassume it's only used for this one purpose, and all the APIs are on a singleton).

**Kind**: global variable  
<a name="showBusyIndicator"></a>

## showBusyIndicator(updateCursor)
Shows the 'busy' indicator

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| updateCursor | <code>boolean</code> | Sets the cursor to "wait" |

<a name="hideBusyIndicator"></a>

## hideBusyIndicator()
Hides the 'busy' indicator

**Kind**: global function  
<a name="addIndicator"></a>

## addIndicator(id, [indicator], [visible], [style], [tooltip], [insertBefore])
Registers a new status indicator

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | Registration id of the indicator to be updated. |
| [indicator] | <code>DOMNode</code> \| <code>jQueryObject</code> | Optional DOMNode for the indicator |
| [visible] | <code>boolean</code> | Shows or hides the indicator over the statusbar. |
| [style] | <code>string</code> | Sets the attribute "class" of the indicator. |
| [tooltip] | <code>string</code> | Sets the attribute "title" of the indicator. |
| [insertBefore] | <code>string</code> | An id of an existing status bar indicator.          The new indicator will be inserted before (i.e. to the left of)          the indicator specified by this parameter. |

<a name="updateIndicator"></a>

## updateIndicator(id, visible, [style], [tooltip])
Updates a status indicator

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | Registration id of the indicator to be updated. |
| visible | <code>boolean</code> | Shows or hides the indicator over the statusbar. |
| [style] | <code>string</code> | Sets the attribute "class" of the indicator. |
| [tooltip] | <code>string</code> | Sets the attribute "title" of the indicator. |

<a name="hideInformation"></a>

## hideInformation()
Hide the statusbar Information Panel

**Kind**: global function  
<a name="showInformation"></a>

## showInformation()
Show the statusbar Information Panel

**Kind**: global function  
<a name="hideIndicators"></a>

## hideIndicators()
Hide the statusbar Indicators

**Kind**: global function  
<a name="showIndicators"></a>

## showIndicators()
Show the statusbar Indicators

**Kind**: global function  
<a name="hideAllPanes"></a>

## hideAllPanes()
Hides all panels but not the status bar

**Kind**: global function  
<a name="showAllPanes"></a>

## showAllPanes()
Shows all panels (will not show a hidden statusbar)

**Kind**: global function  
<a name="hide"></a>

## hide()
Hide the statusbar

**Kind**: global function  
<a name="show"></a>

## show()
Show the statusbar

**Kind**: global function  
