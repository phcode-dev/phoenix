### Import :
```js
const FileSyncManager = brackets.getModule("project/FileSyncManager")
```

<a name="syncOpenDocuments"></a>

## syncOpenDocuments(title)
Check to see whether any open files have been modified by an external app since the last time
Brackets synced up with the copy on disk (either by loading or saving the file). For clean
files, we silently upate the editor automatically. For files with unsaved changes, we prompt
the user.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| title | <code>string</code> | Title to use for document. Default is "External Changes". |

