### Import :
```js
const CommandManager = brackets.getModule("command/CommandManager")
```

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

## register(name, id, commandFn, [options]) ⇒ [<code>Command</code>](#new_Command_new)
Registers a global command.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> | text that will be displayed in the UI to represent command |
| id | <code>string</code> | unique identifier for command.      Core commands in Brackets use a simple command title as an id, for example "open.file".      Extensions should use the following format: "author.myextension.mycommandname".      For example, "lschmitt.csswizard.format.css". |
| commandFn | <code>function</code> | the function to call when the command is executed. Any arguments passed to     execute() (after the id) are passed as arguments to the function. If the function is asynchronous,     it must return a jQuery promise that is resolved when the command completes. Otherwise, the     CommandManager will assume it is synchronous, and return a promise that is already resolved. |
| [options] | <code>Object</code> |  |
| options.eventSource | <code>boolean</code> | If set to true, the commandFn will be called with the first argument `event` with details about the source(invoker) as event.eventSource(one of the `CommandManager.SOURCE_*`) and event.sourceType(Eg. Ctrl-K) parameter. |

<a name="registerInternal"></a>

## registerInternal(id, commandFn) ⇒ [<code>Command</code>](#new_Command_new)
Registers a global internal only command.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | unique identifier for command.      Core commands in Brackets use a simple command title as an id, for example "app.abort_quit".      Extensions should use the following format: "author.myextension.mycommandname".      For example, "lschmitt.csswizard.format.css". |
| commandFn | <code>function</code> | the function to call when the command is executed. Any arguments passed to     execute() (after the id) are passed as arguments to the function. If the function is asynchronous,     it must return a jQuery promise that is resolved when the command completes. Otherwise, the     CommandManager will assume it is synchronous, and return a promise that is already resolved. |

<a name="get"></a>

## get(id) ⇒ [<code>Command</code>](#new_Command_new)
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

