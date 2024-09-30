### Import :
```js
brackets.getModule("utils/FeatureGate")
```

<a name="module_utils/FeatureGate"></a>

## utils/FeatureGate
FeatureGate defines util methods for enabling or disabling features in development based on a flag in local storage.
A global `window.FeatureGate` object is made available in phoenix that can be called anytime after AppStart.

## Usage
For Eg. You may have an extensions in development that colors phoenix in red. But you are working on a new feature
that makes other colors available, but not yet ready for use. So put the extension behind a named feature gate
so that only people who want to test the extension will be able to use it.

### creating a feature gate

**Example**  
```js
// within extensions
const FeatureGate = brackets.getModule("utils/FeatureGate"); // replace with `require` for core modules.
const FEATURE_NEW_COLORS = 'myExtension.newColors';
FeatureGate.registerFeatureGate(FEATURE_NEW_COLORS, false); // false is the default value
```

### checking if a feature is gated
Once the feature is registered, use the below code to check if the feature can be safely enabled. For Eg., if
you want to enable fancy colors based on the example above:
**Example**  
```js
if(FeatureGate.isFeatureEnabled(FEATURE_NEW_COLORS)){
   // do fancy colors here
}
```
### Enabling features for testing
1. Open developer tools > local storage
2. Add a new key with the key you have specified for the feature gate.
   In the above Eg., the key is `myExtension.newColors`
3. set the value in local storage to `enabled` to enable the feature or anything else to disable.

* [utils/FeatureGate](#module_utils/FeatureGate)
    * [.registerFeatureGate(featureName, enabledDefault)](#module_utils/FeatureGate..registerFeatureGate) : <code>function</code>
    * [.getAllRegisteredFeatures()](#module_utils/FeatureGate..getAllRegisteredFeatures) ⇒ <code>Array.&lt;string&gt;</code>
    * [.isFeatureEnabled(featureName)](#module_utils/FeatureGate..isFeatureEnabled) ⇒ <code>boolean</code>
    * [.setFeatureEnabled(featureName, isEnabled)](#module_utils/FeatureGate..setFeatureEnabled)

<a name="module_utils/FeatureGate..registerFeatureGate"></a>

### utils/FeatureGate.registerFeatureGate(featureName, enabledDefault) : <code>function</code>
Registers a named feature with the default enabled state.
To register a feature gate with name `myExtension.newColors`
const FEATURE_NEW_COLORS = 'myExtension.newColors';
FeatureGate.registerFeatureGate(FEATURE_NEW_COLORS, false); // false is the default value here

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
To check if the feature `myExtension.newColors` is enabled
const FEATURE_NEW_COLORS = 'myExtension.newColors';
if(FeatureGate.isFeatureEnabled(FEATURE_NEW_COLORS)){
   // do fancy colors here
}

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

