### Import :
```js
const Resizer = brackets.getModule("utils/Resizer")
```

<a name="DIRECTION_VERTICAL"></a>

## DIRECTION\_VERTICAL : <code>string</code>
Represents the vertical direction.

**Kind**: global variable  
<a name="DIRECTION_HORIZONTAL"></a>

## DIRECTION\_HORIZONTAL : <code>string</code>
Represents the horizontal direction.

**Kind**: global variable  
<a name="POSITION_TOP"></a>

## POSITION\_TOP : <code>string</code>
Indicates the top position.

**Kind**: global variable  
<a name="POSITION_BOTTOM"></a>

## POSITION\_BOTTOM : <code>string</code>
Indicates the bottom position.

**Kind**: global variable  
<a name="POSITION_LEFT"></a>

## POSITION\_LEFT : <code>string</code>
Indicates the left position.

**Kind**: global variable  
<a name="POSITION_RIGHT"></a>

## POSITION\_RIGHT : <code>string</code>
Indicates the right position.

**Kind**: global variable  
<a name="PREFS_PURE_CODE"></a>

## PREFS\_PURE\_CODE : <code>string</code>
Preference for a distraction-free mode.

**Kind**: global variable  
<a name="EVENT_PANEL_COLLAPSED"></a>

## EVENT\_PANEL\_COLLAPSED : <code>string</code>
Event triggered when a panel is collapsed.

**Kind**: global constant  
<a name="EVENT_PANEL_EXPANDED"></a>

## EVENT\_PANEL\_EXPANDED : <code>string</code>
Event triggered when a panel is expanded.

**Kind**: global constant  
<a name="EVENT_PANEL_RESIZE_START"></a>

## EVENT\_PANEL\_RESIZE\_START : <code>string</code>
Event triggered at the start of panel resizing.

**Kind**: global constant  
<a name="EVENT_PANEL_RESIZE_UPDATE"></a>

## EVENT\_PANEL\_RESIZE\_UPDATE : <code>string</code>
Event triggered during panel resizing updates.

**Kind**: global constant  
<a name="EVENT_PANEL_RESIZE_END"></a>

## EVENT\_PANEL\_RESIZE\_END : <code>string</code>
Event triggered at the end of panel resizing.

**Kind**: global constant  
<a name="show"></a>

## show(element)
Shows a resizable element.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| element | <code>DOMNode</code> | Html element to show if possible |

<a name="hide"></a>

## hide(element)
Hides a resizable element.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| element | <code>DOMNode</code> | Html element to hide if possible |

<a name="toggle"></a>

## toggle(element)
Changes the visibility state of a resizable element. The toggle
functionality is added when an element is made resizable.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| element | <code>DOMNode</code> | Html element to toggle |

<a name="removeSizable"></a>

## removeSizable(element)
Removes the resizability of an element if it's resizable

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| element | <code>DOMNode</code> | Html element in which to remove sizing |

<a name="resyncSizer"></a>

## resyncSizer(element)
Updates the sizing div by resyncing to the sizing edge of the element
Call this method after manually changing the size of the element

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| element | <code>DOMNode</code> | Html element whose sizer should be resynchronized |

<a name="isVisible"></a>

## isVisible(element) ⇒ <code>boolean</code>
Returns the visibility state of a resizable element.

**Kind**: global function  
**Returns**: <code>boolean</code> - true if element is visible, false if it is not visible  

| Param | Type | Description |
| --- | --- | --- |
| element | <code>DOMNode</code> | Html element to toggle |

<a name="makeResizable"></a>

## makeResizable(element, direction, position, minSize, collapsible, forceLeft, createdByWorkspaceManager, usePercentages, forceRight, _attachToParent, [initialSize])
Adds resizing and (optionally) expand/collapse capabilities to a given html element. The element's size
& visibility are automatically saved & restored as a view-state preference.

Resizing can be configured in two directions:
 - Vertical ("vert"): Resizes the height of the element
 - Horizontal ("horz"): Resizes the width of the element

Resizer handlers can be positioned on the element at:
 - Top ("top") or bottom ("bottom") for vertical resizing
 - Left ("left") or right ("right") for horizontal resizing

A resizable element triggers the following events while resizing:
 - panelResizeStart: When the resize starts. Passed the new size.
 - panelResizeUpdate: When the resize gets updated. Passed the new size.
 - panelResizeEnd: When the resize ends. Passed the final size.
 - panelCollapsed: When the panel gets collapsed (or hidden). Passed the last size
     before collapse. May occur without any resize events.
 - panelExpanded: When the panel gets expanded (or shown). Passed the initial size.
     May occur without any resize events.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| element | <code>DOMNode</code> | DOM element which should be made resizable. Must have an id attribute, for                          use as a preferences key. |
| direction | <code>string</code> | Direction of the resize action: one of the DIRECTION_* constants. |
| position | <code>string</code> | Which side of the element can be dragged: one of the POSITION_* constants                          (TOP/BOTTOM for vertical resizing or LEFT/RIGHT for horizontal). |
| minSize | <code>number</code> | Minimum size (width or height) of the element's outer dimensions, including                          border & padding. Defaults to DEFAULT_MIN_SIZE. |
| collapsible | <code>boolean</code> | Indicates the panel is collapsible on double click on the                          resizer. Defaults to false. |
| forceLeft | <code>string</code> | CSS selector indicating element whose 'left' should be locked to the                          the resizable element's size (useful for siblings laid out to the right of                          the element). Must lie in element's parent's subtree. |
| createdByWorkspaceManager | <code>boolean</code> | For internal use only |
| usePercentages | <code>boolean</code> | Maintain the size of the element as a percentage of its parent                          the default is to maintain the size of the element in pixels |
| forceRight | <code>string</code> | CSS selector indicating element whose 'right' should be locked to the                          the resizable element's size (useful for siblings laid out to the left of                          the element). Must lie in element's parent's subtree. |
| _attachToParent | <code>boolean</code> | Attaches the resizer element to parent of the element rather than                          to element itself. Attach the resizer to the parent *ONLY* if element has the                          same offset as parent otherwise the resizer will be incorrectly positioned.                          FOR INTERNAL USE ONLY |
| [initialSize] | <code>number</code> | Optional Initial size of panel in px. If not given, panel will use minsize      or current size. |

