### Import :
```js
const Global = brackets.getModule("utils/Global")
```

<a name="configJSON"></a>

## configJSON
Initializes the global "brackets" variable and it's properties.Modules should not access the global.brackets object until either(a) the module requires this module, i.e. require("utils/Global") or(b) the module receives a "appReady" callback from the utils/AppReady module.

**Kind**: global variable  
