### Import :
```js
const AppInit = brackets.getModule("utils/AppInit")
```

<a name="Metrics"></a>

## Metrics
Defines hooks to assist with module initialization.This module defines 3 methods for client modules to attach callbacks:   - htmlReady - When the main application template is rendered   - extensionsLoaded - When the extension manager has loaded all extensions   - appReady - When Brackets completes loading all modules and extensionsThese are *not* jQuery events. Each method is similar to $(document).readyin that it will call the handler immediately if brackets is already doneloading.

**Kind**: global constant  
<a name="appReady"></a>

## appReady(handler)
Adds a callback for the ready hook. Handlers are called afterhtmlReady is done, the initial project is loaded, and all extensions areloaded.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| handler | <code>function</code> | callback function to call when the event is fired |

<a name="htmlReady"></a>

## htmlReady(handler)
Adds a callback for the htmlReady hook. Handlers are called after themain application html template is rendered.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| handler | <code>function</code> | callback function to call when the event is fired |

<a name="extensionsLoaded"></a>

## extensionsLoaded(handler)
Adds a callback for the extensionsLoaded hook. Handlers are called after theextensions have been loaded

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| handler | <code>function</code> | callback function to call when the event is fired |

