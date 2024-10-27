### Import :
```js
const WorkingSetSort = brackets.getModule("project/WorkingSetSort")
```

<a name="Commands"></a>

## Commands
Manages the workingSetList sort methods.

**Kind**: global variable  
<a name="get"></a>

## get(command) ⇒ [<code>Sort</code>](#new_Sort_new)
Retrieves a Sort object by id

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| command | <code>string</code> \| <code>Command</code> | A command ID or a command object. |

<a name="getAutomatic"></a>

## getAutomatic() ⇒ <code>boolean</code>
**Kind**: global function  
**Returns**: <code>boolean</code> - Enabled state of Automatic Sort.  
<a name="setAutomatic"></a>

## setAutomatic(enable)
Enables/Disables Automatic Sort depending on the value.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| enable | <code>boolean</code> | True to enable, false to disable. |

<a name="register"></a>

## register(command, compareFn, events) ⇒ [<code>Sort</code>](#new_Sort_new)
Registers a working set sort method.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| command | <code>string</code> \| <code>Command</code> | A command ID or a command object |
| compareFn | <code>function</code> | The function that      will be used inside JavaScript's sort function. The return a value      should be >0 (sort a to a lower index than b), =0 (leaves a and b      unchanged with respect to each other) or < 0 (sort b to a lower index      than a) and must always returns the same value when given a specific      pair of elements a and b as its two arguments. Documentation at:      https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/sort |
| events | <code>string</code> | One or more space-separated event types that      DocumentManger uses. Each event passed will trigger the automatic      sort. If no events are passed, the automatic sort will be disabled      for that sort method. |

