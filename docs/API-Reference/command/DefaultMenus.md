### Import :
```js
const DefaultMenus = brackets.getModule("command/DefaultMenus")
```

<a name="AppInit"></a>

## AppInit
Initializes the default brackets menu items.

**Kind**: global variable  
<a name="_setContextMenuItemsVisible"></a>

## \_setContextMenuItemsVisible(enabled, items)
Disables menu items present in items if enabled is true.enabled is true if file is saved and present on user system.

**Kind**: global function  

| Param | Type |
| --- | --- |
| enabled | <code>boolean</code> | 
| items | <code>array</code> | 

<a name="_setMenuItemsVisible"></a>

## \_setMenuItemsVisible()
Checks if file saved and present on system anddisables menu items accordingly

**Kind**: global function  
