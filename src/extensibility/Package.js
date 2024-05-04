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

/*jslint regexp: true */
/*global logger*/

/**
 * Functions for working with extension packages
 */
define(function (require, exports, module) {


    var AppInit              = require("utils/AppInit"),
        FileSystem           = require("filesystem/FileSystem"),
        FileUtils            = require("file/FileUtils"),
        StringUtils          = require("utils/StringUtils"),
        Strings              = require("strings"),
        ExtensionLoader      = require("utils/ExtensionLoader"),
        PreferencesManager   = require("preferences/PreferencesManager"),
        PathUtils            = require("thirdparty/path-utils/path-utils"),
        ExtensionDownloader  = require("extensibility/ExtensionDownloader");

    PreferencesManager.definePreference("proxy", "string", undefined, {
        description: Strings.DESCRIPTION_PROXY
    });

    const DISABLED_EXTENSIONS_KEY = "extensions.disabled";

    var Errors = {
        ERROR_LOADING: "ERROR_LOADING",
        MALFORMED_URL: "MALFORMED_URL",
        UNSUPPORTED_PROTOCOL: "UNSUPPORTED_PROTOCOL"
    };

    var InstallationStatuses = {
        FAILED: "FAILED",
        INSTALLED: "INSTALLED",
        ALREADY_INSTALLED: "ALREADY_INSTALLED",
        SAME_VERSION: "SAME_VERSION",
        OLDER_VERSION: "OLDER_VERSION",
        NEEDS_UPDATE: "NEEDS_UPDATE",
        DISABLED: "DISABLED"
    };

    /**
     * @type {number} Used to generate unique download ids
     */
    var _uniqueId = 0;

    /**
     * Validates and installs the package at the given path. Validation and
     * installation is handled by the Node process.
     *
     * The extension will be installed into the user's extensions directory.
     * If the user already has the extension installed, it will instead go
     * into their disabled extensions directory.
     *
     * The promise is resolved with an object:
     * { errors: Array.<{string}>, metadata: { name:string, version:string, ... },
     * disabledReason:string, installedTo:string, commonPrefix:string }
     * metadata is pulled straight from package.json and is likely to be undefined
     * if there are errors. It is null if there was no package.json.
     *
     * disabledReason is either null or the reason the extension was installed disabled.
     *
     * @param {string} path Absolute path to the package zip file
     * @param {?string} nameHint Hint for the extension folder's name (used in favor of
     *          path's filename if present, and if no package metadata present).
     * @param {?boolean} _doUpdate private argument used to signal an update
     * @return {$.Promise} A promise that is resolved with information about the package
     *          (which may include errors, in which case the extension was disabled), or
     *          rejected with an error object.
     */
    function install(path, nameHint, _doUpdate) {
        const d                       = new $.Deferred(),
            destinationDirectory    = ExtensionLoader.getUserExtensionPath(),
            disabledDirectory       = destinationDirectory.replace(/\/user$/, "/disabled"),
            systemDirectory         = FileUtils.getNativeBracketsDirectoryPath() + "/extensions/default/";

        const operation = _doUpdate ? "update" : "install";
        ExtensionDownloader[operation](path, destinationDirectory, {
            disabledDirectory: disabledDirectory,
            systemExtensionDirectory: systemDirectory,
            apiVersion: brackets.metadata.apiVersion,
            nameHint: nameHint,
            proxy: PreferencesManager.get("proxy")
        })
            .done(function (result) {

                if (result.installationStatus !== InstallationStatuses.INSTALLED || _doUpdate) {
                    d.resolve(result);
                } else {
                    // This was a new extension and everything looked fine.
                    // We load it into Brackets right away.
                    ExtensionLoader.loadExtension(result.name, {
                        // On Windows, it looks like Node converts Unix-y paths to backslashy paths.
                        // We need to convert them back.
                        baseUrl: window.Phoenix.VFS.getVirtualServingURLForPath(result.installedTo),
                        nativeDir: result.installedTo
                    }, "main").then(function () {
                        d.resolve(result);
                    }, function () {
                        d.reject(Errors.ERROR_LOADING);
                    });
                }
            })
            .fail(function (error) {
                d.reject(error);
            });

        return d.promise();
    }



    /**
     * Special case handling to make the common case of downloading from GitHub easier; modifies 'urlInfo' as
     * needed. Converts a bare GitHub repo URL to the corresponding master ZIP URL; or if given a direct
     * master ZIP URL already, sets a nicer download filename (both cases use the repo name).
     *
     * @param {{url:string, parsed:Array.<string>, filenameHint:string}} urlInfo
     */
    function githubURLFilter(urlInfo) {
        if (urlInfo.parsed.hostname === "github.com" || urlInfo.parsed.hostname === "www.github.com") {
            // Is it a URL to the root of a repo? (/user/repo)
            var match = /^\/[^\/?]+\/([^\/?]+)(\/?)$/.exec(urlInfo.parsed.pathname);
            if (match) {
                if (!match[2]) {
                    urlInfo.url += "/";
                }
                urlInfo.url += "archive/master.zip";
                urlInfo.filenameHint = match[1] + ".zip";

            } else {
                // Is it a URL directly to the repo's 'master.zip'? (/user/repo/archive/master.zip)
                match = /^\/[^\/?]+\/([^\/?]+)\/archive\/master.zip$/.exec(urlInfo.parsed.pathname);
                if (match) {
                    urlInfo.filenameHint = match[1] + ".zip";
                }
            }
        }
    }

    /**
     * Downloads from the given URL to a temporary location. On success, resolves with the path of the
     * downloaded file (typically in a temp folder) and a hint for the real filename. On failure, rejects
     * with an error object.
     *
     * @param {string} url URL of the file to be downloaded
     * @param {number} downloadId Unique number to identify this request
     * @param {string} destinationDirectory Optional path to download extension to. Defaults to user extension folder
     * @return {$.Promise}
     */
    function _download(url, downloadId, destinationDirectory) {
        const d = new $.Deferred();

        // Validate URL
        // TODO: PathUtils fails to parse URLs that are missing the protocol part (e.g. starts immediately with "www...")
        const parsed = PathUtils.parseUrl(url);
        if (!parsed.hostname) {  // means PathUtils failed to parse at all
            d.reject(Errors.MALFORMED_URL);
            return d.promise();
        }
        if (!(parsed.protocol === "http:" || parsed.protocol === "https:"
            || parsed.protocol === "phtauri:" || parsed.protocol === "asset:")) {
            d.reject(Errors.UNSUPPORTED_PROTOCOL);
            return d.promise();
        }
        parsed.filename = FileUtils.convertWindowsPathToUnixPath(parsed.filename);
        const urlInfo = { url: url, parsed: parsed, filenameHint: parsed.filename, destinationDirectory };
        githubURLFilter(urlInfo);

        // Decide download destination
        let filename = urlInfo.filenameHint;
        filename = filename.replace(/[^a-zA-Z0-9_\- \(\)\.]/g, "_"); // make sure it's a valid filename
        if (!filename) {  // in case of URL ending in "/"
            filename = "extension.zip";
        }

        const r = ExtensionDownloader.downloadFile(downloadId, urlInfo, PreferencesManager.get("proxy"));
        r.done(function (result) {
            d.resolve({
                localPath: FileUtils.convertWindowsPathToUnixPath(result),
                filenameHint: urlInfo.filenameHint });
        }).fail(function (err) {
            d.reject(err);
        });

        return d.promise();
    }

    /**
     * Attempts to synchronously cancel the given pending download. This may not be possible, e.g.
     * if the download has already finished.
     *
     * @param {number} downloadId Identifier previously passed to download()
     */
    function cancelDownload(downloadId) {
        ExtensionDownloader.abortDownload(downloadId);
    }

    /**
     * On success, resolves with an extension metadata object; at that point, the extension has already
     * started running in Brackets. On failure (including validation errors), rejects with an error object.
     *
     * An error object consists of either a string error code OR an array where the first entry is the error
     * code and the remaining entries are further info. The error code string is one of either
     * ExtensionsDomain.Errors or Package.Errors. Use formatError() to convert an error object to a friendly,
     * localized error message.
     *
     * @param {string} path Absolute path to the package zip file
     * @param {?string} filenameHint Hint for the extension folder's name (used in favor of
     *          path's filename if present, and if no package metadata present).
     * @return {$.Promise} A promise that is rejected if there are errors during
     *          install or the extension is disabled.
     */
    function installFromPath(path, filenameHint) {
        const d = new $.Deferred();

        install(path, filenameHint)
            .done(function (result) {

                let installationStatus = result.installationStatus;
                if (installationStatus === InstallationStatuses.ALREADY_INSTALLED ||
                        installationStatus === InstallationStatuses.NEEDS_UPDATE ||
                        installationStatus === InstallationStatuses.SAME_VERSION ||
                        installationStatus === InstallationStatuses.OLDER_VERSION) {
                    d.resolve(result);
                } else {
                    if (result.errors && result.errors.length > 0) {
                        // Validation errors - for now, only return the first one
                        d.reject(result.errors[0]);
                    } else if (result.disabledReason) {
                        // Extension valid but left disabled (wrong API version, extension name collision, etc.)
                        d.reject(result.disabledReason);
                    } else {
                        // Success! Extension is now running in Brackets
                        d.resolve(result);
                    }
                }
            })
            .fail(function (err) {
                d.reject(err);
            });

        return d.promise();
    }

    /**
     * On success, resolves with an extension metadata object; at that point, the extension has already
     * started running in Brackets. On failure (including validation errors), rejects with an error object.
     *
     * An error object consists of either a string error code OR an array where the first entry is the error
     * code and the remaining entries are further info. The error code string is one of either
     * ExtensionsDomain.Errors or Package.Errors. Use formatError() to convert an error object to a friendly,
     * localized error message.
     *
     * The returned cancel() function will *attempt* to cancel installation, but it is not guaranteed to
     * succeed. If cancel() succeeds, the Promise is rejected with a CANCELED error code. If we're unable
     * to cancel, the Promise is resolved or rejected normally, as if cancel() had never been called.
     *
     * @return {{promise: $.Promise, cancel: function():boolean}}
     */
    function installFromURL(url, destinationDirectory) {
        const STATE_DOWNLOADING = 1,
            STATE_INSTALLING = 2,
            STATE_SUCCEEDED = 3,
            STATE_FAILED = 4;

        const d = new $.Deferred();
        let state = STATE_DOWNLOADING;

        var downloadId = (_uniqueId++);
        _download(url, downloadId, destinationDirectory)
            .done(function (downloadResult) {
                state = STATE_INSTALLING;

                installFromPath(downloadResult.localPath, downloadResult.filenameHint)
                    .done(function (result) {
                        state = STATE_SUCCEEDED;
                        result.localPath = downloadResult.localPath;
                        d.resolve(result);
                    })
                    .fail(function (err) {
                        // File IO errors, internal error in install()/validate(), or extension startup crashed
                        state = STATE_FAILED;
                        FileSystem.getFileForPath(downloadResult.localPath).unlink();
                        if(!url || url.startsWith(brackets.config.extension_url)) {
                            // privacy, log error for extensions in registry
                            logger.reportError(err, "Failed to install " + url);
                        }
                        d.reject(err);
                    });
            })
            .fail(function (err) {
                // Download error (the Node-side download code cleans up any partial ZIP file)
                state = STATE_FAILED;
                d.reject(err);
            });

        return {
            promise: d.promise(),
            cancel: function () {
                if (state === STATE_DOWNLOADING) {
                    // This will trigger download()'s fail() handler with CANCELED as the err code
                    cancelDownload(downloadId);
                }
                // Else it's too late to cancel; we'll continue on through the done() chain and emit
                // a success result (calling done() handlers) if all else goes well.
            }
        };
    }

    /**
     * Converts an error object as returned by install(), installFromPath() or
     * installFromURL() into a flattened, localized string.
     *
     * @param {string|Array.<string>} error
     * @return {string}
     */
    function formatError(error) {
        function localize(key) {
            if (Strings[key]) {
                return Strings[key];
            }
            console.log("Unknown installation error", key);
            return Strings.UNKNOWN_ERROR;
        }

        if (Array.isArray(error)) {
            error[0] = localize(error[0]);
            return StringUtils.format.apply(window, error);
        }
        return localize(error);

    }

    /**
     * Removes the extension at the given path.
     *
     * @param {string} path The absolute path to the extension to remove.
     * @return {$.Promise} A promise that's resolved when the extension is removed, or
     *     rejected if there was an error.
     */
    function remove(path) {
        return ExtensionDownloader.remove(path);
    }

    /**
     * function manages state weather an extension is enabled or disabled
     */
    function _toggleDisabledExtension(path, enabled) {
        let arr = JSON.parse(PhStore.getItem(DISABLED_EXTENSIONS_KEY) || "[]");
        const io = arr.indexOf(path);
        if (enabled === true && io !== -1) {
            arr.splice(io, 1);
        } else if (enabled === false && io === -1) {
            arr.push(path);
        }
        PhStore.setItem(DISABLED_EXTENSIONS_KEY, JSON.stringify(arr));
    }

    /**
     * Disables the extension at the given path.
     *
     * @param {string} path The absolute path to the extension to disable.
     * @return {$.Promise} A promise that's resolved when the extenion is disabled, or
     *      rejected if there was an error.
     */
    function disable(path) {
        const result = new $.Deferred();
        _toggleDisabledExtension(path, false);
        result.resolve();
        return result.promise();
    }

    /**
     * Enables the extension at the given path.
     *
     * @param {string} path The absolute path to the extension to enable.
     * @return {$.Promise} A promise that's resolved when the extenion is enable, or
     *      rejected if there was an error.
     */
    function enable(path) {
        const result = new $.Deferred();
        _toggleDisabledExtension(path, true);
        ExtensionLoader.loadExtension(FileUtils.getBaseName(path), {
            baseUrl: path,
            nativeDir: path
        }, "main")
            .done(result.resolve)
            .fail(result.reject);
        return result.promise();
    }

    /**
     * Install an extension update located at path.
     * This assumes that the installation was previously attempted
     * and an installationStatus of "ALREADY_INSTALLED", "NEEDS_UPDATE", "SAME_VERSION",
     * or "OLDER_VERSION" was the result.
     *
     * This workflow ensures that there should not generally be validation errors
     * because the first pass at installation the extension looked at the metadata
     * and installed packages.
     *
     * @param {string} path to package file
     * @param {?string} nameHint Hint for the extension folder's name (used in favor of
     *          path's filename if present, and if no package metadata present).
     * @return {$.Promise} A promise that is resolved when the extension is successfully
     *      installed or rejected if there is a problem.
     */
    function installUpdate(path, nameHint) {
        const d = new $.Deferred();
        install(path, nameHint, true)
            .done(function (result) {
                if (result.installationStatus !== InstallationStatuses.INSTALLED) {
                    d.reject(result.errors);
                } else {
                    d.resolve(result);
                }
            })
            .fail(function (error) {
                d.reject(error);
            });
        return d.promise();
    }

    AppInit.appReady(function () {
    });

    exports.installFromURL          = installFromURL;
    exports.installFromPath         = installFromPath;
    exports.install                 = install;
    exports.remove                  = remove;
    exports.disable                 = disable;
    exports.enable                  = enable;
    exports.installUpdate           = installUpdate;
    exports.formatError             = formatError;
    exports.InstallationStatuses    = InstallationStatuses;
    exports.DEFAULT_DISABLED_EXTENSIONS_KEY = DISABLED_EXTENSIONS_KEY;
});
