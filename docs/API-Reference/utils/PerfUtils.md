### Import :
```js
const PerfUtils = brackets.getModule("utils/PerfUtils")
```

<a name="_"></a>

## \_
This is a collection of utility functions for gathering performance data.

**Kind**: global variable  
<a name="enabled"></a>

## enabled : <code>boolean</code>
Flag to enable/disable performance data gathering. Default is true (enabled)

**Kind**: global variable  
<a name="perfData"></a>

## perfData
Performance data is stored in this hash object. The key is the name of thetest (passed to markStart/addMeasurement), and the value is the time, inmilliseconds, that it took to run the test. If multiple runs of the same testare made, the value is an Array with each run stored as an entry in the Array.

**Kind**: global variable  
<a name="activeTests"></a>

## activeTests
Active tests. This is a hash of all tests that have had markStart() called,but have not yet had addMeasurement() called.

**Kind**: global variable  
<a name="updatableTests"></a>

## updatableTests
Updatable tests. This is a hash of all tests that have had markStart() called,and have had updateMeasurement() called. Caller must explicitly remove testsfrom this list using finalizeMeasurement()

**Kind**: global variable  
<a name="createPerfMeasurement"></a>

## createPerfMeasurement(id, name)
Create a new PerfMeasurement key. Adds itself to the module export.Can be accessed on the module, e.g. PerfUtils.MY_PERF_KEY.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | Unique ID for this measurement name |
| name | <code>name</code> | A short name for this measurement |

<a name="markStart"></a>

## markStart(name) ⇒ <code>Object</code> \| <code>Array.&lt;Object&gt;</code>
Start a new named timer. The name should be as descriptive as possible, sincethis name will appear as an entry in the performance report.For example: "Open file: /Users/brackets/src/ProjectManager.js"Multiple timers can be opened simultaneously.Returns an opaque set of timer ids which can be stored and used for callingaddMeasurement(). Since name is often creating via concatenating strings thisreturn value allows clients to construct the name once.

**Kind**: global function  
**Returns**: <code>Object</code> \| <code>Array.&lt;Object&gt;</code> - Opaque timer id or array of timer ids.  

| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> \| <code>Array.&lt;string&gt;</code> | Single name or an Array of names. |

<a name="addMeasurement"></a>

## addMeasurement(id)
Stop a timer and add its measurements to the performance data.Multiple measurements can be stored for any given name. If there aremultiple values for a name, they are stored in an Array.If markStart() was not called for the specified timer, themeasured time is relative to app startup.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>Object</code> | Timer id. |

<a name="updateMeasurement"></a>

## updateMeasurement(id)
This function is similar to addMeasurement(), but it allows timing the*last* event, when you don't know which event will be the last one.Tests that are in the activeTests list, have not yet been added, so addmeasurements to the performance data, and move test to updatableTests list.A test is moved to the updatable list so that it no longer passes isActive().Tests that are already in the updatableTests list are updated.Caller must explicitly remove test from the updatableTests list usingfinalizeMeasurement().If markStart() was not called for the specified timer, there is no way todetermine if this is the first or subsequent call, so the measurement isnot updatable, and it is handled in addMeasurement().

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>Object</code> | Timer id. |

<a name="finalizeMeasurement"></a>

## finalizeMeasurement(id)
Remove timer from lists so next action starts a new measurementupdateMeasurement may not have been called, so timer may bein either or neither list, but should never be in both.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>Object</code> | Timer id. |

<a name="isActive"></a>

## isActive(id) ⇒ <code>boolean</code>
Returns whether a timer is active or not, where "active" means thattimer has been started with addMark(), but has not been added to perfdatawith addMeasurement().

**Kind**: global function  
**Returns**: <code>boolean</code> - Whether a timer is active or not.  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>Object</code> | Timer id. |

<a name="getValueAsString"></a>

## getValueAsString(entry, aggregateStats) ⇒ <code>String</code>
return single value, or comma separated values for an array or return aggregated values with"min value, average, max value, standard deviation"

**Kind**: global function  
**Returns**: <code>String</code> - a single value, or comma separated values in an array or                    "min(avg)max[standard deviation]" if aggregateStats is set  

| Param | Type | Description |
| --- | --- | --- |
| entry | <code>Array</code> | An array or a single value |
| aggregateStats | <code>Boolean</code> | If set, the returned value will be aggregated in the form -                                   "min(avg)max[standard deviation]" |

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
| id | <code>Object</code> | The measurement to retreive. |

<a name="getHealthReport"></a>

## getHealthReport() ⇒ <code>Object</code>
Returns the Performance metrics to be logged for health report

**Kind**: global function  
**Returns**: <code>Object</code> - An object with the health data logs to be sent  
<a name="clear"></a>

## clear()
Clear all logs including metric data and active tests.

**Kind**: global function  
