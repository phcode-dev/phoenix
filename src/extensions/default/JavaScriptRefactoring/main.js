/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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

define(function (require, exports, module) {



    var AppInit              = brackets.getModule("utils/AppInit"),
        PreferencesManager   = brackets.getModule("preferences/PreferencesManager"),
        Strings              = brackets.getModule("strings"),
        RenameIdentifier     = require("RenameIdentifier"),
        ExtractToVariable    = require("ExtractToVariable"),
        ExtractToFunction    = require("ExtractToFunction"),
        WrapSelection        = require("WrapSelection"),
        CommandManager       = brackets.getModule("command/CommandManager"),
        Menus                = brackets.getModule("command/Menus"),
        Metrics              = brackets.getModule("utils/Metrics"),
        _                    = brackets.getModule("thirdparty/lodash"),
        EditorManager        = brackets.getModule("editor/EditorManager");

    var jsRefactoringEnabled     = true;

    var KeyboardPrefs = JSON.parse(require("text!keyboard.json"));

    // Command ids
    var EXTRACTTO_VARIABLE       = "refactoring.extractToVariable",
        EXTRACTTO_FUNCTION       = "refactoring.extractToFunction",
        REFACTOR_RENAME          = "refactoring.renamereference",
        REFACTORWRAPINTRYCATCH   = "refactoring.wrapintrycatch",
        REFACTORWRAPINCONDITION  = "refactoring.wrapincondition",
        REFACTORCONVERTTOARROWFN = "refactoring.converttoarrowfunction",
        REFACTORCREATEGETSET     = "refactoring.creategettersandsetters";

    // This preference controls whether to create a session and process all JS files or not.
    PreferencesManager.definePreference("refactoring.JSRefactoring", "boolean", true, {
        description: Strings.DESCRIPTION_CODE_REFACTORING
    });


    /**
     * Check whether any of refactoring hints preferences for JS Refactoring is disabled
     * @return {boolean} enabled/disabled
     */
    function _isRefactoringEnabled() {
        return (PreferencesManager.get("refactoring.JSRefactoring") !== false);
    }

    PreferencesManager.on("change", "refactoring.JSRefactoring", function () {
        jsRefactoringEnabled = _isRefactoringEnabled();
    });

    function _handleRefactor(functionName) {
        var eventName, eventType = "";

        switch (functionName) {
        case REFACTOR_RENAME:
            eventName = REFACTOR_RENAME;
            eventType = "rename";
            RenameIdentifier.handleRename();
            break;
        case EXTRACTTO_VARIABLE:
            eventName = EXTRACTTO_VARIABLE;
            eventType = "extractToVariable";
            ExtractToVariable.handleExtractToVariable();
            break;
        case EXTRACTTO_FUNCTION:
            eventName = EXTRACTTO_FUNCTION;
            eventType = "extractToFunction";
            ExtractToFunction.handleExtractToFunction();
            break;
        case REFACTORWRAPINTRYCATCH:
            eventName = REFACTORWRAPINTRYCATCH;
            eventType = "wrapInTryCatch";
            WrapSelection.wrapInTryCatch();
            break;
        case REFACTORWRAPINCONDITION:
            eventName = REFACTORWRAPINCONDITION;
            eventType = "wrapInCondition";
            WrapSelection.wrapInCondition();
            break;
        case REFACTORCONVERTTOARROWFN:
            eventName = REFACTORCONVERTTOARROWFN;
            eventType = "convertToFunction";
            WrapSelection.convertToArrowFunction();
            break;
        case REFACTORCREATEGETSET:
            eventName = REFACTORCREATEGETSET;
            eventType = "createGetterSetter";
            WrapSelection.createGettersAndSetters();
            break;
        }
        if (eventName) {
            var editor = EditorManager.getActiveEditor();

            // Logging should be done only when the context is javascript
            if (!editor || editor.getModeForSelection() !== "javascript") {
                return;
            }
            // Send analytics data for js refactoring
            Metrics.countEvent(
                Metrics.EVENT_TYPE.CODE_HINTS,
                "jsRefactor",
                eventType
            );
        }
    }

    AppInit.appReady(function () {

        if (jsRefactoringEnabled) {
            var subMenu = Menus.getContextMenu(Menus.ContextMenuIds.EDITOR_MENU).addSubMenu(Strings.CMD_REFACTOR, "refactor-submenu");

            var menuLocation = Menus.AppMenuBar.EDIT_MENU;

            Menus.getMenu(menuLocation).addMenuDivider();

            // Rename Identifier
            CommandManager.register(Strings.CMD_REFACTORING_RENAME, REFACTOR_RENAME, _.partial(_handleRefactor, REFACTOR_RENAME));
            subMenu.addMenuItem(REFACTOR_RENAME);
            Menus.getMenu(menuLocation).addMenuItem(REFACTOR_RENAME, KeyboardPrefs.renameIdentifier);

            // Extract to Variable
            CommandManager.register(Strings.CMD_EXTRACTTO_VARIABLE, EXTRACTTO_VARIABLE, _.partial(_handleRefactor, EXTRACTTO_VARIABLE));
            subMenu.addMenuItem(EXTRACTTO_VARIABLE);
            Menus.getMenu(menuLocation).addMenuItem(EXTRACTTO_VARIABLE, KeyboardPrefs.extractToVariable);

            // Extract to Function
            CommandManager.register(Strings.CMD_EXTRACTTO_FUNCTION, EXTRACTTO_FUNCTION, _.partial(_handleRefactor, EXTRACTTO_FUNCTION));
            subMenu.addMenuItem(EXTRACTTO_FUNCTION);
            Menus.getMenu(menuLocation).addMenuItem(EXTRACTTO_FUNCTION, KeyboardPrefs.extractToFunction);

            // Wrap Selection
            CommandManager.register(Strings.CMD_REFACTORING_TRY_CATCH, REFACTORWRAPINTRYCATCH, _.partial(_handleRefactor, REFACTORWRAPINTRYCATCH));
            subMenu.addMenuItem(REFACTORWRAPINTRYCATCH);
            Menus.getMenu(menuLocation).addMenuItem(REFACTORWRAPINTRYCATCH);

            CommandManager.register(Strings.CMD_REFACTORING_CONDITION, REFACTORWRAPINCONDITION, _.partial(_handleRefactor, REFACTORWRAPINCONDITION));
            subMenu.addMenuItem(REFACTORWRAPINCONDITION);
            Menus.getMenu(menuLocation).addMenuItem(REFACTORWRAPINCONDITION);

            CommandManager.register(Strings.CMD_REFACTORING_ARROW_FUNCTION, REFACTORCONVERTTOARROWFN, _.partial(_handleRefactor, REFACTORCONVERTTOARROWFN));
            subMenu.addMenuItem(REFACTORCONVERTTOARROWFN);
            Menus.getMenu(menuLocation).addMenuItem(REFACTORCONVERTTOARROWFN);

            CommandManager.register(Strings.CMD_REFACTORING_GETTERS_SETTERS, REFACTORCREATEGETSET, _.partial(_handleRefactor, REFACTORCREATEGETSET));
            subMenu.addMenuItem(REFACTORCREATEGETSET);
            Menus.getMenu(menuLocation).addMenuItem(REFACTORCREATEGETSET);
        }
    });
});
