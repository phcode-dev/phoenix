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

<a name="stopURIListPropagation"></a>

## stopURIListPropagation(files, event)
Determines if the event contains a type list that has a URI-list.If it does and contains an empty file list, then what is being dropped is a URL.If that is true then we stop the event propagation and default behavior to save Brackets editor from the browser taking over.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| files | <code>Array.&lt;File&gt;</code> | Array of File objects from the event datastructure. URLs are the only drop item that would contain a URI-list. |
| event | <code>event</code> | The event datastucture containing datatransfer information about the drag/drop event. Contains a type list which may or may not hold a URI-list depending on what was dragged/dropped. Interested if it does. |

<a name="openDroppedFiles"></a>

## openDroppedFiles(files) ⇒ <code>Promise</code>
Open dropped files

**Kind**: global function  
**Returns**: <code>Promise</code> - Promise that is resolved if all files are opened, or rejected    if there was an error.  

| Param | Type | Description |
| --- | --- | --- |
| files | <code>Array.&lt;string&gt;</code> | Array of files dropped on the application. |

<a name="attachHandlers"></a>

## attachHandlers()
Attaches global drag & drop handlers to this window. This enables dropping files/folders to open them, and alsoprotects the Brackets app from being replaced by the browser trying to load the dropped file in its place.

**Kind**: global function  
