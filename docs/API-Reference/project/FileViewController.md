### Import :
```js
const FileViewController = brackets.getModule("project/FileViewController")
```

<a name="WORKING_SET_VIEW"></a>

## WORKING\_SET\_VIEW : <code>string</code>
view managing working set.

**Kind**: global variable  
<a name="PROJECT_MANAGER"></a>

## PROJECT\_MANAGER : <code>string</code>
manager handling project-related operations.

**Kind**: global variable  
<a name="setFileViewFocus"></a>

## setFileViewFocus(fileSelectionFocus)
Modifies the selection focus in the project side bar. A file can either be selected
in the working set (the open files) or in the file tree, but not both.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| fileSelectionFocus | <code>String</code> | either PROJECT_MANAGER or WORKING_SET_VIEW |

<a name="openAndSelectDocument"></a>

## openAndSelectDocument(fullPath, fileSelectionFocus, paneId) ⇒ <code>$.Promise</code>
Opens a document if it's not open and selects the file in the UI corresponding to
fileSelectionFocus

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>fullPath</code> | full path of the document to open |
| fileSelectionFocus | <code>string</code> | (WORKING_SET_VIEW || PROJECT_MANAGER) |
| paneId | <code>string</code> | pane in which to open the document |

<a name="openFileAndAddToWorkingSet"></a>

## openFileAndAddToWorkingSet(fullPath, [paneId]) ⇒ <code>$.Promise</code>
Opens the specified document if it's not already open, adds it to the working set,
and selects it in the WorkingSetView

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>fullPath</code> |  |
| [paneId] | <code>string</code> | Pane in which to add the view.  If omitted, the command default is to use the ACTIVE_PANE |

<a name="openWithExternalApplication"></a>

## openWithExternalApplication()
Opens the specified document with its associated external editor,

**Kind**: global function  
<a name="getFileSelectionFocus"></a>

## getFileSelectionFocus() ⇒ <code>String</code>
returns either WORKING_SET_VIEW or PROJECT_MANAGER

**Kind**: global function  
