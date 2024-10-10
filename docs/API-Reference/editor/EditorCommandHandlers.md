### Import :
```js
const EditorCommandHandlers = brackets.getModule("editor/EditorCommandHandlers")
```

<a name="DIRECTION_UP"></a>

## DIRECTION\_UP
List of constants

**Kind**: global variable  
<a name="_getBlockCommentPrefixSuffixEdit"></a>

## \_getBlockCommentPrefixSuffixEdit(editor, prefix, suffix, linePrefixes, sel, selectionsToTrack, command) ⇒ <code>Object</code> \| <code>Object</code> \| <code>null</code>
Generates an edit that adds or removes block-comment tokens to the selection, preserving selection

**Kind**: global function  
**Returns**: <code>Object</code> \| <code>Object</code> \| <code>null</code> - An edit description suitable for including in the edits array passed to `Document.doMultipleEdits()`, or `null`

| Param | Type | Description |
| --- | --- | --- |
| editor | <code>Editor</code> | The editor instance where the operation will occur. |
| prefix | <code>string</code> | The block comment prefix, e.g., "< !--". |
| suffix | <code>string</code> | The block comment suffix, e.g., "-->". |
| linePrefixes | <code>Array.&lt;string&gt;</code> | The possible line comment prefixes, e.g., ["//"]. |
| sel | <code>Object</code> | The selection to block comment/uncomment. |
| selectionsToTrack | <code>Object</code> | An array of selections that should be tracked through this edit, if any. |
| command | <code>string</code> | The command being executed, can be "line" or "block". |

<a name="_getLineCommentPrefixSuffixEdit"></a>

## \_getLineCommentPrefixSuffixEdit(editor, prefix, suffix, lineSel, command) ⇒ <code>Object</code>
Generates an edit that adds or removes block-comment tokens to the selection, preserving selection

**Kind**: global function  
**Returns**: <code>Object</code> - An edit description suitable for including in the edits array passed to `Document.doMultipleEdits()`.  

| Param | Type | Description |
| --- | --- | --- |
| editor | <code>Editor</code> | The editor instance where the operation will occur. |
| prefix | <code>string</code> | The block comment prefix, e.g., "< !--". |
| suffix | <code>string</code> | The block comment suffix, e.g., "-->". |
| lineSel | <code>Object</code> | A line selection as returned from `Editor.convertToLineSelections()`. `selectionForEdit` is the selection to perform      the line comment operation on, and `selectionsToTrack` are a set of selections associated with this line that need to be      tracked through the edit. |
| command | <code>string</code> | The command being executed, can be "line" or "block". |

<a name="lineComment"></a>

## lineComment(editor)
Invokes a language-specific line-comment/uncomment handler

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| editor | <code>Editor</code> | If unspecified, applies to the currently focused editor |

<a name="blockComment"></a>

## blockComment(editor)
Invokes a language-specific block-comment/uncomment handler

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| editor | <code>Editor</code> | If unspecified, applies to the currently focused editor |

<a name="duplicateText"></a>

## duplicateText()
Duplicates the selected text, or current line if no selection. The cursor/selection is left

**Kind**: global function  
<a name="deleteCurrentLines"></a>

## deleteCurrentLines()
Deletes the current line if there is no selection or the lines for the selection

**Kind**: global function  
<a name="moveLine"></a>

## moveLine(editor, direction)
Moves the selected text, or current line if no selection. The cursor/selection

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| editor | <code>Editor</code> | target editor |
| direction | <code>Number</code> | direction of the move (-1,+1) => (Up,Down) |

<a name="moveLineUp"></a>

## moveLineUp()
Moves the selected text, or current line if no selection, one line up. The cursor/selection

**Kind**: global function  
<a name="moveLineDown"></a>

## moveLineDown()
Moves the selected text, or current line if no selection, one line down. The cursor/selection

**Kind**: global function  
<a name="openLine"></a>

## openLine(editor, direction)
Inserts a new and smart indented line above/below the selected text, or current line if no selection.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| editor | <code>Editor</code> | target editor |
| direction | <code>Number</code> | direction where to place the new line (-1,+1) => (Up,Down) |

<a name="openLineAbove"></a>

## openLineAbove(editor)
Inserts a new and smart indented line above the selected text, or current line if no selection.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| editor | <code>Editor</code> | target editor |

<a name="openLineBelow"></a>

## openLineBelow(editor)
Inserts a new and smart indented line below the selected text, or current line if no selection.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| editor | <code>Editor</code> | target editor |

<a name="indentText"></a>

## indentText()
Indent a line of text if no selection. Otherwise, indent all lines in selection.

**Kind**: global function  
<a name="unindentText"></a>

## unindentText()
Unindent a line of text if no selection. Otherwise, unindent all lines in selection.

**Kind**: global function  