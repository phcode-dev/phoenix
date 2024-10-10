### Import :
```js
const DocumentManager = brackets.getModule("document/DocumentManager")
```

<a name="_"></a>

## \_
DocumentManager maintains a list of currently 'open' Documents. The DocumentManager is responsiblefor coordinating document operations and dispatching certain document events.Document is the model for a file's contents; it dispatches events whenever those contents change.To transiently inspect a file's content, simply get a Document and call getText() on it. However,to be notified of Document changes or to modify a Document, you MUST call addRef() to ensure theDocument instance 'stays alive' and is shared by all other who read/modify that file. ('Open'Documents are all Documents that are 'kept alive', i.e. have ref count > 0).To get a Document, call getDocumentForPath(); never new up a Document yourself.Secretly, a Document may use an Editor instance to act as the model for its internal state. (Thisis unavoidable because CodeMirror does not separate its model from its UI). Documents are notmodifiable until they have a backing 'master Editor'. Creation of the backing Editor is owned byEditorManager. A Document only gets a backing Editor if it opened in an editor.A non-modifiable Document may still dispatch change notifications, if the Document was changedexternally on disk.Aside from the text content, Document tracks a few pieces of metadata - notably, whether there areany unsaved changes.This module dispatches several events:   - dirtyFlagChange -- When any Document's isDirty flag changes. The 2nd arg to the listener is the     Document whose flag changed.   - documentSaved -- When a Document's changes have been saved. The 2nd arg to the listener is the     Document that has been saved.   - documentRefreshed -- When a Document's contents have been reloaded from disk. The 2nd arg to the     listener is the Document that has been refreshed.NOTE: WorkingSet APIs have been deprecated and have moved to MainViewManager as WorkingSet APIs      Some WorkingSet APIs that have been identified as being used by 3rd party extensions will      emit deprecation warnings and call the WorkingSet APIS to maintain backwards compatibility   - currentDocumentChange -- Deprecated: use EditorManager activeEditorChange (which covers all editors,     not just full-sized editors) or MainViewManager currentFileChange (which covers full-sized views     only, but is also triggered for non-editor views e.g. image files).   - fileNameChange -- When the name of a file or folder has changed. The 2nd arg is the old name.     The 3rd arg is the new name.  Generally, however, file objects have already been changed by the     time this event is dispatched so code that relies on matching the filename to a file object     will need to compare the newname.   - pathDeleted -- When a file or folder has been deleted. The 2nd arg is the path that was deleted.To listen for events, do something like this: (see EventDispatcher for details on this pattern)   DocumentManager.on("eventname", handler);Document objects themselves also dispatch some events - see Document docs for details.

**Kind**: global variable  
<a name="getOpenDocumentForPath"></a>

## getOpenDocumentForPath(fullPath) ⇒ <code>Document</code>
Returns the existing open Document for the given file, or null if the file is not open ('open'means referenced by the UI somewhere). If you will hang onto the Document, you must addRef()it; see [#getDocumentForPath](#getDocumentForPath) for details.

**Kind**: global function  

| Param | Type |
| --- | --- |
| fullPath | <code>string</code> | 

<a name="getCurrentDocument"></a>

## getCurrentDocument() ⇒ <code>Document</code>
Returns the Document that is currently open in the editor UI. May be null.

**Kind**: global function  
<a name="getWorkingSet"></a>

## ..getWorkingSet() ⇒ <code>Array.&lt;File&gt;</code>..
***Deprecated***

Returns a list of items in the working set in UI list order. May be 0-length, but never null.

**Kind**: global function  
<a name="findInWorkingSet"></a>

## ..findInWorkingSet(fullPath) ⇒ <code>number</code>..
***Deprecated***

Returns the index of the file matching fullPath in the working set.

**Kind**: global function  
**Returns**: <code>number</code> - index, -1 if not found  

| Param | Type |
| --- | --- |
| fullPath | <code>string</code> | 

<a name="getAllOpenDocuments"></a>

## getAllOpenDocuments() ⇒ <code>Array.&lt;Document&gt;</code>
Returns all Documents that are 'open' in the UI somewhere (for now, this means open in aninline editor and/or a full-size editor). Only these Documents can be modified, and onlythese Documents are synced with external changes on disk.

**Kind**: global function  
<a name="addToWorkingSet"></a>

## ..addToWorkingSet(file, [index], [forceRedraw])..
***Deprecated***

Adds the given file to the end of the working set list.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| file | <code>File</code> |  |
| [index] | <code>number</code> | Position to add to list (defaults to last); -1 is ignored |
| [forceRedraw] | <code>boolean</code> | If true, a working set change notification is always sent    (useful if suppressRedraw was used with removeFromWorkingSet() earlier) |

<a name="addListToWorkingSet"></a>

## ..addListToWorkingSet(fileList)..
***Deprecated***

**Kind**: global function  

| Param | Type |
| --- | --- |
| fileList | <code>Array.&lt;File&gt;</code> | 

<a name="removeListFromWorkingSet"></a>

## ..removeListFromWorkingSet(list)..
***Deprecated***

closes a list of files

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| list | <code>Array.&lt;File&gt;</code> | list of File objectgs to close |

<a name="closeAll"></a>

## ..closeAll()..
***Deprecated***

closes all open files

**Kind**: global function  
<a name="closeFullEditor"></a>

## ..closeFullEditor(file)..
***Deprecated***

closes the specified file file

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| file | <code>File</code> | the file to close |

<a name="setCurrentDocument"></a>

## ..setCurrentDocument(document)..
***Deprecated***

opens the specified document for editing in the currently active pane

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| document | <code>Document</code> | The Document to make current. |

<a name="beginDocumentNavigation"></a>

## ..beginDocumentNavigation()..
***Deprecated***

freezes the Working Set MRU list

**Kind**: global function  
<a name="finalizeDocumentNavigation"></a>

## ..finalizeDocumentNavigation()..
***Deprecated***

ends document navigation and moves the current file to the front of the MRU list in the Working Set

**Kind**: global function  
<a name="getNextPrevFile"></a>

## ..getNextPrevFile()..
***Deprecated***

Get the next or previous file in the working set, in MRU order (relative to currentDocument). Mayreturn currentDocument itself if working set is length 1.

**Kind**: global function  
<a name="_gcDocuments"></a>

## \_gcDocuments()
Cleans up any loose Documents whose only ref is its own master Editor, and that Editor is notrooted in the UI anywhere. This can happen if the Editor is auto-created via Document APIs thattrigger _ensureMasterEditor() without making it dirty. E.g. a command invoked on the focusedinline editor makes no-op edits or does a read-only operation.

**Kind**: global function  
<a name="getDocumentForPath"></a>

## getDocumentForPath(fullPath, fileObj) ⇒ <code>$.Promise</code>
Gets an existing open Document for the given file, or creates a new one if the Document isnot currently open ('open' means referenced by the UI somewhere). Always use this method toget Documents; do not call the Document constructor directly. This method is safe to callin parallel.If you are going to hang onto the Document for more than just the duration of a command - e.g.if you are going to display its contents in a piece of UI - then you must addRef() the Documentand listen for changes on it. (Note: opening the Document in an Editor automatically managesrefs and listeners for that Editor UI).If all you need is the Document's getText() value, use the faster getDocumentText() instead.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that will be resolved with the Document, or rejected     with a FileSystemError if the file is not yet open and can't be read from disk.  

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> |  |
| fileObj | <code>object</code> | actual File|RemoteFile or some other protocol adapter handle |

<a name="getDocumentText"></a>

## getDocumentText(file, [checkLineEndings]) ⇒ <code>$.Promise</code>
Gets the text of a Document (including any unsaved changes), or would-be Document if thefile is not actually open. More efficient than getDocumentForPath(). Use when you're readingdocument(s) but don't need to hang onto a Document object.If the file is open this is equivalent to calling getOpenDocumentForPath().getText(). If thefile is NOT open, this is like calling getDocumentForPath()...getText() but more efficient.Differs from plain FileUtils.readAsText() in two ways: (a) line endings are still normalizedas in Document.getText(); (b) unsaved changes are returned if there are any.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise that is resolved with three parameters:         contents - string: the document's text         timestamp - Date: the last time the document was changed on disk (might not be the same as the last time it was changed in memory)         lineEndings - string: the original line endings of the file, one of the FileUtils.LINE_ENDINGS_* constants;             will be null if checkLineEndings was false.    or rejected with a filesystem error.  

| Param | Type | Description |
| --- | --- | --- |
| file | <code>File</code> | The file to get the text for. |
| [checkLineEndings] | <code>boolean</code> | Whether to return line ending information. Default false (slightly more efficient). |

<a name="createUntitledDocument"></a>

## createUntitledDocument(counter, fileExt) ⇒ <code>Document</code>
Creates an untitled document. The associated File has a fullPath thatlooks like /some-random-string/Untitled-counter.fileExt.

**Kind**: global function  
**Returns**: <code>Document</code> - - a new untitled Document  

| Param | Type | Description |
| --- | --- | --- |
| counter | <code>number</code> | used in the name of the new Document's File |
| fileExt | <code>string</code> | file extension of the new Document's File, including "." |

<a name="notifyFileDeleted"></a>

## notifyFileDeleted(file)
Reacts to a file being deleted: if there is a Document for this file, causes it to dispatch a"deleted" event; ensures it's not the currentDocument; and removes this file from the workingset. These actions in turn cause all open editors for this file to close. Discards any unsavedchanges - it is expected that the UI has already confirmed with the user before calling.To simply close a main editor when the file hasn't been deleted, use closeFullEditor() or FILE_CLOSE.FUTURE: Instead of an explicit notify, we should eventually listen for deletion events on somesort of "project file model," making this just a private event handler.NOTE: This function is not for general consumption, is considered private and may be deprecated       without warning in a future release.

**Kind**: global function  

| Param | Type |
| --- | --- |
| file | <code>File</code> | 

<a name="notifyPathDeleted"></a>

## notifyPathDeleted(fullPath)
Called after a file or folder has been deleted. This function is responsiblefor updating underlying model data and notifying all views of the change.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> | The path of the file/folder that has been deleted |

<a name="notifyPathNameChanged"></a>

## notifyPathNameChanged(oldName, newName)
Called after a file or folder name has changed. This function is responsiblefor updating underlying model data and notifying all views of the change.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| oldName | <code>string</code> | The old name of the file/folder |
| newName | <code>string</code> | The new name of the file/folder |

