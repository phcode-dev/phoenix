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

/* global jsPromise, logger */
define(function (require, exports, module) {
    const Global = require("./global");
    const FileSystem = require("filesystem/FileSystem");
    const FileUtils = require("file/FileUtils");
    const FileSystemError = require("filesystem/FileSystemError");
    const Helper = require("./helper");

    const SNIPPETS_FILE_PATH = brackets.app.getApplicationSupportDirectory() + "/customSnippets.json";

    /**
     * This function is responsible to load snippets from file storage
     * @returns {Promise} a promise that resolves when snippets are loaded
     */
    function loadSnippetsFromState() {
        return new Promise((resolve, reject) => {
            const file = FileSystem.getFileForPath(SNIPPETS_FILE_PATH);

            // true is for bypassCache, to get the latest content always
            const readPromise = FileUtils.readAsText(file, true);

            readPromise
                .done(function (text) {
                    try {
                        const data = JSON.parse(text);
                        if (data && data.snippets && Array.isArray(data.snippets)) {
                            Global.SnippetHintsList = data.snippets;
                        } else {
                            // no snippets are present
                            Global.SnippetHintsList = [];
                        }
                        // rebuild the optimized data structures after loading snippets
                        Helper.rebuildOptimizedStructures();
                        resolve();
                    } catch (error) {
                        logger.reportError(
                            error,
                            "Custom Snippets: Failed to parse snippets JSON file. File might be corrupted."
                        );
                        Global.SnippetHintsList = []; // fallback
                        Helper.rebuildOptimizedStructures();
                        resolve();
                    }
                })
                .fail(function (error) {
                    if (error === FileSystemError.NOT_FOUND) {
                        // file is not present, empty array
                        Global.SnippetHintsList = [];
                        Helper.rebuildOptimizedStructures();
                        resolve();
                    } else {
                        logger.reportError(error, "Custom Snippets: unexpected file system error loading snippets");
                        Global.SnippetHintsList = [];
                        Helper.rebuildOptimizedStructures();
                        resolve();
                    }
                });
        });
    }

    /**
     * this function is responsible to save snippets to file storage
     * @returns {Promise} a promise that resolves when snippets are saved
     */
    function saveSnippetsToState() {
        const dataToSave = {
            snippets: Global.SnippetHintsList
        };

        const file = FileSystem.getFileForPath(SNIPPETS_FILE_PATH);
        const jsonText = JSON.stringify(dataToSave);

        // true is allowBlindWrite to overwrite without checking file contents
        return jsPromise(FileUtils.writeText(file, jsonText, true));
    }

    exports.loadSnippetsFromState = loadSnippetsFromState;
    exports.saveSnippetsToState = saveSnippetsToState;
});
