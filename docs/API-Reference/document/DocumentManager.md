### Import :
```js
const DocumentManager = brackets.getModule("document/DocumentManager")
```

<a name="_"></a>

## \_
DocumentManager maintains a list of currently 'open' Documents. The DocumentManager is responsible
for coordinating document operations and dispatching certain document events.

Document is the model for a file's contents; it dispatches events whenever those contents change.
To transiently inspect a file's content, simply get a Document and call getText() on it. However,
to be notified of Document changes or to modify a Document, you MUST call addRef() to ensure the
Document instance 'stays alive' and is shared by all other who read/modify that file. ('Open'
Documents are all Documents that are 'kept alive', i.e. have ref count > 0).

To get a Document, call getDocumentForPath(); never new up a Document yourself.

Secretly, a Document may use an Editor instance to act as the model for its internal state. (This
is unavoidable because CodeMirror does not separate its model from its UI). Documents are not
modifiable until they have a backing 'master Editor'. Creation of the backing Editor is owned by
EditorManager. A Document only gets a backing Editor if it opened in an editor.

A non-modifiable Document may still dispatch change notifications, if the Document was changed
externally on disk.

Aside from the text content, Document tracks a few pieces of metadata - notably, whether there are
any unsaved changes.

This module dispatches several events:

   - dirtyFlagChange -- When any Document's isDirty flag changes. The 2nd arg to the listener is the
     Document whose flag changed.
   - documentSaved -- When a Document's changes have been saved. The 2nd arg to the listener is the
     Document that has been saved.
   - documentRefreshed -- When a Document's contents have been reloaded from disk. The 2nd arg to the
     listener is the Document that has been refreshed.

NOTE: WorkingSet APIs have been deprecated and have moved to MainViewManager as WorkingSet APIs
      Some WorkingSet APIs that have been identified as being used by 3rd party extensions will
      emit deprecation warnings and call the WorkingSet APIS to maintain backwards compatibility

   - currentDocumentChange -- Deprecated: use EditorManager activeEditorChange (which covers all editors,
     not just full-sized editors) or MainViewManager currentFileChange (which covers full-sized views
     only, but is also triggered for non-editor views e.g. image files).

   - fileNameChange -- When the name of a file or folder has changed. The 2nd arg is the old name.
     The 3rd arg is the new name.  Generally, however, file objects have already been changed by the
     time this event is dispatched so code that relies on matching the filename to a file object
     will need to compare the newname.

   - pathDeleted -- When a file or folder has been deleted. The 2nd arg is the path that was deleted.

To listen for events, do something like this: (see EventDispatcher for details on this pattern)
   DocumentManager.on("eventname", handler);

Document objects themselves also dispatch some events - see Document docs for details.

**Kind**: global variable  
<a name="EVENT_AFTER_DOCUMENT_CREATE"></a>

## EVENT\_AFTER\_DOCUMENT\_CREATE : <code>string</code>
Event triggered after a document is created.

**Kind**: global constant  
<a name="EVENT_PATH_DELETED"></a>

## EVENT\_PATH\_DELETED : <code>string</code>
Event triggered when a file or folder path is deleted.

**Kind**: global constant  
<a name="EVENT_FILE_NAME_CHANGE"></a>

## EVENT\_FILE\_NAME\_CHANGE : <code>string</code>
Event triggered when a file's name changes.

**Kind**: global constant  
<a name="EVENT_BEFORE_DOCUMENT_DELETE"></a>

## EVENT\_BEFORE\_DOCUMENT\_DELETE : <code>string</code>
Event triggered before a document is deleted.

**Kind**: global constant  
<a name="EVENT_DOCUMENT_REFRESHED"></a>

## EVENT\_DOCUMENT\_REFRESHED : <code>string</code>
Event triggered when a document is refreshed.

**Kind**: global constant  
<a name="EVENT_DOCUMENT_CHANGE"></a>

## EVENT\_DOCUMENT\_CHANGE : <code>string</code>
Event triggered when a document's content changes.

**Kind**: global constant  
<a name="EVENT_DIRTY_FLAG_CHANGED"></a>

## EVENT\_DIRTY\_FLAG\_CHANGED : <code>string</code>
Event triggered when the document's dirty flag changes,
indicating if the document has unsaved changes.

**Kind**: global constant  
<a name="getOpenDocumentForPath"></a>

## getOpenDocumentForPath(fullPath) ⇒ <code>Document</code>
Returns the existing open Document for the given file, or null if the file is not open ('open'
means referenced by the UI somewhere). If you will hang onto the Document, you must addRef()
it; see [#getDocumentForPath](#getDocumentForPath) for details.

**Kind**: global function  

| Param | Type |
| --- | --- |
| fullPath | <code>string</code> | 

<a name="getAllOpenDocuments"></a>

## getAllOpenDocuments() ⇒ <code>Array.&lt;Document&gt;</code>
Returns all Documents that are 'open' in the UI somewhere (for now, this means open in an
inline editor and/or a full-size editor). Only these Documents can be modified, and only
these Documents are synced with external changes on disk.

**Kind**: global function  
<a name="getDocumentForPath"></a>

## getDocumentForPath(fullPath, fileObj) ⇒ <code>$.Promise</code>
Gets an existing open Document for the given file, or creates a new one if the Document is
not currently open ('open' means referenced by the UI somewhere). Always use this method to
get Documents; do not call the Document constructor directly. This method is safe to call
in parallel.

If you are going to hang onto the Document for more than just the duration of a command - e.g.
if you are going to display its contents in a piece of UI - then you must addRef() the Document
and listen for changes on it. (Note: opening the Document in an Editor automatically manages
refs and listeners for that Editor UI).

If all you need is the Document's getText() value, use the faster getDocumentText() instead.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that will be resolved with the Document, or rejected
     with a FileSystemError if the file is not yet open and can't be read from disk.  

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> |  |
| fileObj | <code>object</code> | actual File|RemoteFile or some other protocol adapter handle |

<a name="getDocumentText"></a>

## getDocumentText(file, [checkLineEndings]) ⇒ <code>$.Promise</code>
Gets the text of a Document (including any unsaved changes), or would-be Document if the
file is not actually open. More efficient than getDocumentForPath(). Use when you're reading
document(s) but don't need to hang onto a Document object.

If the file is open this is equivalent to calling getOpenDocumentForPath().getText(). If the
file is NOT open, this is like calling getDocumentForPath()...getText() but more efficient.
Differs from plain FileUtils.readAsText() in two ways: (a) line endings are still normalized
as in Document.getText(); (b) unsaved changes are returned if there are any.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise that is resolved with three parameters:
         contents - string: the document's text
         timestamp - Date: the last time the document was changed on disk (might not be the same as the last time it was changed in memory)
         lineEndings - string: the original line endings of the file, one of the FileUtils.LINE_ENDINGS_* constants;
             will be null if checkLineEndings was false.
    or rejected with a filesystem error.  

| Param | Type | Description |
| --- | --- | --- |
| file | <code>File</code> | The file to get the text for. |
| [checkLineEndings] | <code>boolean</code> | Whether to return line ending information. Default false (slightly more efficient). |

<a name="createUntitledDocument"></a>

## createUntitledDocument(counter, fileExt) ⇒ <code>Document</code>
Creates an untitled document. The associated File has a fullPath that
looks like /some-random-string/Untitled-counter.fileExt.

**Kind**: global function  
**Returns**: <code>Document</code> - - a new untitled Document  

| Param | Type | Description |
| --- | --- | --- |
| counter | <code>number</code> | used in the name of the new Document's File |
| fileExt | <code>string</code> | file extension of the new Document's File, including "." |

