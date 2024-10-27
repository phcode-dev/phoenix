### Import :
```js
const FindBar = brackets.getModule("search/FindBar")
```

<a name="FindBar"></a>

## FindBar
**Kind**: global class  

* [FindBar](#FindBar)
    * [new FindBar([scopeLabel])](#new_FindBar_new)
    * [.open()](#FindBar+open)
    * [.close(suppressAnimation)](#FindBar+close)
    * [.isClosed()](#FindBar+isClosed) ⇒ <code>boolean</code>
    * [.getOptions()](#FindBar+getOptions) ⇒ <code>Object</code>
    * [.getQueryInfo()](#FindBar+getQueryInfo) ⇒ <code>Object</code>
    * [.showError(error, [isHTML], [isFilterError])](#FindBar+showError)
    * [.showFindCount(count)](#FindBar+showFindCount)
    * [.showNoResults(showIndicator, showMessage)](#FindBar+showNoResults)
    * [.getReplaceText()](#FindBar+getReplaceText) ⇒ <code>string</code>
    * [.enable(enable)](#FindBar+enable)
    * [.isEnabled()](#FindBar+isEnabled) ⇒ <code>boolean</code>
    * [.isReplaceEnabled()](#FindBar+isReplaceEnabled) ⇒ <code>boolean</code>
    * [.enableNavigation(enable)](#FindBar+enableNavigation)
    * [.enableReplace(enable)](#FindBar+enableReplace)
    * [.focusQuery()](#FindBar+focusQuery)
    * [.focusReplace()](#FindBar+focusReplace)
    * [.showIndexingSpinner()](#FindBar+showIndexingSpinner)
    * [.redoInstantSearch()](#FindBar+redoInstantSearch)

<a name="new_FindBar_new"></a>

### new FindBar([scopeLabel])
Find Bar UI component, used for both single- and multi-file find/replace. This doesn't actually
create and add the FindBar to the DOM - for that, call open().

Dispatches these events:

- queryChange - when the user types in the input field or sets a query option. Use getQueryInfo()
     to get the current query state.
- doFind - when the user chooses to do a Find Previous or Find Next.
     Parameters are:
         shiftKey - boolean, false for Find Next, true for Find Previous
- doReplace - when the user chooses to do a single replace. Use getReplaceText() to get the current replacement text.
- doReplaceBatch - when the user chooses to initiate a Replace All. Use getReplaceText() to get the current replacement text.
- doReplaceAll - when the user chooses to perform a Replace All. Use getReplaceText() to get the current replacement text.
- close - when the find bar is closed


| Param | Type | Description |
| --- | --- | --- |
| [options.multifile] | <code>boolean</code> | true if this is a Find/Replace in Files (changes the behavior of Enter in      the fields, hides the navigator controls, shows the scope/filter controls, and if in replace mode, hides the      Replace button (so there's only Replace All) |
| [options.replace] | <code>boolean</code> | true to show the Replace controls - default false |
| [options.queryPlaceholder] | <code>string</code> | label to show in the Find field - default empty string |
| [options.initialQuery] | <code>string</code> | query to populate in the Find field on open - default empty string |
| [scopeLabel] | <code>string</code> | HTML label to show for the scope of the search, expected to be already escaped - default empty string |

<a name="FindBar+open"></a>

### findBar.open()
Opens the Find bar, closing any other existing Find bars.

**Kind**: instance method of [<code>FindBar</code>](#FindBar)  
<a name="FindBar+close"></a>

### findBar.close(suppressAnimation)
Closes this Find bar. If already closed, does nothing.

**Kind**: instance method of [<code>FindBar</code>](#FindBar)  

| Param | Type | Description |
| --- | --- | --- |
| suppressAnimation | <code>boolean</code> | If true, don't do the standard closing animation. Default false. |

<a name="FindBar+isClosed"></a>

### findBar.isClosed() ⇒ <code>boolean</code>
**Kind**: instance method of [<code>FindBar</code>](#FindBar)  
**Returns**: <code>boolean</code> - true if this FindBar has been closed.  
<a name="FindBar+getOptions"></a>

### findBar.getOptions() ⇒ <code>Object</code>
**Kind**: instance method of [<code>FindBar</code>](#FindBar)  
**Returns**: <code>Object</code> - The options passed into the FindBar.  
<a name="FindBar+getQueryInfo"></a>

### findBar.getQueryInfo() ⇒ <code>Object</code>
Returns the current query and parameters.

**Kind**: instance method of [<code>FindBar</code>](#FindBar)  
<a name="FindBar+showError"></a>

### findBar.showError(error, [isHTML], [isFilterError])
Show or clear an error message related to the query.

**Kind**: instance method of [<code>FindBar</code>](#FindBar)  

| Param | Type | Description |
| --- | --- | --- |
| error | <code>string</code> | The error message to show, or null to hide the error display. |
| [isHTML] | <code>boolean</code> | Whether the error message is HTML that should remain unescaped. |
| [isFilterError] | <code>boolean</code> | Whether the error related to file filters |

<a name="FindBar+showFindCount"></a>

### findBar.showFindCount(count)
Set the find count.

**Kind**: instance method of [<code>FindBar</code>](#FindBar)  

| Param | Type | Description |
| --- | --- | --- |
| count | <code>string</code> | The find count message to show. Can be the empty string to hide it. |

<a name="FindBar+showNoResults"></a>

### findBar.showNoResults(showIndicator, showMessage)
Show or hide the no-results indicator and optional message. This is also used to
indicate regular expression errors.

**Kind**: instance method of [<code>FindBar</code>](#FindBar)  

| Param | Type |
| --- | --- |
| showIndicator | <code>boolean</code> | 
| showMessage | <code>boolean</code> | 

<a name="FindBar+getReplaceText"></a>

### findBar.getReplaceText() ⇒ <code>string</code>
Returns the current replace text.

**Kind**: instance method of [<code>FindBar</code>](#FindBar)  
<a name="FindBar+enable"></a>

### findBar.enable(enable)
Enables or disables the controls in the Find bar. Note that if enable is true, *all* controls will be
re-enabled, even if some were previously disabled using enableNavigation() or enableReplace(), so you
will need to refresh their enable state after calling this.

**Kind**: instance method of [<code>FindBar</code>](#FindBar)  

| Param | Type | Description |
| --- | --- | --- |
| enable | <code>boolean</code> | Whether to enable or disable the controls. |

<a name="FindBar+isEnabled"></a>

### findBar.isEnabled() ⇒ <code>boolean</code>
**Kind**: instance method of [<code>FindBar</code>](#FindBar)  
**Returns**: <code>boolean</code> - true if the FindBar is enabled.  
<a name="FindBar+isReplaceEnabled"></a>

### findBar.isReplaceEnabled() ⇒ <code>boolean</code>
**Kind**: instance method of [<code>FindBar</code>](#FindBar)  
**Returns**: <code>boolean</code> - true if the Replace button is enabled.  
<a name="FindBar+enableNavigation"></a>

### findBar.enableNavigation(enable)
Enable or disable the navigation controls if present. Note that if the Find bar is currently disabled
(i.e. isEnabled() returns false), this will have no effect.

**Kind**: instance method of [<code>FindBar</code>](#FindBar)  

| Param | Type | Description |
| --- | --- | --- |
| enable | <code>boolean</code> | Whether to enable the controls. |

<a name="FindBar+enableReplace"></a>

### findBar.enableReplace(enable)
Enable or disable the replace controls if present. Note that if the Find bar is currently disabled
(i.e. isEnabled() returns false), this will have no effect.

**Kind**: instance method of [<code>FindBar</code>](#FindBar)  

| Param | Type | Description |
| --- | --- | --- |
| enable | <code>boolean</code> | Whether to enable the controls. |

<a name="FindBar+focusQuery"></a>

### findBar.focusQuery()
Sets focus to the query field and selects its text.

**Kind**: instance method of [<code>FindBar</code>](#FindBar)  
<a name="FindBar+focusReplace"></a>

### findBar.focusReplace()
Sets focus to the replace field and selects its text.

**Kind**: instance method of [<code>FindBar</code>](#FindBar)  
<a name="FindBar+showIndexingSpinner"></a>

### findBar.showIndexingSpinner()
The indexing spinner is usually shown when node is indexing files

**Kind**: instance method of [<code>FindBar</code>](#FindBar)  
<a name="FindBar+redoInstantSearch"></a>

### findBar.redoInstantSearch()
Force a search again

**Kind**: instance method of [<code>FindBar</code>](#FindBar)  
