
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
