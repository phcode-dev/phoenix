### Import :
```js
const ViewStateManager = brackets.getModule("view/ViewStateManager")
```

<a name="module_view/ViewStateManager"></a>

## view/ViewStateManager
ViewStateManager is a singleton for views to park their global viwe state. The state is saved
with project data but the View or View Factory is responsible for restoring the view state
when the view is created.

Views should implement `getViewState()` so that the view state can be saved and that data is cached
for later use.

Views or View Factories are responsible for restoring the view state when the view of that file is created
by recalling the cached state.  Views determine what data is store in the view state and how to restore it.


* [view/ViewStateManager](#module_view/ViewStateManager)
    * [.reset()](#module_view/ViewStateManager..reset)
    * [.updateViewState(view, viewState)](#module_view/ViewStateManager..updateViewState)
    * [.getViewState(file)](#module_view/ViewStateManager..getViewState) ⇒ <code>\*</code>
    * [.addViewStates(viewStates)](#module_view/ViewStateManager..addViewStates)

<a name="module_view/ViewStateManager..reset"></a>

### view/ViewStateManager.reset()
resets the view state cache

**Kind**: inner method of [<code>view/ViewStateManager</code>](#module_view/ViewStateManager)  
<a name="module_view/ViewStateManager..updateViewState"></a>

### view/ViewStateManager.updateViewState(view, viewState)
Updates the view state for the specified view

**Kind**: inner method of [<code>view/ViewStateManager</code>](#module_view/ViewStateManager)  

| Param | Type | Description |
| --- | --- | --- |
| view | <code>Object</code> | the to save state |
| viewState | <code>\*</code> | any data that the view needs to restore the view state. |

<a name="module_view/ViewStateManager..getViewState"></a>

### view/ViewStateManager.getViewState(file) ⇒ <code>\*</code>
gets the view state for the specified file

**Kind**: inner method of [<code>view/ViewStateManager</code>](#module_view/ViewStateManager)  
**Returns**: <code>\*</code> - whatever data that was saved earlier with a call setViewState  

| Param | Type | Description |
| --- | --- | --- |
| file | <code>File</code> | the file to record the view state for |

<a name="module_view/ViewStateManager..addViewStates"></a>

### view/ViewStateManager.addViewStates(viewStates)
adds an array of view states

**Kind**: inner method of [<code>view/ViewStateManager</code>](#module_view/ViewStateManager)  

| Param | Type | Description |
| --- | --- | --- |
| viewStates | <code>object.&lt;string, \*&gt;</code> | View State object to append to the current set of view states |

