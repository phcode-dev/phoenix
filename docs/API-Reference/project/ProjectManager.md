### Import :
```js
const ProjectManager = brackets.getModule("project/ProjectManager")
```

<a name="SORT_DIRECTORIES_FIRST"></a>

## SORT\_DIRECTORIES\_FIRST : <code>string</code>
Name of the preferences for sorting directories first

**Kind**: global variable  
<a name="getFileTreeContext"></a>

## getFileTreeContext() ⇒ <code>File</code> \| <code>Directory</code>
Returns the File or Directory corresponding to the item that was right-clicked on in the file tree menu.

**Kind**: global function  
<a name="getSelectedItem"></a>

## getSelectedItem() ⇒ <code>File</code> \| <code>Directory</code>
Returns the File or Directory corresponding to the item selected in the sidebar panel, whether inthe file tree OR in the working set; or null if no item is selected anywhere in the sidebar.May NOT be identical to the current Document - a folder may be selected in the sidebar, or the sidebar may nothave the current document visible in the tree & working set.

**Kind**: global function  
<a name="getBaseUrl"></a>

## getBaseUrl() ⇒ <code>String</code>
Returns the encoded Base URL of the currently loaded project, or empty string if no projectis open (during startup, or running outside of app shell).

**Kind**: global function  
<a name="setBaseUrl"></a>

## setBaseUrl(projectBaseUrl)
Sets the encoded Base URL of the currently loaded project.

**Kind**: global function  

| Param | Type |
| --- | --- |
| projectBaseUrl | <code>String</code> | 

<a name="isWithinProject"></a>

## isWithinProject(absPathOrEntry) ⇒ <code>boolean</code>
Returns true if absPath lies within the project, false otherwise.Does not support paths containing ".."

**Kind**: global function  

| Param | Type |
| --- | --- |
| absPathOrEntry | <code>string</code> \| <code>FileSystemEntry</code> | 

<a name="filterProjectFiles"></a>

## filterProjectFiles(absPathOrEntryArray) ⇒ <code>string</code> \| <code>Array.&lt;FileSystemEntry&gt;</code>
Returns an array of files that is within the project from the supplied list of paths.

**Kind**: global function  
**Returns**: <code>string</code> \| <code>Array.&lt;FileSystemEntry&gt;</code> - A array that contains only files paths that are in the project  

| Param | Type | Description |
| --- | --- | --- |
| absPathOrEntryArray | <code>string</code> \| <code>Array.&lt;FileSystemEntry&gt;</code> | array which can be either a string path or FileSystemEntry |

<a name="makeProjectRelativeIfPossible"></a>

## makeProjectRelativeIfPossible(absPath) ⇒ <code>string</code>
If absPath lies within the project, returns a project-relative path. Else returns absPathunmodified.Does not support paths containing ".."

**Kind**: global function  

| Param | Type |
| --- | --- |
| absPath | <code>string</code> | 

<a name="getProjectRelativeOrDisplayPath"></a>

## getProjectRelativeOrDisplayPath(fullPath) ⇒ <code>string</code>
Gets a generally displayable path that can be shown to the user in most cases.Gets the project relative path if possible. If paths is not in project, then if its a platform path(Eg. in tauri)it will return the full platform path. If not, then it will return a mount relative path for fs access mountfolders opened in the bowser. at last, falling back to vfs path. This should only be used for display purposesas this path will be changed by phcode depending on the situation in the future.

**Kind**: global function  

| Param |
| --- |
| fullPath | 

<a name="getProjectRoot"></a>

## getProjectRoot() ⇒ <code>Directory</code>
Returns the root folder of the currently loaded project, or null if no project is open (duringstartup, or running outside of app shell).

**Kind**: global function  
<a name="getLocalProjectsPath"></a>

## getLocalProjectsPath() ⇒ <code>string</code>
The flder where all the system managed projects live

**Kind**: global function  
<a name="addWelcomeProjectPath"></a>

## addWelcomeProjectPath(path)
Adds the path to the list of welcome projects we've ever seen, if not on the list already.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | Path to possibly add |

<a name="isWelcomeProjectPath"></a>

## isWelcomeProjectPath(path) ⇒ <code>boolean</code>
Returns true if the given path is the same as one of the welcome projects we've previously opened,or the one for the current build.

**Kind**: global function  
**Returns**: <code>boolean</code> - true if this is a welcome project path  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | Path to check to see if it's a welcome project path |

<a name="updateWelcomeProjectPath"></a>

## updateWelcomeProjectPath()
If the provided path is to an old welcome project, returns the current one instead.

**Kind**: global function  
<a name="getInitialProjectPath"></a>

## ..getInitialProjectPath()..
***Deprecated***

**Kind**: global function  
<a name="getStartupProjectPath"></a>

## getStartupProjectPath()
Initial project path is stored in prefs, which defaults to the welcome project onfirst launch.

**Kind**: global function  
<a name="_loadProject"></a>

## \_loadProject(rootPath) ⇒ <code>$.Promise</code>
Loads the given folder as a project. Does NOT prompt about any unsaved changes - use openProject()instead to check for unsaved changes and (optionally) let the user choose the folder to open.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that will be resolved when the project is loaded and tree is rendered, or rejected if the project path fails to load.  

| Param | Type | Description |
| --- | --- | --- |
| rootPath | <code>string</code> | Absolute path to the root folder of the project.  A trailing "/" on the path is optional (unlike many Brackets APIs that assume a trailing "/"). |

<a name="refreshFileTree"></a>

## refreshFileTree()
Refresh the project's file tree, maintaining the current selection.Note that the original implementation of this returned a promise to be resolved when the refresh is complete.That use is deprecated and `refreshFileTree` is now a "fire and forget" kind of function.

**Kind**: global function  
<a name="showInTree"></a>

## showInTree(entry) ⇒ <code>$.Promise</code>
Expands tree nodes to show the given file or folder and selects it. Silently no-ops if thepath lies outside the project, or if it doesn't exist.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - Resolved when done; or rejected if not found  

| Param | Type | Description |
| --- | --- | --- |
| entry | <code>File</code> \| <code>Directory</code> | File or Directory to show |

<a name="openProject"></a>

## openProject([path]) ⇒ <code>$.Promise</code>
Open a new project. Currently, Brackets must always have a project open, sothis method handles both closing the current project and opening a new project.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that will be resolved when the project is loaded and tree is rendered, or rejected if the project path fails to load.  

| Param | Type | Description |
| --- | --- | --- |
| [path] | <code>string</code> | Optional absolute path to the root folder of the project.  If path is undefined or null, displays a dialog where the user can choose a  folder to load. If the user cancels the dialog, nothing more happens. |

<a name="_projectSettings"></a>

## \_projectSettings() ⇒ <code>$.Promise</code>
Invoke project settings dialog.

**Kind**: global function  
<a name="createNewItem"></a>

## createNewItem(baseDir, initialName, skipRename, isFolder) ⇒ <code>$.Promise</code>
Create a new item in the current project.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that will be resolved with the File of the created object, or rejected if the user cancelled or entered an illegal filename.  

| Param | Type | Description |
| --- | --- | --- |
| baseDir | <code>string</code> \| <code>Directory</code> | Full path of the directory where the item should go.   Defaults to the project root if the entry is not valid or not within the project. |
| initialName | <code>string</code> | Initial name for the item |
| skipRename | <code>boolean</code> | If true, don't allow the user to rename the item |
| isFolder | <code>boolean</code> | If true, create a folder instead of a file |

<a name="deleteItem"></a>

## deleteItem(entry)
Delete file or directore from project

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| entry | <code>File</code> \| <code>Directory</code> | File or Directory to delete |

<a name="getLanguageFilter"></a>

## getLanguageFilter(languageId) ⇒ <code>function</code>
Returns a filter for use with getAllFiles() that filters files based on LanguageManager language id

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| languageId | <code>string</code> \| <code>Array.&lt;string&gt;</code> | a single string of a language id or an array of language ids |

<a name="forceFinishRename"></a>

## forceFinishRename()
Causes the rename operation that's in progress to complete.

**Kind**: global function  
<a name="setProjectBusy"></a>

## setProjectBusy(isBusy, message)
Sets or unsets project busy spinner with the specified message as reason.For Eg., if you want to mark project as busy with reason compiling project:`setProjectBusy(true, "compiling project...")` . The project spinner will be shown with the specified reason.Once the compilation is complete, call, we need to unset the busy status by calling:`setProjectBusy(false, "compiling project...")` . Make sure to pass in the exact message whencalling set and unset.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| isBusy | <code>boolean</code> | true or false to set the project as busy or not |
| message | <code>string</code> | The reason why the project is busy. Will be displayed as a hover tooltip on busy spinner. |

<a name="getProjectRelativePath"></a>

## getProjectRelativePath(path) ⇒ <code>string</code>
Return the project root relative path of the given path.

**Kind**: global function  

| Param | Type |
| --- | --- |
| path | <code>string</code> | 

<a name="getContext"></a>

## getContext()
Gets the filesystem object for the current context in the file tree.

**Kind**: global function  
<a name="renameItemInline"></a>

## renameItemInline(entry, [isMoved]) ⇒ <code>$.Promise</code>
Starts a rename operation, completing the current operation if there is one.The Promise returned is resolved with an object with a `newPath` property with the renamed path. If the user cancels the operation, the promise is resolved with the value RENAME_CANCELLED.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - a promise resolved when the rename is done.  

| Param | Type | Description |
| --- | --- | --- |
| entry | <code>FileSystemEntry</code> | file or directory filesystem object to rename |
| [isMoved] | <code>boolean</code> | optional flag which indicates whether the entry is being moved instead of renamed |

<a name="getAllFiles"></a>

## getAllFiles(filter, [includeWorkingSet], [sort], options) ⇒ <code>$.Promise</code>
Returns an Array of all files for this project, optionally includingfiles in the working set that are *not* under the project root. Files arefiltered first by ProjectModel.shouldShow(), then by the custom filterargument (if one was provided).

**Kind**: global function  
**Returns**: <code>$.Promise</code> - Promise that is resolved with an Array of File objects.  

| Param | Type | Description |
| --- | --- | --- |
| filter | <code>function</code> | Optional function to filter          the file list (does not filter directory traversal). API matches Array.filter(). |
| [includeWorkingSet] | <code>boolean</code> | If true, include files in the working set          that are not under the project root (*except* for untitled documents). |
| [sort] | <code>boolean</code> | If true, The files will be sorted by their paths |
| options | <code>Object</code> | optional path within project to narrow down the search |
| options.scope | <code>File</code> | optional path within project to narrow down the search |

<a name="addIconProvider"></a>

## addIconProvider(callback, [priority])
Adds an icon provider. The callback is invoked before each working set item is created, and canreturn content to prepend to the item if it supports the icon.

**Kind**: global function  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| callback | <code>function</code> |  | Return a string representing the HTML, a jQuery object or DOM node, or undefined. If undefined, nothing is prepended to the list item and the default or an available icon will be used. |
| [priority] | <code>number</code> | <code>0</code> | optional priority. 0 being lowest. The icons with the highest priority wins if there are multiple callback providers attached. icon providers of the same priority first valid response wins. |

<a name="addClassesProvider"></a>

## addClassesProvider(callback, [priority])
Adds a CSS class provider, invoked before each working set item is created or updated. When calledto update an existing item, all previously applied classes have been cleared.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| callback | <code>function</code> | Return a string containing space-separated CSS class(es) to add, or undefined to leave CSS unchanged. |
| [priority] | <code>number</code> | optional priority. 0 being lowest. The class with the highest priority wins if there are multiple callback classes attached. class providers of the same priority will be appended. |

<a name="rerenderTree"></a>

## rerenderTree()
Forces the file tree to rerender. Typically, the tree only rerenders the portions of thetree that have changed data. If an extension that augments the tree has changes that itneeds to display, calling rerenderTree will cause the components for the whole tree tobe rerendered.

**Kind**: global function  
