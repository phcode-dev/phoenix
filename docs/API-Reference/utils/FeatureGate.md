### Import :
```js
const FeatureGate = brackets.getModule("utils/FeatureGate")
```

<a name="module_utils/FeatureGate"></a>

## utils/FeatureGate
FeatureGate defines util methods for enabling or disabling features in development based on a flag in local storage.

**Example**  
```js
**Example**  
```js

* [utils/FeatureGate](#module_utils/FeatureGate)
    * [.registerFeatureGate(featureName, enabledDefault)](#module_utils/FeatureGate..registerFeatureGate) : <code>function</code>
    * [.getAllRegisteredFeatures()](#module_utils/FeatureGate..getAllRegisteredFeatures) ⇒ <code>Array.&lt;string&gt;</code>
    * [.isFeatureEnabled(featureName)](#module_utils/FeatureGate..isFeatureEnabled) ⇒ <code>boolean</code>
    * [.setFeatureEnabled(featureName, isEnabled)](#module_utils/FeatureGate..setFeatureEnabled)

<a name="module_utils/FeatureGate..registerFeatureGate"></a>

### utils/FeatureGate.registerFeatureGate(featureName, enabledDefault) : <code>function</code>
Registers a named feature with the default enabled state.

**Kind**: inner method of [<code>utils/FeatureGate</code>](#module_utils/FeatureGate)  

| Param | Type |
| --- | --- |
| featureName | <code>string</code> | 
| enabledDefault | <code>boolean</code> | 

<a name="module_utils/FeatureGate..getAllRegisteredFeatures"></a>

### utils/FeatureGate.getAllRegisteredFeatures() ⇒ <code>Array.&lt;string&gt;</code>
Returns an array of all named registered feature gates.

**Kind**: inner method of [<code>utils/FeatureGate</code>](#module_utils/FeatureGate)  
**Returns**: <code>Array.&lt;string&gt;</code> - list of registered features  
<a name="module_utils/FeatureGate..isFeatureEnabled"></a>

### utils/FeatureGate.isFeatureEnabled(featureName) ⇒ <code>boolean</code>
Returns true is an featureGate is enabled either by default or overridden by the user using local storage.

**Kind**: inner method of [<code>utils/FeatureGate</code>](#module_utils/FeatureGate)  

| Param | Type |
| --- | --- |
| featureName | <code>string</code> | 

<a name="module_utils/FeatureGate..setFeatureEnabled"></a>

### utils/FeatureGate.setFeatureEnabled(featureName, isEnabled)
Sets the enabled state of a specific feature in the application.

**Kind**: inner method of [<code>utils/FeatureGate</code>](#module_utils/FeatureGate)  

| Param | Type | Description |
| --- | --- | --- |
| featureName | <code>string</code> | The name of the feature to be modified. |
| isEnabled | <code>boolean</code> | A boolean flag indicating whether the feature should be enabled (true) or disabled (false). |
