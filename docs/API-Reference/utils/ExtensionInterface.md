### Import :
```js
brackets.getModule("utils/ExtensionInterface")
```

<a name="module_utils/ExtensionInterface"></a>

## utils/ExtensionInterface
ExtensionInterface defines utility methods for communicating between extensions safely.
A global `window.ExtensionInterface` object is made available in phoenix that can be called anytime after AppStart.

## Usage
For Eg. You may have two extensions installed say `angular` extension which has to call functions made available by
`angular-cli` Extension.

For Making this possible, the `angular-cli` extension makes a named interface available with the ExtensionInterface
module and `angular` extension can get hold of the interface as and when the extension gets loaded.

**Example**  
```js
// in angular-cli extension, make a file say cli-interface.js module within the extension, do the following:
const ExtensionInterface = brackets.getModule("utils/ExtensionInterface"),
// You can replace exports with any object you want to expose outside the extension really.
ExtensionInterface.registerExtensionInterface("angularCli", exports);
```
Once the interface is registered, the angular extension can get hold of the interface with the following code
(inside or outside the extension) by using:
**Example**  
```js
let angularCli;
ExtensionInterface.waitAndGetExtensionInterface("angularCli").then(interfaceObj=> angularCli = interfaceObj);
if(angularCli){ // check if angular cli is avilable
angularCli.callSomeFunction();
}
```

**Note** that the `angularCli` interface is async populated as and when the cli extension is loaded and the
interface made available.

**NBB:** Do Not use `await waitAndGetExtensionInterface` on tol level require as the module loading might fail.

* [utils/ExtensionInterface](#module_utils/ExtensionInterface)
    * [.registerExtensionInterface(extensionInterfaceName, interfaceObject)](#module_utils/ExtensionInterface..registerExtensionInterface) : <code>function</code>
    * [.isExistsExtensionInterface(extensionInterfaceName)](#module_utils/ExtensionInterface..isExistsExtensionInterface) ⇒ <code>boolean</code>
    * [.waitAndGetExtensionInterface(extensionInterfaceName)](#module_utils/ExtensionInterface..waitAndGetExtensionInterface) ⇒ <code>Promise</code>

<a name="module_utils/ExtensionInterface..registerExtensionInterface"></a>

### utils/ExtensionInterface.registerExtensionInterface(extensionInterfaceName, interfaceObject) : <code>function</code>
Registers a named extension interface. Will overwrite if an interface of the same name is already present.

To register an interface `angularCli`
ExtensionInterface.registerExtensionInterface("angularCli", exports);

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
getter to get hold of extensions interface predictably.

To get a registered interface `angularCli`
```js
let angularCli;
ExtensionInterface.waitAndGetExtensionInterface("angularCli").then(interfaceObj=> angularCli = interfaceObj);
if(angularCli){ // check if angular cli is avilable
angularCli.callSomeFunction();
}
```

**Kind**: inner method of [<code>utils/ExtensionInterface</code>](#module_utils/ExtensionInterface)  

| Param |
| --- |
| extensionInterfaceName | 

