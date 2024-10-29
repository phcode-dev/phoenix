### Import :
```js
const CodeHintManager = brackets.getModule("editor/CodeHintManager")
```

<a name="registerHintProvider"></a>

## registerHintProvider(provider, languageIds, priority)
The method by which a CodeHintProvider registers its willingness to
providing hints for editors in a given language.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| provider | <code>CodeHintProvider</code> | The hint provider to be registered, described below. |
| languageIds | <code>Array.&lt;string&gt;</code> | The set of language ids for which the provider is capable of providing hints. If the special language id name "all" is included then the provider may be called for any language. |
| priority | <code>number</code> | Used to break ties among hint providers for a particular language. Providers with a higher number will be asked for hints before those with a lower priority value. Defaults to zero. |

<a name="hasValidExclusion"></a>

## hasValidExclusion(exclusion, textAfterCursor) ⇒ <code>boolean</code>
Test whether the provider has an exclusion that is still the same as text after the cursor.

**Kind**: global function  
**Returns**: <code>boolean</code> - true if the exclusion is not null and is exactly the same as textAfterCursor,
false otherwise.  

| Param | Type | Description |
| --- | --- | --- |
| exclusion | <code>string</code> | Text not to be overwritten when the provider inserts the selected hint. |
| textAfterCursor | <code>string</code> | Text that is immediately after the cursor position. |

<a name="isOpen"></a>

## isOpen() ⇒ <code>boolean</code>
Test if a hint popup is open.

**Kind**: global function  
**Returns**: <code>boolean</code> - - true if the hints are open, false otherwise.  
