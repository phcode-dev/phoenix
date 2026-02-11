### Import :
```js
const WorkspaceManager = brackets.getModule("view/WorkspaceManager")
```

<a name="PANEL_TYPE_BOTTOM_PANEL"></a>

## PANEL\_TYPE\_BOTTOM\_PANEL : <code>string</code>
Constant representing the type of bottom panel

**Kind**: global variable  
<a name="PANEL_TYPE_PLUGIN_PANEL"></a>

## PANEL\_TYPE\_PLUGIN\_PANEL : <code>string</code>
Constant representing the type of plugin panel

**Kind**: global variable  
<a name="AppInit"></a>

## AppInit
Manages layout of panels surrounding the editor area, and size of the editor area (but not its contents).

Updates panel sizes when the window is resized. Maintains the max resizing limits for panels, based on
currently available window size.

Events:
`workspaceUpdateLayout` When workspace size changes for any reason (including panel show/hide panel resize, or the window resize).
             The 2nd arg is the available workspace height.
             The 3rd arg is a refreshHint flag for internal use (passed in to recomputeLayout)

**Kind**: global constant  
<a name="EVENT_WORKSPACE_UPDATE_LAYOUT"></a>

## EVENT\_WORKSPACE\_UPDATE\_LAYOUT
Event triggered when the workspace layout updates.

**Kind**: global constant  
<a name="EVENT_WORKSPACE_PANEL_SHOWN"></a>

## EVENT\_WORKSPACE\_PANEL\_SHOWN
Event triggered when a panel is shown.

**Kind**: global constant  
<a name="EVENT_WORKSPACE_PANEL_HIDDEN"></a>

## EVENT\_WORKSPACE\_PANEL\_HIDDEN
Event triggered when a panel is hidden.

**Kind**: global constant  
<a name="createBottomPanel"></a>

## createBottomPanel(id, $panel, [minSize]) ⇒ <code>Panel</code>
Creates a new resizable panel beneath the editor area and above the status bar footer. Panel is initially invisible.
The panel's size & visibility are automatically saved & restored as a view-state preference.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | Unique id for this panel. Use package-style naming, e.g. "myextension.feature.panelname" |
| $panel | <code>jQueryObject</code> | DOM content to use as the panel. Need not be in the document yet. Must have an id      attribute, for use as a preferences key. |
| [minSize] | <code>number</code> | Minimum height of panel in px. |

<a name="createPluginPanel"></a>

## createPluginPanel(id, $panel, [minSize], $toolbarIcon, [initialSize]) ⇒ <code>Panel</code>
Creates a new resizable plugin panel associated with the given toolbar icon. Panel is initially invisible.
The panel's size & visibility are automatically saved & restored. Only one panel can be associated with a
toolbar icon.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | Unique id for this panel. Use package-style naming, e.g. "myextension.panelname". will      overwrite an existing panel id if present. |
| $panel | <code>jQueryObject</code> | DOM content to use as the panel. Need not be in the document yet. Must have an id      attribute, for use as a preferences key. |
| [minSize] | <code>number</code> | Minimum height of panel in px. |
| $toolbarIcon | <code>jQueryObject</code> | An icon that should be present in main-toolbar to associate this panel to.      The panel will be shown only if the icon is visible on the toolbar and the user clicks on the icon. |
| [initialSize] | <code>number</code> | Optional Initial size of panel in px. If not given, panel will use minsize      or current size. |

<a name="getAllPanelIDs"></a>

## getAllPanelIDs() ⇒ <code>Array</code>
Returns an array of all panel ID's

**Kind**: global function  
**Returns**: <code>Array</code> - List of ID's of all bottom panels  
<a name="getPanelForID"></a>

## getPanelForID(panelID) ⇒ <code>Object</code>
Gets the Panel interface for the given ID. Can return undefined if no panel with the ID is found.

**Kind**: global function  
**Returns**: <code>Object</code> - Panel object for the ID or undefined  

| Param | Type |
| --- | --- |
| panelID | <code>string</code> | 

<a name="recomputeLayout"></a>

## recomputeLayout(refreshHint)
Called when an external widget has appeared and needs some of the space occupied
 by the mainview manager

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| refreshHint | <code>boolean</code> | true to refresh the editor, false if not |

<a name="isPanelVisible"></a>

## isPanelVisible(panelID) ⇒ <code>boolean</code>
Responsible to check if the panel is visible or not.
Returns true if visible else false.

**Kind**: global function  

| Param |
| --- |
| panelID | 

<a name="setPluginPanelWidth"></a>

## setPluginPanelWidth(width)
Programmatically sets the plugin panel content width to the given value in pixels.
The total toolbar width is adjusted to account for the plugin icons bar.
Width is clamped to respect panel minWidth and max size (75% of window).
No-op if no panel is currently visible.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| width | <code>number</code> | Desired content width in pixels |

<a name="addEscapeKeyEventHandler"></a>

## addEscapeKeyEventHandler(consumerName, eventHandler) ⇒ <code>boolean</code>
If any widgets related to the editor needs to handle the escape key event, add it here. returning true from the
registered handler will prevent primary escape key toggle panel behavior of phoenix. Note that returning true
will no stop the event bubbling, that has to be controlled with the event parameter forwarded to the handler.

**Kind**: global function  
**Returns**: <code>boolean</code> - true if added  

| Param | Type | Description |
| --- | --- | --- |
| consumerName | <code>string</code> | a unique name for your consumer |
| eventHandler | <code>function</code> | If the eventHandler returns true for this callback, the escape key event        will not lead to panel toggle default behavior. |

<a name="removeEscapeKeyEventHandler"></a>

## removeEscapeKeyEventHandler(consumerName) ⇒ <code>boolean</code>
Removing the escape key event consumer.

**Kind**: global function  
**Returns**: <code>boolean</code> - true if removed  

| Param | Type | Description |
| --- | --- | --- |
| consumerName | <code>string</code> | used to register the consumer. |

