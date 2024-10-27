### Import :
```js
const ProjectModel = brackets.getModule("project/ProjectModel")
```

<a name="The ProjectModel provides methods for accessing information about the current open project.
It also manages the view model to display a FileTreeView of the project.

Events_
- EVENT_CHANGE (`change`) - Fired when theres a change that should refresh the UI
- EVENT_SHOULD_SELECT (`select`) - Fired when a selection has been made in the file tree and the file tree should be selected
- EVENT_SHOULD_FOCUS (`focus`)
- ERROR_CREATION (`creationError`) - Triggered when theres a problem creating a file"></a>

## The ProjectModel provides methods for accessing information about the current open project.
It also manages the view model to display a FileTreeView of the project.

Events:
- EVENT\_CHANGE (`change`) - Fired when theres a change that should refresh the UI
- EVENT\_SHOULD\_SELECT (`select`) - Fired when a selection has been made in the file tree and the file tree should be selected
- EVENT\_SHOULD\_FOCUS (`focus`)
- ERROR\_CREATION (`creationError`) - Triggered when theres a problem creating a file
**Kind**: global class  
<a name="InMemoryFile"></a>

## InMemoryFile
Provides the data source for a project and manages the view model for the FileTreeView.

**Kind**: global variable  
<a name="EVENT_CHANGE"></a>

## EVENT\_CHANGE : <code>string</code>
Triggered when change occurs.

**Kind**: global constant  
<a name="EVENT_SHOULD_SELECT"></a>

## EVENT\_SHOULD\_SELECT : <code>string</code>
Triggered when item should be selected.

**Kind**: global constant  
<a name="EVENT_SHOULD_FOCUS"></a>

## EVENT\_SHOULD\_FOCUS : <code>string</code>
Triggered when item should receive focus.

**Kind**: global constant  
<a name="EVENT_FS_RENAME_STARTED"></a>

## EVENT\_FS\_RENAME\_STARTED : <code>string</code>
Triggered when file system rename operation starts.

**Kind**: global constant  
<a name="EVENT_FS_RENAME_END"></a>

## EVENT\_FS\_RENAME\_END : <code>string</code>
Triggered when file system rename operation ends.

**Kind**: global constant  
<a name="ERROR_CREATION"></a>

## ERROR\_CREATION : <code>string</code>
Error during creation.

**Kind**: global constant  
<a name="ERROR_INVALID_FILENAME"></a>

## ERROR\_INVALID\_FILENAME : <code>string</code>
Error because of Invalid filename

**Kind**: global constant  
<a name="ERROR_NOT_IN_PROJECT"></a>

## ERROR\_NOT\_IN\_PROJECT : <code>string</code>
Error when an item is not in a project

**Kind**: global constant  
<a name="defaultIgnoreGlobs"></a>

## defaultIgnoreGlobs
Glob definition of files and folders that should be excluded directly
inside node domain watching with chokidar

**Kind**: global constant  
<a name="FILE_RENAMING"></a>

## FILE\_RENAMING : <code>number</code>
File renaming

**Kind**: global constant  
<a name="FILE_CREATING"></a>

## FILE\_CREATING : <code>number</code>
File creating

**Kind**: global constant  
<a name="RENAME_CANCELLED"></a>

## RENAME\_CANCELLED : <code>number</code>
Rename cancelled

**Kind**: global constant  
<a name="isValidFilename"></a>

## isValidFilename(filename) ⇒ <code>boolean</code>
Returns true if this matches valid filename specifications.
See http://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx

TODO: This likely belongs in FileUtils.

**Kind**: global function  
**Returns**: <code>boolean</code> - true if the filename is valid  

| Param | Type | Description |
| --- | --- | --- |
| filename | <code>string</code> | to check |

<a name="isValidPath"></a>

## isValidPath(path) ⇒ <code>boolean</code>
Returns true if given path is valid.

**Kind**: global function  
**Returns**: <code>boolean</code> - true if the filename is valid  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | to check |

<a name="shouldShow"></a>

## shouldShow(entry) ⇒ <code>boolean</code>
Returns false for files and directories that are not commonly useful to display.

**Kind**: global function  
**Returns**: <code>boolean</code> - true if the file should be displayed  

| Param | Type | Description |
| --- | --- | --- |
| entry | <code>FileSystemEntry</code> | File or directory to filter |

<a name="shouldIndex"></a>

## shouldIndex(entry) ⇒ <code>boolean</code>
Returns false for files and directories that should not be indexed for search or code hints.
If the entry is a directory, its children should be indexed too.

**Kind**: global function  
**Returns**: <code>boolean</code> - true if the file should be displayed  

| Param | Type | Description |
| --- | --- | --- |
| entry | <code>FileSystemEntry</code> | File or directory to filter |

<a name="doCreate"></a>

## doCreate(path, isFolder) ⇒ <code>$.Promise</code>
Creates a new file or folder at the given path. The returned promise is rejected if the filename
is invalid, the new path already exists or some other filesystem error comes up.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - resolved when the file or directory has been created.  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | path to create |
| isFolder | <code>boolean</code> | true if the new entry is a folder |

