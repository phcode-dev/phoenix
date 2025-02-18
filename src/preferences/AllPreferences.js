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

/*
 * This file houses all the preferences used across Phoenix.
 *
 * To use:
 * ```
 * const AllPreferences = brackets.getModule("preferences/AllPreferences");
 * function preferenceChanged() {
       enabled = PreferencesManager.get(AllPreferences.EMMET);
   }
 * PreferencesManager.on("change", AllPreferences.EMMET, preferenceChanged);
   preferenceChanged();
 * ```
 */

   define(function (require, exports, module) {
    const PreferencesManager = require("preferences/PreferencesManager");
    const Strings = require("strings");

    // list of all the preferences
    const PREFERENCES_LIST = {
        EMMET: "emmet"
    };

    PreferencesManager.definePreference(PREFERENCES_LIST.EMMET, "boolean", true, {
        description: Strings.DESCRIPTION_EMMET
    });

    module.exports = PREFERENCES_LIST;
});