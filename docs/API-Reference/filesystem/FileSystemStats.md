### Import :
```js
const FileSystemStats = brackets.getModule("filesystem/FileSystemStats")
```

<a name="FileSystemStats"></a>

## FileSystemStats
**Kind**: global class  
<a name="new_FileSystemStats_new"></a>

### new FileSystemStats(options)
The FileSystemStats represents a particular FileSystemEntry's stats.


| Param | Type |
| --- | --- |
| options | <code>Object</code> | 

<a name="isFile"></a>

## isFile : <code>boolean</code>
Whether or not this is a stats object for a file

**Kind**: global variable  
<a name="isDirectory"></a>

## isDirectory : <code>boolean</code>
Whether or not this is a stats object for a directory

**Kind**: global variable  
<a name="mtime"></a>

## mtime : <code>Date</code>
Modification time for a file

**Kind**: global variable  
<a name="size"></a>

## size : <code>Number</code>
Size in bytes of a file

**Kind**: global variable  
<a name="realPath"></a>

## realPath : <code>string</code>
The canonical path of this file or directory ONLY if it is a symbolic link,
and null otherwise.

**Kind**: global variable  
