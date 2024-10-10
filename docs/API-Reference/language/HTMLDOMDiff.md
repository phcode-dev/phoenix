### Import :
```js
const HTMLDOMDiff = brackets.getModule("language/HTMLDOMDiff")
```

<a name="domdiff"></a>

## domdiff(oldNode, newNode) ⇒ <code>Array.&lt;Object&gt;</code>
Generate a list of edits that will mutate oldNode to look like newNode.Currently, there are the following possible edit operations:- elementInsert- elementDelete- elementMove- textInsert- textDelete- textReplace- attrDelete- attrChange- attrAdd- rememberNodes (a special instruction that reflects the need to hang on to moved nodes)

**Kind**: global function  
**Returns**: <code>Array.&lt;Object&gt;</code> - - List of edit operations.  

| Param | Type | Description |
| --- | --- | --- |
| oldNode | <code>Object</code> | SimpleDOM node with the original content. |
| newNode | <code>Object</code> | SimpleDOM node with the new content. |


* [domdiff(oldNode, newNode)](#domdiff) ⇒ <code>Array.&lt;Object&gt;</code>
    * [.queuePush()](#domdiff..queuePush)
    * [.addEdits(delta)](#domdiff..addEdits)

<a name="domdiff..queuePush"></a>

### domdiff.queuePush()
Adds elements to the queue for generateChildEdits.Only elements (and not text nodes) are added. New nodes (ones that aren't in theold nodeMap), are not added here because they will be added when generateChildEditscreates the elementInsert edit.

**Kind**: inner method of [<code>domdiff</code>](#domdiff)  
<a name="domdiff..addEdits"></a>

### domdiff.addEdits(delta)
Aggregates the child edits in the proper data structures.

**Kind**: inner method of [<code>domdiff</code>](#domdiff)  

| Param | Type | Description |
| --- | --- | --- |
| delta | <code>Object</code> | edits, moves and newElements to add |

