### Import :
```js
const KeyboardOverlayMode = brackets.getModule("command/KeyboardOverlayMode")
```

<a name="EditorManager"></a>

## EditorManager
This handles the overlay mode

**Kind**: global constant  
<a name="startOverlayMode"></a>

## startOverlayMode()
Responsible to start the overlay mode

**Kind**: global function  
<a name="exitOverlayMode"></a>

## exitOverlayMode()
Responsible to exit the overlay mode.
restores focus to previously active pane

**Kind**: global function  
<a name="processOverlayKeyboardEvent"></a>

## processOverlayKeyboardEvent(event)
Handles the keyboard navigation in overlay mode
Process the arrow keys to move between panes, Enter to select a pane, and Escape to exit overlay mode

**Kind**: global function  

| Param | Type |
| --- | --- |
| event | <code>KeyboardEvent</code> | 

<a name="isInOverlayMode"></a>

## isInOverlayMode() ⇒ <code>boolean</code>
to check whether in overlay mode or not

**Kind**: global function  
**Returns**: <code>boolean</code> - returns true if in overlay mode otherwise false  
