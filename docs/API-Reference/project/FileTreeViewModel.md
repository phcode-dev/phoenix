### Import :
```js
const FileTreeViewModel = brackets.getModule("project/FileTreeViewModel")
```

<a name="Contains the treeData used to generate the file tree and methods used to update thattreeData.Instances dispatch the following events_- change (FileTreeViewModel.EVENT_CHANGE constant)_ Fired any time theres a change that should be reflected in the view."></a>

## Contains the treeData used to generate the file tree and methods used to update thattreeData.Instances dispatch the following events:- change (FileTreeViewModel.EVENT\_CHANGE constant): Fired any time theres a change that should be reflected in the view.
**Kind**: global class  
<a name="Immutable"></a>

## Immutable
The view model (or a Store in the Flux terminology) used by the file tree.Many of the view model's methods are implemented by pure functions, which can behelpful for composability. Many of the methods commit the new treeData and send achange event when they're done whereas the functions do not do this.

**Kind**: global variable  
<a name="isFile"></a>

## isFile(entry) ⇒ <code>boolean</code>
Determine if an entry from the treeData map is a file.

**Kind**: global function  
**Returns**: <code>boolean</code> - true if this is a file and not a directory  

| Param | Type | Description |
| --- | --- | --- |
| entry | <code>Immutable.Map</code> | entry to test |

<a name="_closeSubtree"></a>

## \_closeSubtree(directory) ⇒ <code>Immutable.Map</code>
Closes a subtree path, given by an object path.

**Kind**: global function  
**Returns**: <code>Immutable.Map</code> - new directory  

| Param | Type | Description |
| --- | --- | --- |
| directory | <code>Immutable.Map</code> | Current directory |

