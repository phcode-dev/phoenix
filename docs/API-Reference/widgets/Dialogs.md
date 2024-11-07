### Import :
```js
const Dialogs = brackets.getModule("widgets/Dialogs")
```

<a name="DIALOG_BTN_CANCEL"></a>

## DIALOG\_BTN\_CANCEL : <code>string</code>
`CANCEL` dialog button ID

**Kind**: global constant  
<a name="DIALOG_BTN_OK"></a>

## DIALOG\_BTN\_OK : <code>string</code>
`OK` dialog button ID

**Kind**: global constant  
<a name="DIALOG_BTN_DONTSAVE"></a>

## DIALOG\_BTN\_DONTSAVE : <code>string</code>
`DONT SAVE` dialog button ID

**Kind**: global constant  
<a name="DIALOG_BTN_SAVE_AS"></a>

## DIALOG\_BTN\_SAVE\_AS : <code>string</code>
`SAVE AS` dialog button ID

**Kind**: global constant  
<a name="DIALOG_CANCELED"></a>

## DIALOG\_CANCELED : <code>string</code>
`CANCELED` dialog button ID

**Kind**: global constant  
<a name="DIALOG_BTN_DOWNLOAD"></a>

## DIALOG\_BTN\_DOWNLOAD : <code>string</code>
`DOWNLOAD` dialog button ID

**Kind**: global constant  
<a name="DIALOG_BTN_CLASS_PRIMARY"></a>

## DIALOG\_BTN\_CLASS\_PRIMARY : <code>string</code>
Primary button class name

**Kind**: global constant  
<a name="DIALOG_BTN_CLASS_NORMAL"></a>

## DIALOG\_BTN\_CLASS\_NORMAL : <code>string</code>
Normal button class name

**Kind**: global constant  
<a name="DIALOG_BTN_CLASS_LEFT"></a>

## DIALOG\_BTN\_CLASS\_LEFT : <code>string</code>
Left-aligned button class name

**Kind**: global constant  
<a name="showModalDialogUsingTemplate"></a>

## showModalDialogUsingTemplate(template, [autoDismiss]) ⇒ [<code>Dialog</code>](#new_Dialog_new)
Creates a new modal dialog from a given template.
The template can either be a string or a jQuery object representing a DOM node that is *not* in the current DOM.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| template | <code>string</code> | A string template or jQuery object to use as the dialog HTML. |
| [autoDismiss] | <code>boolean</code> | Whether to automatically dismiss the dialog when one of the buttons      is clicked. Default true. If false, you'll need to manually handle button clicks and the Esc      key, and dismiss the dialog yourself when ready by calling `close()` on the returned dialog. |

<a name="showModalDialog"></a>

## showModalDialog(dlgClass, [title], [message], buttons, [autoDismiss]) ⇒ [<code>Dialog</code>](#new_Dialog_new)
Creates a new general purpose modal dialog using the default template and the template variables given
as parameters as described.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| dlgClass | <code>string</code> | A class name identifier for the dialog. Typically one of DefaultDialogs.* |
| [title] | <code>string</code> | The title of the dialog. Can contain HTML markup. Defaults to "". |
| [message] | <code>string</code> | The message to display in the dialog. Can contain HTML markup. Defaults to "". |
| buttons | <code>Array.&lt;Object&gt;</code> | An array of buttons where each button      has a class, id tooltip, and text property. The id is used in "data-button-id". Defaults to a single Ok button.      Typically className is one of DIALOG_BTN_CLASS_*, id is one of DIALOG_BTN_* |
| [autoDismiss] | <code>boolean</code> | Whether to automatically dismiss the dialog when one of the buttons      is clicked. Default true. If false, you'll need to manually handle button clicks and the Esc      key, and dismiss the dialog yourself when ready by calling `close()` on the returned dialog. |

<a name="showConfirmDialog"></a>

## showConfirmDialog(title, message, [autoDismiss]) ⇒ [<code>Dialog</code>](#new_Dialog_new)
Display a confirmation dialog with `OK` and `CANCEL` button

**Kind**: global function  
**Returns**: [<code>Dialog</code>](#new_Dialog_new) - the created dialog instance  

| Param | Type | Description |
| --- | --- | --- |
| title | <code>string</code> | dialog title |
| message | <code>string</code> | message to display in the dialog |
| [autoDismiss] | <code>boolean</code> | whether to automatically dismiss the dialog or not |

<a name="showInfoDialog"></a>

## showInfoDialog(title, message, [autoDismiss]) ⇒ [<code>Dialog</code>](#new_Dialog_new)
Display information dialog

**Kind**: global function  
**Returns**: [<code>Dialog</code>](#new_Dialog_new) - the created dialog instance  

| Param | Type | Description |
| --- | --- | --- |
| title | <code>string</code> | dialog title |
| message | <code>string</code> | message to display in the dialog |
| [autoDismiss] | <code>boolean</code> | whether to automatically dismiss the dialog or not |

<a name="showErrorDialog"></a>

## showErrorDialog(title, message, [autoDismiss]) ⇒ [<code>Dialog</code>](#new_Dialog_new)
Display error dialog

**Kind**: global function  
**Returns**: [<code>Dialog</code>](#new_Dialog_new) - the created dialog instance  

| Param | Type | Description |
| --- | --- | --- |
| title | <code>string</code> | dialog title |
| message | <code>string</code> | message to display in the dialog |
| [autoDismiss] | <code>boolean</code> | whether to automatically dismiss the dialog or not |

<a name="cancelModalDialogIfOpen"></a>

## cancelModalDialogIfOpen(dlgClass, [buttonId])
Immediately closes any dialog instances with the given class. The dialog callback for each instance will
be called with the special buttonId DIALOG_CANCELED (note: callback is run asynchronously).

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| dlgClass | <code>string</code> | The class name identifier for the dialog. |
| [buttonId] | <code>string</code> | The button id to use when closing the dialog. Defaults to DIALOG_CANCELED |

<a name="addLinkTooltips"></a>

## addLinkTooltips(elementOrDialog)
Ensures that all <a> tags with a URL have a tooltip showing the same URL

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| elementOrDialog | <code>jQueryObject</code> \| [<code>Dialog</code>](#new_Dialog_new) | Dialog intance, or root of other DOM tree to add tooltips to |

