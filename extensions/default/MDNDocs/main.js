/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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


    // Core modules
    var _                    = brackets.getModule("thirdparty/lodash"),
        EditorManager        = brackets.getModule("editor/EditorManager"),
        FileSystem           = brackets.getModule("filesystem/FileSystem"),
        FileUtils            = brackets.getModule("file/FileUtils"),
        CSSUtils             = brackets.getModule("language/CSSUtils"),
        HTMLUtils            = brackets.getModule("language/HTMLUtils"),
        ExtensionUtils       = brackets.getModule("utils/ExtensionUtils"),
        Metrics              = brackets.getModule("utils/Metrics");

    // Extension modules
    var InlineDocsViewer = require("InlineDocsViewer");


    /*
     * Caches docs promises
     */
    var promiseCache = {};

    /**
     * Lazily loads JSON docs files. Returns a Promise the is resolved with the parsed Object, or
     * rejected if the file is missing/corrupt.
     * @param {string} fileName JSON file to load
     * @return {!$.Promise}
     */
    function getDocs(fileName) {
        if (!promiseCache[fileName]) {
            var result = new $.Deferred();

            var path = ExtensionUtils.getModulePath(module, fileName),
                file = FileSystem.getFileForPath(path);

            FileUtils.readAsText(file)
                .done(function (text) {
                    var jsonData;
                    try {
                        jsonData = JSON.parse(text);
                    } catch (ex) {
                        console.error("Malformed documentation database: ", ex);
                        result.reject();
                    }
                    result.resolve(jsonData);  // ignored if we already reject()ed above
                })
                .fail(function (err) {
                    console.error("Unable to load documentation database: ", err);
                    result.reject();
                });

            promiseCache[fileName] = result.promise();
        }

        return promiseCache[fileName];
    }


    /**
     * Inline docs provider.
     *
     * @param {!Editor} editor
     * @param {!{line:Number, ch:Number}} pos
     * @return {?$.Promise} resolved with an InlineWidget; null if we're not going to provide anything
     */
    function inlineProvider(hostEditor, pos) {
        var jsonFile, propInfo,
            propQueue = [], // priority queue of propNames to try
            langId = hostEditor.getLanguageForSelection().getId(),
            supportedLangs = {
                "css": true,
                "scss": true,
                "less": true,
                "html": true
            },
            isQuickDocAvailable = langId ? supportedLangs[langId] : -1; // fail if langId is falsy

        // Only provide docs when cursor is in supported language
        if (!isQuickDocAvailable) {
            return null;
        }

        // Send analytics data for Quick Doc open
        Metrics.countEvent(
            "MDNDocs",
            "QuickDoc",
            "css"
        );

        // Only provide docs if the selection is within a single line
        var sel = hostEditor.getSelection();
        if (sel.start.line !== sel.end.line) {
            return null;
        }

        if (langId === "html") { // HTML
            jsonFile = "html.json";
            propInfo = HTMLUtils.getTagInfo(hostEditor, sel.start);
            if (propInfo.position.tokenType === HTMLUtils.ATTR_NAME && propInfo.attr && propInfo.attr.name) {
                // we're on an HTML attribute (and not on its value)
                propQueue.push(propInfo.attr.name.toLowerCase());
            }
            if (propInfo.tagName) { // we're somehow on an HTML tag (no matter where exactly)
                propInfo = propInfo.tagName.toLowerCase();
                propQueue.push("<" + propInfo + ">");
            }
        } else { // CSS-like language
            jsonFile = "css.json";
            propInfo = CSSUtils.getInfoAtPos(hostEditor, sel.start);
            if (propInfo.name) {
                propQueue.push(propInfo.name);
                // remove possible vendor prefixes
                propQueue.push(propInfo.name.replace(/^-(?:webkit|moz|ms|o)-/, ""));
            }
        }

        // Are we on a supported property? (no matter if info is available for the property)
        if (propQueue.length) {
            var result = new $.Deferred();

            // Load JSON file if not done yet
            getDocs(jsonFile)
                .done(function (docs) {
                    // Construct inline widget (if we have docs for this property)

                    var displayName, propDetails,
                        propName = _.find(propQueue, function (propName) { // find the first property where info is available
                            return docs.hasOwnProperty(propName);
                        });

                    if (propName) {
                        propDetails = docs[propName];
                        displayName = propName.substr(propName.lastIndexOf("/") + 1);
                    }
                    if (propDetails) {
                        var inlineWidget = new InlineDocsViewer(displayName, propDetails);
                        inlineWidget.load(hostEditor);
                        result.resolve(inlineWidget);
                    } else {
                        result.reject();
                    }
                })
                .fail(function () {
                    result.reject();
                });

            return result.promise();

        }
        return null;

    }

    // Register as inline docs provider
    EditorManager.registerInlineDocsProvider(inlineProvider);

    exports._getDocs         = getDocs;
    exports._inlineProvider  = inlineProvider;
});
