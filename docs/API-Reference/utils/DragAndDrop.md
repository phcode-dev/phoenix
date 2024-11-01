### Import :
```js
const DragAndDrop = brackets.getModule("utils/DragAndDrop")
```

<a name="isValidDrop"></a>

## isValidDrop(items) ⇒ <code>boolean</code>
Returns true if the drag and drop items contains valid drop objects.

**Kind**: global function  
**Returns**: <code>boolean</code> - True if one or more items can be dropped.  

| Param | Type | Description |
| --- | --- | --- |
| items | <code>Array.&lt;DataTransferItem&gt;</code> | Array of items being dragged |

<a name="openDroppedFiles"></a>

## openDroppedFiles(paths) ⇒ <code>Promise</code>
Open dropped files

**Kind**: global function  
**Returns**: <code>Promise</code> - Promise that is resolved if all files are opened, or rejected
    if there was an error.  

| Param | Type | Description |
| --- | --- | --- |
| paths | <code>Array.&lt;string&gt;</code> | Array of file paths dropped on the application. |

<a name="attachHandlers"></a>

## attachHandlers()
Attaches global drag & drop handlers to this window. This enables dropping files/folders to open them, and also
protects the Brackets app from being replaced by the browser trying to load the dropped file in its place.

**Kind**: global function  
