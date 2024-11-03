### Import :
```js
const PerfUtils = brackets.getModule("utils/PerfUtils")
```

<a name="_"></a>

## \_
This is a collection of utility functions for gathering performance data.

**Kind**: global variable  
<a name="createPerfMeasurement"></a>

## createPerfMeasurement(id, name)
Create a new PerfMeasurement key. Adds itself to the module export.
Can be accessed on the module, e.g. PerfUtils.MY_PERF_KEY.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | Unique ID for this measurement name |
| name | <code>name</code> | A short name for this measurement |

<a name="markStart"></a>

## markStart(name) ⇒ <code>Object</code> \| <code>Array.&lt;Object&gt;</code>
Start a new named timer. The name should be as descriptive as possible, since
this name will appear as an entry in the performance report.
For example: "Open file: /Users/brackets/src/ProjectManager.js"

Multiple timers can be opened simultaneously.

Returns an opaque set of timer ids which can be stored and used for calling
addMeasurement(). Since name is often creating via concatenating strings this
return value allows clients to construct the name once.

**Kind**: global function  
**Returns**: <code>Object</code> \| <code>Array.&lt;Object&gt;</code> - Opaque timer id or array of timer ids.  

| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> \| <code>Array.&lt;string&gt;</code> | Single name or an Array of names. |

<a name="addMeasurement"></a>

## addMeasurement(id)
Stop a timer and add its measurements to the performance data.

Multiple measurements can be stored for any given name. If there are
multiple values for a name, they are stored in an Array.

If markStart() was not called for the specified timer, the
measured time is relative to app startup.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>Object</code> | Timer id. |

<a name="updateMeasurement"></a>

## updateMeasurement(id)
This function is similar to addMeasurement(), but it allows timing the
*last* event, when you don't know which event will be the last one.

Tests that are in the activeTests list, have not yet been added, so add
measurements to the performance data, and move test to updatableTests list.
A test is moved to the updatable list so that it no longer passes isActive().

Tests that are already in the updatableTests list are updated.

Caller must explicitly remove test from the updatableTests list using
finalizeMeasurement().

If markStart() was not called for the specified timer, there is no way to
determine if this is the first or subsequent call, so the measurement is
not updatable, and it is handled in addMeasurement().

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>Object</code> | Timer id. |

<a name="finalizeMeasurement"></a>

## finalizeMeasurement(id)
Remove timer from lists so next action starts a new measurement

updateMeasurement may not have been called, so timer may be
in either or neither list, but should never be in both.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>Object</code> | Timer id. |

<a name="isActive"></a>

## isActive(id) ⇒ <code>boolean</code>
Returns whether a timer is active or not, where "active" means that
timer has been started with addMark(), but has not been added to perfdata
with addMeasurement().

**Kind**: global function  
**Returns**: <code>boolean</code> - Whether a timer is active or not.  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>Object</code> | Timer id. |

<a name="getDelimitedPerfData"></a>

## getDelimitedPerfData() ⇒ <code>string</code>
Returns the performance data as a tab delimited string

**Kind**: global function  
<a name="getData"></a>

## getData(id)
Returns the measured value for the given measurement name.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>Object</code> | The measurement to retrieve. |

<a name="getHealthReport"></a>

## getHealthReport() ⇒ <code>Object</code>
Returns the Performance metrics to be logged for health report

**Kind**: global function  
**Returns**: <code>Object</code> - An object with the health data logs to be sent  
<a name="searchData"></a>

## searchData(regExp) ⇒ <code>Array</code>
To search data given the regular expression

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| regExp | <code>RegExp</code> | the regular expression |

<a name="clear"></a>

## clear()
Clear all logs including metric data and active tests.

**Kind**: global function  
