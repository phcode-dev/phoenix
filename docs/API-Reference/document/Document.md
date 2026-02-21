### Import :
```js
const Document = brackets.getModule("document/Document")
```

<a name="Document"></a>

## Document
**Kind**: global class  

* [Document](#Document)
    * [new Document(file, initialTimestamp, rawText)](#new_Document_new)
    * _instance_
        * [.file](#Document+file) : <code>File</code>
        * [.language](#Document+language) : <code>Language</code>
        * [.isDirty](#Document+isDirty) : <code>boolean</code>
        * [.isSaving](#Document+isSaving) : <code>boolean</code>
        * [.diskTimestamp](#Document+diskTimestamp) : <code>Date</code>
        * [.lastChangeTimestamp](#Document+lastChangeTimestamp) : <code>number</code>
        * [.keepChangesTime](#Document+keepChangesTime) : <code>Number</code>
        * [.addRef()](#Document+addRef)
        * [.releaseRef()](#Document+releaseRef)
        * [.getText([useOriginalLineEndings])](#Document+getText) ⇒ <code>string</code>
        * [.getSelectedText([useOriginalLineEndings], [allSelections])](#Document+getSelectedText) ⇒ <code>string</code> \| <code>null</code>
        * [.setText(text)](#Document+setText)
        * [.refreshText(text, newTimestamp, initial)](#Document+refreshText)
        * [.replaceRange(text, start, end, origin)](#Document+replaceRange)
        * [.getRange(start, end)](#Document+getRange) ⇒ <code>string</code>
        * [.getLine(Zero-based)](#Document+getLine) ⇒ <code>string</code>
        * [.posFromIndex(index)](#Document+posFromIndex) ⇒ <code>Object</code>
        * [.batchOperation(doOperation)](#Document+batchOperation)
        * [.notifySaved()](#Document+notifySaved)
        * [.adjustPosForChange(pos, textLines, start, end)](#Document+adjustPosForChange) ⇒ <code>Object</code>
        * [.doMultipleEdits(edits, origin)](#Document+doMultipleEdits) ⇒ <code>Object</code>
        * [.getLanguage()](#Document+getLanguage) ⇒ <code>Language</code>
        * [.isUntitled()](#Document+isUntitled) ⇒ <code>boolean</code>
        * [.reload()](#Document+reload) ⇒ <code>promise</code>
    * _static_
        * [.normalizeText()](#Document.normalizeText)

<a name="new_Document_new"></a>

### new Document(file, initialTimestamp, rawText)
Model for the contents of a single file and its current modification state.
See DocumentManager documentation for important usage notes.

Document dispatches these events:

__change__ -- When the text of the editor changes (including due to undo/redo).

Passes ({'Document'}, {'ChangeList'}), where ChangeList is an array
of change record objects. Each change record looks like:
```js
    { from: start of change, expressed as {line: <line number>, ch: <character offset>},
      to: end of change, expressed as {line: <line number>, ch: <chracter offset>},
      text: array of lines of text to replace existing text }
```
The line and ch offsets are both 0-based.

The ch offset in "from" is inclusive, but the ch offset in "to" is exclusive. For example,
an insertion of new content (without replacing existing content) is expressed by a range
where from and to are the same.

If "from" and "to" are undefined, then this is a replacement of the entire text content.

IMPORTANT: If you listen for the "change" event, you MUST also addRef() the document
(and releaseRef() it whenever you stop listening). You should also listen to the "deleted"
event.

__deleted__ -- When the file for this document has been deleted. All views onto the document should
be closed. The document will no longer be editable or dispatch "change" events.

__languageChanged__ -- When the value of getLanguage() has changed. 2nd argument is the old value,
3rd argument is the new value.


| Param | Type | Description |
| --- | --- | --- |
| file | <code>File</code> | Need not lie within the project. |
| initialTimestamp | <code>Date</code> | File's timestamp when we read it off disk. |
| rawText | <code>string</code> | Text content of the file. |

<a name="Document+file"></a>

### document.file : <code>File</code>
The File for this document. Need not lie within the project.
If Document is untitled, this is an InMemoryFile object.

**Kind**: instance property of [<code>Document</code>](#Document)  
<a name="Document+language"></a>

### document.language : <code>Language</code>
The Language for this document. Will be resolved by file extension in the constructor

**Kind**: instance property of [<code>Document</code>](#Document)  
<a name="Document+isDirty"></a>

### document.isDirty : <code>boolean</code>
Whether this document has unsaved changes or not.
When this changes on any Document, DocumentManager dispatches a "dirtyFlagChange" event.

**Kind**: instance property of [<code>Document</code>](#Document)  
<a name="Document+isSaving"></a>

### document.isSaving : <code>boolean</code>
Whether this document is currently being saved.

**Kind**: instance property of [<code>Document</code>](#Document)  
<a name="Document+diskTimestamp"></a>

### document.diskTimestamp : <code>Date</code>
What we expect the file's timestamp to be on disk. If the timestamp differs from this, then
it means the file was modified by an app other than Brackets.

**Kind**: instance property of [<code>Document</code>](#Document)  
<a name="Document+lastChangeTimestamp"></a>

### document.lastChangeTimestamp : <code>number</code>
Keeps a running timestamp of when the document was last changed. You can use this timestamp to see a
document was recently changed or not.

**Kind**: instance property of [<code>Document</code>](#Document)  
<a name="Document+keepChangesTime"></a>

### document.keepChangesTime : <code>Number</code>
The timestamp of the document at the point where the user last said to keep changes that conflict
with the current disk version. Can also be -1, indicating that the file was deleted on disk at the
last point when the user said to keep changes, or null, indicating that the user has not said to
keep changes.
Note that this is a time as returned by Date.getTime(), not a Date object.

**Kind**: instance property of [<code>Document</code>](#Document)  
<a name="Document+addRef"></a>

### document.addRef()
Add a ref to keep this Document alive

**Kind**: instance method of [<code>Document</code>](#Document)  
<a name="Document+releaseRef"></a>

### document.releaseRef()
Remove a ref that was keeping this Document alive

**Kind**: instance method of [<code>Document</code>](#Document)  
<a name="Document+getText"></a>

### document.getText([useOriginalLineEndings]) ⇒ <code>string</code>
Returns the document's current contents; may not be saved to disk yet. Whenever this
value changes, the Document dispatches a "change" event.

**Kind**: instance method of [<code>Document</code>](#Document)  

| Param | Type | Description |
| --- | --- | --- |
| [useOriginalLineEndings] | <code>boolean</code> | If true, line endings in the result depend on the      Document's line endings setting (based on OS & the original text loaded from disk).      If false, line endings are always \n (like all the other Document text getter methods). |

<a name="Document+getSelectedText"></a>

### document.getSelectedText([useOriginalLineEndings], [allSelections]) ⇒ <code>string</code> \| <code>null</code>
Returns the document's current selected; may not be saved to disk yet. If editor is not open, will return null.

**Kind**: instance method of [<code>Document</code>](#Document)  
**Returns**: <code>string</code> \| <code>null</code> - selected text or null if there is no editor.  

| Param | Type | Description |
| --- | --- | --- |
| [useOriginalLineEndings] | <code>boolean</code> | If true, line endings in the result depend on the      Document's line endings setting (based on OS & the original text loaded from disk).      If false, line endings are always \n (like all the other Document text getter methods). |
| [allSelections] | <code>boolean</code> | Whether to return the contents of all selections (separated     by newlines) instead of just the primary selection. Default false. |

<a name="Document+setText"></a>

### document.setText(text)
Sets the contents of the document. Treated as an edit. Line endings will be rewritten to
match the document's current line-ending style.

**Kind**: instance method of [<code>Document</code>](#Document)  

| Param | Type | Description |
| --- | --- | --- |
| text | <code>string</code> | The text to replace the contents of the document with. |

<a name="Document+refreshText"></a>

### document.refreshText(text, newTimestamp, initial)
Sets the contents of the document. Treated as reloading the document from disk: the document
will be marked clean with a new timestamp, the undo/redo history is cleared, and we re-check
the text's line-ending style. CAN be called even if there is no backing editor.

**Kind**: instance method of [<code>Document</code>](#Document)  

| Param | Type | Description |
| --- | --- | --- |
| text | <code>string</code> | The text to replace the contents of the document with. |
| newTimestamp | <code>Date</code> | Timestamp of file at the time we read its new contents from disk. |
| initial | <code>boolean</code> | True if this is the initial load of the document. In that case,      we don't send change events. |

<a name="Document+replaceRange"></a>

### document.replaceRange(text, start, end, origin)
Adds, replaces, or removes text. If a range is given, the text at that range is replaced with the
given new text; if text == "", then the entire range is effectively deleted. If 'end' is omitted,
then the new text is inserted at that point and all existing text is preserved. Line endings will
be rewritten to match the document's current line-ending style.

IMPORTANT NOTE: Because of #1688, do not use this in cases where you might be
operating on a linked document (like the main document for an inline editor)
during an outer CodeMirror operation (like a key event that's handled by the
editor itself). A common case of this is code hints in inline editors. In
such cases, use `editor._codeMirror.replaceRange()` instead. This should be
fixed when we migrate to use CodeMirror's native document-linking functionality.

**Kind**: instance method of [<code>Document</code>](#Document)  

| Param | Type | Description |
| --- | --- | --- |
| text | <code>string</code> | Text to insert or replace the range with |
| start | <code>Object</code> | Start of range, inclusive (if 'to' specified) or insertion point (if not) |
| end | <code>Object</code> | End of range, exclusive; optional |
| origin | <code>string</code> | Optional string used to batch consecutive edits for undo.     If origin starts with "+", then consecutive edits with the same origin will be batched for undo if     they are close enough together in time.     If origin starts with "*", then all consecutive edit with the same origin will be batched for     undo.     Edits with origins starting with other characters will not be batched.     (Note that this is a higher level of batching than batchOperation(), which already batches all     edits within it for undo. Origin batching works across operations.) |

<a name="Document+getRange"></a>

### document.getRange(start, end) ⇒ <code>string</code>
Returns the characters in the given range. Line endings are normalized to '\n'.

**Kind**: instance method of [<code>Document</code>](#Document)  

| Param | Type | Description |
| --- | --- | --- |
| start | <code>Object</code> | Start of range, inclusive |
| end | <code>Object</code> | End of range, exclusive |

<a name="Document+getLine"></a>

### document.getLine(Zero-based) ⇒ <code>string</code>
Returns the text of the given line (excluding any line ending characters)

**Kind**: instance method of [<code>Document</code>](#Document)  

| Param | Type | Description |
| --- | --- | --- |
| Zero-based | <code>number</code> | line number |

<a name="Document+posFromIndex"></a>

### document.posFromIndex(index) ⇒ <code>Object</code>
Given a character index within the document text (assuming \n newlines),
returns the corresponding {line, ch} position. Works whether or not
a master editor is attached.

**Kind**: instance method of [<code>Document</code>](#Document)

| Param | Type | Description |
| --- | --- | --- |
| index | <code>number</code> | Zero-based character offset |

<a name="Document+batchOperation"></a>

### document.batchOperation(doOperation)
Batches a series of related Document changes. Repeated calls to replaceRange() should be wrapped in a
batch for efficiency. Begins the batch, calls doOperation(), ends the batch, and then returns.

**Kind**: instance method of [<code>Document</code>](#Document)  

| Param | Type |
| --- | --- |
| doOperation | <code>function</code> | 

<a name="Document+notifySaved"></a>

### document.notifySaved()
Called when the document is saved (which currently happens in DocumentCommandHandlers). Marks the
document not dirty and notifies listeners of the save.

**Kind**: instance method of [<code>Document</code>](#Document)  
<a name="Document+adjustPosForChange"></a>

### document.adjustPosForChange(pos, textLines, start, end) ⇒ <code>Object</code>
Adjusts a given position taking a given replaceRange-type edit into account.
If the position is within the original edit range (start and end inclusive),
it gets pushed to the end of the content that replaced the range. Otherwise,
if it's after the edit, it gets adjusted so it refers to the same character
it did before the edit.

**Kind**: instance method of [<code>Document</code>](#Document)  
**Returns**: <code>Object</code> - The adjusted position.  

| Param | Type | Description |
| --- | --- | --- |
| pos | <code>Object</code> | The position to adjust. |
| textLines | <code>Array.&lt;string&gt;</code> | The text of the change, split into an array of lines. |
| start | <code>Object</code> | The start of the edit. |
| end | <code>Object</code> | The end of the edit. |

<a name="Document+doMultipleEdits"></a>

### document.doMultipleEdits(edits, origin) ⇒ <code>Object</code>
Helper function for edit operations that operate on multiple selections. Takes an "edit list"
that specifies a list of replaceRanges that should occur, but where all the positions are with
respect to the document state before all the edits (i.e., you don't have to figure out how to fix
up the selections after each sub-edit). Edits must be non-overlapping (in original-document terms).
All the edits are done in a single batch.

If your edits are structured in such a way that each individual edit would cause its associated
selection to be properly updated, then all you need to specify are the edits themselves, and the
selections will automatically be updated as the edits are performed. However, for some
kinds of edits, you need to fix up the selection afterwards. In that case, you can specify one
or more selections to be associated with each edit. Those selections are assumed to be in terms
of the document state after the edit, *as if* that edit were the only one being performed (i.e.,
you don't have to worry about adjusting for the effect of other edits). If you supply these selections,
then this function will adjust them as necessary for the effects of other edits, and then return a
flat list of all the selections, suitable for passing to `setSelections()`.

**Kind**: instance method of [<code>Document</code>](#Document)  
**Returns**: <code>Object</code> - The list of passed selections adjusted for the performed edits, if any.  

| Param | Type | Description |
| --- | --- | --- |
| edits | <code>Object</code> | Specifies the list of edits to perform in a manner similar to CodeMirror's `replaceRange`. This array     will be mutated.     `edit` is the edit to perform:         `text` will replace the current contents of the range between `start` and `end`.         If `end` is unspecified, the text is inserted at `start`.         `start` and `end` should be positions relative to the document *ignoring* all other edit descriptions         (i.e., as if you were only performing this one edit on the document).     If any of the edits overlap, an error will be thrown.     If `selection` is specified, it should be a selection associated with this edit.          If `isBeforeEdit` is set on the selection, the selection will be fixed up for this edit.          If not, it won't be fixed up for this edit, meaning it should be expressed in terms of          the document state after this individual edit is performed (ignoring any other edits).          Note that if you were planning on just specifying `isBeforeEdit` for every selection, you can          accomplish the same thing by simply not passing any selections and letting the editor update          the existing selections automatically.     Note that `edit` and `selection` can each be either an individual edit/selection, or a group of     edits/selections to apply in order. This can be useful if you need to perform multiple edits in a row     and then specify a resulting selection that shouldn't be fixed up for any of those edits (but should be     fixed up for edits related to other selections). It can also be useful if you have several selections     that should ignore the effects of a given edit because you've fixed them up already (this commonly happens     with line-oriented edits where multiple cursors on the same line should be ignored, but still tracked).     Within an edit group, edit positions must be specified relative to previous edits within that group. Also,     the total bounds of edit groups must not overlap (e.g. edits in one group can't surround an edit from another group). |
| origin | <code>string</code> | An optional edit origin that's passed through to each replaceRange(). |

<a name="Document+getLanguage"></a>

### document.getLanguage() ⇒ <code>Language</code>
Returns the language this document is written in.
The language returned is based on the file extension.

**Kind**: instance method of [<code>Document</code>](#Document)  
**Returns**: <code>Language</code> - An object describing the language used in this document  
<a name="Document+isUntitled"></a>

### document.isUntitled() ⇒ <code>boolean</code>
Is this an untitled document?

**Kind**: instance method of [<code>Document</code>](#Document)  
**Returns**: <code>boolean</code> - - whether or not the document is untitled  
<a name="Document+reload"></a>

### document.reload() ⇒ <code>promise</code>
Reloads the document from FileSystem

**Kind**: instance method of [<code>Document</code>](#Document)  
**Returns**: <code>promise</code> - - to check if reload was successful or not  
<a name="Document.normalizeText"></a>

### Document.normalizeText()
Normalizes line endings the same way CodeMirror would

**Kind**: static method of [<code>Document</code>](#Document)  
