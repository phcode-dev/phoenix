### Import :
```js
const Preferences = brackets.getModule("JSUtils/Preferences")
```

<a name="Preferences"></a>

## Preferences
**Kind**: global class  

* [Preferences](#Preferences)
    * [new Preferences([prefs])](#new_Preferences_new)
    * [.getExcludedDirectories()](#Preferences+getExcludedDirectories) ⇒ <code>RegExp</code>
    * [.getExcludedFiles()](#Preferences+getExcludedFiles) ⇒ <code>RegExp</code>
    * [.getMaxFileCount()](#Preferences+getMaxFileCount) ⇒ <code>number</code>
    * [.getMaxFileSize()](#Preferences+getMaxFileSize) ⇒ <code>number</code>

<a name="new_Preferences_new"></a>

### new Preferences([prefs])
Constructor to create a default preference object.


| Param | Type | Description |
| --- | --- | --- |
| [prefs] | <code>Object</code> | preference object |

<a name="Preferences+getExcludedDirectories"></a>

### preferences.getExcludedDirectories() ⇒ <code>RegExp</code>
Get the regular expression for excluded directories.

**Kind**: instance method of [<code>Preferences</code>](#Preferences)  
**Returns**: <code>RegExp</code> - Regular expression matching the directories that should
be excluded. Returns null if no directories are excluded.  
<a name="Preferences+getExcludedFiles"></a>

### preferences.getExcludedFiles() ⇒ <code>RegExp</code>
Get the regular expression for excluded files.

**Kind**: instance method of [<code>Preferences</code>](#Preferences)  
**Returns**: <code>RegExp</code> - Regular expression matching the files that should
be excluded. Returns null if no files are excluded.  
<a name="Preferences+getMaxFileCount"></a>

### preferences.getMaxFileCount() ⇒ <code>number</code>
Get the maximum number of files that will be analyzed.

**Kind**: instance method of [<code>Preferences</code>](#Preferences)  
<a name="Preferences+getMaxFileSize"></a>

### preferences.getMaxFileSize() ⇒ <code>number</code>
Get the maximum size of a file that will be analyzed. Files that are
larger will be ignored.

**Kind**: instance method of [<code>Preferences</code>](#Preferences)  
