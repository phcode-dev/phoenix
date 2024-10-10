### Import :
```js
const MainViewManager = brackets.getModule("view/MainViewManager")
```

<a name="_"></a>

## \_
MainViewManager manages the arrangement of all open panes as well as provides the controllerlogic behind all views in the MainView (e.g. ensuring that a file doesn't appear in 2 lists)Each pane contains one or more views wich are created by a view factory and inserted into a pane list.There may be several panes managed by the MainViewManager with each pane containing a list of views.The panes are always visible and the layout is determined by the MainViewManager and the user.Currently we support only 2 panes.All of the WorkingSet APIs take a paneId Argument.  This can be an actual pane Id, ALL_PANES (in most cases)or ACTIVE_PANE. ALL_PANES may not be supported for some APIs.  See the API for details.This module dispatches several events:   - activePaneChange - When the active pane changes.  There will always be an active pane.         (e, newPaneId:string, oldPaneId:string)   - currentFileChange -- When the user has switched to another pane, file, document. When the user closes a view     and there are no other views to show the current file will be null.         (e, newFile:File, newPaneId:string, oldFile:File, oldPaneId:string)   - paneLayoutChange -- When Orientation changes.         (e, orientation:string)   - paneCreate -- When a pane is created         (e, paneId:string)   - paneDestroy -- When a pane is destroyed         (e, paneId:string)   To listen for working set changes, you must listen to *all* of these events:   - workingSetAdd -- When a file is added to the working set         (e, fileAdded:File, index:number, paneId:string)   - workingSetAddList -- When multiple files are added to the working set         (e, fileAdded:Array."File", paneId:string)   - workingSetMove - When a File has moved to a different working set         (e, File:FILE, sourcePaneId:string, destinationPaneId:string)   - workingSetRemove -- When a file is removed from the working set         (e, fileRemoved:File, suppressRedraw:boolean, paneId:string)   - workingSetRemoveList -- When multiple files are removed from the working set         (e, filesRemoved:Array."File", paneId:string)   - workingSetSort -- When a pane's view array is reordered without additions or removals.         (e, paneId:string)   - workingSetUpdate -- When changes happen due to system events such as a file being deleted.                             listeners should discard all working set info and rebuilt it from the pane                             by calling getWorkingSet()         (e, paneId:string)   - _workingSetDisableAutoSort -- When the working set is reordered by manually dragging a file.         (e, paneId:string) For Internal Use Only.To listen for events, do something like this: (see EventDispatcher for details on this pattern)   `MainViewManager.on("eventname", handler);`

**Kind**: global variable  
<a name="_mruList"></a>

## \_mruList : <code>Array.&lt;file:File, paneId:string&gt;</code>
The global MRU list (for traversing)

**Kind**: global variable  
<a name="ALL_PANES"></a>

## ALL\_PANES
Special paneId shortcut that can be used to specify thatall panes should be targeted by the API.Not all APIs support this constnant.Check the API documentation before use.

**Kind**: global constant  
<a name="ACTIVE_PANE"></a>

## ACTIVE\_PANE
Special paneId shortcut that can be used to specify thatthe API should target the focused pane only.All APIs support this shortcut.

**Kind**: global constant  
<a name="isExclusiveToPane"></a>

## isExclusiveToPane(File) ⇒ <code>Object</code>
Checks whether a file is listed exclusively in the provided pane

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| File | <code>File</code> | the file |

<a name="getActivePaneId"></a>

## getActivePaneId() ⇒ <code>string</code>
Retrieves the currently active Pane Id

**Kind**: global function  
**Returns**: <code>string</code> - Active Pane's ID.  
<a name="_resolvePaneId"></a>

## \_resolvePaneId(paneId) ⇒ <code>string</code>
Resolve paneId to actual pane.

**Kind**: global function  
**Returns**: <code>string</code> - id of the pane in which to open the document  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | id of the desired pane. May be symbolic or null (to indicate current pane) |

<a name="focusActivePane"></a>

## focusActivePane()
Focuses the current pane. If the current pane has a current view, then the pane will focus the view.

**Kind**: global function  
<a name="_isSpecialPaneId"></a>

## \_isSpecialPaneId(paneId) ⇒ <code>boolean</code>
Determines if the pane id is a special pane id

**Kind**: global function  
**Returns**: <code>boolean</code> - true if the pane id is a special identifier, false if not  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | the id to test |

<a name="setActivePaneId"></a>

## setActivePaneId(paneId)
Switch active pane to the specified pane id (or ACTIVE_PANE/ALL_PANES, in which case thiscall does nothing).

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | the id of the pane to activate |

<a name="_getPaneFromElement"></a>

## \_getPaneFromElement($el) ⇒ <code>string</code>
Retrieves the Pane ID for the specified container

**Kind**: global function  
**Returns**: <code>string</code> - the id of the pane that matches the container or undefined if a pane doesn't exist for that container  

| Param | Type | Description |
| --- | --- | --- |
| $el | <code>jQuery</code> | the element of the pane to fetch |

<a name="getCurrentlyViewedFile"></a>

## getCurrentlyViewedFile(paneId) ⇒ <code>File</code>
Retrieves the currently viewed file of the specified paneId

**Kind**: global function  
**Returns**: <code>File</code> - File object of the currently viewed file, or null if there isn't one or there's no such pane  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | the id of the pane in which to retrieve the currently viewed file |

<a name="getCurrentlyViewedEditor"></a>

## getCurrentlyViewedEditor(paneId) ⇒ <code>Editor</code>
Retrieves the currently viewed editor of the specified paneId

**Kind**: global function  
**Returns**: <code>Editor</code> - currently editor, or null if there isn't one or there's no such pane  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | the id of the pane in which to retrieve the currently viewed editor |

<a name="getAllViewedEditors"></a>

## getAllViewedEditors() ⇒ <code>Object</code>
Gets an array of editors open in panes with their pane IDs.Can return an empty array if no editors are open.

**Kind**: global function  
**Returns**: <code>Object</code> - An array of objects, each containing an editor and its corresponding pane ID.  
<a name="getCurrentlyViewedPath"></a>

## getCurrentlyViewedPath(paneId) ⇒ <code>string</code>
Retrieves the currently viewed path of the pane specified by paneId

**Kind**: global function  
**Returns**: <code>string</code> - the path of the currently viewed file or null if there isn't one  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | the id of the pane in which to retrieve the currently viewed path |

<a name="cacheScrollState"></a>

## cacheScrollState(paneId)
Caches the specified pane's current scroll stateIf there was already cached state for the specified pane, it is discarded and overwritten

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | id of the pane in which to cache the scroll state,                            ALL_PANES or ACTIVE_PANE |

<a name="restoreAdjustedScrollState"></a>

## restoreAdjustedScrollState(paneId, heightDelta)
Restores the scroll state from cache and applies the heightDeltaThe view implementation is responsible for applying or ignoring the heightDelta.This is used primarily when a modal bar opens to keep the editor from scrolling the currentpage out of view in order to maintain the appearance.The state is removed from the cache after calling this function.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | id of the pane in which to adjust the scroll state,                              ALL_PANES or ACTIVE_PANE |
| heightDelta | <code>number</code> | delta H to apply to the scroll state |

<a name="getWorkingSet"></a>

## getWorkingSet(paneId) ⇒ <code>Array.&lt;File&gt;</code>
Retrieves the WorkingSet for the given paneId not including temporary views

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | id of the pane in which to get the view list, ALL_PANES or ACTIVE_PANE |

<a name="getAllOpenFiles"></a>

## getAllOpenFiles() ⇒ <code>array.&lt;File&gt;</code>
Retrieves the list of all open files including temporary views

**Kind**: global function  
**Returns**: <code>array.&lt;File&gt;</code> - the list of all open files in all open panes  
<a name="getPaneIdList"></a>

## getPaneIdList() ⇒ <code>array.&lt;string&gt;</code>
Retrieves the list of all open pane ids

**Kind**: global function  
**Returns**: <code>array.&lt;string&gt;</code> - the list of all open panes  
<a name="getWorkingSetSize"></a>

## getWorkingSetSize(paneId) ⇒ <code>number</code>
Retrieves the size of the selected pane's view list

**Kind**: global function  
**Returns**: <code>number</code> - the number of items in the specified pane  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | id of the pane in which to get the workingset size.      Can use `ALL_PANES` or `ACTIVE_PANE` |

<a name="getPaneTitle"></a>

## getPaneTitle(paneId) ⇒ <code>string</code>
Retrieves the title to display in the workingset view

**Kind**: global function  
**Returns**: <code>string</code> - title  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | id of the pane in which to get the title |

<a name="getPaneCount"></a>

## getPaneCount() ⇒ <code>number</code>
Retrieves the number of panes

**Kind**: global function  
<a name="findInAllWorkingSets"></a>

## findInAllWorkingSets(fullPath) ⇒ <code>Object</code>
Finds all instances of the specified file in all working sets.If there is a temporary view of the file, it is not part of the result set

**Kind**: global function  
**Returns**: <code>Object</code> - an array of paneId/index records  

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> | path of the file to find views of |

<a name="findInOpenPane"></a>

## findInOpenPane(fullPath) ⇒ <code>Object</code>
Returns the pane IDs and editors (if present) of the given file in any open and viewable pane. If the same file is open in multiple panes, all matching panes will be returned. If not found in any panes, an empty array will be returned.

**Kind**: global function  
**Returns**: <code>Object</code> - An array of objects, each containing the pane ID and the corresponding editor, if present.  

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> | The full path of the file to search for. |

<a name="findInWorkingSet"></a>

## findInWorkingSet(paneId, fullPath) ⇒ <code>number</code>
Gets the index of the file matching fullPath in the workingset

**Kind**: global function  
**Returns**: <code>number</code> - index, -1 if not found.  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | id of the pane in which to search or ALL_PANES or ACTIVE_PANE |
| fullPath | <code>string</code> | full path of the file to search for |

<a name="findInWorkingSetByAddedOrder"></a>

## findInWorkingSetByAddedOrder(paneId, fullPath) ⇒ <code>number</code>
Gets the index of the file matching fullPath in the added order workingset

**Kind**: global function  
**Returns**: <code>number</code> - index, -1 if not found.  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | id of the pane in which to search or ALL_PANES or ACTIVE_PANE |
| fullPath | <code>string</code> | full path of the file to search for |

<a name="findInWorkingSetByMRUOrder"></a>

## findInWorkingSetByMRUOrder(paneId, fullPath) ⇒ <code>number</code>
Gets the index of the file matching fullPath in the MRU order workingset

**Kind**: global function  
**Returns**: <code>number</code> - index, -1 if not found.  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | id of the pane in which to search or ALL_PANES or ACTIVE_PANE |
| fullPath | <code>string</code> | full path of the file to search for |

<a name="addToWorkingSet"></a>

## addToWorkingSet(paneId, file, [index], [forceRedraw])
Adds the given file to the end of the workingset, if it is not already there. This API does not create a view of the file, it just adds it to the working setViews of files in the working set are persisted and are not destroyed until the user closes the file using FILE_CLOSE; Views are created using FILE_OPEN and, when opened, are made the current view. If a File is already opened then the file is just made current and its view is shown.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | The id of the pane in which to add the file object to or ACTIVE_PANE |
| file | <code>File</code> | The File object to add to the workingset |
| [index] | <code>number</code> | Position to add to list (defaults to last); -1 is ignored |
| [forceRedraw] | <code>boolean</code> | If true, a workingset change notification is always sent    (useful if suppressRedraw was used with removeView() earlier) |

<a name="addListToWorkingSet"></a>

## addListToWorkingSet(paneId, fileList)
Adds the given file list to the end of the workingset.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | The id of the pane in which to add the file object to or ACTIVE_PANE |
| fileList | <code>Array.&lt;File&gt;</code> | Array of files to add to the pane |

<a name="switchPaneFocus"></a>

## switchPaneFocus()
Switch between panes

**Kind**: global function  
<a name="traverseToNextViewByMRU"></a>

## traverseToNextViewByMRU(direction) ⇒ <code>Object</code>
Get the next or previous file in the MRU list.

**Kind**: global function  
**Returns**: <code>Object</code> - The File object of the next item in the traversal order or null if there aren't any files to traverse.                                      May return current file if there are no other files to traverse.  

| Param | Type | Description |
| --- | --- | --- |
| direction | <code>number</code> | Must be 1 or -1 to traverse forward or backward |

<a name="traverseToNextViewInListOrder"></a>

## traverseToNextViewInListOrder(direction) ⇒ <code>Object</code>
Get the next or previous file in list order.

**Kind**: global function  
**Returns**: <code>Object</code> - The File object of the next item in the traversal order or null if there aren't any files to traverse.                                      May return current file if there are no other files to traverse.  

| Param | Type | Description |
| --- | --- | --- |
| direction | <code>number</code> | Must be 1 or -1 to traverse forward or backward |

<a name="beginTraversal"></a>

## beginTraversal()
Indicates that traversal has begun.Can be called any number of times.

**Kind**: global function  
<a name="endTraversal"></a>

## endTraversal()
Un-freezes the MRU list after one or more beginTraversal() calls.Whatever file is current is bumped to the front of the MRU list.

**Kind**: global function  
<a name="_updatePaneHeaders"></a>

## \_updatePaneHeaders()
Updates the header text for all panes

**Kind**: global function  
<a name="_open"></a>

## \_open(paneId, file, [optionsIn]) ⇒ <code>jQuery.Promise</code>
Opens a file in the specified pane this can be used to open a file with a custom vieweror a document for editing.  If it's a document for editing, edit is called on the document

**Kind**: global function  
**Returns**: <code>jQuery.Promise</code> - promise that resolves to a File object or                          rejects with a File error or string  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | id of the pane in which to open the document |
| file | <code>File</code> | file to open |
| [optionsIn] | <code>Object</code> | options |

<a name="_close"></a>

## \_close(paneId, file, [optionsIn])
Closes a file in the specified pane or panes.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | The ID of the pane in which to close the document. |
| file | <code>File</code> | The file to close. |
| [optionsIn] | <code>Object</code> | Optional parameters for the close operation. |
| [optionsIn.noOpenNextFile] | <code>boolean</code> | If set to true, prevents opening the next file after closing. This function does not fail if the file is not open. |

<a name="_closeList"></a>

## \_closeList(paneId, fileList)
Closes a list of file in the specified pane or panes

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | id of the pane in which to open the document |
| fileList | <code>Array.&lt;File&gt;</code> | files to close This function does not fail if the file is not open |

<a name="_closeAll"></a>

## \_closeAll(paneId)
Closes all files in the specified pane or panes

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | id of the pane in which to open the document This function does not fail if the file is not open |

<a name="_destroyEditorIfNotNeeded"></a>

## \_destroyEditorIfNotNeeded(doc)
Destroys an editor object if a document is no longer referenced

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| doc | <code>Document</code> | document to destroy |

<a name="setLayoutScheme"></a>

## setLayoutScheme(rows, columns)
Changes the layout scheme

**Kind**: global function  
**Summay**: Rows or Columns may be 1 or 2 but both cannot be 2. 1x2, 2x1 or 1x1 are the legal values  

| Param | Type | Description |
| --- | --- | --- |
| rows | <code>number</code> | (may be 1 or 2) |
| columns | <code>number</code> | (may be 1 or 2) |

<a name="getLayoutScheme"></a>

## getLayoutScheme() ⇒ <code>Object</code>
Retrieves the current layout scheme.

**Kind**: global function  
**Returns**: <code>Object</code> - - An object containing the number of rows and columns in the layout.  
