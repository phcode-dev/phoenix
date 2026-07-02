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
 * Curated JSON-schema associations for well-known config files, pushed to the JSON language
 * server as the `json.schemas` setting. The server downloads the schema URLs itself (http/https
 * are in its default handledSchemaProtocols) and caches them for the session.
 *
 * This is a hand-picked subset of the schemastore.org catalog covering the files web developers
 * meet daily. Fetching the full catalog (https://www.schemastore.org/api/json/catalog.json) and
 * merging it in is a possible future enhancement - kept out for now to avoid a network dependency
 * at server start.
 *
 * Shape: LSP `json.schemas` entries - { fileMatch: string[], url: string }.
 *
 * @module extensionsIntegrated/JSONSupport/schemaAssociations
 */
define(function (require, exports, module) {


    const SCHEMA_ASSOCIATIONS = [
        { fileMatch: ["package.json"], url: "https://json.schemastore.org/package.json" },
        { fileMatch: ["tsconfig.json", "tsconfig.*.json"], url: "https://json.schemastore.org/tsconfig" },
        { fileMatch: ["jsconfig.json", "jsconfig.*.json"], url: "https://json.schemastore.org/jsconfig" },
        { fileMatch: [".eslintrc", ".eslintrc.json"], url: "https://json.schemastore.org/eslintrc" },
        {
            fileMatch: [".babelrc", ".babelrc.json", "babel.config.json"],
            url: "https://json.schemastore.org/babelrc"
        },
        { fileMatch: [".prettierrc", ".prettierrc.json"], url: "https://json.schemastore.org/prettierrc" },
        { fileMatch: [".stylelintrc", ".stylelintrc.json"], url: "https://json.schemastore.org/stylelintrc" },
        { fileMatch: ["composer.json"], url: "https://json.schemastore.org/composer" },
        { fileMatch: ["bower.json"], url: "https://json.schemastore.org/bower" },
        { fileMatch: [".bowerrc"], url: "https://json.schemastore.org/bowerrc" },
        { fileMatch: [".jshintrc"], url: "https://json.schemastore.org/jshintrc" },
        {
            fileMatch: ["manifest.json", "*.webmanifest"],
            url: "https://json.schemastore.org/web-manifest-combined.json"
        },
        { fileMatch: ["lerna.json"], url: "https://json.schemastore.org/lerna" },
        { fileMatch: ["turbo.json"], url: "https://json.schemastore.org/turbo.json" },
        { fileMatch: ["nx.json"], url: "https://json.schemastore.org/nx" },
        { fileMatch: ["firebase.json"], url: "https://json.schemastore.org/firebase" },
        { fileMatch: ["vercel.json"], url: "https://json.schemastore.org/vercel" },
        {
            fileMatch: ["renovate.json", ".renovaterc", ".renovaterc.json"],
            url: "https://docs.renovatebot.com/renovate-schema.json"
        }
    ];

    exports.SCHEMA_ASSOCIATIONS = SCHEMA_ASSOCIATIONS;
});
