### Import :
```js
const NotificationUI = brackets.getModule("widgets/NotificationUI")
```

<a name="module_widgets/NotificationUI"></a>

## widgets/NotificationUI
The global NotificationUI can be used to create popup notifications over dom elements or generics app notifications.

**Example**  
```js
**Example**  
```js

* [widgets/NotificationUI](#module_widgets/NotificationUI)
    * [.API](#module_widgets/NotificationUI..API)
    * [.createFromTemplate(template, [elementID], [options])](#module_widgets/NotificationUI..createFromTemplate) ⇒ <code>Notification</code>
    * [.createToastFromTemplate(title, template, [options])](#module_widgets/NotificationUI..createToastFromTemplate) ⇒ <code>Notification</code>

<a name="module_widgets/NotificationUI..API"></a>

### widgets/NotificationUI.API
This section outlines the properties and methods available in this module

**Kind**: inner property of [<code>widgets/NotificationUI</code>](#module_widgets/NotificationUI)  
<a name="module_widgets/NotificationUI..createFromTemplate"></a>

### widgets/NotificationUI.createFromTemplate(template, [elementID], [options]) ⇒ <code>Notification</code>
Creates a new notification popup from given template.

**Kind**: inner method of [<code>widgets/NotificationUI</code>](#module_widgets/NotificationUI)  
**Returns**: <code>Notification</code> - Object with a done handler that resolves when the notification closes.  

| Param | Type | Description |
| --- | --- | --- |
| template | <code>string</code> \| <code>Element</code> | A string template or HTML Element to use as the dialog HTML. |
| [elementID] | <code>String</code> | optional id string if provided will show the notification pointing to the element.   If no element is specified, it will be managed as a generic notification. |
| [options] | <code>Object</code> | optional, supported   * options are:   * `allowedPlacements` - Optional String array with values restricting where the notification will be shown.       Values can be a mix of `['top', 'bottom', 'left', 'right']`   * `autoCloseTimeS` - Time in seconds after which the notification should be auto closed. Default is never.   * `dismissOnClick` - when clicked, the notification is closed. Default is true(dismiss). |

<a name="module_widgets/NotificationUI..createToastFromTemplate"></a>

### widgets/NotificationUI.createToastFromTemplate(title, template, [options]) ⇒ <code>Notification</code>
Creates a new toast notification popup from given title and html message.

**Kind**: inner method of [<code>widgets/NotificationUI</code>](#module_widgets/NotificationUI)  
**Returns**: <code>Notification</code> - Object with a done handler that resolves when the notification closes.  

| Param | Type | Description |
| --- | --- | --- |
| title | <code>string</code> | The title for the notification. |
| template | <code>string</code> \| <code>Element</code> | A string template or HTML Element to use as the dialog HTML. |
| [options] | <code>Object</code> | optional, supported   * options are:   * `autoCloseTimeS` - Time in seconds after which the notification should be auto closed. Default is never.   * `dismissOnClick` - when clicked, the notification is closed. Default is true(dismiss).   * `toastStyle` - To style the toast notification for error, warning, info etc. Can be     one of `NotificationUI.NOTIFICATION_STYLES_CSS_CLASS.*` or your own css class name. |
