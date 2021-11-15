/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
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

define(function (require, exports, module) {


    // Brackets modules
    var CommandManager  = brackets.getModule("command/CommandManager"),
        EditorManager   = brackets.getModule("editor/EditorManager"),
        Menus           = brackets.getModule("command/Menus");

    // Define the functions that Commands will execute
    function TestCommand1() {
        var command1 = CommandManager.get("extensionTest.command1");
        if (!command1) {
            return;
        }
        var command2 = CommandManager.get("extensionTest.command2");
        if (!command2) {
            return;
        }

        var checked = command1.getChecked();
        if (checked) {
            window.alert("Unchecking self. Disabling next.");
            command2.setEnabled(false);
        } else {
            window.alert("Checking self. Enabling next.");
            command2.setEnabled(true);
        }
        command1.setChecked(!checked);
    }

    function TestCommand2() {
        window.alert("Executing command 2");
    }

    function TestCommand3() {
        window.alert("Executing command 3");
    }

    // Register the functions as commands
    var command1 = CommandManager.register("Toggle Checkmark", "extensionTest.command1", TestCommand1);
    var command2 = CommandManager.register("Enabled when previous is Checked", "extensionTest.command2", TestCommand2);
    var command3 = CommandManager.register("Enabled when text selected", "extensionTest.command3", TestCommand3);

    // Set the Command initial state
    command1.setChecked(true);
    command2.setEnabled(true);
    command3.setEnabled(false);

    // Update the MenuItem by changing the underlying command
    var updateEnabledState = function () {
        var editor = EditorManager.getFocusedEditor();
        command3.setEnabled(editor && editor.getSelectedText() !== "");
    };
    var editor_cmenu = Menus.getContextMenu(Menus.ContextMenuIds.EDITOR_MENU);
    editor_cmenu.on("beforeContextMenuOpen", updateEnabledState);


    // Add the Commands as MenuItems of the Editor context menu
    if (editor_cmenu) {
        editor_cmenu.addMenuDivider();
        editor_cmenu.addMenuItem("extensionTest.command1");
        editor_cmenu.addMenuItem("extensionTest.command2");
        editor_cmenu.addMenuItem("extensionTest.command3");
    }
});
