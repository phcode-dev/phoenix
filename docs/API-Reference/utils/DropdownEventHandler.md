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
    * [.close()](#DropdownEventHandler+close)
    * [.reRegisterMouseHandlers($list)](#DropdownEventHandler+reRegisterMouseHandlers)

<a name="new_DropdownEventHandler_new"></a>

### new DropdownEventHandler($list, selectionCallback, closeCallback, keyDownCallback)
Object to handle events for a dropdown list.

DropdownEventHandler handles these events:

Mouse:
- click       - execute selection callback and dismiss list
- mouseover   - highlight item
- mouseleave  - remove mouse highlighting

Keyboard:
- Enter       - execute selection callback and dismiss list
- Esc         - dismiss list
- Up/Down     - change selection
- PageUp/Down - change selection

Items whose "a" has the .disabled class do not respond to selection.


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
<a name="DropdownEventHandler+close"></a>

### dropdownEventHandler.close()
Public close method

**Kind**: instance method of [<code>DropdownEventHandler</code>](#DropdownEventHandler)  
<a name="DropdownEventHandler+reRegisterMouseHandlers"></a>

### dropdownEventHandler.reRegisterMouseHandlers($list)
Re-register mouse event handlers

**Kind**: instance method of [<code>DropdownEventHandler</code>](#DropdownEventHandler)  

| Param | Type | Description |
| --- | --- | --- |
| $list | <code>jQueryObject</code> | newly updated list object |

