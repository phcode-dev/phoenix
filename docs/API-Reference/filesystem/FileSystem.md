### Import :
```js
const FileSystem = brackets.getModule("filesystem/FileSystem")
```

<a name="Directory"></a>

## Directory
FileSystem is a model object representing a complete file system. This object creates
and manages File and Directory instances, dispatches events when the file system changes,
and provides methods for showing 'open' and 'save' dialogs.

FileSystem automatically initializes when loaded. It depends on a pluggable "impl" layer, which
it loads itself but must be designated in the require.config() that loads FileSystem. For details
see: https://github.com/adobe/brackets/wiki/File-System-Implementations

There are three ways to get File or Directory instances:
   * Use FileSystem.resolve() to convert a path to a File/Directory object. This will only
     succeed if the file/directory already exists.
   * Use FileSystem.getFileForPath()/FileSystem.getDirectoryForPath() if you know the
     file/directory already exists, or if you want to create a new entry.
   * Use Directory.getContents() to return all entries for the specified Directory.

All paths passed *to* FileSystem APIs must be in the following format:
   * The path separator is "/" regardless of platform
   * Paths begin with "/" on Mac/Linux and "c:/" (or some other drive letter) on Windows

All paths returned *from* FileSystem APIs additionally meet the following guarantees:
   * No ".." segments
   * No consecutive "/"s
   * Paths to a directory always end with a trailing "/"
(Because FileSystem normalizes paths automatically, paths passed *to* FileSystem do not need
to meet these requirements)

FileSystem dispatches the following events:
(NOTE: attach to these events via `FileSystem.on()` - not `$(FileSystem).on()`)

__change__ - Sent whenever there is a change in the file system. The handler
  is passed up to three arguments: the changed entry and, if that changed entry
  is a Directory, a list of entries added to the directory and a list of entries
  removed from the Directory. The entry argument can be:
  *  a File - the contents of the file have changed, and should be reloaded.
  *  a Directory - an immediate child of the directory has been added, removed,
     or renamed/moved. Not triggered for "grandchildren".
     - If the added & removed arguments are null, we don't know what was added/removed:
       clients should assume the whole subtree may have changed.
     - If the added & removed arguments are 0-length, there's no net change in the set
       of files but a file may have been replaced: clients should assume the contents
       of any immediate child file may have changed.
  *  null - a 'wholesale' change happened, and you should assume everything may
     have changed.
  For changes made externally, there may be a significant delay before a "change" event
  is dispatched.

__rename__ - Sent whenever a File or Directory is renamed. All affected File and Directory
  objects have been updated to reflect the new path by the time this event is dispatched.
  This event should be used to trigger any UI updates that may need to occur when a path
  has changed. Note that these events will only be sent for rename operations that happen
  within the filesystem. If a file is renamed externally, a change event on the parent
  directory will be sent instead.

FileSystem may perform caching. But it guarantees:
   * File contents & metadata - reads are guaranteed to be up to date (cached data is not used
     without first veryifying it is up to date).
   * Directory structure / file listing - reads may return cached data immediately, which may not
     reflect external changes made recently. (However, changes made via FileSystem itself are always
     reflected immediately, as soon as the change operation's callback signals success).

The FileSystem doesn't directly read or write contents--this work is done by a low-level
implementation object. This allows client code to use the FileSystem API without having to
worry about the underlying storage, which could be a local filesystem or a remote server.

**Kind**: global constant  
<a name="registerProtocolAdapter"></a>

## registerProtocolAdapter(protocol, ...adapter)
FileSystem hook to register file protocol adapter

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| protocol | <code>string</code> | ex: "https:"|"http:"|"ftp:"|"file:" |
| ...adapter | [<code>Adapter</code>](#FileProtocol..Adapter) | wrapper over file implementation |

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

