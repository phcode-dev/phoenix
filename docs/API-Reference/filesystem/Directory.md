### Import :
```js
const Directory = brackets.getModule("filesystem/Directory")
```

<a name="Directory"></a>

## Directory
**Kind**: global class  

* [Directory](#Directory)
    * [new Directory(fullPath, fileSystem)](#new_Directory_new)
    * [._contents](#Directory+_contents) : <code>Array.&lt;FileSystemEntry&gt;</code>
    * [._contentsStats](#Directory+_contentsStats) : <code>Array.&lt;FileSystemStats&gt;</code>
    * [._contentsStatsErrors](#Directory+_contentsStatsErrors) : <code>Object.&lt;string, string&gt;</code>
    * [.isEmptyAsync()](#Directory+isEmptyAsync) ⇒ <code>Promise.&lt;boolean&gt;</code>
    * [.unlinkEmptyDirectoryAsync()](#Directory+unlinkEmptyDirectoryAsync) ⇒ <code>Promise.&lt;void&gt;</code>
    * [.getContentsAsync(filterNothing)](#Directory+getContentsAsync) ⇒ <code>Object</code>
    * [.getContents(callback, filterNothing)](#Directory+getContents)
    * [.createAsync()](#Directory+createAsync) ⇒ <code>Promise.&lt;FileSystemStats&gt;</code>
    * [.create([callback])](#Directory+create)

<a name="new_Directory_new"></a>

### new Directory(fullPath, fileSystem)
Model for a file system Directory.This class should *not* be instantiated directly. Use FileSystem.getDirectoryForPath,FileSystem.resolve, or Directory.getContents to create an instance of this class.Note: Directory.fullPath always has a trailing slash.See the FileSystem class for more details.


| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> | The full path for this Directory. |
| fileSystem | <code>FileSystem</code> | The file system associated with this Directory. |

<a name="Directory+_contents"></a>

### directory.\_contents : <code>Array.&lt;FileSystemEntry&gt;</code>
The contents of this directory. This "private" property is used by FileSystem.

**Kind**: instance property of [<code>Directory</code>](#Directory)  
<a name="Directory+_contentsStats"></a>

### directory.\_contentsStats : <code>Array.&lt;FileSystemStats&gt;</code>
The stats for the contents of this directory, such that this._contentsStats[i]corresponds to this._contents[i].

**Kind**: instance property of [<code>Directory</code>](#Directory)  
<a name="Directory+_contentsStatsErrors"></a>

### directory.\_contentsStatsErrors : <code>Object.&lt;string, string&gt;</code>
The stats errors for the contents of this directory.

**Kind**: instance property of [<code>Directory</code>](#Directory)  
<a name="Directory+isEmptyAsync"></a>

### directory.isEmptyAsync() ⇒ <code>Promise.&lt;boolean&gt;</code>
Returns true if is a directory exists and is empty.

**Kind**: instance method of [<code>Directory</code>](#Directory)  
**Returns**: <code>Promise.&lt;boolean&gt;</code> - True if directory is empty and it exists, else false.  
<a name="Directory+unlinkEmptyDirectoryAsync"></a>

### directory.unlinkEmptyDirectoryAsync() ⇒ <code>Promise.&lt;void&gt;</code>
Recursively deletes all empty subdirectories within the current directory. If all subdirectories are empty,the current directory itself will be deleted.A directory is considered empty if it doesn't contain any files in its subtree.If a subtree contains a large number of nested subdirectories and no files, the whole tree will be deleted.Only branches that contain a file will be retained.

**Kind**: instance method of [<code>Directory</code>](#Directory)  
**Returns**: <code>Promise.&lt;void&gt;</code> - A Promise that resolves when the operation is finished  
**Throws**:

- <code>FileSystemError</code> If an error occurs while accessing the filesystem

**Example**  
```js
await dir.unlinkEmptyDirectoryAsync();
```
<a name="Directory+getContentsAsync"></a>

### directory.getContentsAsync(filterNothing) ⇒ <code>Object</code>
Read the contents of a Directory, returns a promise. It filters out all filesthat are not shown in the file tree by default, unless the filterNothing option is specified.

**Kind**: instance method of [<code>Directory</code>](#Directory)  
**Returns**: <code>Object</code> - An objectwith attributes - entries(an array of file system entries), contentStats and contentsStatsErrors(a map fromcontent name to error if there is any).  

| Param | Type | Description |
| --- | --- | --- |
| filterNothing | <code>boolean</code> | is specified, will return a true contents of dir as shown in disc,      weather it is shown in the file tree or not. Can be used for backup/restore flows. |

<a name="Directory+getContents"></a>

### directory.getContents(callback, filterNothing)
Read the contents of a Directory. It filters out all filesthat are not shown in the file tree by default, unless the filterNothing option is specified.

**Kind**: instance method of [<code>Directory</code>](#Directory)  

| Param | Type | Description |
| --- | --- | --- |
| callback | <code>function</code> | Callback that is passed an error code or the stat-able contents          of the directory along with the stats for these entries and a          fullPath-to-FileSystemError string map of unstat-able entries          and their stat errors. If there are no stat errors then the last          parameter shall remain undefined. |
| filterNothing | <code>boolean</code> | is specified, will return a true contents of dir as shown in disc,      weather it is shown in the file tree or not. Can be used for backup/restore flows. |

<a name="Directory+createAsync"></a>

### directory.createAsync() ⇒ <code>Promise.&lt;FileSystemStats&gt;</code>
Create a directory and returns a promise that will resolve to a stat

**Kind**: instance method of [<code>Directory</code>](#Directory)  
**Returns**: <code>Promise.&lt;FileSystemStats&gt;</code> - resolves to the stats of the newly created dir.  
<a name="Directory+create"></a>

### directory.create([callback])
Create a directory

**Kind**: instance method of [<code>Directory</code>](#Directory)  

| Param | Type | Description |
| --- | --- | --- |
| [callback] | <code>function</code> | Callback resolved with a      FileSystemError string or the stat object for the created directory. |

