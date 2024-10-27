### Import :
```js
const PreferencesDialogs = brackets.getModule("preferences/PreferencesDialogs")
```

<a name="Dialogs"></a>

## Dialogs
PreferencesDialogs

**Kind**: global variable  
<a name="showProjectPreferencesDialog"></a>

## showProjectPreferencesDialog(baseUrl, errorMessage) ⇒ <code>Dialog</code>
Show a dialog that shows the project preferences

**Kind**: global function  
**Returns**: <code>Dialog</code> - A Dialog object with an internal promise that will be resolved with the ID
     of the clicked button when the dialog is dismissed. Never rejected.  

| Param | Type | Description |
| --- | --- | --- |
| baseUrl | <code>string</code> | Initial value |
| errorMessage | <code>string</code> | Error to display |

