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
    exports.GIT_STRING_UNIVERSAL = "Git";
    exports.GIT_SUB_MENU = "git-submenu";

    // Menus
    exports.GIT_PANEL_CHANGES_CMENU = "git-panel-changes-cmenu";
    exports.GIT_PANEL_HISTORY_CMENU = "git-panel-history-cmenu";
    exports.GIT_PANEL_OPTIONS_CMENU = "git-panel-options-cmenu";

    // commands
    exports.CMD_GIT_INIT = "git-init";
    exports.CMD_GIT_CLONE = "git-clone";
    exports.CMD_GIT_CLONE_WITH_URL = "git-clone-url";
    exports.CMD_GIT_SETTINGS_COMMAND_ID = "git-settings";
    exports.CMD_GIT_CLOSE_UNMODIFIED = "git-close-unmodified-files";
    exports.CMD_GIT_CHECKOUT = "git-checkout";
    exports.CMD_GIT_RESET_HARD = "git-reset-hard";
    exports.CMD_GIT_RESET_SOFT = "git-reset-soft";
    exports.CMD_GIT_RESET_MIXED = "git-reset-mixed";
    exports.CMD_GIT_TOGGLE_PANEL = "git-toggle-panel";
    exports.CMD_GIT_GOTO_NEXT_CHANGE = "git-gotoNextChange";
    exports.CMD_GIT_GOTO_PREVIOUS_CHANGE = "git-gotoPrevChange";
    exports.CMD_GIT_COMMIT_CURRENT = "git-commitCurrent";
    exports.CMD_GIT_COMMIT_ALL = "git-commitAll";
    exports.CMD_GIT_FETCH = "git-fetch";
    exports.CMD_GIT_PULL = "git-pull";
    exports.CMD_GIT_PUSH = "git-push";
    exports.CMD_GIT_REFRESH = "git-refresh";
    exports.CMD_GIT_TAG = "git-tag";
    exports.CMD_GIT_DISCARD_ALL_CHANGES = "git-discard-all-changes";
    exports.CMD_GIT_UNDO_LAST_COMMIT = "git-undo-last-commit";
    exports.CMD_GIT_CHANGE_USERNAME = "git-change-username";
    exports.CMD_GIT_CHANGE_EMAIL = "git-change-email";
    exports.CMD_GIT_GERRIT_PUSH_REF = "git-gerrit-push_ref";
    exports.CMD_GIT_AUTHORS_OF_SELECTION = "git-authors-of-selection";
    exports.CMD_GIT_AUTHORS_OF_FILE = "git-authors-of-file";
    exports.CMD_GIT_TOGGLE_UNTRACKED = "git-toggle-untracked";
});
