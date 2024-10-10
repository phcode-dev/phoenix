### Import :
```js
const EditorManager = brackets.getModule("editor/EditorManager")
```

<a name="getCurrentFullEditor"></a>

## getCurrentFullEditor() ⇒ <code>Editor</code>
Retrieves the visible full-size Editor for the currently opened file in the ACTIVE_PANE

**Kind**: global function  
**Returns**: <code>Editor</code> - editor of the current view or null  
<a name="_toggleInlineWidget"></a>

## \_toggleInlineWidget(array, [errorMsg]) ⇒ <code>Promise</code>
Closes any focused inline widget. Else, asynchronously asks providers to create one.

**Kind**: global function  
**Returns**: <code>Promise</code> - A promise resolved with true if an inline widget is opened or false

| Param | Type | Description |
| --- | --- | --- |
| array | <code>Object</code> | providers   prioritized list of providers |
| [errorMsg] | <code>string</code> | Default message to display if no providers return non-null |

<a name="_createUnattachedMasterEditor"></a>

## \_createUnattachedMasterEditor(doc)
Creates a hidden, unattached master editor that is needed when a document is created for the

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| doc | <code>Document</code> | document to create a hidden editor for |

<a name="closeInlineWidget"></a>

## closeInlineWidget(hostEditor, inlineWidget) ⇒ <code>$.Promise</code>
Removes the given widget UI from the given hostEditor (agnostic of what the widget's content

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise that's resolved when the widget is fully closed.  

| Param | Type | Description |
| --- | --- | --- |
| hostEditor | <code>Editor</code> | The editor containing the widget. |
| inlineWidget | <code>InlineWidget</code> | The inline widget to close. |

<a name="registerInlineEditProvider"></a>

## registerInlineEditProvider(provider, [priority])
Registers a new inline editor provider. When Quick Edit is invoked each registered provider is

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| provider | <code>function</code> |  |
| [priority] | <code>number</code> | The provider returns a promise that will be resolved with an InlineWidget, or returns a string indicating why the provider cannot respond to this case (or returns null to indicate no reason). |

<a name="registerInlineDocsProvider"></a>

## registerInlineDocsProvider(provider, [priority])
Registers a new inline docs provider. When Quick Docs is invoked each registered provider is

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| provider | <code>function</code> |  |
| [priority] | <code>number</code> | The provider returns a promise that will be resolved with an InlineWidget, or returns a string indicating why the provider cannot respond to this case (or returns null to indicate no reason). |

<a name="createInlineEditorForDocument"></a>

## createInlineEditorForDocument(doc, range, inlineContent, closeThisInline) ⇒ <code>Object</code>
Creates a new inline Editor instance for the given Document.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| doc | <code>Document</code> | Document for the Editor's content |
| range | <code>Object</code> | If specified, all lines outside the given      range are hidden from the editor. Range is inclusive. Line numbers start at 0. |
| inlineContent | <code>HTMLDivContainer</code> |  |
| closeThisInline | <code>function</code> |  |

<a name="focusEditor"></a>

## focusEditor()
Returns focus to the last visible editor that had focus. If no editor visible, does nothing.

**Kind**: global function  
<a name="resizeEditor"></a>

## ..resizeEditor()..
***Deprecated***

**Kind**: global function  
<a name="getCurrentlyViewedPath"></a>

## ..getCurrentlyViewedPath() ⇒ <code>string</code>..
***Deprecated***

**Kind**: global function  
**Returns**: <code>string</code> - path of the file currently viewed in the active, full sized editor or null when there is no active editor  
<a name="setEditorHolder"></a>

## ..setEditorHolder()..
***Deprecated***

**Kind**: global function  
<a name="registerCustomViewer"></a>

## ..registerCustomViewer()..
***Deprecated***

**Kind**: global function  
**See**: MainViewFactory::#registerViewFactory  
<a name="canOpenPath"></a>

## canOpenPath(fullPath) ⇒ <code>boolean</code>
Determines if the file can be opened in an editor

**Kind**: global function  
**Returns**: <code>boolean</code> - true if the file can be opened in an editor, false if not  

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> | file to be opened |

<a name="openDocument"></a>

## openDocument(doc, pane, editorOptions) ⇒ <code>boolean</code>
Opens the specified document in the given pane

**Kind**: global function  
**Returns**: <code>boolean</code> - true if the file can be opened, false if not  

| Param | Type | Description |
| --- | --- | --- |
| doc | <code>Document</code> | the document to open |
| pane | <code>Pane</code> | the pane to open the document in |
| editorOptions | <code>Object</code> | If specified, contains editor options that can be passed to CodeMirror |

<a name="getFocusedInlineWidget"></a>

## getFocusedInlineWidget() ⇒ <code>InlineWidget</code>
Returns the currently focused inline widget, if any.

**Kind**: global function  
<a name="getFocusedInlineEditor"></a>

## getFocusedInlineEditor() ⇒ <code>Editor</code>
Returns the focused Editor within an inline text editor, or null if something else has focus

**Kind**: global function  
<a name="getFocusedEditor"></a>

## getFocusedEditor() ⇒ <code>Editor</code>
Returns the currently focused editor instance (full-sized OR inline editor).

**Kind**: global function  
<a name="getActiveEditor"></a>

## getActiveEditor() ⇒ <code>Editor</code>
Returns the current active editor (full-sized OR inline editor). This editor may not

**Kind**: global function  
**See**: #getFocusedEditor  
<a name="getHoveredEditor"></a>

## getHoveredEditor(mousePos) ⇒ <code>Editor</code>
Returns the editor/inline editor under given mouse cursor coordinates specified. The coordinates can be usually

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| mousePos | <code>Object</code> | The mouse position(or the js event with mouse position). |

<a name="_handleRemoveFromPaneView"></a>

## \_handleRemoveFromPaneView(e, removedFiles)
file removed from pane handler.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| e | <code>jQuery.Event</code> |  |
| removedFiles | <code>File</code> \| <code>Array.&lt;File&gt;</code> | file, path or array of files or paths that are being removed |
