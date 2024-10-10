### Import :
```js
const BeautificationManager = brackets.getModule("features/BeautificationManager")
```

<a name="module_features/BeautificationManager"></a>

## features/BeautificationManager
Beautification manager interacts with beautify extensions to determine what to do when user issues `beautify code`command. Beautification providers can use this module to register new providers to beautify new languages.## API### registerBeautificationProviderRegister a Beautification provider with this api.

**Example**  
```js// syntaxBeautificationManager.registerBeautificationProvider(provider, supportedLanguages, priority);```The API requires three parameters:1. `provider`: must implement a  `beautifyEditorProvider` and `beautifyTextProvider` function. See doc below:1. `supportedLanguages`: An array of languages that the provider supports. If `["all"]` is supplied, then the   provider will be invoked for all languages. Restrict to specific languages: Eg: `["javascript", "html", "php"]`1. `priority`: Used to break ties among providers for a particular language. Providers with a higher number    will be asked for beatified code before those with a lower priority value. Defaults to zero.
**Example**  
```js// to register a provider that will be invoked for all languages. where provider is any object that implements// a `beautifyEditorProvider` and `beautifyTextProvider` functionBeautificationManager.registerBeautificationProvider(provider, ["all"]);// to register a provider that will be invoked for specific languagesBeautificationManager.registerBeautificationProvider(provider, ["javascript", "html", "php"]);```### removeBeautificationProviderRemoves a registered Beautification provider. The API takes the same arguments as `registerBeautificationProvider`.
**Example**  
```js// syntaxBeautificationManager.removeBeautificationProvider(provider, supportedLanguages);// ExampleBeautificationManager.removeBeautificationProvider(provider, ["javascript", "html"]);```### provider.beautifyEditorProviderEach provider must implement the `beautifyEditorProvider` function that returns a promise. The promise either resolves withthe beautified code details or rejects if there is nothing to beautify for the provider.
**Example**  
```js// function signatureprovider.beautifyEditorProvider = function(editor) {        return new Promise((resolve, reject)=>{            resolve({                originalText: "the original text sent to beautify",                changedText: "partial or full text that changed.",                // Optional cursor offset if given will set the editor cursor to the position after beautification.                // either `cursorOffset` or `ranges` can be specified, but not both.                cursorOffset: number,                // Optional: If range is specified, only the given range will be replaced. else full text is replaced                ranges:{                    replaceStart: {line,ch},                    replaceEnd: {line,ch}                }            });        });    };```#### The resolved promise objectThe resolved promise should either be `null`(indicating that the extension itself has prettified the code anddoesn't want any further processing from BeautificationManager.) or contain the following details:1. `originalText` - string, the original text sent to beautify1. `changedText` - string, this should be the fully prettified text of the whole `originalText` or a fragment of    pretty text in `originalText` if a range was selected. If a `fragment` is returned, then the    `ranges` object must be specified.1. `cursorOffset` - Optional number, if given will set the editor cursor to the position after beautification.     either `cursorOffset` or `ranges` can be specified, but not both.1. `ranges` - Optional object, set of 2 cursors that gives details on what range to replace with given changed text.   If range is not specified, the full text in the editor will be replaced. range has 2 fields:   1. `replaceStart{line,ch}` - the start of range to replace   1. `replaceEnd{line,ch}` - the end of range to replace### provider.beautifyTextProviderEach provider must implement the `beautifyTextProvider` function that returns a promise.The promise either resolves with the beautified code details(same as beautifyEditorProvider) or rejects ifthere is nothing to beautify for the provider.
**Example**  
```js// function signature.provider.beautifyTextProvider = function(textToBeautify, filePathOrFileName) {        return new Promise((resolve, reject)=>{            resolve({                originalText: "the original text sent to beautify",                changedText: "partial or full text that changed.",                // Optional: If range is specified, only the given range is assumed changed. else full text changed.                ranges:{                    replaceStart: {line,ch},                    replaceEnd: {line,ch}                }            });        });    };```#### ParametersThe `beautifyTextProvider` callback will receive the following arguments.1. textToBeautify - string1. filePathOrFileName - string. This will either be a valid file path, or a file name to deduce which language the   beautifier is dealing with.#### The resolved promise object The resolved object has the same structure as beautifyEditorProvider resolved promise object.

* [features/BeautificationManager](#module_features/BeautificationManager)
    * [.beautifyEditor(editor)](#module_features/BeautificationManager..beautifyEditor) ⇒ <code>Promise</code>
    * [.beautifyText(textToBeautify, filePathOrFileName)](#module_features/BeautificationManager..beautifyText) ⇒ <code>Promise</code>

<a name="module_features/BeautificationManager..beautifyEditor"></a>

### features/BeautificationManager.beautifyEditor(editor) ⇒ <code>Promise</code>
Beautifies text in the given editor with available providers.

**Kind**: inner method of [<code>features/BeautificationManager</code>](#module_features/BeautificationManager)  
**Returns**: <code>Promise</code> - - A promise that will be resolved to null if the selected text is beautified or rejectsif beautification failed.  

| Param |
| --- |
| editor | 

<a name="module_features/BeautificationManager..beautifyText"></a>

### features/BeautificationManager.beautifyText(textToBeautify, filePathOrFileName) ⇒ <code>Promise</code>
Beautifies text with available providers.

**Kind**: inner method of [<code>features/BeautificationManager</code>](#module_features/BeautificationManager)  
**Returns**: <code>Promise</code> - - A promise that will be resolved to null if the selected text is beautified or rejectsif beautification failed..#### The resolved promise objectThe resolved promise object contain the following details:1. `originalText` - string, the original text sent to beautify1. `changedText` - string, the prettified text.1. `ranges` - Optional. if range object is returned, it means that only a part of the original text changed in   the original text `textToBeautify`. The part that changed is supplied by two cursor positions below:   1. `replaceStart{line,ch}` - the start of range to replace   1. `replaceEnd{line,ch}` - the end of range to replace  

| Param | Type | Description |
| --- | --- | --- |
| textToBeautify | <code>string</code> |  |
| filePathOrFileName | <code>string</code> | Note that the file path may not actually exist on disk. It is just used to infer what language beautifier is to be applied. |

