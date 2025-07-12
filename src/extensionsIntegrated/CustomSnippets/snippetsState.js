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

define(function (require, exports, module) {
    const Global = require("./global");
    const PreferencesBase = require("preferences/PreferencesBase");

    const SNIPPETS_FILE_PATH = brackets.app.getApplicationSupportDirectory() + "/customSnippets.json";

    // the file storage for storing the snippets
    const fileStorage = new PreferencesBase.FileStorage(SNIPPETS_FILE_PATH, {
        snippets: []
    });

    /**
     * This function is responsible to load snippets from file storage
     * @returns {Promise} a promise that resolves when snippets are loaded
     */
    function loadSnippetsFromState() {
        return new Promise((resolve, reject) => {
            fileStorage
                .load()
                .done(function (data) {
                    if (data && data.snippets && Array.isArray(data.snippets)) {
                        Global.SnippetHintsList = data.snippets;
                    } else {
                        // no snippets are present
                        Global.SnippetHintsList = [];
                    }
                    resolve();
                })
                .fail(function (error) {
                    console.error("unable to load snippets from file storage:", error);
                    Global.SnippetHintsList = []; // since it failed we init a empty array
                    reject(error);
                });
        });
    }

    /**
     * this function is responsible to save snippets to file storage
     * @returns {Promise} a promise that resolves when snippets are saved
     */
    function saveSnippetsToState() {
        return new Promise((resolve, reject) => {
            const dataToSave = {
                snippets: Global.SnippetHintsList
            };

            fileStorage
                .save(dataToSave)
                .done(() => {
                    resolve();
                })
                .fail((error) => {
                    console.error("unable to save snippets to file storage:", error);
                    reject(error);
                });
        });
    }

    exports.loadSnippetsFromState = loadSnippetsFromState;
    exports.saveSnippetsToState = saveSnippetsToState;
});
