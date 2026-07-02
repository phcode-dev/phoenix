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
 * JSONSupport - code intelligence for JSON files:
 *  - schema-aware completion / hover / validation via the JSON language server (desktop only),
 *  - npm package name and version completion inside package.json dependencies (all builds),
 *  - security-advisory squigglies on vulnerable package.json dependencies.
 *
 * @module extensionsIntegrated/JSONSupport/main
 */
define(function (require, exports, module) {


    const AppInit = require("utils/AppInit"),
        CodeHintManager = require("editor/CodeHintManager"),
        JsonLsp = require("./JsonLsp"),
        NpmHints = require("./NpmHints"),
        NpmHover = require("./NpmHover"),
        VulnerabilityInspection = require("./VulnerabilityInspection");

    // Above the JSON language server's schema completion (priority 1): the npm provider claims
    // only dependency-section contexts in package.json and declines everywhere else, so schema
    // completion still serves the rest of the file.
    const NPM_HINTS_PRIORITY = 2;

    AppInit.appReady(function () {
        CodeHintManager.registerHintProvider(new NpmHints.NpmHints(), ["json"], NPM_HINTS_PRIORITY);
        VulnerabilityInspection.init();
        NpmHover.init();
        JsonLsp.init();     // no-ops outside the desktop app
    });
});
