/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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



    // Registry for languages that have specific per-language URLs or file paths that we use
    // elsewhere in Brackets.
    //
    // TODO: dynamically populate the local prefix list below?
    module.exports = {
        root: true,
        "bg": true,
        "cs": true,
        "da": true,
        "de": true,
        "es": true,
        "fa-ir": true,
        "fi": true,
        "fr": true,
        "hr": true,
        "id": true,
        "it": true,
        "ja": true,
        "ko": true,
        "nb": true,
        "pl": true,
        "pt-br": true,
        "pt-pt": true,
        "ru": true,
        "sv": true,
        "zh-cn": true,
        "zh-tw": true,
        "tr": true,
        "uk": true
    };
});
