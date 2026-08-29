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
 * The "we are moving" dialog, shown on every boot of the origin being retired. main.js decides who
 * gets it; for now that is the ChromeOS webapp only.
 *
 * It states that the move is happening, with no countdown and no cutoff date: the move is under way
 * now, and naming a date we might not hold to would be worse than naming none.
 *
 * Three variants, differing only in the primary button and the closing sentence:
 *  - default, sends the user to the new site where their data migrates automatically;
 *  - Trusted Web Activity, sends the user to the Play Store instead, because the installed app only
 *    trusts the legacy origin and navigating it elsewhere would surface a browser URL bar inside
 *    what looks like an app;
 *  - Safari/iOS, where the automatic migration is deliberately not implemented, so those users are
 *    told to download their projects by hand rather than being left to find out at the cutoff.
 *
 * @module extensionsIntegrated/MigrateAssist/sunset-dialog
 */
define(function (require, exports, module) {
    const Dialogs = require("widgets/Dialogs"),
        DefaultDialogs = require("widgets/DefaultDialogs"),
        Strings = require("strings"),
        StringUtils = require("utils/StringUtils"),
        Metrics = require("utils/Metrics"),
        Constants = require("./constants");

    const BTN_GO_NEW_SITE = "goNewSite",
        BTN_STAY = "stay";

    // There is deliberately no Trusted Web Activity branch. document.referrer is the documented way
    // to spot a TWA launch, but it only survives the first navigation, and this app reloads itself
    // for cache upgrades and after a migration, so a TWA user looks like a browser user from the
    // second boot onward. display-mode: standalone survives but cannot tell a TWA from an installed
    // PWA, and telling a PWA user to update an app they do not have is worse than saying nothing.
    // Installed app users are therefore sent to the new site like everyone else; the shipped APK
    // points at web.phcode.dev and trusts it, so that navigation stays chrome-less.

    function _buildMessage() {
        const paragraphs = [];

        paragraphs.push(StringUtils.format(Strings.MIGRATE_MOVING_MESSAGE,
            Constants.getLegacyDomainName(), Constants.NEW_DOMAIN_NAME));

        if (!Constants.isMigrationSupportedBrowser()) {
            paragraphs.push(Strings.MIGRATE_MANUAL_DOWNLOAD_NOTE);
        } else {
            paragraphs.push(StringUtils.format(Strings.MIGRATE_DATA_SAFE_NOTE, Constants.NEW_DOMAIN_NAME));
        }

        return paragraphs.map((text) => `<p>${text}</p>`).join("");
    }

    function _buildButtons() {
        // "Stay here" is a real choice rather than a nag dismiss. Some installs, managed ChromeOS
        // fleets in particular, may not be able to move on the user's own schedule.
        const stayButton = {
            className: Dialogs.DIALOG_BTN_CLASS_NORMAL,
            id: BTN_STAY,
            text: Strings.MIGRATE_STAY_HERE
        };
        return [
            stayButton,
            {
                className: Dialogs.DIALOG_BTN_CLASS_PRIMARY,
                id: BTN_GO_NEW_SITE,
                text: Strings.MIGRATE_GO_TO_NEW_SITE
            }
        ];
    }

    /**
     * Shows the dialog. Called once per boot by main.js; dismissing it is per boot only,
     * so the user is reminded again next time rather than being able to silence it permanently.
     */
    function show() {
        const variant = Constants.isMigrationSupportedBrowser() ? "web" : "safari";
        Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist", `sunsetShown.${variant}`);

        Dialogs.showModalDialog(
            DefaultDialogs.DIALOG_ID_INFO,
            StringUtils.format(Strings.MIGRATE_MOVING_TITLE, Constants.getLegacyDomainName()),
            _buildMessage(),
            _buildButtons()
        ).done(function (buttonId) {
            if (buttonId === BTN_GO_NEW_SITE) {
                Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist", "sunsetGoNewSite");
                window.location = Constants.getNewOrigin();
            } else {
                Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist", `sunsetStay.${variant}`);
            }
        });
    }

    exports.show = show;
});
