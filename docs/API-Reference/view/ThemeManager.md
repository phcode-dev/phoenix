### Import :
```js
const ThemeManager = brackets.getModule("view/ThemeManager")
```

<a name="EVENT_THEME_CHANGE"></a>

## EVENT\_THEME\_CHANGE : <code>string</code>
Event when theme is changed

**Kind**: global constant  
<a name="EVENT_THEME_LOADED"></a>

## EVENT\_THEME\_LOADED : <code>string</code>
Event when theme is loaded

**Kind**: global constant  
<a name="getCurrentTheme"></a>

## getCurrentTheme() ⇒ [<code>Theme</code>](#new_Theme_new)
Get current theme object that is loaded in the editor.

**Kind**: global function  
**Returns**: [<code>Theme</code>](#new_Theme_new) - the current theme instance  
<a name="getAllThemes"></a>

## getAllThemes() ⇒ [<code>Array.&lt;Theme&gt;</code>](#new_Theme_new)
Gets all available themes

**Kind**: global function  
**Returns**: [<code>Array.&lt;Theme&gt;</code>](#new_Theme_new) - collection of all available themes  
<a name="refresh"></a>

## refresh(force)
Refresh current theme in the editor

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| force | <code>boolean</code> | Forces a reload of the current theme.  It reloads the theme file. |

<a name="loadFile"></a>

## loadFile(fileName, options) ⇒ <code>$.Promise</code>
Loads a theme from a file.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - promise object resolved with the theme to be loaded from fileName  

| Param | Type | Description |
| --- | --- | --- |
| fileName | <code>string</code> | is the full path to the file to be opened |
| options | <code>Object</code> | is an optional parameter to specify metadata    for the theme. |

<a name="loadPackage"></a>

## loadPackage(themePackage) ⇒ <code>$.Promise</code>
Loads a theme from an extension package.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - promise object resolved with the theme to be loaded from the pacakge  

| Param | Type | Description |
| --- | --- | --- |
| themePackage | <code>Object</code> | is a package from the extension manager for the theme to be loaded. |

<a name="isOSInDarkTheme"></a>

## isOSInDarkTheme()
Detects if the os settings is set to dark theme or not

**Kind**: global function  
<a name="setCurrentTheme"></a>

## setCurrentTheme(themeID) ⇒ <code>boolean</code>
Sets the current theme for the given theme id if present.

**Kind**: global function  
**Returns**: <code>boolean</code> - true if the theme was applied, else false  

| Param | Type |
| --- | --- |
| themeID | <code>string</code> | 

