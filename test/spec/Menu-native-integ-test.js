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

/*global describe, it, expect, beforeAll, afterAll, awaitsForDone, spyOn, xdescribe*/

define(function (require, exports, module) {


    var CommandManager,     // Load from brackets.test
        Commands,           // Load from brackets.test
        KeyBindingManager,  // Load from brackets.test
        Menus,              // Load from brackets.test
        FileSystem,         // Load from brackets.test
        SpecRunnerUtils     = require("spec/SpecRunnerUtils"),
        KeyEvent            = require("utils/KeyEvent");


    xdescribe("mainview:Menus (Native Shell)", function () {

        var testWindow;

        beforeAll(async function () {
            var testWindowOptions = {"hasNativeMenus": true};

            // Create a new native menu window that will be shared by ALL tests in this spec.
            testWindow = await SpecRunnerUtils.createTestWindowAndRun(testWindowOptions);
            // Load module instances from brackets.test
            CommandManager    = testWindow.brackets.test.CommandManager;
            Commands          = testWindow.brackets.test.Commands;
            KeyBindingManager = testWindow.brackets.test.KeyBindingManager;
            Menus             = testWindow.brackets.test.Menus;
            FileSystem        = testWindow.brackets.test.FileSystem;
        }, 30000);

        afterAll(async function () {
            testWindow        = null;
            CommandManager    = null;
            Commands          = null;
            KeyBindingManager = null;
            Menus             = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        describe("Remove Menu", function () {
            it("should add then remove new menu to menu bar with a menu id", function () {
                var menuId = "Menu-test";
                Menus.addMenu("Custom", menuId);

                var menu = Menus.getMenu(menuId);
                expect(menu).toBeTruthy();

                Menus.removeMenu(menuId);
                menu = Menus.getMenu(menuId);
                expect(menu).toBeUndefined();
            });

            it("should remove all menu items and dividers in the menu when removing the menu", function () {
                var menuId = "Menu-test";
                Menus.addMenu("Custom", menuId);

                var menu = Menus.getMenu(menuId);
                expect(menu).toBeTruthy();

                var commandId = "Remove-Menu-test.Item-1";
                CommandManager.register("Remove Menu Test Command", commandId, function () {});

                var menuItem = menu.addMenuItem(commandId);
                expect(menuItem).toBeTruthy();

                var menuItemId = menuItem.id;
                expect(menuItemId).toBeTruthy();

                var menuDivider = menu.addMenuDivider();
                expect(menuDivider).toBeTruthy();

                var menuDividerId = menuDivider.id;
                expect(menuDividerId).toBeTruthy();

                menuItem = Menus.getMenuItem(menuItemId);
                expect(menuItem).toBeTruthy();

                menuDivider = Menus.getMenuItem(menuDividerId);
                expect(menuDivider).toBeTruthy();

                Menus.removeMenu(menuId);

                menu = Menus.getMenu(menuId);
                expect(menu).toBeUndefined();

                menuItem = Menus.getMenuItem(menuItemId);
                expect(menuItem).toBeUndefined();

                menuDivider = Menus.getMenuItem(menuDividerId);
                expect(menuDivider).toBeUndefined();
            });

            it("should gracefully handle someone trying to remove a menu that doesn't exist", function () {
                var menuId = "Menu-test";

                Menus.removeMenu(menuId);
                expect(Menus).toBeTruthy();   // Verify that we got this far...
            });

            it("should gracefully handle someone trying to remove a menu without supplying the id", function () {
                Menus.removeMenu();
                expect(Menus).toBeTruthy();   // Verify that we got this far...
            });
        });


        describe("Context Menus", function () {
            it("register a context menu", function () {
                var cmenu = Menus.registerContextMenu("test-cmenu50");

                // Add menu item via command id
                CommandManager.register("Brackets Test Command Custom 50", "Menu-test.command50", function () {});
                var menuItem = cmenu.addMenuItem("Menu-test.command50");
                expect(menuItem).toBeTruthy();
                expect(cmenu).toBeTruthy();

                // Add menu item via command object
                var command = CommandManager.register("Brackets Test Command Custom 51", "Menu-test.command51", function () {});
                menuItem = cmenu.addMenuItem(command);
                expect(menuItem).toBeTruthy();

                // add positioned divider
                menuItem = cmenu.addMenuDivider(Menus.BEFORE, "Menu-test.command51");
                var $listItems = testWindow.$("#test-cmenu50 > ul").children();
                expect($listItems.length).toBe(3);
                expect($($listItems[1]).find("hr.divider").length).toBe(1);

                // add divider to end
                menuItem = cmenu.addMenuDivider();
                $listItems = testWindow.$("#test-cmenu50 > ul").children();
                expect($listItems.length).toBe(4);
                expect($($listItems[3]).find("hr.divider").length).toBe(1);

                // duplicate command in Menu
                menuItem = cmenu.addMenuItem("Menu-test.command50");
                expect(menuItem).toBeFalsy();

                // duplicate ids
                var cmenu2 = Menus.registerContextMenu("test-cmenu50");
                expect(cmenu2).toBeFalsy();
            });

            it("open a context menu", function () {
                var openEvent = false;
                var cmenu = Menus.registerContextMenu("test-cmenu51");
                CommandManager.register("Brackets Test Command Custom 51", "Menu-test.command51", function () {});
                cmenu.addMenuItem("Menu-test.command51");

                cmenu.on("beforeContextMenuOpen", function () {
                    openEvent = true;
                });

                cmenu.open({ pageX: 300, pageY: 250 });
                var $menu = testWindow.$(".dropdown.open > ul");

                // all other drops downs should be closed
                expect($menu.length).toBe(1);

                // position is at correct location
                expect($menu.offset().left).toBe(300);
                expect($menu.offset().top).toBe(250);
                expect(openEvent).toBeTruthy();
            });

            function getBounds(object) {
                return {
                    left: object.offset().left,
                    top: object.offset().top,
                    right: object.offset().left + object.width(),
                    bottom: object.offset().top + object.height()
                };
            }

            function boundsInsideWindow(object) {
                var bounds = getBounds(object);
                return bounds.left   >= 0 &&
                       bounds.right  <= $(testWindow).width() &&
                       bounds.top    >= 0 &&
                       bounds.bottom <= $(testWindow).height();
            }

            it("context menu is not clipped", function () {
                var cmenu = Menus.registerContextMenu("test-cmenu52");
                CommandManager.register("Brackets Test Command Custom 52", "Menu-test.command52", function () {});
                cmenu.addMenuItem("Menu-test.command52");
                var winWidth = $(testWindow).width();
                var winHeight = $(testWindow).height();

                cmenu.open({ pageX: 0, pageY: 0 });
                var $menu = testWindow.$(".dropdown.open > ul");
                expect(boundsInsideWindow($menu)).toBeTruthy();

                cmenu.open({ pageX: winHeight, pageY: winWidth });
                $menu = testWindow.$(".dropdown.open > ul");
                expect(boundsInsideWindow($menu)).toBeTruthy();

                cmenu.open({ pageX: 0, pageY: winWidth });
                $menu = testWindow.$(".dropdown.open > ul");
                expect(boundsInsideWindow($menu)).toBeTruthy();

                cmenu.open({ pageX: winHeight, pageY: 0 });
                $menu = testWindow.$(".dropdown.open > ul");
                expect(boundsInsideWindow($menu)).toBeTruthy();
            });

            it("close context menu", function () {
                var cmenu = Menus.registerContextMenu("test-cmenu53");
                CommandManager.register("Brackets Test Command Custom 53", "Menu-test.command53", function () {});
                cmenu.addMenuItem("Menu-test.command53");

                cmenu.open({ pageX: 0, pageY: 0 });

                // verify dropdown is open
                var $menus = testWindow.$(".dropdown.open");
                expect($menus.length).toBe(1);

                // verify close event
                cmenu.close();

                // verify all dropdowns are closed
                $menus = testWindow.$(".dropdown.open");
                expect($menus.length).toBe(0);
            });

            it("close context menu using Esc key", function () {
                var cmenu = Menus.registerContextMenu("test-cmenu54");
                CommandManager.register("Brackets Test Command Custom 54", "Menu-test.command54", function () {});
                cmenu.addMenuItem("Menu-test.command54");

                cmenu.open({ pageX: 0, pageY: 0 });

                // verify dropdown is open
                var $menus = testWindow.$(".dropdown.open");
                expect($menus.length).toBe(1);

                // close the context menu by simulating Esc key
                var key = KeyEvent.DOM_VK_ESCAPE,
                    element = $menus[0];
                SpecRunnerUtils.simulateKeyEvent(key, "keydown", element);

                // verify all dropdowns are closed
                $menus = testWindow.$(".dropdown.open");
                expect($menus.length).toBe(0);
            });
            it("check for context menu to have the right status", function () {
                var cmenu = Menus.registerContextMenu("test-cmenu55");
                CommandManager.register("Brackets Test Command Custom 55", "Menu-test.command55", function () {});
                cmenu.addMenuItem("Menu-test.command55");

                cmenu.open({pageX: 0, pageY: 0});

                // verify dropdown is open
                var isOpen = cmenu.isOpen();
                expect(isOpen).toBe(true);

                // verify close event
                cmenu.close();

                // verify all dropdowns are closed
                isOpen = cmenu.isOpen();
                expect(isOpen).toBe(false);
            });

            it("it should disable context menu items when file doesn't exist ", async function () {
                // runs create a new file
                var promise = CommandManager.execute(Commands.FILE_NEW_UNTITLED);
                await awaitsForDone(promise, "FILE_NEW_UNTITLED");

                // opens context menu
                var cmenu = Menus.getContextMenu(Menus.ContextMenuIds.WORKING_SET_CONTEXT_MENU);
                cmenu.open({pageX: 0, pageY: 0});

                // checks that all the relevant items are disabled
                var notVisible = [Commands.FILE_RENAME, Commands.NAVIGATE_SHOW_IN_FILE_TREE];
                notVisible.forEach(function (item) { expect(CommandManager.get(item).getEnabled()).toBe(false); });

                //close menu and new file
                cmenu.close();
            });

            it("it should enable context menu items when file does exist ", async function () {
                var testPath = SpecRunnerUtils.getTempDirectory();
                var newFilePath = testPath + "/contextMenuTest.js";
                // runs create a new file and saves it
                SpecRunnerUtils.createTempDirectory();
                SpecRunnerUtils.loadProjectInTestWindow(testPath);
                var promise = CommandManager.execute(Commands.FILE_NEW_UNTITLED);

                await awaitsForDone(promise, "FILE_NEW_UNTITLED");

                spyOn(FileSystem, 'showSaveDialog').andCallFake(function (dialogTitle, initialPath, proposedNewName, callback) {
                    callback(undefined, newFilePath);
                });

                promise = CommandManager.execute(Commands.FILE_SAVE);
                await awaitsForDone(promise, "Provide new filename", 5000);
                // opens context menu
                var cmenu = Menus.getContextMenu(Menus.ContextMenuIds.WORKING_SET_CONTEXT_MENU);
                cmenu.open({pageX: 0, pageY: 0});

                // checks that all the items are enabled
                var visible = [Commands.FILE_SAVE, Commands.FILE_SAVE_AS, Commands.FILE_RENAME, Commands.NAVIGATE_SHOW_IN_FILE_TREE, Commands.CMD_FIND_IN_SUBTREE, Commands.CMD_REPLACE_IN_SUBTREE, Commands.FILE_CLOSE];
                visible.forEach(function (item) { expect(CommandManager.get(item).getEnabled()).toBe(true); });
            });
        });
    });
});
