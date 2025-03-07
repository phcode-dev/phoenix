/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

// @INCLUDE_IN_API_DOCS

/*globals path, logger*/
/*jslint regexp: true */
/*unittests: KeyBindingManager */

/**
 * Manages the mapping of keyboard inputs to commands.
 */
define(function (require, exports, module) {


    require("utils/Global");

    let AppInit             = require("utils/AppInit"),
        Commands            = require("command/Commands"),
        CommandManager      = require("command/CommandManager"),
        DefaultDialogs      = require("widgets/DefaultDialogs"),
        EventDispatcher     = require("utils/EventDispatcher"),
        FileSystem          = require("filesystem/FileSystem"),
        FileSystemError     = require("filesystem/FileSystemError"),
        FileUtils           = require("file/FileUtils"),
        KeyEvent            = require("utils/KeyEvent"),
        Strings             = require("strings"),
        Keys                = require("command/Keys"),
        KeyboardOverlayMode = require("command/KeyboardOverlayMode"),
        StringUtils         = require("utils/StringUtils"),
        Metrics             = require("utils/Metrics"),
        Dialogs                 = require("widgets/Dialogs"),
        Mustache            = require("thirdparty/mustache/mustache"),
        UrlParams           = require("utils/UrlParams").UrlParams,
        _                   = require("thirdparty/lodash");

    let KeyboardPrefs       = JSON.parse(require("text!base-config/keyboard.json"));
    let KeyboardDialogTemplate = require("text!./ChangeShortcutTemplate.html");

    let KEYMAP_FILENAME     = "keymap.json",
        _userKeyMapFilePath = path.normalize(brackets.app.getApplicationSupportDirectory() + "/" + KEYMAP_FILENAME);

    /**
     * key binding add event
     *
     * @const
     * @type {string}
     */
    const EVENT_KEY_BINDING_ADDED = "keyBindingAdded";

    /**
     * key binding remove event
     *
     * @const
     * @type {string}
     */
    const EVENT_KEY_BINDING_REMOVED = "keyBindingRemoved";

    /**
     * new preset event
     *
     * @const
     * @type {string}
     */
    const EVENT_NEW_PRESET = "newPreset";

    /**
     * preset change event
     *
     * @const
     * @type {string}
     */
    const EVENT_PRESET_CHANGED = "presetChanged";

    /**
     * @const
     * @type {Object}
     */
    const KEY = Keys.KEY;

    const knownBindableCommands = new Set();

    /**
     * Forward declaration for JSLint.
     *
     * @private
     * @type {Function}
     */
    let _loadUserKeyMap = _.debounce(_loadUserKeyMapImmediate, 200);
    let PreferencesManager;
    let _customKeymapIDInUse;
    const _registeredCustomKeyMaps = {};

    const STATE_CUSTOM_KEY_MAP_ID = "customKeyMapID";
    const PREF_TRIPLE_CTRL_KEY_PRESS_ENABLED = "tripleCtrlPalette";

    /**
     * Maps normalized shortcut descriptor to key binding info.
     *
     * @private
     * @type {!Object.<string, {commandID: string, key: string, displayKey: string}>}
     */
    let _keyMap            = {},    // For the actual key bindings including user specified ones
        // For the default factory key bindings, cloned from _keyMap after all extensions are loaded.
        _defaultKeyMap     = {};

    /**
     * @typedef {{shortcut: !string,
     *            commandID: ?string}} UserKeyBinding
     */

    /**
     * Maps shortcut descriptor to a command id.
     *
     * @private
     * @type {UserKeyBinding}
     */
    let _originalUserKeyMap = {},
        _customKeyMap      = {},
        _customKeyMapCache = {};

    /**
     * Maps commandID to the list of shortcuts that are bound to it.
     *
     * @private
     * @type {!Object.<string, Array.<{key: string, displayKey: string}>>}
     */
    let _commandMap  = {};

    /**
     * An array of command ID for all the available commands including the commands
     * of installed extensions.
     *
     * @private
     * @type {Array.<string>}
     */
    let _allCommands = [];

    /**
     * Maps key names to the corresponding unicode symbols
     *
     * @private
     * @type {{key: string, displayKey: string}}
     */
    let _displayKeyMap        = { "up": "\u2191",
        "down": "\u2193",
        "left": "\u2190",
        "right": "\u2192",
        "-": "\u2212" };

    let _specialCommands      = [Commands.EDIT_UNDO, Commands.EDIT_REDO, Commands.EDIT_SELECT_ALL,
            Commands.EDIT_CUT, Commands.EDIT_COPY, Commands.EDIT_PASTE],
        _reservedShortcuts    = ["Ctrl-Z", "Ctrl-Y", "Ctrl-A", "Ctrl-X", "Ctrl-C", "Ctrl-V", "Ctrl-=", "Ctrl--"],
        _macReservedShortcuts = ["Cmd-,", "Cmd-H", "Cmd-Alt-H", "Cmd-M", "Cmd-Shift-Z", "Cmd-Q", "Cmd-=", "Cmd--"],
        _keyNames             = ["Up", "Down", "Left", "Right", "Backspace", "Enter", "Space", "Tab",
            "PageUp", "PageDown", "Home", "End", "Insert", "Delete"];

    /**
     * Flag to show key binding errors in the key map file. Default is true and
     * it will be set to false when reloading without extensions. This flag is not
     * used to suppress errors in loading or parsing the key map file. So if the key
     * map file is corrupt, then the error dialog still shows up.
     *
     * @private
     * @type {boolean}
     */
    let _showErrors = true;

    /**
     * Allow clients to toggle key binding
     *
     * @private
     * @type {boolean}
     */
    let _enabled = true;

    /**
     * Stack of registered global keydown hooks.
     *
     * @private
     * @type {Array.<function(Event): boolean>}
     */
    let _globalKeydownHooks = [];

    /**
     * States of Ctrl key down detection
     *
     * @private
     * @enum {number}
     */
    let CtrlDownStates = {
        "NOT_YET_DETECTED": 0,
        "DETECTED": 1,
        "DETECTED_AND_IGNORED": 2   // For consecutive ctrl keydown events while a Ctrl key is being hold down
    };

    /**
     * Flags used to determine whether right Alt key is pressed. When it is pressed,
     * the following two keydown events are triggered in that specific order.
     *
     *    1. _ctrlDown - flag used to record { ctrlKey: true, keyIdentifier: "Control", ... } keydown event
     *    2. _altGrDown - flag used to record { ctrlKey: true, altKey: true, keyIdentifier: "Alt", ... } keydown event
     *
     * @private
     * @type {CtrlDownStates|boolean}
     */
    let _ctrlDown = CtrlDownStates.NOT_YET_DETECTED,
        _altGrDown = false;

    /**
     * Used to record the timeStamp property of the last keydown event.
     *
     * @private
     * @type {number}
     */
    let _lastTimeStamp;

    /**
     * Used to record the keyIdentifier property of the last keydown event.
     *
     * @private
     * @type {string}
     */
    let _lastKeyIdentifier;

    /**
     * Constant used for checking the interval between Control keydown event and Alt keydown event.
     * If the right Alt key is down we get Control keydown followed by Alt keydown within 30 ms. if
     * the user is pressing Control key and then Alt key, the interval will be larger than 30 ms.
     *
     * @private
     * @type {number}
     */
    let MAX_INTERVAL_FOR_CTRL_ALT_KEYS = 30;

    /**
     * Forward declaration for JSLint.
     *
     * @private
     * @type {Function}
     */
    let _onCtrlUp;

    /**
     * Resets all the flags and removes _onCtrlUp event listener.
     *
     * @private
     */
    function _quitAltGrMode() {
        _enabled = true;
        _ctrlDown = CtrlDownStates.NOT_YET_DETECTED;
        _altGrDown = false;
        _lastTimeStamp = null;
        _lastKeyIdentifier = null;
        $(window).off("keyup", _onCtrlUp);
    }

    /**
     * Detects the release of AltGr key by checking all keyup events
     * until we receive one with ctrl key code. Once detected, reset
     * all the flags and also remove this event listener.
     *
     * @private
     * @param {!KeyboardEvent} e keyboard event object
     */
    _onCtrlUp = function (e) {
        let key = e.keyCode || e.which;
        if (_altGrDown && key === KeyEvent.DOM_VK_CONTROL) {
            _quitAltGrMode();
        }
    };

    /**
     * Detects whether AltGr key is pressed. When it is pressed, the first keydown event has
     * ctrlKey === true with keyIdentifier === "Control". The next keydown event with
     * altKey === true, ctrlKey === true and keyIdentifier === "Alt" is sent within 30 ms. Then
     * the next keydown event with altKey === true, ctrlKey === true and keyIdentifier === "Control"
     * is sent. If the user keep holding AltGr key down, then the second and third
     * keydown events are repeatedly sent out alternately. If the user is also holding down Ctrl
     * key, then either keyIdentifier === "Control" or keyIdentifier === "Alt" is repeatedly sent
     * but not alternately.
     *
     * Once we detect the AltGr key down, then disable KeyBindingManager and set up a keyup
     * event listener to detect the release of the altGr key so that we can re-enable KeyBindingManager.
     * When we detect the addition of Ctrl key besides AltGr key, we also quit AltGr mode and re-enable
     * KeyBindingManager.
     *
     * @private
     * @param {!KeyboardEvent} e keyboard event object
     */
    function _detectAltGrKeyDown(e) {
        if (brackets.platform !== "win") {
            return;
        }

        if (!_altGrDown) {
            if (_ctrlDown !== CtrlDownStates.DETECTED_AND_IGNORED && e.ctrlKey && e.key === "Control") {
                _ctrlDown = CtrlDownStates.DETECTED;
            } else if (e.repeat && e.ctrlKey && e.key === "Control") {
                // We get here if the user is holding down left/right Control key. Set it to false
                // so that we don't misidentify the combination of Ctrl and Alt keys as AltGr key.
                _ctrlDown = CtrlDownStates.DETECTED_AND_IGNORED;
            } else if (_ctrlDown === CtrlDownStates.DETECTED && e.altKey && e.ctrlKey && e.key === "Alt" &&
                        (e.timeStamp - _lastTimeStamp) < MAX_INTERVAL_FOR_CTRL_ALT_KEYS) {
                _altGrDown = true;
                _lastKeyIdentifier = "Alt";
                _enabled = false;
                $(window).on("keyup", _onCtrlUp);
            } else {
                // Reset _ctrlDown so that we can start over in detecting the two key events
                // required for AltGr key.
                _ctrlDown = CtrlDownStates.NOT_YET_DETECTED;
            }
            _lastTimeStamp = e.timeStamp;
        } else if (e.key === "Control" || e.key === "Alt") {
            // If the user is NOT holding down AltGr key or is also pressing Ctrl key,
            // then _lastKeyIdentifier will be the same as keyIdentifier in the current
            // key event. So we need to quit AltGr mode to re-enable KBM.
            if (e.altKey && e.ctrlKey && e.key === _lastKeyIdentifier) {
                _quitAltGrMode();
            } else {
                _lastKeyIdentifier = e.key;
            }
        }
    }

    /**
     * @private
     */
    function _reset() {
        _keyMap = {};
        _defaultKeyMap = {};
        _customKeyMap = {};
        _customKeyMapCache = {};
        _commandMap = {};
        _globalKeydownHooks = [];
        _userKeyMapFilePath = path.normalize(brackets.app.getApplicationSupportDirectory() + "/" + KEYMAP_FILENAME);
    }

    /**
     * Initialize an empty keymap as the current keymap. It overwrites the current keymap if there is one.
     * builds the keyDescriptor string from the given parts
     *
     * @private
     * @param {boolean} hasCtrl Is Ctrl key enabled
     * @param {boolean} hasAlt Is Alt key enabled
     * @param {boolean} hasShift Is Shift key enabled
     * @param {string} key The key that's pressed
     * @return {string} The normalized key descriptor
     */
    function _buildKeyDescriptor(hasMacCtrl, hasCtrl, hasAlt, hasShift, key) {
        if (!key) {
            console.log("KeyBindingManager _buildKeyDescriptor() - No key provided!");
            return "";
        }

        let keyDescriptor = [];

        if (hasMacCtrl) {
            keyDescriptor.push("Ctrl");
        }
        if (hasAlt) {
            keyDescriptor.push("Alt");
        }
        if (hasShift) {
            keyDescriptor.push("Shift");
        }

        if (hasCtrl) {
            // Windows display Ctrl first, Mac displays Command symbol last
            if (brackets.platform === "mac") {
                keyDescriptor.push("Cmd");
            } else {
                keyDescriptor.unshift("Ctrl");
            }
        }

        keyDescriptor.push(key);

        return keyDescriptor.join("-");
    }


    /**
     * normalizes the incoming key descriptor so the modifier keys are always specified in the correct order
     *
     * @private
     * @param {string} origDescriptor The string for a key descriptor, can be in any order, the result will be Ctrl-Alt-Shift-<Key>
     * @return {string} The normalized key descriptor or null if the descriptor invalid
     */
    function normalizeKeyDescriptorString(origDescriptor) {
        let hasMacCtrl = false,
            hasCtrl = false,
            hasAlt = false,
            hasShift = false,
            key = "",
            error = false;

        function _compareModifierString(left, right) {
            if (!left || !right) {
                return false;
            }
            left = left.trim().toLowerCase();
            right = right.trim().toLowerCase();

            return (left.length > 0 && left === right);
        }

        origDescriptor.split("-").forEach(function parseDescriptor(ele, i, arr) {
            if (_compareModifierString("ctrl", ele)) {
                if (brackets.platform === "mac") {
                    hasMacCtrl = true;
                } else {
                    hasCtrl = true;
                }
            } else if (_compareModifierString("cmd", ele)) {
                if (brackets.platform === "mac") {
                    hasCtrl = true;
                } else {
                    error = true;
                }
            } else if (_compareModifierString("alt", ele)) {
                hasAlt = true;
            } else if (_compareModifierString("opt", ele)) {
                if (brackets.platform === "mac") {
                    hasAlt = true;
                } else {
                    error = true;
                }
            } else if (_compareModifierString("shift", ele)) {
                hasShift = true;
            } else if (key.length > 0) {
                console.log("KeyBindingManager normalizeKeyDescriptorString() - Multiple keys defined. Using key: " + key + " from: " + origDescriptor);
                error = true;
            } else {
                key = ele;
            }
        });

        if (error) {
            return null;
        }

        // Check to see if the binding is for "-".
        if (key === "" && origDescriptor.search(/^.+--$/) !== -1) {
            key = "-";
        }

        // Check if it is a shift key only press
        if (key === "" && origDescriptor.toLowerCase() === 'shift-shift') {
            key = "Shift";
        }

        // '+' char is valid if it's the only key. Keyboard shortcut strings should use
        // unicode characters (unescaped). Keyboard shortcut display strings may use
        // unicode escape sequences (e.g. \u20AC euro sign)
        if ((key.indexOf("+")) >= 0 && (key.length > 1)) {
            return null;
        }

        // Ensure that the first letter of the key name is in upper case and the rest are
        // in lower case. i.e. 'a' => 'A' and 'up' => 'Up'
        if (/^[a-z]/i.test(key)) {
            key = _.capitalize(key.toLowerCase());
        }

        // Also make sure that the second word of PageUp/PageDown has the first letter in upper case.
        if (/^Page/.test(key)) {
            key = key.replace(/(up|down)$/, function (match, p1) {
                return _.capitalize(p1);
            });
        }

        // No restriction on single character key yet, but other key names are restricted to either
        // Function keys or those listed in _keyNames array.
        if (key.length > 1 && !/F\d+/.test(key) &&
                _keyNames.indexOf(key) === -1) {
            return null;
        }

        return _buildKeyDescriptor(hasMacCtrl, hasCtrl, hasAlt, hasShift, key);
    }

    function _mapKeycodeToKeyLegacy(keycode) {
        // https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/keyCode
        // keycode is deprecated. We only use this in one edge case in mac listed in the caller.
        // If keycode represents one of the digit keys (0-9), then return the corresponding digit
        // by subtracting KeyEvent.DOM_VK_0 from keycode. ie. [48-57] --> [0-9]
        if ((keycode >= KeyEvent.DOM_VK_0 && keycode <= KeyEvent.DOM_VK_9) ||
            (keycode >= KeyEvent.DOM_VK_A && keycode <= KeyEvent.DOM_VK_Z)){
            return String.fromCharCode(keycode);
            // Do the same with the numpad numbers
            // by subtracting KeyEvent.DOM_VK_NUMPAD0 from keycode. ie. [96-105] --> [0-9]
        } else if (keycode >= KeyEvent.DOM_VK_NUMPAD0 && keycode <= KeyEvent.DOM_VK_NUMPAD9) {
            return String.fromCharCode(keycode - KeyEvent.DOM_VK_NUMPAD0 + KeyEvent.DOM_VK_0);
        }


        switch (keycode) {
        case KeyEvent.DOM_VK_SEMICOLON:
            return ";";
        case KeyEvent.DOM_VK_EQUALS:
            return "=";
        case KeyEvent.DOM_VK_COMMA:
            return ",";
        case KeyEvent.DOM_VK_SUBTRACT:
        case KeyEvent.DOM_VK_DASH:
            return "-";
        case KeyEvent.DOM_VK_ADD:
            return "+";
        case KeyEvent.DOM_VK_DECIMAL:
        case KeyEvent.DOM_VK_PERIOD:
            return ".";
        case KeyEvent.DOM_VK_DIVIDE:
        case KeyEvent.DOM_VK_SLASH:
            return "/";
        case KeyEvent.DOM_VK_BACK_QUOTE:
            return "`";
        case KeyEvent.DOM_VK_OPEN_BRACKET:
            return "[";
        case KeyEvent.DOM_VK_BACK_SLASH:
            return "\\";
        case KeyEvent.DOM_VK_CLOSE_BRACKET:
            return "]";
        case KeyEvent.DOM_VK_QUOTE:
            return "'";
        default:
            return null;
        }
    }

    /**
     * Looks for keycodes that have os-inconsistent keys and fixes them.
     *
     * @private
     * @return {string} If the key is OS-inconsistent, the correct key; otherwise, the original key.
     **/
    function _mapKeycodeToKey(event) {
        // key code mapping https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_code_values
        if((event.ctrlKey || event.metaKey) && event.altKey && brackets.platform === "mac"){
            // in mac, Cmd-alt-<shift?>-key are valid. But alt-key will trigger international keyboard typing and
            // hence instead of Cmd-Alt-O, mac will get event Cmd-alt-Φ which is not what we want. So we will
            // fallback to the deprecated keyCode event in the case
            const key = _mapKeycodeToKeyLegacy(event.keyCode);
            if(key){
                return key;
            }
        }
        const key = event.key;
        let codes = {
            "ArrowUp": "Up",
            "ArrowDown": "Down",
            "ArrowLeft": "Left",
            "ArrowRight": "Right",
            " ": "Space"
        };
        if(codes[key]){
            return codes[key];
        }
        return key;
    }

    /**
     * Takes a keyboard event and translates it into a key in a key map
     *
     * @private
     */
    function _translateKeyboardEvent(event) {
        let hasMacCtrl = (brackets.platform === "mac") ? (event.ctrlKey) : false,
            hasCtrl = (brackets.platform !== "mac") ? (event.ctrlKey) : (event.metaKey),
            hasAlt = (event.altKey),
            hasShift = (event.shiftKey),
            key = _mapKeycodeToKey(event);
        return normalizeKeyDescriptorString(_buildKeyDescriptor(hasMacCtrl, hasCtrl, hasAlt, hasShift, key));
    }

    /**
     * Convert normalized key representation to display appropriate for platform.
     *
     * @param {!string} descriptor Normalized key descriptor.
     * @return {!string} Display/Operating system appropriate string
     */
    function formatKeyDescriptor(descriptor) {
        let displayStr;

        if (brackets.platform === "mac") {
            displayStr = descriptor.replace(/-(?!$)/g, "");     // remove dashes
            displayStr = displayStr.replace("Ctrl", "\u2303");  // Ctrl > control symbol
            displayStr = displayStr.replace("Cmd", "\u2318");   // Cmd > command symbol
            displayStr = displayStr.replace("Shift", "\u21E7"); // Shift > shift symbol
            displayStr = displayStr.replace("Alt", "\u2325");   // Alt > option symbol
        } else {
            displayStr = descriptor.replace("Ctrl", Strings.KEYBOARD_CTRL);
            displayStr = displayStr.replace("Shift", Strings.KEYBOARD_SHIFT);
            displayStr = displayStr.replace(/-(?!$)/g, "+");
        }

        displayStr = displayStr.replace("Space", Strings.KEYBOARD_SPACE);

        displayStr = displayStr.replace("PageUp", Strings.KEYBOARD_PAGE_UP);
        displayStr = displayStr.replace("PageDown", Strings.KEYBOARD_PAGE_DOWN);
        displayStr = displayStr.replace("Home", Strings.KEYBOARD_HOME);
        displayStr = displayStr.replace("End", Strings.KEYBOARD_END);

        displayStr = displayStr.replace("Ins", Strings.KEYBOARD_INSERT);
        displayStr = displayStr.replace("Del", Strings.KEYBOARD_DELETE);

        return displayStr;
    }

    /**
     * @private
     * @param {string} A normalized key-description string.
     * @return {boolean} true if the key is already assigned, false otherwise.
     */
    function _isKeyAssigned(key) {
        return (_keyMap[key] !== undefined);
    }

    /**
     * Remove a key binding from _keymap
     *
     * @param {!string} key - a key-description string that may or may not be normalized.
     * @param {?string} [platform] - OS from which to remove the binding (all platforms if unspecified)
     */
    function removeBinding(key, platform) {
        if (!key || ((platform !== null) && (platform !== undefined) && (platform !== brackets.platform))) {
            return;
        }

        let normalizedKey = normalizeKeyDescriptorString(key);

        if (!normalizedKey) {
            console.log("Failed to normalize " + key);
        } else if (_isKeyAssigned(normalizedKey)) {
            let binding = _keyMap[normalizedKey],
                command = CommandManager.get(binding.commandID),
                bindings = _commandMap[binding.commandID];

            // delete key binding record
            delete _keyMap[normalizedKey];

            if (bindings) {
                // delete mapping from command to key binding
                _commandMap[binding.commandID] = bindings.filter(function (b) {
                    return (b.key !== normalizedKey);
                });

                if (command) {
                    command.trigger(EVENT_KEY_BINDING_REMOVED, {key: normalizedKey, displayKey: binding.displayKey});
                    exports.trigger(EVENT_KEY_BINDING_REMOVED, {
                        commandID: command.getID(),
                        key: normalizedKey,
                        displayKey: binding.displayKey
                    });
                }
            }
        }
    }

    /**
     * Updates _allCommands array and _defaultKeyMap with the new key binding
     * if it is not yet in the _allCommands array. _allCommands array is initialized
     * only in extensionsLoaded event. So any new commands or key bindings added after
     * that will be updated here.
     *
     * @private
     * @param {{commandID: string, key: string, displayKey:string, explicitPlatform: string}} newBinding
     */
    function _updateCommandAndKeyMaps(newBinding) {
        if (_allCommands.length === 0) {
            return;
        }

        if (newBinding && newBinding.commandID && _allCommands.indexOf(newBinding.commandID) === -1) {
            _defaultKeyMap[newBinding.commandID] = _.cloneDeep(newBinding);

            // Process user key map again to catch any reassignment to all new key bindings added from extensions.
            _loadUserKeyMap();
        }
    }

    /**
     * @private
     *
     * @param {string} commandID
     * @param {string|{{key: string, displayKey: string}}} keyBinding - a single shortcut.
     * @param {string?} platform
     *     - "all" indicates all platforms, not overridable
     *     - undefined indicates all platforms, overridden by platform-specific binding
     * @param {boolean?} userBindings true if adding a user key binding or undefined otherwise.
     * @param {boolean?} isMenuShortcut
     * @return {?{key: string, displayKey:String}} Returns a record for valid key bindings.
     *     Returns null when key binding platform does not match, binding does not normalize,
     *     or is already assigned.
     */
    function _addBinding(commandID, keyBinding, {platform, userBindings, isMenuShortcut}) {
        knownBindableCommands.add(commandID);
        let key,
            result = null,
            normalized,
            normalizedDisplay,
            explicitPlatform = keyBinding.platform || platform,
            explicitBrowserOnly = keyBinding.browserOnly,
            explicitNativeOnly = keyBinding.nativeOnly,
            targetPlatform,
            command,
            bindingsToDelete = [],
            existing;

        if(Phoenix.isNativeApp && explicitBrowserOnly) {
            return null;
        }
        if(!Phoenix.isNativeApp && explicitNativeOnly) {
            return null;
        }
        // For platform: "all", use explicit current platform
        if (explicitPlatform && explicitPlatform !== "all") {
            targetPlatform = explicitPlatform;
        } else {
            targetPlatform = brackets.platform;
        }


        // Skip if the key binding is not for this platform.
        if (explicitPlatform === "mac" && brackets.platform !== "mac") {
            return null;
        }

        // if the request does not specify an explicit platform, and we're
        // currently on a mac, then replace Ctrl with Cmd.
        key = (keyBinding.key) || keyBinding;
        if (brackets.platform === "mac" && (explicitPlatform === undefined || explicitPlatform === "all")) {
            key = key.replace("Ctrl", "Cmd");
            if (keyBinding.displayKey !== undefined) {
                keyBinding.displayKey = keyBinding.displayKey.replace("Ctrl", "Cmd");
            }
        }

        normalized = normalizeKeyDescriptorString(key);

        // skip if the key binding is invalid
        if (!normalized) {
            console.error(`Unable to parse key binding '${key}' for command '${commandID}'. Permitted modifiers: Ctrl, Cmd, Alt, Opt, Shift; separated by '-' (not '+').`);
            return null;
        }
        function isSingleCharAZ(str) {
            return /^[A-Z]$/i.test(str);
        }
        const keySplit = normalized.split("-");
        if(!isMenuShortcut && ((keySplit.length ===2 && keySplit[0] === 'Alt' && isSingleCharAZ(keySplit[1])) ||
            (keySplit.length ===3 && keySplit[0] === 'Alt' && keySplit[1] === 'Shift' && isSingleCharAZ(keySplit[2])))){
            console.error(`Key binding '${normalized}' for command '${commandID}' may cause issues. The key combinations starting with 'Alt-<letter>' and 'Alt-Shift-<letter>' are reserved. On macOS, they are used for AltGr internationalization, and on Windows/Linux, they are used for menu navigation shortcuts. If this is a menu shortcut, use 'isMenuShortcut' option.`);
        }
        // ctrl-alt-<key> events are allowed in all platforms. In windows ctrl-alt-<key> events are treated as altGr
        // and used for international keyboards. But we have special handling for detecting alt gr key press that
        // accounts for this and disables keybinding manager inwindows on detecting altGr key press.
        // See _detectAltGrKeyDown function in this file.

        // check for duplicate key bindings
        existing = _keyMap[normalized];

        // for cross-platform compatibility
        if (exports.useWindowsCompatibleBindings) {
            // windows-only key bindings are used as the default binding
            // only if a default binding wasn't already defined
            if (explicitPlatform === "win") {
                // search for a generic or platform-specific binding if it
                // already exists
                if (existing && (!existing.explicitPlatform ||
                                 existing.explicitPlatform === brackets.platform ||
                                 existing.explicitPlatform === "all")) {
                    // do not clobber existing binding with windows-only binding
                    return null;
                }

                // target this windows binding for the current platform
                targetPlatform = brackets.platform;
            }
        }

        // skip if this binding doesn't match the current platform
        if (targetPlatform !== brackets.platform) {
            return null;
        }

        // skip if the key is already assigned
        if (existing) {
            if (!existing.explicitPlatform && explicitPlatform) {
                // remove the the generic binding to replace with this new platform-specific binding
                removeBinding(normalized);
                existing = false;
            }
        }

        // delete existing bindings when
        // (1) replacing a windows-compatible binding with a generic or
        //     platform-specific binding
        // (2) replacing a generic binding with a platform-specific binding
        let existingBindings = _commandMap[commandID] || [],
            isWindowsCompatible,
            isReplaceGeneric,
            ignoreGeneric;

        existingBindings.forEach(function (binding) {
            // remove windows-only bindings in _commandMap
            isWindowsCompatible = exports.useWindowsCompatibleBindings &&
                binding.explicitPlatform === "win";

            // remove existing generic binding
            isReplaceGeneric = !binding.explicitPlatform &&
                explicitPlatform;

            if (isWindowsCompatible || isReplaceGeneric) {
                bindingsToDelete.push(binding);
            } else {
                // existing binding is platform-specific and the requested binding is generic
                ignoreGeneric = binding.explicitPlatform && !explicitPlatform;
            }
        });

        if (ignoreGeneric) {
            // explicit command binding overrides this one
            return null;
        }

        if (existing) {
            // do not re-assign a key binding
            if(commandID !== _keyMap[normalized].commandID) {
                console.error("Cannot assign " + normalized + " to " + commandID + ". It is already assigned to " + _keyMap[normalized].commandID);
            }// else the same shortcut is already there, do nothing
            return null;
        }

        // remove generic or windows-compatible bindings
        bindingsToDelete.forEach(function (binding) {
            removeBinding(binding.key);
        });

        // optional display-friendly string (e.g. CMD-+ instead of CMD-=)
        normalizedDisplay = (keyBinding.displayKey) ? normalizeKeyDescriptorString(keyBinding.displayKey) : normalized;

        // 1-to-many commandID mapping to key binding
        if (!_commandMap[commandID]) {
            _commandMap[commandID] = [];
        }

        result = {
            key: normalized,
            displayKey: normalizedDisplay,
            explicitPlatform: explicitPlatform
        };

        _commandMap[commandID].push(result);

        // 1-to-1 key binding to commandID
        _keyMap[normalized] = {
            commandID: commandID,
            key: normalized,
            displayKey: normalizedDisplay,
            explicitPlatform: explicitPlatform
        };

        if (!userBindings) {
            _updateCommandAndKeyMaps(_keyMap[normalized]);
        }

        // notify listeners
        command = CommandManager.get(commandID);

        if (command) {
            command.trigger(EVENT_KEY_BINDING_ADDED, result, commandID);
            exports.trigger(EVENT_KEY_BINDING_ADDED, result, commandID);
        }

        return result;
    }

    /**
     * Returns a copy of the current key map. If the optional 'defaults' parameter is true,
     * then a copy of the default key map is returned.
     * In the default keymap each key is associated with an object containing `commandID`, `key`, and `displayKey`.
     *
     * @param {boolean=} defaults true if the caller wants a copy of the default key map. Otherwise, the current active key map is returned.
     * @return {Object}
     */
    function getKeymap(defaults) {
        return $.extend({}, defaults ? _defaultKeyMap : _keyMap);
    }

    function _makeMapFromArray(map, arr){
        for(let item of arr) {
            map[item] = true;
        }
        return map;
    }

    /**
     * If there is a registered and enabled key event, we always mark the event as processed
     * except the ones in UN_SWALLOWED_EVENTS.
     *
     * @private
     * @type {Array.<string>}
     */
    const UN_SWALLOWED_EVENTS = _makeMapFromArray({}, [
        Commands.EDIT_SELECT_ALL,
        Commands.EDIT_UNDO,
        Commands.EDIT_REDO,
        Commands.EDIT_CUT,
        Commands.EDIT_COPY,
        Commands.EDIT_PASTE
    ]);

    // single keys except function keys and key combinations are never swallowed. Áka we want default behavior
    // for the below keys if the command handler for the registered key didnt do anything.
    let UN_SWALLOWED_KEYS = _makeMapFromArray({},
        _keyNames.concat(_reservedShortcuts)
            .concat(_macReservedShortcuts));
    function _isUnSwallowedKeys(key) {
        return UN_SWALLOWED_KEYS[key] || key.length === 1; // keys like a-z, 0-9 etc
    }

    /**
     * Process the keybinding for the current key.
     *
     * @private
     * @param {string} key A key-description string.
     * @return {boolean} true if the key was processed, false otherwise
     */
    function _handleKey(key) {
        if (_enabled && _keyMap[key]) {
            Metrics.countEvent(Metrics.EVENT_TYPE.KEYBOARD, "shortcut", key);
            Metrics.countEvent(Metrics.EVENT_TYPE.KEYBOARD, "command", _keyMap[key].commandID);
            logger.leaveTrail("Keyboard shortcut: " + key + " command: " + _keyMap[key].commandID);
            // If there is a registered and enabled key event except the swallowed key events,
            // we always mark the event as processed and return true.
            // We don't want multiple behavior tied to the same key event. For Instance, in browser, if `ctrl-k`
            // is not handled by quick edit, it will open browser url bar if we return false here(which is bad ux).
            let command = CommandManager.get(_keyMap[key].commandID);
            let eventDetails = undefined;
            if(command._options.eventSource){
                eventDetails = {
                    eventSource: CommandManager.SOURCE_KEYBOARD_SHORTCUT,
                    sourceType: key
                };
            }
            let promise = CommandManager.execute(_keyMap[key].commandID, eventDetails);
            if(UN_SWALLOWED_EVENTS[_keyMap[key].commandID] || _isUnSwallowedKeys(key)){
                // The execute() function returns a promise because some commands are async.
                // Generally, commands decide whether they can run or not synchronously,
                // and reject immediately, so we can test for that synchronously.
                return (promise.state() !== "rejected");
            }
            return true;
        }
        return false;
    }

    /**
     * Sort objects by platform property. Objects with a platform property come
     * before objects without a platform property.
     *
     * @private
     */
    function _sortByPlatform(a, b) {
        let a1 = (a.platform) ? 1 : 0,
            b1 = (b.platform) ? 1 : 0;
        return b1 - a1;
    }

    /**
     * Add one or more key bindings to a particular Command.
     * Returns record(s) for valid key binding(s).
     *
     * @param {!string | Command} command - A command ID or command object
     * @param {{key: string, displayKey:string, platform: string, browserOnly: boolean, nativeOnly:boolean}} keyBindings
     *     A single key binding or an array of keybindings.
     *     In an array of keybinding `platform` property is also available. Example:
     *     "Shift-Cmd-F". Mac and Win key equivalents are automatically
     *     mapped to each other. Use displayKey property to display a different
     *     string (e.g. "CMD+" instead of "CMD="). if browserOnly is true, then the shortcut will only apply in browser
     *     if nativeOnly is set, the shortcut will only apply in native apps
     * @param {?string} platform The target OS of the keyBindings either
     *     "mac", "win" or "linux". If undefined, all platforms not explicitly
     *     defined will use the key binding.
     *     NOTE: If platform is not specified, Ctrl will be replaced by Cmd for "mac" platform
     * @param {object?} options
     * @param {boolean?} options.isMenuShortcut this allows alt-key shortcuts to be registered.
     * @return {{key: string, displayKey:string}}
     */
    function addBinding(command, keyBindings, platform, options={}) {
        let commandID = "",
            results,
            isMenuShortcut = options.isMenuShortcut;

        if (!command) {
            console.error("addBinding(): missing required parameter: command");
            return;
        }

        if (!keyBindings) { return; }

        if (typeof (command) === "string") {
            commandID = command;
        } else {
            commandID = command.getID();
        }

        if (Array.isArray(keyBindings)) {
            let keyBinding;
            results = [];

            // process platform-specific bindings first
            keyBindings.sort(_sortByPlatform);

            keyBindings.forEach(function (keyBindingRequest) {
                // attempt to add keybinding
                keyBinding = _addBinding(commandID, keyBindingRequest, {
                    platform: keyBindingRequest.platform,
                    isMenuShortcut: isMenuShortcut
                });

                if (keyBinding) {
                    results.push(keyBinding);
                }
            });
        } else {
            results = _addBinding(commandID, keyBindings, {
                platform: platform,
                isMenuShortcut: isMenuShortcut
            });
        }

        return results;
    }
    /**
     * Retrieve key bindings currently associated with a command
     *
     * @param {!string | Command} command - A command ID or command object
     * @return {Array.<Object>} The object has two properties `key` and `displayKey`
     */
    function getKeyBindings(command) {
        let bindings    = [],
            commandID   = "";

        if (!command) {
            console.error("getKeyBindings(): missing required parameter: command");
            return [];
        }

        if (typeof (command) === "string") {
            commandID = command;
        } else {
            commandID = command.getID();
        }

        bindings = _commandMap[commandID];
        return bindings || [];
    }

    /**
     * Retrieves the platform-specific string representation of the key bindings for a specified command.
     * This function is useful for displaying the keyboard shortcut associated with a given command ID to the user.
     * If a key binding is found for the command, it returns the formatted key descriptor. Otherwise, it returns null.
     *
     * @param {string} commandID - The unique identifier of the command for which the key binding is to be retrieved.
     * @returns {string|null} The formatted key binding as a string if available; otherwise, null.
     */
    function getKeyBindingsDisplay(commandID) {
        let shortCut = getKeyBindings(commandID);
        if (shortCut && shortCut[0] && shortCut[0].displayKey) {
            return formatKeyDescriptor(shortCut[0].displayKey);
        }
        return null;
    }


    const _handledCommands = {};
    /**
     * Adds default key bindings when commands are registered to CommandManager
     *
     * @private
     * @param {$.Event} event jQuery event
     * @param {Command} command Newly registered command
     */
    function _handleCommandRegistered(event, command) {
        let commandId   = command.getID(),
            defaults    = KeyboardPrefs[commandId];

        if (defaults) {
            _handledCommands[commandId] = true;
            addBinding(commandId, defaults);
        }
    }

    function _initDefaultShortcuts() {
        for(let commandId of _allCommands){
            let defaults    = KeyboardPrefs[commandId];

            if (defaults && !_handledCommands[commandId]) {
                addBinding(commandId, defaults);
            }
        }
    }

    /**
     * Adds a global keydown hook that gets first crack at keydown events
     * before standard keybindings do. This is intended for use by modal or
     * semi-modal UI elements like dialogs or the code hint list that should
     * execute before normal command bindings are run.
     *
     * The hook is passed two parameters, the first param is the original keyboard event.
     * The second param is the deduced shortcut string like `Ctrl-F` if present for
     * that event or null if not keyboard shortcut string. If the
     * hook handles the event (or wants to block other global hooks from
     * handling the event), it should return true. Note that this will *only*
     * stop other global hooks and KeyBindingManager from handling the
     * event; to prevent further event propagation, you will need to call
     * stopPropagation(), stopImmediatePropagation(), and/or preventDefault()
     * as usual.
     *
     * Multiple keydown hooks can be registered, and are executed in order,
     * most-recently-added first. A keydown hook will only be added once if the same
     * hook is already added before.
     *
     * (We have to have a special API for this because (1) handlers are normally
     * called in least-recently-added order, and we want most-recently-added;
     * (2) native DOM events don't have a way for us to find out if
     * stopImmediatePropagation()/stopPropagation() has been called on the
     * event, so we have to have some other way for one of the hooks to
     * indicate that it wants to block the other hooks from running.)
     *
     * @param {function(Event): boolean} hook The global hook to add.
     */
    function addGlobalKeydownHook(hook) {
        let index = _globalKeydownHooks.indexOf(hook);
        if (index !== -1) {
            return;
        }
        _globalKeydownHooks.push(hook);
    }

    /**
     * Removes a global keydown hook added by `addGlobalKeydownHook`.
     * Does not need to be the most recently added hook.
     *
     * @param {function(Event): boolean} hook The global hook to remove.
     */
    function removeGlobalKeydownHook(hook) {
        let index = _globalKeydownHooks.indexOf(hook);
        if (index !== -1) {
            _globalKeydownHooks.splice(index, 1);
        }
    }

    let lastCtrlKeyPressTime = 0; // Store the time of the last key press
    let pressCount = 0; // Counter for consecutive Control key presses
    const doublePressInterval = 250; // Maximum time interval between presses, in milliseconds, to consider it a double press
    const PRESS_ACTIVATE_COUNT = 3;
    const ctrlKeyCodes = {
        ControlLeft: true,
        ControlRight: true,
        MetaLeft: true,
        MetaRight: true,
        Control: true,
        Meta: true
    };
    let isCtrlDepressed = false; // flag set to true if the user keeps the ctrl key pressed without releasing
    function _detectTripleCtrlKeyPress(event) {
        const isCtrlKeyPressStart = !isCtrlDepressed;
        if (ctrlKeyCodes[event.code] && ctrlKeyCodes[event.key]) {
            isCtrlDepressed = true;
        }
        if(PreferencesManager && !PreferencesManager.get(PREF_TRIPLE_CTRL_KEY_PRESS_ENABLED)){
            return false;
        }
        const currentTime = new Date().getTime(); // Get the current time
        if (ctrlKeyCodes[event.code] && ctrlKeyCodes[event.key] && !event.shiftKey && !event.altKey
            && isCtrlKeyPressStart) {
            pressCount++;
            isCtrlDepressed = true;
            if(pressCount === PRESS_ACTIVATE_COUNT && (currentTime - lastCtrlKeyPressTime) <= doublePressInterval) {
                KeyboardOverlayMode.startOverlayMode();
                event.stopPropagation();
                event.preventDefault();
                lastCtrlKeyPressTime = currentTime;
                Metrics.countEvent(Metrics.EVENT_TYPE.KEYBOARD, 'ctrlx'+PRESS_ACTIVATE_COUNT, "showOverlay");
                return true;
            }
            if((currentTime - lastCtrlKeyPressTime) > doublePressInterval){
                pressCount = 1;
            }
            lastCtrlKeyPressTime = currentTime;
        } else {
            pressCount = 0;
        }
        return false;
    }

    const dontHideMouseOnKeys = {
        "Escape": true,
        "ArrowLeft": true,
        "ArrowRight": true,
        "ArrowUp": true,
        "ArrowDown": true,
        "Home": true,
        "End": true,
        "PageUp": true,
        "PageDown": true,
        "Shift": true,
        "Control": true,
        "Alt": true,
        "Meta": true,
        "F1": true,
        "F2": true,
        "F3": true,
        "F4": true,
        "F5": true,
        "F6": true,
        "F7": true,
        "F8": true,
        "F9": true,
        "F10": true,
        "F11": true,
        "F12": true,
        "Insert": true,
        "ContextMenu": true,
        "NumLock": true,
        "ScrollLock": true,
        "CapsLock": true
    };
    let mouseCursorHidden = false;
    function _hideMouseCursonOnTyping(event) {
        if(dontHideMouseOnKeys[event.key] || mouseCursorHidden){
            return;
        }
        mouseCursorHidden = true;
        if(!Phoenix.isSpecRunnerWindow){
            document.body.classList.add('hide-cursor');
        }
    }

    /**
     * Handles a given keydown event, checking global hooks first before
     * deciding to handle it ourselves.
     *
     * @private
     * @param {Event} event The keydown event to handle.
     */
    function _handleKeyEvent(event) {
        _hideMouseCursonOnTyping(event);
        if(KeyboardOverlayMode.isInOverlayMode()){
            return KeyboardOverlayMode.processOverlayKeyboardEvent(event);
        }
        if(_detectTripleCtrlKeyPress(event)){
            return true;
        }
        const shortcut = _translateKeyboardEvent(event);
        let i, handled = false;
        for (i = _globalKeydownHooks.length - 1; i >= 0; i--) {
            if (_globalKeydownHooks[i](event, shortcut)) {
                handled = true;
                break;
            }
        }
        _detectAltGrKeyDown(event);
        if(keyboardShortcutCaptureInProgress) {
            return updateShortcutSelection(event, shortcut);
        }
        if (!handled && _handleKey(shortcut)) {
            event.stopPropagation();
            event.preventDefault();
        }
    }

    AppInit.htmlReady(function () {
        // Install keydown event listener.
        window.document.body.addEventListener(
            "keydown",
            _handleKeyEvent,
            true
        );
        window.document.body.addEventListener(
            "keyup",
            (event)=>{
                if (ctrlKeyCodes[event.code] && ctrlKeyCodes[event.key]) {
                    isCtrlDepressed = false;
                }
            },
            true
        );
        document.body.addEventListener('mousemove', ()=>{
            if(!mouseCursorHidden){
                return;
            }
            mouseCursorHidden = false;
            document.body.classList.remove('hide-cursor');
        });

        exports.useWindowsCompatibleBindings = (brackets.platform !== "mac") &&
            (brackets.platform !== "win");
    });

    /**
     * Displays an error dialog and also opens the user key map file for editing only if
     * the error is not the loading file error.
     *
     * @private
     * @param {?string} err Error type returned from JSON parser or open file operation
     * @param {string=} message Error message to be displayed in the dialog
     */
    function _showErrorsAndOpenKeyMap(err, message) {
        // Asynchronously loading Dialogs module to avoid the circular dependency
        require(["widgets/Dialogs"], function (Dialogs) {
            let errorMessage = Strings.ERROR_KEYMAP_CORRUPT;

            if (err === FileSystemError.UNSUPPORTED_ENCODING) {
                errorMessage = Strings.ERROR_LOADING_KEYMAP;
            } else if (message) {
                errorMessage = message;
            }

            Dialogs.showModalDialog(
                DefaultDialogs.DIALOG_ID_ERROR,
                Strings.ERROR_KEYMAP_TITLE,
                errorMessage
            )
                .done(function () {
                    if (err !== FileSystemError.UNSUPPORTED_ENCODING) {
                        CommandManager.execute(Commands.FILE_OPEN_KEYMAP);
                    }
                });
        });
    }

    /**
     * Checks whether the given command ID is a special command that the user can't bind
     * to another shortcut.
     *
     * @private
     * @param {!string} commandID A string referring to a specific command
     * @return {boolean} true if normalizedKey is a special command, false otherwise.
     */
    function _isSpecialCommand(commandID) {
        if (brackets.platform === "mac" && commandID === "file.quit") {
            return true;
        }

        return (_specialCommands.indexOf(commandID) > -1);
    }

    /**
     * Checks whether the given key combination is a shortcut of a special command
     * or a Mac system command that the user can't reassign to another command.
     *
     * @private
     * @param {!string} normalizedKey A key combination string used for a keyboard shortcut
     * @return {boolean} true if normalizedKey is a restricted shortcut, false otherwise.
     */
    function _isReservedShortcuts(normalizedKey) {
        if (!normalizedKey) {
            return false;
        }

        if (_reservedShortcuts.indexOf(normalizedKey) > -1 ||
                _reservedShortcuts.indexOf(normalizedKey.replace("Cmd", "Ctrl")) > -1) {
            return true;
        }

        if (brackets.platform === "mac" && _macReservedShortcuts.indexOf(normalizedKey) > -1) {
            return true;
        }

        return false;
    }

    /**
     * Creates a bullet list item for any item in the given list.
     *
     * @private
     * @param {Array.<string>} list An array of strings to be converted into a
     * message string with a bullet list.
     * @return {string} the html text version of the list
     */
    function _getBulletList(list) {
        let message = "<ul class='dialog-list'>";
        list.forEach(function (info) {
            message += "<li>" + info + "</li>";
        });
        message += "</ul>";
        return message;
    }

    /**
     * Gets the corresponding unicode symbol of an arrow key for display in the menu.
     *
     * @private
     * @param {string} key The non-modifier key used in the shortcut. It does not need to be normalized.
     * @return {string} An empty string if key is not one of those we want to show with the unicode symbol. Otherwise, the corresponding unicode symbol is returned.
     */
    function _getDisplayKey(key) {
        let displayKey = "",
            match = key ? key.match(/(Up|Down|Left|Right|\-)$/i) : null;
        if (match && !/Page(Up|Down)/.test(key)) {
            displayKey = key.substr(0, match.index) + _displayKeyMap[match[0].toLowerCase()];
        }
        return displayKey;
    }

    /**
     * Applies each user key binding to all the affected commands and updates _keyMap.
     * Shows errors in a dialog and then opens the user key map file if any of the following
     * is detected while applying the user key bindings.
     *     - A key binding is attempting to modify a special command.
     *     - A key binding is attempting to assign a shortcut of a special command to another one.
     *     - Multiple key bindings are specified for the same command ID.
     *     - The same key combination is listed for multiple key bindings.
     *     - A key binding has any invalid key syntax.
     *     - A key binding is referring to a non-existent command ID.
     *
     * @private
     */
    function _applyUserKeyBindings() {
        let remappedCommands   = [],
            remappedKeys       = [],
            restrictedCommands = [],
            restrictedKeys     = [],
            invalidKeys        = [],
            invalidCommands    = [],
            multipleKeys       = [],
            duplicateBindings  = [],
            errorMessage       = "";

        _.forEach(_customKeyMap, function (commandID, key) {
            let normalizedKey    = normalizeKeyDescriptorString(key),
                existingBindings = _commandMap[commandID] || [];

            // Skip this since we don't allow user to update key binding of a special
            // command like cut, copy, paste, undo, redo and select all.
            if (_isSpecialCommand(commandID)) {
                restrictedCommands.push(commandID);
                return;
            }

            // Skip this since we don't allow user to update a shortcut used in
            // a special command or any Mac system command.
            if (_isReservedShortcuts(normalizedKey)) {
                restrictedKeys.push(key);
                return;
            }

            // Skip this if the key is invalid.
            if (!normalizedKey) {
                invalidKeys.push(key);
                return;
            }

            if (_isKeyAssigned(normalizedKey)) {
                if (remappedKeys.indexOf(normalizedKey) !== -1) {
                    // JSON parser already removed all the duplicates that have the exact
                    // same case or order in their keys. So we're only detecting duplicate
                    // bindings that have different orders or different cases used in the key.
                    duplicateBindings.push(key);
                    return;
                }
                // The same key binding already exists, so skip this.
                if (_keyMap[normalizedKey].commandID === commandID) {
                    // Still need to add it to the remappedCommands so that
                    // we can detect any duplicate later on.
                    remappedCommands.push(commandID);
                    return;
                }
                removeBinding(normalizedKey);
            }

            if (remappedKeys.indexOf(normalizedKey) === -1) {
                remappedKeys.push(normalizedKey);
            }

            // Remove another key binding if the new key binding is for a command
            // that has a different key binding. e.g. "Ctrl-W": "edit.selectLine"
            // requires us to remove "Ctrl-W" from "file.close" command, but we
            // also need to remove "Ctrl-L" from "edit.selectLine".
            if (existingBindings.length) {
                existingBindings.forEach(function (binding) {
                    removeBinding(binding.key);
                });
            }

            if (commandID) {
                if (_allCommands.indexOf(commandID) !== -1) {
                    if (remappedCommands.indexOf(commandID) === -1) {
                        let keybinding = { key: normalizedKey };

                        keybinding.displayKey = _getDisplayKey(normalizedKey);
                        _addBinding(commandID, keybinding.displayKey ? keybinding : normalizedKey, {
                            platform: brackets.platform,
                            userBindings: true
                        });
                        remappedCommands.push(commandID);
                    } else {
                        multipleKeys.push(commandID);
                    }
                } else {
                    invalidCommands.push(commandID);
                }
            }
        });

        if (restrictedCommands.length) {
            errorMessage = StringUtils.format(Strings.ERROR_RESTRICTED_COMMANDS, _getBulletList(restrictedCommands));
        }

        if (restrictedKeys.length) {
            errorMessage += StringUtils.format(Strings.ERROR_RESTRICTED_SHORTCUTS, _getBulletList(restrictedKeys));
        }

        if (multipleKeys.length) {
            errorMessage += StringUtils.format(Strings.ERROR_MULTIPLE_SHORTCUTS, _getBulletList(multipleKeys));
        }

        if (duplicateBindings.length) {
            errorMessage += StringUtils.format(Strings.ERROR_DUPLICATE_SHORTCUTS, _getBulletList(duplicateBindings));
        }

        if (invalidKeys.length) {
            errorMessage += StringUtils.format(Strings.ERROR_INVALID_SHORTCUTS, _getBulletList(invalidKeys));
        }

        if (invalidCommands.length) {
            errorMessage += StringUtils.format(Strings.ERROR_NONEXISTENT_COMMANDS, _getBulletList(invalidCommands));
        }

        if (_showErrors && errorMessage) {
            _showErrorsAndOpenKeyMap("", errorMessage);
        }
    }

    /**
     * Restores the default key bindings for all the commands that are modified by each key binding
     * specified in _customKeyMapCache (old version) but no longer specified in _customKeyMap (new version).
     *
     * @private
     */
    function _undoPriorUserKeyBindings() {
        _.forEach(_customKeyMapCache, function (commandID, key) {
            let normalizedKey  = normalizeKeyDescriptorString(key),
                defaults       = _.find(_.toArray(_defaultKeyMap), { "commandID": commandID }),
                defaultCommand = _defaultKeyMap[normalizedKey];

            // We didn't modified this before, so skip it.
            if (_isSpecialCommand(commandID) ||
                    _isReservedShortcuts(normalizedKey)) {
                return;
            }

            if (_isKeyAssigned(normalizedKey) &&
                    _customKeyMap[key] !== commandID && _customKeyMap[normalizedKey] !== commandID) {
                // Unassign the key from any command. e.g. "Cmd-W": "file.open" in _customKeyMapCache
                // will require us to remove Cmd-W shortcut from file.open command.
                removeBinding(normalizedKey);
            }

            // Reassign the default key binding. e.g. "Cmd-W": "file.open" in _customKeyMapCache
            // will require us to reassign Cmd-O shortcut to file.open command.
            if (defaults) {
                addBinding(commandID, defaults, brackets.platform);
            }

            // Reassign the default key binding of the previously modified command.
            // e.g. "Cmd-W": "file.open" in _customKeyMapCache will require us to reassign Cmd-W
            // shortcut to file.close command.
            if (defaultCommand && defaultCommand.key) {
                addBinding(defaultCommand.commandID, defaultCommand.key, brackets.platform);
            }
        });
    }

    /**
     * Gets the full file path to the user key map file. In testing environment
     * a different file path is returned so that running integration tests won't
     * pop up the error dialog showing the errors from the actual user key map file.
     *
     * @private
     * @return {string} full file path to the user key map file.
     */
    function _getUserKeyMapFilePath() {
        if (window.isBracketsTestWindow) {
            return path.normalize(brackets.app.getApplicationSupportDirectory() + "/_test_/" + KEYMAP_FILENAME);
        }
        return _userKeyMapFilePath;
    }

    async function _addToUserKeymapFile(shortcut, commandID) {
        if(shortcut instanceof Array && commandID) {
            console.error("Shortcut arrays can be specified only if the command id is null", shortcut, commandID);
            return;
        }
        let file   = FileSystem.getFileForPath(_getUserKeyMapFilePath());
        let userKeyMap = {overrides:{}};
        let keyMapExists = await Phoenix.VFS.existsAsync(file.fullPath);
        if (keyMapExists) {
            const text = await deferredToPromise(FileUtils.readAsText(file, true));
            try {
                if (text) {
                    userKeyMap = JSON.parse(text);
                    const overrides = userKeyMap.overrides || {};
                    // check if the same command is already assigned a shortcut, then remove before we add
                    // a new shortcut. This is because when one command has multiple shortcuts, we usually
                    // show a duplicate shortcut dialog. this is unlikely to happen when using the ui. only happens
                    // when a use manually edits the json. in which case we hope he knows what he is doing.
                    for(let shortcutKey of Object.keys(overrides)) {
                        if(commandID && overrides[shortcutKey] === commandID){
                            delete overrides[shortcutKey];
                        }
                    }
                }
            } catch (err) {
                // Cannot parse the text read from the key map file.
                console.error("Error reading ", _getUserKeyMapFilePath(), err);
                return;
            }
        }
        if(shortcut instanceof Array) {
            for(let shortcutKey of shortcut) {
                if(!_isReservedShortcuts(shortcutKey)) {
                    userKeyMap.overrides[shortcutKey] = commandID;
                }
            }
        } else {
            if(!_isReservedShortcuts(shortcut)) {
                userKeyMap.overrides[shortcut] = commandID;
            } // else we should show an error message here, but not doing it for now.
        }
        const textContent = JSON.stringify(userKeyMap, null, 4);
        await deferredToPromise(FileUtils.writeText(file, textContent, true));
        _loadUserKeyMap();
    }

    /**
     * Reads in the user key map file and parses its content into JSON.
     * Returns the user key bindings if JSON has "overrides".
     * Otherwise, returns an empty object or an error if the file
     * cannot be parsed or loaded.
     *
     * @private
     * @return {$.Promise} a jQuery promise that will be resolved with the JSON
     * object if the user key map file has "overrides" property or an empty JSON.
     * If the key map file cannot be read or cannot be parsed by the JSON parser,
     * then the promise is rejected with an error.
     */
    function _readUserKeyMap() {
        let file   = FileSystem.getFileForPath(_getUserKeyMapFilePath()),
            result = new $.Deferred();

        file.exists(function (err, doesExist) {
            if (doesExist) {
                FileUtils.readAsText(file, true)
                    .done(function (text) {
                        let keyMap = {};
                        try {
                            if (text) {
                                let json = JSON.parse(text);
                                // If no overrides, return an empty key map.
                                result.resolve((json && json.overrides) || keyMap);
                            } else {
                                // The file is empty, so return an empty key map.
                                result.resolve(keyMap);
                            }
                        } catch (err) {
                            // Cannot parse the text read from the key map file.
                            result.reject(err);
                        }
                    })
                    .fail(function (err) {
                        // Key map file cannot be loaded.
                        result.reject(err);
                    });
            } else {
                // Just resolve if no user key map file
                result.resolve({});
            }
        });
        return result.promise();
    }

    /**
     * This can be used by extensions to register new kepmap packs that can be listed in the keyboard shortcuts panel
     * under use preset dropdown. For EG. distribute a `netbeans editor` shortcuts pack via extension.
     *
     * @param {string} packID - A unique ID for the pack. Use `extensionID.name` format to avoid collisions.
     * @param {string} packName - A name for the pack.
     * @param {Object} keyMap - a keymap of the format `{'Ctrl-Alt-L': 'file.liveFilePreview'}` depending on the platform.
     * The extension should decide the correct keymap based on the platform before calling this function.
     */
    function registerCustomKeymapPack(packID, packName, keyMap) {
        if(_registeredCustomKeyMaps[packID]){
            console.error(`registerCustomKeymapPack: ${packID} with name ${packName} is already registered. Ignoring`);
            return;
        }
        console.log("registering custom keymap pack", packID, packName);
        _registeredCustomKeyMaps[packID] = {
            packageName: packName,
            keyMap: _getNormalisedKeyMap(keyMap)
        };
        if(_customKeymapIDInUse === packID) {
            _loadUserKeyMap();
        }
        exports.trigger(EVENT_NEW_PRESET, packID);
    }

    /**
     * Responsible to get all the custom keymap packs
     *
     * @returns {Array.<Object>} an array of all the custom keymap packs,
     * each pack is an object with keys: `packID`, `packageName` & `keyMap`
     */
    function getAllCustomKeymapPacks() {
        const packDetails = [];
        for(let packID of Object.keys(_registeredCustomKeyMaps)){
            packDetails.push({
                packID,
                packageName: _registeredCustomKeyMaps[packID].packageName,
                keyMap: structuredClone(_registeredCustomKeyMaps[packID].keyMap)
            });
        }
        return packDetails;
    }

    /**
     * To get the current custom keymap pack
     *
     * @returns {Object} the current custom keymap pack
     */
    function getCurrentCustomKeymapPack() {
        return _registeredCustomKeyMaps[_customKeymapIDInUse];
    }

    /**
     * Determines the origin of a custom keyboard shortcut is from user keymap.json or a custom keymap preset.
     * If it is neither (Eg. phoenix default shortcuts, will return null.)
     *
     * @private
     * @param {string} shortcut - The keyboard shortcut to check.
     * @returns {string|null} - The origin of the custom shortcut, or null if it is not a custom shortcut.
     */
    function _getCustomShortcutOrigin(shortcut) {
        shortcut = normalizeKeyDescriptorString(shortcut);
        if(_originalUserKeyMap.hasOwnProperty(shortcut)){
            return Strings.KEYBOARD_SHORTCUT_SRC_USER;
        } else if(_customKeyMap.hasOwnProperty(shortcut) && _customKeymapIDInUse &&
            _registeredCustomKeyMaps[_customKeymapIDInUse]){
            return StringUtils.format(Strings.KEYBOARD_SHORTCUT_SRC_PRESET,
                _registeredCustomKeyMaps[_customKeymapIDInUse].packageName);
        }
        return null;
    }

    /**
     * internal use, this is for setting the current custom keyboard pack.
     *
     * @param packID
     * @private
     */
    function _setCurrentCustomKeymapPack(packID) {
        if(!PreferencesManager){
            throw new Error("setCurrentCustomKeymapPack should be called only after appinit event.");
        }
        PreferencesManager.stateManager.set(STATE_CUSTOM_KEY_MAP_ID, packID);
    }

    function _mixCustomKeyMaps(userKeyMap) {
        if(!_customKeymapIDInUse || !_registeredCustomKeyMaps[_customKeymapIDInUse]){
            return userKeyMap;
        }
        Metrics.countEvent(Metrics.EVENT_TYPE.KEYBOARD, 'preset', _customKeymapIDInUse);
        // the custom keymap is something like {"Ctrl-Shift-&": "navigate.gotoFirstProblem"} .
        // user defined shortcuts take precedence over custom shortcuts.
        const customKeyMap = _registeredCustomKeyMaps[_customKeymapIDInUse].keyMap;
        const userDefinedKeys = Object.keys(userKeyMap);
        const userDefinedCommandIDs = Object.values(userKeyMap);
        for(const customKey of Object.keys(customKeyMap)){
            const customCommand = customKeyMap[customKey];
            if(!userDefinedCommandIDs.includes(customCommand) && !userDefinedKeys.includes(customKey)){
                // Assigning multiple shortcuts to the same command will throw a dialog, so we omit a custom command
                // that is already assigned by user defined command. Also if a shortcut is already in user keymap, we
                // wont apply the custom keymap
                userKeyMap[customKey] = customCommand;
            }
        }
    }

    function _getNormalisedKeyMap(keyMap) {
        const normalisedKeyMap = {};
        const normalisedKeyMapCounts = {};
        // if the supplied keymap has duplicates, we have to retain them as is for error dialogs later. Eg:
        // { "ctrl-2": "file.newFile", "Ctrl-2": "navigate.previousMatch", // observe case of Ctrl here
        //   "Ctrl-Alt-4": "view.toggleSidebar", "Alt-Ctrl-4": "view.toggleSidebar"}
        for(let key of Object.keys(keyMap)) {
            const normalisedKey = normalizeKeyDescriptorString(key);
            normalisedKeyMapCounts[normalisedKey] = (normalisedKeyMapCounts[normalisedKey] || 0) + 1;
        }
        for(let key of Object.keys(keyMap)) {
            try {
                const normalisedKey = normalizeKeyDescriptorString(key);
                if(normalisedKeyMapCounts[normalisedKey] === 1) {
                    normalisedKeyMap[normalisedKey] = keyMap[key];
                } else {
                    // if we are here, it means the supplied keymap has non-normalised duplicates.
                    // in case of duplicates, we will keep the keys as is in the map for the error dialogs to kick in.
                    normalisedKeyMap[key] = keyMap[key];
                }
            } catch (e) {
                console.error("Error normalising user keymap key: ", key, e);
                // we will still inject the key with error as so that the error dialogs will come up as expected.
                normalisedKeyMap[key] = keyMap[key];
            }
        }
        return normalisedKeyMap;
    }

    /**
     * Reads in the user key bindings and updates the key map with each user key
     * binding by removing the existing one assigned to each key and adding
     * new one for the specified command id. Shows errors and opens the user
     * key map file if it cannot be parsed.
     *
     * This function is wrapped with debounce so that its execution is always delayed
     * by 200 ms. The delay is required because when this function is called some
     * extensions may still be adding some commands and their key bindings asynchronously.
     *
     * @private
     */
    function _loadUserKeyMapImmediate() {
        return new Promise((resolve, reject)=>{
            _readUserKeyMap()
                .then(function (keyMap) {
                    keyMap = _getNormalisedKeyMap(keyMap);
                    _originalUserKeyMap = structuredClone(keyMap);
                    _mixCustomKeyMaps(keyMap);
                    // Some extensions may add a new command without any key binding. So
                    // we always have to get all commands again to ensure that we also have
                    // those from any extensions installed during the current session.
                    _allCommands = CommandManager.getAll();

                    _customKeyMapCache = _.cloneDeep(_customKeyMap);
                    _customKeyMap = keyMap;
                    _undoPriorUserKeyBindings();
                    _applyUserKeyBindings();
                    resolve();
                }, function (err) {
                    _showErrorsAndOpenKeyMap(err);
                    console.error(err);
                    // we always resolve here as the event is handled
                    resolve();
                });
        });
    };

    /**
     * resets all user defined shortcuts
     *
     * @return {Promise|Promise<void>|*}
     */
    function resetUserShortcutsAsync() {
        return new Promise((resolve, reject)=>{
            let userKeyMapPath = _getUserKeyMapFilePath(),
                file = FileSystem.getFileForPath(userKeyMapPath);
            let defaultContent = "{\n    \"documentation\": \"https://github.com/phcode-dev/phoenix/wiki/User-%60keymap.json%60\"," +
                "\n    \"overrides\": {" +
                "\n        \n    }\n}\n";

            return FileUtils.writeText(file, defaultContent, true).done(()=>{
                _loadUserKeyMapImmediate()
                    .then(resolve)
                    .catch(reject);
            }).fail(reject);
        });
    }

    /**
     * Opens the existing key map file or creates a new one with default content
     * if it does not exist.
     *
     * @private
     */
    function _openUserKeyMap() {
        let userKeyMapPath = _getUserKeyMapFilePath(),
            file = FileSystem.getFileForPath(userKeyMapPath);
        file.exists(function (err, doesExist) {
            if (doesExist) {
                CommandManager.execute(Commands.FILE_OPEN, { fullPath: userKeyMapPath });
            } else {
                resetUserShortcutsAsync().finally(function () {
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: userKeyMapPath });
                });
            }
        });
    }

    // Due to circular dependencies, not safe to call on() directly
    EventDispatcher.on_duringInit(CommandManager, "commandRegistered", _handleCommandRegistered);
    CommandManager.register(Strings.CMD_OPEN_KEYMAP, Commands.FILE_OPEN_KEYMAP, _openUserKeyMap);

    // Asynchronously loading DocumentManager to avoid the circular dependency
    require(["document/DocumentManager"], function (DocumentManager) {
        DocumentManager.on("documentSaved", function checkKeyMapUpdates(e, doc) {
            if (doc && doc.file.fullPath === _userKeyMapFilePath) {
                _loadUserKeyMap();
            }
        });
    });

    /**
     * Initializes _allCommands array and _defaultKeyMap so that we can use them for
     * detecting non-existent commands and restoring the original key binding.
     *
     * @private
     */
    function _initCommandAndKeyMaps() {
        _allCommands = CommandManager.getAll();
        // Keep a copy of the default key bindings before loading user key bindings.
        _initDefaultShortcuts();
        _defaultKeyMap = _.cloneDeep(_keyMap);
    }

    /**
     * Sets the full file path to the user key map file. Only used by unit tests
     * to load a test file instead of the actual user key map file.
     *
     * @private
     * @param {string} fullPath file path to the user key map file.
     */
    function _setUserKeyMapFilePath(fullPath) {
        _userKeyMapFilePath = fullPath;
    }

    AppInit.extensionsLoaded(function () {
        let params  = new UrlParams();
        params.parse();
        if (params.get("reloadWithoutUserExts") === "true") {
            _showErrors = false;
        }

        _initCommandAndKeyMaps(); // this will save the default keymap. custom keymap loads should only come after this.
        PreferencesManager = Phoenix.globalAPI && Phoenix.globalAPI.PreferencesManager;
        PreferencesManager.stateManager.definePreference(STATE_CUSTOM_KEY_MAP_ID, "string", null)
            .on("change", ()=>{
                _customKeymapIDInUse = PreferencesManager.stateManager.get(STATE_CUSTOM_KEY_MAP_ID);
                _loadUserKeyMap();
                exports.constructor(EVENT_PRESET_CHANGED, _customKeymapIDInUse);
            });
        PreferencesManager.definePreference(PREF_TRIPLE_CTRL_KEY_PRESS_ENABLED, "boolean", true, {
            description: Strings.DESCRIPTION_TRIPLE_CTRL_PALETTE
        });
        _customKeymapIDInUse = PreferencesManager.stateManager.get(STATE_CUSTOM_KEY_MAP_ID);
        _loadUserKeyMap();
    });

    /**
     * Whether the keyboard is in overlay mode or not
     *
     * @returns {boolean} True if in overlay mode else false
     */
    function isInOverlayMode() {
        return KeyboardOverlayMode.isInOverlayMode();
    }

    function _isAnAssignableKey(key) {
        if(!key){
            return false;
        }
        const split = key.split("-");
        if(split.length === 1 && key.length > 1 && key[0]==='F'){
            // F1-12
            return true;
        } else if(split.length === 2 && split[0] === "Shift" && split[1].length > 1){
            // Shift - F1-12, shift-PgUp etc... which are allowed
            return true;
        } else if(split.length === 2 && split[0] === "Shift" && split[1].length === 1){
            // Shift-A, Shift-! etc which are upper case chars -not shortcuts. we don't allow that.
            return false;
        } else if(key.includes("-")){
            // allow all compound shortcuts
            return true;
        }
        return false;
    }

    function updateShortcutSelection(event, key) {
        if(key && _isAnAssignableKey(key) && normalizeKeyDescriptorString(key)) {
            let normalizedKey = normalizeKeyDescriptorString(key);
            if (_isReservedShortcuts(normalizedKey)) {
                console.warn("Cannot assign reserved shortcut: ", normalizedKey);
                event.stopPropagation();
                event.preventDefault();
                return true;
            }
            capturedShortcut = normalizedKey;
            let existingBinding = _keyMap[normalizedKey];
            if (!normalizedKey) {
                console.error("Failed to normalize " + key);
            } else if(existingBinding && existingBinding.commandID === keyboardShortcutCaptureInProgress.getID()){
                // user press the same shortcut that is already assigned to the command
                keyboardShortcutDialog.close();
                keyboardShortcutDialog = null;
                keyboardShortcutCaptureInProgress = null;
            } else if (existingBinding) {
                const command = CommandManager.get(existingBinding.commandID);
                $(".change-shortcut-dialog .message").html(
                    StringUtils.format(Strings.KEYBOARD_SHORTCUT_CHANGE_DIALOG_DUPLICATE,
                        key, command.getName(), keyboardShortcutCaptureInProgress.getName()));
                $(".change-shortcut-dialog .Assign").removeClass("forced-hidden").focus();
                $(".change-shortcut-dialog .Remove").addClass("forced-hidden");
            } else {
                keyboardShortcutDialog.close();
                keyboardShortcutDialog = null;
                _addToUserKeymapFile(key, keyboardShortcutCaptureInProgress.getID());
                keyboardShortcutCaptureInProgress = null;
            }
            event.stopPropagation();
            event.preventDefault();
        }
        return true;
    }

    let keyboardShortcutCaptureInProgress = null,
        keyboardShortcutDialog = null,
        capturedShortcut = null;

    /**
     * to display the shortcut selection dialog
     *
     * @param command
     */
    function showShortcutSelectionDialog(command) {
        Metrics.countEvent(Metrics.EVENT_TYPE.KEYBOARD, 'shortcut', "DialogShown");
        if(_isSpecialCommand(command.getID())){
            return;
        }
        const panelCommand = CommandManager.get(Commands.HELP_TOGGLE_SHORTCUTS_PANEL);
        capturedShortcut = null;
        const keyBindings = getKeyBindings(command);
        let currentShortcutText = Strings.KEYBOARD_SHORTCUT_NONE;
        if(keyBindings.length){
            currentShortcutText = keyBindings[0].displayKey || keyBindings[0].key;
            for(let i=1; i<keyBindings.length; i++){
                currentShortcutText = currentShortcutText + `, ${keyBindings[i].displayKey || keyBindings[i].key}`;
            }
        }
        keyboardShortcutCaptureInProgress = command;
        keyboardShortcutDialog = Dialogs.showModalDialogUsingTemplate(Mustache.render(KeyboardDialogTemplate, {
            Strings: Strings,
            message: StringUtils.format(Strings.KEYBOARD_SHORTCUT_CHANGE_DIALOG_TEXT, command.getName(), currentShortcutText)
        }));
        if(currentShortcutText === Strings.KEYBOARD_SHORTCUT_NONE){
            $(".change-shortcut-dialog .Remove").addClass("forced-hidden");
        }
        if(panelCommand && panelCommand.getChecked()){
            $(".change-shortcut-dialog .Show").addClass("forced-hidden");
        }
        keyboardShortcutDialog.done((closeReason)=>{
            if(closeReason === 'remove' && currentShortcutText){
                _addToUserKeymapFile(keyBindings.map(k=>k.key), null);
                Metrics.countEvent(Metrics.EVENT_TYPE.KEYBOARD, 'shortcut', "removed");
            } else if(closeReason === Dialogs.DIALOG_BTN_OK && capturedShortcut){
                _addToUserKeymapFile(capturedShortcut, command.getID());
                Metrics.countEvent(Metrics.EVENT_TYPE.KEYBOARD, 'shortcut', "changed");
            } else if(closeReason === 'show'){
                if(!panelCommand.getChecked()){
                    panelCommand.execute();
                }
            }
            capturedShortcut = null;
            keyboardShortcutCaptureInProgress = null;
            keyboardShortcutDialog = null;
        });
    }

    /**
     * Returns true the given command id can be overriden by user.
     *
     * @param commandId
     * @return {boolean}
     */
    function canAssignBinding(commandId) {
        return !_isSpecialCommand(commandId);
    }

    /**
     * gets a list of commands that are known to have had a key binding in this session. Note that this will contain
     * commands that may not currently have a key binding. IT is mainly used in keyboard shortcuts panel to list items
     * that can be assigned a key binding.
     *
     * @type {Set<string>}
     * @private
     */
    function _getKnownBindableCommands() {
        return new Set(knownBindableCommands);
    }

    EventDispatcher.makeEventDispatcher(exports);

    // unit test only
    exports._reset = _reset;
    exports._setUserKeyMapFilePath = _setUserKeyMapFilePath;
    exports._getUserKeyMapFilePath = _getUserKeyMapFilePath;
    exports._getDisplayKey = _getDisplayKey;
    exports._loadUserKeyMap = _loadUserKeyMap;
    exports._loadUserKeyMapImmediate = _loadUserKeyMapImmediate;
    exports._initCommandAndKeyMaps = _initCommandAndKeyMaps;
    exports._onCtrlUp = _onCtrlUp;

    // private api
    exports._getKnownBindableCommands = _getKnownBindableCommands;
    exports._getCustomShortcutOrigin = _getCustomShortcutOrigin;
    exports._setCurrentCustomKeymapPack = _setCurrentCustomKeymapPack;

    // Define public API
    exports.getKeymap = getKeymap;
    exports.canAssignBinding = canAssignBinding;
    exports.addBinding = addBinding;
    exports.removeBinding = removeBinding;
    exports.formatKeyDescriptor = formatKeyDescriptor;
    exports.getKeyBindings = getKeyBindings;
    exports.getKeyBindingsDisplay = getKeyBindingsDisplay;
    exports.addGlobalKeydownHook = addGlobalKeydownHook;
    exports.removeGlobalKeydownHook = removeGlobalKeydownHook;
    exports.isInOverlayMode = isInOverlayMode;
    exports.resetUserShortcutsAsync = resetUserShortcutsAsync;
    exports.showShortcutSelectionDialog = showShortcutSelectionDialog;
    exports.registerCustomKeymapPack = registerCustomKeymapPack;
    exports.getAllCustomKeymapPacks = getAllCustomKeymapPacks;
    exports.getCurrentCustomKeymapPack = getCurrentCustomKeymapPack;

    // public constants
    exports.KEY = KEY;
    // public events
    exports.EVENT_KEY_BINDING_ADDED = EVENT_KEY_BINDING_ADDED;
    exports.EVENT_KEY_BINDING_REMOVED = EVENT_KEY_BINDING_REMOVED;
    exports.EVENT_NEW_PRESET = EVENT_NEW_PRESET;
    exports.EVENT_PRESET_CHANGED = EVENT_PRESET_CHANGED;

    /**
     * Use windows-specific bindings if no other are found (e.g. Linux).
     * Core Brackets modules that use key bindings should always define at
     * least a generic keybinding that is applied for all platforms. This
     * setting effectively creates a compatibility mode for third party
     * extensions that define explicit key bindings for Windows and Mac, but
     * not Linux.
     */
    exports.useWindowsCompatibleBindings = false;

    // For unit testing only
    exports._handleKey = _handleKey;
    exports._handleKeyEvent = _handleKeyEvent;
});
