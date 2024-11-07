### Import :
```js
const ScopeManager = brackets.getModule("JSUtils/ScopeManager")
```

<a name="getBuiltins"></a>

## getBuiltins() ⇒ <code>Array.&lt;string&gt;</code>
An array of library names that contain JavaScript builtins definitions.

**Kind**: global function  
**Returns**: <code>Array.&lt;string&gt;</code> - - array of library  names.  
<a name="postMessage"></a>

## postMessage()
Send a message to the tern module - if the module is being initialized,
the message will not be posted until initialization is complete

**Kind**: global function  
<a name="addPendingRequest"></a>

## addPendingRequest(file, offset, type) ⇒ <code>jQuery.Promise</code>
Add a pending request waiting for the tern-module to complete.
If file is a detected exclusion, then reject request.

**Kind**: global function  
**Returns**: <code>jQuery.Promise</code> - - the promise for the request  

| Param | Type | Description |
| --- | --- | --- |
| file | <code>string</code> | the name of the file |
| offset | <code>Object</code> | the offset into the file the request is for |
| type | <code>string</code> | the type of request |

<a name="getPendingRequest"></a>

## getPendingRequest(file, offset, type) ⇒ <code>jQuery.Deferred</code>
Get any pending $.Deferred object waiting on the specified file and request type

**Kind**: global function  
**Returns**: <code>jQuery.Deferred</code> - - the $.Deferred for the request  

| Param | Type | Description |
| --- | --- | --- |
| file | <code>string</code> | the file |
| offset | <code>Object</code> | the offset into the file the request is for |
| type | <code>string</code> | the type of request |

<a name="getResolvedPath"></a>

## getResolvedPath(file) ⇒ <code>string</code>
**Kind**: global function  
**Returns**: <code>string</code> - returns the path we resolved when we tried to parse the file, or undefined  

| Param | Type | Description |
| --- | --- | --- |
| file | <code>string</code> | a relative path |

<a name="filterText"></a>

## filterText(the) ⇒ <code>string</code>
check to see if the text we are sending to Tern is too long.

**Kind**: global function  
**Returns**: <code>string</code> - the text, or the empty text if the original was too long  

| Param | Type | Description |
| --- | --- | --- |
| the | <code>string</code> | text to check |

<a name="requestJumptoDef"></a>

## requestJumptoDef(session, document, offset) ⇒ <code>jQuery.Promise</code>
Request Jump-To-Definition from Tern.

**Kind**: global function  
**Returns**: <code>jQuery.Promise</code> - - The promise will not complete until tern
     has completed.  

| Param | Type | Description |
| --- | --- | --- |
| session | <code>session</code> | the session |
| document | <code>Document</code> | the document |
| offset | <code>Object</code> | the offset into the document |

<a name="getTernHints"></a>

## getTernHints(fileInfo, offset, isProperty) ⇒ <code>jQuery.Promise</code>
Get a Promise for the completions from TernJS, for the file & offset passed in.

**Kind**: global function  
**Returns**: <code>jQuery.Promise</code> - - a promise that will resolve to an array of completions when
     it is done  

| Param | Type | Description |
| --- | --- | --- |
| fileInfo | <code>Object</code> | - type of update, name of file, and the text of the update. For "full" updates, the whole text of the file is present. For "part" updates, the changed portion of the text. For "empty" updates, the file has not been modified and the text is empty. |
| offset | <code>Object</code> | the offset in the file the hints should be calculate at |
| isProperty | <code>boolean</code> | true if getting a property hint, otherwise getting an identifier hint. |

<a name="requestGuesses"></a>

## requestGuesses(session, document) ⇒ <code>jQuery.Promise</code>
Get a Promise for all of the known properties from TernJS, for the directory and file.
The properties will be used as guesses in tern.

**Kind**: global function  
**Returns**: <code>jQuery.Promise</code> - - The promise will not complete until the tern
     request has completed.  

| Param | Type | Description |
| --- | --- | --- |
| session | <code>Session</code> | the active hinting session |
| document | <code>Document</code> | the document for which scope info is      desired |

<a name="TernModule"></a>

## TernModule()
Encapsulate all the logic to talk to the tern module.  This will create
a new instance of a TernModule, which the rest of the hinting code can use to talk
to the tern node domain, without worrying about initialization, priming the pump, etc.

**Kind**: global function  

* [TernModule()](#TernModule)
    * [.getResolvedPath(file)](#TernModule..getResolvedPath) ⇒ <code>string</code>
    * [.postMessage()](#TernModule..postMessage)
    * [.handleEditorChange(session, document, previousDocument)](#TernModule..handleEditorChange)

<a name="TernModule..getResolvedPath"></a>

### TernModule.getResolvedPath(file) ⇒ <code>string</code>
**Kind**: inner method of [<code>TernModule</code>](#TernModule)  
**Returns**: <code>string</code> - returns the path we resolved when we tried to parse the file, or undefined  

| Param | Type | Description |
| --- | --- | --- |
| file | <code>string</code> | a relative path |

<a name="TernModule..postMessage"></a>

### TernModule.postMessage()
Send a message to the tern node domain - if the module is being initialized,
the message will not be posted until initialization is complete

**Kind**: inner method of [<code>TernModule</code>](#TernModule)  
<a name="TernModule..handleEditorChange"></a>

### TernModule.handleEditorChange(session, document, previousDocument)
Called each time a new editor becomes active.

**Kind**: inner method of [<code>TernModule</code>](#TernModule)  

| Param | Type | Description |
| --- | --- | --- |
| session | <code>Session</code> | the active hinting session (TODO: currently unused by doEditorChange()) |
| document | <code>Document</code> | the document of the editor that has changed |
| previousDocument | <code>Document</code> | the document of the editor is changing from |

<a name="requestParameterHint"></a>

## requestParameterHint(session, functionOffset) ⇒ <code>jQuery.Promise</code>
Request a parameter hint from Tern.

**Kind**: global function  
**Returns**: <code>jQuery.Promise</code> - - The promise will not complete until the
     hint has completed.  

| Param | Type | Description |
| --- | --- | --- |
| session | <code>Session</code> | the active hinting session |
| functionOffset | <code>Object</code> | the offset of the function call. |

<a name="requestHints"></a>

## requestHints(session, document) ⇒ <code>jQuery.Promise</code>
Request hints from Tern.

Note that successive calls to getScope may return the same objects, so
clients that wish to modify those objects (e.g., by annotating them based
on some temporary context) should copy them first. See, e.g.,
Session.getHints().

**Kind**: global function  
**Returns**: <code>jQuery.Promise</code> - - The promise will not complete until the tern
     hints have completed.  

| Param | Type | Description |
| --- | --- | --- |
| session | <code>Session</code> | the active hinting session |
| document | <code>Document</code> | the document for which scope info is      desired |

<a name="handleFileChange"></a>

## handleFileChange(changeList)
Called each time the file associated with the active editor changes.
Marks the file as being dirty.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| changeList | <code>Object</code> | An object representing the change range with `from` and `to` properties, each containing `line` and `ch` numbers. |

<a name="handleEditorChange"></a>

## handleEditorChange(session, document, previousDocument)
Called each time a new editor becomes active.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| session | <code>Session</code> | the active hinting session |
| document | <code>Document</code> | the document of the editor that has changed |
| previousDocument | <code>Document</code> | the document of the editor is changing from |

<a name="handleProjectClose"></a>

## handleProjectClose()
Do some cleanup when a project is closed.
Clean up previous analysis data from the module

**Kind**: global function  
<a name="handleProjectOpen"></a>

## handleProjectOpen([projectRootPath])
Read in project preferences when a new project is opened.
 Look in the project root directory for a preference file.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| [projectRootPath] | <code>string</code> | new project root path(optional).  Only needed for unit tests. |

