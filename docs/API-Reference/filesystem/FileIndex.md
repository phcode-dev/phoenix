### Import :
```js
const FileIndex = brackets.getModule("filesystem/FileIndex")
```

<a name="FileIndex"></a>

## FileIndex
**Kind**: global class  

* [FileIndex](#FileIndex)
    * [.clear()](#FileIndex+clear)
    * [.doNotRemoveFromIndex()](#FileIndex+doNotRemoveFromIndex)
    * [.visitAll(Called)](#FileIndex+visitAll)
    * [.addEntry(entry)](#FileIndex+addEntry)
    * [.removeEntry(entry)](#FileIndex+removeEntry)
    * [.entryRenamed(oldPath, newPath, isDirectory)](#FileIndex+entryRenamed)
    * [.getEntry(path)](#FileIndex+getEntry) ⇒ <code>File</code> \| <code>Directory</code>

<a name="FileIndex+clear"></a>

### fileIndex.clear()
Clear the file index cache.

**Kind**: instance method of [<code>FileIndex</code>](#FileIndex)  
<a name="FileIndex+doNotRemoveFromIndex"></a>

### fileIndex.doNotRemoveFromIndex()
Will prevent the file from being removed from index. However, it is reset when index is cleared.

**Kind**: instance method of [<code>FileIndex</code>](#FileIndex)  
<a name="FileIndex+visitAll"></a>

### fileIndex.visitAll(Called)
Visits every entry in the entire index; no stopping condition.

**Kind**: instance method of [<code>FileIndex</code>](#FileIndex)  

| Param | Type | Description |
| --- | --- | --- |
| Called | <code>function</code> | with an entry and its fullPath |

<a name="FileIndex+addEntry"></a>

### fileIndex.addEntry(entry)
Add an entry.

**Kind**: instance method of [<code>FileIndex</code>](#FileIndex)  

| Param | Type | Description |
| --- | --- | --- |
| entry | <code>FileSystemEntry</code> | The entry to add. |

<a name="FileIndex+removeEntry"></a>

### fileIndex.removeEntry(entry)
Remove an entry.

**Kind**: instance method of [<code>FileIndex</code>](#FileIndex)  

| Param | Type | Description |
| --- | --- | --- |
| entry | <code>FileSystemEntry</code> | The entry to remove. |

<a name="FileIndex+entryRenamed"></a>

### fileIndex.entryRenamed(oldPath, newPath, isDirectory)
Notify the index that an entry has been renamed. This updates
all affected entries in the index.

**Kind**: instance method of [<code>FileIndex</code>](#FileIndex)  

| Param | Type |
| --- | --- |
| oldPath | <code>string</code> | 
| newPath | <code>string</code> | 
| isDirectory | <code>boolean</code> | 

<a name="FileIndex+getEntry"></a>

### fileIndex.getEntry(path) ⇒ <code>File</code> \| <code>Directory</code>
Returns the cached entry for the specified path, or undefined
if the path has not been cached.

**Kind**: instance method of [<code>FileIndex</code>](#FileIndex)  
**Returns**: <code>File</code> \| <code>Directory</code> - The entry for the path, or undefined if it hasn't
             been cached yet.  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | The path of the entry to return. |

<a name="FileUtils"></a>

## FileUtils
FileIndex is an internal module used by FileSystem to maintain an index of all files and directories.

This module is *only* used by FileSystem, and should not be called directly.

**Kind**: global variable  
