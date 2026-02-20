### Import :
```js
const PanelView = brackets.getModule("view/PanelView")
```

<a name="Panel"></a>

## Panel
**Kind**: global class  

* [Panel](#Panel)
    * [new Panel($panel, id, [title])](#new_Panel_new)
    * [.$panel](#Panel+$panel) : <code>jQueryObject</code>
    * [.isVisible()](#Panel+isVisible) ⇒ <code>boolean</code>
    * [.registerCanBeShownHandler(canShowHandlerFn)](#Panel+registerCanBeShownHandler) ⇒ <code>boolean</code>
    * [.canBeShown()](#Panel+canBeShown) ⇒ <code>boolean</code>
    * [.show()](#Panel+show)
    * [.hide()](#Panel+hide)
    * [.setVisible(visible)](#Panel+setVisible)
    * [.setTitle(newTitle)](#Panel+setTitle)
    * [.destroy()](#Panel+destroy)
    * [.getPanelType()](#Panel+getPanelType) ⇒ <code>string</code>

<a name="new_Panel_new"></a>

### new Panel($panel, id, [title])
Represents a panel below the editor area (a child of ".content").


| Param | Type | Description |
| --- | --- | --- |
| $panel | <code>jQueryObject</code> | The entire panel, including any chrome, already in the DOM. |
| id | <code>string</code> | Unique panel identifier. |
| [title] | <code>string</code> | Optional display title for the tab bar. |

<a name="Panel+$panel"></a>

### panel.$panel : <code>jQueryObject</code>
Dom node holding the rendered panel

**Kind**: instance property of [<code>Panel</code>](#Panel)  
<a name="Panel+isVisible"></a>

### panel.isVisible() ⇒ <code>boolean</code>
Determines if the panel is visible

**Kind**: instance method of [<code>Panel</code>](#Panel)  
**Returns**: <code>boolean</code> - true if visible, false if not  
<a name="Panel+registerCanBeShownHandler"></a>

### panel.registerCanBeShownHandler(canShowHandlerFn) ⇒ <code>boolean</code>
Registers a call back function that will be called just before panel is shown. The handler should return true
if the panel can be shown, else return false and the panel will not be shown.

**Kind**: instance method of [<code>Panel</code>](#Panel)  
**Returns**: <code>boolean</code> - true if visible, false if not  

| Param | Type | Description |
| --- | --- | --- |
| canShowHandlerFn | <code>function</code> \| <code>null</code> | function that should return true of false if the panel can be shown/not. or null to clear the handler. |

<a name="Panel+canBeShown"></a>

### panel.canBeShown() ⇒ <code>boolean</code>
Returns true if th panel can be shown, else false.

**Kind**: instance method of [<code>Panel</code>](#Panel)  
<a name="Panel+show"></a>

### panel.show()
Shows the panel

**Kind**: instance method of [<code>Panel</code>](#Panel)  
<a name="Panel+hide"></a>

### panel.hide()
Hides the panel

**Kind**: instance method of [<code>Panel</code>](#Panel)  
<a name="Panel+setVisible"></a>

### panel.setVisible(visible)
Sets the panel's visibility state

**Kind**: instance method of [<code>Panel</code>](#Panel)  

| Param | Type | Description |
| --- | --- | --- |
| visible | <code>boolean</code> | true to show, false to hide |

<a name="Panel+setTitle"></a>

### panel.setTitle(newTitle)
Updates the display title shown in the tab bar for this panel.

**Kind**: instance method of [<code>Panel</code>](#Panel)

| Param | Type | Description |
| --- | --- | --- |
| newTitle | <code>string</code> | The new title to display. |

<a name="Panel+destroy"></a>

### panel.destroy()
Destroys the panel, removing it from the tab bar, internal maps, and the DOM.
After calling this, the Panel instance should not be reused.

**Kind**: instance method of [<code>Panel</code>](#Panel)
<a name="Panel+getPanelType"></a>

### panel.getPanelType() ⇒ <code>string</code>
gets the Panel's type

**Kind**: instance method of [<code>Panel</code>](#Panel)  
<a name="_panelMap"></a>

## \_panelMap : <code>Object.&lt;string, Panel&gt;</code>
Maps panel ID to Panel instance

**Kind**: global variable
<a name="_$container"></a>

## \_$container : <code>jQueryObject</code>
The single container wrapping all bottom panels

**Kind**: global variable
<a name="_$tabBar"></a>

## \_$tabBar : <code>jQueryObject</code>
The tab bar inside the container

**Kind**: global variable
<a name="_$tabsOverflow"></a>

## \_$tabsOverflow : <code>jQueryObject</code>
Scrollable area holding the tab elements

**Kind**: global variable
<a name="_openIds"></a>

## \_openIds : <code>Array.&lt;string&gt;</code>
Ordered list of currently open (tabbed) panel IDs

**Kind**: global variable
<a name="_activeId"></a>

## \_activeId : <code>string</code> \| <code>null</code>
The panel ID of the currently visible (active) tab

**Kind**: global variable
<a name="EVENT_PANEL_HIDDEN"></a>

## EVENT\_PANEL\_HIDDEN : <code>string</code>
Event when panel is hidden

**Kind**: global constant  
<a name="EVENT_PANEL_SHOWN"></a>

## EVENT\_PANEL\_SHOWN : <code>string</code>
Event when panel is shown

**Kind**: global constant  
<a name="PANEL_TYPE_BOTTOM_PANEL"></a>

## PANEL\_TYPE\_BOTTOM\_PANEL : <code>string</code>
type for bottom panel

**Kind**: global constant  
<a name="init"></a>

## init($container, $tabBar, $tabsOverflow)
Initializes the PanelView module with references to the bottom panel container DOM elements.
Called by WorkspaceManager during htmlReady.

**Kind**: global function

| Param | Type | Description |
| --- | --- | --- |
| $container | <code>jQueryObject</code> | The bottom panel container element. |
| $tabBar | <code>jQueryObject</code> | The tab bar element inside the container. |
| $tabsOverflow | <code>jQueryObject</code> | The scrollable area holding tab elements. |

<a name="getOpenBottomPanelIDs"></a>

## getOpenBottomPanelIDs() ⇒ <code>Array.&lt;string&gt;</code>
Returns a copy of the currently open bottom panel IDs in tab order.

**Kind**: global function
<a name="hideAllOpenPanels"></a>

## hideAllOpenPanels() ⇒ <code>Array.&lt;string&gt;</code>
Hides every open bottom panel tab in a single batch

**Kind**: global function
**Returns**: <code>Array.&lt;string&gt;</code> - The IDs of panels that were open (useful for restoring later).
