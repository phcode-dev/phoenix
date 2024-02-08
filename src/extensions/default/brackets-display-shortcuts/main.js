/*
 * Copyright (c) 2012 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */


/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, brackets, $, CodeMirror, _showShortcuts, window */

define(function (require, exports, module) {
    
    // Brackets modules
    const _                   = brackets.getModule("thirdparty/lodash"),
        CodeMirror          = brackets.getModule("thirdparty/CodeMirror2/lib/codemirror"),
        CommandManager      = brackets.getModule("command/CommandManager"),
        Commands            = brackets.getModule("command/Commands"),
        DocumentManager     = brackets.getModule("document/DocumentManager"),
        ExtensionUtils      = brackets.getModule("utils/ExtensionUtils"),
        KeyBindingManager   = brackets.getModule("command/KeyBindingManager"),
        MainViewManager     = brackets.getModule("view/MainViewManager"),
        Menus               = brackets.getModule("command/Menus"),
        Mustache            = brackets.getModule("thirdparty/mustache/mustache"),
        StringUtils         = brackets.getModule("utils/StringUtils"),
        WorkspaceManager    = brackets.getModule("view/WorkspaceManager"),
        Strings             = brackets.getModule("strings");

    const panelHtml           = require("text!templates/bottom-panel.html"),
        shortcutsHtml       = require("text!templates/shortcut-table.html"),
        TOGGLE_SHORTCUTS_ID = Commands.HELP_TOGGLE_SHORTCUTS_PANEL,
        OVERRIDE_SHORTCUT   = "redmunds-show-shortcuts.context.override",
        DISABLE_SHORTCUT    = "redmunds-show-shortcuts.context.disable",
        PANEL_MENU          = "shortcuts-panel-context-menu";
    let keyList = [],
        panel,
        $filterField,
        currentFilter,
        context_command_id,
        context_keybinding,
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

    function _getOriginFromCommandId(cmdID) {
        // According to CommandManager.register() documentation:
        //  Core commands in Brackets use a simple command title as an id, for example "open.file".
        //  Extensions should use the following format: "author.myextension.mycommandname". 
        //  For example, "lschmitt.csswizard.format.css".
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
        let i,
            base,
            command,
            key;

        // Brackets keymap
        let bracketsKeymap = KeyBindingManager.getKeymap();
        if (bracketsKeymap) {
            for (i in bracketsKeymap) {
                if (bracketsKeymap.hasOwnProperty(i)) {
                    key = bracketsKeymap[i];
                    if (key) {
                        base = _getBaseKey(i);
                        command = CommandManager.get(key.commandID);
                        if (!command) {
                            continue;
                        }

                        // Listen for keybinding changes
                        command.on("keyBindingAdded.bds keyBindingRemoved.bds", _updateKeyBindings);

                        keyList.push({
                            keyBase: KeyBindingManager.formatKeyDescriptor(base),
                            keyBinding: i,
                            keyBindingDisplay: KeyBindingManager.formatKeyDescriptor(i),
                            command: command,
                            commandID: key.commandID,
                            commandName: command.getName(),
                            origin: _getOriginFromCommandId(key.commandID),
                            filter: command.getName().toLowerCase() +  _filterFromKeyBinding(i)
                        });
                    }
                }
            }
        }

        // CodeMirror keymap
        if (CodeMirror.keyMap) {
            let cmKeymap = (brackets.platform === "mac") ? CodeMirror.keyMap.macDefault : CodeMirror.keyMap.pcDefault;
            if (cmKeymap) {
                for (i in cmKeymap) {
                    // Note that we only ignore CodeMirror duplicates, but
                    // we want to see Brackets & Extensions duplicates
                    if (cmKeymap.hasOwnProperty(i) &&
                            (i !== "fallthrough") &&
                            (_findKeyBinding(keyList, i) === -1)) {
                        base = _getBaseKey(i);
                        keyList.push({
                            keyBase: KeyBindingManager.formatKeyDescriptor(base),
                            keyBinding: i,
                            keyBindingDisplay: KeyBindingManager.formatKeyDescriptor(i),
                            commandID: cmKeymap[i],
                            commandName: cmKeymap[i],
                            origin: origCodeMirror,
                            filter: cmKeymap[i].toLowerCase() +  _filterFromKeyBinding(i)
                        });
                    }
                }
            }
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
        var $shortcuts = $("#shortcuts");
        $("thead .shortcut-base a", $shortcuts).off("click");
        $("thead .shortcut-binding a", $shortcuts).off("click");
        $("thead .shortcut-cmd-id a", $shortcuts).off("click");
        $("thead .shortcut-cmd-name a", $shortcuts).off("click");
        $("thead .shortcut-orig a", $shortcuts).off("click");
    }

    function _showShortcuts() {
        let $shortcuts = $("#shortcuts");
        
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
            panel.show();
            CommandManager.get(TOGGLE_SHORTCUTS_ID).setChecked(true);
            $filterField.val("").focus();
            initKeyList();
            _showShortcuts();
        }
        WorkspaceManager.recomputeLayout();
    }

    function _insertShortcutTemplate(contextCmd, doc) {
        let startPos, endPos, match, currLine, remText, remLine, needComma, newText,
            editor = doc._masterEditor,
            lines = StringUtils.getLines(doc.getText());

        // Data validation
        if (!context_command_id || !context_keybinding) {
            return;
        }

        // search for "overrides" section
        for (currLine = 0; currLine < lines.length; currLine++) {
            match = lines[currLine].match(/"overrides"\s*:\s*\{/);
            if (match) {
                break;
            }
        }
        if (!match) {
            return;
        }
        startPos = endPos = {
            line: currLine,
            ch: match.index + match[0].length
        };

        // determine if any other existing shortcut overrides
        remText = lines[currLine].substr(startPos.ch);
        for (remLine = currLine + 1; remLine < lines.length; remLine++) {
            remText += lines[remLine];
        }
        needComma = !/^\s*\}/.test(remText);

        // insert template for new shortcut
        if (contextCmd === OVERRIDE_SHORTCUT) {
            newText = '\n"[new-shortcut-here]": "' + context_command_id + '"';
        } else {
            newText = '\n"' + context_keybinding + '": null';
        }
        if (needComma) {
            newText += ',';
        }
        doc.replaceRange(newText, startPos, endPos);

        // indent line based on user settings
        editor._codeMirror.indentLine(++currLine);

        // select '[new-shortcut-here]' text
        newText = doc.getLine(currLine);
        match = newText.match(/\[new\-shortcut\-here\]/);
        if (match) {
            startPos = { line: currLine, ch: match.index };
            endPos   = { line: currLine, ch: match.index + match[0].length };
            editor.setSelection(startPos, endPos, true);
        }
        editor.focus();
    }

    function _handleUpdateShortcut(contextCmd) {
        // Open shortcut override file
        CommandManager.execute(Commands.FILE_OPEN_KEYMAP);

        // KeyBindingManager._openUserKeyMap() does not return a Deferred object (see #11049),
        // so the Deferred returned from CommandManager.execute(Commands.FILE_OPEN_KEYMAP)
        // isn't what we want. For now poll until file opens.
        let userKeyMapPath = brackets.app.getApplicationSupportDirectory() + "/keymap.json";
        let waitForFileToOpen = function () {
            let doc = DocumentManager.getOpenDocumentForPath(userKeyMapPath);
            if (doc) {
                _insertShortcutTemplate(contextCmd, doc);
            } else {
                window.setTimeout(waitForFileToOpen, 250);
            }
        };

        waitForFileToOpen();
    }

    function _handleOverrideShortcut() {
        _handleUpdateShortcut(OVERRIDE_SHORTCUT);
    }

    function _handleDisableShortcut() {
        _handleUpdateShortcut(DISABLE_SHORTCUT);
    }

    function init() {
        let $shortcutsPanel, s, help_menu, panel_cmenu;

        ExtensionUtils.loadStyleSheet(module, "shortcuts.css");

        // Register commands
        CommandManager.register(Strings.KEYBOARD_SHORTCUT_MENU_SHOW_SHORTCUTS, TOGGLE_SHORTCUTS_ID, _handleShowHideShortcuts);
        CommandManager.register(Strings.KEYBOARD_SHORTCUT_CMENU_OVERRIDE, OVERRIDE_SHORTCUT, _handleOverrideShortcut);
        CommandManager.register(Strings.KEYBOARD_SHORTCUT_CMENU_DISABLE,  DISABLE_SHORTCUT,  _handleDisableShortcut);

        // Add command to Help menu, if it exists
        help_menu = Menus.getMenu(Menus.AppMenuBar.HELP_MENU);
        if (help_menu) {
            help_menu.addMenuItem(TOGGLE_SHORTCUTS_ID, "", Menus.BEFORE, Commands.HELP_ABOUT);
        }

        // Add the HTML UI
        s = Mustache.render(panelHtml, Strings);

        // AppInit.htmlReady() has already executed before extensions are loaded
        // so, for now, we need to call this ourself
        panel = WorkspaceManager.createBottomPanel(TOGGLE_SHORTCUTS_ID, $(s), 100);
        panel.hide();

        $shortcutsPanel = $("#shortcuts");

        // Create context menu
        panel_cmenu = Menus.registerContextMenu(PANEL_MENU);
        panel_cmenu.addMenuItem(OVERRIDE_SHORTCUT);
        panel_cmenu.addMenuItem(DISABLE_SHORTCUT);

        // Events
        $shortcutsPanel.on("contextmenu", function (e) {
            var $rowEl = $(e.target).closest("tr");
            if ($rowEl.length > 0) {
                context_command_id = $rowEl[0].dataset.commandid;
                context_keybinding = $rowEl[0].dataset.keybinding;
                panel_cmenu.open(e);
            } else {
                context_command_id = null;
                context_keybinding = null;
            }
        });

        $shortcutsPanel.find(".close").click(function () {
            CommandManager.execute(TOGGLE_SHORTCUTS_ID);
        });

        $filterField = $shortcutsPanel.find(".toolbar .filter");
        $filterField.on("keyup", (event)=>{
            if(event && event.key === 'Escape') {
                MainViewManager.focusActivePane();
                return;
            }
            _showShortcuts();
        });
    }

    init();
});
