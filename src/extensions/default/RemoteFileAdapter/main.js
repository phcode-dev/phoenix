/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
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

define(function (require, exports, module) {


    var AppInit         = brackets.getModule("utils/AppInit"),
        FileSystem      = brackets.getModule("filesystem/FileSystem"),
        QuickOpen       = brackets.getModule("search/QuickOpen"),
        PathUtils       = brackets.getModule("thirdparty/path-utils/path-utils"),
        CommandManager  = brackets.getModule("command/CommandManager"),
        Commands        = brackets.getModule("command/Commands"),
        ExtensionUtils = brackets.getModule("utils/ExtensionUtils"),
        WorkingSetView = brackets.getModule("project/WorkingSetView"),
        MainViewManager = brackets.getModule("view/MainViewManager"),
        Menus           = brackets.getModule("command/Menus"),
        RemoteFile      = require("RemoteFile");

    var HTTP_PROTOCOL = "http:",
        HTTPS_PROTOCOL = "https:";

    ExtensionUtils.loadStyleSheet(module, "styles.css");

    function protocolClassProvider(data) {
        if (data.fullPath.startsWith("http://")) {
            return "http";
        }

        if (data.fullPath.startsWith("https://")) {
            return "https";
        }

        return "";
    }

    /**
     * Disable context menus which are not useful for remote file
     */
    function _setMenuItemsVisible() {
        var file = MainViewManager.getCurrentlyViewedFile(MainViewManager.ACTIVE_PANE),
            cMenuItems = [Commands.FILE_SAVE, Commands.FILE_RENAME, Commands.NAVIGATE_SHOW_IN_FILE_TREE, Commands.NAVIGATE_SHOW_IN_OS],
            // Enable menu options when no file is present in active pane
            enable = !file || (file.constructor.name !== "RemoteFile");

        // Enable or disable commands based on whether the file is a remoteFile or not.
        cMenuItems.forEach(function (item) {
            CommandManager.get(item).setEnabled(enable);
        });
    }

    AppInit.htmlReady(function () {

        Menus.getContextMenu(Menus.ContextMenuIds.WORKING_SET_CONTEXT_MENU).on("beforeContextMenuOpen", _setMenuItemsVisible);
        MainViewManager.on("currentFileChange", _setMenuItemsVisible);

        var protocolAdapter = {
            priority: 0, // Default priority
            fileImpl: RemoteFile,
            canRead: function (filePath) {
                return true; // Always claim true, we are the default adpaters
            }
        };

        // Register the custom object as HTTP and HTTPS protocol adapter
        FileSystem.registerProtocolAdapter(HTTP_PROTOCOL, protocolAdapter);
        FileSystem.registerProtocolAdapter(HTTPS_PROTOCOL, protocolAdapter);

        // Register as quick open plugin for file URI's having HTTP:|HTTPS: protocol
        QuickOpen.addQuickOpenPlugin(
            {
                name: "Remote file URI input",
                languageIds: [], // for all language modes
                search: function () {
                    return $.Deferred().resolve([arguments[0]]);
                },
                match: function (query) {
                    var protocol = PathUtils.parseUrl(query).protocol;
                    return [HTTP_PROTOCOL, HTTPS_PROTOCOL].indexOf(protocol) !== -1;
                },
                itemFocus: function (query) {
                }, // no op
                itemSelect: function () {
                    CommandManager.execute(Commands.FILE_OPEN, {fullPath: arguments[0]});
                }
            }
        );

        WorkingSetView.addClassProvider(protocolClassProvider);
    });

});
