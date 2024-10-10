### Import :
```js
const SidebarView = brackets.getModule("project/SidebarView")
```

<a name="AppInit"></a>

## AppInit
The view that controls the showing and hiding of the sidebar.Although the sidebar view doesn't dispatch any events directly, it is aresizable element (../utils/Resizer.js), which means it can dispatch Resizerevents.  For example, if you want to listen for the sidebar showingor hiding itself, set up listeners for the corresponding Resizer events,panelCollapsed and panelExpanded:     $("#sidebar").on("panelCollapsed", ...);     $("#sidebar").on("panelExpanded", ...);

**Kind**: global variable  
<a name="_cmdSplitNone"></a>

## \_cmdSplitNone
Register Command Handlers

**Kind**: global variable  
<a name="toggle"></a>

## toggle()
Toggle sidebar visibility.

**Kind**: global function  
<a name="show"></a>

## show()
Show the sidebar.

**Kind**: global function  
<a name="hide"></a>

## hide()
Hide the sidebar.

**Kind**: global function  
<a name="isVisible"></a>

## isVisible() ⇒ <code>boolean</code>
Returns the visibility state of the sidebar.

**Kind**: global function  
**Returns**: <code>boolean</code> - true if element is visible, false if it is not visible  
