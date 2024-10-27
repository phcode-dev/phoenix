### Import :
```js
const ScrollTrackMarkers = brackets.getModule("search/ScrollTrackMarkers")
```

<a name="_"></a>

## \_
Manages tickmarks shown along the scrollbar track.
NOT yet intended for use by anyone other than the FindReplace module.
It is assumed that markers are always clear()ed when switching editors.

**Kind**: global variable  
<a name="getScrollbarTrackOffset"></a>

## getScrollbarTrackOffset() ⇒ <code>number</code>
Vertical space above and below the scrollbar.

**Kind**: global function  
**Returns**: <code>number</code> - amount Value in pixels  
<a name="setScrollbarTrackOffset"></a>

## setScrollbarTrackOffset(offset)
Sets how much vertical space there's above and below the scrollbar, which depends
on the OS and may also be affected by extensions

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| offset | <code>number</code> | Value in pixels |

<a name="clear"></a>

## clear()
Clear any markers in the editor's tickmark track, but leave it visible. Safe to call when
tickmark track is not visible also.

**Kind**: global function  
<a name="setVisible"></a>

## setVisible()
Add or remove the tickmark track from the editor's UI

**Kind**: global function  
<a name="addTickmarks"></a>

## addTickmarks(curEditor, posArray)
Add tickmarks to the editor's tickmark track, if it's visible

**Kind**: global function  

| Param | Type |
| --- | --- |
| curEditor | <code>Editor</code> | 
| posArray | <code>Object</code> | 

<a name="markCurrent"></a>

## markCurrent(index)
**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| index | <code>number</code> | Either -1, or an index into the array passed to addTickmarks() |

