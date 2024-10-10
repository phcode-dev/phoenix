### Import :
```js
const DropdownEventHandler = brackets.getModule("utils/DropdownEventHandler")
```

<a name="DropdownEventHandler"></a>

## DropdownEventHandler
**Kind**: global class  

* [DropdownEventHandler](#DropdownEventHandler)
    * [new DropdownEventHandler($list, selectionCallback, closeCallback, keyDownCallback)](#new_DropdownEventHandler_new)
    * [.open()](#DropdownEventHandler+open)
        * [._keydownHook(event)](#DropdownEventHandler+open.._keydownHook) ⇒ <code>boolean</code>
        * [.closeCallback()](#DropdownEventHandler+open..closeCallback)
    * [.close()](#DropdownEventHandler+close)
    * [._cleanup()](#DropdownEventHandler+_cleanup)
    * [._tryToSelect(index, direction, [noWrap])](#DropdownEventHandler+_tryToSelect)
    * [._itemsPerPage()](#DropdownEventHandler+_itemsPerPage) ⇒ <code>number</code>
    * [._selectionHandler()](#DropdownEventHandler+_selectionHandler)
    * [._clickHandler($item)](#DropdownEventHandler+_clickHandler)
    * [._registerMouseEvents()](#DropdownEventHandler+_registerMouseEvents)
    * [.reRegisterMouseHandlers($list)](#DropdownEventHandler+reRegisterMouseHandlers)

<a name="new_DropdownEventHandler_new"></a>

### new DropdownEventHandler($list, selectionCallback, closeCallback, keyDownCallback)
Object to handle events for a dropdown list.DropdownEventHandler handles these events:Mouse:- click       - execute selection callback and dismiss list- mouseover   - highlight item- mouseleave  - remove mouse highlightingKeyboard:- Enter       - execute selection callback and dismiss list- Esc         - dismiss list- Up/Down     - change selection- PageUp/Down - change selectionItems whose "a" has the .disabled class do not respond to selection.


| Param | Type | Description |
| --- | --- | --- |
| $list | <code>jQueryObject</code> | associated list object |
| selectionCallback | <code>function</code> | function called when list item is selected. |
| closeCallback | <code>function</code> | function called when list item is selected. |
| keyDownCallback | <code>function</code> | function called when list item is selected. |

<a name="DropdownEventHandler+open"></a>

### dropdownEventHandler.open()
Public open method

**Kind**: instance method of [<code>DropdownEventHandler</code>](#DropdownEventHandler)  

* [.open()](#DropdownEventHandler+open)
    * [._keydownHook(event)](#DropdownEventHandler+open.._keydownHook) ⇒ <code>boolean</code>
    * [.closeCallback()](#DropdownEventHandler+open..closeCallback)

<a name="DropdownEventHandler+open.._keydownHook"></a>

#### open.\_keydownHook(event) ⇒ <code>boolean</code>
Convert keydown events into hint list navigation actions.

**Kind**: inner method of [<code>open</code>](#DropdownEventHandler+open)  
**Returns**: <code>boolean</code> - true if key was handled, otherwise false.  

| Param | Type |
| --- | --- |
| event | <code>KeyboardEvent</code> | 

<a name="DropdownEventHandler+open..closeCallback"></a>

#### open.closeCallback()
PopUpManager callback

**Kind**: inner method of [<code>open</code>](#DropdownEventHandler+open)  
<a name="DropdownEventHandler+close"></a>

### dropdownEventHandler.close()
Public close method

**Kind**: instance method of [<code>DropdownEventHandler</code>](#DropdownEventHandler)  
<a name="DropdownEventHandler+_cleanup"></a>

### dropdownEventHandler.\_cleanup()
Cleanup

**Kind**: instance method of [<code>DropdownEventHandler</code>](#DropdownEventHandler)  
<a name="DropdownEventHandler+_tryToSelect"></a>

### dropdownEventHandler.\_tryToSelect(index, direction, [noWrap])
Try to select item at the given index. If it's disabled or a divider, keep trying by incrementingindex by 'direction' each time (wrapping around if needed).

**Kind**: instance method of [<code>DropdownEventHandler</code>](#DropdownEventHandler)  

| Param | Type | Description |
| --- | --- | --- |
| index | <code>number</code> | If out of bounds, index either wraps around to remain in range (e.g. -1 yields                      last item, length+1 yields 2nd item) or if noWrap set, clips instead (e.g. -1 yields                      first item, length+1 yields last item). |
| direction | <code>number</code> | Either +1 or -1 |
| [noWrap] | <code>boolean</code> | Clip out of range index values instead of wrapping. Default false (wrap). |

<a name="DropdownEventHandler+_itemsPerPage"></a>

### dropdownEventHandler.\_itemsPerPage() ⇒ <code>number</code>
**Kind**: instance method of [<code>DropdownEventHandler</code>](#DropdownEventHandler)  
**Returns**: <code>number</code> - The number of items per scroll page.  
<a name="DropdownEventHandler+_selectionHandler"></a>

### dropdownEventHandler.\_selectionHandler()
Call selectionCallback with selected index

**Kind**: instance method of [<code>DropdownEventHandler</code>](#DropdownEventHandler)  
<a name="DropdownEventHandler+_clickHandler"></a>

### dropdownEventHandler.\_clickHandler($item)
Call selectionCallback with selected item

**Kind**: instance method of [<code>DropdownEventHandler</code>](#DropdownEventHandler)  

| Param | Type |
| --- | --- |
| $item | <code>jQueryObject</code> | 

<a name="DropdownEventHandler+_registerMouseEvents"></a>

### dropdownEventHandler.\_registerMouseEvents()
Register mouse event handlers

**Kind**: instance method of [<code>DropdownEventHandler</code>](#DropdownEventHandler)  
<a name="DropdownEventHandler+reRegisterMouseHandlers"></a>

### dropdownEventHandler.reRegisterMouseHandlers($list)
Re-register mouse event handlers

**Kind**: instance method of [<code>DropdownEventHandler</code>](#DropdownEventHandler)  

| Param | Type | Description |
| --- | --- | --- |
| $list | <code>jQueryObject</code> | newly updated list object |

