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


// @INCLUDE_IN_API_DOCS

/**
 * ExtensionLoader searches the filesystem for extensions, then creates a new context for each one and loads it.
 * This module dispatches the following events:
 *      "load" - when an extension is successfully loaded. The second argument is the file path to the
 *          extension root.
 *      "loadFailed" - when an extension load is unsuccessful. The second argument is the file path to the
 *          extension root.
 */
// jshint ignore: start
/*global logger, path*/
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
        ThemeManager   = require("view/ThemeManager"),
        UrlParams      = require("utils/UrlParams").UrlParams,
        NodeUtils = require("utils/NodeUtils"),
        PathUtils      = require("thirdparty/path-utils/path-utils"),
        DefaultExtensions = JSON.parse(require("text!extensions/default/DefaultExtensions.json")),
        Dialogs        = require("widgets/Dialogs"),
        PreferencesManager = require("preferences/PreferencesManager"),
        Mustache       = require("thirdparty/mustache/mustache"),
        Strings        = require("strings"),
        StringUtils    = require("utils/StringUtils"),
        Metrics = require("utils/Metrics"),
        DeprecatedExtensionsTemplate = require("text!htmlContent/deprecated-extensions-dialog.html"),
        CommandManager = require("command/CommandManager");

    // takedown/dont load extensions that are compromised at app start - start
    const EXTENSION_TAKEDOWN_LOCALSTORAGE_KEY = "PH_EXTENSION_TAKEDOWN_LIST";

    // deprecated extensions dialog state key
    const STATE_DEPRECATED_EXTENSIONS_DIALOG_SHOWN = "deprecatedExtensionsDialogShown";

    function _getTakedownListLS() {
        try{
            let list = localStorage.getItem(EXTENSION_TAKEDOWN_LOCALSTORAGE_KEY);
            if(list) {
                list = JSON.parse(list);
                if (Array.isArray(list)) {
                    return list;
                }
            }
        } catch (e) {
            console.error(e);
        }
        return [];
    }

    const loadedExtensionIDs = new Map();
    let takedownExtensionList = new Set(_getTakedownListLS());

    const EXTENSION_TAKEDOWN_URL = brackets.config.extensionTakedownURL;

    function _anyTakenDownExtensionLoaded() {
        if (takedownExtensionList.size === 0 || loadedExtensionIDs.size === 0) {
            return [];
        }
        let smaller;
        let larger;

        if (takedownExtensionList.size < loadedExtensionIDs.size) {
            smaller = takedownExtensionList;
            larger = Array.from(loadedExtensionIDs.keys());
        } else {
            smaller = Array.from(loadedExtensionIDs.keys());
            larger = takedownExtensionList;
        }

        const matches = [];

        for (const id of smaller) {
            if (larger.has ? larger.has(id) : larger.includes(id)) {
                matches.push(id);
            }
        }

        return matches;
    }

    function fetchWithTimeout(url, ms) {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), ms);
        return fetch(url, { signal: c.signal }).finally(() => clearTimeout(t));
    }

    // we dont want a restart after user does too much in the app causing data loss. So we wont reload after 20 seconds.
    fetchWithTimeout(EXTENSION_TAKEDOWN_URL, 20000)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} - ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Extension takedown data:', data);
            if (!Array.isArray(data) || !data.every(x => typeof x === "string")) {
                console.error("Takedown list must be an array of strings.");
                return;
            }
            const dataToWrite = JSON.stringify(data);
            localStorage.setItem(EXTENSION_TAKEDOWN_LOCALSTORAGE_KEY, dataToWrite);
            takedownExtensionList = new Set(data);
            const compromisedExtensionsLoaded = _anyTakenDownExtensionLoaded();
            if(!compromisedExtensionsLoaded.length){
                return;
            }
            // if we are here, we have already loaded some compromised extensions. we need to reload app as soon as
            // possible. no await after this. all sync js calls to prevent extension from tampering with this list.
            const writtenData = localStorage.getItem(EXTENSION_TAKEDOWN_LOCALSTORAGE_KEY);
            if(writtenData !== dataToWrite) {
                // the write did not succeded. local storage write can fail if storage full, if so we may cause infinite
                // reloads here if we dont do the check.
                console.error("Failed to write taken down extension to localstorage");
                return;
            }
            location.reload();
        })
        .catch(console.error);
    // takedown/dont load extensions that are compromised at app start - end

    const desktopOnlyExtensions = DefaultExtensions.desktopOnly;
    const DefaultExtensionsList = Phoenix.isNativeApp ?
        [...DefaultExtensions.defaultExtensionsList, ...desktopOnlyExtensions]:
        DefaultExtensions.defaultExtensionsList;

    if(Phoenix.isTestWindow) {
        // we dont load the heavy weight git extension by default for tests as huge number
        // of tests written before git integration and too hard to fix those failing tests for now.
        // we will just have new tests from git specific workflows.
        const index = DefaultExtensionsList.indexOf("Git");
        if(index !== -1) {
            DefaultExtensionsList.splice(index, 1);
        }
    }

    const customExtensionLoadPaths = {};

    const _DELETED_EXTENSION_FILE_MARKER = "_phcode_extension_marked_for_delete";

    // default async initExtension timeout
    var EXTENSION_LOAD_TIMOUT_SECONDS = 60,
        INIT_EXTENSION_TIMEOUT = EXTENSION_LOAD_TIMOUT_SECONDS * 1000;

    /**
     * Extension loaded event
     *
     * @const
     * @type {string}
     */
    const EVENT_EXTENSION_LOADED = "load";

    /**
     * Extension disabled event
     *
     * @const
     * @type {string}
     */
    const EVENT_EXTENSION_DISABLED = "disabled";

    /**
     * Extension load failed event
     *
     * @const
     * @type {string}
     */
    const EVENT_EXTENSION_LOAD_FAILED = "loadFailed";

    var _init       = false,
        _extensions = {},
        _initExtensionTimeout = INIT_EXTENSION_TIMEOUT,
        srcPath     = FileUtils.getNativeBracketsDirectoryPath();

    /**
     * Stores require.js contexts of extensions
     *
     * @private
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
     *
     * @private
     */
    const DEFAULT_EXTENSIONS_PATH_BASE = "extensions/default";

    /**
     * Responsible to get the default extension path
     *
     * @returns {string}
     */
    function getDefaultExtensionPath() {
        return window.PhoenixBaseURL + DEFAULT_EXTENSIONS_PATH_BASE;
    }

    /**
     * Returns the full path to the development extensions directory.
     *
     * @private
     */
    function _getExtensionPath() {
        return pathLib.normalize(Phoenix.VFS.getExtensionDir());
    }

    /**
     * Returns the full path to the development extensions directory.
     *
     * @private
     */
    function getDevExtensionPath() {
        return pathLib.normalize(Phoenix.VFS.getDevExtensionDir());
    }

    /**
     * Returns the full path of the default user extensions directory. This is in the users
     * application support directory, which is typically
     * /Users/"user"/Application Support/Brackets/extensions/user on the mac, and
     * C:\Users\"user"\AppData\Roaming\Brackets\extensions\user on windows.
     */
    function getUserExtensionPath() {
        return pathLib.normalize(Phoenix.VFS.getUserExtensionDir());
    }

    /**
     * Returns the require.js require context used to load an extension
     *
     * @param {!string} name used to identify the extension
     * @return {!Object} A require.js require object used to load the extension, or undefined if
     * there is no require object with that name
     */
    function getRequireContextForExtension(name) {
        return contexts[name];
    }

    /**
     * Get timeout value for rejecting an extension's async initExtension promise.
     *
     * @private
     * @return {number} Timeout in milliseconds
     */
    function _getInitExtensionTimeout() {
        return _initExtensionTimeout;
    }

    /**
     * Set timeout for rejecting an extension's async initExtension promise.
     *
     * @private
     * @param {number} value Timeout in milliseconds
     */
    function _setInitExtensionTimeout(value) {
        _initExtensionTimeout = value;
    }

    /**
     * Loads optional requirejs-config.json file for an extension
     *
     * @private
     * @param {Object} baseConfig
     * @return {$.Promise}
     */
    function _mergeConfigFromURL(baseConfig) {
        var deferred = new $.Deferred(),
            extensionConfigFile = baseConfig.baseUrl + "/requirejs-config.json";

        // Optional JSON config for require.js
        $.getJSON(extensionConfigFile).done(function (extensionConfig) {
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
     * Loads optional requirejs-config.json file for an extension
     *
     * @private
     * @param {Object} baseConfig
     * @return {$.Promise}
     */
    function _mergeConfig(baseConfig) {
        if(baseConfig.baseUrl.startsWith("http://") || baseConfig.baseUrl.startsWith("https://")
            || baseConfig.baseUrl.startsWith("phtauri://") || baseConfig.baseUrl.startsWith("asset://")) {
            return _mergeConfigFromURL(baseConfig);
        }
        throw new Error("Config can only be loaded from an http url, but got" + baseConfig.baseUrl);
    }
    const savedFSlib = window.fs;

    function _loadNodeExtension(name, extensionMainPath, nodeConfig) {
        const mainPlatformPath = Phoenix.fs.getTauriPlatformPath(extensionMainPath);
        console.log("Loading node extension for " + name, extensionMainPath, ":", mainPlatformPath, nodeConfig);
        NodeUtils._loadNodeExtensionModule(mainPlatformPath); // let load errors get reported to bugsnag
    }

    /**
     * Loads the extension module that lives at baseUrl into its own Require.js context
     *
     * @private
     * @param {!string} name used to identify the extension
     * @param {!{baseUrl: string}} config object with baseUrl property containing absolute path of extension
     * @param {string} entryPoint name of the main js file to load
     * @param {Object} metadata
     * @return {!$.Promise} A promise object that is resolved when the extension is loaded, or rejected
     *              if the extension fails to load or throws an exception immediately when loaded.
     *              (Note: if extension contains a JS syntax error, promise is resolved not rejected).
     */
    function loadExtensionModule(name, config, entryPoint, metadata) {
        let extensionConfig = {
            context: name,
            baseUrl: config.baseUrl,
            paths: globalPaths,
            locale: brackets.getLocale(),
            waitSeconds: EXTENSION_LOAD_TIMOUT_SECONDS,
            config: {
                text: {
                    useXhr: function(_url, _protocol, _hostname, _port) {
                        // as we load extensions in cross domain fashion, we have to use xhr
                        // https://github.com/requirejs/text#xhr-restrictions
                        // else user installed extension require will fail in tauri
                        return true;
                    }
                }
            }
        };
        const isDefaultExtensionModule =( extensionConfig.baseUrl
            && extensionConfig.baseUrl.startsWith(`${window.PhoenixBaseURL}extensions/default/`));
        // Read optional requirejs-config.json
        return _mergeConfig(extensionConfig).then(function (mergedConfig) {
            // Create new RequireJS context and load extension entry point
            var extensionRequire = brackets.libRequire.config(mergedConfig),
                extensionRequireDeferred = new $.Deferred();
            if(!isDefaultExtensionModule && config.nativeDir && metadata.nodeConfig){
                if(!Phoenix.isNativeApp && metadata.nodeConfig.nodeIsRequired) {
                    extensionRequireDeferred.reject(
                        new Error(`Extension ${name} cannot be loaded in browser as it needs node(nodeConfig.nodeIsRequired:true)`));
                    return extensionRequireDeferred.promise();
                }
                if(Phoenix.isNativeApp) {
                    if(!metadata.nodeConfig.main){
                        extensionRequireDeferred.reject(
                            new Error(`Extension ${name} doesnt specify a main file(nodeConfig.main) in package.json!`));
                        return extensionRequireDeferred.promise();
                    }
                    _loadNodeExtension(name, path.join(config.nativeDir, metadata.nodeConfig.main),
                        metadata.nodeConfig);
                } else {
                    console.log(`Extension ${name} optionally needs node. Node not loaded in browser.`);
                }
            }
            contexts[name] = extensionRequire;
            extensionRequire([entryPoint], extensionRequireDeferred.resolve, extensionRequireDeferred.reject);

            return extensionRequireDeferred.promise();
        }).then(function (module) {
            // Extension loaded normally
            if(savedFSlib !== window.fs) {
                console.error("fslib overwrite detected while loading extension. This means that" +
                    " some extension tried to modify a core library. reverting to original lib..");
                // note that the extension name here may not be that actual extension that did the
                // overwrite. So we dont log the extension name here.
                window.fs = savedFSlib;
            }
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
     * @param {!string} name used to identify the extension
     * @param {!{baseUrl: string}} config object with baseUrl property containing absolute path of extension
     * @param {!string} entryPoint name of the main js file to load
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
                if (isExtensionTakenDown(metadata.name)) {
                    logger.leaveTrail("skip load taken down extension: " + metadata.name);
                    console.warn("skip load taken down extension: " + metadata.name);
                    return new $.Deferred().reject("disabled").promise();
                }

                if(metadata.name) {
                    loadedExtensionIDs.set(metadata.name, {
                        loadedFromDisc: !!config.nativeDir,
                        extensionPath: config.nativeDir || config.baseUrl,
                        extensionName: metadata.title || metadata.name
                    });
                }

                // No special handling for themes... Let the promise propagate into the ExtensionManager
                if (metadata && metadata.theme) {
                    return;
                }

                if (!metadata.disabled) {
                    return loadExtensionModule(name, config, entryPoint, metadata);
                }
                return new $.Deferred().reject("disabled").promise();

            })
            .then(function () {
                exports.trigger(EVENT_EXTENSION_LOADED, config.baseUrl);
            }, function (err) {
                if (err === "disabled") {
                    exports.trigger(EVENT_EXTENSION_DISABLED, config.baseUrl);
                } else {
                    exports.trigger(EVENT_EXTENSION_LOAD_FAILED, config.baseUrl);
                }
            });
    }

    /**
     * Runs unit tests for the extension that lives at baseUrl into its own Require.js context
     *
     * @private
     * @param {!string} name used to identify the extension
     * @param {!{baseUrl: string}} config object with baseUrl property containing absolute path of extension
     * @param {!string} entryPoint name of the main js file to load
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
     * @param {!string} name used to identify the extension
     * @param {!{baseUrl: string}} config object with baseUrl property containing absolute path of extension
     * @param {!string} entryPoint name of the main js file to load
     * @return {!$.Promise} A promise object that is resolved when all extensions complete loading.
     */
    function testExtension(name, config, entryPoint) {
        var result = new $.Deferred(),
            extensionPath = config.baseUrl + "/" + entryPoint + ".js";
        if(extensionPath.startsWith("http://") || extensionPath.startsWith("https://")
            || extensionPath.startsWith("phtauri://") || extensionPath.startsWith("asset://")) {
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

    async function _removeExtensionsMarkedForDelete(directory, contents) {
        let extensions = [];
        let promises = [];

        for (let extensionEntry of contents) {
            try {
                if (extensionEntry.isDirectory) {
                    const extensionName = extensionEntry.name;
                    let markedRemove = FileSystem.getFileForPath(
                        path.join(directory, extensionName, _DELETED_EXTENSION_FILE_MARKER));

                    // Push the promise to the array without awaiting it
                    promises.push(markedRemove.existsAsync().then(deleteMarkerExists => {
                        if (!deleteMarkerExists) {
                            extensions.push(extensionName);
                        } else {
                            return new Promise((resolve) => {
                                // this never rejects. if we cant process, we continue with other extensions.
                                extensionEntry.unlink(err => {
                                    if (err) {
                                        console.error("Error removing extension marked for removal:",
                                            extensionName, extensionEntry.fullPath, err);
                                        resolve(err);
                                    } else {
                                        console.log("Removed extension marked for delete:",
                                            extensionName, extensionEntry.fullPath);
                                        resolve();
                                    }
                                });
                            });
                        }
                    }));
                }
            } catch (e) {
                console.error("Error processing extension path:", extensionEntry);
            }
        }

        // Await all promises concurrently
        await Promise.all(promises);

        return extensions;
    }


    /**
     * Loads a file entryPoint from each extension folder within the baseUrl into its own Require.js context
     *
     * @private
     * @param {!string} directory an absolute native path that contains a directory of extensions.
     *                  each subdirectory is interpreted as an independent extension
     * @param {!string} entryPoint Module name to load (without .js suffix)
     * @param {function} processExtension
     * @return {!$.Promise} A promise object that is resolved when all extensions complete loading.
     */
    function _loadAll(directory, entryPoint, processExtension) {
        var result = new $.Deferred();

        FileSystem.getDirectoryForPath(directory).getContents( async function (err, contents) {
            if (err) {
                console.error("[Extension] Error -- could not read native directory: " + directory);
                result.reject();
                return;
            }

            const extensions = await _removeExtensionsMarkedForDelete(directory, contents);

            if (extensions.length === 0) {
                result.resolve();
                return;
            }

            Async.doInParallel(extensions, function (item) {
                const extConfig = {
                    // we load user installed extensions in file system from our virtual/asset server URL
                    baseUrl: Phoenix.VFS.getVirtualServingURLForPath(directory + "/" + item),
                    nativeDir: directory + "/" + item,
                    paths: {}
                };
                console.log("Loading Extension from virtual fs: ", extConfig);
                return processExtension(item, extConfig, entryPoint);
            }).always(function () {
                // Always resolve the promise even if some extensions had errors
                result.resolve();
            });
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
     * Loads the default extension located at given extensions/default/extensionFolderName . used for tests
     *
     * @private
     * @param {string} extensionFolderName
     * @return {!$.Promise} A promise object that is resolved when all extensions complete loading.
     */
    function _loadDefaultExtension(extensionFolderName) {
        const extensionPath = getDefaultExtensionPath();

        logger.leaveTrail("loading default extension: " + extensionFolderName);
        var extConfig = {
            baseUrl: extensionPath + "/" + extensionFolderName
        };
        return loadExtension(extensionFolderName, extConfig, 'main');
    }

    /**
     * Loads the extension that lives at baseUrl into its own Require.js context
     *
     * @param {!string} directory an absolute native path that contains a directory of extensions.
     *                  each subdirectory is interpreted as an independent extension
     * @return {!$.Promise} A promise object that is resolved when all extensions complete loading.
     */
    function loadAllExtensionsInNativeDirectory(directory) {
        return _loadAll(directory,  "main", loadExtension);
    }

    /**
     * Loads a given extension at the path from virtual fs. Used by `debug menu> load project as extension`
     *
     * @param directory
     * @return {!Promise}
     */
    function loadExtensionFromNativeDirectory(directory) {
        logger.leaveTrail("loading custom extension from path: " + directory);
        const extConfig = {
            baseUrl: Phoenix.VFS.getVirtualServingURLForPath(directory.replace(/\/$/, "")),
            nativeDir: directory
        };
        return loadExtension("ext" + directory.replace("/", "-"), // /fs/user/extpath to ext-fs-user-extpath
            extConfig, 'main');
    }

    /**
     * Runs unit test for the extension that lives at baseUrl into its own Require.js context
     *
     * @param {!string} directory an absolute native path that contains a directory of extensions.
     *                  each subdirectory is interpreted as an independent extension
     * @return {!$.Promise} A promise object that is resolved when all extensions complete loading.
     */
    function testAllExtensionsInNativeDirectory(directory) {
        const result = new $.Deferred();
        const extensionsDir = _getExtensionPath() + "/" + directory,
            config = {
                baseUrl: Phoenix.VFS.getVirtualServingURLForPath(extensionsDir)
            };

        config.paths = {
            "perf": Phoenix.VFS.getVirtualServingURLForPath( "/test/perf"),
            "spec": Phoenix.VFS.getVirtualServingURLForPath("/test/spec")
        };

        FileSystem.getDirectoryForPath(extensionsDir).getContents(function (err, contents) {
            if (!err) {
                let i,
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
                        console.log("tested", extensionName);
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
        const baseUrl = window.PhoenixBaseURL;
        let srcBaseUrl = new URL(baseUrl + '../src').href;
        let result = new $.Deferred();
        if(!srcBaseUrl.endsWith("/")) {
            srcBaseUrl = srcBaseUrl + "/";
        }

        Async.doInParallel(DefaultExtensionsList, function (extensionEntry) {
            const loadResult = new $.Deferred();
            const extConfig = {
                basePath: 'extensions/default',
                baseUrl: new URL(srcBaseUrl + DEFAULT_EXTENSIONS_PATH_BASE + "/" + extensionEntry).href,
                paths: {
                    "perf": bracketsPath + "/perf",
                    "spec": bracketsPath + "/spec"
                }
            };
            console.log("Testing default extension: ", extensionEntry);
            _testExtensionByURL(extensionEntry, extConfig, 'unittests').always(function () {
                // Always resolve the promise even if some extensions had errors
                console.log("load complete", extensionEntry);
                loadResult.resolve();
            });
            return loadResult.promise();
        }).always(function () {
            // Always resolve the promise even if some extensions had errors
            result.resolve();
        });

        return result.promise();
    }

    // eg: extensionPath = /tauri/home/home/.local/share/io.phcode.dev/assets/extensions/devTemp/theme/14/theme.css
    // eg: customExtensionLoadPath = /tauri/home/home/.local/share/io.phcode.dev/assets/extensions/devTemp/theme/14
    // eg: srcBasePath = /tauri/home/home/myExtension
    /**
     * To get the source path for extension
     *
     * @param extensionPath
     * @returns {string}
     */
    function getSourcePathForExtension(extensionPath) {
        const devTempExtDir = `${Phoenix.VFS.getDevTempExtensionDir()}/`;
        if(extensionPath.startsWith(devTempExtDir)) {
            for(let customExtensionLoadPath of Object.keys(customExtensionLoadPaths)){
                let srcBasePath = customExtensionLoadPaths[customExtensionLoadPath];
                if(extensionPath.startsWith(Phoenix.VFS.ensureTrailingSlash(customExtensionLoadPath))) {
                    const relativePath = extensionPath.replace(Phoenix.VFS.ensureTrailingSlash(customExtensionLoadPath), "");
                    if(!srcBasePath.endsWith("/")){
                        srcBasePath = srcBasePath + "/";
                    }
                    return `${srcBasePath}${relativePath}`;
                }
            }
        }
        return extensionPath;
    }

    function _attachThemeLoadListeners() {
        ThemeManager.off(`${ThemeManager.EVENT_THEME_LOADED}.extensionLoader`);
        ThemeManager.on(`${ThemeManager.EVENT_THEME_LOADED}.extensionLoader`, ()=>{
            ThemeManager.refresh(true);
        });
    }

    function _getRandomPrefix() {
        let uuid = crypto.randomUUID();
        // for example "36b8f84d-df4e-4d49-b662-bcde71a8764f"
        return uuid.split("-")[0]; // Eg. return 36b8f84d
    }
    function _loadCustomExtensionPath(extPath) {
        const assetsServeDir = Phoenix.VFS.getTauriAssetServeDir();
        if(assetsServeDir && extPath.startsWith(Phoenix.VFS.getTauriDir()) &&
            !extPath.startsWith(assetsServeDir)) {
            // we have to do this random number thingy as tauri caches assets and will serve stale assets.
            // this is problematic when the user is editing extension code and he cant see the updates on reload.
            const newExtVersionStr = _getRandomPrefix();
            const extParentPath = `${Phoenix.VFS.getDevTempExtensionDir()}/${Phoenix.path.basename(extPath)}`;
            const extDestPath = `${extParentPath}/${newExtVersionStr}`;
            customExtensionLoadPaths[extDestPath] = extPath;
            Phoenix.fs.unlink(extParentPath, ()=>{
                // ignore any errors in delete
                Phoenix.VFS.ensureExistsDirAsync(extParentPath)
                    .then(()=>{
                        Phoenix.fs.copy(extPath, extDestPath, function (err, _copiedPath) {
                            if (err) {
                                console.error(`Error copying extension from ${extPath} to ${extDestPath}`, err);
                                result.reject(err);
                            } else {
                                _attachThemeLoadListeners();
                                loadExtensionFromNativeDirectory(extDestPath)
                                    .fail(console.error);
                            }
                        });
                    }).catch((err)=>{
                    console.error(`Error creating dir ${extDestPath}`, err);
                    result.reject(err);
                });
            });
            // custom extensions are always loaded marked as resolved to prevent the main event loop from taking
            // too long to load
            let result = new $.Deferred();
            result.resolve();
            return result.promise();
        }
        return loadExtensionFromNativeDirectory(extPath);
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
        require("extensionsIntegrated/loader");
        var params = new UrlParams();

        if (_init) {
            // Only init once. Return a resolved promise.
            return new $.Deferred().resolve().promise();
        }

        if (!paths) {
            params.parse();

            if (params.get("reloadWithoutUserExts") !== "true") {
                paths = [
                    "default",
                    getUserExtensionPath(),
                    getDevExtensionPath()
                ];
            } else {
                paths = [];
            }
            if(params.get("loadDevExtensionPath")){
                let customLoadPaths = params.get("loadDevExtensionPath").split(",");
                for(let customPath of customLoadPaths){
                    paths.push("custom:" + customPath);
                }
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

        // just before extensions are loaded, we need to delete the boot time trust ring keys so that extensions
        // won't have keys to enter kernal mode in the app.
        delete window.KernalModeTrust;

        var promise = Async.doInParallel(paths, function (extPath) {
            if(extPath === "default"){
                return loadAllDefaultExtensions();
            } else if(extPath.startsWith("custom:")){
                return _loadCustomExtensionPath(extPath.replace("custom:", ""));
            } else {
                return loadAllExtensionsInNativeDirectory(extPath);
            }
        }, false);

        promise.always(function () {
            _init = true;
            // Check for deprecated extensions after all extensions have loaded
            _checkAndShowDeprecatedExtensionsDialog();
        });

        return promise;
    }

    function isExtensionTakenDown(extensionID) {
        if(!extensionID){
            // extensions without id can happen with local development. these are never distributed in store.
            // so safe to return false here.
            return false;
        }
        return takedownExtensionList.has(extensionID);
    }

    /**
     * Uninstall a deprecated extension
     * @param {string} extensionID - The ID of the extension to uninstall
     * @return {Promise} A promise that resolves when the extension is uninstalled successfully
     */
    async function uninstallExtension(extensionID) {
        const extensionInfo = loadedExtensionIDs.get(extensionID);

        if (!extensionInfo) {
            throw new Error(`Extension ${extensionID} not found in loaded extensions`);
        }

        if (!extensionInfo.loadedFromDisc) {
            throw new Error(`Cannot uninstall built-in extension: ${extensionID}`);
        }

        const extensionDir = FileSystem.getDirectoryForPath(extensionInfo.extensionPath);
        await extensionDir.unlinkAsync();
    }

    /**
     * Check if any deprecated extensions are installed and show a dialog once per extension
     * @private
     */
    function _checkAndShowDeprecatedExtensionsDialog() {
        // Get deprecated extensions config
        let needsRestart = false;
        const deprecatedExtensionsConfig = DefaultExtensions.deprecatedExtensions;
        if (!deprecatedExtensionsConfig || !deprecatedExtensionsConfig.extensionIDsAndDocs) {
            return;
        }

        const deprecatedExtensionIDs = deprecatedExtensionsConfig.extensionIDsAndDocs;

        // Get the state object that tracks which deprecated extensions we've already shown
        let shownDeprecatedExtensions = PreferencesManager.stateManager.get(STATE_DEPRECATED_EXTENSIONS_DIALOG_SHOWN);
        if (!shownDeprecatedExtensions || typeof shownDeprecatedExtensions !== 'object') {
            shownDeprecatedExtensions = {};
        }

        // Check which deprecated extensions are loaded and not yet shown
        const deprecatedExtensionsFound = [];
        for (const extensionID of loadedExtensionIDs.keys()) {
            if (deprecatedExtensionIDs[extensionID] && !shownDeprecatedExtensions[extensionID]) {
                const extensionInfo = loadedExtensionIDs.get(extensionID);
                deprecatedExtensionsFound.push({
                    id: extensionID,
                    name: extensionInfo?.extensionName || extensionID,
                    docUrl: deprecatedExtensionIDs[extensionID]
                });
            }
        }

        // If no new deprecated extensions found, return
        if (deprecatedExtensionsFound.length === 0) {
            return;
        }

        // Show the dialog
        const templateVars = {
            extensions: deprecatedExtensionsFound,
            Strings: Strings
        };

        const $template = $(Mustache.render(DeprecatedExtensionsTemplate, templateVars));
        const dialog = Dialogs.showModalDialogUsingTemplate($template, false); // autoDismiss = false

        // Wire up uninstall button click handlers
        $template.on('click', '.uninstall-extension-btn', async function() {
            const $button = $(this);
            const extensionID = $button.data('extension-id');
            const $extensionItem = $button.closest('.deprecated-extension-item');

            // Disable button during uninstall
            $button.prop('disabled', true);
            $button.text(Strings.REMOVING);

            try {
                Metrics.countEvent(Metrics.EVENT_TYPE.EXTENSIONS, "removeDep", extensionID);
                await uninstallExtension(extensionID);

                // Update the OK button to "Restart App"
                const $okButton = $template.find('[data-button-id="ok"]');
                $okButton.text(Strings.RESTART_APP_BUTTON);

                // Strike through the extension name and disable/strike the uninstall button
                $extensionItem.find('.extension-info strong').addClass('striked');
                $button.remove();
                needsRestart = true;
            } catch (err) {
                Metrics.countEvent(Metrics.EVENT_TYPE.EXTENSIONS, "removeDep", "fail");
                logger.reportError(err, 'Failed to uninstall deprecated extension:' + extensionID);

                // Show error dialog
                const message = StringUtils.format(Strings.ERROR_UNINSTALLING_EXTENSION_MESSAGE, extensionID);
                Dialogs.showErrorDialog(Strings.ERROR_UNINSTALLING_EXTENSION_TITLE, message);

                // Re-enable button
                $button.prop('disabled', false);
                $button.text(Strings.REMOVE);
            }
        });

        // Handle OK button click
        $template.on('click', '[data-button-id="ok"]', function() {
            if (needsRestart) {
                // Reload the app to complete uninstallation
                CommandManager.execute("debug.refreshWindow");
            } else {
                // Just close the dialog
                dialog.close();
            }
        });

        // Mark each extension as shown
        for (const ext of deprecatedExtensionsFound) {
            shownDeprecatedExtensions[ext.id] = true;
        }
        PreferencesManager.stateManager.set(STATE_DEPRECATED_EXTENSIONS_DIALOG_SHOWN, shownDeprecatedExtensions);
    }


    EventDispatcher.makeEventDispatcher(exports);

    // unit tests
    if(Phoenix.isTestWindow) {
        exports._loadDefaultExtension = _loadDefaultExtension;
        exports._setInitExtensionTimeout = _setInitExtensionTimeout;
        exports._getInitExtensionTimeout = _getInitExtensionTimeout;
    }

    // private internal usage
    exports._DELETED_EXTENSION_FILE_MARKER = _DELETED_EXTENSION_FILE_MARKER;

    // public API
    exports.init = init;
    exports.getDefaultExtensionPath = getDefaultExtensionPath;
    exports.getUserExtensionPath = getUserExtensionPath;
    exports.getRequireContextForExtension = getRequireContextForExtension;
    exports.getSourcePathForExtension = getSourcePathForExtension;
    exports.loadExtension = loadExtension;
    exports.testExtension = testExtension;
    exports.loadAllExtensionsInNativeDirectory = loadAllExtensionsInNativeDirectory;
    exports.loadExtensionFromNativeDirectory = loadExtensionFromNativeDirectory;
    exports.isExtensionTakenDown = isExtensionTakenDown;
    exports.uninstallExtension = uninstallExtension;
    exports.testAllExtensionsInNativeDirectory = testAllExtensionsInNativeDirectory;
    exports.testAllDefaultExtensions = testAllDefaultExtensions;
    exports.EVENT_EXTENSION_LOADED = EVENT_EXTENSION_LOADED;
    exports.EVENT_EXTENSION_DISABLED = EVENT_EXTENSION_DISABLED;
    exports.EVENT_EXTENSION_LOAD_FAILED = EVENT_EXTENSION_LOAD_FAILED;
});
