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

define(function (require, exports, module) {


    var LanguageManager = brackets.getModule("language/LanguageManager");

    LanguageManager.defineLanguage("less", {
        name: "LESS",
        mode: ["css", "text/x-less"],
        fileExtensions: ["less"],
        blockComment: ["/*", "*/"],
        lineComment: ["//"]
    }).done(function (lessLanguage) {
        // Hack to make it so that when we see a "css" mode inside a LESS file,
        // we know that it's really LESS. Ideally we would have a way to get the
        // actual mime type from CodeMirror, so we know what mode configuration is
        // in use (see #7345).
        lessLanguage._setLanguageForMode("css", lessLanguage);
    });
});
