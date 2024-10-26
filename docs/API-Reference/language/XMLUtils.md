### Import :
```js
const XMLUtils = brackets.getModule("language/XMLUtils")
```

<a name="regexWhitespace"></a>

## regexWhitespace : <code>RegExp</code>
Regex to find whitespace

**Kind**: global variable  
<a name="TOKEN_TAG"></a>

## TOKEN\_TAG : <code>number</code>
Enum token tag

**Kind**: global constant  
<a name="TOKEN_ATTR"></a>

## TOKEN\_ATTR : <code>number</code>
Enum token attribute

**Kind**: global constant  
<a name="TOKEN_VALUE"></a>

## TOKEN\_VALUE : <code>number</code>
Enum token value

**Kind**: global constant  
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

