### Import :
```js
const EditorManager = brackets.getModule("editor/EditorManager")
```

<a name="getCurrentFullEditor"></a>

## getCurrentFullEditor() ⇒ <code>Editor</code>
Retrieves the visible full-size Editor for the currently opened file in the ACTIVE_PANE

**Kind**: global function  
**Returns**: <code>Editor</code> - editor of the current view or null  
<a name="closeInlineWidget"></a>

## closeInlineWidget(hostEditor, inlineWidget) ⇒ <code>$.Promise</code>
Removes the given widget UI from the given hostEditor (agnostic of what the widget's content
is). The widget's onClosed() callback will be run as a result.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - A promise that's resolved when the widget is fully closed.  

| Param | Type | Description |
| --- | --- | --- |
| hostEditor | <code>Editor</code> | The editor containing the widget. |
| inlineWidget | <code>InlineWidget</code> | The inline widget to close. |

<a name="registerInlineEditProvider"></a>

## registerInlineEditProvider(provider, [priority])
Registers a new inline editor provider. When Quick Edit is invoked each registered provider is
asked if it wants to provide an inline editor given the current editor and cursor location.
An optional priority parameter is used to give providers with higher priority an opportunity
to provide an inline editor before providers with lower priority.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| provider | <code>function</code> |  |
| [priority] | <code>number</code> | The provider returns a promise that will be resolved with an InlineWidget, or returns a string indicating why the provider cannot respond to this case (or returns null to indicate no reason). |

<a name="registerInlineDocsProvider"></a>

## registerInlineDocsProvider(provider, [priority])
Registers a new inline docs provider. When Quick Docs is invoked each registered provider is
asked if it wants to provide inline docs given the current editor and cursor location.
An optional priority parameter is used to give providers with higher priority an opportunity
to provide an inline editor before providers with lower priority.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| provider | <code>function</code> |  |
| [priority] | <code>number</code> | The provider returns a promise that will be resolved with an InlineWidget, or returns a string indicating why the provider cannot respond to this case (or returns null to indicate no reason). |

<a name="getInlineEditors"></a>

## getInlineEditors(hostEditor) ⇒ <code>Array.&lt;Editor&gt;</code>
Given a host editor, return a list of all Editors in all its open inline widgets. (Ignoring
any other inline widgets that might be open but don't contain Editors).

**Kind**: global function  

| Param | Type |
| --- | --- |
| hostEditor | <code>Editor</code> | 

<a name="createInlineEditorForDocument"></a>

## createInlineEditorForDocument(doc, range, inlineContent, closeThisInline) ⇒ <code>Object</code>
Creates a new inline Editor instance for the given Document.
The editor is not yet visible or attached to a host editor.

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
This function should be called to restore editor focus after it has been temporarily
removed. For example, after a dialog with editable text is closed.

**Kind**: global function  
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
This function is similar to getActiveEditor(), with one main difference: this
function will only return editors that currently have focus, whereas
getActiveEditor() will return the last visible editor that was given focus (but
may not currently have focus because, for example, a dialog with editable text
is open).

**Kind**: global function  
<a name="getActiveEditor"></a>

## getActiveEditor() ⇒ <code>Editor</code>
Returns the current active editor (full-sized OR inline editor). This editor may not
have focus at the moment, but it is visible and was the last editor that was given
focus. Returns null if no editors are active.

**Kind**: global function  
**See**: #getFocusedEditor  
<a name="getHoveredEditor"></a>

## getHoveredEditor(mousePos) ⇒ <code>Editor</code>
Returns the editor/inline editor under given mouse cursor coordinates specified. The coordinates can be usually
fetched from the `document.onmousemove` dom event handler or any dom events.
https://stackoverflow.com/questions/7790725/javascript-track-mouse-position

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| mousePos | <code>Object</code> | The mouse position(or the js event with mouse position). |

