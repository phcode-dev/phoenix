

# Metrics API
The Metrics API can be used to send analytics data to track feature usage in accordance with users privacy settings.

`Status: Internal - Not to be used by third party extensions.`

## Import
```js
// usage within core:
const Metrics = require("utils/Metrics");

// usage within default extensions:
const Metrics = brackets.getModule("utils/Metrics");
```

## APIs
Two main APIs are available

### Metrics.countEvent
log a numeric count >=0

@param {string} eventType The kind of Event Type that needs to be logged- should be a js var compatible string
@param {string} eventCategory The kind of Event Category that
needs to be logged- should be a js var compatible string
@param {string} eventSubCategory The kind of Event Sub Category that
needs to be logged- should be a js var compatible string
@param {number} count >=0

### Metrics.valueEvent
log a numeric value (number).

@param {string} eventType The kind of Event Type that needs to be logged- should be a js var compatible string
@param {string} eventCategory The kind of Event Category that
needs to be logged- should be a js var compatible string
@param {string} eventSubCategory The kind of Event Sub Category that
needs to be logged- should be a js var compatible string
@param {number} value