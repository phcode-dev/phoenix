/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2018 - 2021 Adobe Systems Incorporated. All rights reserved.
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


/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, brackets, $, CodeMirror, _showShortcuts, window */

define(function (require, exports, module) {
    
    // Brackets modules
    const _                   = require("thirdparty/lodash"),
        CodeMirror          = require("thirdparty/CodeMirror/lib/codemirror"),
        CommandManager      = require("command/CommandManager"),
        Commands            = require("command/Commands"),
        KeyBindingManager   = require("command/KeyBindingManager"),
        MainViewManager     = require("view/MainViewManager"),
        Menus               = require("command/Menus"),
        Mustache            = require("thirdparty/mustache/mustache"),
        EditorManager       = require("editor/EditorManager"),
        Dialogs             = require("widgets/Dialogs"),
        Metrics       = require("utils/Metrics"),
        WorkspaceManager    = require("view/WorkspaceManager"),
        StringUtils   = require("utils/StringUtils"),
        AppInit             = require("utils/AppInit"),
        DropdownButton      = require("widgets/DropdownButton").DropdownButton,
        Strings             = require("strings");

    require("./vscode");

    const panelHtml           = require("text!./templates/bottom-panel.html"),
        shortcutsHtml       = require("text!./templates/shortcut-table.html"),
        TOGGLE_SHORTCUTS_ID = Commands.HELP_TOGGLE_SHORTCUTS_PANEL;
    const DEFAULT_PACK_PLACEHOLDER = "default";
    let keyList = [],
        panel,
        $shortcutsPanel,
        $filterField,
        currentFilter,
        presetPicker,
        _updateKeyBindings;

    let sortByBase = 1,
        sortByBinding = 2,
        sortByCmdId = 3,
        sortByCmdName = 4,
        sortByOrig = 5,
        sortColumn = sortByBase,
        sortAscending = true;

    let origBrackets = Strings.APP_NAME,
        origCodeMirror = window.debugMode? "CodeMirror" :Strings.APP_NAME,
        origExtension = Strings.KEYBOARD_SHORTCUT_ORIG_EXTENSION;

    // Determine base key by stripping modifier keys
    function _getBaseKey(keyBinding) {
        let keyBase = keyBinding
            .replace(/Ctrl-/, "")
            .replace(/Shift-/, "")
            .replace(/Alt-/, "");
        if (brackets.platform === "mac") {
            keyBase = keyBase.replace(/Cmd-/, "");
        }
        return keyBase;
    }

    function _findKeyBinding(kl, keyBinding) {
        let j;
        for (j = 0; j < kl.length; j++) {
            if (keyBinding === kl[j].keyBinding) {
                return j;
            }
        }
        return -1;
    }

    function _ucFirst(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    // "ReloadInBrowser" => "Reload In Browser"
    // "extension_manager" => "Extension Manager"
    function _humanizeString(string) {
        // Replace "foo_bar" with "foo bar" and "FooBar" with " Foo Bar"
        string = string.replace(/_/g, " ").replace(/([A-Z])/g, " $1");
        // Trim whitespace
        string = string.replace(/(^\s+)/, "").replace(/(\s+$)/, "");
        // Split words by whitespace, uppercase the first letter, join with a space
        string = string.split(/\s+/).map(_ucFirst).join(" ");

        return string;
    }

    function _getOriginFromCommandId(cmdID, keyBinding) {
        // According to CommandManager.register() documentation:
        //  Core commands in Brackets use a simple command title as an id, for example "open.file".
        //  Extensions should use the following format: "author.myextension.mycommandname". 
        //  For example, "lschmitt.csswizard.format.css".
        const customOrigin = KeyBindingManager._getCustomShortcutOrigin(keyBinding);
        if(customOrigin){
            return customOrigin;
        }
        let idArray = cmdID.split(".");
        const defaultCommands = Object.values(Commands);

        // check for a brackets menu
        let q1 = idArray[0].toLowerCase();
        if (defaultCommands.includes(cmdID) || q1 === "file" || q1 === "edit" || q1 === "view" || q1 === "navigate" || q1 === "debug" || q1 === "help" ||
            cmdID.startsWith("AltMenu-") || cmdID.startsWith("codefolding.") || cmdID.startsWith("navigation.") || cmdID.startsWith("recent-files") ||
            cmdID.startsWith("refactoring.") || cmdID.startsWith("recentProjects") || cmdID ==="showParameterHint") {
            return origBrackets;
        }
        if (idArray.length > 2) {
            // more than two qualifiers
            return origExtension + " (" + _humanizeString(idArray[1]) + ")";
        } else if (idArray.length < 2) {
            // less than two qualifiers
            return origExtension;
        }

        // must be an extension
        return origExtension;
    }

    function _filterFromKeyBinding(text) {
        // text if of form Shift-F1
        text = text || '';
        return `${text.toLowerCase()} ${text.replace("-", "+").toLowerCase()}`;
    }

    // CodeMirror and Brackets key maps have different formats, so collect
    // keys into a normalized array
    function _getkeyList() {
        let keyBinding,
            base,
            command,
            key;
        const allCommandsWithShortcuts = new Set();
        const menuCommands = Menus.getAllMenuItemCommands();
        const knownBindableCommands = KeyBindingManager._getKnownBindableCommands();
        const allCommandsToList = new Set([...menuCommands, ...knownBindableCommands]);

        // Brackets keymap
        let bracketsKeymap = KeyBindingManager.getKeymap();
        if (bracketsKeymap) {
            for (keyBinding in bracketsKeymap) {
                if (bracketsKeymap.hasOwnProperty(keyBinding)) {
                    key = bracketsKeymap[keyBinding];
                    if (key) {
                        base = _getBaseKey(keyBinding);
                        command = CommandManager.get(key.commandID);
                        if (!command) {
                            continue;
                        }

                        allCommandsWithShortcuts.add(key.commandID);
                        keyList.push({
                            keyBase: KeyBindingManager.formatKeyDescriptor(base),
                            keyBinding: keyBinding,
                            keyBindingDisplay: KeyBindingManager.formatKeyDescriptor(keyBinding),
                            command: command,
                            commandID: key.commandID,
                            commandName: command.getName(),
                            origin: _getOriginFromCommandId(key.commandID, keyBinding),
                            filter: command.getName().toLowerCase() +  _filterFromKeyBinding(keyBinding)
                                + _getOriginFromCommandId(key.commandID, keyBinding).toLowerCase()
                        });
                    }
                }
            }
        }

        // CodeMirror keymap
        if (CodeMirror.keyMap) {
            let cmKeymap = (brackets.platform === "mac") ? CodeMirror.keyMap.macDefault : CodeMirror.keyMap.pcDefault;
            if (cmKeymap) {
                for (keyBinding in cmKeymap) {
                    // Note that we only ignore CodeMirror duplicates, but
                    // we want to see Brackets & Extensions duplicates
                    if (cmKeymap.hasOwnProperty(keyBinding) &&
                            (keyBinding !== "fallthrough") &&
                            (_findKeyBinding(keyList, keyBinding) === -1)) {
                        base = _getBaseKey(keyBinding);
                        allCommandsWithShortcuts.add(cmKeymap[keyBinding]);
                        keyList.push({
                            keyBase: KeyBindingManager.formatKeyDescriptor(base),
                            keyBinding: keyBinding,
                            keyBindingDisplay: KeyBindingManager.formatKeyDescriptor(keyBinding),
                            commandID: cmKeymap[keyBinding],
                            commandName: cmKeymap[keyBinding],
                            origin: window.debugMode ? origCodeMirror : origBrackets,
                            filter: cmKeymap[keyBinding].toLowerCase() +  _filterFromKeyBinding(keyBinding) +
                                origCodeMirror.toLowerCase()
                        });
                    }
                }
            }
        }

        for(let commandID of allCommandsToList){
            if(allCommandsWithShortcuts.has(commandID)){
                continue;
            }
            keyList.push({
                keyBase: "",
                keyBinding: "",
                keyBindingDisplay: "",
                commandID: commandID,
                commandName: commandID,
                origin: _getOriginFromCommandId(commandID, keyBinding),
                filter: commandID.toLowerCase() + _getOriginFromCommandId(commandID, keyBinding).toLowerCase()
            });
        }

        return keyList;
    }

    function _strcmp(a, b) {
        if (a < b) {
            return (sortAscending ? -1 : 1);
        } else if (a > b) {
            return (sortAscending ? 1 : -1);
        }
        return 0;
    }

    function _stricmp(a, b) {
        return _strcmp(a.toLowerCase(), b.toLowerCase());
    }

    function _keyBaseSort(a, b) {
        // First sort by whether it's a single char or not, so letters are separated from key
        // names (e.g. Backspace). Then sort by base key, finally key binding string
        let a2 = ((a.keyBase.length === 1) ? "0" : "1") + a.keyBase,
            b2 = ((b.keyBase.length === 1) ? "0" : "1") + b.keyBase,
            c = _strcmp(a2, b2);

        if (c !== 0) {
            return c;
        } else {
            return _strcmp(a.keyBinding, b.keyBinding);
        }
    }

    function _keyBindingSort(a, b) {
        return _strcmp(a.keyBinding, b.keyBinding);
    }

    function _keyCmdIdSort(a, b) {
        return _stricmp(a.commandID, b.commandID);
    }

    function _keyCmdNameSort(a, b) {
        return _strcmp(a.commandName, b.commandName);
    }

    function _keyOrigSort(a, b) {
        return _strcmp(a.origin, b.origin);
    }

    function _getSortFunc() {
        if (sortColumn === sortByBinding) {
            return _keyBindingSort;
        } else if (sortColumn === sortByCmdId) {
            return _keyCmdIdSort;
        } else if (sortColumn === sortByCmdName) {
            return _keyCmdNameSort;
        } else if (sortColumn === sortByOrig) {
            return _keyOrigSort;
        }
        return _keyBaseSort;
    }

    function _getShortcutsHtml() {
        var msData = {};
        msData.keyList = keyList.sort(_getSortFunc());
        msData.Strings = Strings;
        return Mustache.render(shortcutsHtml, msData);
    }

    function _changeSorting(newSortColumn) {
        if (newSortColumn === sortColumn) {
            // Same column, so change sort direction
            sortAscending = !sortAscending;
        } else {
            // New sort column
            sortColumn = newSortColumn;
        }
        
        // Update page
        _showShortcuts();
    }

    function _filterShortcuts(forceFiltering) {
        var terms = $filterField.val().trim().toLocaleLowerCase();
        if (forceFiltering || terms !== currentFilter) {
            currentFilter = terms;
            terms = terms.split(/\s+?/);
            $.each(keyList, function (i, key) {
                let match;
                if (terms === "") {
                    match = true;
                } else {
                    $.each(terms, function (i, term) {
                        if (match !== false) {
                            match = key.filter.indexOf(term) > -1;
                        }
                    });
                }
                key.filterMatch = match;
            });
        }
    }

    function _clearSortingEventHandlers() {
        var $shortcuts = $("#shortcuts-panel");
        $("thead .shortcut-base a", $shortcuts).off("click");
        $("thead .shortcut-binding a", $shortcuts).off("click");
        $("thead .shortcut-cmd-id a", $shortcuts).off("click");
        $("thead .shortcut-cmd-name a", $shortcuts).off("click");
        $("thead .shortcut-orig a", $shortcuts).off("click");
    }

    function _showShortcuts() {
        _updatePresets();
        let $shortcuts = $("#shortcuts-panel");
        
        // Apply any active filter
        _filterShortcuts(true);

        // Clear old header sort button events
        _clearSortingEventHandlers();

        // Add new markup
        $shortcuts.find(".resizable-content").html(_getShortcutsHtml());
        $shortcuts.find("thead th").eq(sortColumn - 1).addClass('sort-' + (sortAscending ? 'ascending' : 'descending'));

        // Setup header sort button events
        $("thead .shortcut-base a", $shortcuts).on("click", function () {
            _changeSorting(sortByBase);
        });
        $("thead .shortcut-binding a", $shortcuts).on("click", function () {
            _changeSorting(sortByBinding);
        });
        $("thead .shortcut-cmd-id a", $shortcuts).on("click", function () {
            _changeSorting(sortByCmdId);
        });
        $("thead .shortcut-cmd-name a", $shortcuts).on("click", function () {
            _changeSorting(sortByCmdName);
        });
        $("thead .shortcut-orig a", $shortcuts).on("click", function () {
            _changeSorting(sortByOrig);
        });
        _showCommandIdsInPanelIfNeeded();
        $shortcutsPanel.find(".copy-command").click((event)=>{
            const commandId = event.target.getAttribute("data-commandID");
            Phoenix.app.copyToClipboard(commandId);
        });
    }

    function initKeyList() {
        // Only get data once while panel is open
        if (keyList.length === 0) {
            keyList = _getkeyList();
        }
    }

    function destroyKeyList() {
        // cleanup listeners
        $.each(keyList, function (i, key) {
            // Only Brackets commands have listeners
            if (key.command) {
                key.command.off(".bds");
            }
        });

        keyList = [];
    }

    function _updatePresets() {
        if (!panel || !panel.isVisible()) {
            return;
        }
        const allPacks = KeyBindingManager.getAllCustomKeymapPacks();
        const currentKeymapPack = KeyBindingManager.getCurrentCustomKeymapPack();
        if(currentKeymapPack){
            presetPicker.$button.text(StringUtils.format(
                Strings.KEYBOARD_SHORTCUT_PRESET_USING, currentKeymapPack.packageName));
        } else {
            presetPicker.$button.text(Strings.KEYBOARD_SHORTCUT_PRESET_SELECT);
        }
        presetPicker.items = [DEFAULT_PACK_PLACEHOLDER, ...allPacks.map(pack=>pack.packID)];
    }

    _updateKeyBindings = _.debounce(function () {
        // Update keylist
        destroyKeyList();
        initKeyList();

        // Refresh panel
        _showShortcuts();
    }, 300);

    function _handleShowHideShortcuts() {
        if (panel.isVisible()) {
            // This panel probably won't get opened very often, so only maintain data
            // while panel is open (for faster sorting) and discard when closed.
            destroyKeyList();
            _clearSortingEventHandlers();
            panel.hide();
            CommandManager.get(TOGGLE_SHORTCUTS_ID).setChecked(false);
            MainViewManager.focusActivePane();
        } else {
            Metrics.countEvent(Metrics.EVENT_TYPE.KEYBOARD, 'shortcutPanel', "shown");
            panel.show();
            CommandManager.get(TOGGLE_SHORTCUTS_ID).setChecked(true);
            $filterField.val("").focus();
            initKeyList();
            _showShortcuts();
        }
        WorkspaceManager.recomputeLayout();
    }


    function _showCommandIdsInPanelIfNeeded() {
        const editor = EditorManager.getActiveEditor();
        if(editor && editor.document && editor.document.file.fullPath === KeyBindingManager._getUserKeyMapFilePath()){
            $shortcutsPanel.find("#phoenix-keyboard-shortcuts-table").removeClass("hide-third-column");
        } else {
            $shortcutsPanel.find("#phoenix-keyboard-shortcuts-table").addClass("hide-third-column");
        }
    }

    function _presetRenderer(packID) {
        if(packID === DEFAULT_PACK_PLACEHOLDER) {
            return Strings.DEFAULT;
        }
        const allPacks = KeyBindingManager.getAllCustomKeymapPacks();
        for(let pack of allPacks) {
            if(pack.packID === packID) {
                return pack.packageName;
            }
        }
        return packID;
    }

    AppInit.appReady(function() {
        let s, file_menu;

        // Register commands
        CommandManager.register(Strings.KEYBOARD_SHORTCUT_MENU_SHOW_SHORTCUTS, TOGGLE_SHORTCUTS_ID, _handleShowHideShortcuts);

        // Add command to Help menu, if it exists
        file_menu = Menus.getMenu(Menus.AppMenuBar.FILE_MENU);
        if (file_menu) {
            file_menu.addMenuItem(TOGGLE_SHORTCUTS_ID, "", Menus.BEFORE, Commands.FILE_EXTENSION_MANAGER);
        }

        // Add the HTML UI
        s = Mustache.render(panelHtml, Strings);

        // AppInit.htmlReady() has already executed before extensions are loaded
        // so, for now, we need to call this ourself
        panel = WorkspaceManager.createBottomPanel(TOGGLE_SHORTCUTS_ID, $(s), 300);
        panel.hide();

        $shortcutsPanel = $("#shortcuts-panel");

        presetPicker = new DropdownButton(Strings.KEYBOARD_SHORTCUT_PRESET_SELECT, [], _presetRenderer, {
            cssClasses: "presetPicker no-focus"
        });
        $shortcutsPanel.find(".presetPickerContainer").append(presetPicker.$button);
        presetPicker.on("select", function (e, selectedPackID) {
            if(selectedPackID === DEFAULT_PACK_PLACEHOLDER) {
                KeyBindingManager._setCurrentCustomKeymapPack(null);
            }
            KeyBindingManager._setCurrentCustomKeymapPack(selectedPackID);
            _updatePresets();
        });

        // Events
        $shortcutsPanel.on("dblclick", function (e) {
            var $rowEl = $(e.target).closest("tr");
            if ($rowEl.length > 0) {
                KeyBindingManager.showShortcutSelectionDialog(
                    CommandManager.get($rowEl[0].dataset.commandid)
                );
            }
        });

        $shortcutsPanel.find(".close").click(function () {
            CommandManager.execute(TOGGLE_SHORTCUTS_ID);
        });

        $shortcutsPanel.find(".reset-to-default").click(function () {
            Dialogs.showConfirmDialog(
                Strings.KEYBOARD_SHORTCUT_RESET_DIALOG_TITLE,
                Strings.KEYBOARD_SHORTCUT_RESET_DIALOG_MESSAGE
            ).done(function (selection) {
                if(selection === Dialogs.DIALOG_BTN_OK){
                    Metrics.countEvent(Metrics.EVENT_TYPE.KEYBOARD, 'shortcut', "reset");
                    KeyBindingManager.resetUserShortcutsAsync();
                }
            });
        });

        $filterField = $shortcutsPanel.find(".toolbar .filter");
        $filterField.on("keyup", (event)=>{
            if(event && event.key === 'Escape') {
                MainViewManager.focusActivePane();
                return;
            }
            _showShortcuts();
        });
        EditorManager.on("activeEditorChange", (_event, newEditor)=>{
            if(newEditor && newEditor.document && newEditor.document.file.fullPath === KeyBindingManager._getUserKeyMapFilePath()){
                if(!CommandManager.get(TOGGLE_SHORTCUTS_ID).getChecked()){
                    CommandManager.get(TOGGLE_SHORTCUTS_ID).execute();
                }
            }
            _showCommandIdsInPanelIfNeeded();
        });
        KeyBindingManager.on(KeyBindingManager.EVENT_KEY_BINDING_ADDED, _updateKeyBindings);
        KeyBindingManager.on(KeyBindingManager.EVENT_KEY_BINDING_REMOVED, _updateKeyBindings);
        KeyBindingManager.on(KeyBindingManager.EVENT_NEW_PRESET, _updatePresets);
        KeyBindingManager.on(KeyBindingManager.EVENT_PRESET_CHANGED, _updatePresets);
    });
});
