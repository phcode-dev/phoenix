### Import :
```js
const FileTreeView = brackets.getModule("project/FileTreeView")
```

<a name="Preact"></a>

## Preact
This is the view layer (template) for the file tree in the sidebar. It takes a FileTreeViewModel
and renders it to the given element using Preact. User actions are signaled via an ActionCreator
(in the Flux sense).

**Kind**: global variable  
<a name="componentDidMount"></a>

## componentDidMount()
When this component is displayed, we scroll it into view and select the portion
of the filename that excludes the extension.

**Kind**: global function  
<a name="getInitialState"></a>

## getInitialState()
Ensures that we always have a state object.

**Kind**: global function  
<a name="componentDidMount"></a>

## componentDidMount()
When this component is displayed, we scroll it into view and select the folder name.

**Kind**: global function  
<a name="shouldComponentUpdate"></a>

## shouldComponentUpdate()
Need to re-render if the sort order or the contents change.

**Kind**: global function  
<a name="componentDidUpdate"></a>

## componentDidUpdate()
When the component has updated in the DOM, reposition it to where the currently
selected node is located now.

**Kind**: global function  
<a name="componentDidUpdate"></a>

## componentDidUpdate()
When the component has updated in the DOM, reposition it to where the currently
selected node is located now.

**Kind**: global function  
<a name="shouldComponentUpdate"></a>

## shouldComponentUpdate()
Update for any change in the tree data or directory sorting preference.

**Kind**: global function  
<a name="handleDragOver"></a>

## handleDragOver()
Allow the Drop

**Kind**: global function  
<a name="render"></a>

## render(element, viewModel, projectRoot, actions, forceRender, platform)
Renders the file tree to the given element.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| element | <code>DOMNode</code> \| <code>jQuery</code> | Element in which to render this file tree |
| viewModel | <code>FileTreeViewModel</code> | the data container |
| projectRoot | <code>Directory</code> | Directory object from which the fullPath of the project root is extracted |
| actions | <code>ActionCreator</code> | object with methods used to communicate events that originate from the user |
| forceRender | <code>boolean</code> | Run render on the entire tree (useful if an extension has new data that it needs rendered) |
| platform | <code>string</code> | mac, win, linux |

<a name="addIconProvider"></a>

## addIconProvider(callback, [priority])
Adds an icon provider. The callback is invoked before each working set item is created, and can
return content to prepend to the item if it supports the icon.

**Kind**: global function  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| callback | <code>function</code> |  | Return a string representing the HTML, a jQuery object or DOM node, or undefined. If undefined, nothing is prepended to the list item and the default or an available icon will be used. |
| [priority] | <code>number</code> | <code>0</code> | optional priority. 0 being lowest. The icons with the highest priority wins if there are multiple callback providers attached. icon providers of the same priority first valid response wins. |

<a name="addClassesProvider"></a>

## addClassesProvider(callback, [priority])
Adds a CSS class provider, invoked before each working set item is created or updated. When called
to update an existing item, all previously applied classes have been cleared.

**Kind**: global function  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| callback | <code>function</code> |  | Return a string containing space-separated CSS class(es) to add, or undefined to leave CSS unchanged. |
| [priority] | <code>number</code> | <code>0</code> | optional priority. 0 being lowest. The class with the highest priority wins if there are multiple callback classes attached. class providers of the same priority will be appended. |

