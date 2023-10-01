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

/*global describe, it, expect, beforeAll, afterAll*/

define(function (require, exports, module) {


    var CommandManager,     // Load from brackets.test
        KeyBindingManager,  // Load from brackets.test
        Menus,              // Load from brackets.test
        SpecRunnerUtils     = require("spec/SpecRunnerUtils"),
        KeyEvent            = require("utils/KeyEvent");


    describe("mainview:Menus (HTML)", function () {

        var testWindow;

        beforeAll(async function () {
            var testWindowOptions = {"hasNativeMenus": false};

            // Create a new HTML menu window that will be shared by ALL tests in this spec.
            testWindow = await SpecRunnerUtils.createTestWindowAndRun(testWindowOptions);
            // Load module instances from brackets.test
            CommandManager    = testWindow.brackets.test.CommandManager;
            KeyBindingManager = testWindow.brackets.test.KeyBindingManager;
            Menus             = testWindow.brackets.test.Menus;
        }, 30000);

        afterAll(async function () {
            testWindow        = null;
            CommandManager    = null;
            KeyBindingManager = null;
            Menus             = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        describe("Add Menus", function () {

            function getTopMenus() {
                return testWindow.$("#titlebar > ul.nav").children();
            }

            it("should add new menu in last position of list", async function () {
                var $listItems = getTopMenus();
                expect($listItems.length).toBeGreaterThan(0);

                var menuCountOriginal = $listItems.length;
                var menu = Menus.addMenu("Custom1", "menu-unittest1");
                expect(menu).toBeTruthy();
                expect(menu).toBeDefined();

                $listItems = getTopMenus(); // refresh
                expect($listItems.length).toBe(menuCountOriginal + 1);
                expect($($listItems[menuCountOriginal]).attr("id")).toBe("menu-unittest1");
            });

            it("should add new menu in first position of list", async function () {
                var $listItems = getTopMenus();
                expect($listItems.length).toBeGreaterThan(0);

                var menuCountOriginal = $listItems.length;
                var menu = Menus.addMenu("Custom2", "menu-unittest2", Menus.FIRST);
                expect(menu).toBeTruthy();
                expect(menu).toBeDefined();

                $listItems = getTopMenus();
                expect($listItems.length).toBe(menuCountOriginal + 1);
                expect($($listItems[0]).attr("id")).toBe("menu-unittest2");
            });

            it("should add new menu after reference menu", async function () {
                var $listItems = getTopMenus();
                expect($listItems.length).toBeGreaterThan(0);

                var menuCountOriginal = $listItems.length;
                var menu = Menus.addMenu("CustomFirst", "menu-unittest3-first", Menus.FIRST);
                menu = Menus.addMenu("CustomAfter", "menu-unittest3-after", Menus.AFTER, "menu-unittest3-first");
                expect(menu).toBeTruthy();
                expect(menu).toBeDefined();

                $listItems = getTopMenus();
                expect($listItems.length).toBe(menuCountOriginal + 2);
                expect($($listItems[0]).attr("id")).toBe("menu-unittest3-first");
                expect($($listItems[1]).attr("id")).toBe("menu-unittest3-after");
            });

            it("should add new menu before reference menu", async function () {
                var $listItems = getTopMenus();
                expect($listItems.length).toBeGreaterThan(0);

                var menuCountOriginal = $listItems.length;
                var menu = Menus.addMenu("CustomLast", "menu-unittest3-last", Menus.LAST);
                menu = Menus.addMenu("CustomBefore", "menu-unittest3-before", Menus.BEFORE, "menu-unittest3-last");
                expect(menu).toBeTruthy();
                expect(menu).toBeDefined();

                $listItems = getTopMenus();
                expect($listItems.length).toBe(menuCountOriginal + 2);
                expect($($listItems[menuCountOriginal]).attr("id")).toBe("menu-unittest3-before");
                expect($($listItems[menuCountOriginal + 1]).attr("id")).toBe("menu-unittest3-last");
            });

            it("should add new menu at end of list when reference menu doesn't exist", async function () {
                var $listItems = getTopMenus();
                expect($listItems.length).toBeGreaterThan(0);

                var menuCountOriginal = $listItems.length;
                var menu = Menus.addMenu("Custom3", "menu-unittest4", Menus.AFTER, "NONEXISTANT");
                expect(menu).toBeTruthy();
                expect(menu).toBeDefined();

                $listItems = getTopMenus();
                expect($listItems.length).toBe(menuCountOriginal + 1);
                expect($($listItems[menuCountOriginal]).attr("id")).toBe("menu-unittest4");
            });

            it("should not add duplicate menu", async function () {
                var $listItems = getTopMenus();
                expect($listItems.length).toBeGreaterThan(0);

                var menuCountOriginal = $listItems.length;
                var menu1 = Menus.addMenu("Custom5", "menu-unittest5");
                expect(menu1).toBeTruthy();

                var menu2 = null;

                menu2 = Menus.addMenu("Custom5", "menu-unittest5");
                expect(menu2).toBeFalsy();

                $listItems = getTopMenus();
                expect($listItems.length).toBe(menuCountOriginal + 1);
                expect(menu2).toBeNull();
            });
        });


        describe("Add Menu Items", function () {

            it("should add new menu items", async function () {
                var menu = Menus.addMenu("MenuItem Menu 0", "menuitem-unittest0");
                var listSelector = "#menuitem-unittest0 > ul";
                var $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(0);


                // add new menu item to empty menu
                CommandManager.register("Brackets Test Command Custom 0", "Menu-test.command00", function () {});
                var menuItem = menu.addMenuItem("Menu-test.command00");
                expect(menuItem).toBeTruthy();
                expect(menuItem).toBeDefined();

                $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(1);
                expect($($listItems[0]).length).toBe(1);

                // Periods (aka "dots") are allowed in HTML identifiers, but jQuery interprets
                // them as the start of a class selector, so they need to be escaped
                expect($($listItems[0]).find("a#menuitem-unittest0-Menu-test\\.command00").length).toBe(1);


                // add new menu item in first position of menu
                CommandManager.register("Brackets Test Command Custom 1", "Menu-test.command01", function () {});
                menuItem = menu.addMenuItem("Menu-test.command01", "Ctrl-Alt-1", Menus.FIRST);
                expect(menuItem).toBeTruthy();
                expect(menuItem).toBeDefined();

                $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(2);
                expect($($listItems[0]).find("a#menuitem-unittest0-Menu-test\\.command01").length).toBe(1);


                // add new menu item in last position of menu
                CommandManager.register("Brackets Test Command Custom 2", "Menu-test.command02", function () {});
                menuItem = menu.addMenuItem("Menu-test.command02", Menus.LAST);
                expect(menuItem).toBeTruthy();
                expect(menuItem).toBeDefined();

                $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(3);
                expect($($listItems[2]).find("a#menuitem-unittest0-Menu-test\\.command02").length).toBe(1);


                // add new menu item in position after reference command
                CommandManager.register("Brackets Test Command Custom 3", "Menu-test.command03", function () {});
                menuItem = menu.addMenuItem("Menu-test.command03", "Ctrl-Alt-3", Menus.AFTER, "Menu-test.command01");
                expect(menuItem).toBeTruthy();
                expect(menuItem).toBeDefined();

                $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(4);
                expect($($listItems[1]).find("a#menuitem-unittest0-Menu-test\\.command03").length).toBe(1);


                // add new menu item in position before reference command
                CommandManager.register("Brackets Test Command Custom 4", "Menu-test.command04", function () {});
                menuItem = menu.addMenuItem("Menu-test.command04", "Ctrl-Alt-4", Menus.BEFORE, "Menu-test.command01");
                expect(menuItem).toBeTruthy();
                expect(menuItem).toBeDefined();

                $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(5);
                expect($($listItems[0]).find("a#menuitem-unittest0-Menu-test\\.command04").length).toBe(1);


                // add positioned divider
                menu.addMenuDivider(Menus.AFTER, "Menu-test.command04");
                $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(6);
                expect($($listItems[1]).find("hr.divider").length).toBe(1);


                // add divider to end
                menu.addMenuDivider();
                $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(7);
                expect($($listItems[6]).find("hr.divider").length).toBe(1);
            });

            it("should add menu items to beginning and end of menu section", async function () {
                // set up test menu and menu items
                CommandManager.register("Brackets Test Command Section 10", "Menu-test.command10", function () {});
                CommandManager.register("Brackets Test Command Section 11", "Menu-test.command11", function () {});
                CommandManager.register("Brackets Test Command Section 12", "Menu-test.command12", function () {});
                CommandManager.register("Brackets Test Command Section 13", "Menu-test.command13", function () {});
                CommandManager.register("Brackets Test Command Section 14", "Menu-test.command14", function () {});
                CommandManager.register("Brackets Test Command Section 15", "Menu-test.command15", function () {});
                CommandManager.register("Brackets Test Command Section 16", "Menu-test.command16", function () {});
                CommandManager.register("Brackets Test Command Section 17", "Menu-test.command17", function () {});
                CommandManager.register("Brackets Test Command Section 18", "Menu-test.command18", function () {});

                var menu = Menus.addMenu("Section Test", "menuitem-unittest1");
                menu.addMenuItem("Menu-test.command10");
                menu.addMenuItem("Menu-test.command11");
                menu.addMenuDivider();
                menu.addMenuItem("Menu-test.command12");
                menu.addMenuItem("Menu-test.command13");

                // create mock menu sections
                var menuSectionCmd0 = { sectionMarker: "Menu-test.command10" },
                    menuSectionCmd2 = { sectionMarker: "Menu-test.command12" };

                var listSelector = "#menuitem-unittest1 > ul";

                // Add new menu to END of menuSectionCmd0
                var menuItem = menu.addMenuItem("Menu-test.command14", null, Menus.LAST_IN_SECTION, menuSectionCmd0);
                var $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(6);
                expect($($listItems[2]).find("a#menuitem-unittest1-Menu-test\\.command14").length).toBe(1);

                // Add new menu to END of menuSectionCmd2
                menuItem = menu.addMenuItem("Menu-test.command15", null, Menus.LAST_IN_SECTION, menuSectionCmd2);
                $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(7);
                expect($($listItems[6]).find("a#menuitem-unittest1-Menu-test\\.command15").length).toBe(1);

                // Add new menu to BEGINNING of menuSectionCmd0
                menuItem = menu.addMenuItem("Menu-test.command16", null, Menus.FIRST_IN_SECTION, menuSectionCmd0);
                $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(8);
                expect($($listItems[0]).find("a#menuitem-unittest1-Menu-test\\.command16").length).toBe(1);

                // Add new menu to BEGINNING of menuSectionCmd2
                menuItem = menu.addMenuItem("Menu-test.command17", null, Menus.FIRST_IN_SECTION, menuSectionCmd2);
                $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(9);
                expect($($listItems[5]).find("a#menuitem-unittest1-Menu-test\\.command17").length).toBe(1);
            });

            it("should add new menu item in last position of menu if reference command isn't found in menu", async function () {
                CommandManager.register("Brackets Test Command Custom 20", "Menu-test.command20", function () {});
                var menu = Menus.addMenu("Custom 2", "menuitem-unittest2");
                menu.addMenuItem("Menu-test.command20", "Ctrl-Alt-0");
                var listSelector = "#menuitem-unittest2 > ul";

                // reference command doesn't exist
                CommandManager.register("Brackets Test Command Custom 21", "Menu-test.command21", function () {});
                var menuItem = menu.addMenuItem("Menu-test.command21", "Ctrl-Alt-2", Menus.BEFORE, "NONEXISTANT");
                expect(menuItem).toBeTruthy();
                expect(menuItem).toBeDefined();

                var $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(2);
                expect($($listItems[1]).find("a#menuitem-unittest2-Menu-test\\.command21").length).toBe(1);


                // reference command is in different menu
                CommandManager.register("Brackets Test Command Custom 22", "Menu-test.command22", function () {});
                var menuOther = Menus.addMenu("Custom 2 Other", "menuitem-unittest2-other");
                menuOther.addMenuItem("Menu-test.command22", "Ctrl-Alt-2");

                CommandManager.register("Brackets Test Command Custom 23", "Menu-test.command23", function () {});
                menuItem = menu.addMenuItem("Menu-test.command23", "Ctrl-Alt-3", Menus.BEFORE, "Menu-test.command22");
                expect(menuItem).toBeTruthy();
                expect(menuItem).toBeDefined();

                $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(3);
                expect($($listItems[2]).find("a#menuitem-unittest2-Menu-test\\.command23").length).toBe(1);


                // reference command exists, but isn't in any menu
                CommandManager.register("Brackets Test Command Custom 24", "Menu-test.command24", function () {});
                CommandManager.register("Brackets Test Command Custom 25", "Menu-test.command25", function () {});

                menuItem = menu.addMenuItem("Menu-test.command24", "Ctrl-Alt-1", Menus.BEFORE, "Menu-test.command25");
                expect(menuItem).toBeTruthy();
                expect(menuItem).toBeDefined();

                $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(4);
                expect($($listItems[3]).find("a#menuitem-unittest2-Menu-test\\.command24").length).toBe(1);
            });

            it("should not add menu item for these cases", async function () {
                CommandManager.register("Brackets Test Command Custom 30", "Menu-test.command30", function () {});
                var menu = Menus.addMenu("Custom 3", "menuitem-unittest3");
                var listSelector = "#menuitem-unittest3 > ul";
                var menuItem = menu.addMenuItem("Menu-test.command30");
                expect(menuItem).toBeTruthy();
                var $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(1);

                // duplicate command in a menu
                menuItem = menu.addMenuItem("Menu-test.command30");
                expect(menuItem).toBeFalsy();

                $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(1);
                expect(menuItem).toBeNull();


                // unregistered command
                menuItem = menu.addMenuItem("UNREGISTERED_COMMAND");
                expect(menuItem).toBe(null);

                $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(1);
                expect(menuItem).toBeNull();
            });

            it("should hideWhenCommandDisabled", async function () {
                let hideCommand = CommandManager.register("Brackets Test Command Custom hide", "Menu-test.commandHide", function () {});
                let menu = Menus.addMenu("Custom hide", "menuitem-hide");
                let menuItem = menu.addMenuItem("Menu-test.commandHide", undefined, undefined, undefined, {
                    hideWhenCommandDisabled: true
                });
                expect(menuItem).toBeTruthy();
                let element = testWindow.document.getElementById("menuitem-hide");

                expect(element.getElementsByClassName("forced-hidden").length).toBe(0);

                hideCommand.setEnabled(false);
                expect(element.getElementsByClassName("forced-hidden").length).toBe(1);

                hideCommand.setEnabled(true);
                expect(element.getElementsByClassName("forced-hidden").length).toBe(0);
            });
        });


        describe("Remove Menu Items", function () {

            function menuDOMChildren(menuItemId) {
                return testWindow.$("#" + menuItemId + " > ul").children();
            }

            it("should add then remove new menu item to empty menu with a command id", async function () {
                var commandId = "Menu-test.removeMenuItem.command0";
                var menuItemId = "menu-test-removeMenuItem0";
                CommandManager.register("Brackets Test Command Custom", commandId, function () {});
                var menu = Menus.addMenu("Custom", menuItemId);
                var $listItems = menuDOMChildren(menuItemId);
                expect($listItems.length).toBe(0);

                // Re-use commands that are already registered
                var menuItem = menu.addMenuItem(commandId);
                expect(menuItem).toBeTruthy();
                expect(menuItem).toBeDefined();

                expect(typeof (commandId)).toBe("string");

                $listItems = menuDOMChildren(menuItemId);
                expect($listItems.length).toBe(1);

                menu.removeMenuItem(commandId);
                $listItems = menuDOMChildren(menuItemId);
                expect($listItems.length).toBe(0);
            });

            it("should add then remove new menu item to empty menu with a command", async function () {
                var commandId = "Menu-test.removeMenuItem.command1";
                var menuItemId = "menu-test-removeMenuItem1";
                CommandManager.register("Brackets Test Command Custom", commandId, function () {});
                var menu = Menus.addMenu("Custom", menuItemId);
                var $listItems = testWindow.$("#menu-custom > ul").children();
                expect($listItems.length).toBe(0);

                // Re-use commands that are already registered
                var menuItem = menu.addMenuItem(commandId);
                expect(menuItem).toBeTruthy();
                expect(menuItem).toBeDefined();

                $listItems = menuDOMChildren(menuItemId);
                expect($listItems.length).toBe(1);

                var command = CommandManager.get(commandId);
                expect(typeof (command)).toBe("object");

                menu.removeMenuItem(command);
                $listItems = menuDOMChildren(menuItemId);
                expect($listItems.length).toBe(0);
            });

            it("should gracefully handle someone trying to delete a menu item that doesn't exist", async function () {
                var commandId = "Menu-test.removeMenuItem.command2";
                var menuItemId = "menu-test-removeMenuItem2";
                var menu = Menus.addMenu("Custom", menuItemId);

                menu.removeMenuItem(commandId);
                expect(menu).toBeTruthy();   // Verify that we got this far...
            });

            it("should gracefully handle someone trying to delete nothing", async function () {
                var menuItemId = "menu-test-removeMenuItem3";
                var menu = Menus.addMenu("Custom", menuItemId);

                menu.removeMenuItem();
                expect(menu).toBeTruthy();   // Verify that we got this far...
            });

            it("should add then remove new menu item ensuring event listeners have also been detached", async function () {
                var menuItemId = "menu-test-removeMenuItem4";
                var commandId = "Menu-test.removeMenuItem.command4";
                CommandManager.register("Brackets Test Command Custom", commandId, function () {});
                var menu = Menus.addMenu("Custom", menuItemId);

                var command = CommandManager.get(commandId);
                command.on("nameChange", function () {});
                expect(Object.keys(command._eventHandlers).length).toBe(1);
                expect(command._eventHandlers.nameChange.length).toBe(1);

                var menuItem = menu.addMenuItem(commandId);
                expect(Object.keys(command._eventHandlers).length).toBe(5);
                expect(command._eventHandlers.nameChange.length).toBe(2);
                expect(command._eventHandlers.enabledStateChange.length).toBe(1);
                expect(command._eventHandlers.checkedStateChange.length).toBe(1);
                expect(command._eventHandlers.keyBindingAdded.length).toBe(1);
                expect(command._eventHandlers.keyBindingRemoved.length).toBe(1);

                // Check if attached events have been removed
                menu.removeMenuItem(command);
                expect(Object.keys(command._eventHandlers).length).toBe(1);
                expect(command._eventHandlers.nameChange.length).toBe(1);
                expect(command._eventHandlers.enabledStateChange).toBeUndefined();
                expect(command._eventHandlers.checkedStateChange).toBeUndefined();
                expect(command._eventHandlers.keyBindingAdded).toBeUndefined();
                expect(command._eventHandlers.keyBindingRemoved).toBeUndefined();
            });
        });


        describe("Remove Menu Divider", function () {

            function menuDividerDOM(menuItemId) {
                return testWindow.$("#" + menuItemId);
            }

            it("should add then remove new menu divider to empty menu", async function () {
                var menuId = "menu-custom-removeMenuDivider-1";
                var menu = Menus.addMenu("Custom", menuId);

                var menuDivider = menu.addMenuDivider();
                expect(menuDivider).toBeTruthy();

                var $listItems = menuDividerDOM(menuDivider.id);
                expect($listItems.length).toBe(1);

                menu.removeMenuDivider(menuDivider.id);
                $listItems = menuDividerDOM(menuDivider.id);
                expect($listItems.length).toBe(0);
            });

            it("should gracefully handle someone trying to remove a menu divider without supplying the id", async function () {
                var menuId = "menu-custom-removeMenuDivider-2";
                var menu = Menus.addMenu("Custom", menuId);

                menu.removeMenuDivider();
                expect(menu).toBeTruthy();   // Verify that we got this far...
            });

            it("should gracefully handle someone trying to remove a menu divider with an invalid id", async function () {
                var menuId = "menu-custom-removeMenuDivider-3";
                var menu = Menus.addMenu("Custom", menuId);

                menu.removeMenuDivider("foo");
                expect(menu).toBeTruthy();   // Verify that we got this far...
            });

            it("should gracefully handle someone trying to remove a menu item that is not a divider", async function () {
                var menuId = "menu-custom-removeMenuDivider-4";
                var menu = Menus.addMenu("Custom", menuId);
                var menuItemId = "menu-test-removeMenuDivider1";
                menu.addMenuItem(menuItemId);

                menu.removeMenuDivider(menuItemId);
                expect(menu).toBeTruthy();   // Verify that we got this far...
            });
        });


        describe("Remove Menu", function () {

            function menuDOM(menuId) {
                return testWindow.$("#" + menuId);
            }

            it("should add then remove new menu to menu bar with a menu id", async function () {
                var menuId = "Menu-test";
                Menus.addMenu("Custom", menuId);
                var $menu = menuDOM(menuId);
                expect($menu.length).toBe(1);

                Menus.removeMenu(menuId);
                $menu = menuDOM(menuId);
                expect($menu.length).toBe(0);
            });

            it("should gracefully handle someone trying to remove a menu that doesn't exist", async function () {
                var menuId = "Menu-test";

                Menus.removeMenu(menuId);
                expect(Menus).toBeTruthy();   // Verify that we got this far...
            });

            it("should gracefully handle someone trying to remove a menu without supplying the id", async function () {
                Menus.removeMenu();
                expect(Menus).toBeTruthy();   // Verify that we got this far...
            });
        });


        describe("Context Submenus", function() {
            var menuId, menu, subMenuId, subMenu;

            function parentMenuItemDOM(menuItemId) {
                return testWindow.$("#" + menuItemId);
            }

            function subMenuDOM(subMenuId) {
                return testWindow.$("#" + subMenuId);
            }

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

            it("open a context submenu", async function() {
                var openEvent = false;

                menuId = "context-menu-custom-openSubmenu-1";
                menu = Menus.registerContextMenu(menuId);

                subMenuId = "submenu-custom-openSubmenu-1";
                subMenu = menu.addSubMenu("submenu", subMenuId);

                CommandManager.register("Brackets Test Command Custom 56", "Menu-test.command56", function () {});
                subMenu.addMenuItem("Menu-test.command56");

                subMenu.on("beforeSubMenuOpen", function() {
                    openEvent = true;
                });

                subMenu.open();


                var $submenu = testWindow.$(".dropdown.open > ul");
                expect($submenu.length).toBe(1);

                expect(openEvent).toBeTruthy();

                subMenu.close();
            });

            it("close a context submenu", async function () {
                menuId = "context-menu-custom-closeSubmenu-1";
                menu = Menus.registerContextMenu(menuId);

                subMenuId = "submenu-custom-closeSubmenu-1";
                subMenu = menu.addSubMenu("submenu", subMenuId);

                CommandManager.register("Brackets Test Command Custom 58", "Menu-test.command58", function () {});
                subMenu.addMenuItem("Menu-test.command58");

                subMenu.open();

                // verify dropdown is open
                var $submenu = testWindow.$(".dropdown.open");
                expect($submenu.length).toBe(1);

                // verify close event
                subMenu.close();

                // verify all dropdowns are closed
                $submenu = testWindow.$(".dropdown.open");
                expect($submenu.length).toBe(0);
            });

            it("context submenu is not clipped", async function() {
                var openEvent = false;

                menuId = "context-menu-custom-clipSubmenu-1";
                menu = Menus.registerContextMenu(menuId);

                subMenuId = "submenu-custom-clipSubmenu-1";
                subMenu = menu.addSubMenu("submenu", subMenuId);

                CommandManager.register("Brackets Test Command Custom 57", "Menu-test.command57", function () {});
                subMenu.addMenuItem("Menu-test.command57");

                subMenu.open();

                var $submenu = testWindow.$(".dropdown.open > ul");
                expect(boundsInsideWindow($submenu)).toBeTruthy();
            });

            describe("Add a context submenu", function() {
                it("should add new context submenu", async function() {
                    menuId = "context-menu-custom-addSubmenu-1";
                    menu = Menus.registerContextMenu(menuId);

                    subMenuId = "submenu-custom-addSubmenu-1";
                    subMenu = menu.addSubMenu("submenu", subMenuId);

                    expect(subMenu).toBeTruthy();
                    expect(subMenu.parentMenuItem).toBeTruthy();

                    // check if new submenu is empty
                    var children = testWindow.$("#submenu-custom-addSubmenu-1 > ul").children();
                    expect(children.length).toBe(0);
                });
                it("should not add duplicate context submenu", async function() {
                    menuId = "context-menu-custom-addSubmenu-2";
                    menu = Menus.registerContextMenu(menuId);

                    subMenuId = "submenu-custom-addSubmenu-2";
                    subMenu = menu.addSubMenu("submenu", subMenuId);

                    expect(subMenu).toBeTruthy();
                    expect(subMenu.parentMenuItem).toBeTruthy();

                    var subMenu2 = menu.addSubMenu("submenu", subMenuId);

                    expect(subMenu2).toBeFalsy();
                    expect(subMenu2).toBeNull();
                });
            });

            describe("Remove a context submenu", function() {
                it("should add then remove new submenu to empty menu", async function () {
                    menuId = "context-menu-custom-removeSubmenu-1";
                    menu = Menus.registerContextMenu(menuId);

                    subMenuId = "submenu-custom-removeSubmenu-1";
                    subMenu = menu.addSubMenu("submenu", subMenuId);
                    expect(subMenu).toBeTruthy();
                    expect(subMenu.parentMenuItem).toBeTruthy();

                    var $subMenu = subMenuDOM(subMenuId);
                    expect($subMenu.length).toBe(1);

                    var $parentMenuItem = parentMenuItemDOM(subMenu.parentMenuItem.id);
                    expect($parentMenuItem.length).toBe(1);

                    menu.removeSubMenu(subMenuId);
                    $subMenu = subMenuDOM(subMenuId);
                    expect($subMenu.length).toBe(0);

                    $parentMenuItem = parentMenuItemDOM(subMenu.parentMenuItem.id);
                    expect($parentMenuItem.length).toBe(0);
                });

                it("should gracefully handle someone trying to remove a submenu that doesn't exist", async function () {
                    menuId = "context-menu-custom-removeSubmenu-2";
                    menu = Menus.registerContextMenu(menuId);

                    subMenuId = "Menu-test";

                    menu.removeSubMenu(subMenuId);
                    expect(menu).toBeTruthy();
                });

                it("should gracefully handle someone trying to remove a submenu without supplying the id", async function () {
                    menuId = "context-menu-custom-removeSubmenu-3";
                    menu = Menus.registerContextMenu(menuId);

                    menu.removeSubMenu();
                    expect(menu).toBeTruthy();
                });
            });

            it("should context submenu hideWhenCommandDisabled", async function () {
                let hideCommand = CommandManager.register("Brackets Test Command Custom hide", "Menu-test.commandHideContextSub", function () {});
                menuId = "context-menu-custom-removeSubmenu-hide";
                menu = Menus.registerContextMenu(menuId);

                subMenuId = "submenu-custom-removeSubmenu-hide";
                subMenu = menu.addSubMenu("submenu", subMenuId);
                let menuItem = subMenu.addMenuItem("Menu-test.commandHideContextSub", undefined, undefined, undefined, {
                    hideWhenCommandDisabled: true
                });
                expect(menuItem).toBeTruthy();
                subMenu.open({pageX: 0, pageY: 0});

                // verify dropdown is open
                let isOpen = subMenu.isOpen();
                expect(isOpen).toBe(true);
                let element = testWindow.document.getElementById("submenu-custom-removeSubmenu-hide");

                expect(element.getElementsByClassName("forced-hidden").length).toBe(0);

                // verify close event
                subMenu.close();

                // verify all dropdowns are closed
                isOpen = subMenu.isOpen();
                expect(isOpen).toBe(false);

                hideCommand.setEnabled(false);
                expect(element.getElementsByClassName("forced-hidden").length).toBe(1);

                hideCommand.setEnabled(true);
                expect(element.getElementsByClassName("forced-hidden").length).toBe(0);
            });
        });

        describe("Menu Item synchronizing", function () {

            it("should have same state as command", async function () {
                // checked state
                var cmd = CommandManager.register("Brackets Test Command Custom 40", "Menu-test.command40", function () {});
                expect(cmd).toBeTruthy();
                expect(cmd).toBeDefined();

                var menu = Menus.addMenu("Synchronizing Menu", "menuitem-unittest4");
                menu.addMenuItem("Menu-test.command40");
                var menuSelector = "#menuitem-unittest4-Menu-test\\.command40";

                // Verify menu is synced with command
                var $menuItem = testWindow.$(menuSelector);
                expect($($menuItem).hasClass("checked")).toBeFalsy();
                expect(cmd.getChecked()).toBeFalsy();

                // toggle command
                cmd.setChecked(true);
                expect(cmd.getChecked()).toBeTruthy();

                // Verify menu gets synced with command
                expect($($menuItem).hasClass("checked")).toBeTruthy();

                // toggle command back
                cmd.setChecked(false);
                expect(cmd.getChecked()).toBeFalsy();

                // Verify menu gets synced with command
                expect($($menuItem).hasClass("checked")).toBeFalsy();


                // enabled state
                $menuItem = testWindow.$(menuSelector);
                expect($($menuItem).hasClass("disabled")).toBeFalsy();

                // toggle command
                cmd.setEnabled(false);
                expect(cmd.getEnabled()).toBeFalsy();

                // Verify menu gets synced with command
                expect($($menuItem).hasClass("disabled")).toBeTruthy();

                // toggle command back
                cmd.setEnabled(true);
                expect(cmd.getEnabled()).toBeTruthy();

                // Verify menu gets synced with command
                expect($($menuItem).hasClass("disabled")).toBeFalsy();


                // key bindings
                CommandManager.register("Brackets Test Command Custom 41", "Menu-test.command41", function () {});
                menu.addMenuItem("Menu-test.command41", "Ctrl-9");
                menuSelector = "#menuitem-unittest4-Menu-test\\.command41";

                // Verify menu is synced with command
                $menuItem = testWindow.$(menuSelector);
                var $shortcut = $menuItem.find(".menu-shortcut");

                // verify key data instead of platform-specific labels
                if (testWindow.brackets.platform === "win") {
                    expect($shortcut.data("key")).toBe("Ctrl-9");
                } else if (testWindow.brackets.platform === "mac") {
                    expect($shortcut.data("key")).toBe("Cmd-9");
                }

                // change keyboard shortcut
                KeyBindingManager.addBinding("Menu-test.command41", "Alt-8");

                // verify updated keyboard shortcut
                expect($shortcut.data("key")).toBe("Alt-8");
            });
        });


        describe("Context Menus", function () {
            it("register a context menu", async function () {
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

            it("open a context menu", async function () {
                var openEvent = false;
                var cmenu = Menus.registerContextMenu("test-cmenu51");
                CommandManager.register("Brackets Test Command Custom 51", "Menu-test.command51", function () {});
                cmenu.addMenuItem("Menu-test.command51");

                cmenu.on("beforeContextMenuOpen", function () {
                    openEvent = true;
                });

                cmenu.open({pageX: 300, pageY: 250});
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

            it("context menu is not clipped", async function () {
                var cmenu = Menus.registerContextMenu("test-cmenu52");
                CommandManager.register("Brackets Test Command Custom 52", "Menu-test.command52", function () {});
                cmenu.addMenuItem("Menu-test.command52");
                var winWidth = $(testWindow).width();
                var winHeight = $(testWindow).height();

                cmenu.open({pageX: 0, pageY: 0});
                var $menu = testWindow.$(".dropdown.open > ul");
                expect(boundsInsideWindow($menu)).toBeTruthy();

                cmenu.open({pageX: winHeight, pageY: winWidth});
                $menu = testWindow.$(".dropdown.open > ul");
                expect(boundsInsideWindow($menu)).toBeTruthy();

                cmenu.open({pageX: 0, pageY: winWidth});
                $menu = testWindow.$(".dropdown.open > ul");
                expect(boundsInsideWindow($menu)).toBeTruthy();

                cmenu.open({pageX: winHeight, pageY: 0});
                $menu = testWindow.$(".dropdown.open > ul");
                expect(boundsInsideWindow($menu)).toBeTruthy();
            });

            it("close context menu", function () {
                var cmenu = Menus.registerContextMenu("test-cmenu53");
                CommandManager.register("Brackets Test Command Custom 53", "Menu-test.command53", function () {});
                cmenu.addMenuItem("Menu-test.command53");

                cmenu.open({pageX: 0, pageY: 0});

                // verify dropdown is open
                var $menus = testWindow.$(".dropdown.open");
                expect($menus.length).toBe(1);

                // verify close event
                cmenu.close();

                // verify context submenus are closed
                expect(cmenu.openSubMenu).toBeFalsy();

                // verify all dropdowns are closed
                $menus = testWindow.$(".dropdown.open");
                expect($menus.length).toBe(0);
            });

            it("close context menu using Esc key", function () {
                var cmenu = Menus.registerContextMenu("test-cmenu54");
                CommandManager.register("Brackets Test Command Custom 54", "Menu-test.command54", function () {});
                cmenu.addMenuItem("Menu-test.command54");

                cmenu.open({pageX: 0, pageY: 0});

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

            it("should context menu hideWhenCommandDisabled", async function () {
                let hideCommand = CommandManager.register("Brackets Test Command Custom hide", "Menu-test.commandHideContext", function () {});
                var cmenu = Menus.registerContextMenu("test-cmenu-hide-context");
                let menuItem = cmenu.addMenuItem("Menu-test.commandHideContext", undefined, undefined, undefined, {
                    hideWhenCommandDisabled: true
                });
                expect(menuItem).toBeTruthy();
                cmenu.open({pageX: 0, pageY: 0});

                // verify dropdown is open
                let isOpen = cmenu.isOpen();
                expect(isOpen).toBe(true);
                let element = testWindow.document.getElementById("test-cmenu-hide-context");

                expect(element.getElementsByClassName("forced-hidden").length).toBe(0);

                // verify close event
                cmenu.close();

                // verify all dropdowns are closed
                isOpen = cmenu.isOpen();
                expect(isOpen).toBe(false);

                hideCommand.setEnabled(false);
                expect(element.getElementsByClassName("forced-hidden").length).toBe(1);

                hideCommand.setEnabled(true);
                expect(element.getElementsByClassName("forced-hidden").length).toBe(0);
            });
        });
    });
});
