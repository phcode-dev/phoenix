### Import :
```js
const WorkingSetView = brackets.getModule("project/WorkingSetView")
```

<a name="$workingFilesContainer"></a>

## $workingFilesContainer : <code>jQuery</code>
#working-set-list-container

**Kind**: global variable  
<a name="LEFT_BUTTON"></a>

## LEFT\_BUTTON : <code>enum</code>
Constants for event.which values

**Kind**: global enum  
<a name="NOMANSLAND"></a>

## NOMANSLAND : <code>enum</code>
Constants for hitTest.where

**Kind**: global enum  
<a name="_DRAG_MOVE_DETECTION_START"></a>

## \_DRAG\_MOVE\_DETECTION\_START
Drag an item has to move 3px before dragging starts

**Kind**: global constant  
<a name="refresh"></a>

## refresh()
Refreshes all Pane View List Views

**Kind**: global function  
<a name="syncSelectionIndicator"></a>

## syncSelectionIndicator()
Synchronizes the selection indicator for all views

**Kind**: global function  
<a name="createWorkingSetViewForPane"></a>

## createWorkingSetViewForPane($container, paneId)
Creates a new WorkingSetView object for the specified pane

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| $container | <code>jQuery</code> | the WorkingSetView's DOM parent node |
| paneId | <code>string</code> | the id of the pane the view is being created for |

<a name="addIconProvider"></a>

## addIconProvider(callback, [priority])
Adds an icon provider. The callback is invoked before each working set item is created, and canreturn content to prepend to the item if it supports the icon.

**Kind**: global function  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| callback | <code>function</code> |  | Return a string representing the HTML, a jQuery object or DOM node, or undefined. If undefined, nothing is prepended to the list item and the default or an available icon will be used. |
| [priority] | <code>number</code> | <code>0</code> | optional priority. 0 being lowest. The icons with the highest priority wins if there are multiple callback providers attached. icon providers of the same priority first valid response wins. |

<a name="addClassProvider"></a>

## addClassProvider(callback, [priority])
Adds a CSS class provider, invoked before each working set item is created or updated. When calledto update an existing item, all previously applied classes have been cleared.

**Kind**: global function  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| callback | <code>function</code> |  | Return a string containing space-separated CSS class(es) to add, or undefined to leave CSS unchanged. |
| [priority] | <code>number</code> | <code>0</code> | optional priority. 0 being lowest. The class with the highest priority wins if there are multiple callback classes attached. class providers of the same priority will be appended. |

<a name="getContext"></a>

## getContext()
Gets the filesystem object for the current context in the working set.

**Kind**: global function  
