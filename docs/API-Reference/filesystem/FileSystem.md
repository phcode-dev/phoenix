### Import :
```js
const FileSystem = brackets.getModule("filesystem/FileSystem")
```

<a name="FileSystem"></a>

## FileSystem
**Kind**: global class  

* [FileSystem](#FileSystem)
    * [new FileSystem()](#new_FileSystem_new)
    * _instance_
        * [._impl](#FileSystem+_impl)
        * [._index](#FileSystem+_index)
        * [._activeChangeCount](#FileSystem+_activeChangeCount) : <code>number</code>
        * [._externalChanges](#FileSystem+_externalChanges) : <code>Object</code>
        * [._watchRequests](#FileSystem+_watchRequests) : <code>Object</code>
        * [._watchedRoots](#FileSystem+_watchedRoots) : <code>Object.&lt;string, WatchedRoot&gt;</code>
        * [._triggerExternalChangesNow()](#FileSystem+_triggerExternalChangesNow)
        * [._enqueueExternalChange(path, [stat])](#FileSystem+_enqueueExternalChange)
        * [._dequeueWatchRequest()](#FileSystem+_dequeueWatchRequest)
        * [._enqueueWatchRequest(fn, cb)](#FileSystem+_enqueueWatchRequest)
        * [._findWatchedRootForPath(fullPath)](#FileSystem+_findWatchedRootForPath) ⇒ <code>Object</code>
        * [.init(impl)](#FileSystem+init)
        * [.close()](#FileSystem+close)
        * [.alwaysIndex()](#FileSystem+alwaysIndex)
        * [._beginChange()](#FileSystem+_beginChange)
        * [._endChange()](#FileSystem+_endChange)
        * [._normalizePath(path, [isDirectory])](#FileSystem+_normalizePath) ⇒ <code>string</code>
        * [.addEntryForPathIfRequired(The, The)](#FileSystem+addEntryForPathIfRequired)
        * [.getFileForPath(path)](#FileSystem+getFileForPath) ⇒ <code>File</code>
        * [.copy(src, dst, callback)](#FileSystem+copy)
        * [.getFreePath(suggestedPath, callback)](#FileSystem+getFreePath)
        * [.getDirectoryForPath(path)](#FileSystem+getDirectoryForPath) ⇒ [<code>Directory</code>](#Directory)
        * [.resolve(path, callback)](#FileSystem+resolve)
        * [.existsAsync(path, callback)](#FileSystem+existsAsync)
        * [.resolveAsync(path)](#FileSystem+resolveAsync) ⇒ <code>Object</code>
        * [.showOpenDialog(allowMultipleSelection, chooseDirectories, title, initialPath, fileTypes, callback)](#FileSystem+showOpenDialog)
        * [.showSaveDialog(title, initialPath, proposedNewFilename, callback)](#FileSystem+showSaveDialog)
        * [._fireRenameEvent(oldPath, newPath)](#FileSystem+_fireRenameEvent)
        * [._fireChangeEvent(entry, [added], [removed])](#FileSystem+_fireChangeEvent)
        * [._handleDirectoryChange(directory, callback)](#FileSystem+_handleDirectoryChange)
        * [.getAllDirectoryContents(directory, [filterNothing])](#FileSystem+getAllDirectoryContents) ⇒ <code>Promise.&lt;Array.&lt;(File\|Directory)&gt;&gt;</code>
        * [.clearAllCaches()](#FileSystem+clearAllCaches)
        * [.watch(entry, filter, filterGitIgnore, [callback])](#FileSystem+watch)
        * [.unwatch(entry, [callback])](#FileSystem+unwatch)
    * _static_
        * [.isAbsolutePath(fullPath)](#FileSystem.isAbsolutePath) ⇒ <code>boolean</code>

<a name="new_FileSystem_new"></a>

### new FileSystem()
The FileSystem is not usable until init() signals its callback.

<a name="FileSystem+_impl"></a>

### fileSystem.\_impl
The low-level file system implementation used by this object.This is set in the init() function and cannot be changed.

**Kind**: instance property of [<code>FileSystem</code>](#FileSystem)  
<a name="FileSystem+_index"></a>

### fileSystem.\_index
The FileIndex used by this object. This is initialized in the constructor.

**Kind**: instance property of [<code>FileSystem</code>](#FileSystem)  
<a name="FileSystem+_activeChangeCount"></a>

### fileSystem.\_activeChangeCount : <code>number</code>
Refcount of any pending filesystem mutation operations (e.g., writes,unlinks, etc.). Used to ensure that external change events aren't processeduntil after index fixups, operation-specific callbacks, and internal changeevents are complete. (This is important for distinguishing rename froman unrelated delete-add pair).

**Kind**: instance property of [<code>FileSystem</code>](#FileSystem)  
<a name="FileSystem+_externalChanges"></a>

### fileSystem.\_externalChanges : <code>Object</code>
Queue of arguments with which to invoke _handleExternalChanges(); triggeredonce _activeChangeCount drops to zero.

**Kind**: instance property of [<code>FileSystem</code>](#FileSystem)  
<a name="FileSystem+_watchRequests"></a>

### fileSystem.\_watchRequests : <code>Object</code>
The queue of pending watch/unwatch requests.

**Kind**: instance property of [<code>FileSystem</code>](#FileSystem)  
<a name="FileSystem+_watchedRoots"></a>

### fileSystem.\_watchedRoots : <code>Object.&lt;string, WatchedRoot&gt;</code>
The set of watched roots, encoded as a mapping from full paths to WatchedRootobjects which contain a file entry, filter function, and an indication ofwhether the watched root is inactive, starting up or fully active.

**Kind**: instance property of [<code>FileSystem</code>](#FileSystem)  
<a name="FileSystem+_triggerExternalChangesNow"></a>

### fileSystem.\_triggerExternalChangesNow()
Process all queued watcher results, by calling _handleExternalChange() on each

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  
<a name="FileSystem+_enqueueExternalChange"></a>

### fileSystem.\_enqueueExternalChange(path, [stat])
Receives a result from the impl's watcher callback, and either processes itimmediately (if _activeChangeCount is 0) or otherwise stores it for laterprocessing.

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | The fullPath of the changed entry |
| [stat] | <code>FileSystemStats</code> | An optional stat object for the changed entry |

<a name="FileSystem+_dequeueWatchRequest"></a>

### fileSystem.\_dequeueWatchRequest()
Dequeue and process all pending watch/unwatch requests

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  
<a name="FileSystem+_enqueueWatchRequest"></a>

### fileSystem.\_enqueueWatchRequest(fn, cb)
Enqueue a new watch/unwatch request.

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  

| Param | Type | Description |
| --- | --- | --- |
| fn | <code>function</code> | The watch/unwatch request function. |
| cb | <code>callback()</code> | The callback for the provided watch/unwatch      request function. |

<a name="FileSystem+_findWatchedRootForPath"></a>

### fileSystem.\_findWatchedRootForPath(fullPath) ⇒ <code>Object</code>
Finds a parent watched root for a given path, or returns null if a parentwatched root does not exist.

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  
**Returns**: <code>Object</code> - The parent     watched root, if it exists, or null.  

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> | The child path for which a parent watched root is to be found. |

<a name="FileSystem+init"></a>

### fileSystem.init(impl)
Initialize this FileSystem instance.

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  

| Param | Type | Description |
| --- | --- | --- |
| impl | <code>FileSystemImpl</code> | The back-end implementation for this      FileSystem instance. |

<a name="FileSystem+close"></a>

### fileSystem.close()
Close a file system. Clear all caches, indexes, and file watchers.

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  
<a name="FileSystem+alwaysIndex"></a>

### fileSystem.alwaysIndex()
Will never remove the given file from index. Useful if you want to always hold cache the file.

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  
<a name="FileSystem+_beginChange"></a>

### fileSystem.\_beginChange()
Indicates that a filesystem-mutating operation has begun. As long as thereare changes taking place, change events from the external watchers areblocked and queued, to be handled once changes have finished. This is donebecause for mutating operations that originate from within the filesystem,synthetic change events are fired that do not depend on external filewatchers, and we prefer the former over the latter for the followingreasons: 1) there is no delay; and 2) they may have higher fidelity ---e.g., a rename operation can be detected as such, instead of as a nearlysimultaneous addition and deletion.All operations that mutate the file system MUST begin with a call to_beginChange and must end with a call to _endChange.

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  
<a name="FileSystem+_endChange"></a>

### fileSystem.\_endChange()
Indicates that a filesystem-mutating operation has completed. SeeFileSystem._beginChange above.

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  
<a name="FileSystem+_normalizePath"></a>

### fileSystem.\_normalizePath(path, [isDirectory]) ⇒ <code>string</code>
Returns a canonical version of the path: no duplicated "/"es, no ".."s,and directories guaranteed to end in a trailing "/"

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | Absolute path, using "/" as path separator |
| [isDirectory] | <code>boolean</code> |  |

<a name="FileSystem+addEntryForPathIfRequired"></a>

### fileSystem.addEntryForPathIfRequired(The, The)
This method adds an entry for a file in the file Index. Files on disk are addedto the file index either on load or on open. This method is primarily needed to addin memory files to the index

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  

| Param | Type | Description |
| --- | --- | --- |
| The | <code>File</code> | fileEntry which needs to be added |
| The | <code>String</code> | full path to the file |

<a name="FileSystem+getFileForPath"></a>

### fileSystem.getFileForPath(path) ⇒ <code>File</code>
Return a File object for the specified path.

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  
**Returns**: <code>File</code> - The File object. This file may not yet exist on disk.  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | Absolute path of file. |

<a name="FileSystem+copy"></a>

### fileSystem.copy(src, dst, callback)
copies a file/folder path from src to destination recursively. follows unix copy semantics mostly.As with unix copy, the destination path may not be exactly the `dst` path provided.Eg. copy("/a/b", "/a/x") -> will copy to `/a/x/b` if folder `/a/x` exists. If dst `/a/x` not exists,then copy will honor the given destination `/a/x`

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  

| Param | Type | Description |
| --- | --- | --- |
| src | <code>string</code> | Absolute path of file or directory to copy |
| dst | <code>string</code> | Absolute path of file or directory destination |
| callback | <code>function</code> | Callback with err or stat of copied destination. |

<a name="FileSystem+getFreePath"></a>

### fileSystem.getFreePath(suggestedPath, callback)
Return a path that is free to use for the given suggestedPath.If suggestedPath is, Eg: `/a/b/dir` , then if `/a/b/dir` does not exist, it will be returned as is.if suggestedPath exists and is a dir, then the next available path will be returned like`/a/b/dir(copy)`, /a/b/dir(copy 1)`...if suggestedPath exists and is a file say `/a/b/test.html`, then the next available path will be returned like`/a/b/test (copy).html`, /a/b/test (copy 1).html`...

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  

| Param | Type | Description |
| --- | --- | --- |
| suggestedPath | <code>string</code> | Absolute path of file or directory to check if free. |
| callback | <code>function</code> | Callback with err or Absolute path that is free to use. |

<a name="FileSystem+getDirectoryForPath"></a>

### fileSystem.getDirectoryForPath(path) ⇒ [<code>Directory</code>](#Directory)
Return a Directory object for the specified path.

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  
**Returns**: [<code>Directory</code>](#Directory) - The Directory object. This directory may not yet exist on disk.  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | Absolute path of directory. |

<a name="FileSystem+resolve"></a>

### fileSystem.resolve(path, callback)
Resolve a path.

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | The path to resolve |
| callback | <code>function</code> | Callback resolved      with a FileSystemError string or with the entry for the provided path. |

<a name="FileSystem+existsAsync"></a>

### fileSystem.existsAsync(path, callback)
Determine whether a file or directory exists at the given pathresolved to a boolean, which is true if the file exists and false otherwise.The error will never be FileSystemError.NOT_FOUND; in that case, there will be no error and theboolean parameter will be false.

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  

| Param | Type |
| --- | --- |
| path | <code>string</code> | 
| callback | <code>function</code> | 

<a name="FileSystem+resolveAsync"></a>

### fileSystem.resolveAsync(path) ⇒ <code>Object</code>
promisified version of FileSystem.resolve

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>String</code> | to resolve |

<a name="FileSystem+showOpenDialog"></a>

### fileSystem.showOpenDialog(allowMultipleSelection, chooseDirectories, title, initialPath, fileTypes, callback)
Show an "Open" dialog and return the file(s)/directories selected by the user.

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  

| Param | Type | Description |
| --- | --- | --- |
| allowMultipleSelection | <code>boolean</code> | Allows selecting more than one file at a time |
| chooseDirectories | <code>boolean</code> | Allows directories to be opened |
| title | <code>string</code> | The title of the dialog |
| initialPath | <code>string</code> | The folder opened inside the window initially. If initialPath                          is not set, or it doesn't exist, the window would show the last                          browsed folder depending on the OS preferences |
| fileTypes | <code>Array.&lt;string&gt;</code> | (Currently *ignored* except on Mac - https://trello.com/c/430aXkpq)                          List of extensions that are allowed to be opened, without leading ".".                          Null or empty array allows all files to be selected. Not applicable                          when chooseDirectories = true. |
| callback | <code>function</code> | Callback resolved with a FileSystemError                          string or the selected file(s)/directories. If the user cancels the                          open dialog, the error will be falsy and the file/directory array will                          be empty. |

<a name="FileSystem+showSaveDialog"></a>

### fileSystem.showSaveDialog(title, initialPath, proposedNewFilename, callback)
Show a "Save" dialog and return the path of the file to save.

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  

| Param | Type | Description |
| --- | --- | --- |
| title | <code>string</code> | The title of the dialog. |
| initialPath | <code>string</code> | The folder opened inside the window initially. If initialPath                          is not set, or it doesn't exist, the window would show the last                          browsed folder depending on the OS preferences. |
| proposedNewFilename | <code>string</code> | Provide a new file name for the user. This could be based on                          on the current file name plus an additional suffix |
| callback | <code>function</code> | Callback that is resolved with a FileSystemError                          string or the name of the file to save. If the user cancels the save,                          the error will be falsy and the name will be empty. |

<a name="FileSystem+_fireRenameEvent"></a>

### fileSystem.\_fireRenameEvent(oldPath, newPath)
Fire a rename event. Clients listen for these events using FileSystem.on.

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  

| Param | Type | Description |
| --- | --- | --- |
| oldPath | <code>string</code> | The entry's previous fullPath |
| newPath | <code>string</code> | The entry's current fullPath |

<a name="FileSystem+_fireChangeEvent"></a>

### fileSystem.\_fireChangeEvent(entry, [added], [removed])
Fire a change event. Clients listen for these events using FileSystem.on.

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  

| Param | Type | Description |
| --- | --- | --- |
| entry | <code>File</code> \| [<code>Directory</code>](#Directory) | The entry that has changed |
| [added] | <code>Array.&lt;(File\|Directory)&gt;</code> | If the entry is a directory, this      is a set of new entries in the directory. |
| [removed] | <code>Array.&lt;(File\|Directory)&gt;</code> | If the entry is a directory, this      is a set of removed entries from the directory. |

<a name="FileSystem+_handleDirectoryChange"></a>

### fileSystem.\_handleDirectoryChange(directory, callback)
Notify the filesystem that the given directory has changed. Updates the filesystem'sinternal state as a result of the change, and calls back with the set of added andremoved entries. Mutating FileSystemEntry operations should call this method beforeapplying the operation's callback, and pass along the resulting change sets in theinternal change event.

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  

| Param | Type | Description |
| --- | --- | --- |
| directory | [<code>Directory</code>](#Directory) | The directory that has changed. |
| callback | <code>function</code> | The callback that will be applied to a set of added and a set of removed      FileSystemEntry objects. |

<a name="FileSystem+getAllDirectoryContents"></a>

### fileSystem.getAllDirectoryContents(directory, [filterNothing]) ⇒ <code>Promise.&lt;Array.&lt;(File\|Directory)&gt;&gt;</code>
Recursively gets all files and directories given a root path. It filters out all filesthat are not shown in the file tree by default, unless the filterNothing option is specified.

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  
**Returns**: <code>Promise.&lt;Array.&lt;(File\|Directory)&gt;&gt;</code> - A promise that resolves with an array of file and directory contents.  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| directory | [<code>Directory</code>](#Directory) |  | The root directory to get all descendant contents from. |
| [filterNothing] | <code>boolean</code> | <code>false</code> | If true, returns everything, including system locations like `.git`.     Use this option for full backups or entire disk read workflows. |

<a name="FileSystem+clearAllCaches"></a>

### fileSystem.clearAllCaches()
Clears all cached content. Because of the performance implications of this, this should only be used ifthere is a suspicion that the file system has not been updated through the normal file watchersmechanism.

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  
<a name="FileSystem+watch"></a>

### fileSystem.watch(entry, filter, filterGitIgnore, [callback])
Start watching a filesystem root entry.

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  

| Param | Type | Description |
| --- | --- | --- |
| entry | <code>FileSystemEntry</code> | The root entry to watch. If entry is a directory,      all subdirectories that aren't explicitly filtered will also be watched. |
| filter | <code>function</code> | Returns true if a particular item should      be watched, given its name (not full path). Items that are ignored are also      filtered from Directory.getContents() results within this subtree. |
| filterGitIgnore | <code>string</code> \| <code>Array.&lt;string&gt;</code> | GitIgnore file contents or as arrayof strings for      filtering out events on the node side. |
| [callback] | <code>function</code> | A function that is called when the watch has      completed. If the watch fails, the function will have a non-null FileSystemError      string parametr. |

<a name="FileSystem+unwatch"></a>

### fileSystem.unwatch(entry, [callback])
Stop watching a filesystem root entry.

**Kind**: instance method of [<code>FileSystem</code>](#FileSystem)  

| Param | Type | Description |
| --- | --- | --- |
| entry | <code>FileSystemEntry</code> | The root entry to stop watching. The unwatch will      if the entry is not currently being watched. |
| [callback] | <code>function</code> | A function that is called when the unwatch has      completed. If the unwatch fails, the function will have a non-null FileSystemError      string parameter. |

<a name="FileSystem.isAbsolutePath"></a>

### FileSystem.isAbsolutePath(fullPath) ⇒ <code>boolean</code>
Determines whether or not the supplied path is absolute, as opposed to relative.

**Kind**: static method of [<code>FileSystem</code>](#FileSystem)  
**Returns**: <code>boolean</code> - True if the fullPath is absolute and false otherwise.  

| Param | Type |
| --- | --- |
| fullPath | <code>string</code> | 

<a name="Directory"></a>

## Directory
FileSystem is a model object representing a complete file system. This object createsand manages File and Directory instances, dispatches events when the file system changes,and provides methods for showing 'open' and 'save' dialogs.FileSystem automatically initializes when loaded. It depends on a pluggable "impl" layer, whichit loads itself but must be designated in the require.config() that loads FileSystem. For detailssee: https://github.com/adobe/brackets/wiki/File-System-ImplementationsThere are three ways to get File or Directory instances:   * Use FileSystem.resolve() to convert a path to a File/Directory object. This will only     succeed if the file/directory already exists.   * Use FileSystem.getFileForPath()/FileSystem.getDirectoryForPath() if you know the     file/directory already exists, or if you want to create a new entry.   * Use Directory.getContents() to return all entries for the specified Directory.All paths passed *to* FileSystem APIs must be in the following format:   * The path separator is "/" regardless of platform   * Paths begin with "/" on Mac/Linux and "c:/" (or some other drive letter) on WindowsAll paths returned *from* FileSystem APIs additionally meet the following guarantees:   * No ".." segments   * No consecutive "/"s   * Paths to a directory always end with a trailing "/"(Because FileSystem normalizes paths automatically, paths passed *to* FileSystem do not needto meet these requirements)FileSystem dispatches the following events:(NOTE: attach to these events via `FileSystem.on()` - not `$(FileSystem).on()`)__change__ - Sent whenever there is a change in the file system. The handler  is passed up to three arguments: the changed entry and, if that changed entry  is a Directory, a list of entries added to the directory and a list of entries  removed from the Directory. The entry argument can be:  *  a File - the contents of the file have changed, and should be reloaded.  *  a Directory - an immediate child of the directory has been added, removed,     or renamed/moved. Not triggered for "grandchildren".     - If the added & removed arguments are null, we don't know what was added/removed:       clients should assume the whole subtree may have changed.     - If the added & removed arguments are 0-length, there's no net change in the set       of files but a file may have been replaced: clients should assume the contents       of any immediate child file may have changed.  *  null - a 'wholesale' change happened, and you should assume everything may     have changed.  For changes made externally, there may be a significant delay before a "change" event  is dispatched.__rename__ - Sent whenever a File or Directory is renamed. All affected File and Directory  objects have been updated to reflect the new path by the time this event is dispatched.  This event should be used to trigger any UI updates that may need to occur when a path  has changed. Note that these events will only be sent for rename operations that happen  within the filesystem. If a file is renamed externally, a change event on the parent  directory will be sent instead.FileSystem may perform caching. But it guarantees:   * File contents & metadata - reads are guaranteed to be up to date (cached data is not used     without first veryifying it is up to date).   * Directory structure / file listing - reads may return cached data immediately, which may not     reflect external changes made recently. (However, changes made via FileSystem itself are always     reflected immediately, as soon as the change operation's callback signals success).The FileSystem doesn't directly read or write contents--this work is done by a low-levelimplementation object. This allows client code to use the FileSystem API without having toworry about the underlying storage, which could be a local filesystem or a remote server.

**Kind**: global constant  
<a name="registerProtocolAdapter"></a>

## registerProtocolAdapter(protocol, ...adapter)
FileSystem hook to register file protocol adapter

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| protocol | <code>string</code> | ex: "https:"|"http:"|"ftp:"|"file:" |
| ...adapter | [<code>Adapter</code>](#FileProtocol..Adapter) | wrapper over file implementation |

<a name="_getProtocolAdapter"></a>

## \_getProtocolAdapter(protocol, filePath) ⇒
**Kind**: global function  
**Returns**: adapter adapter wrapper over file implementation  

| Param | Type | Description |
| --- | --- | --- |
| protocol | <code>string</code> | ex: "https:"|"http:"|"ftp:"|"file:" |
| filePath | <code>string</code> | fullPath of the file |

<a name="on"></a>

## on(event, handler)
Add an event listener for a FileSystem event.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>string</code> | The name of the event |
| handler | <code>function</code> | The handler for the event |

<a name="off"></a>

## off(event, handler)
Remove an event listener for a FileSystem event.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>string</code> | The name of the event |
| handler | <code>function</code> | The handler for the event |

