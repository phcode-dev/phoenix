// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2021 - present core.ai. All rights reserved.

/*global*/

define(function (require, exports, module) {

    const PreferencesManager           = brackets.getModule("preferences/PreferencesManager"),
        HealthDataPreview            = require("HealthDataPreview"),
        HealthDataPopup              = require("HealthDataPopup");

    // Since we don't have any user accounts or trackable ID to uniquely identify a user on first launch,
    // we should be ok GDPR wise to delay showing the health data popup. But it was found later to be annoying
    // and a workflow distraction. So we show the health data popup almost immediately so that the user can
    // close all the popups in on go.

    _showFirstLaunchPopup();

    function handleHealthDataStatistics() {
        HealthDataPreview.previewHealthData();
    }

    function _showFirstLaunchPopup() {
        if(!window.testEnvironment){
            const alreadyShown = PreferencesManager.getViewState("healthDataNotificationShown");
            const prefs = PreferencesManager.getExtensionPrefs("healthData");
            if (!alreadyShown && prefs.get("healthDataTracking")) {
                HealthDataPopup.showFirstLaunchTooltip()
                    .done(function () {
                        PreferencesManager.setViewState("healthDataNotificationShown", true);
                    });
            }
        }
    }

    exports.handleHealthDataStatistics       = handleHealthDataStatistics;
});
