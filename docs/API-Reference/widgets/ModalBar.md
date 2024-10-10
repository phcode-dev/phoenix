### Import :
```js
const ModalBar = brackets.getModule("widgets/ModalBar")
```

<a name="ModalBar"></a>

## ModalBar
**Kind**: global class  

* [ModalBar](#ModalBar)
    * [new ModalBar(template, autoClose, animate)](#new_ModalBar_new)
    * [._$root](#ModalBar+_$root)
    * [._autoClose](#ModalBar+_autoClose)
    * [.isLockedOpen](#ModalBar+isLockedOpen) : <code>function</code>
    * [.height()](#ModalBar+height) ⇒ <code>number</code>
    * [.prepareClose([restoreScrollPos])](#ModalBar+prepareClose)
    * [.close([restoreScrollPos], [animate], [_reason])](#ModalBar+close) ⇒ <code>$.Promise</code>
    * [._handleKeydown()](#ModalBar+_handleKeydown)
    * [._handleFocusChange()](#ModalBar+_handleFocusChange)
    * [.getRoot()](#ModalBar+getRoot) ⇒ <code>jQueryObject</code>

<a name="new_ModalBar_new"></a>

### new ModalBar(template, autoClose, animate)
Creates a modal bar whose contents are the given template.Dispatches one event:- close - When the bar is closed, either via close() or via autoClose. After this event, the    bar may remain visible and in the DOM while its closing animation is playing. However,    by the time "close" is fired, the bar has been "popped out" of the layout and the    editor scroll position has already been restored.    Second argument is the reason for closing (one of ModalBar.CLOSE_*).    Third argument is the Promise that close() will be returning.


| Param | Type | Description |
| --- | --- | --- |
| template | <code>string</code> | The HTML contents of the modal bar. |
| autoClose | <code>boolean</code> | If true, then close the dialog if the user hits Esc      or if the bar loses focus. |
| animate | <code>boolean</code> | If true (the default), animate the dialog closed, otherwise      close it immediately. |

<a name="ModalBar+_$root"></a>

### modalBar.\_$root
A jQuery object containing the root node of the ModalBar.

**Kind**: instance property of [<code>ModalBar</code>](#ModalBar)  
<a name="ModalBar+_autoClose"></a>

### modalBar.\_autoClose
True if this ModalBar is set to autoclose.

**Kind**: instance property of [<code>ModalBar</code>](#ModalBar)  
<a name="ModalBar+isLockedOpen"></a>

### modalBar.isLockedOpen : <code>function</code>
Allows client code to block autoClose from closing the ModalBar: if set, this function is called wheneverautoClose would normally close the ModalBar. Returning true prevents the close from occurring. Programmaticallycalling close() will still close the bar, however.

**Kind**: instance property of [<code>ModalBar</code>](#ModalBar)  
<a name="ModalBar+height"></a>

### modalBar.height() ⇒ <code>number</code>
**Kind**: instance method of [<code>ModalBar</code>](#ModalBar)  
**Returns**: <code>number</code> - Height of the modal bar in pixels, if open.  
<a name="ModalBar+prepareClose"></a>

### modalBar.prepareClose([restoreScrollPos])
Prepares the ModalBar for closing by popping it out of the main flow and resizing/rescrolling the Editor to maintain its current apparent code position. Useful ifyou want to do that as a separate operation from actually animating the ModalBarclosed and removing it (for example, if you need to switch full editors in between).If you don't call this explicitly, it will get called at the beginning of `close()`.

**Kind**: instance method of [<code>ModalBar</code>](#ModalBar)  

| Param | Type | Description |
| --- | --- | --- |
| [restoreScrollPos] | <code>boolean</code> | If true (the default), adjust the scroll position     of the editor to account for the ModalBar disappearing. If not set, the caller     should do it immediately on return of this function (before the animation completes),     because the editor will already have been resized. |

<a name="ModalBar+close"></a>

### modalBar.close([restoreScrollPos], [animate], [_reason]) ⇒ <code>$.Promise</code>
Closes the modal bar and returns focus to the active editor. Returns a promise that isresolved when the bar is fully closed and the container is removed from the DOM.

**Kind**: instance method of [<code>ModalBar</code>](#ModalBar)  
**Returns**: <code>$.Promise</code> - promise resolved when close is finished  

| Param | Type | Description |
| --- | --- | --- |
| [restoreScrollPos] | <code>boolean</code> | If true (the default), adjust the scroll position     of the editor to account for the ModalBar disappearing. If not set, the caller     should do it immediately on return of this function (before the animation completes),     because the editor will already have been resized. Note that this is ignored if     `prepareClose()` was already called (you need to pass the parameter to that     function if you call it first). |
| [animate] | <code>boolean</code> | If true (the default), animate the closing of the ModalBar,     otherwise close it immediately. |
| [_reason] | <code>string</code> | For internal use only. |

<a name="ModalBar+_handleKeydown"></a>

### modalBar.\_handleKeydown()
If autoClose is set, close the bar when Escape is pressed

**Kind**: instance method of [<code>ModalBar</code>](#ModalBar)  
<a name="ModalBar+_handleFocusChange"></a>

### modalBar.\_handleFocusChange()
If autoClose is set, detects when something other than the modal bar is getting focus anddismisses the modal bar. DOM nodes with "attached-to" jQuery metadata referencing an elementwithin the ModalBar are allowed to take focus without closing it.

**Kind**: instance method of [<code>ModalBar</code>](#ModalBar)  
<a name="ModalBar+getRoot"></a>

### modalBar.getRoot() ⇒ <code>jQueryObject</code>
**Kind**: instance method of [<code>ModalBar</code>](#ModalBar)  
**Returns**: <code>jQueryObject</code> - A jQuery object representing the root of the ModalBar.  
<a name="MainViewManager"></a>

## MainViewManager
A "modal bar" component. This is a lightweight replacement for modal dialogs thatappears at the top of the editor area for operations like Find and Quick Open.

**Kind**: global variable  
