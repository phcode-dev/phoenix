### Import :
```js
const FileUtils = brackets.getModule("file/FileUtils")
```

<a name="list"></a>

## list : <code>List</code>
of File Extensions which will be opened in external Application

**Kind**: global variable  
<a name="LINE_ENDINGS_CRLF"></a>

## LINE\_ENDINGS\_CRLF : <code>enum</code>
Line endings

**Kind**: global enum  
<a name="Maximium"></a>

## Maximium : <code>Number</code>
file size (in megabytes)  (for display strings)  This must be a hard-coded value since this value  tells how low-level APIs should behave which cannot  have a load order dependency on preferences manager

**Kind**: global constant  
<a name="Maximium"></a>

## Maximium : <code>Number</code>
file size (in bytes)  This must be a hard-coded value since this value  tells how low-level APIs should behave which cannot  have a load order dependency on preferences manager

**Kind**: global constant  
<a name="readAsText"></a>

## readAsText(file, bypassCache) ⇒ <code>$.Promise</code>
Asynchronously reads a file as UTF-8 encoded text.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - a jQuery promise that will be resolved with the file's text content plus its timestamp, or rejected with a FileSystemError string constant if the file can not be read.  

| Param | Type | Description |
| --- | --- | --- |
| file | <code>File</code> | File to read |
| bypassCache | <code>boolean</code> | an optional argument, if specified will read from disc instead of using cache. |

<a name="writeText"></a>

## writeText(file, text, [allowBlindWrite]) ⇒ <code>$.Promise</code>
Asynchronously writes a file as UTF-8 encoded text.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - a jQuery promise that will be resolved whenfile writing completes, or rejected with a FileSystemError string constant.  

| Param | Type | Description |
| --- | --- | --- |
| file | <code>File</code> | File to write |
| text | <code>string</code> |  |
| [allowBlindWrite] | <code>boolean</code> | Indicates whether or not CONTENTS_MODIFIED      errors---which can be triggered if the actual file contents differ from      the FileSystem's last-known contents---should be ignored. |

<a name="getPlatformLineEndings"></a>

## getPlatformLineEndings() ⇒ [<code>LINE\_ENDINGS\_CRLF</code>](#LINE_ENDINGS_CRLF) \| <code>LINE\_ENDINGS\_LF</code>
Returns the standard line endings for the current platform

**Kind**: global function  
<a name="sniffLineEndings"></a>

## sniffLineEndings(text) ⇒ <code>null</code> \| [<code>LINE\_ENDINGS\_CRLF</code>](#LINE_ENDINGS_CRLF) \| <code>LINE\_ENDINGS\_LF</code>
Scans the first 1000 chars of the text to determine how it encodes line endings. Returnsnull if usage is mixed or if no line endings found.

**Kind**: global function  

| Param | Type |
| --- | --- |
| text | <code>string</code> | 

<a name="translateLineEndings"></a>

## translateLineEndings(text, lineEndings) ⇒ <code>string</code>
Translates any line ending types in the given text to the be the single form specified

**Kind**: global function  

| Param | Type |
| --- | --- |
| text | <code>string</code> | 
| lineEndings | <code>null</code> \| [<code>LINE\_ENDINGS\_CRLF</code>](#LINE_ENDINGS_CRLF) \| <code>LINE\_ENDINGS\_LF</code> | 

<a name="getFileErrorString"></a>

## getFileErrorString(name) ⇒ <code>string</code>
**Kind**: global function  
**Returns**: <code>string</code> - User-friendly, localized error message  

| Param | Type |
| --- | --- |
| name | <code>FileSystemError</code> | 

<a name="showFileOpenError"></a>

## ..showFileOpenError(name) ⇒ <code>Dialog</code>..
***Deprecated***

Shows an error dialog indicating that the given file could not be opened due to the given error

**Kind**: global function  

| Param | Type |
| --- | --- |
| name | <code>FileSystemError</code> | 

<a name="makeDialogFileList"></a>

## makeDialogFileList(Array)
Creates an HTML string for a list of files to be reported on, suitable for use in a dialog.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| Array | <code>Array.&lt;string&gt;</code> | of filenames or paths to display. |

<a name="convertToNativePath"></a>

## convertToNativePath(path) ⇒ <code>string</code>
Convert a URI path to a native path.On both platforms, this unescapes the URIOn windows, URI paths start with a "/", but have a drive letter ("C:"). In thiscase, remove the initial "/".

**Kind**: global function  

| Param | Type |
| --- | --- |
| path | <code>string</code> | 

<a name="convertWindowsPathToUnixPath"></a>

## convertWindowsPathToUnixPath(path) ⇒ <code>string</code>
Convert a Windows-native path to use Unix style slashes.On Windows, this converts "C:\foo\bar\baz.txt" to "C:/foo/bar/baz.txt".On Mac, this does nothing, since Mac paths are already in Unix syntax.(Note that this does not add an initial forward-slash. Internally, ourAPIs generally use the "C:/foo/bar/baz.txt" style for "native" paths.)

**Kind**: global function  
**Returns**: <code>string</code> - A Unix-style path.  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | A native-style path. |

<a name="stripTrailingSlash"></a>

## stripTrailingSlash(path) ⇒ <code>string</code>
Removes the trailing slash from a path or URL, if it has one.Warning: this differs from the format of most paths used in Brackets! Use paths ending in "/"normally, as this is the format used by Directory.fullPath.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | or URL |

<a name="getBaseName"></a>

## getBaseName(fullPath) ⇒ <code>string</code>
Get the name of a file or a directory, removing any preceding path.

**Kind**: global function  
**Returns**: <code>string</code> - Returns the base name of a file or the name of adirectory  

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> | full path to a file or directory |

<a name="getNativeBracketsDirectoryPath"></a>

## getNativeBracketsDirectoryPath() ⇒ <code>string</code>
Returns a native absolute path to the 'brackets' source directory.Note that this only works when run in brackets/src/index.html, so it doesnot work for unit tests (which is run from brackets/test/SpecRunner.html)WARNING: unlike most paths in Brackets, this path EXCLUDES the trailing "/".

**Kind**: global function  
<a name="getNativeModuleDirectoryPath"></a>

## getNativeModuleDirectoryPath() ⇒ <code>string</code>
Given the module object passed to JS module define function,convert the path to a native absolute path.Returns a native absolute path to the module folder.WARNING: unlike most paths in Brackets, this path EXCLUDES the trailing "/".

**Kind**: global function  
<a name="getFileExtension"></a>

## getFileExtension(fullPath) ⇒ <code>string</code>
Get the file extension (excluding ".") given a path OR a bare filename.Returns "" for names with no extension. If the name starts with ".", thefull remaining text is considered the extension.

**Kind**: global function  
**Returns**: <code>string</code> - Returns the extension of a filename or empty string ifthe argument is a directory or a filename with no extension  

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> | full path to a file or directory |

<a name="getSmartFileExtension"></a>

## ..getSmartFileExtension(fullPath) ⇒ <code>string</code>..
***Deprecated***

Get the file extension (excluding ".") given a path OR a bare filename.Returns "" for names with no extension.If the only `.` in the file is the first character,returns "" as this is not considered an extension.This method considers known extensions which include `.` in them.

**Kind**: global function  
**Returns**: <code>string</code> - Returns the extension of a filename or empty string ifthe argument is a directory or a filename with no extension  

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> | full path to a file or directory |

<a name="getRelativeFilename"></a>

## getRelativeFilename(basePath, filename) ⇒ <code>string</code>
Computes filename as relative to the basePath. For example:basePath: /foo/bar/, filename: /foo/bar/baz.txtreturns: baz.txtThe net effect is that the common prefix is stripped away. If basePath is nota prefix of filename, then undefined is returned.

**Kind**: global function  
**Returns**: <code>string</code> - relative path  

| Param | Type | Description |
| --- | --- | --- |
| basePath | <code>string</code> | Path against which we're computing the relative path |
| filename | <code>string</code> | Full path to the file for which we are computing a relative path |

<a name="isStaticHtmlFileExt"></a>

## isStaticHtmlFileExt(filePath) ⇒ <code>boolean</code>
Determine if file extension is a static html file extension.

**Kind**: global function  
**Returns**: <code>boolean</code> - Returns true if fileExt is in the list  

| Param | Type | Description |
| --- | --- | --- |
| filePath | <code>string</code> | could be a path, a file name or just a file extension |

<a name="getDirectoryPath"></a>

## getDirectoryPath(fullPath) ⇒ <code>string</code>
Get the parent directory of a file. If a directory is passed, the SAME directory is returned.

**Kind**: global function  
**Returns**: <code>string</code> - Returns the path to the parent directory of a file or the path of a directory,                 including trailing "/"  

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> | full path to a file or directory |

<a name="getParentPath"></a>

## getParentPath(fullPath) ⇒ <code>string</code>
Get the parent folder of the given file/folder path. Differs from getDirectoryPath() when 'fullPath'is a directory itself: returns its parent instead of the original path. (Note: if you already have aFileSystemEntry, it's faster to use entry.parentPath instead).

**Kind**: global function  
**Returns**: <code>string</code> - Path of containing folder (including trailing "/"); or "" if path was the root  

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> | full path to a file or directory |

<a name="getFilenameWithoutExtension"></a>

## getFilenameWithoutExtension(filename) ⇒ <code>string</code>
Get the file name without the extension. Returns "" if name starts with "."

**Kind**: global function  
**Returns**: <code>string</code> - Returns the file name without the extension  

| Param | Type | Description |
| --- | --- | --- |
| filename | <code>string</code> | File name of a file or directory, without preceding path |

<a name="compareFilenames"></a>

## compareFilenames(filename1, filename2, extFirst) ⇒ <code>number</code>
Compares 2 filenames in lowercases. In Windows it compares the names without theextension first and then the extensions to fix issue #4409

**Kind**: global function  
**Returns**: <code>number</code> - The result of the compare function  

| Param | Type | Description |
| --- | --- | --- |
| filename1 | <code>string</code> |  |
| filename2 | <code>string</code> |  |
| extFirst | <code>boolean</code> | If true it compares the extensions first and then the file names. |

<a name="comparePaths"></a>

## comparePaths(path1, path2) ⇒ <code>number</code>
Compares two paths segment-by-segment, used for sorting. When two files share a path prefix,the less deeply nested one is sorted earlier in the list. Sorts files within the same parentfolder based on `compareFilenames()`.

**Kind**: global function  
**Returns**: <code>number</code> - -1, 0, or 1 depending on whether path1 is less than, equal to, or greater than    path2 according to this ordering.  

| Param | Type |
| --- | --- |
| path1 | <code>string</code> | 
| path2 | <code>string</code> | 

<a name="encodeFilePath"></a>

## encodeFilePath(path) ⇒ <code>string</code>
**Kind**: global function  
**Returns**: <code>string</code> - URI-encoded version suitable for appending to 'file:///`. It's not safe to use encodeURI()    directly since it doesn't escape chars like "#".  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | Native path in the format used by FileSystemEntry.fullPath |

<a name="shouldOpenInExternalApplication"></a>

## shouldOpenInExternalApplication(ext) ⇒ <code>string</code>
**Kind**: global function  
**Returns**: <code>string</code> - returns true If file to be opened in External Application.  

| Param | Type | Description |
| --- | --- | --- |
| ext | <code>string</code> | extension string a file |

<a name="addExtensionToExternalAppList"></a>

## addExtensionToExternalAppList(ext)
**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| ext | <code>string</code> | File Extensions to be added in External App List |

