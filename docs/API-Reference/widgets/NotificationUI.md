### Import :
```js
brackets.getModule("widgets/NotificationUI")
```

<a name="module_widgets/NotificationUI"></a>

## widgets/NotificationUI
The global NotificationUI can be used to create popup notifications over dom elements or generics app notifications.

A global `window.EventManager` object is made available in phoenix that can be called anytime after AppStart.
This global can be triggered from anywhere without using require context.

## Usage
### Simple example
For Eg. Let's say we have to create a popup notification over the HTML element with ID `showInfileTree`.
We can do this with the following

**Example**  
```js
const NotificationUI = brackets.getModule("widgets/NotificationUI");
// or use window.NotificationUI global object has the same effect.
let notification = NotificationUI.createFromTemplate("Click me to locate the file in file tree", "showInfileTree",{});
notification.done(()=>{
    console.log("notification is closed in ui.");
})
```
### Advanced example
Another advanced example where you can specify html and interactive components in the notification
**Example**  
```js
// note that you can even provide an HTML Element node with
// custom event handlers directly here instead of HTML text.
let notification1 = NotificationUI.createFromTemplate(
  "<div>Click me to locate the file in file tree</div>", "showInfileTree",{
      allowedPlacements: ['top', 'bottom'],
      dismissOnClick: false,
      autoCloseTimeS: 300 // auto close the popup after 5 minutes
  });
// do stuff
notification1.done((closeReason)=>{
    console.log("notification is closed in ui reason:", closeReason);
})
```
The `createFromTemplate` API can be configured with numerous options. See API options below.

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
The template can either be a string or a jQuery object representing a DOM node that is *not* in the current DOM.

Creating a notification popup
// note that you can even provide an HTML Element node with
// custom event handlers directly here instead of HTML text.
let notification1 = NotificationUI.createFromTemplate(
```js
  "<div>Click me to locate the file in file tree</div>", "showInfileTree",{
      allowedPlacements: ['top', 'bottom'],
      dismissOnClick: false,
      autoCloseTimeS: 300 // auto close the popup after 5 minutes
  });
```

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
The message can either be a string or a jQuery object representing a DOM node that is *not* in the current DOM.

Creating a toast notification popup
// note that you can even provide an HTML Element node with
// custom event handlers directly here instead of HTML text.
let notification1 = NotificationUI.createToastFromTemplate( "Title here",
```js
  "<div>Click me to locate the file in file tree</div>", {
      dismissOnClick: false,
      autoCloseTimeS: 300 // auto close the popup after 5 minutes
  });
```

**Kind**: inner method of [<code>widgets/NotificationUI</code>](#module_widgets/NotificationUI)  
**Returns**: <code>Notification</code> - Object with a done handler that resolves when the notification closes.  

| Param | Type | Description |
| --- | --- | --- |
| title | <code>string</code> | The title for the notification. |
| template | <code>string</code> \| <code>Element</code> | A string template or HTML Element to use as the dialog HTML. |
| [options] | <code>Object</code> | optional, supported   * options are:   * `autoCloseTimeS` - Time in seconds after which the notification should be auto closed. Default is never.   * `dismissOnClick` - when clicked, the notification is closed. Default is true(dismiss).   * `toastStyle` - To style the toast notification for error, warning, info etc. Can be     one of `NotificationUI.NOTIFICATION_STYLES_CSS_CLASS.*` or your own css class name. |

