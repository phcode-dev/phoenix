### Import :
```js
const CodeInspection = brackets.getModule("language/CodeInspection")
```

<a name="_"></a>

## \_
Manages linters and other code inspections on a per-language basis. Provides a UI and status indicator forthe resulting errors/warnings.Currently, inspection providers are only invoked on the current file and only when it is opened, switched to,or saved. But in the future, inspectors may be invoked as part of a global scan, at intervals while typing, etc.Currently, results are only displayed in a bottom panel list and in a status bar icon. But in the future,results may also be displayed inline in the editor (as gutter markers, etc.).In the future, support may also be added for error/warning providers that cannot process a single file at a time(e.g. a full-project compiler).

**Kind**: global constant  
<a name="Type"></a>

## Type
Values for problem's 'type' property

**Kind**: global constant  

* [Type](#Type)
    * [.ERROR](#Type.ERROR)
    * [.WARNING](#Type.WARNING)
    * [.META](#Type.META)

<a name="Type.ERROR"></a>

### Type.ERROR
Unambiguous error, such as a syntax error

**Kind**: static property of [<code>Type</code>](#Type)  
<a name="Type.WARNING"></a>

### Type.WARNING
Maintainability issue, probable error / bad smell, etc.

**Kind**: static property of [<code>Type</code>](#Type)  
<a name="Type.META"></a>

### Type.META
Inspector unable to continue, code too complex for static analysis, etc. Not counted in err/warn tally.

**Kind**: static property of [<code>Type</code>](#Type)  
<a name="PREF_ENABLED"></a>

## PREF\_ENABLED
Constants for the preferences defined in this file.

**Kind**: global constant  
<a name="setGotoEnabled"></a>

## setGotoEnabled(gotoEnabled)
Enable or disable the "Go to First Error" command

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| gotoEnabled | <code>boolean</code> | Whether it is enabled. |

<a name="getProvidersForPath"></a>

## getProvidersForPath(filePath) ⇒ <code>Object</code>
Returns a list of provider for given file path, if available.Decision is made depending on the file extension.

**Kind**: global function  

| Param | Type |
| --- | --- |
| filePath | <code>string</code> | 

<a name="getProviderIDsForLanguage"></a>

## getProviderIDsForLanguage(languageId) ⇒ <code>Array.&lt;string&gt;</code>
Returns an array of the IDs of providers registered for a specific language

**Kind**: global function  
**Returns**: <code>Array.&lt;string&gt;</code> - Names of registered providers.  

| Param | Type |
| --- | --- |
| languageId | <code>string</code> | 

<a name="inspectFile"></a>

## inspectFile(file, providerList) ⇒ <code>$.Promise</code>
Runs a file inspection over passed file. Uses the given list of providers if specified, otherwise usesthe set of providers that are registered for the file's language.This method doesn't update the Brackets UI, just provides inspection results.These results will reflect any unsaved changes present in the file if currently open.The Promise yields an array of provider-result pair objects (the result is the return value of theprovider's scanFile() - see register() for details). The result object may be null if there were noerrors from that provider.If there are no providers registered for this file, the Promise yields null instead.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - a jQuery promise that will be resolved with ?\{provider:Object, result: ?\{errors:!Array, aborted:boolean}}  

| Param | Type | Description |
| --- | --- | --- |
| file | <code>File</code> | File that will be inspected for errors. |
| providerList | <code>Object</code> | Array |

<a name="updatePanelTitleAndStatusBar"></a>

## updatePanelTitleAndStatusBar(numProblems, Array, aborted, fileName)
Update the title of the problem panel and the tooltip of the status bar icon. The title and the tooltip willchange based on the number of problems reported and how many provider reported problems.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| numProblems | <code>Number</code> | total number of problems across all providers |
| Array | <code>Object</code> | providersReportingProblems - providers that reported problems |
| aborted | <code>boolean</code> | true if any provider returned a result with the 'aborted' flag set |
| fileName |  |  |

<a name="_createMarkerElement"></a>

## \_createMarkerElement(editor, line, ch, type, message, isFixable) ⇒
It creates a div element with a span element inside it, and then adds a click handler to move cursor to theerror position.

**Kind**: global function  
**Returns**: A DOM element.  

| Param | Description |
| --- | --- |
| editor | the editor instance |
| line | the line number of the error |
| ch | the character position of the error |
| type | The type of the marker. This is a string that can be one of the error types |
| message | The message that will be displayed when you hover over the marker. |
| isFixable | true if we need to use the fix icon |

<a name="run"></a>

## run(providerName)
Run inspector applicable to current document. Updates status bar indicator and refreshes error list inbottom panel. Does not run if inspection is disabled or if a providerName is given and does notmatch the current doc's provider name.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| providerName | <code>string</code> | name of the provider that is requesting a run |

<a name="getProvidersForLanguageId"></a>

## getProvidersForLanguageId()
Returns a list of providers registered for given languageId through register function

**Kind**: global function  
<a name="updateListeners"></a>

## updateListeners()
Update DocumentManager listeners.

**Kind**: global function  
<a name="toggleEnabled"></a>

## toggleEnabled(enabled, doNotSave)
Enable or disable all inspection.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| enabled | <code>boolean</code> | Enabled state. If omitted, the state is toggled. |
| doNotSave | <code>boolean</code> | true if the preference should not be saved to user settings. This is generally for events triggered by project-level settings. |

<a name="toggleCollapsed"></a>

## toggleCollapsed(collapsed, doNotSave)
Toggle the collapsed state for the panel. This explicitly collapses the panel (as opposed tothe auto collapse due to files with no errors & filetypes with no provider). When explicitlycollapsed, the panel will not reopen automatically on switch files or save.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| collapsed | <code>boolean</code> | Collapsed state. If omitted, the state is toggled. |
| doNotSave | <code>boolean</code> | true if the preference should not be saved to user settings. This is generally for events triggered by project-level settings. |

<a name="handleGotoFirstProblem"></a>

## handleGotoFirstProblem()
Command to go to the first Problem

**Kind**: global function  
<a name="Error"></a>

## Error : <code>Object</code>
Registers a provider for a specific language to inspect files and provide linting results.The provider is passed the text of the file and its full path. Providers should not assume thatthe file is open (i.e., `DocumentManager.getOpenDocumentForPath()` may return `null`) or that thefile on disk matches the text given (the file may have unsaved changes).Registering any provider for the "javascript" language automatically unregisters the built-inBrackets JSLint provider. This is a temporary convenience until a UI exists for disablingregistered providers.Providers must implement `canInspect()`, `scanFile()`, or `scanFileAsync()`. If both `scanFile()`and `scanFileAsync()` are implemented, `scanFile()` is ignored.- `canInspect(fullPath)`: A synchronous call to determine if the file can be scanned by this provider.- `scanFile(text, fullPath)`: A synchronous function returning linting results or `null`.- `scanFileAsync(text, fullPath)`: An asynchronous function returning a jQuery Promise resolved with  the same type of value as `scanFile()`. Rejecting the promise is treated as an internal error in the provider.Each error object in the results should have the following structure:```js             { pos:{line,ch},               endPos:?{line,ch},               message:string,               htmlMessage:string,               type:?Type ,               fix: { // an optional fix, if present will show the fix button                    replace: "text to replace the offset given below",                    rangeOffset: {                        start: number,                        end: number               }}}```

**Kind**: global typedef  

| Param | Type | Description |
| --- | --- | --- |
| languageId | <code>string</code> | The language ID for which the provider is registered. |
| provider | <code>Object</code> | The provider object. |
| provider.name | <code>string</code> | The name of the provider. |
| provider.scanFile | <code>function</code> | Synchronous scan function. |
| provider.scanFileAsync | <code>function</code> | Asynchronous scan function returning a Promise. |

**Properties**

| Name | Type | Description |
| --- | --- | --- |
| pos | <code>Object</code> | The start position of the error. |
| pos.line | <code>number</code> | The line number (0-based). |
| pos.ch | <code>number</code> | The character position within the line (0-based). |
| endPos | <code>Object</code> | The end position of the error. |
| endPos.line | <code>number</code> | The end line number (0-based). |
| endPos.ch | <code>number</code> | The end character position within the line (0-based). |
| message | <code>string</code> | The error message to be displayed as text. |
| htmlMessage | <code>string</code> | The error message to be displayed as HTML. |
| type | [<code>Type</code>](#Type) | The type of the error. Defaults to `Type.WARNING` if unspecified. |
| fix | <code>Object</code> | An optional fix object. |
| fix.replace | <code>string</code> | The text to replace the error with. |
| fix.rangeOffset | <code>Object</code> | The range within the text to replace. |
| fix.rangeOffset.start | <code>number</code> | The start offset of the range. |
| fix.rangeOffset.end | <code>number</code> | The end offset of the range. If no errors are found, return either `null`(treated as file is problem free) or an object with a zero-length `errors` array. Always use `message` to safely display the error as text. If you want to display HTML error message, then explicitly use `htmlMessage` to display it. Both `message` and `htmlMessage` can be used simultaneously. After scanning the file, if you need to omit the lint result, return or resolve with `{isIgnored: true}`. This prevents the file from being marked with a no errors tick mark in the status bar and excludes the linter from the problems panel. |

