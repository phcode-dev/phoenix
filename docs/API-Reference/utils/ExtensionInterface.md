### Import :
```js
const ExtensionInterface = brackets.getModule("utils/ExtensionInterface")
```

<a name="module_utils/ExtensionInterface"></a>

## utils/ExtensionInterface
ExtensionInterface defines utility methods for communicating between extensions safely.

**Example**  
```js
**Example**  
```js

* [utils/ExtensionInterface](#module_utils/ExtensionInterface)
    * [.registerExtensionInterface(extensionInterfaceName, interfaceObject)](#module_utils/ExtensionInterface..registerExtensionInterface) : <code>function</code>
    * [.isExistsExtensionInterface(extensionInterfaceName)](#module_utils/ExtensionInterface..isExistsExtensionInterface) ⇒ <code>boolean</code>
    * [.waitAndGetExtensionInterface(extensionInterfaceName)](#module_utils/ExtensionInterface..waitAndGetExtensionInterface) ⇒ <code>Promise</code>

<a name="module_utils/ExtensionInterface..registerExtensionInterface"></a>

### utils/ExtensionInterface.registerExtensionInterface(extensionInterfaceName, interfaceObject) : <code>function</code>
Registers a named extension interface. Will overwrite if an interface of the same name is already present.

**Kind**: inner method of [<code>utils/ExtensionInterface</code>](#module_utils/ExtensionInterface)  

| Param | Type |
| --- | --- |
| extensionInterfaceName | <code>string</code> | 
| interfaceObject | <code>Object</code> | 

<a name="module_utils/ExtensionInterface..isExistsExtensionInterface"></a>

### utils/ExtensionInterface.isExistsExtensionInterface(extensionInterfaceName) ⇒ <code>boolean</code>
Returns true is an interface of the given name exists.

**Kind**: inner method of [<code>utils/ExtensionInterface</code>](#module_utils/ExtensionInterface)  

| Param | Type |
| --- | --- |
| extensionInterfaceName | <code>string</code> | 

<a name="module_utils/ExtensionInterface..waitAndGetExtensionInterface"></a>

### utils/ExtensionInterface.waitAndGetExtensionInterface(extensionInterfaceName) ⇒ <code>Promise</code>
Returns a promise that gets resolved only when an ExtensionInterface of the given name is registered. Use this

**Kind**: inner method of [<code>utils/ExtensionInterface</code>](#module_utils/ExtensionInterface)  

| Param |
| --- |
| extensionInterfaceName | 
