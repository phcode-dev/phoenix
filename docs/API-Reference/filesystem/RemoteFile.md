### Import :
```js
const RemoteFile = brackets.getModule("filesystem/RemoteFile")
```

<a name="RemoteFile"></a>

## RemoteFile
**Kind**: global class  

* [RemoteFile](#RemoteFile)
    * [new RemoteFile(fullPath, fileSystem)](#new_RemoteFile_new)
    * [.toString()](#RemoteFile+toString)
    * [.stat(callback)](#RemoteFile+stat)
    * [.read([options], callback)](#RemoteFile+read)
    * [.write(data, [options], [callback])](#RemoteFile+write)
    * [.exists(callback)](#RemoteFile+exists)
    * [.unlink(callback)](#RemoteFile+unlink)
    * [.rename(callback)](#RemoteFile+rename)
    * [.moveToTrash(callback)](#RemoteFile+moveToTrash)

<a name="new_RemoteFile_new"></a>

### new RemoteFile(fullPath, fileSystem)
Model for a RemoteFile.

This class should *not* be instantiated directly. Use FileSystem.getFileForPath

See the FileSystem class for more details.


| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> | The full path for this File. |
| fileSystem | <code>FileSystem</code> | The file system associated with this File. |

<a name="RemoteFile+toString"></a>

### remoteFile.toString()
Helpful toString for debugging and equality check purposes

**Kind**: instance method of [<code>RemoteFile</code>](#RemoteFile)  
<a name="RemoteFile+stat"></a>

### remoteFile.stat(callback)
Returns the stats for the remote entry.

**Kind**: instance method of [<code>RemoteFile</code>](#RemoteFile)  

| Param | Type | Description |
| --- | --- | --- |
| callback | <code>function</code> | Callback with a      FileSystemError string or FileSystemStats object. |

<a name="RemoteFile+read"></a>

### remoteFile.read([options], callback)
Reads a remote file.

**Kind**: instance method of [<code>RemoteFile</code>](#RemoteFile)  

| Param | Type | Description |
| --- | --- | --- |
| [options] | <code>Object</code> | Currently unused. |
| callback | <code>function</code> | Callback that is passed the              FileSystemError string or the file's contents and its stats. |

<a name="RemoteFile+write"></a>

### remoteFile.write(data, [options], [callback])
Write a file.

**Kind**: instance method of [<code>RemoteFile</code>](#RemoteFile)  

| Param | Type | Description |
| --- | --- | --- |
| data | <code>string</code> | Data to write. |
| [options] | <code>object</code> | Currently unused. |
| [callback] | <code>function</code> | Callback that is passed the              FileSystemError string or the file's new stats. |

<a name="RemoteFile+exists"></a>

### remoteFile.exists(callback)
Check if the remote file exists or not

**Kind**: instance method of [<code>RemoteFile</code>](#RemoteFile)  

| Param | Type |
| --- | --- |
| callback | <code>function</code> | 

<a name="RemoteFile+unlink"></a>

### remoteFile.unlink(callback)
Unlink the remote file

**Kind**: instance method of [<code>RemoteFile</code>](#RemoteFile)  

| Param | Type |
| --- | --- |
| callback | <code>function</code> | 

<a name="RemoteFile+rename"></a>

### remoteFile.rename(callback)
Rename the remote file

**Kind**: instance method of [<code>RemoteFile</code>](#RemoteFile)  

| Param | Type |
| --- | --- |
| callback | <code>function</code> | 

<a name="RemoteFile+moveToTrash"></a>

### remoteFile.moveToTrash(callback)
Move the remote file to trash

**Kind**: instance method of [<code>RemoteFile</code>](#RemoteFile)  

| Param | Type |
| --- | --- |
| callback | <code>function</code> | 

