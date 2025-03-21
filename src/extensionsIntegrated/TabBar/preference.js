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

/*
 * This script contains the preference settings for the tab bar.
 */
define(function (require, exports, module) {
    const PreferencesManager = require("preferences/PreferencesManager");
    const Strings = require("strings");


    // Preference settings
    const PREFERENCES_TAB_BAR = "tabBar.options";   // Preference name
    let tabBarEnabled = true;  // preference to check if the tab bar is enabled
    let tabBarNumberOfTabs = -1; // preference to check the number of tabs, -1 means all tabs


    PreferencesManager.definePreference(
        PREFERENCES_TAB_BAR,
        "object",
        { showTabBar: true, numberOfTabs: -1 },
        {
            description: Strings.DESCRIPTION_TABBAR,
            keys: {
                showTabBar: {
                    type: "boolean",
                    description: Strings.DESCRIPTION_SHOW_TABBAR,
                    initial: true
                },
                numberOfTabs: {
                    type: "number",
                    description: Strings.DESCRIPTION_NUMBER_OF_TABS,
                    initial: -1
                }
            }
        });


    module.exports = {
        PREFERENCES_TAB_BAR,
        tabBarEnabled,
        tabBarNumberOfTabs
    };
});
