### Import :
```js
const MainViewFactory = brackets.getModule("view/MainViewFactory")
```

<a name="module_view/MainViewFactory"></a>

## view/MainViewFactory
MainViewFactory is a singleton for managing view factories.

Registering a view factory:
```js
     registerViewFactory({
          canOpenFile: function (fullPath) {
              return (fullPath.slice(-4) === ".ico");
          },
          openFile: function(file, pane) {
              return createIconView(file, pane);
          }
     });
```
 The openFile method is used to open the file and construct
 a view of it.  Implementation should add the view to the pane
```js
     function createIconView(file, pane) {
         // IconView will construct its DOM and append
         //  it to pane.$el
         var view = new IconView(file, pane.$el);
         // Then tell the pane to add it to
         //  its view map and show it
         pane.addView(view, true);
         return new $.Deferred().resolve().promise();
     }
```
 Factories should only create 1 view of a file per pane.  Brackets currently only supports 1 view of
 a file open at a given time but that may change to allow the same file open in more than 1 pane. Therefore
 Factories can do a simple check to see if a view already exists and show it before creating a new one:
```js
     var view = pane.getViewForPath(file.fullPath);
     if (view) {
         pane.showView(view);
     } else {
         return createIconView(file, pane);
     }
```


* [view/MainViewFactory](#module_view/MainViewFactory)
    * [.registerViewFactory(factory)](#module_view/MainViewFactory..registerViewFactory)
    * [.findSuitableFactoryForPath(fullPath)](#module_view/MainViewFactory..findSuitableFactoryForPath) ⇒ <code>Factory</code>
    * [.Factory](#module_view/MainViewFactory..Factory) : <code>Object</code>

<a name="module_view/MainViewFactory..registerViewFactory"></a>

### view/MainViewFactory.registerViewFactory(factory)
Registers a view factory

**Kind**: inner method of [<code>view/MainViewFactory</code>](#module_view/MainViewFactory)  

| Param | Type | Description |
| --- | --- | --- |
| factory | <code>Factory</code> | The view factory to register. |

<a name="module_view/MainViewFactory..findSuitableFactoryForPath"></a>

### view/MainViewFactory.findSuitableFactoryForPath(fullPath) ⇒ <code>Factory</code>
Finds a factory that can open the specified file

**Kind**: inner method of [<code>view/MainViewFactory</code>](#module_view/MainViewFactory)  
**Returns**: <code>Factory</code> - A factory that can create a view for the path or undefined if there isn't one.  

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> | The file to open. |

<a name="module_view/MainViewFactory..Factory"></a>

### view/MainViewFactory.Factory : <code>Object</code>
**Kind**: inner typedef of [<code>view/MainViewFactory</code>](#module_view/MainViewFactory)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| canOpenFile | <code>function</code> | Checks if the factory can open the file by its path. |
| openFile | <code>function</code> | Function to open the file and return a promise. |

