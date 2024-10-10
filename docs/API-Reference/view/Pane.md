### Import :
```js
const Pane = brackets.getModule("view/Pane")
```

<a name="Pane"></a>

## Pane
**Kind**: global class  
**See**: [MainViewManager](MainViewManager) for more information  

* [Pane](#Pane)
    * [new Pane(id, $container)](#new_Pane_new)
    * [.id](#Pane+id) : <code>string</code>
    * [.$container](#Pane+$container) : <code>JQuery</code>
    * [.$el](#Pane+$el) : <code>JQuery</code>
    * [.$header](#Pane+$header) : <code>JQuery</code>
    * [.$headerText](#Pane+$headerText) : <code>JQuery</code>
    * [.$headerFlipViewBtn](#Pane+$headerFlipViewBtn) : <code>JQuery</code>
    * [.$headerCloseBtn](#Pane+$headerCloseBtn) : <code>JQuery</code>
    * [.$content](#Pane+$content) : <code>JQuery</code>
    * [._viewList](#Pane+_viewList) : <code>Array.&lt;File&gt;</code>
    * [._viewListMRUOrder](#Pane+_viewListMRUOrder) : <code>Array.&lt;File&gt;</code>
    * [._viewListAddedOrder](#Pane+_viewListAddedOrder) : <code>Array.&lt;File&gt;</code>
    * [.ITEM_NOT_FOUND](#Pane+ITEM_NOT_FOUND)
    * [.ITEM_FOUND_NO_SORT](#Pane+ITEM_FOUND_NO_SORT)
    * [.ITEM_FOUND_NEEDS_SORT](#Pane+ITEM_FOUND_NEEDS_SORT)
    * [._hideCurrentView()](#Pane+_hideCurrentView)
    * [.mergeFrom(Other)](#Pane+mergeFrom)
    * [.destroy()](#Pane+destroy)
    * [.getViewList()](#Pane+getViewList) ⇒ <code>Array.&lt;File&gt;</code>
    * [.getViewListSize()](#Pane+getViewListSize) ⇒ <code>number</code>
    * [.findInViewList(fullPath)](#Pane+findInViewList) ⇒ <code>number</code>
    * [.findInViewListAddedOrder(fullPath)](#Pane+findInViewListAddedOrder) ⇒ <code>number</code>
    * [.findInViewListMRUOrder(fullPath)](#Pane+findInViewListMRUOrder) ⇒ <code>number</code>
    * [.reorderItem(file, [index], [force])](#Pane+reorderItem) ⇒ <code>number</code>
    * [.addToViewList(file, [index])](#Pane+addToViewList) ⇒ <code>number</code>
    * [.addListToViewList(fileList)](#Pane+addListToViewList) ⇒ <code>Array.&lt;File&gt;</code>
    * [._notifyCurrentViewChange(newView, oldView)](#Pane+_notifyCurrentViewChange)
    * [.makeViewMostRecent(file)](#Pane+makeViewMostRecent)
    * [.sortViewList(compareFn)](#Pane+sortViewList)
    * [.swapViewListIndexes(index1, index2)](#Pane+swapViewListIndexes) ⇒ <code>boolean</code>
    * [.traverseViewListByMRU(direction, [current])](#Pane+traverseViewListByMRU) ⇒ <code>File</code>
    * [.showInterstitial(show)](#Pane+showInterstitial)
    * [.getViewForPath(path)](#Pane+getViewForPath) ⇒ <code>boolean</code>
    * [.addView(view, show)](#Pane+addView)
    * [.showView(view)](#Pane+showView)
    * [._updateHeaderHeight()](#Pane+_updateHeaderHeight)
    * [.updateLayout(forceRefresh)](#Pane+updateLayout)
    * [.getCurrentlyViewedFile()](#Pane+getCurrentlyViewedFile) ⇒ <code>File</code>
    * [.getCurrentlyViewedEditor()](#Pane+getCurrentlyViewedEditor) ⇒ <code>File</code>
    * [.getCurrentlyViewedPath()](#Pane+getCurrentlyViewedPath) ⇒ <code>string</code>
    * [.destroyViewIfNotNeeded(view)](#Pane+destroyViewIfNotNeeded)
    * [._execOpenFile(fullPath)](#Pane+_execOpenFile) ⇒ <code>jQuery.promise</code>
    * [.removeView(file, suppressOpenNextFile, preventViewChange)](#Pane+removeView) ⇒ <code>boolean</code>
    * [.removeViews(list)](#Pane+removeViews) ⇒ <code>Array.&lt;File&gt;</code>
    * [.focus()](#Pane+focus)
    * [._handleActivePaneChange(e, activePaneId)](#Pane+_handleActivePaneChange)
    * [.loadState(state)](#Pane+loadState) ⇒ <code>jQuery.Promise</code>
    * [.saveState()](#Pane+saveState) ⇒ <code>Object</code>
    * [.getScrollState()](#Pane+getScrollState) ⇒ <code>Object</code>
    * [.restoreAndAdjustScrollState([state], [heightDelta])](#Pane+restoreAndAdjustScrollState)

<a name="new_Pane_new"></a>

### new Pane(id, $container)
Pane Objects are constructed by the MainViewManager object when a Pane view is needed.


| Param | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | The id to use to identify this pane. |
| $container | <code>jQuery</code> | The parent jQuery container to place the pane view. |

<a name="Pane+id"></a>

### pane.id : <code>string</code>
id of the pane

**Kind**: instance property of [<code>Pane</code>](#Pane)  
**Read only**: true  
<a name="Pane+$container"></a>

### pane.$container : <code>JQuery</code>
container where the pane lives

**Kind**: instance property of [<code>Pane</code>](#Pane)  
**Read only**: true  
<a name="Pane+$el"></a>

### pane.$el : <code>JQuery</code>
the wrapped DOM node of this pane

**Kind**: instance property of [<code>Pane</code>](#Pane)  
**Read only**: true  
<a name="Pane+$header"></a>

### pane.$header : <code>JQuery</code>
the wrapped DOM node container that contains name of current view and the switch view button, or informational string if there is no view

**Kind**: instance property of [<code>Pane</code>](#Pane)  
**Read only**: true  
<a name="Pane+$headerText"></a>

### pane.$headerText : <code>JQuery</code>
the wrapped DOM node that contains name of current view, or informational string if there is no view

**Kind**: instance property of [<code>Pane</code>](#Pane)  
**Read only**: true  
<a name="Pane+$headerFlipViewBtn"></a>

### pane.$headerFlipViewBtn : <code>JQuery</code>
the wrapped DOM node that is used to flip the view to another pane

**Kind**: instance property of [<code>Pane</code>](#Pane)  
**Read only**: true  
<a name="Pane+$headerCloseBtn"></a>

### pane.$headerCloseBtn : <code>JQuery</code>
close button of the pane

**Kind**: instance property of [<code>Pane</code>](#Pane)  
**Read only**: true  
<a name="Pane+$content"></a>

### pane.$content : <code>JQuery</code>
the wrapped DOM node that contains views

**Kind**: instance property of [<code>Pane</code>](#Pane)  
**Read only**: true  
<a name="Pane+_viewList"></a>

### pane.\_viewList : <code>Array.&lt;File&gt;</code>
The list of files views

**Kind**: instance property of [<code>Pane</code>](#Pane)  
<a name="Pane+_viewListMRUOrder"></a>

### pane.\_viewListMRUOrder : <code>Array.&lt;File&gt;</code>
The list of files views in MRU order

**Kind**: instance property of [<code>Pane</code>](#Pane)  
<a name="Pane+_viewListAddedOrder"></a>

### pane.\_viewListAddedOrder : <code>Array.&lt;File&gt;</code>
The list of files views in Added order

**Kind**: instance property of [<code>Pane</code>](#Pane)  
<a name="Pane+ITEM_NOT_FOUND"></a>

### pane.ITEM\_NOT\_FOUND
Return value from reorderItem when the Item was not found

**Kind**: instance constant of [<code>Pane</code>](#Pane)  
**See**: [reorderItem](#Pane+reorderItem)  
<a name="Pane+ITEM_FOUND_NO_SORT"></a>

### pane.ITEM\_FOUND\_NO\_SORT
Return value from reorderItem when the Item was found at its natural index

**Kind**: instance constant of [<code>Pane</code>](#Pane)  
**See**: [reorderItem](#Pane+reorderItem)  
<a name="Pane+ITEM_FOUND_NEEDS_SORT"></a>

### pane.ITEM\_FOUND\_NEEDS\_SORT
Return value from reorderItem when the Item was found and reindexed

**Kind**: instance constant of [<code>Pane</code>](#Pane)  
**See**: [reorderItem](#Pane+reorderItem)  
<a name="Pane+_hideCurrentView"></a>

### pane.\_hideCurrentView()
Hides the current view if there is one, shows the

**Kind**: instance method of [<code>Pane</code>](#Pane)  
<a name="Pane+mergeFrom"></a>

### pane.mergeFrom(Other)
Merges the another Pane object's contents into this Pane

**Kind**: instance method of [<code>Pane</code>](#Pane)  

| Param | Type | Description |
| --- | --- | --- |
| Other | [<code>Pane</code>](#Pane) | Pane from which to copy |

<a name="Pane+destroy"></a>

### pane.destroy()
Removes the DOM node for the Pane, removes all

**Kind**: instance method of [<code>Pane</code>](#Pane)  
<a name="Pane+getViewList"></a>

### pane.getViewList() ⇒ <code>Array.&lt;File&gt;</code>
Returns a copy of the view file list

**Kind**: instance method of [<code>Pane</code>](#Pane)  
<a name="Pane+getViewListSize"></a>

### pane.getViewListSize() ⇒ <code>number</code>
Returns the number of entries in the view file list

**Kind**: instance method of [<code>Pane</code>](#Pane)  
<a name="Pane+findInViewList"></a>

### pane.findInViewList(fullPath) ⇒ <code>number</code>
Returns the index of the item in the view file list

**Kind**: instance method of [<code>Pane</code>](#Pane)  
**Returns**: <code>number</code> - index of the item or -1 if not found  

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> | the full path of the item to look for |

<a name="Pane+findInViewListAddedOrder"></a>

### pane.findInViewListAddedOrder(fullPath) ⇒ <code>number</code>
Returns the order in which the item was added

**Kind**: instance method of [<code>Pane</code>](#Pane)  
**Returns**: <code>number</code> - order of the item or -1 if not found  

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> | the full path of the item to look for |

<a name="Pane+findInViewListMRUOrder"></a>

### pane.findInViewListMRUOrder(fullPath) ⇒ <code>number</code>
Returns the order in which the item was last used

**Kind**: instance method of [<code>Pane</code>](#Pane)  
**Returns**: <code>number</code> - order of the item or -1 if not found.

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> | the full path of the item to look for |

<a name="Pane+reorderItem"></a>

### pane.reorderItem(file, [index], [force]) ⇒ <code>number</code>
reorders the specified file in the view list to the desired position

**Kind**: instance method of [<code>Pane</code>](#Pane)  
**Returns**: <code>number</code> - this function returns one of the following manifest constants:

| Param | Type | Description |
| --- | --- | --- |
| file | <code>File</code> | the file object of the item to reorder |
| [index] | <code>number</code> | the new position of the item |
| [force] | <code>boolean</code> | true to force the item into that position, false otherwise.  (Requires an index be requested) |

<a name="Pane+addToViewList"></a>

### pane.addToViewList(file, [index]) ⇒ <code>number</code>
Adds the given file to the end of the workingset, if it is not already in the list

**Kind**: instance method of [<code>Pane</code>](#Pane)  
**Returns**: <code>number</code> - index of where the item was added  

| Param | Type | Description |
| --- | --- | --- |
| file | <code>File</code> | file to add |
| [index] | <code>number</code> | position where to add the item |

<a name="Pane+addListToViewList"></a>

### pane.addListToViewList(fileList) ⇒ <code>Array.&lt;File&gt;</code>
Adds the given file list to the end of the workingset.

**Kind**: instance method of [<code>Pane</code>](#Pane)  
**Returns**: <code>Array.&lt;File&gt;</code> - list of files added to the list  

| Param | Type |
| --- | --- |
| fileList | <code>Array.&lt;File&gt;</code> | 

<a name="Pane+_notifyCurrentViewChange"></a>

### pane.\_notifyCurrentViewChange(newView, oldView)
Dispatches a currentViewChange event

**Kind**: instance method of [<code>Pane</code>](#Pane)  

| Param | Type | Description |
| --- | --- | --- |
| newView | <code>View</code> | the view become the current view |
| oldView | <code>View</code> | the view being replaced |

<a name="Pane+makeViewMostRecent"></a>

### pane.makeViewMostRecent(file)
Moves the specified file to the front of the MRU (Most Recently Used) list.

**Kind**: instance method of [<code>Pane</code>](#Pane)  

| Param | Type | Description |
| --- | --- | --- |
| file | <code>File</code> | The file to move to the front of the MRU list. |

<a name="Pane+sortViewList"></a>

### pane.sortViewList(compareFn)
Sorts items in the pane's view list.

**Kind**: instance method of [<code>Pane</code>](#Pane)  

| Param | Type | Description |
| --- | --- | --- |
| compareFn | <code>function</code> | The function used to compare items in the view list. |

<a name="Pane+swapViewListIndexes"></a>

### pane.swapViewListIndexes(index1, index2) ⇒ <code>boolean</code>
Swaps two items in the file view list (used while dragging items in the working set view)

**Kind**: instance method of [<code>Pane</code>](#Pane)  
**Returns**: <code>boolean</code> - } true  

| Param | Type | Description |
| --- | --- | --- |
| index1 | <code>number</code> | the index of the first item to swap |
| index2 | <code>number</code> | the index of the second item to swap |

<a name="Pane+traverseViewListByMRU"></a>

### pane.traverseViewListByMRU(direction, [current]) ⇒ <code>File</code>
Traverses the list and returns the File object of the next item in the MRU order

**Kind**: instance method of [<code>Pane</code>](#Pane)  
**Returns**: <code>File</code> - The File object of the next item in the travesal order or null if there isn't one.  

| Param | Type | Description |
| --- | --- | --- |
| direction | <code>number</code> | Must be 1 or -1 to traverse forward or backward |
| [current] | <code>string</code> | the fullPath of the item where traversal is to start.                              If this parameter is omitted then the path of the current view is used.                              If the current view is a temporary view then the first item in the MRU list is returned |

<a name="Pane+showInterstitial"></a>

### pane.showInterstitial(show)
Shows the pane's interstitial page

**Kind**: instance method of [<code>Pane</code>](#Pane)  

| Param | Type | Description |
| --- | --- | --- |
| show | <code>boolean</code> | show or hide the interstitial page |

<a name="Pane+getViewForPath"></a>

### pane.getViewForPath(path) ⇒ <code>boolean</code>
retrieves the view object for the given path

**Kind**: instance method of [<code>Pane</code>](#Pane)  
**Returns**: <code>boolean</code> - show - show or hide the interstitial page  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | the fullPath of the view to retrieve |

<a name="Pane+addView"></a>

### pane.addView(view, show)
Adds a view to the pane

**Kind**: instance method of [<code>Pane</code>](#Pane)  

| Param | Type | Description |
| --- | --- | --- |
| view | <code>View</code> | the View object to add |
| show | <code>boolean</code> | true to show the view right away, false otherwise |

<a name="Pane+showView"></a>

### pane.showView(view)
Swaps the current view with the requested view.

**Kind**: instance method of [<code>Pane</code>](#Pane)  

| Param | Type | Description |
| --- | --- | --- |
| view | <code>View</code> | the to show |

<a name="Pane+_updateHeaderHeight"></a>

### pane.\_updateHeaderHeight()
Update header and content height

**Kind**: instance method of [<code>Pane</code>](#Pane)  
<a name="Pane+updateLayout"></a>

### pane.updateLayout(forceRefresh)
Sets pane content height. Updates the layout causing the current view to redraw itself

**Kind**: instance method of [<code>Pane</code>](#Pane)  

| Param | Type | Description |
| --- | --- | --- |
| forceRefresh | <code>boolean</code> | true to force a resize and refresh of the current view, false if just to resize forceRefresh is only used by Editor views to force a relayout of all editor DOM elements. Custom View implementations should just ignore this flag. |

<a name="Pane+getCurrentlyViewedFile"></a>

### pane.getCurrentlyViewedFile() ⇒ <code>File</code>
Retrieves the File object of the current view

**Kind**: instance method of [<code>Pane</code>](#Pane)  
**Returns**: <code>File</code> - the File object of the current view or null if there isn't one  
<a name="Pane+getCurrentlyViewedEditor"></a>

### pane.getCurrentlyViewedEditor() ⇒ <code>File</code>
Retrieves the File object of the current view

**Kind**: instance method of [<code>Pane</code>](#Pane)  
**Returns**: <code>File</code> - the File object of the current view or null if there isn't one  
<a name="Pane+getCurrentlyViewedPath"></a>

### pane.getCurrentlyViewedPath() ⇒ <code>string</code>
Retrieves the path of the current view

**Kind**: instance method of [<code>Pane</code>](#Pane)  
**Returns**: <code>string</code> - the path of the current view or null if there isn't one  
<a name="Pane+destroyViewIfNotNeeded"></a>

### pane.destroyViewIfNotNeeded(view)
destroys the view if it isn't needed

**Kind**: instance method of [<code>Pane</code>](#Pane)  

| Param | Type | Description |
| --- | --- | --- |
| view | <code>View</code> | the view to destroy |

<a name="Pane+_execOpenFile"></a>

### pane.\_execOpenFile(fullPath) ⇒ <code>jQuery.promise</code>
Executes a FILE_OPEN command to open a file

**Kind**: instance method of [<code>Pane</code>](#Pane)  
**Returns**: <code>jQuery.promise</code> - promise that will resolve when the file is opened  

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> | path of the file to open |

<a name="Pane+removeView"></a>

### pane.removeView(file, suppressOpenNextFile, preventViewChange) ⇒ <code>boolean</code>
Removes the view and opens the next view

**Kind**: instance method of [<code>Pane</code>](#Pane)  
**Returns**: <code>boolean</code> - true if the file was removed from the working set

| Param | Type | Description |
| --- | --- | --- |
| file | <code>File</code> | the file to close |
| suppressOpenNextFile | <code>boolean</code> | suppresses opening the next file in MRU order |
| preventViewChange | <code>boolean</code> | if suppressOpenNextFile is truthy, this flag can be used to                                      prevent the current view from being destroyed.                                      Ignored if suppressOpenNextFile is falsy |

<a name="Pane+removeViews"></a>

### pane.removeViews(list) ⇒ <code>Array.&lt;File&gt;</code>
Removes the specifed file from all internal lists, destroys the view of the file (if there is one)

**Kind**: instance method of [<code>Pane</code>](#Pane)  
**Returns**: <code>Array.&lt;File&gt;</code> - Array of File objects removed from the working set.

| Param | Type | Description |
| --- | --- | --- |
| list | <code>Array.&lt;File&gt;</code> | Array of files to remove |

<a name="Pane+focus"></a>

### pane.focus()
Gives focus to the last thing that had focus, the current view or the pane in that order

**Kind**: instance method of [<code>Pane</code>](#Pane)  
<a name="Pane+_handleActivePaneChange"></a>

### pane.\_handleActivePaneChange(e, activePaneId)
MainViewManager.activePaneChange handler

**Kind**: instance method of [<code>Pane</code>](#Pane)  

| Param | Type | Description |
| --- | --- | --- |
| e | <code>jQuery.event</code> | event data |
| activePaneId | <code>string</code> | the new active pane id |

<a name="Pane+loadState"></a>

### pane.loadState(state) ⇒ <code>jQuery.Promise</code>
serializes the pane state from JSON

**Kind**: instance method of [<code>Pane</code>](#Pane)  
**Returns**: <code>jQuery.Promise</code> - A promise which resolves to \{fullPath:string, paneId:string} which can be passed as command data to FILE_OPEN  

| Param | Type | Description |
| --- | --- | --- |
| state | <code>Object</code> | the state to load |

<a name="Pane+saveState"></a>

### pane.saveState() ⇒ <code>Object</code>
Returns the JSON-ified state of the object so it can be serialize

**Kind**: instance method of [<code>Pane</code>](#Pane)  
**Returns**: <code>Object</code> - state - the state to save  
<a name="Pane+getScrollState"></a>

### pane.getScrollState() ⇒ <code>Object</code>
gets the current view's scroll state data

**Kind**: instance method of [<code>Pane</code>](#Pane)  
**Returns**: <code>Object</code> - scroll state - the current scroll state  
<a name="Pane+restoreAndAdjustScrollState"></a>

### pane.restoreAndAdjustScrollState([state], [heightDelta])
tells the current view to restore its scroll state from cached data and apply a height delta

**Kind**: instance method of [<code>Pane</code>](#Pane)  

| Param | Type | Description |
| --- | --- | --- |
| [state] | <code>Object</code> | the current scroll state |
| [heightDelta] | <code>number</code> | the amount to add or subtract from the state |

<a name="_"></a>

## \_
Pane objects host views of files, editors, etc... Clients cannot access

**Kind**: global variable  
<a name="_makeIndexRequestObject"></a>

## \_makeIndexRequestObject(requestIndex, index) ⇒ <code>Object</code>
Make an index request object

**Kind**: global function  
**Returns**: <code>Object</code> - An object that can be passed to
**See**: Pane#addToViewList  

| Param | Type | Description |
| --- | --- | --- |
| requestIndex | <code>boolean</code> | true to request an index, false if not |
| index | <code>number</code> | the index to request |
