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
 * The "we are moving" dialog, shown on the origin being retired on every boot.
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
        BTN_UPDATE_APP = "updateApp",
        BTN_STAY = "stay";

    // document.referrer only reflects the navigation that opened this document, so read it once
    // before anything can navigate and hold on to the answer.
    const isTWA = Constants.isTWALaunch();

    function _buildMessage() {
        const paragraphs = [];

        paragraphs.push(StringUtils.format(Strings.MIGRATE_MOVING_MESSAGE,
            Constants.getLegacyDomainName(), Constants.NEW_DOMAIN_NAME));

        if (!Constants.isPastSunset()) {
            const days = Constants.daysToSunset();
            paragraphs.push(StringUtils.format(
                days === 1 ? Strings.MIGRATE_SUNSET_COUNTDOWN_ONE : Strings.MIGRATE_SUNSET_COUNTDOWN,
                days, Constants.getLegacyDomainName()));
        }

        if (!Constants.isMigrationSupportedBrowser()) {
            paragraphs.push(Strings.MIGRATE_MANUAL_DOWNLOAD_NOTE);
        } else if (isTWA) {
            paragraphs.push(Strings.MIGRATE_TWA_UPDATE_NOTE);
            paragraphs.push(StringUtils.format(Strings.MIGRATE_TWA_BROWSER_LINK,
                Constants.getNewOrigin(), Constants.NEW_DOMAIN_NAME));
        } else {
            paragraphs.push(StringUtils.format(Strings.MIGRATE_DATA_SAFE_NOTE, Constants.NEW_DOMAIN_NAME));
        }

        return paragraphs.map((text) => `<p>${text}</p>`).join("");
    }

    function _buildButtons() {
        // "Stay here" is a real choice, not a nag dismiss. On managed ChromeOS fleets the Play Store
        // can be blocked outright, so the update button may be a dead end through no fault of the
        // user, and the app has to keep working for them.
        const stayButton = {
            className: Dialogs.DIALOG_BTN_CLASS_NORMAL,
            id: BTN_STAY,
            text: Strings.MIGRATE_STAY_HERE
        };
        if (isTWA) {
            return [
                stayButton,
                {
                    className: Dialogs.DIALOG_BTN_CLASS_PRIMARY,
                    id: BTN_UPDATE_APP,
                    text: Strings.MIGRATE_UPDATE_APP
                }
            ];
        }
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
     * Shows the dialog. Called once per boot on the legacy origin; dismissing it is per boot only,
     * so the user is reminded again next time rather than being able to silence it permanently.
     */
    function show() {
        const variant = !Constants.isMigrationSupportedBrowser() ? "safari" : (isTWA ? "twa" : "web");
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
            } else if (buttonId === BTN_UPDATE_APP) {
                Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist", "sunsetUpdateApp");
                window.open(Constants.TWA_STORE_URL, "_blank", "noopener");
            } else {
                Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist", `sunsetStay.${variant}`);
            }
        });
    }

    exports.show = show;
});
