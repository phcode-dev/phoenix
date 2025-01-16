/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

define(function (require, exports) {
    const Commands = brackets.getModule("command/Commands"),
        Menus = brackets.getModule("command/Menus");

    exports.GIT_STRING_UNIVERSAL = "Git";
    exports.GIT_SUB_MENU = Menus.SubMenuIds.GIT_SUB_MENU;

    // Menus
    exports.GIT_PANEL_CHANGES_CMENU = "git-panel-changes-cmenu";
    exports.GIT_PANEL_HISTORY_CMENU = "git-panel-history-cmenu";
    exports.GIT_PANEL_OPTIONS_CMENU = "git-panel-options-cmenu";

    // commands
    exports.CMD_GIT_INIT = Commands.CMD_GIT_INIT;
    exports.CMD_GIT_CLONE = Commands.CMD_GIT_CLONE;
    exports.CMD_GIT_CLONE_WITH_URL = Commands.CMD_GIT_CLONE_WITH_URL;
    exports.CMD_GIT_SETTINGS_COMMAND_ID = Commands.CMD_GIT_SETTINGS_COMMAND_ID;
    exports.CMD_GIT_CLOSE_UNMODIFIED = Commands.CMD_GIT_CLOSE_UNMODIFIED;
    exports.CMD_GIT_CHECKOUT = Commands.CMD_GIT_CHECKOUT;
    exports.CMD_GIT_RESET_HARD = Commands.CMD_GIT_RESET_HARD;
    exports.CMD_GIT_RESET_SOFT = Commands.CMD_GIT_RESET_SOFT;
    exports.CMD_GIT_RESET_MIXED = Commands.CMD_GIT_RESET_MIXED;
    exports.CMD_GIT_TOGGLE_PANEL = Commands.CMD_GIT_TOGGLE_PANEL;
    exports.CMD_GIT_GOTO_NEXT_CHANGE = Commands.CMD_GIT_GOTO_NEXT_CHANGE;
    exports.CMD_GIT_GOTO_PREVIOUS_CHANGE = Commands.CMD_GIT_GOTO_PREVIOUS_CHANGE;
    exports.CMD_GIT_COMMIT_CURRENT = Commands.CMD_GIT_COMMIT_CURRENT;
    exports.CMD_GIT_COMMIT_ALL = Commands.CMD_GIT_COMMIT_ALL;
    exports.CMD_GIT_FETCH = Commands.CMD_GIT_FETCH;
    exports.CMD_GIT_PULL = Commands.CMD_GIT_PULL;
    exports.CMD_GIT_PUSH = Commands.CMD_GIT_PUSH;
    exports.CMD_GIT_REFRESH = Commands.CMD_GIT_REFRESH;
    exports.CMD_GIT_TAG = Commands.CMD_GIT_TAG;
    exports.CMD_GIT_DISCARD_ALL_CHANGES = Commands.CMD_GIT_DISCARD_ALL_CHANGES;
    exports.CMD_GIT_UNDO_LAST_COMMIT = Commands.CMD_GIT_UNDO_LAST_COMMIT;
    exports.CMD_GIT_CHANGE_USERNAME = Commands.CMD_GIT_CHANGE_USERNAME;
    exports.CMD_GIT_CHANGE_EMAIL = Commands.CMD_GIT_CHANGE_EMAIL;
    exports.CMD_GIT_GERRIT_PUSH_REF = Commands.CMD_GIT_GERRIT_PUSH_REF;
    exports.CMD_GIT_AUTHORS_OF_SELECTION = Commands.CMD_GIT_AUTHORS_OF_SELECTION;
    exports.CMD_GIT_AUTHORS_OF_FILE = Commands.CMD_GIT_AUTHORS_OF_FILE;
    exports.CMD_GIT_TOGGLE_UNTRACKED = Commands.CMD_GIT_TOGGLE_UNTRACKED;
});
