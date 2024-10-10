### Import :
```js
const JSONUtils = brackets.getModule("language/JSONUtils")
```

<a name="stripQuotes"></a>

## stripQuotes(string) ⇒ <code>String</code>
Removes the quotes around a string

**Kind**: global function  

| Param | Type |
| --- | --- |
| string | <code>String</code> | 

<a name="getContextInfo"></a>

## getContextInfo(editor, constPos, requireParent, requireNextToken) ⇒ <code>Object</code>
Returns context info at a given position in editor

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| editor | <code>Editor</code> |  |
| constPos | <code>Object</code> | Position of cursor in the editor |
| requireParent | <code>Boolean</code> | If true will look for parent key name |
| requireNextToken | <code>Boolean</code> | if true we can replace the next token of a value. |

