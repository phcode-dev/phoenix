### Import :
```js
const WorkingSetSort = brackets.getModule("project/WorkingSetSort")
```

<a name="Sort"></a>

## Sort
**Kind**: global class  

* [Sort](#Sort)
    * [new Sort(commandID, compareFn, events)](#new_Sort_new)
    * [.getCommandID()](#Sort+getCommandID) ⇒ <code>string</code>
    * [.getCompareFn()](#Sort+getCompareFn) ⇒ <code>function</code>
    * [.getEvents()](#Sort+getEvents) ⇒ <code>string</code>
    * [.setChecked(value)](#Sort+setChecked)
    * [.execute()](#Sort+execute)
    * [.sort()](#Sort+sort)

<a name="new_Sort_new"></a>

### new Sort(commandID, compareFn, events)

| Param | Type | Description |
| --- | --- | --- |
| commandID | <code>string</code> | A valid command identifier. |
| compareFn | <code>function</code> | A valid sort      function (see register for a longer explanation). |
| events | <code>string</code> | Space-separated WorkingSetSort possible events      ending with ".sort". |

<a name="Sort+getCommandID"></a>

### sort.getCommandID() ⇒ <code>string</code>
The Command ID

**Kind**: instance method of [<code>Sort</code>](#Sort)  
<a name="Sort+getCompareFn"></a>

### sort.getCompareFn() ⇒ <code>function</code>
The compare function

**Kind**: instance method of [<code>Sort</code>](#Sort)  
<a name="Sort+getEvents"></a>

### sort.getEvents() ⇒ <code>string</code>
Gets the event that this sort object is listening to

**Kind**: instance method of [<code>Sort</code>](#Sort)  
<a name="Sort+setChecked"></a>

### sort.setChecked(value)
Checks/Unchecks the command which will show a check in the menu

**Kind**: instance method of [<code>Sort</code>](#Sort)  

| Param | Type |
| --- | --- |
| value | <code>boolean</code> | 

<a name="Sort+execute"></a>

### sort.execute()
Performs the sort and makes it the current sort method.

**Kind**: instance method of [<code>Sort</code>](#Sort)  
<a name="Sort+sort"></a>

### sort.sort()
Only performs the working set sort if this is the current sort.

**Kind**: instance method of [<code>Sort</code>](#Sort)  
<a name="Commands"></a>

## Commands
Manages the workingSetList sort methods.

**Kind**: global variable  
<a name="get"></a>

## get(command) ⇒ [<code>Sort</code>](#Sort)
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

## register(command, compareFn, events) ⇒ [<code>Sort</code>](#Sort)
Registers a working set sort method.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| command | <code>string</code> \| <code>Command</code> | A command ID or a command object |
| compareFn | <code>function</code> | The function that      will be used inside JavaScript's sort function. The return a value      should be >0 (sort a to a lower index than b), =0 (leaves a and b      unchanged with respect to each other) or < 0 (sort b to a lower index      than a) and must always returns the same value when given a specific      pair of elements a and b as its two arguments. Documentation at:      https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/sort |
| events | <code>string</code> | One or more space-separated event types that      DocumentManger uses. Each event passed will trigger the automatic      sort. If no events are passed, the automatic sort will be disabled      for that sort method. |

