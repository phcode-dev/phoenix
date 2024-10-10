### Import :
```js
const XMLUtils = brackets.getModule("language/XMLUtils")
```

<a name="_createTagInfo"></a>

## \_createTagInfo(token, tokenType, offset, exclusionList, tagName, attrName, shouldReplace) ⇒ <code>Object</code>
Returns an object that represents all its params.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| token | <code>Token</code> | CodeMirror token at the current pos |
| tokenType | <code>number</code> | Type of current token |
| offset | <code>number</code> | Offset in current token |
| exclusionList | <code>Array.&lt;string&gt;</code> | List of attributes of a tag or attribute options used by an attribute |
| tagName | <code>string</code> | Name of the current tag |
| attrName | <code>string</code> | Name of the current attribute |
| shouldReplace | <code>boolean</code> | true if we don't want to append ="" to an attribute |

<a name="_getTagAttributes"></a>

## \_getTagAttributes(editor, constPos) ⇒ <code>Object</code>
Return the tagName and a list of attributes used by the tag.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| editor | <code>Editor</code> | An instance of active editor |
| constPos | <code>Object</code> | The position of cursor in the active editor |

<a name="_getTagAttributeValue"></a>

## \_getTagAttributeValue(editor, pos) ⇒ <code>Object</code>
Return the tag name, attribute name and a list of options used by the attribute

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| editor | <code>Editor</code> | An instance of active editor |
| pos | <code>Object</code> | Position of cursor in the editor |

<a name="getTagInfo"></a>

## getTagInfo(editor, pos) ⇒ <code>Object</code>
Return the tag info at a given position in the active editor

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| editor | <code>Editor</code> | Instance of active editor |
| pos | <code>Object</code> | Position of cursor in the editor |

<a name="getValueQuery"></a>

## getValueQuery(tagInfo) ⇒ <code>string</code>
Return the query text of a value.

**Kind**: global function  
**Returns**: <code>string</code> - The query to use to matching hints.  

| Param | Type |
| --- | --- |
| tagInfo | <code>Object</code> | 

