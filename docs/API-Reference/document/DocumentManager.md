### Import :
```js
const DocumentManager = brackets.getModule("document/DocumentManager")
```

<a name="_"></a>

## \_
DocumentManager maintains a list of currently 'open' Documents. The DocumentManager is responsible

**Kind**: global variable  
<a name="getOpenDocumentForPath"></a>

## getOpenDocumentForPath(fullPath) ⇒ <code>Document</code>
Returns the existing open Document for the given file, or null if the file is not open ('open'

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
Returns all Documents that are 'open' in the UI somewhere (for now, this means open in an

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

Get the next or previous file in the working set, in MRU order (relative to currentDocument). May

**Kind**: global function  
<a name="_gcDocuments"></a>

## \_gcDocuments()
Cleans up any loose Documents whose only ref is its own master Editor, and that Editor is not

**Kind**: global function  
<a name="getDocumentForPath"></a>

## getDocumentForPath(fullPath, fileObj) ⇒ <code>$.Promise</code>
Gets an existing open Document for the given file, or creates a new one if the Document is

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that will be resolved with the Document, or rejected

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> |  |
| fileObj | <code>object</code> | actual File|RemoteFile or some other protocol adapter handle |

<a name="getDocumentText"></a>

## getDocumentText(file, [checkLineEndings]) ⇒ <code>$.Promise</code>
Gets the text of a Document (including any unsaved changes), or would-be Document if the

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise that is resolved with three parameters:

| Param | Type | Description |
| --- | --- | --- |
| file | <code>File</code> | The file to get the text for. |
| [checkLineEndings] | <code>boolean</code> | Whether to return line ending information. Default false (slightly more efficient). |

<a name="createUntitledDocument"></a>

## createUntitledDocument(counter, fileExt) ⇒ <code>Document</code>
Creates an untitled document. The associated File has a fullPath that

**Kind**: global function  
**Returns**: <code>Document</code> - - a new untitled Document  

| Param | Type | Description |
| --- | --- | --- |
| counter | <code>number</code> | used in the name of the new Document's File |
| fileExt | <code>string</code> | file extension of the new Document's File, including "." |

<a name="notifyFileDeleted"></a>

## notifyFileDeleted(file)
Reacts to a file being deleted: if there is a Document for this file, causes it to dispatch a

**Kind**: global function  

| Param | Type |
| --- | --- |
| file | <code>File</code> | 

<a name="notifyPathDeleted"></a>

## notifyPathDeleted(fullPath)
Called after a file or folder has been deleted. This function is responsible

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> | The path of the file/folder that has been deleted |

<a name="notifyPathNameChanged"></a>

## notifyPathNameChanged(oldName, newName)
Called after a file or folder name has changed. This function is responsible

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| oldName | <code>string</code> | The old name of the file/folder |
| newName | <code>string</code> | The new name of the file/folder |
