### Import :
```js
const MainViewManager = brackets.getModule("view/MainViewManager")
```

<a name="module_view/MainViewManager"></a>

## view/MainViewManager
MainViewManager manages the arrangement of all open panes as well as provides the controller
logic behind all views in the MainView (e.g. ensuring that a file doesn't appear in 2 lists)

Each pane contains one or more views wich are created by a view factory and inserted into a pane list.
There may be several panes managed by the MainViewManager with each pane containing a list of views.
The panes are always visible and the layout is determined by the MainViewManager and the user.

Currently we support only 2 panes.

All of the WorkingSet APIs take a paneId Argument.  This can be an actual pane Id, ALL_PANES (in most cases)
or ACTIVE_PANE. ALL_PANES may not be supported for some APIs.  See the API for details.

This module dispatches several events:

   - activePaneChange - When the active pane changes.  There will always be an active pane.
         (e, newPaneId:string, oldPaneId:string)
   - currentFileChange -- When the user has switched to another pane, file, document. When the user closes a view
     and there are no other views to show the current file will be null.
         (e, newFile:File, newPaneId:string, oldFile:File, oldPaneId:string)
   - paneLayoutChange -- When Orientation changes.
         (e, orientation:string)
   - paneCreate -- When a pane is created
         (e, paneId:string)
   - paneDestroy -- When a pane is destroyed
         (e, paneId:string)


   To listen for working set changes, you must listen to *all* of these events:
   - workingSetAdd -- When a file is added to the working set
         (e, fileAdded:File, index:number, paneId:string)
   - workingSetAddList -- When multiple files are added to the working set
         (e, fileAdded:Array."File", paneId:string)
   - workingSetMove - When a File has moved to a different working set
         (e, File:FILE, sourcePaneId:string, destinationPaneId:string)
   - workingSetRemove -- When a file is removed from the working set
         (e, fileRemoved:File, suppressRedraw:boolean, paneId:string)
   - workingSetRemoveList -- When multiple files are removed from the working set
         (e, filesRemoved:Array."File", paneId:string)
   - workingSetSort -- When a pane's view array is reordered without additions or removals.
         (e, paneId:string)
   - workingSetUpdate -- When changes happen due to system events such as a file being deleted.
                             listeners should discard all working set info and rebuilt it from the pane
                             by calling getWorkingSet()
         (e, paneId:string)
   - _workingSetDisableAutoSort -- When the working set is reordered by manually dragging a file.
         (e, paneId:string) For Internal Use Only.

To listen for events, do something like this: (see EventDispatcher for details on this pattern)
   `MainViewManager.on("eventname", handler);`


* [view/MainViewManager](#module_view/MainViewManager)
    * [.EVENT_CURRENT_FILE_CHANGE](#module_view/MainViewManager..EVENT_CURRENT_FILE_CHANGE) : <code>string</code>
    * [.ALL_PANES](#module_view/MainViewManager..ALL_PANES)
    * [.ACTIVE_PANE](#module_view/MainViewManager..ACTIVE_PANE)
    * [.isExclusiveToPane(File)](#module_view/MainViewManager..isExclusiveToPane) ⇒ <code>Object</code>
    * [.getActivePaneId()](#module_view/MainViewManager..getActivePaneId) ⇒ <code>string</code>
    * [.focusActivePane()](#module_view/MainViewManager..focusActivePane)
    * [.setActivePaneId(paneId)](#module_view/MainViewManager..setActivePaneId)
    * [.getCurrentlyViewedFile(paneId)](#module_view/MainViewManager..getCurrentlyViewedFile) ⇒ <code>File</code>
    * [.getCurrentlyViewedEditor(paneId)](#module_view/MainViewManager..getCurrentlyViewedEditor) ⇒ <code>Editor</code>
    * [.getAllViewedEditors()](#module_view/MainViewManager..getAllViewedEditors) ⇒ <code>Object</code>
    * [.getCurrentlyViewedPath(paneId)](#module_view/MainViewManager..getCurrentlyViewedPath) ⇒ <code>string</code>
    * [.cacheScrollState(paneId)](#module_view/MainViewManager..cacheScrollState)
    * [.restoreAdjustedScrollState(paneId, heightDelta)](#module_view/MainViewManager..restoreAdjustedScrollState)
    * [.getWorkingSet(paneId)](#module_view/MainViewManager..getWorkingSet) ⇒ <code>Array.&lt;File&gt;</code>
    * [.getAllOpenFiles()](#module_view/MainViewManager..getAllOpenFiles) ⇒ <code>array.&lt;File&gt;</code>
    * [.getPaneIdList()](#module_view/MainViewManager..getPaneIdList) ⇒ <code>array.&lt;string&gt;</code>
    * [.getWorkingSetSize(paneId)](#module_view/MainViewManager..getWorkingSetSize) ⇒ <code>number</code>
    * [.getPaneTitle(paneId)](#module_view/MainViewManager..getPaneTitle) ⇒ <code>string</code>
    * [.getPaneCount()](#module_view/MainViewManager..getPaneCount) ⇒ <code>number</code>
    * [.findInAllWorkingSets(fullPath)](#module_view/MainViewManager..findInAllWorkingSets) ⇒ <code>Object</code>
    * [.findInOpenPane(fullPath)](#module_view/MainViewManager..findInOpenPane) ⇒ <code>Object</code>
    * [.findInWorkingSet(paneId, fullPath)](#module_view/MainViewManager..findInWorkingSet) ⇒ <code>number</code>
    * [.findInWorkingSetByAddedOrder(paneId, fullPath)](#module_view/MainViewManager..findInWorkingSetByAddedOrder) ⇒ <code>number</code>
    * [.findInWorkingSetByMRUOrder(paneId, fullPath)](#module_view/MainViewManager..findInWorkingSetByMRUOrder) ⇒ <code>number</code>
    * [.addToWorkingSet(paneId, file, [index], [forceRedraw])](#module_view/MainViewManager..addToWorkingSet)
    * [.addListToWorkingSet(paneId, fileList)](#module_view/MainViewManager..addListToWorkingSet)
    * [.switchPaneFocus()](#module_view/MainViewManager..switchPaneFocus)
    * [.traverseToNextViewByMRU(direction)](#module_view/MainViewManager..traverseToNextViewByMRU) ⇒ <code>Object</code>
    * [.traverseToNextViewInListOrder(direction)](#module_view/MainViewManager..traverseToNextViewInListOrder) ⇒ <code>Object</code>
    * [.beginTraversal()](#module_view/MainViewManager..beginTraversal)
    * [.endTraversal()](#module_view/MainViewManager..endTraversal)
    * [.setLayoutScheme(rows, columns)](#module_view/MainViewManager..setLayoutScheme)
    * [.getLayoutScheme()](#module_view/MainViewManager..getLayoutScheme) ⇒ <code>Object</code>

<a name="module_view/MainViewManager..EVENT_CURRENT_FILE_CHANGE"></a>

### view/MainViewManager.EVENT\_CURRENT\_FILE\_CHANGE : <code>string</code>
Event current file change

**Kind**: inner constant of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  
<a name="module_view/MainViewManager..ALL_PANES"></a>

### view/MainViewManager.ALL\_PANES
Special paneId shortcut that can be used to specify that
all panes should be targeted by the API.
Not all APIs support this constnant.
Check the API documentation before use.

**Kind**: inner constant of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  
<a name="module_view/MainViewManager..ACTIVE_PANE"></a>

### view/MainViewManager.ACTIVE\_PANE
Special paneId shortcut that can be used to specify that
the API should target the focused pane only.
All APIs support this shortcut.

**Kind**: inner constant of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  
<a name="module_view/MainViewManager..isExclusiveToPane"></a>

### view/MainViewManager.isExclusiveToPane(File) ⇒ <code>Object</code>
Checks whether a file is listed exclusively in the provided pane

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  

| Param | Type | Description |
| --- | --- | --- |
| File | <code>File</code> | the file |

<a name="module_view/MainViewManager..getActivePaneId"></a>

### view/MainViewManager.getActivePaneId() ⇒ <code>string</code>
Retrieves the currently active Pane Id

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  
**Returns**: <code>string</code> - Active Pane's ID.  
<a name="module_view/MainViewManager..focusActivePane"></a>

### view/MainViewManager.focusActivePane()
Focuses the current pane. If the current pane has a current view, then the pane will focus the view.

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  
<a name="module_view/MainViewManager..setActivePaneId"></a>

### view/MainViewManager.setActivePaneId(paneId)
Switch active pane to the specified pane id (or ACTIVE_PANE/ALL_PANES, in which case this
call does nothing).

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | the id of the pane to activate |

<a name="module_view/MainViewManager..getCurrentlyViewedFile"></a>

### view/MainViewManager.getCurrentlyViewedFile(paneId) ⇒ <code>File</code>
Retrieves the currently viewed file of the specified paneId

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  
**Returns**: <code>File</code> - File object of the currently viewed file, or null if there isn't one or there's no such pane  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | the id of the pane in which to retrieve the currently viewed file |

<a name="module_view/MainViewManager..getCurrentlyViewedEditor"></a>

### view/MainViewManager.getCurrentlyViewedEditor(paneId) ⇒ <code>Editor</code>
Retrieves the currently viewed editor of the specified paneId

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  
**Returns**: <code>Editor</code> - currently editor, or null if there isn't one or there's no such pane  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | the id of the pane in which to retrieve the currently viewed editor |

<a name="module_view/MainViewManager..getAllViewedEditors"></a>

### view/MainViewManager.getAllViewedEditors() ⇒ <code>Object</code>
Gets an array of editors open in panes with their pane IDs.
Can return an empty array if no editors are open.

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  
**Returns**: <code>Object</code> - An array of objects, each containing an editor and its corresponding pane ID.  
<a name="module_view/MainViewManager..getCurrentlyViewedPath"></a>

### view/MainViewManager.getCurrentlyViewedPath(paneId) ⇒ <code>string</code>
Retrieves the currently viewed path of the pane specified by paneId

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  
**Returns**: <code>string</code> - the path of the currently viewed file or null if there isn't one  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | the id of the pane in which to retrieve the currently viewed path |

<a name="module_view/MainViewManager..cacheScrollState"></a>

### view/MainViewManager.cacheScrollState(paneId)
Caches the specified pane's current scroll state
If there was already cached state for the specified pane, it is discarded and overwritten

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | id of the pane in which to cache the scroll state,                            ALL_PANES or ACTIVE_PANE |

<a name="module_view/MainViewManager..restoreAdjustedScrollState"></a>

### view/MainViewManager.restoreAdjustedScrollState(paneId, heightDelta)
Restores the scroll state from cache and applies the heightDelta
The view implementation is responsible for applying or ignoring the heightDelta.
This is used primarily when a modal bar opens to keep the editor from scrolling the current
page out of view in order to maintain the appearance.
The state is removed from the cache after calling this function.

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | id of the pane in which to adjust the scroll state,                              ALL_PANES or ACTIVE_PANE |
| heightDelta | <code>number</code> | delta H to apply to the scroll state |

<a name="module_view/MainViewManager..getWorkingSet"></a>

### view/MainViewManager.getWorkingSet(paneId) ⇒ <code>Array.&lt;File&gt;</code>
Retrieves the WorkingSet for the given paneId not including temporary views

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | id of the pane in which to get the view list, ALL_PANES or ACTIVE_PANE |

<a name="module_view/MainViewManager..getAllOpenFiles"></a>

### view/MainViewManager.getAllOpenFiles() ⇒ <code>array.&lt;File&gt;</code>
Retrieves the list of all open files including temporary views

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  
**Returns**: <code>array.&lt;File&gt;</code> - the list of all open files in all open panes  
<a name="module_view/MainViewManager..getPaneIdList"></a>

### view/MainViewManager.getPaneIdList() ⇒ <code>array.&lt;string&gt;</code>
Retrieves the list of all open pane ids

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  
**Returns**: <code>array.&lt;string&gt;</code> - the list of all open panes  
<a name="module_view/MainViewManager..getWorkingSetSize"></a>

### view/MainViewManager.getWorkingSetSize(paneId) ⇒ <code>number</code>
Retrieves the size of the selected pane's view list

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  
**Returns**: <code>number</code> - the number of items in the specified pane  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | id of the pane in which to get the workingset size.      Can use `ALL_PANES` or `ACTIVE_PANE` |

<a name="module_view/MainViewManager..getPaneTitle"></a>

### view/MainViewManager.getPaneTitle(paneId) ⇒ <code>string</code>
Retrieves the title to display in the workingset view

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  
**Returns**: <code>string</code> - title  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | id of the pane in which to get the title |

<a name="module_view/MainViewManager..getPaneCount"></a>

### view/MainViewManager.getPaneCount() ⇒ <code>number</code>
Retrieves the number of panes

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  
<a name="module_view/MainViewManager..findInAllWorkingSets"></a>

### view/MainViewManager.findInAllWorkingSets(fullPath) ⇒ <code>Object</code>
Finds all instances of the specified file in all working sets.
If there is a temporary view of the file, it is not part of the result set

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  
**Returns**: <code>Object</code> - an array of paneId/index records  

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> | path of the file to find views of |

<a name="module_view/MainViewManager..findInOpenPane"></a>

### view/MainViewManager.findInOpenPane(fullPath) ⇒ <code>Object</code>
Returns the pane IDs and editors (if present) of the given file in any open and viewable pane.
If the same file is open in multiple panes, all matching panes will be returned.
If not found in any panes, an empty array will be returned.

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  
**Returns**: <code>Object</code> - An array of objects, each containing the pane ID and the corresponding editor, if present.  

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> | The full path of the file to search for. |

<a name="module_view/MainViewManager..findInWorkingSet"></a>

### view/MainViewManager.findInWorkingSet(paneId, fullPath) ⇒ <code>number</code>
Gets the index of the file matching fullPath in the workingset

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  
**Returns**: <code>number</code> - index, -1 if not found.  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | id of the pane in which to search or ALL_PANES or ACTIVE_PANE |
| fullPath | <code>string</code> | full path of the file to search for |

<a name="module_view/MainViewManager..findInWorkingSetByAddedOrder"></a>

### view/MainViewManager.findInWorkingSetByAddedOrder(paneId, fullPath) ⇒ <code>number</code>
Gets the index of the file matching fullPath in the added order workingset

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  
**Returns**: <code>number</code> - index, -1 if not found.  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | id of the pane in which to search or ALL_PANES or ACTIVE_PANE |
| fullPath | <code>string</code> | full path of the file to search for |

<a name="module_view/MainViewManager..findInWorkingSetByMRUOrder"></a>

### view/MainViewManager.findInWorkingSetByMRUOrder(paneId, fullPath) ⇒ <code>number</code>
Gets the index of the file matching fullPath in the MRU order workingset

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  
**Returns**: <code>number</code> - index, -1 if not found.  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | id of the pane in which to search or ALL_PANES or ACTIVE_PANE |
| fullPath | <code>string</code> | full path of the file to search for |

<a name="module_view/MainViewManager..addToWorkingSet"></a>

### view/MainViewManager.addToWorkingSet(paneId, file, [index], [forceRedraw])
Adds the given file to the end of the workingset, if it is not already there.
 This API does not create a view of the file, it just adds it to the working set
Views of files in the working set are persisted and are not destroyed until the user
 closes the file using FILE_CLOSE; Views are created using FILE_OPEN and, when opened, are
 made the current view. If a File is already opened then the file is just made current
 and its view is shown.

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | The id of the pane in which to add the file object to or ACTIVE_PANE |
| file | <code>File</code> | The File object to add to the workingset |
| [index] | <code>number</code> | Position to add to list (defaults to last); -1 is ignored |
| [forceRedraw] | <code>boolean</code> | If true, a workingset change notification is always sent    (useful if suppressRedraw was used with removeView() earlier) |

<a name="module_view/MainViewManager..addListToWorkingSet"></a>

### view/MainViewManager.addListToWorkingSet(paneId, fileList)
Adds the given file list to the end of the workingset.

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  

| Param | Type | Description |
| --- | --- | --- |
| paneId | <code>string</code> | The id of the pane in which to add the file object to or ACTIVE_PANE |
| fileList | <code>Array.&lt;File&gt;</code> | Array of files to add to the pane |

<a name="module_view/MainViewManager..switchPaneFocus"></a>

### view/MainViewManager.switchPaneFocus()
Switch between panes

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  
<a name="module_view/MainViewManager..traverseToNextViewByMRU"></a>

### view/MainViewManager.traverseToNextViewByMRU(direction) ⇒ <code>Object</code>
Get the next or previous file in the MRU list.

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  
**Returns**: <code>Object</code> - The File object of the next item in the traversal order or null if there aren't any files to traverse.
                                      May return current file if there are no other files to traverse.  

| Param | Type | Description |
| --- | --- | --- |
| direction | <code>number</code> | Must be 1 or -1 to traverse forward or backward |

<a name="module_view/MainViewManager..traverseToNextViewInListOrder"></a>

### view/MainViewManager.traverseToNextViewInListOrder(direction) ⇒ <code>Object</code>
Get the next or previous file in list order.

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  
**Returns**: <code>Object</code> - The File object of the next item in the traversal order or null if there aren't any files to traverse.
                                      May return current file if there are no other files to traverse.  

| Param | Type | Description |
| --- | --- | --- |
| direction | <code>number</code> | Must be 1 or -1 to traverse forward or backward |

<a name="module_view/MainViewManager..beginTraversal"></a>

### view/MainViewManager.beginTraversal()
Indicates that traversal has begun.
Can be called any number of times.

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  
<a name="module_view/MainViewManager..endTraversal"></a>

### view/MainViewManager.endTraversal()
Un-freezes the MRU list after one or more beginTraversal() calls.
Whatever file is current is bumped to the front of the MRU list.

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  
<a name="module_view/MainViewManager..setLayoutScheme"></a>

### view/MainViewManager.setLayoutScheme(rows, columns)
Changes the layout scheme

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  
**Summay**: Rows or Columns may be 1 or 2 but both cannot be 2. 1x2, 2x1 or 1x1 are the legal values  

| Param | Type | Description |
| --- | --- | --- |
| rows | <code>number</code> | (may be 1 or 2) |
| columns | <code>number</code> | (may be 1 or 2) |

<a name="module_view/MainViewManager..getLayoutScheme"></a>

### view/MainViewManager.getLayoutScheme() ⇒ <code>Object</code>
Retrieves the current layout scheme.

**Kind**: inner method of [<code>view/MainViewManager</code>](#module_view/MainViewManager)  
**Returns**: <code>Object</code> - - An object containing the number of rows and columns in the layout.  
