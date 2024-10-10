### Import :
```js
const FileSyncManager = brackets.getModule("project/FileSyncManager")
```

<a name="_alreadyChecking"></a>

## \_alreadyChecking : <code>boolean</code>
Guard to spot re-entrancy while syncOpenDocuments() is still in progress

**Kind**: global variable  
<a name="_restartPending"></a>

## \_restartPending : <code>boolean</code>
If true, we should bail from the syncOpenDocuments() process and then re-run it. Seecomments in syncOpenDocuments() for how this works.

**Kind**: global variable  
<a name="toReload"></a>

## toReload : <code>Array.&lt;Document&gt;</code>
**Kind**: global variable  
<a name="toClose"></a>

## toClose : <code>Array.&lt;Document&gt;</code>
**Kind**: global variable  
<a name="editConflicts"></a>

## editConflicts : <code>Object</code>
Array

**Kind**: global variable  
<a name="deleteConflicts"></a>

## deleteConflicts : <code>Object</code>
Array

**Kind**: global variable  
<a name="findExternalChanges"></a>

## findExternalChanges(docs) ⇒ <code>$.Promise</code>
Scans all the given Documents for changes on disk, and sorts them into four buckets,populating the corresponding arrays: toReload        - changed on disk; unchanged within Brackets toClose         - deleted on disk; unchanged within Brackets editConflicts   - changed on disk; also dirty in Brackets deleteConflicts - deleted on disk; also dirty in Brackets

**Kind**: global function  
**Returns**: <code>$.Promise</code> - Resolved when all scanning done, or rejected immediately if there's any     error while reading file timestamps. Errors are logged but no UI is shown.  

| Param | Type |
| --- | --- |
| docs | <code>Array.&lt;Document&gt;</code> | 

<a name="syncUnopenWorkingSet"></a>

## syncUnopenWorkingSet()
Scans all the files in the working set that do not have Documents (and thus were not scannedby findExternalChanges()). If any were deleted on disk, removes them from the working set.

**Kind**: global function  
<a name="reloadDoc"></a>

## reloadDoc(doc) ⇒ <code>$.Promise</code>
Reloads the Document's contents from disk, discarding any unsaved changes in the editor.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - Resolved after editor has been refreshed; rejected if unable to load the     file's new content. Errors are logged but no UI is shown.  

| Param | Type |
| --- | --- |
| doc | <code>Document</code> | 

<a name="reloadChangedDocs"></a>

## reloadChangedDocs() ⇒ <code>$.Promise</code>
Reloads all the documents in "toReload" silently (no prompts). The operations are all runin parallel.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - Resolved/rejected after all reloads done; will be rejected if any one     file's reload failed. Errors are logged (by reloadDoc()) but no UI is shown.  
<a name="showReloadError"></a>

## showReloadError(error, doc) ⇒ <code>Dialog</code>
**Kind**: global function  

| Param | Type |
| --- | --- |
| error | <code>FileError</code> | 
| doc | <code>Document</code> | 

<a name="closeDeletedDocs"></a>

## closeDeletedDocs()
Closes all the documents in "toClose" silently (no prompts). Completes synchronously.

**Kind**: global function  
<a name="presentConflicts"></a>

## presentConflicts(title) ⇒ <code>$.Promise</code>
Walks through all the documents in "editConflicts" & "deleteConflicts" and prompts the userabout each one. Processing is sequential: if the user chooses to reload a document, the nextprompt is not shown until after the reload has completed.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - Resolved/rejected after all documents have been prompted and (if     applicable) reloaded (and any resulting error UI has been dismissed). Rejected if any     one reload failed.  

| Param | Type | Description |
| --- | --- | --- |
| title | <code>string</code> | Title of the dialog. |

<a name="syncOpenDocuments"></a>

## syncOpenDocuments(title)
Check to see whether any open files have been modified by an external app since the last timeBrackets synced up with the copy on disk (either by loading or saving the file). For cleanfiles, we silently upate the editor automatically. For files with unsaved changes, we promptthe user.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| title | <code>string</code> | Title to use for document. Default is "External Changes". |

