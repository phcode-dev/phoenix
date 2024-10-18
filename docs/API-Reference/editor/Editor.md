### Import :
```js
const Editor = brackets.getModule("editor/Editor")
```

<a name="Editor"></a>

## Editor
**Kind**: global class  

* [Editor](#Editor)
    * [new Editor(document, makeMasterEditor, container, [range], options)](#new_Editor_new)
    * _instance_
        * [.addInlineWidget](#Editor+addInlineWidget) ⇒ <code>$.Promise</code>
        * [.removeAllInlineWidgets](#Editor+removeAllInlineWidgets)
        * [.removeInlineWidget](#Editor+removeInlineWidget) ⇒ <code>$.Promise</code>
        * [.removeAllInlineWidgetsForLine](#Editor+removeAllInlineWidgetsForLine)
        * [.getAllInlineWidgetsForLine](#Editor+getAllInlineWidgetsForLine)
        * [.getInlineWidgets](#Editor+getInlineWidgets) ⇒ <code>Object</code>
        * [.getFocusedInlineWidget](#Editor+getFocusedInlineWidget) ⇒ <code>InlineWidget</code>
        * [.setInlineWidgetHeight](#Editor+setInlineWidgetHeight)
        * [.document](#Editor+document) : <code>Document</code>
        * [._lastEditorWidth](#Editor+_lastEditorWidth) : <code>number</code>
        * [._duringSync](#Editor+_duringSync) : <code>boolean</code>
        * [.getInlineWidgetsBelowCursor()](#Editor+getInlineWidgetsBelowCursor) ⇒ <code>boolean</code>
        * [.canConsumeEscapeKeyEvent()](#Editor+canConsumeEscapeKeyEvent)
        * [.destroy()](#Editor+destroy)
        * [._getModeFromDocument()](#Editor+_getModeFromDocument) ⇒ <code>string</code>
        * [.selectAllNoScroll()](#Editor+selectAllNoScroll)
        * [.isTextSubset()](#Editor+isTextSubset) ⇒ <code>boolean</code>
        * [._updateHiddenLines()](#Editor+_updateHiddenLines)
        * [._resetText(text)](#Editor+_resetText)
        * [.getFile()](#Editor+getFile) ⇒ <code>File</code>
        * [.getCursorPos([expandTabs], [which])](#Editor+getCursorPos) ⇒ <code>Object</code>
        * [.getEndingCursorPos([expandTabs])](#Editor+getEndingCursorPos) ⇒ <code>Object</code>
        * [.getColOffset(pos)](#Editor+getColOffset) ⇒ <code>number</code>
        * [.getCharIndexForColumn(lineNum, column)](#Editor+getCharIndexForColumn) ⇒ <code>number</code>
        * [.setCursorPos(line, ch, [center], [expandTabs])](#Editor+setCursorPos)
        * [.setSize(width, height)](#Editor+setSize)
        * [.getViewport()](#Editor+getViewport) ⇒ <code>Object</code>
        * [.centerOnCursor(centerOptions)](#Editor+centerOnCursor)
        * [.indexFromPos(cursorPos)](#Editor+indexFromPos) ⇒ <code>number</code>
        * [.posFromIndex(index)](#Editor+posFromIndex) ⇒ <code>Object</code>
        * [.posWithinRange(pos, start, end, endInclusive)](#Editor+posWithinRange)
        * [.hasSelection()](#Editor+hasSelection) ⇒ <code>boolean</code>
        * [.getSelection()](#Editor+getSelection) ⇒ <code>Object</code>
        * [.getSelections()](#Editor+getSelections) ⇒ <code>Object</code>
        * [.hasMultipleCursors()](#Editor+hasMultipleCursors) ⇒ <code>boolean</code>
        * [.convertToLineSelections(selections, options)](#Editor+convertToLineSelections) ⇒ <code>Object</code>
        * [.getSelectedText([allSelections])](#Editor+getSelectedText) ⇒ <code>string</code>
        * [.coordsChar(coordinates, [mode])](#Editor+coordsChar) ⇒ <code>Object</code>
        * [.charCoords(pos, [mode])](#Editor+charCoords) ⇒ <code>Object</code>
        * [.getToken([cursor], [precise])](#Editor+getToken) ⇒ <code>Object</code>
        * [.getCharacterAtPosition(pos)](#Editor+getCharacterAtPosition) ⇒ <code>string</code> \| <code>null</code>
        * [.getPrevCharacterAtPosition(pos)](#Editor+getPrevCharacterAtPosition) ⇒ <code>string</code> \| <code>null</code>
        * [.getNextToken([cursor], [skipWhitespace], [precise])](#Editor+getNextToken) ⇒ <code>Object</code>
        * [.getPreviousToken([cursor], [skipWhitespace], [precise])](#Editor+getPreviousToken) ⇒ <code>Object</code>
        * [.operation(execFn)](#Editor+operation) ⇒ <code>\*</code>
        * [.markToken(markType, cursor, [options])](#Editor+markToken) ⇒ <code>Object</code>
        * [.setBookmark(markType, [cursorPos], [options])](#Editor+setBookmark) ⇒ <code>Object</code>
        * [.findMarks(cursorFrom, cursorTo, [markType])](#Editor+findMarks) ⇒ <code>Array.&lt;TextMarker&gt;</code>
        * [.findMarksAt(cursorPos, [markType])](#Editor+findMarksAt) ⇒ <code>Array.&lt;TextMarker&gt;</code>
        * [.getMarksAfter(position, markType)](#Editor+getMarksAfter) ⇒ <code>Array.&lt;TextMarker&gt;</code>
        * [.getMarksBefore(position, markType)](#Editor+getMarksBefore) ⇒ <code>Array.&lt;TextMarker&gt;</code>
        * [.getAllMarks([markType])](#Editor+getAllMarks) ⇒ <code>Array.&lt;TextMarker&gt;</code>
        * [.clearAllMarks([markType])](#Editor+clearAllMarks)
        * [.isSamePosition(position1, position2)](#Editor+isSamePosition) ⇒ <code>boolean</code>
        * [.getHistory()](#Editor+getHistory) ⇒ <code>Array</code>
        * [.setHistory()](#Editor+setHistory)
        * [.createHistoryRestorePoint()](#Editor+createHistoryRestorePoint)
        * [.setSelection(start, [end], [center], [centerOptions], [origin])](#Editor+setSelection)
        * [.replaceSelection(replacement, [select])](#Editor+replaceSelection)
        * [.replaceSelections(replacement, [select])](#Editor+replaceSelections)
        * [.replaceRange(replacement, from, [to], origin)](#Editor+replaceRange)
        * [.replaceMultipleRanges(ranges, [origin])](#Editor+replaceMultipleRanges)
        * [.clearSelection()](#Editor+clearSelection)
        * [.setSelections(selections, center, centerOptions, origin)](#Editor+setSelections)
        * [.toggleOverwrite(start)](#Editor+toggleOverwrite)
        * [.selectWordAt(pos)](#Editor+selectWordAt)
        * [.getWordAt(pos)](#Editor+getWordAt) ⇒ <code>Object</code>
        * [.getNumberAt(pos, maxDigits)](#Editor+getNumberAt) ⇒ <code>Object</code>
        * [.lineCount()](#Editor+lineCount) ⇒ <code>number</code>
        * [.isLineVisible(zero-based)](#Editor+isLineVisible) ⇒ <code>boolean</code>
        * [.getFirstVisibleLine()](#Editor+getFirstVisibleLine) ⇒ <code>number</code>
        * [.getLastVisibleLine()](#Editor+getLastVisibleLine) ⇒ <code>number</code>
        * [.totalHeight()](#Editor+totalHeight) ⇒ <code>number</code>
        * [.getScrollerElement()](#Editor+getScrollerElement) ⇒ <code>HTMLDivElement</code>
        * [.getRootElement()](#Editor+getRootElement) ⇒ <code>HTMLDivElement</code>
        * [._getLineSpaceElement()](#Editor+_getLineSpaceElement) ⇒ <code>HTMLDivElement</code>
        * [.getScrollPos()](#Editor+getScrollPos) ⇒ <code>Object</code>
        * [.adjustScrollPos(scrollPos, heightDelta)](#Editor+adjustScrollPos)
        * [.setScrollPos(x, y)](#Editor+setScrollPos)
        * [.displayErrorMessageAtCursor(errorMsg)](#Editor+displayErrorMessageAtCursor)
        * [.getVirtualScrollAreaTop()](#Editor+getVirtualScrollAreaTop) ⇒ <code>number</code>
        * [.focus()](#Editor+focus)
        * [.hasFocus()](#Editor+hasFocus)
        * [.restoreViewState(viewState)](#Editor+restoreViewState)
        * [.refresh([handleResize])](#Editor+refresh)
        * [.refreshAll([handleResize])](#Editor+refreshAll)
        * [.undo()](#Editor+undo)
        * [.redo()](#Editor+redo)
        * [.notifyVisibilityChange(show, refresh)](#Editor+notifyVisibilityChange)
        * [.setVisible(show, refresh)](#Editor+setVisible)
        * [.isFullyVisible()](#Editor+isFullyVisible)
        * [.getModeForRange(start, end, [knownMixed])](#Editor+getModeForRange) ⇒ <code>Object</code> \| <code>string</code>
        * [.getModeForSelection(selection)](#Editor+getModeForSelection) ⇒ <code>Object</code> \| <code>string</code>
        * [.getLanguageForSelection()](#Editor+getLanguageForSelection) ⇒ <code>Language</code>
        * [.getLanguageForPosition()](#Editor+getLanguageForPosition) ⇒ <code>Language</code>
        * [.getModeForDocument()](#Editor+getModeForDocument) ⇒ <code>Object</code> \| <code>String</code>
        * [.updateLayout([forceRefresh])](#Editor+updateLayout)
        * [.setGutterMarker(lineNumber, gutterName, marker)](#Editor+setGutterMarker)
        * [.getGutterMarker(lineNumber, gutterName)](#Editor+getGutterMarker)
        * [.clearGutterMarker(lineNumber, gutterName)](#Editor+clearGutterMarker)
        * [.clearGutter(gutterName)](#Editor+clearGutter)
    * _static_
        * [.getMarkOptionUnderlineError](#Editor.getMarkOptionUnderlineError)
        * [.EVENT_BEFORE_CHANGE](#Editor.EVENT_BEFORE_CHANGE)
        * [.getRegisteredGutters()](#Editor.getRegisteredGutters) ⇒ <code>Object</code>
        * [.isGutterRegistered(gutterName)](#Editor.isGutterRegistered) ⇒ <code>boolean</code>
        * [.registerGutter(name, priority, [languageIds])](#Editor.registerGutter)
        * [.unregisterGutter(name)](#Editor.unregisterGutter)
        * [.setUseTabChar(value, [fullPath])](#Editor.setUseTabChar) ⇒ <code>boolean</code>
        * [.getUseTabChar([fullPath])](#Editor.getUseTabChar) ⇒ <code>boolean</code>
        * [.setTabSize(value, [fullPath])](#Editor.setTabSize) ⇒ <code>boolean</code>
        * [.getTabSize([fullPath])](#Editor.getTabSize) ⇒ <code>number</code>
        * [.getAutoTabUnits(fullPath)](#Editor.getAutoTabUnits) ⇒ <code>number</code> \| <code>\*</code>
        * [.setAutoTabSpaces(value, [fullPath])](#Editor.setAutoTabSpaces) ⇒ <code>boolean</code>
        * [.getAutoTabSpaces([fullPath])](#Editor.getAutoTabSpaces) ⇒ <code>number</code>
        * [.setSpaceUnits(value, [fullPath])](#Editor.setSpaceUnits) ⇒ <code>boolean</code>
        * [.getSpaceUnits([fullPath])](#Editor.getSpaceUnits) ⇒ <code>number</code>
        * [.setCloseBrackets(value, [fullPath])](#Editor.setCloseBrackets) ⇒ <code>boolean</code>
        * [.getCloseBrackets([fullPath])](#Editor.getCloseBrackets) ⇒ <code>boolean</code>
        * [.setShowLineNumbers(value, [fullPath])](#Editor.setShowLineNumbers) ⇒ <code>boolean</code>
        * [.getShowLineNumbers([fullPath])](#Editor.getShowLineNumbers) ⇒ <code>boolean</code>
        * [.setShowActiveLine(value, [fullPath])](#Editor.setShowActiveLine) ⇒ <code>boolean</code>
        * [.getShowActiveLine([fullPath])](#Editor.getShowActiveLine) ⇒ <code>boolean</code>
        * [.setWordWrap(value, [fullPath])](#Editor.setWordWrap) ⇒ <code>boolean</code>
        * [.getWordWrap([fullPath])](#Editor.getWordWrap) ⇒ <code>boolean</code>
        * [.setIndentLineComment(value, [fullPath])](#Editor.setIndentLineComment) ⇒ <code>boolean</code>
        * [.getIndentLineComment([fullPath])](#Editor.getIndentLineComment) ⇒ <code>boolean</code>
        * [.forEveryEditor(callback, [fullPath])](#Editor.forEveryEditor)

<a name="new_Editor_new"></a>

### new Editor(document, makeMasterEditor, container, [range], options)
Creates a new CodeMirror editor instance bound to the given Document. The Document need not have
a "master" Editor realized yet, even if makeMasterEditor is false; in that case, the first time
an edit occurs we will automatically ask EditorManager to create a "master" editor to render the
Document modifiable.

ALWAYS call destroy() when you are done with an Editor - otherwise it will leak a Document ref.


| Param | Type | Description |
| --- | --- | --- |
| document | <code>Document</code> |  |
| makeMasterEditor | <code>boolean</code> | If true, this Editor will set itself as the (secret) "master"          Editor for the Document. If false, this Editor will attach to the Document as a "slave"/          secondary editor. |
| container | <code>jQueryObject</code> \| <code>DomNode</code> | Container to add the editor to. |
| [range] | <code>Object</code> | If specified, range of lines within the document          to display in this editor. Inclusive. |
| options | <code>Object</code> | If specified, contains editor options that can be passed to CodeMirror |

<a name="Editor+addInlineWidget"></a>

### editor.addInlineWidget ⇒ <code>$.Promise</code>
Adds an inline widget below the given line. If any inline widget was already open for that
line, it is closed without warning.

**Kind**: instance property of [<code>Editor</code>](#Editor)  
**Returns**: <code>$.Promise</code> - A promise object that is resolved when the widget has been added (but might
    still be animating open). Never rejected.  

| Param | Type | Description |
| --- | --- | --- |
| pos | <code>Object</code> | Position in text to anchor the inline. |
| inlineWidget | <code>InlineWidget</code> | The widget to add. |
| [scrollLineIntoView] | <code>boolean</code> | Scrolls the associated line into view. Default true. |

<a name="Editor+removeAllInlineWidgets"></a>

### editor.removeAllInlineWidgets
Removes all inline widgets

**Kind**: instance property of [<code>Editor</code>](#Editor)  
<a name="Editor+removeInlineWidget"></a>

### editor.removeInlineWidget ⇒ <code>$.Promise</code>
Removes the given inline widget.

**Kind**: instance property of [<code>Editor</code>](#Editor)  
**Returns**: <code>$.Promise</code> - A promise that is resolved when the inline widget is fully closed and removed from the DOM.  

| Param | Type | Description |
| --- | --- | --- |
| inlineWidget | <code>number</code> | The widget to remove. |

<a name="Editor+removeAllInlineWidgetsForLine"></a>

### editor.removeAllInlineWidgetsForLine
Removes all inline widgets for a given line

**Kind**: instance property of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| lineNum | <code>number</code> | The line number to modify |

<a name="Editor+getAllInlineWidgetsForLine"></a>

### editor.getAllInlineWidgetsForLine
****** Update actual public API doc in Editor.js *****
Gets all inline widgets for a given line

**Kind**: instance property of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| lineNum | <code>number</code> | The line number to modify |

<a name="Editor+getInlineWidgets"></a>

### editor.getInlineWidgets ⇒ <code>Object</code>
Returns a list of all inline widgets currently open in this editor. Each entry contains the
inline's id, and the data parameter that was passed to addInlineWidget().

**Kind**: instance property of [<code>Editor</code>](#Editor)  
<a name="Editor+getFocusedInlineWidget"></a>

### editor.getFocusedInlineWidget ⇒ <code>InlineWidget</code>
Returns the currently focused inline widget, if any.

**Kind**: instance property of [<code>Editor</code>](#Editor)  
<a name="Editor+setInlineWidgetHeight"></a>

### editor.setInlineWidgetHeight
Sets the height of an inline widget in this editor.

**Kind**: instance property of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| inlineWidget | <code>InlineWidget</code> | The widget whose height should be set. |
| height | <code>number</code> | The height of the widget. |
| [ensureVisible] | <code>boolean</code> | Whether to scroll the entire widget into view. Default false. |

<a name="Editor+document"></a>

### editor.document : <code>Document</code>
The Document we're bound to

**Kind**: instance property of [<code>Editor</code>](#Editor)  
<a name="Editor+_lastEditorWidth"></a>

### editor.\_lastEditorWidth : <code>number</code>
The Editor's last known width.
Used in conjunction with updateLayout to recompute the layout
if the parent container changes its size since our last layout update.

**Kind**: instance property of [<code>Editor</code>](#Editor)  
<a name="Editor+_duringSync"></a>

### editor.\_duringSync : <code>boolean</code>
If true, we're in the middle of syncing to/from the Document. Used to ignore spurious change
events caused by us (vs. change events caused by others, which we need to pay attention to).

**Kind**: instance property of [<code>Editor</code>](#Editor)  
<a name="Editor+getInlineWidgetsBelowCursor"></a>

### editor.getInlineWidgetsBelowCursor() ⇒ <code>boolean</code>
Gets the inline widgets below the current cursor position or null.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
<a name="Editor+canConsumeEscapeKeyEvent"></a>

### editor.canConsumeEscapeKeyEvent()
returns true if the editor can do something an escape key event. Eg. Disable multi cursor escape

**Kind**: instance method of [<code>Editor</code>](#Editor)  
<a name="Editor+destroy"></a>

### editor.destroy()
Removes this editor from the DOM and detaches from the Document. If this is the "master"
Editor that is secretly providing the Document's backing state, then the Document reverts to
a read-only string-backed mode.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
<a name="Editor+_getModeFromDocument"></a>

### editor.\_getModeFromDocument() ⇒ <code>string</code>
Determine the mode to use from the document's language
Uses "text/plain" if the language does not define a mode

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>string</code> - The mode to use  
<a name="Editor+selectAllNoScroll"></a>

### editor.selectAllNoScroll()
Selects all text and maintains the current scroll position.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
<a name="Editor+isTextSubset"></a>

### editor.isTextSubset() ⇒ <code>boolean</code>
**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>boolean</code> - True if editor is not showing the entire text of the document (i.e. an inline editor)  
<a name="Editor+_updateHiddenLines"></a>

### editor.\_updateHiddenLines()
Ensures that the lines that are actually hidden in the inline editor correspond to
the desired visible range.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
<a name="Editor+_resetText"></a>

### editor.\_resetText(text)
Sets the contents of the editor, clears the undo/redo history and marks the document clean. Dispatches a change event.
Semi-private: only Document should call this.

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type |
| --- | --- |
| text | <code>string</code> | 

<a name="Editor+getFile"></a>

### editor.getFile() ⇒ <code>File</code>
Gets the file associated with this editor
This is a required Pane-View interface method

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>File</code> - the file associated with this editor  
<a name="Editor+getCursorPos"></a>

### editor.getCursorPos([expandTabs], [which]) ⇒ <code>Object</code>
Gets the current cursor position within the editor.

Cursor positions can be converted to index(0 based character offsets in editor text string)
using `editor.indexFromPos` API.

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| [expandTabs] | <code>boolean</code> | If true, return the actual visual column number instead of the character offset in      the "ch" property. |
| [which] | <code>string</code> | Optional string indicating which end of the  selection to return. It may be "start", "end", "head" (the side of the  selection that moves when you press shift+arrow), or "anchor" (the  fixed side of the selection). Omitting the argument is the same as  passing "head". A {'line', 'ch'} object will be returned.) |

<a name="Editor+getEndingCursorPos"></a>

### editor.getEndingCursorPos([expandTabs]) ⇒ <code>Object</code>
Gets the cursor position of the last charected in the editor.

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| [expandTabs] | <code>boolean</code> | If true, return the actual visual column number instead of the character offset in      the "ch" property. |

<a name="Editor+getColOffset"></a>

### editor.getColOffset(pos) ⇒ <code>number</code>
Returns the display column (zero-based) for a given string-based pos. Differs from pos.ch only
when the line contains preceding \t chars. Result depends on the current tab size setting.

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type |
| --- | --- |
| pos | <code>Object</code> | 

<a name="Editor+getCharIndexForColumn"></a>

### editor.getCharIndexForColumn(lineNum, column) ⇒ <code>number</code>
Returns the string-based pos for a given display column (zero-based) in given line. Differs from column
only when the line contains preceding \t chars. Result depends on the current tab size setting.

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| lineNum | <code>number</code> | Line number |
| column | <code>number</code> | Display column number |

<a name="Editor+setCursorPos"></a>

### editor.setCursorPos(line, ch, [center], [expandTabs])
Sets the cursor position within the editor. Removes any selection.

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| line | <code>number</code> | The 0 based line number. |
| ch | <code>number</code> | The 0 based character position; treated as 0 if unspecified. |
| [center] | <code>boolean</code> | True if the view should be centered on the new cursor position. |
| [expandTabs] | <code>boolean</code> | If true, use the actual visual column number instead of the character offset as      the "ch" parameter. |

<a name="Editor+setSize"></a>

### editor.setSize(width, height)
Set the editor size in pixels or percentage

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type |
| --- | --- |
| width | <code>number</code> \| <code>string</code> | 
| height | <code>number</code> \| <code>string</code> | 

<a name="Editor+getViewport"></a>

### editor.getViewport() ⇒ <code>Object</code>
Returns a {'from', 'to'} object indicating the start (inclusive) and end (exclusive) of the currently rendered
part of the document. In big documents, when most content is scrolled out of view, Editor will only render
the visible part, and a margin around it. See also the `viewportChange` event fired on the editor.

This is combination with `viewportChange` event can be used to selectively redraw visual elements in code
like syntax analyze only parts of code instead of the full code everytime.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
<a name="Editor+centerOnCursor"></a>

### editor.centerOnCursor(centerOptions)
Scrolls the editor viewport to vertically center the line with the cursor,
but only if the cursor is currently near the edges of the viewport or
entirely outside the viewport.

This does not alter the horizontal scroll position.

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| centerOptions | <code>number</code> | Option value, or 0 for no options; one of the BOUNDARY_* constants above. |

<a name="Editor+indexFromPos"></a>

### editor.indexFromPos(cursorPos) ⇒ <code>number</code>
Given a position, returns its index within the text (assuming \n newlines)

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type |
| --- | --- |
| cursorPos | <code>Object</code> | 

<a name="Editor+posFromIndex"></a>

### editor.posFromIndex(index) ⇒ <code>Object</code>
Given a position, returns its index within the text (assuming \n newlines)

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type |
| --- | --- |
| index | <code>number</code> | 

<a name="Editor+posWithinRange"></a>

### editor.posWithinRange(pos, start, end, endInclusive)
Returns true if pos is between start and end (INclusive at start; EXclusive at end by default,
but overridable via the endInclusive flag).

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type |
| --- | --- |
| pos | <code>Object</code> | 
| start | <code>Object</code> | 
| end | <code>Object</code> | 
| endInclusive | <code>boolean</code> | 

<a name="Editor+hasSelection"></a>

### editor.hasSelection() ⇒ <code>boolean</code>
**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>boolean</code> - True if there's a text selection; false if there's just an insertion point  
<a name="Editor+getSelection"></a>

### editor.getSelection() ⇒ <code>Object</code>
Gets the current selection; if there is more than one selection, returns the primary selection
(generally the last one made). Start is inclusive, end is exclusive. If there is no selection,
returns the current cursor position as both the start and end of the range (i.e. a selection
of length zero). If `reversed` is set, then the head of the selection (the end of the selection
that would be changed if the user extended the selection) is before the anchor.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
<a name="Editor+getSelections"></a>

### editor.getSelections() ⇒ <code>Object</code>
Returns an array of current selections, nonoverlapping and sorted in document order.
Each selection is a start/end pair, with the start guaranteed to come before the end.
Cursors are represented as a range whose start is equal to the end.
If `reversed` is set, then the head of the selection
(the end of the selection that would be changed if the user extended the selection)
is before the anchor.
If `primary` is set, then that selection is the primary selection.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
<a name="Editor+hasMultipleCursors"></a>

### editor.hasMultipleCursors() ⇒ <code>boolean</code>
Check if the editor has multiple cursors or selections

**Kind**: instance method of [<code>Editor</code>](#Editor)  
<a name="Editor+convertToLineSelections"></a>

### editor.convertToLineSelections(selections, options) ⇒ <code>Object</code>
Takes the given selections, and expands each selection so it encompasses whole lines. Merges
adjacent line selections together. Keeps track of each original selection associated with a given
line selection (there might be multiple if individual selections were merged into a single line selection).
Useful for doing multiple-selection-aware line edits.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>Object</code> - The combined line selections. For each selection, `selectionForEdit` is the line selection, and `selectionsToTrack` is
     the set of original selections that combined to make up the given line selection. Note that the selectionsToTrack will
     include the original objects passed in `selections`, so if it is later mutated the original passed-in selections will be
     mutated as well.  

| Param | Type | Description |
| --- | --- | --- |
| selections | <code>Object</code> | The selections to expand. |
| options | <code>Object</code> | expandEndAtStartOfLine: true if a range selection that ends at the beginning of a line should be expanded          to encompass the line. Default false.      mergeAdjacent: true if adjacent line ranges should be merged. Default true. |

<a name="Editor+getSelectedText"></a>

### editor.getSelectedText([allSelections]) ⇒ <code>string</code>
Returns the currently selected text, or "" if no selection. Includes \n if the
selection spans multiple lines (does NOT reflect the Document's line-endings style). By
default, returns only the contents of the primary selection, unless `allSelections` is true.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>string</code> - The selected text.  

| Param | Type | Description |
| --- | --- | --- |
| [allSelections] | <code>boolean</code> | Whether to return the contents of all selections (separated     by newlines) instead of just the primary selection. Default false. |

<a name="Editor+coordsChar"></a>

### editor.coordsChar(coordinates, [mode]) ⇒ <code>Object</code>
Given an {'left', 'top'} object (e.g. coordinates of a mouse event) returns the {'line', 'ch'} position that
corresponds to it. The optional mode parameter determines relative to what the coordinates are interpreted.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>Object</code> - for the given coordinates  

| Param | Type | Description |
| --- | --- | --- |
| coordinates | <code>Object</code> | can be obtained from Eg. coordinates of a mouse event |
| [mode] | <code>string</code> | It may be "window", "page" (the default), or "local". |

<a name="Editor+charCoords"></a>

### editor.charCoords(pos, [mode]) ⇒ <code>Object</code>
Returns the position and dimensions of an arbitrary character given a cursor (Eg. from getCursorPos()).
It'll give the size of the whole character, rather than just the position that the cursor would have
when it would sit at that position.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>Object</code> - coordinates for the given character position  

| Param | Type | Description |
| --- | --- | --- |
| pos | <code>Object</code> | A cursor, can be obtained from Eg. getCursorPos() |
| [mode] | <code>string</code> | It may be "window", "page" (the default), or "local". |

<a name="Editor+getToken"></a>

### editor.getToken([cursor], [precise]) ⇒ <code>Object</code>
Get the token at the given cursor position, or at the current cursor
if none is given.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>Object</code> - -
the CodeMirror token at the given cursor position  

| Param | Type | Description |
| --- | --- | --- |
| [cursor] | <code>Object</code> | Optional cursor position      at which to retrieve a token. If not provided, the current position will be used. |
| [precise] | <code>boolean</code> | If given, results in more current results. Suppresses caching. |

<a name="Editor+getCharacterAtPosition"></a>

### editor.getCharacterAtPosition(pos) ⇒ <code>string</code> \| <code>null</code>
Retrieves a single character from the specified position in the editor.
x|y where `|` is the cursor, will return y

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>string</code> \| <code>null</code> - The character at the given position if within bounds,
                       otherwise `null` if the position is out of range.  

| Param | Type | Description |
| --- | --- | --- |
| pos | <code>CodeMirror.Position</code> | The position from which to retrieve the character.                                    This should be an object with `line` and `ch` properties. |

<a name="Editor+getPrevCharacterAtPosition"></a>

### editor.getPrevCharacterAtPosition(pos) ⇒ <code>string</code> \| <code>null</code>
Retrieves a single character previous to the specified position in the editor in the same line if possible.
x|y where `|` is the cursor, will return x

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>string</code> \| <code>null</code> - The character previous to the given position if within bounds,
                       otherwise `null` if the position is out of range.  

| Param | Type | Description |
| --- | --- | --- |
| pos | <code>CodeMirror.Position</code> | The position from which to retrieve the character.                                    This should be an object with `line` and `ch` properties. |

<a name="Editor+getNextToken"></a>

### editor.getNextToken([cursor], [skipWhitespace], [precise]) ⇒ <code>Object</code>
Get the token after the one at the given cursor position

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>Object</code> - -
the CodeMirror token after the one at the given cursor position  

| Param | Type | Description |
| --- | --- | --- |
| [cursor] | <code>Object</code> | Optional cursor position after      which a token should be retrieved |
| [skipWhitespace] | <code>boolean</code> | true if this should skip over whitespace tokens. Default is true. |
| [precise] | <code>boolean</code> | If given, results in more current results. Suppresses caching. |

<a name="Editor+getPreviousToken"></a>

### editor.getPreviousToken([cursor], [skipWhitespace], [precise]) ⇒ <code>Object</code>
Get the token before the one at the given cursor position

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>Object</code> - - the CodeMirror token before
the one at the given cursor position  

| Param | Type | Description |
| --- | --- | --- |
| [cursor] | <code>Object</code> | Optional cursor position before      which a token should be retrieved |
| [skipWhitespace] | <code>boolean</code> | true if this should skip over whitespace tokens. Default is true. |
| [precise] | <code>boolean</code> | If given, results in more current results. Suppresses caching. |

<a name="Editor+operation"></a>

### editor.operation(execFn) ⇒ <code>\*</code>
Use This if you are making large number of editor changes in a single workflow to improve performance.
The editor internally buffers changes and only updates its DOM structure after it has finished performing
some operation. If you need to perform a lot of operations on a CodeMirror instance, you can call this method
with a function argument. It will call the function, buffering up all changes, and only doing the expensive
update after the function returns. This can be a lot faster. The return value from this method will be the
return value of your function.

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Description |
| --- | --- |
| execFn | The function that will be called to make all editor changes. |

<a name="Editor+markToken"></a>

### editor.markToken(markType, cursor, [options]) ⇒ <code>Object</code>
Same as markText, but will apply to the token at the given position or current position

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>Object</code> - TextMarker  

| Param | Type | Description |
| --- | --- | --- |
| markType | <code>string</code> | A String that can be used to label the mark type. |
| cursor | <code>Object</code> | The position of the token |
| [options] |  | same as markText |

<a name="Editor+setBookmark"></a>

### editor.setBookmark(markType, [cursorPos], [options]) ⇒ <code>Object</code>
Inserts a bookmark, a handle that follows the text around it as it is being edited, at the given position.
Similar to mark text, but for just a point instead of range.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>Object</code> - TextMarker- A bookmark has two methods find() and clear(). `find` returns the current
position of the bookmark, if it is still in the document, and `clear` explicitly removes the bookmark.  

| Param | Type | Description |
| --- | --- | --- |
| markType | <code>string</code> | A String that can be used to label the mark type. |
| [cursorPos] | <code>Object</code> | Where to place the mark. Optional, if not specified, will use current pos |
| [options] | <code>Object</code> | When given, it should be an object that may contain the following configuration options: |
| [options.widget] | <code>Element</code> | Can be used to display a DOM node at the current location of the bookmark (analogous to the replacedWith option to markText). |
| [options.insertLeft] | <code>boolean</code> | By default, text typed when the cursor is on top of the bookmark will end up to the right of the bookmark. Set this option to true to make it go to the left instead. |
| [options.handleMouseEvents] | <code>boolean</code> | As with markText, this determines whether mouse events on the widget inserted for this bookmark are handled by CodeMirror. The default is false. |

<a name="Editor+findMarks"></a>

### editor.findMarks(cursorFrom, cursorTo, [markType]) ⇒ <code>Array.&lt;TextMarker&gt;</code>
Returns an array of all the bookmarks and marked ranges found between the given positions (non-inclusive).

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>Array.&lt;TextMarker&gt;</code> - TextMarker - A text marker array  

| Param | Type | Description |
| --- | --- | --- |
| cursorFrom | <code>Object</code> | Mark start position |
| cursorTo | <code>Object</code> | Mark end position |
| [markType] | <code>string</code> | Optional, if given will only return marks of that type. Else returns everything. |

<a name="Editor+findMarksAt"></a>

### editor.findMarksAt(cursorPos, [markType]) ⇒ <code>Array.&lt;TextMarker&gt;</code>
Returns an array of all the bookmarks and marked ranges present at the given position.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>Array.&lt;TextMarker&gt;</code> - TextMarker - A text marker array  

| Param | Type | Description |
| --- | --- | --- |
| cursorPos | <code>Object</code> | cursor position |
| [markType] | <code>string</code> | Optional, if given will only return marks of that type. Else returns everything. |

<a name="Editor+getMarksAfter"></a>

### editor.getMarksAfter(position, markType) ⇒ <code>Array.&lt;TextMarker&gt;</code>
Returns the first mark of a specific type found after the given position.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>Array.&lt;TextMarker&gt;</code> - The array of text markers found, or an empty array if none are found.  

| Param | Type | Description |
| --- | --- | --- |
| position | <code>Object</code> | The starting position to search from. |
| markType | <code>string</code> | The type of mark to look for. |

<a name="Editor+getMarksBefore"></a>

### editor.getMarksBefore(position, markType) ⇒ <code>Array.&lt;TextMarker&gt;</code>
Returns the first mark of a specific type found before the given position.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>Array.&lt;TextMarker&gt;</code> - The array of text markers found, or an empty array if none are found.  

| Param | Type | Description |
| --- | --- | --- |
| position | <code>Object</code> | The ending position to search up to. |
| markType | <code>string</code> | The type of mark to look for. |

<a name="Editor+getAllMarks"></a>

### editor.getAllMarks([markType]) ⇒ <code>Array.&lt;TextMarker&gt;</code>
Returns an array containing all marked ranges in the document.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>Array.&lt;TextMarker&gt;</code> - TextMarker - A text marker array  

| Param | Type | Description |
| --- | --- | --- |
| [markType] | <code>string</code> | Optional, if given will only return marks of that type. Else returns everything. |

<a name="Editor+clearAllMarks"></a>

### editor.clearAllMarks([markType])
Clears all mark of the given type. If nothing is given, clears all marks(Don't use this API without types!).

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| [markType] | <code>string</code> | Optional, if given will only delete marks of that type. Else delete everything. |

<a name="Editor+isSamePosition"></a>

### editor.isSamePosition(position1, position2) ⇒ <code>boolean</code>
Checks if two positions in the editor are the same.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>boolean</code> - True if both positions are the same, false otherwise.  

| Param | Type | Description |
| --- | --- | --- |
| position1 | <code>Object</code> | cursor position |
| position2 | <code>Object</code> | cursor position |

<a name="Editor+getHistory"></a>

### editor.getHistory() ⇒ <code>Array</code>
Get a (JSON-serializable) representation of the undo history.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>Array</code> - The history of the editor.  
<a name="Editor+setHistory"></a>

### editor.setHistory()
Replace the editor's undo history with the one provided, which must be a value
as returned by getHistory. Note that this will have entirely undefined results
if the editor content isn't also the same as it was when getHistory was called.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
<a name="Editor+createHistoryRestorePoint"></a>

### editor.createHistoryRestorePoint()
Creates a named restore point in undo history. this can be later be restored to undo all
changed till the named restore point in one go.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
<a name="Editor+setSelection"></a>

### editor.setSelection(start, [end], [center], [centerOptions], [origin])
Sets the current selection. Start is inclusive, end is exclusive. Places the cursor at the
end of the selection range. Optionally centers around the cursor after
making the selection

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| start | <code>Object</code> |  |
| [end] | <code>Object</code> | If not specified, defaults to start. |
| [center] | <code>boolean</code> | true to center the viewport |
| [centerOptions] | <code>number</code> | Option value, or 0 for no options; one of the BOUNDARY_* constants above. |
| [origin] | <code>string</code> | An optional string that describes what other selection or edit operations this      should be merged with for the purposes of undo. See [Document::Document#replaceRange](Document::Document#replaceRange) for more details. |

<a name="Editor+replaceSelection"></a>

### editor.replaceSelection(replacement, [select])
Replace the selection with the given string.

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| replacement | <code>string</code> | the text to replace the current selection |
| [select] | <code>string</code> | The optional select argument can be used to change selection. Passing "around" will cause the new text to be selected, passing "start" will collapse the selection to the start of the inserted text. |

<a name="Editor+replaceSelections"></a>

### editor.replaceSelections(replacement, [select])
Replaces the content of multiple selections with the strings in the array. The length of the given
array should be the same as the number of active selections.

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| replacement | <code>Array.&lt;string&gt;</code> | the text array to replace the current selections with |
| [select] | <code>string</code> | The optional select argument can be used to change selection. Passing "around" will cause the new text to be selected, passing "start" will collapse the selection to the start of the inserted text. |

<a name="Editor+replaceRange"></a>

### editor.replaceRange(replacement, from, [to], origin)
Replace the part of the document between from and to with the given string.

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| replacement | <code>string</code> | the text to replace the current selection |
| from | <code>Object</code> | the strat position to replace |
| [to] | <code>Object</code> | the end position to replace. to can be left off to simply insert the string at position from. |
| origin | <code>string</code> | When origin is given, it will be passed on to "change" events, and its first letter will be used to determine whether this change can be merged with previous history events of the inserted text. |

<a name="Editor+replaceMultipleRanges"></a>

### editor.replaceMultipleRanges(ranges, [origin])
Replaces multiple ranges in the editor with the specified texts.

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| ranges | <code>Array</code> | An array of range objects, each containing `from`, `to`, and `text` properties. |
| ranges[].from | <code>Object</code> | The start position of the range to be replaced. It should have `line` and `ch` properties. |
| ranges[].to | <code>Object</code> | The end position of the range to be replaced. It should have `line` and `ch` properties. |
| ranges[].text | <code>string</code> | The text to replace the specified range. |
| [origin] | <code>string</code> | An optional origin identifier to be associated with the changes. |

**Example**  
```js
editor.replaceMultipleRanges([
  { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 }, text: 'Hello' },
  { from: { line: 1, ch: 0 }, to: { line: 1, ch: 4 }, text: 'World' }
], 'exampleOrigin');
```
<a name="Editor+clearSelection"></a>

### editor.clearSelection()
Clears any active selection if present.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
<a name="Editor+setSelections"></a>

### editor.setSelections(selections, center, centerOptions, origin)
Sets a multiple selection, with the "primary" selection (the one returned by
getSelection() and getCursorPos()) defaulting to the last if not specified.
Overlapping ranges will be automatically merged, and the selection will be sorted.
Optionally centers around the primary selection after making the selection.

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| selections | <code>Object</code> | The selection ranges to set. If the start and end of a range are the same, treated as a cursor.      If reversed is true, set the anchor of the range to the end instead of the start.      If primary is true, this is the primary selection. Behavior is undefined if more than      one selection has primary set to true. If none has primary set to true, the last one is primary. |
| center | <code>boolean</code> | true to center the viewport around the primary selection. |
| centerOptions | <code>number</code> | Option value, or 0 for no options; one of the BOUNDARY_* constants above. |
| origin | <code>string</code> | An optional string that describes what other selection or edit operations this      should be merged with for the purposes of undo. See [Document::Document#replaceRange](Document::Document#replaceRange) for more details. |

<a name="Editor+toggleOverwrite"></a>

### editor.toggleOverwrite(start)
Sets the editors overwrite mode state. If null is passed, the state is toggled.

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type |
| --- | --- |
| start | <code>boolean</code> | 

<a name="Editor+selectWordAt"></a>

### editor.selectWordAt(pos)
Selects word that the given pos lies within or adjacent to. If pos isn't touching a word
(e.g. within a token like "//"), moves the cursor to pos without selecting a range.

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type |
| --- | --- |
| pos | <code>Object</code> | 

<a name="Editor+getWordAt"></a>

### editor.getWordAt(pos) ⇒ <code>Object</code>
Gets word at the given pos lies within or adjacent to. If pos isn't touching a word
(e.g. within a token like "//"), returns null

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param |
| --- |
| pos | 

<a name="Editor+getNumberAt"></a>

### editor.getNumberAt(pos, maxDigits) ⇒ <code>Object</code>
Gets number string of (upto 10 digits default) at the given pos lies within or adjacent to.
If pos isn't touching a number, returns null. If the number in string is greater than max digits
 returns null.

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| pos |  |  |
| maxDigits | <code>number</code> | number of digits allowed. This is to prevent massive digit strings. |

<a name="Editor+lineCount"></a>

### editor.lineCount() ⇒ <code>number</code>
Gets the total number of lines in the document (includes lines not visible in the viewport)

**Kind**: instance method of [<code>Editor</code>](#Editor)  
<a name="Editor+isLineVisible"></a>

### editor.isLineVisible(zero-based) ⇒ <code>boolean</code>
Deterines if line is fully visible.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>boolean</code> - true if the line is fully visible, false otherwise  

| Param | Type | Description |
| --- | --- | --- |
| zero-based | <code>number</code> | index of the line to test |

<a name="Editor+getFirstVisibleLine"></a>

### editor.getFirstVisibleLine() ⇒ <code>number</code>
Gets the number of the first visible line in the editor.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>number</code> - The 0-based index of the first visible line.  
<a name="Editor+getLastVisibleLine"></a>

### editor.getLastVisibleLine() ⇒ <code>number</code>
Gets the number of the last visible line in the editor.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>number</code> - The 0-based index of the last visible line.  
<a name="Editor+totalHeight"></a>

### editor.totalHeight() ⇒ <code>number</code>
Gets the total height of the document in pixels (not the viewport)

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>number</code> - height in pixels  
<a name="Editor+getScrollerElement"></a>

### editor.getScrollerElement() ⇒ <code>HTMLDivElement</code>
Gets the scroller element from the editor.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>HTMLDivElement</code> - scroller  
<a name="Editor+getRootElement"></a>

### editor.getRootElement() ⇒ <code>HTMLDivElement</code>
Gets the root DOM node of the editor.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>HTMLDivElement</code> - The editor's root DOM node.  
<a name="Editor+_getLineSpaceElement"></a>

### editor.\_getLineSpaceElement() ⇒ <code>HTMLDivElement</code>
Gets the lineSpace element within the editor (the container around the individual lines of code).
FUTURE: This is fairly CodeMirror-specific. Logic that depends on this may break if we switch
editors.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>HTMLDivElement</code> - The editor's lineSpace element.  
<a name="Editor+getScrollPos"></a>

### editor.getScrollPos() ⇒ <code>Object</code>
Returns the current scroll position of the editor.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>Object</code> - The x,y scroll position in pixels  
<a name="Editor+adjustScrollPos"></a>

### editor.adjustScrollPos(scrollPos, heightDelta)
Restores and adjusts the current scroll position of the editor.

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| scrollPos | <code>Object</code> | The x,y scroll position in pixels |
| heightDelta | <code>number</code> | The amount of delta H to apply to the scroll position |

<a name="Editor+setScrollPos"></a>

### editor.setScrollPos(x, y)
Sets the current scroll position of the editor.

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| x | <code>number</code> | scrollLeft position in pixels |
| y | <code>number</code> | scrollTop position in pixels |

<a name="Editor+displayErrorMessageAtCursor"></a>

### editor.displayErrorMessageAtCursor(errorMsg)
Display temporary popover message at current cursor position. Display message above
cursor if space allows, otherwise below.

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| errorMsg | <code>string</code> | Error message to display |

<a name="Editor+getVirtualScrollAreaTop"></a>

### editor.getVirtualScrollAreaTop() ⇒ <code>number</code>
Returns the offset of the top of the virtual scroll area relative to the browser window (not the editor
itself). Mainly useful for calculations related to scrollIntoView(), where you're starting with the
offset() of a child widget (relative to the browser window) and need to figure out how far down it is from
the top of the virtual scroll area (excluding the top padding).

**Kind**: instance method of [<code>Editor</code>](#Editor)  
<a name="Editor+focus"></a>

### editor.focus()
Gives focus to the editor control

**Kind**: instance method of [<code>Editor</code>](#Editor)  
<a name="Editor+hasFocus"></a>

### editor.hasFocus()
Returns true if the editor has focus

**Kind**: instance method of [<code>Editor</code>](#Editor)  
<a name="Editor+restoreViewState"></a>

### editor.restoreViewState(viewState)
Restores the view state

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| viewState | <code>EditorViewState</code> | the view state object to restore |

<a name="Editor+refresh"></a>

### editor.refresh([handleResize])
Re-renders the editor UI

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| [handleResize] | <code>boolean</code> | true if this is in response to resizing the editor. Default false. |

<a name="Editor+refreshAll"></a>

### editor.refreshAll([handleResize])
Re-renders the editor, and all children inline editors.

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| [handleResize] | <code>boolean</code> | true if this is in response to resizing the editor. Default false. |

<a name="Editor+undo"></a>

### editor.undo()
Undo the last edit.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
<a name="Editor+redo"></a>

### editor.redo()
Redo the last un-done edit.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
<a name="Editor+notifyVisibilityChange"></a>

### editor.notifyVisibilityChange(show, refresh)
View API Visibility Change Notification handler.  This is also
called by the native "setVisible" API which refresh can be optimized

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| show | <code>boolean</code> | true to show the editor, false to hide it |
| refresh | <code>boolean</code> | true (default) to refresh the editor, false to skip refreshing it |

<a name="Editor+setVisible"></a>

### editor.setVisible(show, refresh)
Shows or hides the editor within its parent. Does not force its ancestors to
become visible.

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| show | <code>boolean</code> | true to show the editor, false to hide it |
| refresh | <code>boolean</code> | true (default) to refresh the editor, false to skip refreshing it |

<a name="Editor+isFullyVisible"></a>

### editor.isFullyVisible()
Returns true if the editor is fully visible--i.e., is in the DOM, all ancestors are
visible, and has a non-zero width/height.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
<a name="Editor+getModeForRange"></a>

### editor.getModeForRange(start, end, [knownMixed]) ⇒ <code>Object</code> \| <code>string</code>
Gets the syntax-highlighting mode for the given range.
Returns null if the mode at the start of the selection differs from the mode at the end -
an *approximation* of whether the mode is consistent across the whole range (a pattern like
A-B-A would return A as the mode, not null).

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>Object</code> \| <code>string</code> - Name of syntax-highlighting mode, or object containing a "name" property
    naming the mode along with configuration options required by the mode.  
**See**: [LanguageManager::#getLanguageForPath](LanguageManager::#getLanguageForPath) and [LanguageManager::Language#getMode](LanguageManager::Language#getMode).  

| Param | Type | Description |
| --- | --- | --- |
| start | <code>Object</code> | The start of the range to check. |
| end | <code>Object</code> | The end of the range to check. |
| [knownMixed] | <code>boolean</code> | Whether we already know we're in a mixed mode and need to check both     the start and end. |

<a name="Editor+getModeForSelection"></a>

### editor.getModeForSelection(selection) ⇒ <code>Object</code> \| <code>string</code>
Gets the syntax-highlighting mode for the current selection or cursor position. (The mode may
vary within one file due to embedded languages, e.g. JS embedded in an HTML script block). See
`getModeForRange()` for how this is determined for a single selection.

If there are multiple selections, this will return a mode only if all the selections are individually
consistent and resolve to the same mode.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>Object</code> \| <code>string</code> - Name of syntax-highlighting mode, or object containing a "name" property
    naming the mode along with configuration options required by the mode.  
**See**: [LanguageManager::#getLanguageForPath](LanguageManager::#getLanguageForPath) and [LanguageManager::Language#getMode](LanguageManager::Language#getMode).  

| Param | Type |
| --- | --- |
| selection | <code>Object</code> | 

<a name="Editor+getLanguageForSelection"></a>

### editor.getLanguageForSelection() ⇒ <code>Language</code>
gets the language for the selection. (Javascript selected from an HTML document or CSS selected from an HTML
document, etc...)

**Kind**: instance method of [<code>Editor</code>](#Editor)  
<a name="Editor+getLanguageForPosition"></a>

### editor.getLanguageForPosition() ⇒ <code>Language</code>
gets the language for the selection. (Javascript selected from an HTML document or CSS selected from an HTML
document, etc...)

**Kind**: instance method of [<code>Editor</code>](#Editor)  
<a name="Editor+getModeForDocument"></a>

### editor.getModeForDocument() ⇒ <code>Object</code> \| <code>String</code>
Gets the syntax-highlighting mode for the document.

**Kind**: instance method of [<code>Editor</code>](#Editor)  
**Returns**: <code>Object</code> \| <code>String</code> - Object or Name of syntax-highlighting mode  
**See**: [LanguageManager.getLanguageForPath](LanguageManager::#getLanguageForPath) and [Language.getMode](LanguageManager::Language#getMode).  
<a name="Editor+updateLayout"></a>

### editor.updateLayout([forceRefresh])
resizes the editor to fill its parent container
should not be used on inline editors

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| [forceRefresh] | <code>boolean</code> | forces the editor to update its layout                                   even if it already matches the container's height / width |

<a name="Editor+setGutterMarker"></a>

### editor.setGutterMarker(lineNumber, gutterName, marker)
Sets the marker for the specified gutter on the specified line number

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| lineNumber | <code>number</code> | The line number for the inserted gutter marker |
| gutterName | <code>string</code> | The name of the gutter |
| marker | <code>object</code> | The dom element representing the marker to the inserted in the gutter |

<a name="Editor+getGutterMarker"></a>

### editor.getGutterMarker(lineNumber, gutterName)
Gets the gutter marker of the given name if found on the current line, else returns undefined.

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| lineNumber | <code>number</code> | The line number for the inserted gutter marker |
| gutterName | <code>string</code> | The name of the gutter |

<a name="Editor+clearGutterMarker"></a>

### editor.clearGutterMarker(lineNumber, gutterName)
Clears the marker for the specified gutter on the specified line number. Does nothing if there was no marker
on the line.

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| lineNumber | <code>number</code> | The line number for the inserted gutter marker |
| gutterName | <code>string</code> | The name of the gutter |

<a name="Editor+clearGutter"></a>

### editor.clearGutter(gutterName)
Clears all marks from the gutter with the specified name.

**Kind**: instance method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| gutterName | <code>string</code> | The name of the gutter to clear. |

<a name="Editor.getMarkOptionUnderlineError"></a>

### Editor.getMarkOptionUnderlineError
Mark options to use with API with Editor.markText or Editor.markToken.

**Kind**: static property of [<code>Editor</code>](#Editor)  
<a name="Editor.EVENT_BEFORE_CHANGE"></a>

### Editor.EVENT\_BEFORE\_CHANGE
Each Editor instance object dispatches the following events:
   - keydown, keypress, keyup -- When any key event happens in the editor (whether it changes the
     text or not). Handlers are passed `(BracketsEvent, Editor, KeyboardEvent)`. The 3nd arg is the
     raw DOM event. Note: most listeners will only want to listen for "keypress".
   - change - Triggered with an array of change objects. Parameters: (editor, changeList)
   - beforeChange - (self, changeObj)
   - beforeSelectionChange - (selectionObj)
   - focus - Fired when an editor is focused
   - blur - Fired when an editor loses focused
   - update - Will be fired whenever Editor updates its DOM display.
   - cursorActivity -- When the user moves the cursor or changes the selection, or an edit occurs.
     Note: do not listen to this in order to be generally informed of edits--listen to the
     "change" event on Document instead.
   - scroll -- When the editor is scrolled, either by user action or programmatically.
   - viewportChange - (from: number, to: number) Fires whenever the view port of the editor changes
     (due to scrolling, editing, or any other factor). The from and to arguments give the new start
     and end of the viewport. This is combination with `editorInstance.getViewPort()` can be used to
     selectively redraw visual elements in code like syntax analyze only parts of code instead
     of the full code everytime.
   - lostContent -- When the backing Document changes in such a way that this Editor is no longer
     able to display accurate text. This occurs if the Document's file is deleted, or in certain
     Document->editor syncing edge cases that we do not yet support (the latter cause will
     eventually go away).
   - optionChange -- Triggered when an option for the editor is changed. The 2nd arg to the listener
     is a string containing the editor option that is changing. The 3rd arg, which can be any
     data type, is the new value for the editor option.
   - beforeDestroy - Triggered before the object is about to dispose of all its internal state data
     so that listeners can cache things like scroll pos, etc...

**Kind**: static property of [<code>Editor</code>](#Editor)  
<a name="Editor.getRegisteredGutters"></a>

### Editor.getRegisteredGutters() ⇒ <code>Object</code>
Returns the list of gutters current registered on all editors.

**Kind**: static method of [<code>Editor</code>](#Editor)  
<a name="Editor.isGutterRegistered"></a>

### Editor.isGutterRegistered(gutterName) ⇒ <code>boolean</code>
Return true if gutter of the given name is registered

**Kind**: static method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| gutterName | <code>string</code> | The name of the gutter |

<a name="Editor.registerGutter"></a>

### Editor.registerGutter(name, priority, [languageIds])
Registers the gutter with the specified name at the given priority.

**Kind**: static method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> | The name of the gutter. |
| priority | <code>number</code> | A number denoting the priority of the gutter. Priorities higher than LINE_NUMBER_GUTTER_PRIORITY appear after the line numbers. Priority less than LINE_NUMBER_GUTTER_PRIORITY appear before. |
| [languageIds] | <code>Array.&lt;string&gt;</code> | A list of language ids that this gutter is valid for. If no language ids are passed, then the gutter is valid in all languages. |

<a name="Editor.unregisterGutter"></a>

### Editor.unregisterGutter(name)
Unregisters the gutter with the specified name and removes it from the UI.

**Kind**: static method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> | The name of the gutter to be unregistered. |

<a name="Editor.setUseTabChar"></a>

### Editor.setUseTabChar(value, [fullPath]) ⇒ <code>boolean</code>
Sets whether to use tab characters (vs. spaces) when inserting new text.
Affects any editors that share the same preference location.

**Kind**: static method of [<code>Editor</code>](#Editor)  
**Returns**: <code>boolean</code> - true if value was valid  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>boolean</code> |  |
| [fullPath] | <code>string</code> | Path to file to get preference for |

<a name="Editor.getUseTabChar"></a>

### Editor.getUseTabChar([fullPath]) ⇒ <code>boolean</code>
Gets whether the specified or current file uses tab characters (vs. spaces) when inserting new text

**Kind**: static method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| [fullPath] | <code>string</code> | Path to file to get preference for |

<a name="Editor.setTabSize"></a>

### Editor.setTabSize(value, [fullPath]) ⇒ <code>boolean</code>
Sets tab character width.
Affects any editors that share the same preference location.

**Kind**: static method of [<code>Editor</code>](#Editor)  
**Returns**: <code>boolean</code> - true if value was valid  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>number</code> |  |
| [fullPath] | <code>string</code> | Path to file to get preference for |

<a name="Editor.getTabSize"></a>

### Editor.getTabSize([fullPath]) ⇒ <code>number</code>
Get indent unit

**Kind**: static method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| [fullPath] | <code>string</code> | Path to file to get preference for |

<a name="Editor.getAutoTabUnits"></a>

### Editor.getAutoTabUnits(fullPath) ⇒ <code>number</code> \| <code>\*</code>
Gets the number of tabs for the file. Will

**Kind**: static method of [<code>Editor</code>](#Editor)  

| Param |
| --- |
| fullPath | 

<a name="Editor.setAutoTabSpaces"></a>

### Editor.setAutoTabSpaces(value, [fullPath]) ⇒ <code>boolean</code>
When set, the tabs and spaces to be used will be auto detected from the current file or fall back to defaults.
Affects any editors that share the same preference location.

**Kind**: static method of [<code>Editor</code>](#Editor)  
**Returns**: <code>boolean</code> - true if value was valid  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>boolean</code> |  |
| [fullPath] | <code>string</code> | Path to file to get preference for |

<a name="Editor.getAutoTabSpaces"></a>

### Editor.getAutoTabSpaces([fullPath]) ⇒ <code>number</code>
Get auto tabbing/spacing option

**Kind**: static method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| [fullPath] | <code>string</code> | Path to file to get preference for |

<a name="Editor.setSpaceUnits"></a>

### Editor.setSpaceUnits(value, [fullPath]) ⇒ <code>boolean</code>
Sets indentation width.
Affects any editors that share the same preference location.

**Kind**: static method of [<code>Editor</code>](#Editor)  
**Returns**: <code>boolean</code> - true if value was valid  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>number</code> |  |
| [fullPath] | <code>string</code> | Path to file to get preference for |

<a name="Editor.getSpaceUnits"></a>

### Editor.getSpaceUnits([fullPath]) ⇒ <code>number</code>
Get indentation width

**Kind**: static method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| [fullPath] | <code>string</code> | Path to file to get preference for |

<a name="Editor.setCloseBrackets"></a>

### Editor.setCloseBrackets(value, [fullPath]) ⇒ <code>boolean</code>
Sets the auto close brackets.
Affects any editors that share the same preference location.

**Kind**: static method of [<code>Editor</code>](#Editor)  
**Returns**: <code>boolean</code> - true if value was valid  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>boolean</code> |  |
| [fullPath] | <code>string</code> | Path to file to get preference for |

<a name="Editor.getCloseBrackets"></a>

### Editor.getCloseBrackets([fullPath]) ⇒ <code>boolean</code>
Gets whether the specified or current file uses auto close brackets

**Kind**: static method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| [fullPath] | <code>string</code> | Path to file to get preference for |

<a name="Editor.setShowLineNumbers"></a>

### Editor.setShowLineNumbers(value, [fullPath]) ⇒ <code>boolean</code>
Sets show line numbers option.
Affects any editors that share the same preference location.

**Kind**: static method of [<code>Editor</code>](#Editor)  
**Returns**: <code>boolean</code> - true if value was valid  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>boolean</code> |  |
| [fullPath] | <code>string</code> | Path to file to get preference for |

<a name="Editor.getShowLineNumbers"></a>

### Editor.getShowLineNumbers([fullPath]) ⇒ <code>boolean</code>
Returns true if show line numbers is enabled for the specified or current file

**Kind**: static method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| [fullPath] | <code>string</code> | Path to file to get preference for |

<a name="Editor.setShowActiveLine"></a>

### Editor.setShowActiveLine(value, [fullPath]) ⇒ <code>boolean</code>
Sets show active line option.
Affects any editors that share the same preference location.

**Kind**: static method of [<code>Editor</code>](#Editor)  
**Returns**: <code>boolean</code> - true if value was valid  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>boolean</code> |  |
| [fullPath] | <code>string</code> | Path to file to get preference for |

<a name="Editor.getShowActiveLine"></a>

### Editor.getShowActiveLine([fullPath]) ⇒ <code>boolean</code>
Returns true if show active line is enabled for the specified or current file

**Kind**: static method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| [fullPath] | <code>string</code> | Path to file to get preference for |

<a name="Editor.setWordWrap"></a>

### Editor.setWordWrap(value, [fullPath]) ⇒ <code>boolean</code>
Sets word wrap option.
Affects any editors that share the same preference location.

**Kind**: static method of [<code>Editor</code>](#Editor)  
**Returns**: <code>boolean</code> - true if value was valid  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>boolean</code> |  |
| [fullPath] | <code>string</code> | Path to file to get preference for |

<a name="Editor.getWordWrap"></a>

### Editor.getWordWrap([fullPath]) ⇒ <code>boolean</code>
Returns true if word wrap is enabled for the specified or current file

**Kind**: static method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| [fullPath] | <code>string</code> | Path to file to get preference for |

<a name="Editor.setIndentLineComment"></a>

### Editor.setIndentLineComment(value, [fullPath]) ⇒ <code>boolean</code>
Sets indentLineComment option.
Affects any editors that share the same preference location.

**Kind**: static method of [<code>Editor</code>](#Editor)  
**Returns**: <code>boolean</code> - true if value was valid  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>boolean</code> |  |
| [fullPath] | <code>string</code> | Path to file to get preference for |

<a name="Editor.getIndentLineComment"></a>

### Editor.getIndentLineComment([fullPath]) ⇒ <code>boolean</code>
Returns true if indentLineComment is enabled for the specified or current file

**Kind**: static method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| [fullPath] | <code>string</code> | Path to file to get preference for |

<a name="Editor.forEveryEditor"></a>

### Editor.forEveryEditor(callback, [fullPath])
Runs callback for every Editor instance that currently exists or only the editors matching the given fullPath.

**Kind**: static method of [<code>Editor</code>](#Editor)  

| Param | Type | Description |
| --- | --- | --- |
| callback | <code>function</code> |  |
| [fullPath] | <code>string</code> | an optional second argument, if given will only callback for all editors  that is editing the file for the given fullPath |

<a name="CommandManager"></a>

## CommandManager
Editor is a 1-to-1 wrapper for a CodeMirror editor instance. It layers on Brackets-specific
functionality and provides APIs that cleanly pass through the bits of CodeMirror that the rest
of our codebase may want to interact with. An Editor is always backed by a Document, and stays
in sync with its content; because Editor keeps the Document alive, it's important to always
destroy() an Editor that's going away so it can release its Document ref.

For now, there's a distinction between the "master" Editor for a Document - which secretly acts
as the Document's internal model of the text state - and the multitude of secondary Editors
which, via Document, sync their changes to and from that master.

For now, direct access to the underlying CodeMirror object is still possible via `_codeMirror` --
but this is considered deprecated and may go away.

The Editor object dispatches the following events: (available as `Editor.EVENT_*` constants. see below)
   - keydown, keypress, keyup -- When any key event happens in the editor (whether it changes the
     text or not). Handlers are passed `(BracketsEvent, Editor, KeyboardEvent)`. The 3nd arg is the
     raw DOM event. Note: most listeners will only want to listen for "keypress".
   - change - Triggered with an array of change objects. Parameters: (editor, changeList)
   - beforeChange - (self, changeObj)
   - beforeSelectionChange - (selectionObj)
   - focus - Fired when an editor is focused
   - blur - Fired when an editor loses focused
   - update - Will be fired whenever Editor updates its DOM display.
   - cursorActivity -- When the user moves the cursor or changes the selection, or an edit occurs.
     Note: do not listen to this in order to be generally informed of edits--listen to the
     "change" event on Document instead.
   - scroll -- When the editor is scrolled, either by user action or programmatically.
   - viewportChange - (from: number, to: number) Fires whenever the view port of the editor changes
     (due to scrolling, editing, or any other factor). The from and to arguments give the new start
     and end of the viewport. This is combination with `editorInstance.getViewPort()` can be used to
     selectively redraw visual elements in code like syntax analyze only parts of code instead
     of the full code everytime.
   - lostContent -- When the backing Document changes in such a way that this Editor is no longer
     able to display accurate text. This occurs if the Document's file is deleted, or in certain
     Document->editor syncing edge cases that we do not yet support (the latter cause will
     eventually go away).
   - optionChange -- Triggered when an option for the editor is changed. The 2nd arg to the listener
     is a string containing the editor option that is changing. The 3rd arg, which can be any
     data type, is the new value for the editor option.
   - beforeDestroy - Triggered before the object is about to dispose of all its internal state data
     so that listeners can cache things like scroll pos, etc...

The Editor also dispatches "change" events internally, but you should listen for those on
Documents, not Editors.

To listen for events, do something like this: (see EventDispatcher for details on this pattern)
    `editorInstance.on("eventname", handler);`

**Kind**: global variable  
<a name="IndentHelper"></a>

## IndentHelper
Editor helpers

**Kind**: global variable  
<a name="registeredGutters"></a>

## registeredGutters : <code>Array.&lt;Object&gt;</code>
A list of gutter name and priorities currently registered for editors.
The line number gutter is defined as \{ name: LINE_NUMBER_GUTTER, priority: 100 }

**Kind**: global variable  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| name | <code>string</code> | The name of the item. |
| priority | <code>number</code> | The priority of the item. |
| languageIds | <code>Array</code> | An array of language IDs. |

<a name="_duringFocus"></a>

## \_duringFocus : <code>boolean</code>
Guard flag to prevent focus() reentrancy (via blur handlers), even across Editors

**Kind**: global variable  
<a name="BOUNDARY_CHECK_NORMAL"></a>

## BOUNDARY\_CHECK\_NORMAL : <code>number</code>
Constant: ignore upper boundary when centering text
Constant: bulls-eye = strictly centre always

**Kind**: global variable  
<a name="_instances"></a>

## \_instances : [<code>Array.&lt;Editor&gt;</code>](#Editor)
List of all current (non-destroy()ed) Editor instances. Needed when changing global preferences
that affect all editors, e.g. tabbing or color scheme settings.

**Kind**: global variable  
<a name="CENTERING_MARGIN"></a>

## CENTERING\_MARGIN
**Kind**: global constant  
<a name="_checkTopBoundary"></a>

## \_checkTopBoundary(options)
Helper functions to check options.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| options | <code>number</code> | BOUNDARY_CHECK_NORMAL or BOUNDARY_IGNORE_TOP |

<a name="_buildPreferencesContext"></a>

## \_buildPreferencesContext(fullPath) ⇒ <code>\*</code>
Helper function to build preferences context based on the full path of
the file.

**Kind**: global function  
**Returns**: <code>\*</code> - A context for the specified file name  

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> | Full path of the file |

