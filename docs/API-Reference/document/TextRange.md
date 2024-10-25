### Import :
```js
const TextRange = brackets.getModule("document/TextRange")
```

<a name="TextRange"></a>

## TextRange
**Kind**: global class  

* [TextRange](#TextRange)
    * [new TextRange(document, startLine, endLine)](#new_TextRange_new)
    * [.document](#TextRange+document) : <code>Document</code>
    * [.startLine](#TextRange+startLine) : <code>number</code>
    * [.endLine](#TextRange+endLine) : <code>number</code>
    * [.dispose()](#TextRange+dispose)

<a name="new_TextRange_new"></a>

### new TextRange(document, startLine, endLine)
Stores a range of lines that is automatically maintained as the Document changes. The range
MAY drop out of sync with the Document in certain edge cases; startLine & endLine will become
null when that happens.

Important: you must dispose() a TextRange when you're done with it. Because TextRange addRef()s
the Document (in order to listen to it), you will leak Documents otherwise.

TextRange dispatches these events:
 - change -- When the range boundary line numbers change (due to a Document change)
 - contentChange -- When the actual content of the range changes. This might or might not
   be accompanied by a change in the boundary line numbers.
 - lostSync -- When the backing Document changes in such a way that the range can no longer
   accurately be maintained. Generally, occurs whenever an edit spans a range boundary.
   After this, startLine & endLine will be unusable (set to null).
   Also occurs when the document is deleted, though startLine & endLine won't be modified
These events only ever occur in response to Document changes, so if you are already listening
to the Document, you could ignore the TextRange events and just read its updated value in your
own Document change handler.


| Param | Type | Description |
| --- | --- | --- |
| document | <code>Document</code> |  |
| startLine | <code>number</code> | First line in range (0-based, inclusive) |
| endLine | <code>number</code> | Last line in range (0-based, inclusive) |

<a name="TextRange+document"></a>

### textRange.document : <code>Document</code>
Containing document

**Kind**: instance property of [<code>TextRange</code>](#TextRange)  
<a name="TextRange+startLine"></a>

### textRange.startLine : <code>number</code>
Starting Line

**Kind**: instance property of [<code>TextRange</code>](#TextRange)  
<a name="TextRange+endLine"></a>

### textRange.endLine : <code>number</code>
Ending Line

**Kind**: instance property of [<code>TextRange</code>](#TextRange)  
<a name="TextRange+dispose"></a>

### textRange.dispose()
Detaches from the Document. The TextRange will no longer update or send change events

**Kind**: instance method of [<code>TextRange</code>](#TextRange)  
<a name="EventDispatcher"></a>

## EventDispatcher
**Kind**: global variable  
