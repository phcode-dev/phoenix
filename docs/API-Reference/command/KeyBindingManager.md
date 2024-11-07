### Import :
```js
const KeyBindingManager = brackets.getModule("command/KeyBindingManager")
```

<a name="useWindowsCompatibleBindings"></a>

## useWindowsCompatibleBindings
Use windows-specific bindings if no other are found (e.g. Linux).
Core Brackets modules that use key bindings should always define at
least a generic keybinding that is applied for all platforms. This
setting effectively creates a compatibility mode for third party
extensions that define explicit key bindings for Windows and Mac, but
not Linux.

**Kind**: global variable  
<a name="EVENT_KEY_BINDING_ADDED"></a>

## EVENT\_KEY\_BINDING\_ADDED : <code>string</code>
key binding add event

**Kind**: global constant  
<a name="EVENT_KEY_BINDING_REMOVED"></a>

## EVENT\_KEY\_BINDING\_REMOVED : <code>string</code>
key binding remove event

**Kind**: global constant  
<a name="EVENT_NEW_PRESET"></a>

## EVENT\_NEW\_PRESET : <code>string</code>
new preset event

**Kind**: global constant  
<a name="EVENT_PRESET_CHANGED"></a>

## EVENT\_PRESET\_CHANGED : <code>string</code>
preset change event

**Kind**: global constant  
<a name="KEY"></a>

## KEY : <code>Object</code>
**Kind**: global constant  
<a name="formatKeyDescriptor"></a>

## formatKeyDescriptor(descriptor) ⇒ <code>string</code>
Convert normalized key representation to display appropriate for platform.

**Kind**: global function  
**Returns**: <code>string</code> - Display/Operating system appropriate string  

| Param | Type | Description |
| --- | --- | --- |
| descriptor | <code>string</code> | Normalized key descriptor. |

<a name="removeBinding"></a>

## removeBinding(key, [platform])
Remove a key binding from _keymap

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| key | <code>string</code> | a key-description string that may or may not be normalized. |
| [platform] | <code>string</code> | OS from which to remove the binding (all platforms if unspecified) |

<a name="getKeymap"></a>

## getKeymap([defaults]) ⇒ <code>Object</code>
Returns a copy of the current key map. If the optional 'defaults' parameter is true,
then a copy of the default key map is returned.
In the default keymap each key is associated with an object containing `commandID`, `key`, and `displayKey`.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| [defaults] | <code>boolean</code> | true if the caller wants a copy of the default key map. Otherwise, the current active key map is returned. |

<a name="addBinding"></a>

## addBinding(command, keyBindings, platform, options) ⇒ <code>Object</code>
Add one or more key bindings to a particular Command.
Returns record(s) for valid key binding(s).

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| command | <code>string</code> \| <code>Command</code> | A command ID or command object |
| keyBindings | <code>Object</code> | A single key binding or an array of keybindings.     In an array of keybinding `platform` property is also available. Example:     "Shift-Cmd-F". Mac and Win key equivalents are automatically     mapped to each other. Use displayKey property to display a different     string (e.g. "CMD+" instead of "CMD="). |
| platform | <code>string</code> | The target OS of the keyBindings either     "mac", "win" or "linux". If undefined, all platforms not explicitly     defined will use the key binding.     NOTE: If platform is not specified, Ctrl will be replaced by Cmd for "mac" platform |
| options | <code>object</code> |  |
| options.isMenuShortcut | <code>boolean</code> | this allows alt-key shortcuts to be registered. |

<a name="getKeyBindings"></a>

## getKeyBindings(command) ⇒ <code>Array.&lt;Object&gt;</code>
Retrieve key bindings currently associated with a command

**Kind**: global function  
**Returns**: <code>Array.&lt;Object&gt;</code> - The object has two properties `key` and `displayKey`  

| Param | Type | Description |
| --- | --- | --- |
| command | <code>string</code> \| <code>Command</code> | A command ID or command object |

<a name="getKeyBindingsDisplay"></a>

## getKeyBindingsDisplay(commandID) ⇒ <code>string</code> \| <code>null</code>
Retrieves the platform-specific string representation of the key bindings for a specified command.
This function is useful for displaying the keyboard shortcut associated with a given command ID to the user.
If a key binding is found for the command, it returns the formatted key descriptor. Otherwise, it returns null.

**Kind**: global function  
**Returns**: <code>string</code> \| <code>null</code> - The formatted key binding as a string if available; otherwise, null.  

| Param | Type | Description |
| --- | --- | --- |
| commandID | <code>string</code> | The unique identifier of the command for which the key binding is to be retrieved. |

<a name="addGlobalKeydownHook"></a>

## addGlobalKeydownHook(hook)
Adds a global keydown hook that gets first crack at keydown events
before standard keybindings do. This is intended for use by modal or
semi-modal UI elements like dialogs or the code hint list that should
execute before normal command bindings are run.

The hook is passed two parameters, the first param is the original keyboard event.
The second param is the deduced shortcut string like `Ctrl-F` if present for
that event or null if not keyboard shortcut string. If the
hook handles the event (or wants to block other global hooks from
handling the event), it should return true. Note that this will *only*
stop other global hooks and KeyBindingManager from handling the
event; to prevent further event propagation, you will need to call
stopPropagation(), stopImmediatePropagation(), and/or preventDefault()
as usual.

Multiple keydown hooks can be registered, and are executed in order,
most-recently-added first. A keydown hook will only be added once if the same
hook is already added before.

(We have to have a special API for this because (1) handlers are normally
called in least-recently-added order, and we want most-recently-added;
(2) native DOM events don't have a way for us to find out if
stopImmediatePropagation()/stopPropagation() has been called on the
event, so we have to have some other way for one of the hooks to
indicate that it wants to block the other hooks from running.)

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| hook | <code>function</code> | The global hook to add. |

<a name="removeGlobalKeydownHook"></a>

## removeGlobalKeydownHook(hook)
Removes a global keydown hook added by `addGlobalKeydownHook`.
Does not need to be the most recently added hook.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| hook | <code>function</code> | The global hook to remove. |

<a name="registerCustomKeymapPack"></a>

## registerCustomKeymapPack(packID, packName, keyMap)
This can be used by extensions to register new kepmap packs that can be listed in the keyboard shortcuts panel
under use preset dropdown. For EG. distribute a `netbeans editor` shortcuts pack via extension.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| packID | <code>string</code> | A unique ID for the pack. Use `extensionID.name` format to avoid collisions. |
| packName | <code>string</code> | A name for the pack. |
| keyMap | <code>Object</code> | a keymap of the format `{'Ctrl-Alt-L': 'file.liveFilePreview'}` depending on the platform. The extension should decide the correct keymap based on the platform before calling this function. |

<a name="getAllCustomKeymapPacks"></a>

## getAllCustomKeymapPacks() ⇒ <code>Array.&lt;Object&gt;</code>
Responsible to get all the custom keymap packs

**Kind**: global function  
**Returns**: <code>Array.&lt;Object&gt;</code> - an array of all the custom keymap packs,
each pack is an object with keys: `packID`, `packageName` & `keyMap`  
<a name="getCurrentCustomKeymapPack"></a>

## getCurrentCustomKeymapPack() ⇒ <code>Object</code>
To get the current custom keymap pack

**Kind**: global function  
**Returns**: <code>Object</code> - the current custom keymap pack  
<a name="resetUserShortcutsAsync"></a>

## resetUserShortcutsAsync() ⇒ <code>Promise</code> \| <code>Promise.&lt;void&gt;</code> \| <code>\*</code>
resets all user defined shortcuts

**Kind**: global function  
<a name="isInOverlayMode"></a>

## isInOverlayMode() ⇒ <code>boolean</code>
Whether the keyboard is in overlay mode or not

**Kind**: global function  
**Returns**: <code>boolean</code> - True if in overlay mode else false  
<a name="showShortcutSelectionDialog"></a>

## showShortcutSelectionDialog(command)
to display the shortcut selection dialog

**Kind**: global function  

| Param |
| --- |
| command | 

<a name="canAssignBinding"></a>

## canAssignBinding(commandId) ⇒ <code>boolean</code>
Returns true the given command id can be overriden by user.

**Kind**: global function  

| Param |
| --- |
| commandId | 

<a name="UserKeyBinding"></a>

## UserKeyBinding : <code>Object</code>
**Kind**: global typedef  
