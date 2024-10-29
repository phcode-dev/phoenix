### Import :
```js
const ViewCommandHandlers = brackets.getModule("view/ViewCommandHandlers")
```

<a name="Commands"></a>

## Commands
The ViewCommandHandlers object dispatches the following event(s):
   - fontSizeChange -- Triggered when the font size is changed via the
     Increase Font Size, Decrease Font Size, or Restore Font Size commands.
     The 2nd arg to the listener is the amount of the change. The 3rd arg
     is a string containing the new font size after applying the change.

**Kind**: global variable  
<a name="validFontSizeRegExpStr"></a>

## validFontSizeRegExpStr
Font sizes should be validated by this regexp

**Kind**: global variable  
<a name="setFontSize"></a>

## setFontSize(fontSize)
Font size setter to set the font size for the document editor

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| fontSize | <code>string</code> | The font size with size unit as 'px' or 'em' |

<a name="getFontSize"></a>

## getFontSize() ⇒ <code>string</code>
Font size getter to get the current font size for the document editor

**Kind**: global function  
**Returns**: <code>string</code> - Font size with size unit as 'px' or 'em'  
<a name="setFontFamily"></a>

## setFontFamily(fontFamily)
Font family setter to set the font family for the document editor

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| fontFamily | <code>string</code> | The font family to be set.  It can be a string with multiple comma separated fonts |

<a name="getFontFamily"></a>

## getFontFamily() ⇒ <code>string</code>
Font family getter to get the currently configured font family for the document editor

**Kind**: global function  
**Returns**: <code>string</code> - The font family for the document editor  
<a name="restoreFontSize"></a>

## restoreFontSize()
Restores the font size using the saved style and migrates the old fontSizeAdjustment
view state to the new fontSize, when required

**Kind**: global function  
<a name="restoreFonts"></a>

## restoreFonts()
Restores the font size and font family back to factory settings.

**Kind**: global function  
