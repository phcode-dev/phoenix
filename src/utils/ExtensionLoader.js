/*
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

/**
 * ExtensionLoader searches the filesystem for extensions, then creates a new context for each one and loads it.
 * This module dispatches the following events:
 *      "load" - when an extension is successfully loaded. The second argument is the file path to the
 *          extension root.
 *      "loadFailed" - when an extension load is unsuccessful. The second argument is the file path to the
 *          extension root.
 */
// jshint ignore: start
/*global logger, Phoenix*/
/*eslint-env es6*/
/*eslint no-console: 0*/
/*eslint strict: ["error", "global"]*/

define(function (require, exports, module) {


    require("utils/Global");

    const _              = require("thirdparty/lodash"),
        EventDispatcher = require("utils/EventDispatcher"),
        FileSystem     = require("filesystem/FileSystem"),
        FileUtils      = require("file/FileUtils"),
        Async          = require("utils/Async"),
        ExtensionUtils = require("utils/ExtensionUtils"),
        UrlParams      = require("utils/UrlParams").UrlParams,
        PathUtils      = require("thirdparty/path-utils/path-utils"),
        DefaultExtensionsList = JSON.parse(require("text!extensions/default/DefaultExtensions.json"))
            .defaultExtensionsList;

    // default async initExtension timeout
    var EXTENSION_LOAD_TIMOUT_SECONDS = 60,
        INIT_EXTENSION_TIMEOUT = EXTENSION_LOAD_TIMOUT_SECONDS * 1000;

    var _init       = false,
        _extensions = {},
        _initExtensionTimeout = INIT_EXTENSION_TIMEOUT,
        srcPath     = FileUtils.getNativeBracketsDirectoryPath();

    /**
     * Stores require.js contexts of extensions
     * @type {Object.<string, Object>}
     */
    var contexts    = {};

    var pathLib =  Phoenix.VFS.path;

    // The native directory path ends with either "test" or "src". We need "src" to
    // load the text and i18n modules.
    srcPath = srcPath.replace(/\/test$/, "/src"); // convert from "test" to "src"


    // Retrieve the global paths
    var globalPaths = brackets._getGlobalRequireJSConfig().paths;

    // Convert the relative paths to absolute
    Object.keys(globalPaths).forEach(function (key) {
        globalPaths[key] = PathUtils.makePathAbsolute(srcPath + "/" + globalPaths[key]);
    });

    /**
     * Returns the path to the default extensions directory relative to Phoenix base URL
     */
    const DEFAULT_EXTENSIONS_PATH_BASE = "/extensions/default";
    function getDefaultExtensionPath() {
        const href = window.location.href;
        const baseUrl = href.substring(0, href.lastIndexOf("/")); // trim all query string params
        return baseUrl + DEFAULT_EXTENSIONS_PATH_BASE;
    }

    /**
     * Returns the full path to the development extensions directory.
     */
    function _getExtensionPath() {
        return pathLib.normalize(Phoenix.VFS.getExtensionDir());
    }

    /**
     * Returns the full path to the development extensions directory.
     */
    function getDevExtensionPath() {
        return pathLib.normalize(Phoenix.VFS.getDevExtensionDir());
    }

    /**
     * Returns the full path of the default user extensions directory. This is in the users
     * application support directory, which is typically
     * /Users/<user>/Application Support/Brackets/extensions/user on the mac, and
     * C:\Users\<user>\AppData\Roaming\Brackets\extensions\user on windows.
     */
    function getUserExtensionPath() {
        return pathLib.normalize(Phoenix.VFS.getUserExtensionDir());
    }

    /**
     * Returns the require.js require context used to load an extension
     *
     * @param {!string} name, used to identify the extension
     * @return {!Object} A require.js require object used to load the extension, or undefined if
     * there is no require object with that name
     */
    function getRequireContextForExtension(name) {
        return contexts[name];
    }

    /**
     * @private
     * Get timeout value for rejecting an extension's async initExtension promise.
     * @return {number} Timeout in milliseconds
     */
    function _getInitExtensionTimeout() {
        return _initExtensionTimeout;
    }

    /**
     * @private
     * Set timeout for rejecting an extension's async initExtension promise.
     * @param {number} value Timeout in milliseconds
     */
    function _setInitExtensionTimeout(value) {
        _initExtensionTimeout = value;
    }

    /**
     * @private
     * Loads optional requirejs-config.json file for an extension
     * @param {Object} baseConfig
     * @return {$.Promise}
     */
    function _mergeConfigFromURL(baseConfig) {
        var deferred = new $.Deferred(),
            extensionConfigFile = baseConfig.baseUrl + "/requirejs-config.json";

        // Optional JSON config for require.js
        $.get(extensionConfigFile).done(function (extensionConfig) {
            if(Object.keys(extensionConfig || {}).length === 0){
                deferred.resolve(baseConfig);
                return;
            }
            try {
                if(!extensionConfig.paths){
                    extensionConfig.paths = {};
                }
                // baseConfig.paths properties will override any extension config paths
                _.extend(extensionConfig.paths, baseConfig.paths);

                // Overwrite baseUrl, context, locale (paths is already merged above)
                _.extend(extensionConfig, _.omit(baseConfig, "paths"));

                deferred.resolve(extensionConfig);
            } catch (err) {
                // Failed to parse requirejs-config.json
                deferred.reject("failed to parse requirejs-config.json");
            }
        }).fail(function (err) {
            // If requirejs-config.json isn't specified or if there is a bad config, resolve with the baseConfig
            // to try loading the extension
            if(err.status === 200) {
                // we received the file, but its invalid json
                console.error("[Extension] The require config file provided is invalid", extensionConfigFile);
            }
            deferred.resolve(baseConfig);
        });

        return deferred.promise();
    }

    /**
     * @private
     * Loads optional requirejs-config.json file for an extension
     * @param {Object} baseConfig
     * @return {$.Promise}
     */
    function _mergeConfig(baseConfig) {
        if(baseConfig.baseUrl.startsWith("http://") || baseConfig.baseUrl.startsWith("https://")) {
            return _mergeConfigFromURL(baseConfig);
        }
        throw new Error("Config can only be loaded from an http url, but got" + baseConfig.baseUrl);
    }

    /**
     * Loads the extension module that lives at baseUrl into its own Require.js context
     *
     * @param {!string} name, used to identify the extension
     * @param {!{baseUrl: string}} config object with baseUrl property containing absolute path of extension
     * @param {!string} entryPoint, name of the main js file to load
     * @return {!$.Promise} A promise object that is resolved when the extension is loaded, or rejected
     *              if the extension fails to load or throws an exception immediately when loaded.
     *              (Note: if extension contains a JS syntax error, promise is resolved not rejected).
     */
    function loadExtensionModule(name, config, entryPoint) {
        let extensionConfig = {
            context: name,
            baseUrl: config.baseUrl,
            paths: globalPaths,
            locale: brackets.getLocale(),
            waitSeconds: EXTENSION_LOAD_TIMOUT_SECONDS
        };
        const isDefaultExtensionModule =( extensionConfig.baseUrl
            && extensionConfig.baseUrl.startsWith(`${location.href}extensions/default/`));
        // Read optional requirejs-config.json
        return _mergeConfig(extensionConfig).then(function (mergedConfig) {
            // Create new RequireJS context and load extension entry point
            var extensionRequire = brackets.libRequire.config(mergedConfig),
                extensionRequireDeferred = new $.Deferred();

            contexts[name] = extensionRequire;
            extensionRequire([entryPoint], extensionRequireDeferred.resolve, extensionRequireDeferred.reject);

            return extensionRequireDeferred.promise();
        }).then(function (module) {
            // Extension loaded normally
            var initPromise;

            _extensions[name] = module;

            // Optional sync/async initExtension
            if (module && module.initExtension && (typeof module.initExtension === "function")) {
                // optional async extension init
                try {
                    initPromise = Async.withTimeout(module.initExtension(), _getInitExtensionTimeout());
                } catch (err) {
                    // Synchronous error while initializing extension
                    console.error("[Extension] Error -- error thrown during initExtension for " + name + ": " + err);
                    logger.reportError(err);
                    return new $.Deferred().reject(err).promise();
                }

                // initExtension may be synchronous and may not return a promise
                if (initPromise) {
                    // WARNING: These calls to initPromise.fail() and initPromise.then(),
                    // could also result in a runtime error if initPromise is not a valid
                    // promise. Currently, the promise is wrapped via Async.withTimeout(),
                    // so the call is safe as-is.
                    initPromise.fail(function (err) {
                        let errorMessage = "[Extension] Error -- timeout during initExtension for " + name;
                        if (err === Async.ERROR_TIMEOUT) {
                            console.error(errorMessage);
                        } else {
                            errorMessage = "[Extension] Error -- failed initExtension for " + name;
                            console.error(errorMessage + (err ? ": " + err : ""));
                        }
                        if(isDefaultExtensionModule){
                            logger.reportError(err, errorMessage);
                        }
                    });

                    return initPromise;
                }
            }
        }, function errback(err) {
            // Extension failed to load during the initial require() call
            var additionalInfo = String(err);
            if (err.requireType === "scripterror" && err.originalError) {
                // This type has a misleading error message - replace it with something clearer (URL of require() call that got a 404 result)
                additionalInfo = "Module does not exist: " + err.originalError.target.src;
            }
            console.error("[Extension] failed to load " + config.baseUrl + " - " + additionalInfo);
            if(isDefaultExtensionModule){
                logger.reportError(err, "[Extension] failed to load " + config.baseUrl + " - " + additionalInfo);
            }

            if (err.requireType === "define") {
                // This type has a useful stack (exception thrown by ext code or info on bad getModule() call)
                console.log(err.stack);
            }
        });
    }

    /**
     * Loads the extension that lives at baseUrl into its own Require.js context
     *
     * @param {!string} name, used to identify the extension
     * @param {!{baseUrl: string}} config object with baseUrl property containing absolute path of extension
     * @param {!string} entryPoint, name of the main js file to load
     * @return {!$.Promise} A promise object that is resolved when the extension is loaded, or rejected
     *              if the extension fails to load or throws an exception immediately when loaded.
     *              (Note: if extension contains a JS syntax error, promise is resolved not rejected).
     */
    function loadExtension(name, config, entryPoint) {
        var promise = new $.Deferred();

        // Try to load the package.json to figure out if we are loading a theme.
        ExtensionUtils.loadMetadata(config.baseUrl, name).always(promise.resolve);

        return promise
            .then(function (metadata) {
                // No special handling for themes... Let the promise propagate into the ExtensionManager
                if (metadata && metadata.theme) {
                    return;
                }

                if (!metadata.disabled) {
                    return loadExtensionModule(name, config, entryPoint);
                }
                return new $.Deferred().reject("disabled").promise();

            })
            .then(function () {
                exports.trigger("load", config.baseUrl);
            }, function (err) {
                if (err === "disabled") {
                    exports.trigger("disabled", config.baseUrl);
                } else {
                    exports.trigger("loadFailed", config.baseUrl);
                }
            });
    }

    /**
     * Runs unit tests for the extension that lives at baseUrl into its own Require.js context
     *
     * @param {!string} name, used to identify the extension
     * @param {!{baseUrl: string}} config object with baseUrl property containing absolute path of extension
     * @param {!string} entryPoint, name of the main js file to load
     * @return {!$.Promise} A promise object that is resolved when all extensions complete loading.
     */
    function _testExtensionByURL(name, config, entryPoint) {
        var result = new $.Deferred();

        try{
            var extensionRequire = brackets.libRequire.config({
                context: name,
                baseUrl: config.baseUrl,
                paths: $.extend({}, config.paths, globalPaths),
                waitSeconds: EXTENSION_LOAD_TIMOUT_SECONDS
            });

            extensionRequire([entryPoint], function () {
                console.log("Test extension loaded: ", name);
                result.resolve();
            }, function (err) {
                // Something went wrong while loading extension
                console.log("Unit tests not found for:", name, err);
                result.reject();
            });
        } catch (e) {
            console.error("Test extension load failed: ", name, e);
            result.resolve();
        }

        return result.promise();
    }

    /**
     * Runs unit tests for the extension that lives at baseUrl into its own Require.js context
     *
     * @param {!string} name, used to identify the extension
     * @param {!{baseUrl: string}} config object with baseUrl property containing absolute path of extension
     * @param {!string} entryPoint, name of the main js file to load
     * @return {!$.Promise} A promise object that is resolved when all extensions complete loading.
     */
    function testExtension(name, config, entryPoint) {
        var result = new $.Deferred(),
            extensionPath = config.baseUrl + "/" + entryPoint + ".js";
        if(extensionPath.startsWith("http://") || extensionPath.startsWith("https://")) {
            return _testExtensionByURL(name, config, entryPoint);
        }

        FileSystem.resolve(extensionPath, function (err, entry) {
            if (!err && entry.isFile) {
                // unit test file exists
                var extensionRequire = brackets.libRequire.config({
                    context: name,
                    baseUrl: config.baseUrl,
                    paths: $.extend({}, config.paths, globalPaths)
                });

                extensionRequire([entryPoint], function () {
                    result.resolve();
                });
            } else {
                result.reject();
            }
        });

        return result.promise();
    }

    /**
     * @private
     * Loads a file entryPoint from each extension folder within the baseUrl into its own Require.js context
     *
     * @param {!string} directory, an absolute native path that contains a directory of extensions.
     *                  each subdirectory is interpreted as an independent extension
     * @param {!{baseUrl: string}} config object with baseUrl property containing absolute path of extension folder
     * @param {!string} entryPoint Module name to load (without .js suffix)
     * @param {function} processExtension
     * @return {!$.Promise} A promise object that is resolved when all extensions complete loading.
     */
    function _loadAll(directory, config, entryPoint, processExtension) {
        var result = new $.Deferred();

        FileSystem.getDirectoryForPath(directory).getContents(function (err, contents) {
            if (!err) {
                var i,
                    extensions = [];

                for (i = 0; i < contents.length; i++) {
                    if (contents[i].isDirectory) {
                        // FUTURE (JRB): read package.json instead of just using the entrypoint "main".
                        // Also, load sub-extensions defined in package.json.
                        extensions.push(contents[i].name);
                    }
                }

                if (extensions.length === 0) {
                    result.resolve();
                    return;
                }

                Async.doInParallel(extensions, function (item) {
                    var extConfig = {
                        // we load extensions in virtual file system from our virtual server URL
                        // fsServerUrl always ends with a /
                        baseUrl: window.fsServerUrl.slice(0, -1) + config.baseUrl + "/" + item,
                        paths: config.paths
                    };
                    console.log("Loading Extension from virtual fs: ", extConfig);
                    return processExtension(item, extConfig, entryPoint);
                }).always(function () {
                    // Always resolve the promise even if some extensions had errors
                    result.resolve();
                });
            } else {
                console.error("[Extension] Error -- could not read native directory: " + directory);
                result.reject();
            }
        });

        return result.promise();
    }

    /**
     * Loads All brackets default extensions from brackets base https URL.
     *
     * @return {!$.Promise} A promise object that is resolved when all extensions complete loading.
     */
    function loadAllDefaultExtensions() {
        const extensionPath = getDefaultExtensionPath();
        const result = new $.Deferred();

        Async.doInParallel(DefaultExtensionsList, function (extensionEntry) {
            logger.leaveTrail("loading default extension: " + extensionEntry);
            var extConfig = {
                baseUrl: extensionPath + "/" + extensionEntry
            };
            return loadExtension(extensionEntry, extConfig, 'main');
        }).always(function () {
            // Always resolve the promise even if some extensions had errors
            result.resolve();
        });

        return result.promise();

    }

    /**
     * Loads the extension that lives at baseUrl into its own Require.js context
     *
     * @param {!string} directory, an absolute native path that contains a directory of extensions.
     *                  each subdirectory is interpreted as an independent extension
     * @return {!$.Promise} A promise object that is resolved when all extensions complete loading.
     */
    function loadAllExtensionsInNativeDirectory(directory) {
        return _loadAll(directory, {baseUrl: directory}, "main", loadExtension);
    }

    /**
     * Runs unit test for the extension that lives at baseUrl into its own Require.js context
     *
     * @param {!string} directory, an absolute native path that contains a directory of extensions.
     *                  each subdirectory is interpreted as an independent extension
     * @return {!$.Promise} A promise object that is resolved when all extensions complete loading.
     */
    function testAllExtensionsInNativeDirectory(directory) {
        var result = new $.Deferred();
        var virtualServerURL = window.fsServerUrl,
            extensionsDir = _getExtensionPath() + "/" + directory,
            config = {
                baseUrl: virtualServerURL + extensionsDir
            };

        config.paths = {
            "perf": virtualServerURL + "/test/perf",
            "spec": virtualServerURL + "/test/spec"
        };

        FileSystem.getDirectoryForPath(extensionsDir).getContents(function (err, contents) {
            if (!err) {
                var i,
                    extensions = [];

                for (i = 0; i < contents.length; i++) {
                    if (contents[i].isDirectory) {
                        // FUTURE (JRB): read package.json instead of just using the entrypoint "main".
                        // Also, load sub-extensions defined in package.json.
                        extensions.push(contents[i].name);
                    }
                }

                if (extensions.length === 0) {
                    result.resolve();
                    return;
                }

                Async.doInParallel(extensions, function (extensionName) {
                    let loadResult = new $.Deferred();
                    var extConfig = {
                        // we load extensions in virtual file system from our virtual server URL
                        basePath: 'extensions/default',
                        baseUrl: config.baseUrl + "/" + extensionName,
                        paths: config.paths
                    };
                    console.log("Loading Extension Test from virtual fs: ", extConfig);
                    _testExtensionByURL(extensionName, extConfig, 'unittests').always(function () {
                        // Always resolve the promise even if some extensions had errors
                        console.log("lc", extensionName);
                        loadResult.resolve();
                    });
                    return loadResult.promise();
                }).always(function () {
                    // Always resolve the promise even if some extensions had errors
                    result.resolve();
                });
            } else {
                console.error("[Extension Load Test] Error -- could not read native directory: " + directory);
                result.reject();
            }
        });

        return result.promise();
    }

    /**
     * Runs unit test for the extension that lives at baseUrl into its own Require.js context
     *
     * @return {!$.Promise} A promise object that is resolved when all extensions complete loading.
     */
    function testAllDefaultExtensions() {
        const bracketsPath = FileUtils.getNativeBracketsDirectoryPath();
        const href = window.location.href;
        const baseUrl = href.substring(0, href.lastIndexOf("/"));
        const srcBaseUrl = new URL(baseUrl + '/../src').href;
        var result = new $.Deferred();

        for (let extensionEntry of DefaultExtensionsList){
            console.log("Testing default extension: ", extensionEntry);
            var extConfig = {
                basePath: 'extensions/default',
                baseUrl: new URL(srcBaseUrl + DEFAULT_EXTENSIONS_PATH_BASE + "/" + extensionEntry).href,
                paths: {
                    "perf": bracketsPath + "/perf",
                    "spec": bracketsPath + "/spec"
                }
            };
            _testExtensionByURL(extensionEntry, extConfig, 'unittests');
        }
        result.resolve();

        return result.promise();
    }

    /**
     * Load extensions.
     *
     * @param {?Array.<string>} A list containing references to extension source
     *      location. A source location may be either (a) a folder name inside
     *      src/extensions or (b) an absolute path.
     * @return {!$.Promise} A promise object that is resolved when all extensions complete loading.
     */
    function init(paths) {
        var params = new UrlParams();

        if (_init) {
            // Only init once. Return a resolved promise.
            return new $.Deferred().resolve().promise();
        }

        if (!paths) {
            params.parse();

            if (params.get("reloadWithoutUserExts") !== "true") {
                paths = [
                    getUserExtensionPath(),
                    getDevExtensionPath(),
                    "default"
                ];
            } else {
                paths = [];
            }
        }

        // Load extensions before restoring the project

        // Get a Directory for the user extension directory and create it if it doesn't exist.
        // Note that this is an async call and there are no success or failure functions passed
        // in. If the directory *doesn't* exist, it will be created. Extension loading may happen
        // before the directory is finished being created, but that is okay, since the extension
        // loading will work correctly without this directory.
        // If the directory *does* exist, nothing else needs to be done. It will be scanned normally
        // during extension loading.
        var extensionPath = getUserExtensionPath();
        FileSystem.getDirectoryForPath(extensionPath).create();
        FileSystem.getDirectoryForPath(getDevExtensionPath()).create();

        // Create the extensions/disabled directory, too.
        var disabledExtensionPath = extensionPath.replace(/\/user$/, "/disabled");
        FileSystem.getDirectoryForPath(disabledExtensionPath).create();

        var promise = Async.doInParallel(paths, function (extPath) {
            if(extPath === "default"){
                return loadAllDefaultExtensions();
            } else {
                return loadAllExtensionsInNativeDirectory(extPath);
            }
        }, false);

        promise.always(function () {
            _init = true;
        });

        return promise;
    }


    EventDispatcher.makeEventDispatcher(exports);

    // unit tests
    exports._setInitExtensionTimeout = _setInitExtensionTimeout;
    exports._getInitExtensionTimeout = _getInitExtensionTimeout;

    // public API
    exports.init = init;
    exports.getDefaultExtensionPath = getDefaultExtensionPath;
    exports.getUserExtensionPath = getUserExtensionPath;
    exports.getRequireContextForExtension = getRequireContextForExtension;
    exports.loadExtension = loadExtension;
    exports.testExtension = testExtension;
    exports.loadAllExtensionsInNativeDirectory = loadAllExtensionsInNativeDirectory;
    exports.testAllExtensionsInNativeDirectory = testAllExtensionsInNativeDirectory;
    exports.testAllDefaultExtensions = testAllDefaultExtensions;
});
