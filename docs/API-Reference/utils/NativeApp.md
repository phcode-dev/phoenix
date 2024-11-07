### Import :
```js
const NativeApp = brackets.getModule("utils/NativeApp")
```

<a name="Async"></a>

## Async
Virtualized NativeApp apis that works cross-platform, and in the browser.

**Kind**: global variable  
<a name="openLiveBrowser"></a>

## openLiveBrowser(url, [enableRemoteDebugging]) ⇒ <code>$.Promise</code>
openLiveBrowser
Open the given URL in the user's system browser, optionally enabling debugging.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| url | <code>string</code> | The URL to open. |
| [enableRemoteDebugging] | <code>boolean</code> | Whether to turn on remote debugging. Default false. |

<a name="closeLiveBrowser"></a>

## closeLiveBrowser() ⇒ <code>$.Promise</code>
closeLiveBrowser

**Kind**: global function  
<a name="closeAllLiveBrowsers"></a>

## closeAllLiveBrowsers() ⇒ <code>$.Promise</code>
closeAllLiveBrowsers
Closes all the browsers that were tracked on open

TODO: does not seem to work on Windows

**Kind**: global function  
<a name="openURLInDefaultBrowser"></a>

## openURLInDefaultBrowser(url, tabIdentifier)
Opens a URL in the system default browser.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| url | <code>string</code> |  |
| tabIdentifier | <code>string</code> | An optional tab identifier can be set to group the tabs. Maps to target option              in browser. Doesn't do anything in tauri. |

<a name="getApplicationSupportDirectory"></a>

## getApplicationSupportDirectory()
Gets the path to the application's support directory

**Kind**: global function  
