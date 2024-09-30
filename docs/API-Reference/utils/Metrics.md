### Import :
```js
brackets.getModule("utils/Metrics")
```

<a name="module_utils/Metrics"></a>

## utils/Metrics
The Metrics API can be used to send analytics data to track feature usage in accordance with users privacy settings.

`Status: Internal - Not to be used by third party extensions.`

### Import

**Example**  
```js
// usage within core:
const Metrics = require("utils/Metrics");

// usage within default extensions:
const Metrics = brackets.getModule("utils/Metrics");
```

* [utils/Metrics](#module_utils/Metrics)
    * [.API](#module_utils/Metrics..API)
    * [.countEvent(eventType, eventCategory, eventSubCategory, [count])](#module_utils/Metrics..countEvent) : <code>function</code>
    * [.valueEvent(eventType, eventCategory, eventSubCategory, value)](#module_utils/Metrics..valueEvent) : <code>function</code>
    * [.flushMetrics()](#module_utils/Metrics..flushMetrics)
    * [.logPerformanceTime(action, durationMs)](#module_utils/Metrics..logPerformanceTime)
    * [.EVENT_TYPE](#module_utils/Metrics..EVENT_TYPE) : <code>Object</code>

<a name="module_utils/Metrics..API"></a>

### utils/Metrics.API
This section outlines the properties and methods available in this module

**Kind**: inner property of [<code>utils/Metrics</code>](#module_utils/Metrics)  
<a name="module_utils/Metrics..countEvent"></a>

### utils/Metrics.countEvent(eventType, eventCategory, eventSubCategory, [count]) : <code>function</code>
log a numeric count >=0
To log that user clicked searchButton 5 times:
Metrics.countEvent(Metrics.EVENT_TYPE.UI, "searchButton", "click");
Metrics.countEvent(Metrics.EVENT_TYPE.UI, "searchButton", "click", 5);

**Kind**: inner method of [<code>utils/Metrics</code>](#module_utils/Metrics)  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| eventType | <code>EVENT\_TYPE</code> \| <code>string</code> |  | The kind of Event Type that needs to be logged- should be a js var compatible string. Some standard event types are available as `EVENT_TYPE`. |
| eventCategory | <code>string</code> |  | The kind of Event Category that needs to be logged- should be a js var compatible string |
| eventSubCategory | <code>string</code> |  | The kind of Event Sub Category that needs to be logged- should be a js var compatible string |
| [count] | <code>number</code> | <code>1</code> | >=0 , optional, if not set defaults to 1 |

<a name="module_utils/Metrics..valueEvent"></a>

### utils/Metrics.valueEvent(eventType, eventCategory, eventSubCategory, value) : <code>function</code>
log a numeric value (number).
To log that startup time is 200ms:
Metrics.valueEvent(Metrics.EVENT_TYPE.PERFORMANCE, "startupTime", "ms", 200);

**Kind**: inner method of [<code>utils/Metrics</code>](#module_utils/Metrics)  

| Param | Type | Description |
| --- | --- | --- |
| eventType | <code>EVENT\_TYPE</code> \| <code>string</code> | The kind of Event Type that needs to be logged- should be a js var compatible string. some standard event types are available as `EVENT_TYPE`. |
| eventCategory | <code>string</code> | The kind of Event Category that needs to be logged- should be a js var compatible string |
| eventSubCategory | <code>string</code> | The kind of Event Sub Category that needs to be logged- should be a js var compatible string |
| value | <code>number</code> |  |

<a name="module_utils/Metrics..flushMetrics"></a>

### utils/Metrics.flushMetrics()
Send all pending metrics, useful before app quit.
Will never throw Error.

**Kind**: inner method of [<code>utils/Metrics</code>](#module_utils/Metrics)  
<a name="module_utils/Metrics..logPerformanceTime"></a>

### utils/Metrics.logPerformanceTime(action, durationMs)
Logs the performance time taken for a specific action.

**Kind**: inner method of [<code>utils/Metrics</code>](#module_utils/Metrics)  

| Param | Type | Description |
| --- | --- | --- |
| action | <code>string</code> | The key representing the action being measured (e.g., 'startupTime'). |
| durationMs | <code>number</code> | The duration of the action in milliseconds. |

<a name="module_utils/Metrics..EVENT_TYPE"></a>

### utils/Metrics.EVENT\_TYPE : <code>Object</code>
The Type of events that can be specified as an `eventType` in the API calls.

### Properties
`PLATFORM`, `PROJECT`, `THEMES`, `EXTENSIONS`, `EXTENSIONS`, `UI`, `UI_DIALOG`, `UI_BOTTOM_PANEL`,
`UI_SIDE_PANEL`, `LIVE_PREVIEW`, `CODE_HINTS`, `EDITOR`, `SEARCH`, `SHARING`, `PERFORMANCE`, `NEW_PROJECT`

**Kind**: inner typedef of [<code>utils/Metrics</code>](#module_utils/Metrics)  
