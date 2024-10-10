### Import :
```js
const HTMLUtils = brackets.getModule("language/HTMLUtils")
```

<a name="getTagAttributes"></a>

## getTagAttributes(editor, pos) ⇒ <code>Array.&lt;string&gt;</code>
Compiles a list of used attributes for a given tag.

**Kind**: global function  
**Returns**: <code>Array.&lt;string&gt;</code> - - A list of the used attributes within the current tag.  

| Param | Type | Description |
| --- | --- | --- |
| editor | <code>CodeMirror</code> | An instance of a CodeMirror editor. |
| pos | <code>Object</code> | The position in the CodeMirror editor,      specified by character and line numbers. |

<a name="createTagInfo"></a>

## createTagInfo([tokenType], [offset], [tagName], [attrName], [attrValue]) ⇒ <code>Object</code>
Creates a tagInfo object and assures all the values are entered or are empty strings

**Kind**: global function  
**Returns**: <code>Object</code> - A tagInfo object with some context about the current tag hint.  

| Param | Type | Description |
| --- | --- | --- |
| [tokenType] | <code>string</code> | what is getting edited and should be hinted |
| [offset] | <code>number</code> | where the cursor is for the part getting hinted |
| [tagName] | <code>string</code> | The name of the tag |
| [attrName] | <code>string</code> | The name of the attribute |
| [attrValue] | <code>string</code> | The value of the attribute |

<a name="getTagInfo"></a>

## getTagInfo(editor, constPos, let) ⇒ <code>Object</code>
Figure out if we're in a tag, and if we are return info about itAn example token stream for this tag is ```js<span id="open-files-disclosure-arrow"></span> :     className:tag       string:"<span"     className:          string:" "     className:attribute string:"id"     className:          string:"="     className:string    string:""open-files-disclosure-arrow""     className:tag       string:"></span>"```

**Kind**: global function  
**Returns**: <code>Object</code> - A tagInfo object with some context about the current tag hint.  

| Param | Type | Description |
| --- | --- | --- |
| editor | <code>Editor</code> | An instance of a Brackets editor |
| constPos | <code>Object</code> | A CM pos (likely from editor.getCursorPos()) |
| let | <code>isHtmlMode:boolean</code> | the module know we are in html mode |

<a name="findBlocks"></a>

## findBlocks(editor, modeName) ⇒ <code>Object</code>
Returns an Array of info about all blocks whose token mode name matches that passed in,in the given Editor's HTML document (assumes the Editor contains HTML text).

**Kind**: global function  
**Returns**: <code>Object</code> - Array  

| Param | Type | Description |
| --- | --- | --- |
| editor | <code>Editor</code> | the editor containing the HTML text |
| modeName | <code>string</code> | the mode name of the tokens to look for |

<a name="findStyleBlocks"></a>

## findStyleBlocks(editor) ⇒ <code>Object</code>
Returns an Array of info about all 'style' blocks in the given Editor's HTML document (assumesthe Editor contains HTML text).

**Kind**: global function  
**Returns**: <code>Object</code> - Array  

| Param | Type |
| --- | --- |
| editor | <code>Editor</code> | 

