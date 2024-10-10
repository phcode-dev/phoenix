### Import :
```js
const File = brackets.getModule("filesystem/File")
```

<a name="File"></a>

## File
**Kind**: global class  

* [File](#File)
    * [new File(fullPath, fileSystem)](#new_File_new)
    * [.read([options], callback)](#File+read)
    * [.write(data, [options], [callback])](#File+write)

<a name="new_File_new"></a>

### new File(fullPath, fileSystem)
Model for a File.This class should *not* be instantiated directly. Use FileSystem.getFileForPath,FileSystem.resolve, or Directory.getContents to create an instance of this class.See the FileSystem class for more details.


| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> | The full path for this File. |
| fileSystem | <code>FileSystem</code> | The file system associated with this File. |

<a name="File+read"></a>

### file.read([options], callback)
Read a file.

**Kind**: instance method of [<code>File</code>](#File)  

| Param | Type | Description |
| --- | --- | --- |
| [options] | <code>Object</code> | properties \{encoding: 'one of format supported here: https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/encoding'} |
| callback | <code>function</code> | Callback that is passed the              FileSystemError string or the file's contents and its stats. |

<a name="File+write"></a>

### file.write(data, [options], [callback])
Write a file.

**Kind**: instance method of [<code>File</code>](#File)  

| Param | Type | Description |
| --- | --- | --- |
| data | <code>string</code> | Data to write. |
| [options] | <code>Object</code> | properties \{encoding: 'one of format supported here: https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/encoding'} |
| [callback] | <code>function</code> | Callback that is passed the              FileSystemError string or the file's new stats. |

