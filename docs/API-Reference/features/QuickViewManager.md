### Import :
```js
brackets.getModule("features/QuickViewManager")
```

<a name="module_features/QuickViewManager"></a>

## features/QuickViewManager
QuickViewManager provides support to add interactive preview popups on hover over the main editors.
Extensions can register to provide previews with `QuickViewManager.registerQuickViewProvider` API.
<img src = "https://docs-images.phcode.dev/phcode-sdk/quick-view-image.png" alt="Phoenix code quick view" />
<img src = "https://docs-images.phcode.dev/phcode-sdk/quick-view-youtube.png" alt="Phoenix code quick view Youtube" />

### See Related: SelectionViewManager
[features/SelectionViewManager](https://github.com/phcode-dev/phoenix/wiki/SelectionViewManager-API) is similar to
QuickViewManager API.
* SelectionViews popup only once user selects a text by mouse or hover over a region with text selection.
* Quickviews popup on mouse hover.
<img src = "https://user-images.githubusercontent.com/5336369/186434397-3db55789-6077-4d02-b4e2-78ef3f663399.png" alt="quick view pops on mouse hover" />


## Usage
Lets build a "hello world" extension that displays "hello world" on hover over a text in the editor.
In your extension file, add the following code:

**Example**  
```js
const QuickViewManager = brackets.getModule("features/QuickViewManager");
// replace `all` with language ID(Eg. javascript) if you want to restrict the preview to js files only.
QuickViewManager.registerQuickViewProvider(exports, ["all"]);

// provide a helpful name for the QuickView. This will be useful if you implement `filterQuickView` function or
// have to debug the quick view.
exports.QUICK_VIEW_NAME = "extension.someName";
// now implement the getQuickView function that will be invoked when ever user hovers over a text in the editor.
exports.getQuickView = function(editor, pos, token, line) {
        return new Promise((resolve, reject)=>{
            resolve({
                start: {line: pos.line, ch:token.start},
                end: {line: pos.line, ch:token.end},
                content: "<div>hello world</div>"
            });
        });
    };
// optional filter quick view function to handle multiple quick views
exports.filterQuickView = function(popovers){
    // popovers will be an array of all popovers rendered by providers
    return popovers; // dont filter show everything in this case
}
```

### How it works
When QuickViewManager determines that the user intents to see QuickView on hover, `getQuickView` function on all
registered QuickView providers are invoked to get the quick view popup. `getQuickView` should return a promise
that resolves to the popup contents if the provider has a quick view. Else just reject the promise. If multiple
providers returns QuickView, all of them are displayed stacked one by one. You can alter this behavior by
providing a `filterQuickView` function in the provider where you can modify what previews will be shown.
See detailed API docs for implementation details below:

## API
### registerQuickViewProvider
Register a QuickView provider with this api.
**Example**  
```js
// syntax
QuickViewManager.registerQuickViewProvider(provider, supportedLanguages);
```
The API requires two parameters:
1. `provider`: must implement a  `getQuickView` function which will be invoked to get the preview. See API doc below.
1. `supportedLanguages`: An array of languages that the QuickView supports. If `["all"]` is supplied, then the
   QuickView will be invoked for all languages. Restrict to specific languages: Eg: `["javascript", "html", "php"]`
**Example**  
```js
// to register a provider that will be invoked for all languages. where provider is any object that implements
// a getQuickView function
QuickViewManager.registerQuickViewProvider(provider, ["all"]);

// to register a provider that will be invoked for specific languages
QuickViewManager.registerQuickViewProvider(provider, ["javascript", "html", "php"]);
```

### removeQuickViewProvider
Removes a registered QuickView provider. The API takes the same arguments as `registerQuickViewProvider`.
**Example**  
```js
// syntax
QuickViewManager.removeQuickViewProvider(provider, supportedLanguages);
// Example
QuickViewManager.removeQuickViewProvider(provider, ["javascript", "html"]);
```

### getQuickView
Each provider must implement the `getQuickView` function that returns a promise. The promise either resolves with
the quick view details object(described below) or rejects if there is no preview for the position.
**Example**  
```js
// function signature
provider.getQuickView = function(editor, pos, token, line) {
        return new Promise((resolve, reject)=>{
            resolve({
                start: {line: pos.line, ch:token.start},
                end: {line: pos.line, ch:token.end},
                content: "<div>hello world</div>",
                editsDoc: false // this is optional if the quick view edits the current doc
            });
        });
    };
```

#### parameters
The function will be called with the following arguments:
1. `editor` - The editor over which the user hovers the mouse cursor.
1. `pos` - the cursor position over which the user hovers.
1. `token` - hovered token details
1. `line` - the full line text as string.

#### return types
The promise returned should resolve to an object with the following contents:
1. `start` : Indicates the start cursor position from which the quick view is valid.
1. `end` : Indicates the end cursor position to which the quick view is valid. These are generally used to highlight
   the hovered section of the text in the editor.
1. `content`: Either `HTML` as text, a `DOM Node` or a `Jquery Element`.
1. `editsDoc`: Optional, set to true if the quick view can edit the active document.

#### Modifying the QuickView content after resolving `getQuickView` promise
Some advanced/interactive extensions may need to do dom operations on the quick view content.
In such cases, it is advised to return a domNode/Jquery element as content in `getQuickView`. Event Handlers
or further dom manipulations can be done on the returned content element.
The Quick view may be dismissed at any time, so be sure to check if the DOM Node is visible in the editor before
performing any operations.

#### Considerations
1. QuickView won't be displayed till all provider promises are settled. To improve performance, if your QuickView
   handler takes time to resolve the QuickView, resolve a dummy quick once you are sure that a QuickView needs
   to be shown to the user. The div contents can be later updated as and when more details are available.
1. Note that the QuickView could be hidden/removed any time by the QuickViewManager.
1. If multiple providers returns a valid popup, all of them are displayed except if the `filterQuickView` modifies
   the quick view render list. Note that `filterQuickView` is called only for those providers that
   provided a quick view.

### filterQuickView
Each provider can optionally implement the `filterQuickView` function to control what among the available
quick views should be rendered if multiple providers responded with a QuickView. The function will be called
once all `getQuickView` providers provided a valid preview object.
**Example**  
```js
// function signature
provider.filterQuickView = function(popovers) {
         for(let popover of popovers){
            // here if we see that a quick view with name `exclusiveQuickView` is present, then we only show that
            // QuickView. popover.providerInfo object holds details of what provider provided the quick view.
            if(popover.providerInfo.provider.QUICK_VIEW_NAME === "exclusiveQuickView"){
                return [popover]
            }
        }
        // if nothing is returned, then the `popovers` param will be used to show popover
    };
```

#### parameter
The function will be called with the `popovers` parameter which is an array of popover objects that was returned
by `getQuickView` function of all succeeded providers. Details of each provider that created a popover
will be present in `popovers[i].providerInfo` object.

#### return
An array of popovers that needs to be rendered, or nothing(to render the original popover parameter as is).

* [features/QuickViewManager](#module_features/QuickViewManager)
    * [.isQuickViewShown()](#module_features/QuickViewManager..isQuickViewShown) ⇒ <code>boolean</code>
    * [.lockQuickView()](#module_features/QuickViewManager..lockQuickView) : <code>function</code>
    * [.unlockQuickView()](#module_features/QuickViewManager..unlockQuickView) : <code>function</code>

<a name="module_features/QuickViewManager..isQuickViewShown"></a>

### features/QuickViewManager.isQuickViewShown() ⇒ <code>boolean</code>
If quickview is displayed and visible on screen

**Kind**: inner method of [<code>features/QuickViewManager</code>](#module_features/QuickViewManager)  
<a name="module_features/QuickViewManager..lockQuickView"></a>

### features/QuickViewManager.lockQuickView() : <code>function</code>
locks the current QuickView if shown to be permanently displayed on screen till the `unlockQuickView` function
is called or document changes.

**Kind**: inner method of [<code>features/QuickViewManager</code>](#module_features/QuickViewManager)  
<a name="module_features/QuickViewManager..unlockQuickView"></a>

### features/QuickViewManager.unlockQuickView() : <code>function</code>
unlocks the current QuickView locked by `lockQuickView` fucntion.

**Kind**: inner method of [<code>features/QuickViewManager</code>](#module_features/QuickViewManager)  
