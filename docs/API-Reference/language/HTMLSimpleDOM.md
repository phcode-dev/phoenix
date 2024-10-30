### Import :
```js
const HTMLSimpleDOM = brackets.getModule("language/HTMLSimpleDOM")
```

<a name="SimpleNode"></a>

## SimpleNode
**Kind**: global class  

* [SimpleNode](#SimpleNode)
    * [new SimpleNode(properties)](#new_SimpleNode_new)
    * [.update()](#SimpleNode+update)
    * [.updateAttributeSignature()](#SimpleNode+updateAttributeSignature)
    * [.isElement()](#SimpleNode+isElement) ⇒ <code>bool</code>
    * [.isText()](#SimpleNode+isText) ⇒ <code>bool</code>

<a name="new_SimpleNode_new"></a>

### new SimpleNode(properties)
A SimpleNode represents one node in a SimpleDOM tree. Each node can have
any set of properties on it, though there are a couple of assumptions made.
Elements will have `children` and `attributes` properties. Text nodes will have a `content`
property. All Elements will have a `tagID` and text nodes *can* have one.


| Param | Type | Description |
| --- | --- | --- |
| properties | <code>Object</code> | the properties provided will be set on the new object. |

<a name="SimpleNode+update"></a>

### simpleNode.update()
Updates signatures used to optimize the number of comparisons done during
diffing. This is important to call if you change:

* children
* child node attributes
* text content of a text node
* child node text

**Kind**: instance method of [<code>SimpleNode</code>](#SimpleNode)  
<a name="SimpleNode+updateAttributeSignature"></a>

### simpleNode.updateAttributeSignature()
Updates the signature of this node's attributes. Call this after making attribute changes.

**Kind**: instance method of [<code>SimpleNode</code>](#SimpleNode)  
<a name="SimpleNode+isElement"></a>

### simpleNode.isElement() ⇒ <code>bool</code>
Is this node an element node?

**Kind**: instance method of [<code>SimpleNode</code>](#SimpleNode)  
**Returns**: <code>bool</code> - true if it is an element  
<a name="SimpleNode+isText"></a>

### simpleNode.isText() ⇒ <code>bool</code>
Is this node a text node?

**Kind**: instance method of [<code>SimpleNode</code>](#SimpleNode)  
**Returns**: <code>bool</code> - true if it is text  
<a name="Builder"></a>

## Builder
**Kind**: global class  

* [Builder](#Builder)
    * [new Builder(text, startOffset, startOffsetPos)](#new_Builder_new)
    * [.getID](#Builder+getID) ⇒ <code>int</code>
    * [.build(strict, markCache)](#Builder+build) ⇒ [<code>SimpleNode</code>](#SimpleNode)
    * [.getNewID()](#Builder+getNewID) ⇒ <code>int</code>

<a name="new_Builder_new"></a>

### new Builder(text, startOffset, startOffsetPos)
A Builder creates a SimpleDOM tree of SimpleNode objects representing the
"important" contents of an HTML document. It does not include things like comments.
The nodes include information about their position in the text provided.


| Param | Type | Description |
| --- | --- | --- |
| text | <code>string</code> | The text to parse |
| startOffset | <code>int</code> | starting offset in the text |
| startOffsetPos | <code>Object</code> | line/ch position in the text |

<a name="Builder+getID"></a>

### builder.getID ⇒ <code>int</code>
Returns the best tag ID for the new tag object given.
The default implementation just calls `getNewID`
and returns a unique ID.

**Kind**: instance property of [<code>Builder</code>](#Builder)  
**Returns**: <code>int</code> - unique tag ID  

| Param | Type | Description |
| --- | --- | --- |
| newTag | <code>Object</code> | tag object to potentially inspect to choose an ID |

<a name="Builder+build"></a>

### builder.build(strict, markCache) ⇒ [<code>SimpleNode</code>](#SimpleNode)
Builds the SimpleDOM.

**Kind**: instance method of [<code>Builder</code>](#Builder)  
**Returns**: [<code>SimpleNode</code>](#SimpleNode) - root of tree or null if parsing failed  

| Param | Type | Description |
| --- | --- | --- |
| strict | <code>bool</code> | if errors are detected, halt and return null |
| markCache | <code>Object</code> | a cache that can be used in ID generation (is passed to `getID`) |

<a name="Builder+getNewID"></a>

### builder.getNewID() ⇒ <code>int</code>
Returns a new tag ID.

**Kind**: instance method of [<code>Builder</code>](#Builder)  
**Returns**: <code>int</code> - unique tag ID  
<a name="build"></a>

## build(text, strict) ⇒ [<code>SimpleNode</code>](#SimpleNode)
Builds a SimpleDOM from the text provided. If `strict` mode is true, parsing
will halt as soon as any error is seen and null will be returned.

**Kind**: global function  
**Returns**: [<code>SimpleNode</code>](#SimpleNode) - root of tree or null if strict failed  

| Param | Type | Description |
| --- | --- | --- |
| text | <code>string</code> | Text of document to parse |
| strict | <code>bool</code> | True for strict parsing |

