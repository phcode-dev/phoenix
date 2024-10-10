### Import :
```js
const CodeHintManager = brackets.getModule("editor/CodeHintManager")
```

<a name="_providerSort"></a>

## \_providerSort()
Comparator to sort providers from high to low priority

**Kind**: global function  
<a name="registerHintProvider"></a>

## registerHintProvider(provider, languageIds, priority)
The method by which a CodeHintProvider registers its willingness toproviding hints for editors in a given language.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| provider | <code>CodeHintProvider</code> | The hint provider to be registered, described below. |
| languageIds | <code>Array.&lt;string&gt;</code> | The set of language ids for which the provider is capable of providing hints. If the special language id name "all" is included then the provider may be called for any language. |
| priority | <code>number</code> | Used to break ties among hint providers for a particular language. Providers with a higher number will be asked for hints before those with a lower priority value. Defaults to zero. |

<a name="_getProvidersForLanguageId"></a>

## \_getProvidersForLanguageId(languageId) ⇒ <code>Object</code>
Return the array of hint providers for the given language id. This gets called (potentially) on every keypress. So, it should be fast.

**Kind**: global function  

| Param | Type |
| --- | --- |
| languageId | <code>string</code> | 

<a name="_endSession"></a>

## \_endSession()
End the current hinting session

**Kind**: global function  
<a name="_inSession"></a>

## \_inSession(editor) ⇒
Is there a hinting session active for a given editor?NOTE: the sessionEditor, sessionProvider and hintList objects areonly guaranteed to be initialized during an active session.

**Kind**: global function  
**Returns**: boolean  

| Param | Type |
| --- | --- |
| editor | <code>Editor</code> | 

<a name="_updateHintList"></a>

## \_updateHintList()
From an active hinting session, get hints from the current provider andrender the hint list window.Assumes that it is called when a session is active (i.e. sessionProvider is not null).

**Kind**: global function  
<a name="_beginSession"></a>

## \_beginSession(editor)
Try to begin a new hinting session.

**Kind**: global function  

| Param | Type |
| --- | --- |
| editor | <code>Editor</code> | 

<a name="_handleKeydownEvent"></a>

## \_handleKeydownEvent(jqEvent, editor, event)
Handles keys related to displaying, searching, and navigating the hint list.This gets called before handleChange.TODO: Ideally, we'd get a more semantic event from the editor that told uswhat changed so that we could do all of this logic without looking atkey events. Then, the purposes of handleKeyEvent and handleChange could becombined. Doing this well requires changing CodeMirror.

**Kind**: global function  

| Param | Type |
| --- | --- |
| jqEvent | <code>Event</code> | 
| editor | <code>Editor</code> | 
| event | <code>KeyboardEvent</code> | 

<a name="_handleCursorActivity"></a>

## \_handleCursorActivity(event, editor)
Handle a selection change event in the editor. If the selection becomes amultiple selection, end our current session.

**Kind**: global function  

| Param | Type |
| --- | --- |
| event | <code>BracketsEvent</code> | 
| editor | <code>Editor</code> | 

<a name="_handleChange"></a>

## \_handleChange(event, editor, changeList)
Start a new implicit hinting session, or update the existing hint list.Called by the editor after handleKeyEvent, which is responsible for settingthe lastChar.

**Kind**: global function  

| Param | Type |
| --- | --- |
| event | <code>Event</code> | 
| editor | <code>Editor</code> | 
| changeList | <code>Object</code> | 

<a name="hasValidExclusion"></a>

## hasValidExclusion(exclusion, textAfterCursor) ⇒ <code>boolean</code>
Test whether the provider has an exclusion that is still the same as text after the cursor.

**Kind**: global function  
**Returns**: <code>boolean</code> - true if the exclusion is not null and is exactly the same as textAfterCursor,false otherwise.  

| Param | Type | Description |
| --- | --- | --- |
| exclusion | <code>string</code> | Text not to be overwritten when the provider inserts the selected hint. |
| textAfterCursor | <code>string</code> | Text that is immediately after the cursor position. |

<a name="isOpen"></a>

## isOpen() ⇒ <code>boolean</code>
Test if a hint popup is open.

**Kind**: global function  
**Returns**: <code>boolean</code> - - true if the hints are open, false otherwise.  
<a name="_startNewSession"></a>

## \_startNewSession(editor)
Explicitly start a new session. If we have an existing session,then close the current one and restart a new one.

**Kind**: global function  

| Param | Type |
| --- | --- |
| editor | <code>Editor</code> | 

<a name="_getCodeHintList"></a>

## \_getCodeHintList()
Expose CodeHintList for unit testing

**Kind**: global function  
