### Import :
```js
const ColorUtils = brackets.getModule("utils/ColorUtils")
```

<a name="@type"></a>

## @type : <code>Array</code>
Sorted array of all the color names in the CSS Color Module Level 3 (http://www.w3.org/TR/css3-color/)
and "rebeccapurple" from CSS Color Module Level 4

**Kind**: global constant  
<a name="@type"></a>

## @type : <code>RegExp</code>
Regular expression that matches reasonably well-formed colors in hex format (3 or 6 digits),
rgb()/rgba() function format, hsl()/hsla() function format, 0x notation format
or color name format according to CSS Color Module Level 3 (http://www.w3.org/TR/css3-color/)
or "rebeccapurple" from CSS Color Module Level 4.

**Kind**: global constant  
<a name="formatColorHint"></a>

## formatColorHint($hintObj, color) ⇒ <code>jQuery</code>
Adds a color swatch to code hints where this is supported.

**Kind**: global function  
**Returns**: <code>jQuery</code> - jQuery object with the correct class and/or style applied  

| Param | Type | Description |
| --- | --- | --- |
| $hintObj | <code>jQuery</code> | list item where the swatch will be in |
| color | <code>string</code> | color the swatch should have, or null to add extra left margin to      align with the other hints |

