### Import :
```js
brackets.getModule("features/SelectionViewManager")
```

<a name="module_features/SelectionViewManager"></a>

## features/SelectionViewManager
SelectionViewManager provides support to add interactive preview popups on selection over the main editors.
This can be used to provide interactive editor controls on a selected element.

Extensions can register to provide previews with `SelectionViewManager.registerSelectionViewProvider` API.
<img src = "https://user-images.githubusercontent.com/5336369/186434397-3db55789-6077-4d02-b4e2-78ef3f663399.png" alt="Phoenix code selection view" />
<img src = "https://user-images.githubusercontent.com/5336369/186434671-c1b263e5-19a9-4a9d-8f90-507df5f881b5.gif" />

### See Related: QuickViewManager
[features/QuickViewManager](https://github.com/phcode-dev/phoenix/wiki/QuickViewManager-API) is similar to
SelectionViewManager API.
* SelectionViews popup only once user selects a text by mouse or hover over a region with text selection.
* Quickviews popup on mouse hover.
<img src = "https://docs-images.phcode.dev/phcode-sdk/quick-view-youtube.png" alt="Phoenix code selection view Youtube image" />

## Usage
Lets build a "hello world" extension that displays "hello world" above selected text in the editor.
In your extension file, add the following code:

**Example**  
```js
const SelectionViewManager = brackets.getModule("features/SelectionViewManager");
// replace `all` with language ID(Eg. javascript) if you want to restrict the preview to js files only.
SelectionViewManager.registerSelectionViewProvider(exports, ["all"]);

// provide a helpful name for the SelectionView. This will be useful if you have to debug the selection view
exports.SELECTION_VIEW_NAME = "extension.someName";
// now implement the getSelectionView function that will be invoked when ever user selection changes in the editor.
exports.getSelectionView = function(editor, selections) {
        return new Promise((resolve, reject)=>{
            resolve({
                content: "<div>hello world</div>"
            });
        });
    };
```

### How it works
When SelectionViewManager determines that the user intents to see SelectionViewr, `getSelectionView` function on all
registered SelectionView providers are invoked to get the Selection View popup. `getSelectionView` should return
a promise that resolves to the popup contents if the provider has a Selection View. Else just reject the promise.
If multiple providers returns SelectionView, all of them are displayed one by one.
See detailed API docs for implementation details below:

## API
### registerSelectionViewProvider
Register a SelectionView provider with this api.
**Example**  
```js
// syntax
SelectionViewManager.registerSelectionViewProvider(provider, supportedLanguages);
```
The API requires two parameters:
1. `provider`: must implement a  `getSelectionView` function which will be invoked to get the preview. See API doc below.
1. `supportedLanguages`: An array of languages that the SelectionView supports. If `["all"]` is supplied, then the
   SelectionView will be invoked for all languages. Restrict to specific languages: Eg: `["javascript", "html", "php"]`
**Example**  
```js
// to register a provider that will be invoked for all languages. where provider is any object that implements
// a getSelectionView function
SelectionViewManager.registerSelectionViewProvider(provider, ["all"]);

// to register a provider that will be invoked for specific languages
SelectionViewManager.registerSelectionViewProvider(provider, ["javascript", "html", "php"]);
```

### removeSelectionViewProvider
Removes a registered SelectionView provider. The API takes the same arguments as `registerSelectionViewProvider`.
**Example**  
```js
// syntax
SelectionViewManager.removeSelectionViewProvider(provider, supportedLanguages);
// Example
SelectionViewManager.removeSelectionViewProvider(provider, ["javascript", "html"]);
```

### getSelectionView
Each provider must implement the `getSelectionView` function that returns a promise. The promise either resolves with
the Selection View details object(described below) or rejects if there is no preview for the position.
**Example**  
```js
// function signature
provider.getSelectionView = function(editor, selections) {
        return new Promise((resolve, reject)=>{
            resolve({
                content: "<div>hello world</div>"
            });
        });
    };
```

#### parameters
The function will be called with the following arguments:
1. `editor` - The editor over which the user hovers the mouse cursor.
1. `selections` - An array containing the active selections when the selection view was trigerred.

#### return types
The promise returned should resolve to an object with the following contents:
1. `content`: Either `HTML` as text, a `DOM Node` or a `Jquery Element`.

#### Modifying the SelectionView content after resolving `getSelectionView` promise
Some advanced/interactive extensions may need to do dom operations on the SelectionView content.
In such cases, it is advised to return a domNode/Jquery element as content in `getSelectionView`. Event Handlers
or further dom manipulations can be done on the returned content element.
The SelectionView may be dismissed at any time, so be sure to check if the DOM Node is visible in the editor before
performing any operations.

#### Considerations
1. SelectionView won't be displayed till all provider promises are settled. To improve performance, if your SelectionView
   handler takes time to resolve the SelectionView, resolve a dummy quick once you are sure that a SelectionView needs
   to be shown to the user. The div contents can be later updated as and when more details are available.
1. Note that the SelectionView could be hidden/removed any time by the SelectionViewManager.
1. If multiple providers returns a valid popup, all of them are displayed.
<a name="module_features/SelectionViewManager..isSelectionViewShown"></a>

### features/SelectionViewManager.isSelectionViewShown() ⇒ <code>boolean</code>
If quickview is displayed and visible on screen

**Kind**: inner method of [<code>features/SelectionViewManager</code>](#module_features/SelectionViewManager)  
