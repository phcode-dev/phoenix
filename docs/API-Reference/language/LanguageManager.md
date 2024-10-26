### Import :
```js
const LanguageManager = brackets.getModule("language/LanguageManager")
```

<a name="getLanguage"></a>

## getLanguage(id) ⇒ [<code>Language</code>](#new_Language_new)
Resolves a language ID to a Language object.
File names have a higher priority than file extensions.

**Kind**: global function  
**Returns**: [<code>Language</code>](#new_Language_new) - The language with the provided identifier or undefined  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | Identifier for this language: lowercase letters, digits, and _ separators (e.g. "cpp", "foo_bar", "c99") |

<a name="getLanguageForExtension"></a>

## getLanguageForExtension(extension) ⇒ [<code>Language</code>](#new_Language_new)
Resolves a file extension to a Language object.
*Warning:* it is almost always better to use getLanguageForPath(), since Language can depend
on file name and even full path. Use this API only if no relevant file/path exists.

**Kind**: global function  
**Returns**: [<code>Language</code>](#new_Language_new) - The language for the provided extension or null if none exists  

| Param | Type | Description |
| --- | --- | --- |
| extension | <code>string</code> | Extension that language should be resolved for |

<a name="getLanguageForPath"></a>

## getLanguageForPath(path, [ignoreOverride]) ⇒ [<code>Language</code>](#new_Language_new)
Resolves a file path to a Language object.

**Kind**: global function  
**Returns**: [<code>Language</code>](#new_Language_new) - The language for the provided file type or the fallback language  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | Path to the file to find a language for |
| [ignoreOverride] | <code>boolean</code> | If set to true will cause the lookup to ignore any      overrides and return default binding. By default override is not ignored. |

<a name="getLanguages"></a>

## getLanguages() ⇒ <code>Object.&lt;string, Language&gt;</code>
Returns a map of all the languages currently defined in the LanguageManager. The key to
the map is the language id and the value is the language object.

**Kind**: global function  
**Returns**: <code>Object.&lt;string, Language&gt;</code> - A map containing all of the
     languages currently defined.  
<a name="setLanguageOverrideForPath"></a>

## setLanguageOverrideForPath(fullPath, language)
Adds a language mapping for the specified fullPath. If language is falsy (null or undefined), the mapping
is removed. The override is NOT persisted across Brackets sessions.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>fullPath</code> | absolute path of the file |
| language | <code>object</code> | language to associate the file with or falsy value to remove any existing override |

<a name="getCompoundFileExtension"></a>

## getCompoundFileExtension(fullPath) ⇒ <code>string</code>
Get the file extension (excluding ".") given a path OR a bare filename.
Returns "" for names with no extension.
If the only `.` in the file is the first character,
returns "" as this is not considered an extension.
This method considers known extensions which include `.` in them.

**Kind**: global function  
**Returns**: <code>string</code> - Returns the extension of a filename or empty string if
the argument is a directory or a filename with no extension  

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> | full path to a file or directory |

<a name="defineLanguage"></a>

## defineLanguage(id, definition) ⇒ <code>$.Promise</code>
Defines a language.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise object that will be resolved with a Language object  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | Unique identifier for this language: lowercase letters, digits, and _ separators (e.g. "cpp", "foo_bar", "c99") |
| definition | <code>Object</code> | An object describing the language |
| definition.name | <code>string</code> | Human-readable name of the language, as it's commonly referred to (e.g. "C++") |
| definition.fileExtensions | <code>Array.&lt;string&gt;</code> | List of file extensions used by this language (e.g. ["php", "php3"] or ["coffee.md"] - may contain dots) |
| definition.fileNames | <code>Array.&lt;string&gt;</code> | List of exact file names (e.g. ["Makefile"] or ["package.json]). Higher precedence than file extension. |
| definition.blockComment | <code>Array.&lt;string&gt;</code> | Array with two entries defining the block comment prefix and suffix (e.g. ["< !--", "-->"]) |
| definition.lineComment | <code>string</code> \| <code>Array.&lt;string&gt;</code> | Line comment prefixes (e.g. "//" or ["//", "#"]) |
| definition.mode | <code>string</code> \| <code>Array.&lt;string&gt;</code> | CodeMirror mode (e.g. "htmlmixed"), optionally with a MIME mode defined by that mode ["clike", "text/x-c++src"]                                                          Unless the mode is located in thirdparty/CodeMirror/mode/"name"/"name".js, you need to first load it yourself. |

