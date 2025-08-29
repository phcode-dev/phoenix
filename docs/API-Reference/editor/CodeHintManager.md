### Import :
```js
const CodeHintManager = brackets.getModule("editor/CodeHintManager")
```

<a name="module_CodeHintManager"></a>

## CodeHintManager
__CodeHintManager Overview:__

The CodeHintManager mediates the interaction between the editor and a
collection of hint providers. If hints are requested explicitly by the
user, then the providers registered for the current language are queried
for their ability to provide hints in order of descending priority by
way their hasHints methods. Character insertions may also constitute an
implicit request for hints; consequently, providers for the current
language are also queried on character insertion for both their ability to
provide hints and also for the suitability of providing implicit hints
in the given editor context.

Once a provider responds affirmatively to a request for hints, the
manager begins a hinting session with that provider, begins to query
that provider for hints by way of its getHints method, and opens the
hint list window. The hint list is kept open for the duration of the
current session. The manager maintains the session until either:

 1. the provider gives a null response to a request for hints;
 2. a deferred response to getHints fails to resolve;
 3. the user explicitly dismisses the hint list window;
 4. the editor is closed or becomes inactive; or
 5. the editor undergoes a "complex" change, e.g., a multi-character
    insertion, deletion or navigation.

Single-character insertions, deletions or navigations may not
invalidate the current session; in which case, each such change
precipitates a successive call to getHints.

If the user selects a hint from the rendered hint list then the
provider is responsible for inserting the hint into the editor context
for the current session by way of its insertHint method. The provider
may use the return value of insertHint to request that an additional
explicit hint request be triggered, potentially beginning a new
session.


__CodeHintProvider Overview:__

A code hint provider should implement the following three functions:

```js
- `CodeHintProvider.hasHints(editor, implicitChar)`
- `CodeHintProvider.getHints(implicitChar)`
- `CodeHintProvider.insertHint(hint)`
```

The behavior of these three functions is described in detail below.

```js
__CodeHintProvider.hasHints(editor, implicitChar)__
```

The method by which a provider indicates intent to provide hints for a
given editor. The manager calls this method both when hints are
explicitly requested (via, e.g., Ctrl-Space) and when they may be
implicitly requested as a result of character insertion in the editor.
If the provider responds negatively then the manager may query other
providers for hints. Otherwise, a new hinting session begins with this
provider, during which the manager may repeatedly query the provider
for hints via the getHints method. Note that no other providers will be
queried until the hinting session ends.

The implicitChar parameter is used to determine whether the hinting
request is explicit or implicit. If the string is null then hints were
explicitly requested and the provider should reply based on whether it
is possible to return hints for the given editor context. Otherwise,
the string contains just the last character inserted into the editor's
document and the request for hints is implicit. In this case, the
provider should determine whether it is both possible and appropriate
to show hints. Because implicit hints can be triggered by every
character insertion, hasHints may be called frequently; consequently,
the provider should endeavor to return a value as quickly as possible.

Because calls to hasHints imply that a hinting session is about to
begin, a provider may wish to clean up cached data from previous
sessions in this method. Similarly, if the provider returns true, it
may wish to prepare to cache data suitable for the current session. In
particular, it should keep a reference to the editor object so that it
can access the editor in future calls to getHints and insertHints.

```js
param {Editor} editor
```
A non-null editor object for the active window.

param {String} implicitChar
Either null, if the hinting request was explicit, or a single character
that represents the last insertion and that indicates an implicit
hinting request.

return {Boolean}
Determines whether the current provider is able to provide hints for
the given editor context and, in case implicitChar is non- null,
whether it is appropriate to do so.


```js
__CodeHintProvider.getHints(implicitChar)__
```

The method by which a provider provides hints for the editor context
associated with the current session. The getHints method is called only
if the provider asserted its willingness to provide hints in an earlier
call to hasHints. The provider may return null or false, which indicates
that the manager should end the current hinting session and close the hint
list window; or true, which indicates that the manager should end the
current hinting session but immediately attempt to begin a new hinting
session by querying registered providers. Otherwise, the provider should
return a response object that contains the following properties:

 1. hints, a sorted array hints that the provider could later insert
    into the editor;
 2. match, a string that the manager may use to emphasize substrings of
    hints in the hint list (case-insensitive); and
 3. selectInitial, a boolean that indicates whether or not the
    first hint in the list should be selected by default.
 4. handleWideResults, a boolean (or undefined) that indicates whether
    to allow result string to stretch width of display.

If the array of
hints is empty, then the manager will render an empty list, but the
hinting session will remain open and the value of the selectInitial
property is irrelevant.

Alternatively, the provider may return a jQuery.Deferred object
that resolves with an object with the structure described above. In
this case, the manager will initially render the hint list window with
a throbber and will render the actual list once the deferred object
resolves to a response object. If a hint list has already been rendered
(from an earlier call to getHints), then the old list will continue
to be displayed until the new deferred has resolved.

Both the manager and the provider can reject the deferred object. The
manager will reject the deferred if the editor changes state (e.g., the
user types a character) or if the hinting session ends (e.g., the user
explicitly closes the hints by pressing escape). The provider can use
this event to, e.g., abort an expensive computation. Consequently, the
provider may assume that getHints will not be called again until the
deferred object from the current call has resolved or been rejected. If
the provider rejects the deferred, the manager will end the hinting
session.

The getHints method may be called by the manager repeatedly during a
hinting session. Providers may wish to cache information for efficiency
that may be useful throughout these sessions. The same editor context
will be used throughout a session, and will only change during the
session as a result of single-character insertions, deletions and
cursor navigations. The provider may assume that, throughout the
lifetime of the session, the getHints method will be called exactly
once for each such editor change. Consequently, the provider may also
assume that the document will not be changed outside of the editor
during a session.

param {String} implicitChar
Either null, if the request to update the hint list was a result of
navigation, or a single character that represents the last insertion.

```js
    return {jQuery.Deferred|{
         hints: Array.<string|jQueryObject>,
         match: string,
         selectInitial: boolean,
         handleWideResults: boolean}}
```

Null if the provider wishes to end the hinting session. Otherwise, a
response object, possibly deferred, that provides 1. a sorted array
hints that consists either of strings or jQuery objects; 2. a string
match, possibly null, that is used by the manager to emphasize
matching substrings when rendering the hint list; and 3. a boolean that
indicates whether the first result, if one exists, should be selected
by default in the hint list window. If match is non-null, then the
hints should be strings.

If the match is null, the manager will not
attempt to emphasize any parts of the hints when rendering the hint
list; instead the provider may return strings or jQuery objects for
which emphasis is self-contained. For example, the strings may contain
substrings that wrapped in bold tags. In this way, the provider can
choose to let the manager handle emphasis for the simple and common case
of prefix matching, or can provide its own emphasis if it wishes to use
a more sophisticated matching algorithm.

```js
__CodeHintProvider.insertHint(hint)__
```

The method by which a provider inserts a hint into the editor context
associated with the current session. The provider may assume that the
given hint was returned by the provider in some previous call in the
current session to getHints, but not necessarily the most recent call.
After the insertion has been performed, the current hinting session is
closed. The provider should return a boolean value to indicate whether
or not the end of the session should be immediately followed by a new
explicit hinting request, which may result in a new hinting session
being opened with some provider, but not necessarily the current one.

param {String} hint
The hint to be inserted into the editor context for the current session.

return {Boolean}
Indicates whether the manager should follow hint insertion with an
explicit hint request.


__CodeHintProvider.insertHintOnTab__

type {Boolean} insertHintOnTab
Indicates whether the CodeHintManager should request that the provider of
the current session insert the currently selected hint on tab key events,
or if instead a tab character should be inserted into the editor. If omitted,
the fallback behavior is determined by the CodeHintManager. The default
behavior is to insert a tab character, but this can be changed with the
insertHintOnTab Preference.


* [CodeHintManager](#module_CodeHintManager)
    * [.registerHintProvider(provider, languageIds, priority)](#module_CodeHintManager..registerHintProvider)
    * [.hasValidExclusion(exclusion, textAfterCursor)](#module_CodeHintManager..hasValidExclusion) ⇒ <code>boolean</code>
    * [.isOpen()](#module_CodeHintManager..isOpen) ⇒ <code>boolean</code>
    * [.showHintsAtTop(handler)](#module_CodeHintManager..showHintsAtTop)
    * [.clearHintsAtTop()](#module_CodeHintManager..clearHintsAtTop)

<a name="module_CodeHintManager..registerHintProvider"></a>

### CodeHintManager.registerHintProvider(provider, languageIds, priority)
The method by which a CodeHintProvider registers its willingness to
providing hints for editors in a given language.

**Kind**: inner method of [<code>CodeHintManager</code>](#module_CodeHintManager)  

| Param | Type | Description |
| --- | --- | --- |
| provider | <code>CodeHintProvider</code> | The hint provider to be registered, described below. |
| languageIds | <code>Array.&lt;string&gt;</code> | The set of language ids for which the provider is capable of providing hints. If the special language id name "all" is included then the provider may be called for any language. |
| priority | <code>number</code> | Used to break ties among hint providers for a particular language. Providers with a higher number will be asked for hints before those with a lower priority value. Defaults to zero. |

<a name="module_CodeHintManager..hasValidExclusion"></a>

### CodeHintManager.hasValidExclusion(exclusion, textAfterCursor) ⇒ <code>boolean</code>
Test whether the provider has an exclusion that is still the same as text after the cursor.

**Kind**: inner method of [<code>CodeHintManager</code>](#module_CodeHintManager)  
**Returns**: <code>boolean</code> - true if the exclusion is not null and is exactly the same as textAfterCursor,
false otherwise.  

| Param | Type | Description |
| --- | --- | --- |
| exclusion | <code>string</code> | Text not to be overwritten when the provider inserts the selected hint. |
| textAfterCursor | <code>string</code> | Text that is immediately after the cursor position. |

<a name="module_CodeHintManager..isOpen"></a>

### CodeHintManager.isOpen() ⇒ <code>boolean</code>
Test if a hint popup is open.

**Kind**: inner method of [<code>CodeHintManager</code>](#module_CodeHintManager)  
**Returns**: <code>boolean</code> - - true if the hints are open, false otherwise.  
<a name="module_CodeHintManager..showHintsAtTop"></a>

### CodeHintManager.showHintsAtTop(handler)
Register a handler to show hints at the top of the hint list.
This API allows extensions to add their own hints at the top of the standard hint list.

**Kind**: inner method of [<code>CodeHintManager</code>](#module_CodeHintManager)  

| Param | Type | Description |
| --- | --- | --- |
| handler | <code>Object</code> | A hint provider object with standard methods:   - hasHints: function(editor, implicitChar) - returns true if hints are available   - getHints: function(editor, implicitChar) - returns hint response object with hints array   - insertHint: function(hint) - handles hint insertion, returns true if handled |

<a name="module_CodeHintManager..clearHintsAtTop"></a>

### CodeHintManager.clearHintsAtTop()
Unregister the hints at top handler.

**Kind**: inner method of [<code>CodeHintManager</code>](#module_CodeHintManager)  
