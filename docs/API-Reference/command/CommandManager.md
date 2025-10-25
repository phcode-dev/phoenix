### Import :
```js
const CommandManager = brackets.getModule("command/CommandManager")
```

<a name="Command"></a>

## Command
**Kind**: global class  

* [Command](#Command)
    * [new Command(name, id, commandFn, [options])](#new_Command_new)
    * [.getID()](#Command+getID) ⇒ <code>string</code>
    * [.execute()](#Command+execute) ⇒ <code>$.Promise</code>
    * [.getEnabled()](#Command+getEnabled) ⇒ <code>boolean</code>
    * [.getOptions()](#Command+getOptions) ⇒ <code>object</code>
    * [.setEnabled(enabled)](#Command+setEnabled)
    * [.setChecked(checked)](#Command+setChecked)
    * [.getChecked()](#Command+getChecked) ⇒ <code>boolean</code>
    * [.setName(name, htmlName)](#Command+setName)
    * [.getName()](#Command+getName) ⇒ <code>string</code>

<a name="new_Command_new"></a>

### new Command(name, id, commandFn, [options])
Events:
- enabledStateChange
- checkedStateChange
- keyBindingAdded
- keyBindingRemoved


| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> | text that will be displayed in the UI to represent command |
| id | <code>string</code> |  |
| commandFn | <code>function</code> | the function that is called when the command is executed. TODO: where should this be triggered, The Command or Exports? |
| [options] |  |  |

<a name="Command+getID"></a>

### command.getID() ⇒ <code>string</code>
Get command id

**Kind**: instance method of [<code>Command</code>](#Command)  
<a name="Command+execute"></a>

### command.execute() ⇒ <code>$.Promise</code>
Executes the command. Additional arguments are passed to the executing function

**Kind**: instance method of [<code>Command</code>](#Command)  
**Returns**: <code>$.Promise</code> - a jQuery promise that will be resolved when the command completes.  
<a name="Command+getEnabled"></a>

### command.getEnabled() ⇒ <code>boolean</code>
Is command enabled?

**Kind**: instance method of [<code>Command</code>](#Command)  
<a name="Command+getOptions"></a>

### command.getOptions() ⇒ <code>object</code>
get the command options

**Kind**: instance method of [<code>Command</code>](#Command)  
<a name="Command+setEnabled"></a>

### command.setEnabled(enabled)
Sets enabled state of Command and dispatches "enabledStateChange"
when the enabled state changes.

**Kind**: instance method of [<code>Command</code>](#Command)  

| Param | Type |
| --- | --- |
| enabled | <code>boolean</code> | 

<a name="Command+setChecked"></a>

### command.setChecked(checked)
Sets enabled state of Command and dispatches "checkedStateChange"
when the enabled state changes.

**Kind**: instance method of [<code>Command</code>](#Command)  

| Param | Type |
| --- | --- |
| checked | <code>boolean</code> | 

<a name="Command+getChecked"></a>

### command.getChecked() ⇒ <code>boolean</code>
Is command checked?

**Kind**: instance method of [<code>Command</code>](#Command)  
<a name="Command+setName"></a>

### command.setName(name, htmlName)
Sets the name of the Command and dispatches "nameChange" so that
UI that reflects the command name can update.

Note, a Command name can appear in either HTML or native UI
so HTML tags should not be used. To add a Unicode character,
use \uXXXX instead of an HTML entity.

**Kind**: instance method of [<code>Command</code>](#Command)  

| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> |  |
| htmlName | <code>string</code> | If set, this will be displayed in ui menus instead of the name given.      Example: `"Phoenix menu<i class='fa fa-car' style='margin-left: 4px;'></i>"` |

<a name="Command+getName"></a>

### command.getName() ⇒ <code>string</code>
Get command name

**Kind**: instance method of [<code>Command</code>](#Command)  
<a name="EventDispatcher"></a>

## EventDispatcher
Manages global application commands that can be called from menu items, key bindings, or subparts
of the application.

This module dispatches these event(s):
   - commandRegistered  -- when a new command is registered
   - beforeExecuteCommand -- before dispatching a command

**Kind**: global constant  
<a name="EVENT_BEFORE_EXECUTE_COMMAND"></a>

## EVENT\_BEFORE\_EXECUTE\_COMMAND : <code>string</code>
Event triggered before command executes.

**Kind**: global constant  
<a name="SOURCE_KEYBOARD_SHORTCUT"></a>

## SOURCE\_KEYBOARD\_SHORTCUT : <code>string</code>
Keyboard shortcut trigger.

**Kind**: global constant  
<a name="SOURCE_UI_MENU_CLICK"></a>

## SOURCE\_UI\_MENU\_CLICK : <code>string</code>
UI menu click trigger.

**Kind**: global constant  
<a name="SOURCE_OTHER"></a>

## SOURCE\_OTHER : <code>string</code>
Other trigger types.

**Kind**: global constant  
<a name="register"></a>

## register(name, id, commandFn, [options]) ⇒ [<code>Command</code>](#Command)
Registers a global command.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> | text that will be displayed in the UI to represent command |
| id | <code>string</code> | unique identifier for command.      Core commands in Brackets use a simple command title as an id, for example "open.file".      Extensions should use the following format: "author.myextension.mycommandname".      For example, "lschmitt.csswizard.format.css". |
| commandFn | <code>function</code> | the function to call when the command is executed. Any arguments passed to     execute() (after the id) are passed as arguments to the function. If the function is asynchronous,     it must return a jQuery promise that is resolved when the command completes. Otherwise, the     CommandManager will assume it is synchronous, and return a promise that is already resolved. |
| [options] | <code>Object</code> |  |
| options.eventSource | <code>boolean</code> | If set to true, the commandFn will be called with the first argument `event` with details about the source(invoker) as event.eventSource(one of the `CommandManager.SOURCE_*`) and event.sourceType(Eg. Ctrl-K) parameter. |
| options.htmlName | <code>string</code> | If set, this will be displayed in ui menus instead of the name given.      Example: `"Phoenix menu<i class='fa fa-car' style='margin-left: 4px;'></i>"` |

<a name="registerInternal"></a>

## registerInternal(id, commandFn) ⇒ [<code>Command</code>](#Command)
Registers a global internal only command.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | unique identifier for command.      Core commands in Brackets use a simple command title as an id, for example "app.abort_quit".      Extensions should use the following format: "author.myextension.mycommandname".      For example, "lschmitt.csswizard.format.css". |
| commandFn | <code>function</code> | the function to call when the command is executed. Any arguments passed to     execute() (after the id) are passed as arguments to the function. If the function is asynchronous,     it must return a jQuery promise that is resolved when the command completes. Otherwise, the     CommandManager will assume it is synchronous, and return a promise that is already resolved. |

<a name="get"></a>

## get(id) ⇒ [<code>Command</code>](#Command)
Retrieves a Command object by id

**Kind**: global function  

| Param | Type |
| --- | --- |
| id | <code>string</code> | 

<a name="getAll"></a>

## getAll() ⇒ <code>Array.&lt;string&gt;</code>
Returns the ids of all registered commands

**Kind**: global function  
<a name="execute"></a>

## execute(id) ⇒ <code>$.Promise</code>
Looks up and runs a global command. Additional arguments are passed to the command.

**Kind**: global function  
**Returns**: <code>$.Promise</code> - a jQuery promise that will be resolved when the command completes.  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | The ID of the command to run. |

