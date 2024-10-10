### Import :
```js
const WorkspaceManager = brackets.getModule("view/WorkspaceManager")
```

<a name="$windowContent"></a>

## $windowContent : <code>jQueryObject</code>
The ".content" vertical stack (editor + all header/footer panels)

**Kind**: global variable  
<a name="$editorHolder"></a>

## $editorHolder : <code>jQueryObject</code>
The "#editor-holder": has only one visible child, the current CodeMirror instance (or the no-editor placeholder)

**Kind**: global variable  
<a name="$mainToolbar"></a>

## $mainToolbar : <code>jQueryObject</code>
The "#main-toolbay": to the right side holding plugin panels and icons

**Kind**: global variable  
<a name="$mainPluginPanel"></a>

## $mainPluginPanel : <code>jQueryObject</code>
The "#main-plugin-panel": The plugin panel main container

**Kind**: global variable  
<a name="$pluginIconsBar"></a>

## $pluginIconsBar : <code>jQueryObject</code>
The "#plugin-icons-bar": holding all the plugin icons

**Kind**: global variable  
<a name="panelIDMap"></a>

## panelIDMap
A map from panel ID's to all reated panels

**Kind**: global variable  
<a name="windowResizing"></a>

## windowResizing : <code>boolean</code>
Have we already started listening for the end of the ongoing window resize?

**Kind**: global variable  
<a name="AppInit"></a>

## AppInit
Manages layout of panels surrounding the editor area, and size of the editor area (but not its contents).Updates panel sizes when the window is resized. Maintains the max resizing limits for panels, based oncurrently available window size.Events:`workspaceUpdateLayout` When workspace size changes for any reason (including panel show/hide panel resize, or the window resize).             The 2nd arg is the available workspace height.             The 3rd arg is a refreshHint flag for internal use (passed in to recomputeLayout)

**Kind**: global constant  
<a name="calcAvailableHeight"></a>

## calcAvailableHeight() ⇒ <code>number</code>
Calculates the available height for the full-size Editor (or the no-editor placeholder),accounting for the current size of all visible panels, toolbar, & status bar.

**Kind**: global function  
<a name="updateResizeLimits"></a>

## updateResizeLimits()
Updates panel resize limits to disallow making panels big enough to shrink editor area below 0

**Kind**: global function  
<a name="triggerUpdateLayout"></a>

## triggerUpdateLayout([refreshHint])
Calculates a new size for editor-holder and resizes it accordingly, then and dispatches the "workspaceUpdateLayout"event. (The editors within are resized by EditorManager, in response to that event).

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| [refreshHint] | <code>boolean</code> | true to force a complete refresh |

<a name="handleWindowResize"></a>

## handleWindowResize()
Trigger editor area resize whenever the window is resized

**Kind**: global function  
<a name="listenToResize"></a>

## listenToResize($panel)
Trigger editor area resize whenever the given panel is shown/hidden/resized

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| $panel | <code>jQueryObject</code> | the jquery object in which to attach event handlers |

<a name="createBottomPanel"></a>

## createBottomPanel(id, $panel, [minSize]) ⇒ <code>Panel</code>
Creates a new resizable panel beneath the editor area and above the status bar footer. Panel is initially invisible.The panel's size & visibility are automatically saved & restored as a view-state preference.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | Unique id for this panel. Use package-style naming, e.g. "myextension.feature.panelname" |
| $panel | <code>jQueryObject</code> | DOM content to use as the panel. Need not be in the document yet. Must have an id      attribute, for use as a preferences key. |
| [minSize] | <code>number</code> | Minimum height of panel in px. |

<a name="createPluginPanel"></a>

## createPluginPanel(id, $panel, [minSize], $toolbarIcon, [initialSize]) ⇒ <code>Panel</code>
Creates a new resizable plugin panel associated with the given toolbar icon. Panel is initially invisible.The panel's size & visibility are automatically saved & restored. Only one panel can be associated with atoolbar icon.

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
Called when an external widget has appeared and needs some of the space occupied by the mainview manager

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| refreshHint | <code>boolean</code> | true to refresh the editor, false if not |

<a name="addEscapeKeyEventHandler"></a>

## addEscapeKeyEventHandler(consumerName, eventHandler) ⇒ <code>boolean</code>
If any widgets related to the editor needs to handle the escape key event, add it here. returning true from theregistered handler will prevent primary escape key toggle panel behavior of phoenix. Note that returning truewill no stop the event bubbling, that has to be controlled with the event parameter forwarded to the handler.

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

