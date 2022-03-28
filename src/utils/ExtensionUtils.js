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

/*global less */
// jshint ignore: start

/**
 * ExtensionUtils defines utility methods for implementing extensions.
 */
define(function (require, exports, module) {


    var Async              = require("utils/Async"),
        FileSystem         = require("filesystem/FileSystem"),
        FileUtils          = require("file/FileUtils"),
        PathUtils          = require("thirdparty/path-utils/path-utils"),
        PreferencesManager = require("preferences/PreferencesManager");

    /**
     * Appends a <style> tag to the document's head.
     *
     * @param {!string} css CSS code to use as the tag's content
     * @return {!HTMLStyleElement} The generated HTML node
     **/
    function addEmbeddedStyleSheet(css) {
        return $("<style>").text(css).appendTo("head")[0];
    }

    /**
     * Appends a <link> tag to the document's head.
     *
     * @param {!string} url URL to a style sheet
     * @param {$.Deferred=} deferred Optionally check for load and error events
     * @return {!HTMLLinkElement} The generated HTML node
     **/
    function addLinkedStyleSheet(url, deferred) {
        var attributes = {
            type: "text/css",
            rel: "stylesheet",
            href: url
        };

        var $link = $("<link/>").attr(attributes);

        if (deferred) {
            $link.on('load', deferred.resolve).on('error', deferred.reject);
        }

        $link.appendTo("head");

        return $link[0];
    }

    /**
     * getModuleUrl returns different urls for win platform
     * so that's why we need a different check here
     * @see #getModuleUrl
     * @param {!string} pathOrUrl that should be checked if it's absolute
     * @return {!boolean} returns true if pathOrUrl is absolute url on win platform
     *                    or when it's absolute path on other platforms
     */
    function isAbsolutePathOrUrl(pathOrUrl) {
        return brackets.platform === "win" ? PathUtils.isAbsoluteUrl(pathOrUrl) : FileSystem.isAbsolutePath(pathOrUrl);
    }

    /**
     * Parses LESS code and returns a promise that resolves with plain CSS code.
     *
     * Pass the {@link url} argument to resolve relative URLs contained in the code.
     * Make sure URLs in the code are wrapped in quotes, like so:
     *     background-image: url("image.png");
     *
     * @param {!string} code LESS code to parse
     * @param {?string} url URL to the file containing the code
     * @return {!$.Promise} A promise object that is resolved with CSS code if the LESS code can be parsed
     */
    function parseLessCode(code, url) {
        var result = new $.Deferred(),
            options;

        if (url) {
            var dir = url.slice(0, url.lastIndexOf("/") + 1);

            options = {
                filename: url,
                rootpath: dir
            };

            if (isAbsolutePathOrUrl(url)) {
                options.currentFileInfo = {
                    currentDirectory: dir,
                    entryPath: dir,
                    filename: url,
                    rootFilename: url,
                    rootpath: dir
                };
            }
        }

        less.render(code, options, function onParse(err, tree) {
            if (err) {
                result.reject(err);
            } else {
                result.resolve(tree.css);
            }
        });

        return result.promise();
    }

    /**
     * Returns a path to an extension module.
     *
     * @param {!module} module Module provided by RequireJS
     * @param {?string} path Relative path from the extension folder to a file
     * @return {!string} The path to the module's folder
     **/
    function getModulePath(module, path) {
        var modulePath = module.uri.substr(0, module.uri.lastIndexOf("/") + 1);
        if (path) {
            modulePath += path;
        }

        return modulePath;
    }

    /**
     * Returns a URL to an extension module.
     *
     * @param {!module} module Module provided by RequireJS
     * @param {?string} path Relative path from the extension folder to a file
     * @return {!string} The URL to the module's folder
     **/
    function getModuleUrl(module, path) {
        return encodeURI(getModulePath(module, path));
    }

    /**
     * Performs a GET request using a path relative to an extension module.
     *
     * The resulting URL can be retrieved in the resolve callback by accessing
     *
     * @param {!module} module Module provided by RequireJS
     * @param {!string} path Relative path from the extension folder to a file
     * @return {!$.Promise} A promise object that is resolved with the contents of the requested file
     **/
    function loadFile(module, path) {
        var url     = PathUtils.isAbsoluteUrl(path) ? path : getModuleUrl(module, path);
        let result = new $.Deferred();

        $.get(url)
            .done(function (content) {
                result.resolve(content, url);
            })
            .fail(result.reject);

        return result;
    }

    /**
     * Loads a style sheet (CSS or LESS) relative to the extension module.
     *
     * @param {!module} module Module provided by RequireJS
     * @param {!string} path Relative path from the extension folder to a CSS or LESS file
     * @return {!$.Promise} A promise object that is resolved with an HTML node if the file can be loaded.
     */
    function loadStyleSheet(module, path) {
        var result = new $.Deferred();

        loadFile(module, path)
            .done(function (content, URL) {
                var url = URL || this.url;

                if (url.slice(-5) === ".less") {
                    parseLessCode(content, url)
                        .done(function (css) {
                            result.resolve(addEmbeddedStyleSheet(css));
                        })
                        .fail(result.reject);
                } else {
                    // fix css load
                    var deferred = new $.Deferred(),
                        link = addLinkedStyleSheet(url, deferred);

                    deferred
                        .done(function () {
                            result.resolve(link);
                        })
                        .fail(result.reject);
                }
            })
            .fail(result.reject);

        // Summarize error info to console for easier debugging
        result.fail(function (error, textStatus, httpError) {
            if (error.readyState !== undefined) {
                // If first arg is a jQXHR object, the real error info is in the next two args
                console.error("[Extension] Unable to read stylesheet " + path + ":", textStatus, httpError);
            } else {
                console.error("[Extension] Unable to process stylesheet " + path, error);
            }
        });

        return result.promise();
    }

    /**
     * Loads the package.json file in the given extension folder as well as any additional
     * metadata.
     *
     * If there's a .disabled file in the extension directory, then the content of package.json
     * will be augmented with disabled property set to true. It will override whatever value of
     * disabled might be set.
     *
     * @param {string} folder The extension folder.
     * @return {$.Promise} A promise object that is resolved with the parsed contents of the package.json file,
     *     or rejected if there is no package.json with the boolean indicating whether .disabled file exists.
     */
    function _loadLocalMetadata(folder) {
        var packageJSONFile = FileSystem.getFileForPath(folder + "/package.json"),
            disabledFile = FileSystem.getFileForPath(folder + "/.disabled"),
            baseName = FileUtils.getBaseName(folder),
            result = new $.Deferred(),
            jsonPromise = new $.Deferred(),
            disabledPromise = new $.Deferred(),
            json,
            disabled;
        FileUtils.readAsText(packageJSONFile)
            .then(function (text) {
                try {
                    json = JSON.parse(text);
                    jsonPromise.resolve();
                } catch (e) {
                    jsonPromise.reject();
                }
            })
            .fail(jsonPromise.reject);
        disabledFile.exists(function (err, exists) {
            if (err) {
                disabled = false;
            } else {
                disabled = exists;
            }

            var defaultDisabled = PreferencesManager.get("extensions.default.disabled");
            if (Array.isArray(defaultDisabled) && defaultDisabled.indexOf(folder) !== -1) {
                console.warn("Default extension has been disabled on startup: " + baseName);
                disabled = true;
            }

            disabledPromise.resolve();
        });
        Async.waitForAll([jsonPromise, disabledPromise])
            .always(function () {
                if (!json) {
                    // if we don't have any metadata for the extension
                    // we should still create an empty one, so we can attach
                    // disabled property on it in case it's disabled
                    json = {
                        name: baseName
                    };
                }
                json.disabled = disabled;
                result.resolve(json);
            });
        return result.promise();
    }
    /**
     * Loads the package.json file in the given extension folder as well as any additional
     * metadata.
     *
     * @param {string} baseExtensionUrl The extension folder.
     * @param {?string} extensionName optional extension name
     * @return {$.Promise} A promise object that is resolved with the parsed contents of the package.json file,
     *     or rejected if there is no package.json with the boolean indicating whether .disabled file exists.
     */
    function _loadDefaultExtensionMetadata(baseExtensionUrl, extensionName) {
        var packageJSONFile = baseExtensionUrl + "/package.json";
        var result = new $.Deferred();
        var json = {
            name: extensionName
        };
        $.get(packageJSONFile)
            .then(function (result) {
                json = result;
            }).always(function () {
            // if we don't have any metadata for the extension
            // we should still create an empty one, so we can attach
            // disabled property on it in case it's disabled
            var disabled;
            var defaultDisabled = PreferencesManager.get("extensions.default.disabled");
            if (Array.isArray(defaultDisabled) && defaultDisabled.indexOf(extensionName) !== -1) {
                console.warn("Default extension has been disabled on startup: " + baseExtensionUrl);
                disabled = true;
            }
            json.disabled = disabled;
            result.resolve(json);
        });

        return result.promise();
    }

    /**
     * Loads the package.json file in the given extension folder as well as any additional
     * metadata for default extensions in the source directory.
     *
     * If there's a .disabled file in the extension directory, then the content of package.json
     * will be augmented with disabled property set to true. It will override whatever value of
     * disabled might be set.
     *
     * @param {string} folder The extension folder/base url for default extensions.
     * @return {$.Promise} A promise object that is resolved with the parsed contents of the package.json file,
     *     or rejected if there is no package.json with the boolean indicating whether .disabled file exists.
     */
    function loadMetadata(folder, extensionName) {
        if(folder.startsWith("http://") || folder.startsWith("https://")) {
            return _loadDefaultExtensionMetadata(folder, extensionName);
        }
        return _loadLocalMetadata(folder);
    }



    exports.addEmbeddedStyleSheet = addEmbeddedStyleSheet;
    exports.addLinkedStyleSheet   = addLinkedStyleSheet;
    exports.parseLessCode         = parseLessCode;
    exports.getModulePath         = getModulePath;
    exports.getModuleUrl          = getModuleUrl;
    exports.loadFile              = loadFile;
    exports.loadStyleSheet        = loadStyleSheet;
    exports.loadMetadata          = loadMetadata;
});
