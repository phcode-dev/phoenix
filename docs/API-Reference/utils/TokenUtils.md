### Import :
```js
const TokenUtils = brackets.getModule("utils/TokenUtils")
```

<a name="_"></a>

## \_
Functions for iterating through tokens in the current editor buffer. Useful for doing
light parsing that can rely purely on information gathered by the code coloring mechanism.

**Kind**: global variable  
<a name="getTokenAt"></a>

## getTokenAt(cm, pos, precise) ⇒ <code>Object</code>
Like cm.getTokenAt, but with caching. Way more performant for long lines.

**Kind**: global function  
**Returns**: <code>Object</code> - Token for position  

| Param | Type | Description |
| --- | --- | --- |
| cm | <code>CodeMirror</code> |  |
| pos | <code>Object</code> |  |
| precise | <code>boolean</code> | If given, results in more current results. Suppresses caching. |

<a name="getInitialContext"></a>

## getInitialContext(cm, pos) ⇒ <code>Object</code>
Creates a context object for the given editor and position, suitable for passing to the
move functions.

**Kind**: global function  

| Param | Type |
| --- | --- |
| cm | <code>CodeMirror</code> | 
| pos | <code>Object</code> | 

<a name="movePrevToken"></a>

## movePrevToken(ctx, [precise]) ⇒ <code>boolean</code>
Moves the given context backwards by one token.

**Kind**: global function  
**Returns**: <code>boolean</code> - whether the context changed  

| Param | Type | Description |
| --- | --- | --- |
| ctx | <code>Object</code> |  |
| [precise] | <code>boolean</code> | If code is being edited, use true (default) for accuracy.      If parsing unchanging code, use false to use cache for performance. |

<a name="isAtStart"></a>

## isAtStart(ctx) ⇒ <code>boolean</code>
**Kind**: global function  
**Returns**: <code>boolean</code> - true if movePrevToken() would return false without changing pos  

| Param | Type |
| --- | --- |
| ctx | <code>Object</code> | 

<a name="moveNextToken"></a>

## moveNextToken(ctx, [precise]) ⇒ <code>boolean</code>
Moves the given context forward by one token.

**Kind**: global function  
**Returns**: <code>boolean</code> - whether the context changed  

| Param | Type | Description |
| --- | --- | --- |
| ctx | <code>Object</code> |  |
| [precise] | <code>boolean</code> | If code is being edited, use true (default) for accuracy.      If parsing unchanging code, use false to use cache for performance. |

<a name="isAtEnd"></a>

## isAtEnd(ctx) ⇒ <code>boolean</code>
**Kind**: global function  
**Returns**: <code>boolean</code> - true if moveNextToken() would return false without changing pos  

| Param | Type |
| --- | --- |
| ctx | <code>Object</code> | 

<a name="moveSkippingWhitespace"></a>

## moveSkippingWhitespace(moveFxn, ctx) ⇒ <code>boolean</code>
Moves the given context in the given direction, skipping any whitespace it hits.

**Kind**: global function  
**Returns**: <code>boolean</code> - whether the context changed  

| Param | Type | Description |
| --- | --- | --- |
| moveFxn | <code>function</code> | the function to move the context |
| ctx | <code>Object</code> |  |

<a name="offsetInToken"></a>

## offsetInToken(context) ⇒ <code>number</code>
In the given context, get the character offset of pos from the start of the token.

**Kind**: global function  

| Param | Type |
| --- | --- |
| context | <code>Object</code> | 

<a name="getModeAt"></a>

## getModeAt(cm, pos, precise) ⇒ <code>Object</code>
Returns the mode object and mode name string at a given position

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| cm | <code>CodeMirror</code> | CodeMirror instance |
| pos | <code>Object</code> | Position to query for mode |
| precise | <code>boolean</code> | If given, results in more current results. Suppresses caching. |

