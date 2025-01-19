### Import :
```js
const Menus = brackets.getModule("command/Menus")
```

<a name="MenuItem"></a>

## MenuItem
**Kind**: global class  

* [MenuItem](#MenuItem)
    * [new MenuItem(id, command, [options])](#new_MenuItem_new)
    * [.getCommand()](#MenuItem+getCommand) ⇒ <code>Command</code>
    * [.getParentMenu()](#MenuItem+getParentMenu) ⇒ [<code>Menu</code>](#Menu)

<a name="new_MenuItem_new"></a>

### new MenuItem(id, command, [options])
MenuItem represents a single menu item that executes a Command or a menu divider. MenuItems
may have a sub-menu. A MenuItem may correspond to an HTML-based
menu item or a native menu item if Brackets is running in a native application shell

Since MenuItems may have a native implementation clients should create MenuItems through
addMenuItem() and should NOT construct a MenuItem object directly.
Clients should also not access HTML content of a menu directly and instead use
the MenuItem API to query and modify menus items.

MenuItems are views on to Command objects so modify the underlying Command to modify the
name, enabled, and checked state of a MenuItem. The MenuItem will update automatically


| Param | Type | Description |
| --- | --- | --- |
| id | <code>string</code> |  |
| command | <code>string</code> \| <code>Command</code> | the Command this MenuItem will reflect.                                   Use DIVIDER to specify a menu divider |
| [options] |  |  |
| options.hideWhenCommandDisabled | <code>boolean</code> | will not show the menu item if command is disabled. |

<a name="MenuItem+getCommand"></a>

### menuItem.getCommand() ⇒ <code>Command</code>
Gets the Command associated with a MenuItem

**Kind**: instance method of [<code>MenuItem</code>](#MenuItem)  
<a name="MenuItem+getParentMenu"></a>

### menuItem.getParentMenu() ⇒ [<code>Menu</code>](#Menu)
Returns the parent Menu for this MenuItem

**Kind**: instance method of [<code>MenuItem</code>](#MenuItem)  
<a name="Menu"></a>

## Menu
**Kind**: global class  

* [Menu](#Menu)
    * [new Menu(id)](#new_Menu_new)
    * [.removeMenuItem(command)](#Menu+removeMenuItem)
    * [.removeMenuDivider(menuItemID)](#Menu+removeMenuDivider)
    * [.addMenuItem(command, [keyBindings], [position], [relativeID], [options])](#Menu+addMenuItem) ⇒ [<code>MenuItem</code>](#MenuItem)
    * [.addMenuDivider(position, relativeID)](#Menu+addMenuDivider) ⇒ [<code>MenuItem</code>](#MenuItem)
    * [.addSubMenu(name, id, position, relativeID)](#Menu+addSubMenu) ⇒ [<code>Menu</code>](#Menu)
    * [.removeSubMenu(subMenuID)](#Menu+removeSubMenu)
    * [.closeSubMenu()](#Menu+closeSubMenu)

<a name="new_Menu_new"></a>

### new Menu(id)
Menu represents a top-level menu in the menu bar. A Menu may correspond to an HTML-based
menu or a native menu if Brackets is running in a native application shell.

Since menus may have a native implementation clients should create Menus through
addMenu() and should NOT construct a Menu object directly.
Clients should also not access HTML content of a menu directly and instead use
the Menu API to query and modify menus.


| Param | Type |
| --- | --- |
| id | <code>string</code> | 

<a name="Menu+removeMenuItem"></a>

### menu.removeMenuItem(command)
Removes the specified menu item from this Menu. Key bindings are unaffected; use KeyBindingManager
directly to remove key bindings if desired.

**Kind**: instance method of [<code>Menu</code>](#Menu)  

| Param | Type | Description |
| --- | --- | --- |
| command | <code>string</code> \| <code>Command</code> | command the menu would execute if we weren't deleting it. |

<a name="Menu+removeMenuDivider"></a>

### menu.removeMenuDivider(menuItemID)
Removes the specified menu divider from this Menu.

**Kind**: instance method of [<code>Menu</code>](#Menu)  

| Param | Type | Description |
| --- | --- | --- |
| menuItemID | <code>string</code> | the menu item id of the divider to remove. |

<a name="Menu+addMenuItem"></a>

### menu.addMenuItem(command, [keyBindings], [position], [relativeID], [options]) ⇒ [<code>MenuItem</code>](#MenuItem)
Adds a new menu item with the specified id and display text. The insertion position is
specified via the relativeID and position arguments which describe a position
relative to another MenuItem or MenuGroup. It is preferred that plug-ins
insert new  MenuItems relative to a menu section rather than a specific
MenuItem (see Menu Section Constants).

TODO: Sub-menus are not yet supported, but when they are implemented this API will
allow adding new MenuItems to sub-menus as well.

Note, keyBindings are bound to Command objects not MenuItems. The provided keyBindings
     will be bound to the supplied Command object rather than the MenuItem.

**Kind**: instance method of [<code>Menu</code>](#Menu)  
**Returns**: [<code>MenuItem</code>](#MenuItem) - the newly created MenuItem  

| Param | Type | Description |
| --- | --- | --- |
| command | <code>string</code> \| <code>Command</code> | the command the menu will execute.      Pass Menus.DIVIDER for a menu divider, or just call addMenuDivider() instead. |
| [keyBindings] | <code>string</code> \| <code>Object</code> | Register one or more key bindings to associate with the supplied command |
| [position] | <code>string</code> | constant defining the position of new MenuItem relative to      other MenuItems. Values:          - With no relativeID, use Menus.FIRST or LAST (default is LAST)          - Relative to a command id, use BEFORE or AFTER (required)          - Relative to a MenuSection, use FIRST_IN_SECTION or LAST_IN_SECTION (required) |
| [relativeID] | <code>string</code> | command id OR one of the MenuSection.* constants. Required      for all position constants except FIRST and LAST. |
| [options] |  |  |
| options.hideWhenCommandDisabled | <code>boolean</code> | will not show the menu item if command is disabled. Helps to   clear the clutter on greyed out menu items if not applicable to context. |

<a name="Menu+addMenuDivider"></a>

### menu.addMenuDivider(position, relativeID) ⇒ [<code>MenuItem</code>](#MenuItem)
Inserts divider item in menu.

**Kind**: instance method of [<code>Menu</code>](#Menu)  
**Returns**: [<code>MenuItem</code>](#MenuItem) - the newly created divider  

| Param | Type | Description |
| --- | --- | --- |
| position | <code>string</code> | constant defining the position of new the divider relative      to other MenuItems. Default is LAST.  (see Insertion position constants). |
| relativeID | <code>string</code> | id of menuItem, sub-menu, or menu section that the new      divider will be positioned relative to. Required for all position constants      except FIRST and LAST |

<a name="Menu+addSubMenu"></a>

### menu.addSubMenu(name, id, position, relativeID) ⇒ [<code>Menu</code>](#Menu)
Creates a new submenu and a menuItem and adds the menuItem of the submenu
to the menu and returns the submenu.

A submenu will have the same structure of a menu with a additional field
parentMenuItem which has the reference of the submenu's parent menuItem.
A submenu will raise the following events:
- beforeSubMenuOpen
- beforeSubMenuClose

Note, This function will create only a context submenu.

TODO: Make this function work for Menus

**Kind**: instance method of [<code>Menu</code>](#Menu)  
**Returns**: [<code>Menu</code>](#Menu) - the newly created submenu  

| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> | displayed in menu item of the submenu |
| id | <code>string</code> |  |
| position | <code>string</code> | constant defining the position of new MenuItem of the submenu relative to      other MenuItems. Values:          - With no relativeID, use Menus.FIRST or LAST (default is LAST)          - Relative to a command id, use BEFORE or AFTER (required)          - Relative to a MenuSection, use FIRST_IN_SECTION or LAST_IN_SECTION (required) |
| relativeID | <code>string</code> | command id OR one of the MenuSection.* constants. Required      for all position constants except FIRST and LAST. |

<a name="Menu+removeSubMenu"></a>

### menu.removeSubMenu(subMenuID)
Removes the specified submenu from this Menu.

Note, this function will only remove context submenus

TODO: Make this function work for Menus

**Kind**: instance method of [<code>Menu</code>](#Menu)  

| Param | Type | Description |
| --- | --- | --- |
| subMenuID | <code>string</code> | the menu id of the submenu to remove. |

<a name="Menu+closeSubMenu"></a>

### menu.closeSubMenu()
Closes the submenu if the menu has a submenu open.

**Kind**: instance method of [<code>Menu</code>](#Menu)  
<a name="ContextMenu"></a>

## ContextMenu ⇐ [<code>Menu</code>](#Menu)
**Kind**: global class  
**Extends**: [<code>Menu</code>](#Menu)  

* [ContextMenu](#ContextMenu) ⇐ [<code>Menu</code>](#Menu)
    * [new ContextMenu()](#new_ContextMenu_new)
    * _instance_
        * [.open(mouseOrLocation)](#ContextMenu+open)
        * [.close()](#ContextMenu+close)
        * [.isOpen()](#ContextMenu+isOpen)
        * [.removeMenuItem(command)](#Menu+removeMenuItem)
        * [.removeMenuDivider(menuItemID)](#Menu+removeMenuDivider)
        * [.addMenuItem(command, [keyBindings], [position], [relativeID], [options])](#Menu+addMenuItem) ⇒ [<code>MenuItem</code>](#MenuItem)
        * [.addMenuDivider(position, relativeID)](#Menu+addMenuDivider) ⇒ [<code>MenuItem</code>](#MenuItem)
        * [.addSubMenu(name, id, position, relativeID)](#Menu+addSubMenu) ⇒ [<code>Menu</code>](#Menu)
        * [.removeSubMenu(subMenuID)](#Menu+removeSubMenu)
        * [.closeSubMenu()](#Menu+closeSubMenu)
    * _static_
        * [.assignContextMenuToSelector()](#ContextMenu.assignContextMenuToSelector)

<a name="new_ContextMenu_new"></a>

### new ContextMenu()
Represents a context menu that can open at a specific location in the UI.

Clients should not create this object directly and should instead use registerContextMenu()
to create new ContextMenu objects.

Context menus in brackets may be HTML-based or native so clients should not reach into
the HTML and should instead manipulate ContextMenus through the API.

Events:
- beforeContextMenuOpen
- beforeContextMenuClose

<a name="ContextMenu+open"></a>

### contextMenu.open(mouseOrLocation)
Displays the ContextMenu at the specified location and dispatches the
"beforeContextMenuOpen" event or "beforeSubMenuOpen" event (for submenus).
The menu location may be adjusted to prevent clipping by the browser window.
All other menus and ContextMenus will be closed before a new menu
will be closed before a new menu is shown (if the new menu is not
a submenu).

In case of submenus, the parentMenu of the submenu will not be closed when the
sub menu is open.

**Kind**: instance method of [<code>ContextMenu</code>](#ContextMenu)  

| Param | Type | Description |
| --- | --- | --- |
| mouseOrLocation | <code>MouseEvent</code> \| <code>Object</code> | pass a MouseEvent      to display the menu near the mouse or pass in an object with page x/y coordinates      for a specific location.This paramter is not used for submenus. Submenus are always      displayed at a position relative to the parent menu. |

<a name="ContextMenu+close"></a>

### contextMenu.close()
Closes the context menu.

**Kind**: instance method of [<code>ContextMenu</code>](#ContextMenu)  
<a name="ContextMenu+isOpen"></a>

### contextMenu.isOpen()
Detect if current context menu is already open

**Kind**: instance method of [<code>ContextMenu</code>](#ContextMenu)  
<a name="Menu+removeMenuItem"></a>

### contextMenu.removeMenuItem(command)
Removes the specified menu item from this Menu. Key bindings are unaffected; use KeyBindingManager
directly to remove key bindings if desired.

**Kind**: instance method of [<code>ContextMenu</code>](#ContextMenu)  

| Param | Type | Description |
| --- | --- | --- |
| command | <code>string</code> \| <code>Command</code> | command the menu would execute if we weren't deleting it. |

<a name="Menu+removeMenuDivider"></a>

### contextMenu.removeMenuDivider(menuItemID)
Removes the specified menu divider from this Menu.

**Kind**: instance method of [<code>ContextMenu</code>](#ContextMenu)  

| Param | Type | Description |
| --- | --- | --- |
| menuItemID | <code>string</code> | the menu item id of the divider to remove. |

<a name="Menu+addMenuItem"></a>

### contextMenu.addMenuItem(command, [keyBindings], [position], [relativeID], [options]) ⇒ [<code>MenuItem</code>](#MenuItem)
Adds a new menu item with the specified id and display text. The insertion position is
specified via the relativeID and position arguments which describe a position
relative to another MenuItem or MenuGroup. It is preferred that plug-ins
insert new  MenuItems relative to a menu section rather than a specific
MenuItem (see Menu Section Constants).

TODO: Sub-menus are not yet supported, but when they are implemented this API will
allow adding new MenuItems to sub-menus as well.

Note, keyBindings are bound to Command objects not MenuItems. The provided keyBindings
     will be bound to the supplied Command object rather than the MenuItem.

**Kind**: instance method of [<code>ContextMenu</code>](#ContextMenu)  
**Returns**: [<code>MenuItem</code>](#MenuItem) - the newly created MenuItem  

| Param | Type | Description |
| --- | --- | --- |
| command | <code>string</code> \| <code>Command</code> | the command the menu will execute.      Pass Menus.DIVIDER for a menu divider, or just call addMenuDivider() instead. |
| [keyBindings] | <code>string</code> \| <code>Object</code> | Register one or more key bindings to associate with the supplied command |
| [position] | <code>string</code> | constant defining the position of new MenuItem relative to      other MenuItems. Values:          - With no relativeID, use Menus.FIRST or LAST (default is LAST)          - Relative to a command id, use BEFORE or AFTER (required)          - Relative to a MenuSection, use FIRST_IN_SECTION or LAST_IN_SECTION (required) |
| [relativeID] | <code>string</code> | command id OR one of the MenuSection.* constants. Required      for all position constants except FIRST and LAST. |
| [options] |  |  |
| options.hideWhenCommandDisabled | <code>boolean</code> | will not show the menu item if command is disabled. Helps to   clear the clutter on greyed out menu items if not applicable to context. |

<a name="Menu+addMenuDivider"></a>

### contextMenu.addMenuDivider(position, relativeID) ⇒ [<code>MenuItem</code>](#MenuItem)
Inserts divider item in menu.

**Kind**: instance method of [<code>ContextMenu</code>](#ContextMenu)  
**Returns**: [<code>MenuItem</code>](#MenuItem) - the newly created divider  

| Param | Type | Description |
| --- | --- | --- |
| position | <code>string</code> | constant defining the position of new the divider relative      to other MenuItems. Default is LAST.  (see Insertion position constants). |
| relativeID | <code>string</code> | id of menuItem, sub-menu, or menu section that the new      divider will be positioned relative to. Required for all position constants      except FIRST and LAST |

<a name="Menu+addSubMenu"></a>

### contextMenu.addSubMenu(name, id, position, relativeID) ⇒ [<code>Menu</code>](#Menu)
Creates a new submenu and a menuItem and adds the menuItem of the submenu
to the menu and returns the submenu.

A submenu will have the same structure of a menu with a additional field
parentMenuItem which has the reference of the submenu's parent menuItem.
A submenu will raise the following events:
- beforeSubMenuOpen
- beforeSubMenuClose

Note, This function will create only a context submenu.

TODO: Make this function work for Menus

**Kind**: instance method of [<code>ContextMenu</code>](#ContextMenu)  
**Returns**: [<code>Menu</code>](#Menu) - the newly created submenu  

| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> | displayed in menu item of the submenu |
| id | <code>string</code> |  |
| position | <code>string</code> | constant defining the position of new MenuItem of the submenu relative to      other MenuItems. Values:          - With no relativeID, use Menus.FIRST or LAST (default is LAST)          - Relative to a command id, use BEFORE or AFTER (required)          - Relative to a MenuSection, use FIRST_IN_SECTION or LAST_IN_SECTION (required) |
| relativeID | <code>string</code> | command id OR one of the MenuSection.* constants. Required      for all position constants except FIRST and LAST. |

<a name="Menu+removeSubMenu"></a>

### contextMenu.removeSubMenu(subMenuID)
Removes the specified submenu from this Menu.

Note, this function will only remove context submenus

TODO: Make this function work for Menus

**Kind**: instance method of [<code>ContextMenu</code>](#ContextMenu)  

| Param | Type | Description |
| --- | --- | --- |
| subMenuID | <code>string</code> | the menu id of the submenu to remove. |

<a name="Menu+closeSubMenu"></a>

### contextMenu.closeSubMenu()
Closes the submenu if the menu has a submenu open.

**Kind**: instance method of [<code>ContextMenu</code>](#ContextMenu)  
<a name="ContextMenu.assignContextMenuToSelector"></a>

### ContextMenu.assignContextMenuToSelector()
Associate a context menu to a DOM element.
This static function take care of registering event handlers for the click event
listener and passing the right "position" object to the Context#open method

**Kind**: static method of [<code>ContextMenu</code>](#ContextMenu)  
<a name="DIVIDER"></a>

## DIVIDER
Other constants

**Kind**: global variable  
<a name="AppMenuBar"></a>

## AppMenuBar : <code>enum</code>
Brackets Application Menu Constants

**Kind**: global enum  
**Properties**

| Name | Type | Default |
| --- | --- | --- |
| FILE_MENU | <code>string</code> | <code>&quot;file-menu&quot;</code> | 
| EDIT_MENU | <code>string</code> | <code>&quot;edit-menu&quot;</code> | 
| FIND_MENU | <code>string</code> | <code>&quot;find-menu&quot;</code> | 
| VIEW_MENU | <code>string</code> | <code>&quot;view-menu&quot;</code> | 
| NAVIGATE_MENU | <code>string</code> | <code>&quot;navigate-menu&quot;</code> | 
| DEBUG_MENU | <code>string</code> | <code>&quot;debug-menu&quot;</code> | 
| HELP_MENU | <code>string</code> | <code>&quot;help-menu&quot;</code> | 

<a name="ContextMenuIds"></a>

## ContextMenuIds : <code>enum</code>
Brackets Context Menu Constants

**Kind**: global enum  
**Properties**

| Name | Type | Default |
| --- | --- | --- |
| EDITOR_MENU | <code>string</code> | <code>&quot;editor-context-menu&quot;</code> | 
| INLINE_EDITOR_MENU | <code>string</code> | <code>&quot;inline-editor-context-menu&quot;</code> | 
| PROJECT_MENU | <code>string</code> | <code>&quot;project-context-menu&quot;</code> | 
| WORKING_SET_CONTEXT_MENU | <code>string</code> | <code>&quot;workingset-context-menu&quot;</code> | 
| WORKING_SET_CONFIG_MENU | <code>string</code> | <code>&quot;workingset-configuration-menu&quot;</code> | 
| SPLITVIEW_MENU | <code>string</code> | <code>&quot;splitview-menu&quot;</code> | 

<a name="SubMenuIds"></a>

## SubMenuIds : <code>enum</code>
Brackets well known submenus

**Kind**: global enum  
**Properties**

| Name | Type | Default |
| --- | --- | --- |
| GIT_SUB_MENU | <code>string</code> | <code>&quot;git-submenu&quot;</code> | 

<a name="MenuSection"></a>

## MenuSection : <code>enum</code>
Brackets Application Menu Section Constants
It is preferred that plug-ins specify the location of new MenuItems
in terms of a menu section rather than a specific MenuItem. This provides
looser coupling to Bracket's internal MenuItems and makes menu organization
more semantic.
Use these constants as the "relativeID" parameter when calling addMenuItem() and
specify a position of FIRST_IN_SECTION or LAST_IN_SECTION.

Menu sections are denoted by dividers or the beginning/end of a menu

**Kind**: global enum  
**Properties**

| Name | Type | Default |
| --- | --- | --- |
| FILE_OPEN_CLOSE_COMMANDS | <code>string</code> | <code>&quot;FILE_OPEN_CLOSE_COMMANDS&quot;</code> | 
| FILE_SAVE_COMMANDS | <code>string</code> | <code>&quot;FILE_SAVE_COMMANDS&quot;</code> | 
| FILE_LIVE | <code>string</code> | <code>&quot;FILE_LIVE&quot;</code> | 
| FILE_SETTINGS | <code>string</code> | <code>&quot;FILE_SETTINGS&quot;</code> | 
| FILE_EXTENSION_MANAGER | <code>string</code> | <code>&quot;FILE_EXTENSION_MANAGER&quot;</code> | 
| EDIT_UNDO_REDO_COMMANDS | <code>string</code> | <code>&quot;EDIT_UNDO_REDO_COMMANDS&quot;</code> | 
| EDIT_TEXT_COMMANDS | <code>string</code> | <code>&quot;EDIT_TEXT_COMMANDS&quot;</code> | 
| EDIT_SELECTION_COMMANDS | <code>string</code> | <code>&quot;EDIT_SELECTION_COMMANDS&quot;</code> | 
| EDIT_MODIFY_SELECTION | <code>string</code> | <code>&quot;EDIT_MODIFY_SELECTION&quot;</code> | 
| EDIT_COMMENT_SELECTION | <code>string</code> | <code>&quot;EDIT_COMMENT_SELECTION&quot;</code> | 
| EDIT_CODE_HINTS_COMMANDS | <code>string</code> | <code>&quot;EDIT_CODE_HINTS_COMMANDS&quot;</code> | 
| EDIT_TOGGLE_OPTIONS | <code>string</code> | <code>&quot;EDIT_TOGGLE_OPTIONS&quot;</code> | 
| FIND_FIND_COMMANDS | <code>string</code> | <code>&quot;FIND_FIND_COMMANDS&quot;</code> | 
| FIND_FIND_IN_COMMANDS | <code>string</code> | <code>&quot;FIND_FIND_IN_COMMANDS&quot;</code> | 
| FIND_REPLACE_COMMANDS | <code>string</code> | <code>&quot;FIND_REPLACE_COMMANDS&quot;</code> | 
| VIEW_HIDESHOW_COMMANDS | <code>string</code> | <code>&quot;VIEW_HIDESHOW_COMMANDS&quot;</code> | 
| VIEW_FONTSIZE_COMMANDS | <code>string</code> | <code>&quot;VIEW_FONTSIZE_COMMANDS&quot;</code> | 
| VIEW_TOGGLE_OPTIONS | <code>string</code> | <code>&quot;VIEW_TOGGLE_OPTIONS&quot;</code> | 
| NAVIGATE_GOTO_COMMANDS | <code>string</code> | <code>&quot;NAVIGATE_GOTO_COMMANDS&quot;</code> | 
| NAVIGATE_DOCUMENTS_COMMANDS | <code>string</code> | <code>&quot;NAVIGATE_DOCUMENTS_COMMANDS&quot;</code> | 
| NAVIGATE_OS_COMMANDS | <code>string</code> | <code>&quot;NAVIGATE_OS_COMMANDS&quot;</code> | 
| NAVIGATE_QUICK_EDIT_COMMANDS | <code>string</code> | <code>&quot;NAVIGATE_QUICK_EDIT_COMMANDS&quot;</code> | 
| NAVIGATE_QUICK_DOCS_COMMANDS | <code>string</code> | <code>&quot;NAVIGATE_QUICK_DOCS_COMMANDS&quot;</code> | 

<a name="BEFORE"></a>

## BEFORE : <code>enum</code>
Insertion position constants
Used by addMenu(), addMenuItem(), and addSubMenu() to
specify the relative position of a newly created menu object

**Kind**: global enum  
<a name="getMenu"></a>

## getMenu(id) ⇒ [<code>Menu</code>](#Menu)
Retrieves the Menu object for the corresponding id.

**Kind**: global function  

| Param | Type |
| --- | --- |
| id | <code>string</code> | 

<a name="getSubMenu"></a>

## getSubMenu(id) ⇒ [<code>Menu</code>](#Menu)
Retrieves the subMenu object for the corresponding id if present.

**Kind**: global function  

| Param | Type |
| --- | --- |
| id | <code>string</code> | 

<a name="getAllMenuItemCommands"></a>

## getAllMenuItemCommands() ⇒ <code>Set.&lt;string&gt;</code>
retruns a set containing all commands that has a menu item registered

**Kind**: global function  
<a name="getAllMenus"></a>

## getAllMenus() ⇒ <code>Object.&lt;string, Menu&gt;</code>
Retrieves the map of all Menu objects.

**Kind**: global function  
<a name="getContextMenu"></a>

## getContextMenu(id) ⇒ [<code>ContextMenu</code>](#ContextMenu)
Retrieves the ContextMenu object for the corresponding id.

**Kind**: global function  

| Param | Type |
| --- | --- |
| id | <code>string</code> | 

<a name="getMenuItem"></a>

## getMenuItem(id) ⇒ [<code>MenuItem</code>](#MenuItem)
Retrieves the MenuItem object for the corresponding id.

**Kind**: global function  

| Param | Type |
| --- | --- |
| id | <code>string</code> | 

<a name="closeAll"></a>

## closeAll()
Closes all menus that are open

**Kind**: global function  
<a name="openMenu"></a>

## openMenu(id) ⇒ <code>null</code>
Opens a menu with the given id

**Kind**: global function  

| Param |
| --- |
| id | 

<a name="getOpenMenu"></a>

## getOpenMenu() ⇒ <code>null</code> \| <code>string</code>
returns the currently open menu id if present or null

**Kind**: global function  
<a name="addMenu"></a>

## addMenu(name, id, position, relativeID) ⇒ [<code>Menu</code>](#Menu)
Adds a top-level menu to the application menu bar which may be native or HTML-based.

**Kind**: global function  
**Returns**: [<code>Menu</code>](#Menu) - the newly created Menu  

| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> | display text for menu |
| id | <code>string</code> | unique identifier for a menu.      Core Menus in Brackets use a simple  title as an id, for example "file-menu".      Extensions should use the following format: "author.myextension.mymenuname". |
| position | <code>string</code> | constant defining the position of new the Menu relative  to other Menus. Default is LAST (see Insertion position constants). |
| relativeID | <code>string</code> | id of Menu the new Menu will be positioned relative to. Required      when position is AFTER or BEFORE, ignored when position is FIRST or LAST |

<a name="removeMenu"></a>

## removeMenu(id)
Removes a top-level menu from the application menu bar which may be native or HTML-based.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | unique identifier for a menu.      Core Menus in Brackets use a simple title as an id, for example "file-menu".      Extensions should use the following format: "author.myextension.mymenuname". |

<a name="registerContextMenu"></a>

## registerContextMenu(id) ⇒ [<code>ContextMenu</code>](#ContextMenu)
Registers new context menu with Brackets.
Extensions should generally use the predefined context menus built into Brackets. Use this
API to add a new context menu to UI that is specific to an extension.

After registering  a new context menu clients should:
     - use addMenuItem() to add items to the context menu
     - call open() to show the context menu.
     For example:
     ```js
     $("#my_ID").contextmenu(function (e) {
         if (e.which === 3) {
             my_cmenu.open(e);
         }
     });
     ```
To make menu items be contextual to things like selection, listen for the "beforeContextMenuOpen"
to make changes to Command objects before the context menu is shown. MenuItems are views of
Commands, which control a MenuItem's name, enabled state, and checked state.

**Kind**: global function  
**Returns**: [<code>ContextMenu</code>](#ContextMenu) - the newly created context menu  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | unique identifier for context menu.      Core context menus in Brackets use a simple title as an id.      Extensions should use the following format: "author.myextension.mycontextmenu name" |

<a name="event_EVENT_BEFORE_CONTEXT_MENU_OPEN"></a>

## "EVENT_BEFORE_CONTEXT_MENU_OPEN"
Event triggered before the context menu opens.

**Kind**: event emitted  
<a name="event_EVENT_BEFORE_CONTEXT_MENU_CLOSE"></a>

## "EVENT_BEFORE_CONTEXT_MENU_CLOSE"
Event triggered before the context menu closes.

**Kind**: event emitted  
<a name="event_EVENT_BEFORE_SUB_MENU_OPEN"></a>

## "EVENT_BEFORE_SUB_MENU_OPEN"
Event triggered before a sub-menu opens.

**Kind**: event emitted  
<a name="event_EVENT_BEFORE_SUB_MENU_CLOSE"></a>

## "EVENT_BEFORE_SUB_MENU_CLOSE"
Event triggered before a sub-menu closes.

**Kind**: event emitted  
<a name="event_EVENT_MENU_ADDED"></a>

## "EVENT_MENU_ADDED"
Event triggered when a menu or menu is added

**Kind**: event emitted  
<a name="event_EVENT_SUB_MENU_ADDED"></a>

## "EVENT_SUB_MENU_ADDED"
Event triggered when a menu or submenu is added

**Kind**: event emitted  
<a name="event_EVENT_MENU_ITEM_ADDED"></a>

## "EVENT_MENU_ITEM_ADDED"
Event triggered when a menu item is added

**Kind**: event emitted  
