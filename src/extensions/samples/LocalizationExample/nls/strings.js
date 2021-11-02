/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
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

define(function (require, exports, module) {



    // Code that needs to display user strings should call require("strings") to load
    // strings.js. This file will dynamically load strings.js for the specified by bracketes.locale.
    //
    // Translations for other locales should be placed in nls/<locale<optional country code>>/strings.js
    // Localization is provided via the i18n plugin.
    // All other bundles for languages need to add a prefix to the exports below so i18n can find them.
    // TODO: dynamically populate the local prefix list below?
    module.exports = {
        root: true,
        "fr": true
    };
});
