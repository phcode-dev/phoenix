### Import :
```js
const PluginPanelView = brackets.getModule("view/PluginPanelView")
```

<a name="Panel"></a>

## Panel
**Kind**: global class  

* [Panel](#Panel)
    * [new Panel($panel, id, $toolbarIcon, [minWidth], [initialSize])](#new_Panel_new)
    * [.$panel](#Panel+$panel) : <code>jQueryObject</code>
    * [.isVisible()](#Panel+isVisible) ⇒ <code>boolean</code>
    * [.registerCanBeShownHandler(canShowHandlerFn)](#Panel+registerCanBeShownHandler) ⇒ <code>boolean</code>
    * [.canBeShown()](#Panel+canBeShown) ⇒ <code>boolean</code>
    * [.show()](#Panel+show)
    * [.hide()](#Panel+hide)
    * [.setVisible(visible)](#Panel+setVisible)
    * [.getPanelType()](#Panel+getPanelType) ⇒ <code>string</code>

<a name="new_Panel_new"></a>

### new Panel($panel, id, $toolbarIcon, [minWidth], [initialSize])
Represents a panel below the editor area (a child of ".content").


| Param | Type | Description |
| --- | --- | --- |
| $panel | <code>jQueryObject</code> | The entire panel, including any chrome, already in the DOM. |
| id | <code>string</code> | Unique id for this panel. Use package-style naming, e.g. "myextension.panelname". will      overwrite an existing panel id if present. |
| $toolbarIcon | <code>jQueryObject</code> | An icon that should be present in main-toolbar to associate this panel to.      The panel will be shown only if the icon is visible on the toolbar and the user clicks on the icon. |
| [minWidth] | <code>number</code> | Minimum width of panel in px. |
| [initialSize] | <code>number</code> | Optional Initial size of panel in px. If not given, panel will use minsize      or current size. |

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

<a name="Panel+getPanelType"></a>

### panel.getPanelType() ⇒ <code>string</code>
gets the Panel's type

**Kind**: instance method of [<code>Panel</code>](#Panel)  
<a name="EVENT_PANEL_HIDDEN"></a>

## EVENT\_PANEL\_HIDDEN : <code>string</code>
Event when panel is hidden

**Kind**: global constant  
<a name="EVENT_PANEL_SHOWN"></a>

## EVENT\_PANEL\_SHOWN : <code>string</code>
Event when panel is shown

**Kind**: global constant  
<a name="PANEL_TYPE_PLUGIN_PANEL"></a>

## PANEL\_TYPE\_PLUGIN\_PANEL : <code>string</code>
type for plugin panel

**Kind**: global constant  
