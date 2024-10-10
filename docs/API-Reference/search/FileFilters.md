### Import :
```js
const FileFilters = brackets.getModule("search/FileFilters")
```

<a name="_picker"></a>

## \_picker : [<code>DropdownButton</code>](#DropdownButton)
**Kind**: global variable  
<a name="$filterContainer"></a>

## $filterContainer : <code>jQuery</code>
**Kind**: global variable  
<a name="DropdownButton"></a>

## DropdownButton
Utilities for managing file-set filters, as used in Find in Files.

**Kind**: global constant  
<a name="getActiveFilter"></a>

## getActiveFilter() ⇒ <code>Object</code>
A search filter is an array of one or more glob strings. The filter must be 'compiled' via compile()

**Kind**: global function  
**Returns**: <code>Object</code> - a globeFilter filter that can be passed to filterPath()/filterFileList().  
<a name="setActiveFilter"></a>

## setActiveFilter(filter, [filterType])
Sets and save the index of the active filter. Automatically set when editFilter() is completed.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| filter | <code>Object</code> \| <code>string</code> | a globeFilter filter that can be passed to filterPath()/filterFileList(). |
| [filterType] | <code>string</code> | optional, one of FileFilters.FILTER_TYPE_*. |

<a name="compile"></a>

## compile(userFilterString) ⇒ <code>Object</code>
Converts a user-specified filter object (as chosen in picker or retrieved from getFilters()) to a 'compiled' form

**Kind**: global function  
**Returns**: <code>Object</code> - a globeFilter filter that can be passed to filterPath()/filterFileList().  

| Param | Type |
| --- | --- |
| userFilterString | <code>string</code> | 

<a name="filterPath"></a>

## filterPath(compiledFilter, fullPath) ⇒ <code>boolean</code>
Returns false if the given path matches any of the exclusion globs in the given filter. Returns true

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| compiledFilter | <code>object</code> | 'Compiled' filter object as returned by compile(), or null to no-op |
| fullPath | <code>string</code> |  |

<a name="filterFileList"></a>

## filterFileList(compiledFilter, files) ⇒ <code>Array.&lt;File&gt;</code>
Returns a copy of 'files' filtered to just those that don't match any of the exclusion globs in the filter.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| compiledFilter | <code>object</code> | 'Compiled' filter object as returned by compile(), or null to no-op |
| files | <code>Array.&lt;File&gt;</code> |  |

<a name="getPathsMatchingFilter"></a>

## getPathsMatchingFilter(compiledFilter, An) ⇒ <code>Array.&lt;string&gt;</code>
Returns a copy of 'file path' strings that match any of the exclusion globs in the filter.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| compiledFilter | <code>object</code> | 'Compiled' filter object as returned by compile(), or null to no-op |
| An | <code>Array.&lt;string&gt;</code> | array with a list of full file paths that matches atleast one of the filter. |

<a name="createFilterPicker"></a>

## createFilterPicker() ⇒ <code>jQueryObject</code>
Creates a UI element for selecting a filter. The picker is populated with a list of recently used filters,

**Kind**: global function  
**Returns**: <code>jQueryObject</code> - The Picker UI as a jQuery object.  
<a name="showDropdown"></a>

## showDropdown()
Allows unit tests to open the file filter dropdown list.

**Kind**: global function  
<a name="closeDropdown"></a>

## closeDropdown()
Allows unit tests to close the file filter dropdown list.

**Kind**: global function  