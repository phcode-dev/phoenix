### Import :
```js
const CSSUtils = brackets.getModule("language/CSSUtils")
```

<a name="CodeMirror"></a>

## CodeMirror
Set of utilities for simple parsing of CSS text.

**Kind**: global variable  
<a name="isCSSPreprocessorFile"></a>

## isCSSPreprocessorFile(filePath) ⇒ <code>boolean</code>
Determines if the given path is a CSS preprocessor file that CSSUtils supports.

**Kind**: global function  
**Returns**: <code>boolean</code> - true if LanguageManager identifies filePath as less or scss language.  

| Param | Type | Description |
| --- | --- | --- |
| filePath | <code>string</code> | Absolute path to the file. |

<a name="getInfoAtPos"></a>

## getInfoAtPos(editor, constPos) ⇒ <code>Object</code>
Returns a context info object for the given cursor position

**Kind**: global function  
**Returns**: <code>Object</code> - A CSS context info object.  

| Param | Type | Description |
| --- | --- | --- |
| editor | <code>Editor</code> |  |
| constPos | <code>Object</code> | A CM pos (likely from editor.getCursorPos()) |

<a name="getInfoAtPos.._contextCM"></a>

### getInfoAtPos.\_contextCM
We will use this CM to cook css context in case of style attribute value
as CM in htmlmixed mode doesn't yet identify this as css context. We provide
a no-op display function to run CM without a DOM head.

**Kind**: inner property of [<code>getInfoAtPos</code>](#getInfoAtPos)  
<a name="getCompleteSelectors"></a>

## getCompleteSelectors(info, [useGroup]) ⇒ <code>string</code>
Return a string that shows the literal parent hierarchy of the selector
in info.

**Kind**: global function  
**Returns**: <code>string</code> - the literal parent hierarchy of the selector  

| Param | Type | Description |
| --- | --- | --- |
| info | [<code>SelectorInfo</code>](#SelectorInfo) |  |
| [useGroup] | <code>boolean</code> | true to append selectorGroup instead of selector |

<a name="extractAllSelectors"></a>

## extractAllSelectors(text, documentMode) ⇒ [<code>Array.&lt;SelectorInfo&gt;</code>](#SelectorInfo)
Extracts all CSS selectors from the given text
Returns an array of SelectorInfo. Each SelectorInfo is an object with the following properties:
         selector:                 the text of the selector (note: comma separated selector groups like
                                   "h1, h2" are broken into separate selectors)
         ruleStartLine:            line in the text where the rule (including preceding comment) appears
         ruleStartChar:            column in the line where the rule (including preceding comment) starts
         selectorStartLine:        line in the text where the selector appears
         selectorStartChar:        column in the line where the selector starts
         selectorEndLine:          line where the selector ends
         selectorEndChar:          column where the selector ends
         selectorGroupStartLine:   line where the comma-separated selector group (e.g. .foo, .bar, .baz)
                                   starts that this selector (e.g. .baz) is part of. Particularly relevant for
                                   groups that are on multiple lines.
         selectorGroupStartChar:   column in line where the selector group starts.
         selectorGroup:            the entire selector group containing this selector, or undefined if there
                                   is only one selector in the rule.
         declListStartLine:        line where the declaration list for the rule starts
         declListStartChar:        column in line where the declaration list for the rule starts
         declListEndLine:          line where the declaration list for the rule ends
         declListEndChar:          column in the line where the declaration list for the rule ends
         level:                    the level of the current selector including any containing @media block in the
                                   nesting level count. Use this property with caution since it is primarily for internal
                                   parsing use. For example, two sibling selectors may have different levels if one
                                   of them is nested inside an @media block and it should not be used for sibling info.
         parentSelectors:          all ancestor selectors separated with '/' if the current selector is a nested one

**Kind**: global function  
**Returns**: [<code>Array.&lt;SelectorInfo&gt;</code>](#SelectorInfo) - Array with objects specifying selectors.  

| Param | Type | Description |
| --- | --- | --- |
| text | <code>string</code> | CSS text to extract from |
| documentMode | <code>string</code> | language mode of the document that text belongs to, default to css if undefined. |

<a name="findMatchingRules"></a>

## findMatchingRules(selector, htmlDocument) ⇒ <code>$.Promise</code>
Return all rules matching the specified selector.
For now, we only look at the rightmost simple selector. For example, searching for ".foo" will
match these rules:
 .foo {}
 div .foo {}
 div.foo {}
 div .foo[bar="42"] {}
 div .foo:hovered {}
 div .foo::first-child
but will *not* match these rules:
 .foobar {}
 .foo .bar {}
 div .foo .bar {}
 .foo.bar {}

**Kind**: global function  
**Returns**: <code>$.Promise</code> - that will be resolved with an Array of objects containing the
     source document, start line, and end line (0-based, inclusive range) for each matching declaration list.
     Does not addRef() the documents returned in the array.  

| Param | Type | Description |
| --- | --- | --- |
| selector | <code>string</code> | The selector to match. This can be a tag selector, class selector or id selector |
| htmlDocument | <code>Document</code> | An HTML file for context (so we can search 'style' blocks) |

<a name="findSelectorAtDocumentPos"></a>

## findSelectorAtDocumentPos(editor, pos) ⇒ <code>string</code>
Returns the selector(s) of the rule at the specified document pos, or "" if the position is
is not within a style rule.

**Kind**: global function  
**Returns**: <code>string</code> - Selector(s) for the rule at the specified position, or "" if the position
         is not within a style rule. If the rule has multiple selectors, a comma-separated
         selector string is returned.  

| Param | Type | Description |
| --- | --- | --- |
| editor | <code>Editor</code> | Editor to search |
| pos | <code>Object</code> | Position to search |

<a name="reduceStyleSheetForRegExParsing"></a>

## reduceStyleSheetForRegExParsing(content) ⇒ <code>string</code>
Reduces the style sheet by removing comments and strings
so that the content can be parsed using a regular expression

**Kind**: global function  
**Returns**: <code>string</code> - reduced content  

| Param | Type | Description |
| --- | --- | --- |
| content | <code>string</code> | to reduce |

<a name="addRuleToDocument"></a>

## addRuleToDocument(doc, selector, useTabChar, indentUnit) ⇒ <code>Object</code>
Adds a new rule to the end of the given document, and returns the range of the added rule
and the position of the cursor on the indented blank line within it. Note that the range will
not include all the inserted text (we insert extra newlines before and after the rule).

**Kind**: global function  
**Returns**: <code>Object</code> - The range of the inserted rule and the location where the cursor should be placed.  

| Param | Type | Description |
| --- | --- | --- |
| doc | <code>Document</code> | The document to insert the rule into. |
| selector | <code>string</code> | The selector to use for the given rule. |
| useTabChar | <code>boolean</code> | Whether to indent with a tab. |
| indentUnit | <code>number</code> | If useTabChar is false, how many spaces to indent with. |

<a name="consolidateRules"></a>

## consolidateRules()
In the given rule array (as returned by `findMatchingRules()`), if multiple rules in a row
refer to the same rule (because there were multiple matching selectors), eliminate the redundant
rules. Also, always use the selector group if available instead of the original matching selector.

**Kind**: global function  
<a name="getRangeSelectors"></a>

## getRangeSelectors(range) ⇒ <code>string</code>
Given a TextRange, extracts the selector(s) for the rule in the range and returns it.
Assumes the range only contains one rule; if there's more than one, it will return the
selector(s) for the first rule.

**Kind**: global function  
**Returns**: <code>string</code> - The selector(s) for the rule in the range.  

| Param | Type | Description |
| --- | --- | --- |
| range | <code>TextRange</code> | The range to extract the selector(s) from. |

<a name="SelectorInfo"></a>

## SelectorInfo : <code>Object</code>
**Kind**: global typedef  
