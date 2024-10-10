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
        * [._refCount](#Document+_refCount)
        * [.file](#Document+file) : <code>File</code>
        * [.language](#Document+language) : <code>Language</code>
        * [.isDirty](#Document+isDirty) : <code>boolean</code>
        * [.isSaving](#Document+isSaving) : <code>boolean</code>
        * [.diskTimestamp](#Document+diskTimestamp) : <code>Date</code>
        * [.lastChangeTimestamp](#Document+lastChangeTimestamp) : <code>number</code>
        * [.keepChangesTime](#Document+keepChangesTime) : <code>Number</code>
        * [._refreshInProgress](#Document+_refreshInProgress) : <code>boolean</code>
        * [._text](#Document+_text) : <code>string</code>
        * [._masterEditor](#Document+_masterEditor) : <code>Editor</code>
        * [._lineEndings](#Document+_lineEndings) : <code>FileUtils.LINE\_ENDINGS\_CRLF</code> \| <code>FileUtils.LINE\_ENDINGS\_LF</code>
        * [.addRef()](#Document+addRef)
        * [.releaseRef()](#Document+releaseRef)
        * [._makeEditable(masterEditor)](#Document+_makeEditable)
        * [._makeNonEditable()](#Document+_makeNonEditable)
        * [._toggleMasterEditor()](#Document+_toggleMasterEditor)
        * [._checkAssociatedEditorForPane(paneId)](#Document+_checkAssociatedEditorForPane) ⇒ <code>Editor</code>
        * [._disassociateEditor()](#Document+_disassociateEditor)
        * [._associateEditor()](#Document+_associateEditor)
        * [._ensureMasterEditor()](#Document+_ensureMasterEditor)
        * [.getText([useOriginalLineEndings])](#Document+getText) ⇒ <code>string</code>
        * [.getSelectedText([useOriginalLineEndings], [allSelections])](#Document+getSelectedText) ⇒ <code>string</code> \| <code>null</code>
        * [.setText(text)](#Document+setText)
        * [.refreshText(text, newTimestamp, initial)](#Document+refreshText)
        * [.replaceRange(text, start, end, origin)](#Document+replaceRange)
        * [.getRange(start, end)](#Document+getRange) ⇒ <code>string</code>
        * [.getLine(Zero-based)](#Document+getLine) ⇒ <code>string</code>
        * [.batchOperation(doOperation)](#Document+batchOperation)
        * [.notifySaved()](#Document+notifySaved)
        * [.adjustPosForChange(pos, textLines, start, end)](#Document+adjustPosForChange) ⇒ <code>Object</code>
        * [.doMultipleEdits(edits, origin)](#Document+doMultipleEdits) ⇒ <code>Object</code>
        * [.getLanguage()](#Document+getLanguage) ⇒ <code>Language</code>
        * [._updateLanguage()](#Document+_updateLanguage)
        * [._notifyFilePathChanged()](#Document+_notifyFilePathChanged)
        * [.isUntitled()](#Document+isUntitled) ⇒ <code>boolean</code>
        * [.reload()](#Document+reload) ⇒ <code>promise</code>
    * _static_
        * [.normalizeText()](#Document.normalizeText)

<a name="new_Document_new"></a>

### new Document(file, initialTimestamp, rawText)
Model for the contents of a single file and its current modification state.


| Param | Type | Description |
| --- | --- | --- |
| file | <code>File</code> | Need not lie within the project. |
| initialTimestamp | <code>Date</code> | File's timestamp when we read it off disk. |
| rawText | <code>string</code> | Text content of the file. |

<a name="Document+_refCount"></a>

### document.\_refCount
Number of clients who want this Document to stay alive. The Document is listed in

**Kind**: instance property of [<code>Document</code>](#Document)  
<a name="Document+file"></a>

### document.file : <code>File</code>
The File for this document. Need not lie within the project.

**Kind**: instance property of [<code>Document</code>](#Document)  
<a name="Document+language"></a>

### document.language : <code>Language</code>
The Language for this document. Will be resolved by file extension in the constructor

**Kind**: instance property of [<code>Document</code>](#Document)  
<a name="Document+isDirty"></a>

### document.isDirty : <code>boolean</code>
Whether this document has unsaved changes or not.

**Kind**: instance property of [<code>Document</code>](#Document)  
<a name="Document+isSaving"></a>

### document.isSaving : <code>boolean</code>
Whether this document is currently being saved.

**Kind**: instance property of [<code>Document</code>](#Document)  
<a name="Document+diskTimestamp"></a>

### document.diskTimestamp : <code>Date</code>
What we expect the file's timestamp to be on disk. If the timestamp differs from this, then

**Kind**: instance property of [<code>Document</code>](#Document)  
<a name="Document+lastChangeTimestamp"></a>

### document.lastChangeTimestamp : <code>number</code>
Keeps a running timestamp of when the document was last changed. You can use this timestamp to see a

**Kind**: instance property of [<code>Document</code>](#Document)  
<a name="Document+keepChangesTime"></a>

### document.keepChangesTime : <code>Number</code>
The timestamp of the document at the point where the user last said to keep changes that conflict

**Kind**: instance property of [<code>Document</code>](#Document)  
<a name="Document+_refreshInProgress"></a>

### document.\_refreshInProgress : <code>boolean</code>
True while refreshText() is in progress and change notifications shouldn't trip the dirty flag.

**Kind**: instance property of [<code>Document</code>](#Document)  
<a name="Document+_text"></a>

### document.\_text : <code>string</code>
The text contents of the file, or null if our backing model is _masterEditor.

**Kind**: instance property of [<code>Document</code>](#Document)  
<a name="Document+_masterEditor"></a>

### document.\_masterEditor : <code>Editor</code>
Editor object representing the full-size editor UI for this document. May be null if Document

**Kind**: instance property of [<code>Document</code>](#Document)  
<a name="Document+_lineEndings"></a>

### document.\_lineEndings : <code>FileUtils.LINE\_ENDINGS\_CRLF</code> \| <code>FileUtils.LINE\_ENDINGS\_LF</code>
The content's line-endings style. If a Document is created on empty text, or text with

**Kind**: instance property of [<code>Document</code>](#Document)  
<a name="Document+addRef"></a>

### document.addRef()
Add a ref to keep this Document alive

**Kind**: instance method of [<code>Document</code>](#Document)  
<a name="Document+releaseRef"></a>

### document.releaseRef()
Remove a ref that was keeping this Document alive

**Kind**: instance method of [<code>Document</code>](#Document)  
<a name="Document+_makeEditable"></a>

### document.\_makeEditable(masterEditor)
Attach a backing Editor to the Document, enabling setText() to be called. Assumes Editor has

**Kind**: instance method of [<code>Document</code>](#Document)  

| Param | Type |
| --- | --- |
| masterEditor | <code>Editor</code> | 

<a name="Document+_makeNonEditable"></a>

### document.\_makeNonEditable()
Detach the backing Editor from the Document, disallowing setText(). The text content is

**Kind**: instance method of [<code>Document</code>](#Document)  
<a name="Document+_toggleMasterEditor"></a>

### document.\_toggleMasterEditor()
Toggles the master editor which has gained focus from a pool of full editors

**Kind**: instance method of [<code>Document</code>](#Document)  
<a name="Document+_checkAssociatedEditorForPane"></a>

### document.\_checkAssociatedEditorForPane(paneId) ⇒ <code>Editor</code>
Checks and returns if a full editor exists for the provided pane attached to this document

**Kind**: instance method of [<code>Document</code>](#Document)  
**Returns**: <code>Editor</code> - Attached editor bound to the provided pane id  

| Param | Type |
| --- | --- |
| paneId | <code>String</code> | 

<a name="Document+_disassociateEditor"></a>

### document.\_disassociateEditor()
Disassociates an editor from this document if present in the associated editor list

**Kind**: instance method of [<code>Document</code>](#Document)  
<a name="Document+_associateEditor"></a>

### document.\_associateEditor()
Aassociates a full editor to this document

**Kind**: instance method of [<code>Document</code>](#Document)  
<a name="Document+_ensureMasterEditor"></a>

### document.\_ensureMasterEditor()
Guarantees that _masterEditor is non-null. If needed, asks EditorManager to create a new master

**Kind**: instance method of [<code>Document</code>](#Document)  
<a name="Document+getText"></a>

### document.getText([useOriginalLineEndings]) ⇒ <code>string</code>
Returns the document's current contents; may not be saved to disk yet. Whenever this

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

**Kind**: instance method of [<code>Document</code>](#Document)  

| Param | Type | Description |
| --- | --- | --- |
| text | <code>string</code> | The text to replace the contents of the document with. |

<a name="Document+refreshText"></a>

### document.refreshText(text, newTimestamp, initial)
Sets the contents of the document. Treated as reloading the document from disk: the document

**Kind**: instance method of [<code>Document</code>](#Document)  

| Param | Type | Description |
| --- | --- | --- |
| text | <code>string</code> | The text to replace the contents of the document with. |
| newTimestamp | <code>Date</code> | Timestamp of file at the time we read its new contents from disk. |
| initial | <code>boolean</code> | True if this is the initial load of the document. In that case,      we don't send change events. |

<a name="Document+replaceRange"></a>

### document.replaceRange(text, start, end, origin)
Adds, replaces, or removes text. If a range is given, the text at that range is replaced with the

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

<a name="Document+batchOperation"></a>

### document.batchOperation(doOperation)
Batches a series of related Document changes. Repeated calls to replaceRange() should be wrapped in a

**Kind**: instance method of [<code>Document</code>](#Document)  

| Param | Type |
| --- | --- |
| doOperation | <code>function</code> | 

<a name="Document+notifySaved"></a>

### document.notifySaved()
Called when the document is saved (which currently happens in DocumentCommandHandlers). Marks the

**Kind**: instance method of [<code>Document</code>](#Document)  
<a name="Document+adjustPosForChange"></a>

### document.adjustPosForChange(pos, textLines, start, end) ⇒ <code>Object</code>
Adjusts a given position taking a given replaceRange-type edit into account.

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

**Kind**: instance method of [<code>Document</code>](#Document)  
**Returns**: <code>Object</code> - The list of passed selections adjusted for the performed edits, if any.  

| Param | Type | Description |
| --- | --- | --- |
| edits | <code>Object</code> | Specifies the list of edits to perform in a manner similar to CodeMirror's `replaceRange`. This array     will be mutated.     `edit` is the edit to perform:         `text` will replace the current contents of the range between `start` and `end`.         If `end` is unspecified, the text is inserted at `start`.         `start` and `end` should be positions relative to the document *ignoring* all other edit descriptions         (i.e., as if you were only performing this one edit on the document).     If any of the edits overlap, an error will be thrown.     If `selection` is specified, it should be a selection associated with this edit.          If `isBeforeEdit` is set on the selection, the selection will be fixed up for this edit.          If not, it won't be fixed up for this edit, meaning it should be expressed in terms of          the document state after this individual edit is performed (ignoring any other edits).          Note that if you were planning on just specifying `isBeforeEdit` for every selection, you can          accomplish the same thing by simply not passing any selections and letting the editor update          the existing selections automatically.     Note that `edit` and `selection` can each be either an individual edit/selection, or a group of     edits/selections to apply in order. This can be useful if you need to perform multiple edits in a row     and then specify a resulting selection that shouldn't be fixed up for any of those edits (but should be     fixed up for edits related to other selections). It can also be useful if you have several selections     that should ignore the effects of a given edit because you've fixed them up already (this commonly happens     with line-oriented edits where multiple cursors on the same line should be ignored, but still tracked).     Within an edit group, edit positions must be specified relative to previous edits within that group. Also,     the total bounds of edit groups must not overlap (e.g. edits in one group can't surround an edit from another group). |
| origin | <code>string</code> | An optional edit origin that's passed through to each replaceRange(). |

<a name="Document+getLanguage"></a>

### document.getLanguage() ⇒ <code>Language</code>
Returns the language this document is written in.

**Kind**: instance method of [<code>Document</code>](#Document)  
**Returns**: <code>Language</code> - An object describing the language used in this document  
<a name="Document+_updateLanguage"></a>

### document.\_updateLanguage()
Updates the language to match the current mapping given by LanguageManager

**Kind**: instance method of [<code>Document</code>](#Document)  
<a name="Document+_notifyFilePathChanged"></a>

### document.\_notifyFilePathChanged()
Called when Document.file has been modified (due to a rename)

**Kind**: instance method of [<code>Document</code>](#Document)  
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
<a name="oneOrEach"></a>

## oneOrEach()
Like _.each(), but if given a single item not in an array, acts as

**Kind**: global function  