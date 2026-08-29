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

/**
 * Entry point for the one time move off the legacy web origin onto web.phcode.dev.
 *
 * Which half runs depends purely on which origin this window is:
 *  - on the origin being retired, announce the move once per boot (sunset-dialog), currently only
 *    on the ChromeOS webapp;
 *  - on the new origin, quietly check whether anything is left behind and pull it across
 *    (migrator), plus register the Help menu entry that lets the user ask for it again later.
 *
 * Anywhere else, including the desktop app, this module does nothing at all.
 *
 * Styling lives in `../../styles/Extn-MigrateAssist.less`.
 *
 * @module extensionsIntegrated/MigrateAssist/main
 */
define(function (require, exports, module) {
    const AppInit = require("utils/AppInit"),
        CommandManager = require("command/CommandManager"),
        Commands = require("command/Commands"),
        Menus = require("command/Menus"),
        Strings = require("strings"),
        StringUtils = require("utils/StringUtils"),
        Metrics = require("utils/Metrics"),
        Constants = require("./constants"),
        SunsetDialog = require("./sunset-dialog"),
        Migrator = require("./migrator");

    function _initLegacyOrigin() {
        // For now the announcement only goes up on the ChromeOS webapp. Everywhere else the legacy
        // origin stays silent: it keeps working, and the data of anyone who does open the new site
        // is pulled across automatically, so there is nothing the dialog has to make them do.
        if (Phoenix.isTestWindow || !Phoenix.browser.isChromeOS) {
            return;
        }
        SunsetDialog.show();
    }

    function _initNewOrigin() {
        if (!Constants.isMigrationSupportedBrowser()) {
            // Deliberately excluded, but worth counting: it is the difference between "nobody on
            // Safari needed this" and "we never offered it to them".
            Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist", "unsupportedBrowser");
        }
        // The menu entry is only registered here, so it can never show up on the legacy origin or on
        // desktop. It is also skipped on Safari/iOS, where the migration is deliberately not
        // implemented: offering an action we do not honour would be worse than not offering it.
        if (!Phoenix.isTestWindow && Constants.isMigrationSupportedBrowser()) {
            CommandManager.register(
                StringUtils.format(Strings.CMD_MIGRATE_DATA, Constants.getLegacyDomainName()),
                Commands.HELP_MIGRATE_DATA, function () {
                Migrator.runManually();
            });
            // Anchored to About rather than to Check for Updates: the updater only registers its
            // command on the desktop build, so on the web the anchor would not exist and this would
            // silently fall through to the very bottom of the menu.
            Menus.getMenu(Menus.AppMenuBar.HELP_MENU)
                .addMenuItem(Commands.HELP_MIGRATE_DATA, "", Menus.BEFORE, Commands.HELP_ABOUT);
        }
        Migrator.runOnBoot();
    }

    AppInit.appReady(function () {
        if (Constants.isLegacyOrigin()) {
            _initLegacyOrigin();
        } else if (Constants.isNewOrigin()) {
            _initNewOrigin();
        }
    });
});
