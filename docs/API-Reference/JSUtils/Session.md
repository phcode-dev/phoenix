### Import :
```js
const Session = brackets.getModule("JSUtils/Session")
```

<a name="Session"></a>

## Session
**Kind**: global class  

* [Session](#Session)
    * [new Session(editor)](#new_Session_new)
    * [.getPath()](#Session+getPath) ⇒ <code>String</code>
    * [.getCursor()](#Session+getCursor) ⇒ <code>Object</code>
    * [.getLine(line)](#Session+getLine) ⇒ <code>String</code>
    * [.getOffset()](#Session+getOffset) ⇒ <code>number</code>
    * [.getOffsetFromCursor(the)](#Session+getOffsetFromCursor) ⇒ <code>number</code>
    * [.getToken(cursor)](#Session+getToken) ⇒ <code>Object</code>
    * [.getNextTokenOnLine(cursor)](#Session+getNextTokenOnLine) ⇒ <code>Object</code>
    * [.getNextCursorOnLine()](#Session+getNextCursorOnLine) ⇒ <code>Object</code>
    * [._getPreviousToken(cursor)](#Session+_getPreviousToken) ⇒ <code>Object</code>
    * [.getNextToken(cursor, skipWhitespace)](#Session+getNextToken) ⇒ <code>Object</code>
    * [.getQuery()](#Session+getQuery) ⇒ <code>String</code>
    * [.getContext(cursor, [depth])](#Session+getContext) ⇒ <code>String</code>
    * [.findPreviousDot()](#Session+findPreviousDot) ⇒ <code>Object</code>
    * [.getFunctionInfo()](#Session+getFunctionInfo) ⇒ <code>Object</code>
        * [.isOnFunctionIdentifier()](#Session+getFunctionInfo..isOnFunctionIdentifier) ⇒ <code>Object</code>
        * [.isInFunctionalCall(lex)](#Session+getFunctionInfo..isInFunctionalCall) ⇒ <code>Object</code> \| <code>Boolean</code>
    * [.getType()](#Session+getType) ⇒ <code>Object</code>
    * [.getHints(query, matcher)](#Session+getHints) ⇒ <code>Object</code>
        * [.isBuiltin(origin)](#Session+getHints..isBuiltin)
        * [.filterWithQueryAndMatcher(hints, matcher)](#Session+getHints..filterWithQueryAndMatcher) ⇒ <code>Array</code>
    * [.setFnType(newFnType)](#Session+setFnType)
    * [.setFunctionCallPos(functionCallPos)](#Session+setFunctionCallPos)
    * [.getParameterHint()](#Session+getParameterHint) ⇒ <code>Object</code>
    * [.getJavascriptText()](#Session+getJavascriptText) ⇒ <code>String</code>
    * [.isFunctionName()](#Session+isFunctionName) ⇒ <code>Boolean</code>

<a name="new_Session_new"></a>

### new Session(editor)
Session objects encapsulate state associated with a hinting session


| Param | Type | Description |
| --- | --- | --- |
| editor | <code>Editor</code> | the editor context for the session |

<a name="Session+getPath"></a>

### session.getPath() ⇒ <code>String</code>
Get the name of the file associated with the current session

**Kind**: instance method of [<code>Session</code>](#Session)  
**Returns**: <code>String</code> - - the full pathname of the file associated with the
<a name="Session+getCursor"></a>

### session.getCursor() ⇒ <code>Object</code>
Get the current cursor position.

**Kind**: instance method of [<code>Session</code>](#Session)  
**Returns**: <code>Object</code> - - the current cursor position  
<a name="Session+getLine"></a>

### session.getLine(line) ⇒ <code>String</code>
Get the text of a line.

**Kind**: instance method of [<code>Session</code>](#Session)  
**Returns**: <code>String</code> - - the text of the line  

| Param | Type | Description |
| --- | --- | --- |
| line | <code>number</code> | the line number |

<a name="Session+getOffset"></a>

### session.getOffset() ⇒ <code>number</code>
Get the offset of the current cursor position

**Kind**: instance method of [<code>Session</code>](#Session)  
**Returns**: <code>number</code> - - the offset into the current document of the current
<a name="Session+getOffsetFromCursor"></a>

### session.getOffsetFromCursor(the) ⇒ <code>number</code>
Get the offset of a cursor position

**Kind**: instance method of [<code>Session</code>](#Session)  
**Returns**: <code>number</code> - - the offset into the current document of the cursor  

| Param | Type | Description |
| --- | --- | --- |
| the | <code>Object</code> | line/col info |

<a name="Session+getToken"></a>

### session.getToken(cursor) ⇒ <code>Object</code>
Get the token at the given cursor position, or at the current cursor

**Kind**: instance method of [<code>Session</code>](#Session)  
**Returns**: <code>Object</code> - - the CodeMirror token at the given cursor position  

| Param | Type | Description |
| --- | --- | --- |
| cursor | <code>Object</code> | the cursor position      at which to retrieve a token |

<a name="Session+getNextTokenOnLine"></a>

### session.getNextTokenOnLine(cursor) ⇒ <code>Object</code>
Get the token after the one at the given cursor position

**Kind**: instance method of [<code>Session</code>](#Session)  
**Returns**: <code>Object</code> - - the CodeMirror token after the one at the given

| Param | Type | Description |
| --- | --- | --- |
| cursor | <code>Object</code> | cursor position before      which a token should be retrieved |

<a name="Session+getNextCursorOnLine"></a>

### session.getNextCursorOnLine() ⇒ <code>Object</code>
Get the next cursor position on the line, or null if there isn't one.

**Kind**: instance method of [<code>Session</code>](#Session)  
**Returns**: <code>Object</code> - - the cursor position
<a name="Session+_getPreviousToken"></a>

### session.\_getPreviousToken(cursor) ⇒ <code>Object</code>
Get the token before the one at the given cursor position

**Kind**: instance method of [<code>Session</code>](#Session)  
**Returns**: <code>Object</code> - - the CodeMirror token before the one at the given

| Param | Type | Description |
| --- | --- | --- |
| cursor | <code>Object</code> | cursor position after      which a token should be retrieved |

<a name="Session+getNextToken"></a>

### session.getNextToken(cursor, skipWhitespace) ⇒ <code>Object</code>
Get the token after the one at the given cursor position

**Kind**: instance method of [<code>Session</code>](#Session)  
**Returns**: <code>Object</code> - - the CodeMirror token after the one at the given

| Param | Type | Description |
| --- | --- | --- |
| cursor | <code>Object</code> | cursor position after      which a token should be retrieved |
| skipWhitespace | <code>Boolean</code> | true if this should skip over whitespace tokens |

<a name="Session+getQuery"></a>

### session.getQuery() ⇒ <code>String</code>
Calculate a query String relative to the current cursor position

**Kind**: instance method of [<code>Session</code>](#Session)  
**Returns**: <code>String</code> - - the query String for the current cursor position  
<a name="Session+getContext"></a>

### session.getContext(cursor, [depth]) ⇒ <code>String</code>
Find the context of a property lookup. For example, for a lookup

**Kind**: instance method of [<code>Session</code>](#Session)  
**Returns**: <code>String</code> - - the context for the property that was looked up  

| Param | Type | Description |
| --- | --- | --- |
| cursor | <code>Object</code> | the cursor position      at which context information is to be retrieved |
| [depth] | <code>number</code> | the current depth of the parenthesis stack, or      undefined if the depth is 0. |

<a name="Session+findPreviousDot"></a>

### session.findPreviousDot() ⇒ <code>Object</code>
**Kind**: instance method of [<code>Session</code>](#Session)  
**Returns**: <code>Object</code> - - the line, col info for where the previous "."
<a name="Session+getFunctionInfo"></a>

### session.getFunctionInfo() ⇒ <code>Object</code>
Determine if the caret is either within a function call or on the function call itself.

**Kind**: instance method of [<code>Session</code>](#Session)  
**Returns**: <code>Object</code> - inFunctionCall - true if the caret if either within a function call or on the

* [.getFunctionInfo()](#Session+getFunctionInfo) ⇒ <code>Object</code>
    * [.isOnFunctionIdentifier()](#Session+getFunctionInfo..isOnFunctionIdentifier) ⇒ <code>Object</code>
    * [.isInFunctionalCall(lex)](#Session+getFunctionInfo..isInFunctionalCall) ⇒ <code>Object</code> \| <code>Boolean</code>

<a name="Session+getFunctionInfo..isOnFunctionIdentifier"></a>

#### getFunctionInfo.isOnFunctionIdentifier() ⇒ <code>Object</code>
Test if the cursor is on a function identifier

**Kind**: inner method of [<code>getFunctionInfo</code>](#Session+getFunctionInfo)  
**Returns**: <code>Object</code> - - lexical state if on a function identifier, null otherwise.  
<a name="Session+getFunctionInfo..isInFunctionalCall"></a>

#### getFunctionInfo.isInFunctionalCall(lex) ⇒ <code>Object</code> \| <code>Boolean</code>
Test is a lexical state is in a function call.

**Kind**: inner method of [<code>getFunctionInfo</code>](#Session+getFunctionInfo)  

| Param | Type | Description |
| --- | --- | --- |
| lex | <code>Object</code> | lexical state. |

<a name="Session+getType"></a>

### session.getType() ⇒ <code>Object</code>
Get the type of the current session, i.e., whether it is a property

**Kind**: instance method of [<code>Session</code>](#Session)  
**Returns**: <code>Object</code> - - an Object consisting
<a name="Session+getHints"></a>

### session.getHints(query, matcher) ⇒ <code>Object</code>
Retrieves a list of hints for the current session based on the current scope

**Kind**: instance method of [<code>Session</code>](#Session)  
**Returns**: <code>Object</code> - An object containing:

| Param | Type | Description |
| --- | --- | --- |
| query | <code>String</code> | The query prefix used to filter hints. |
| matcher | <code>StringMatcher</code> | The class used to find query matches and sort the results. |


* [.getHints(query, matcher)](#Session+getHints) ⇒ <code>Object</code>
    * [.isBuiltin(origin)](#Session+getHints..isBuiltin)
    * [.filterWithQueryAndMatcher(hints, matcher)](#Session+getHints..filterWithQueryAndMatcher) ⇒ <code>Array</code>

<a name="Session+getHints..isBuiltin"></a>

#### getHints.isBuiltin(origin)
Is the origin one of the builtin files.

**Kind**: inner method of [<code>getHints</code>](#Session+getHints)  

| Param | Type |
| --- | --- |
| origin | <code>String</code> | 

<a name="Session+getHints..filterWithQueryAndMatcher"></a>

#### getHints.filterWithQueryAndMatcher(hints, matcher) ⇒ <code>Array</code>
Filter an array hints using a given query and matcher.

**Kind**: inner method of [<code>getHints</code>](#Session+getHints)  
**Returns**: <code>Array</code> - - array of matching hints.  

| Param | Type | Description |
| --- | --- | --- |
| hints | <code>Array</code> | array of hints |
| matcher | <code>StringMatcher</code> |  |

<a name="Session+setFnType"></a>

### session.setFnType(newFnType)
Set a new function type hint.

**Kind**: instance method of [<code>Session</code>](#Session)  

| Param | Type | Description |
| --- | --- | --- |
| newFnType | <code>Object</code> | Array of function hints |

<a name="Session+setFunctionCallPos"></a>

### session.setFunctionCallPos(functionCallPos)
The position of the function call for the current fnType.

**Kind**: instance method of [<code>Session</code>](#Session)  

| Param | Type | Description |
| --- | --- | --- |
| functionCallPos | <code>Object</code> | the offset of the function call. |

<a name="Session+getParameterHint"></a>

### session.getParameterHint() ⇒ <code>Object</code>
Get the function type hint.  This will format the hint, showing the

**Kind**: instance method of [<code>Session</code>](#Session)  
**Returns**: <code>Object</code> - An Object where the
<a name="Session+getJavascriptText"></a>

### session.getJavascriptText() ⇒ <code>String</code>
Get the javascript text of the file open in the editor for this Session.

**Kind**: instance method of [<code>Session</code>](#Session)  
**Returns**: <code>String</code> - - the "javascript" text that can be sent to Tern.  
<a name="Session+isFunctionName"></a>

### session.isFunctionName() ⇒ <code>Boolean</code>
Determine if the cursor is located in the name of a function declaration.

**Kind**: instance method of [<code>Session</code>](#Session)  
**Returns**: <code>Boolean</code> - - true if the current cursor position is in the name of a function
<a name="getLexicalState"></a>

## getLexicalState(token) ⇒ <code>\*</code>
**Kind**: global function  
**Returns**: <code>\*</code> - - the lexical state of the token  

| Param | Type | Description |
| --- | --- | --- |
| token | <code>Object</code> | a CodeMirror token |
