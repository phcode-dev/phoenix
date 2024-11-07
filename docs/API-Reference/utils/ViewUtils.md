### Import :
```js
const ViewUtils = brackets.getModule("utils/ViewUtils")
```

<a name="addScrollerShadow"></a>

## addScrollerShadow(displayElement, scrollElement, showBottom)
Installs event handlers for updatng shadow background elements to indicate vertical scrolling.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| displayElement | <code>DOMElement</code> | the DOMElement that displays the shadow. Must fire  "contentChanged" events when the element is resized or repositioned. |
| scrollElement | <code>Object</code> | the object that is scrolled. Must fire "scroll" events  when the element is scrolled. If null, the displayElement is used. |
| showBottom | <code>boolean</code> | optionally show the bottom shadow |

<a name="removeScrollerShadow"></a>

## removeScrollerShadow(displayElement, scrollElement)
Remove scroller-shadow effect.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| displayElement | <code>DOMElement</code> | the DOMElement that displays the shadow |
| scrollElement | <code>Object</code> | the object that is scrolled |

<a name="toggleClass"></a>

## toggleClass($domElement, className, addClass)
Utility function to replace jQuery.toggleClass when used with the second argument, which needs to be a true boolean for jQuery

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| $domElement | <code>jQueryObject</code> | The jQueryObject to toggle the Class on |
| className | <code>string</code> | Class name or names (separated by spaces) to toggle |
| addClass | <code>boolean</code> | A truthy value to add the class and a falsy value to remove the class |

<a name="sidebarList"></a>

## sidebarList(scrollElement, selectedClassName)
Within a scrolling DOMElement, creates and positions a styled selection
div to align a single selected list item from a ul list element.

Assumptions:
- scrollerElement is a child of the #sidebar div
- ul list element fires a "selectionChanged" event after the
  selectedClassName is assigned to a new list item

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| scrollElement | <code>DOMElement</code> | A DOMElement containing a ul list element |
| selectedClassName | <code>string</code> | A CSS class name on at most one list item in the contained list |

<a name="getElementClipSize"></a>

## getElementClipSize($view, elementRect) ⇒ <code>Object</code>
Determine how much of an element rect is clipped in view.

**Kind**: global function  
**Returns**: <code>Object</code> - amount element rect is clipped in each direction  

| Param | Type | Description |
| --- | --- | --- |
| $view | <code>DOMElement</code> | A jQuery scrolling container |
| elementRect | <code>Object</code> | rectangle of element's default position/size |

<a name="scrollElementIntoView"></a>

## scrollElementIntoView($view, $element, scrollHorizontal)
Within a scrolling DOMElement, if necessary, scroll element into viewport.

To Perform the minimum amount of scrolling necessary, cases should be handled as follows:
- element already completely in view : no scrolling
- element above    viewport          : scroll view so element is at top
- element left of  viewport          : scroll view so element is at left
- element below    viewport          : scroll view so element is at bottom
- element right of viewport          : scroll view so element is at right

Assumptions:
- $view is a scrolling container

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| $view | <code>DOMElement</code> | A jQuery scrolling container |
| $element | <code>DOMElement</code> | A jQuery element |
| scrollHorizontal | <code>boolean</code> | whether to also scroll horizontally |

<a name="getFileEntryDisplay"></a>

## getFileEntryDisplay(entry) ⇒ <code>string</code>
HTML formats a file entry name  for display in the sidebar.

**Kind**: global function  
**Returns**: <code>string</code> - HTML formatted string  

| Param | Type | Description |
| --- | --- | --- |
| entry | <code>File</code> | File entry to display |

<a name="getDirNamesForDuplicateFiles"></a>

## getDirNamesForDuplicateFiles(files) ⇒ <code>Array.&lt;string&gt;</code>
Determine the minimum directory path to distinguish duplicate file names
for each file in list.

**Kind**: global function  
**Returns**: <code>Array.&lt;string&gt;</code> - directory paths to match list of files  

| Param | Type | Description |
| --- | --- | --- |
| files | <code>Array.&lt;File&gt;</code> | list of Files with the same filename |

<a name="hideMainToolBar"></a>

## hideMainToolBar()
Hides the main toolbar

**Kind**: global function  
<a name="showMainToolBar"></a>

## showMainToolBar()
Shows the main toolbar

**Kind**: global function  
