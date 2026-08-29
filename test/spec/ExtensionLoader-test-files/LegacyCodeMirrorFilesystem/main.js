/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2026 - present core.ai . All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

/*global $, brackets, define, module, window*/

define(function (require, exports, module) {
    const FileSystem = brackets.getModule("filesystem/FileSystem"),
        File = brackets.getModule("filesystem/File"),
        Directory = brackets.getModule("filesystem/Directory"),
        FileSystemError = brackets.getModule("filesystem/FileSystemError"),
        FileUtils = brackets.getModule("file/FileUtils"),
        ExtensionUtils = brackets.getModule("utils/ExtensionUtils");

    function _callEntryMethod(entry, methodName, args) {
        return new Promise(function (resolve) {
            entry[methodName].apply(entry, args.concat(function (err) {
                resolve(err || null);
            }));
        });
    }

    function _exists(entry) {
        return new Promise(function (resolve, reject) {
            entry.exists(function (err, exists) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(exists);
            });
        });
    }

    function _read(entry) {
        return new Promise(function (resolve, reject) {
            entry.read(function (err, content) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(content);
            });
        });
    }

    function _getContents(directory) {
        return new Promise(function (resolve, reject) {
            directory.getContents(function (err, entries) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(entries);
            });
        });
    }

    function _resolve(path) {
        return new Promise(function (resolve) {
            FileSystem.resolve(path, function (err, entry, stats) {
                resolve({
                    error: err || null,
                    entry: entry,
                    stats: stats
                });
            });
        });
    }

    function _resolveAsync(path) {
        return FileSystem.resolveAsync(path)
            .then(function (result) {
                return {
                    error: null,
                    entry: result.entry,
                    stat: result.stat
                };
            })
            .catch(function (error) {
                return {
                    error: error
                };
            });
    }

    function _getRejectedError(promise) {
        return promise.then(function () {
            return null;
        }).catch(function (error) {
            return error;
        });
    }

    function _metadataIsImmutable(entry) {
        const metadata = {
            path: entry._path,
            name: entry._name,
            parentPath: entry._parentPath,
            id: entry._id
        };
        const replacementPath = `${entry.fullPath}.changed`;
        Reflect.set(entry, "_path", replacementPath);
        Reflect.set(entry, "_name", "changed");
        Reflect.set(entry, "_parentPath", "/changed/");
        Reflect.set(entry, "_id", -1);
        entry._setPath(replacementPath);
        return entry._path === metadata.path &&
            entry._name === metadata.name &&
            entry._parentPath === metadata.parentPath &&
            entry._id === metadata.id;
    }

    function _hasEntryReference(entry) {
        return Object.getOwnPropertyNames(entry).some(function (propertyName) {
            const value = entry[propertyName];
            return value && value !== entry &&
                (value instanceof File || value instanceof Directory);
        });
    }

    exports.initExtension = function () {
        const deferred = new $.Deferred();
        const applicationRoot = FileUtils.getNativeBracketsDirectoryPath();
        const vueModePath =
            `${applicationRoot}/thirdparty/CodeMirror/mode/vue/vue.js`;
        const themeDirectoryPath =
            `${applicationRoot}/thirdparty/CodeMirror/theme`;
        const unsupportedModePath =
            `${applicationRoot}/thirdparty/CodeMirror/mode/not-real/not-real.js`;
        const wrongModeBasenamePath =
            `${applicationRoot}/thirdparty/CodeMirror/mode/vue/not-vue.js`;
        const traversalPath =
            `${applicationRoot}/thirdparty/CodeMirror/mode/vue/` +
            "../../../../cm5-traversal-regression-does-not-exist.js";
        const unrelatedPath = ExtensionUtils.getModulePath(
            module,
            "thirdparty/CodeMirror/mode/vue/vue.js"
        );
        const vueModeFile = FileSystem.getFileForPath(vueModePath);
        const themeDirectory =
            FileSystem.getDirectoryForPath(themeDirectoryPath);
        const unsupportedModeFile =
            FileSystem.getFileForPath(unsupportedModePath);
        const wrongModeBasenameFile =
            FileSystem.getFileForPath(wrongModeBasenamePath);
        const traversalFile = FileSystem.getFileForPath(traversalPath);
        const unrelatedFile = FileSystem.getFileForPath(unrelatedPath);
        const hidesOriginalFunctions = [
            FileSystem.getFileForPath,
            FileSystem.getDirectoryForPath,
            FileSystem.existsAsync,
            FileSystem.resolve,
            FileSystem.resolveAsync
        ].every(function (fileSystemFunction) {
            return !Object.prototype.hasOwnProperty.call(
                fileSystemFunction,
                "original"
            );
        });

        Promise.all([
            _exists(vueModeFile),
            _read(vueModeFile),
            _getContents(themeDirectory),
            _exists(unsupportedModeFile),
            _exists(unrelatedFile),
            _callEntryMethod(vueModeFile, "write", ["changed"]),
            _callEntryMethod(vueModeFile, "rename", [`${vueModePath}.moved`]),
            _callEntryMethod(vueModeFile, "unlink", []),
            _callEntryMethod(vueModeFile, "moveToTrash", []),
            _callEntryMethod(themeDirectory, "create", []),
            _getRejectedError(vueModeFile.unlinkAsync()),
            _getRejectedError(themeDirectory.createAsync()),
            vueModeFile.existsAsync(),
            vueModeFile.statAsync(),
            themeDirectory.getContentsAsync(),
            FileSystem.existsAsync(vueModePath),
            FileSystem.existsAsync(unsupportedModePath),
            FileSystem.existsAsync(unrelatedFile.fullPath),
            _resolve(vueModePath),
            FileSystem.resolveAsync(themeDirectoryPath),
            _resolve(unsupportedModePath),
            _resolveAsync(unrelatedFile.fullPath),
            _exists(wrongModeBasenameFile),
            FileSystem.existsAsync(wrongModeBasenamePath),
            _resolveAsync(wrongModeBasenamePath),
            _exists(traversalFile),
            FileSystem.existsAsync(traversalPath),
            _resolveAsync(traversalPath)
        ]).then(function (results) {
            const loadedLegacyAssets =
                window.performance.getEntriesByType("resource")
                    .map(function (entry) {
                        return entry.name;
                    })
                    .filter(function (resourceURL) {
                        return /\/thirdparty\/CodeMirror(?:2)?(?:\/|$)/.test(
                            resourceURL
                        );
                    });
            window.extensionLoaderLegacyCodeMirrorFilesystem = {
                vueModeExists: results[0],
                vueModeIsCompatibilityModule:
                    results[1].indexOf("CodeMirror 6 compatibility module") !== -1,
                themeEntries: results[2].length,
                themeEntriesAreFiles: results[2].every(function (entry) {
                    return Object.getPrototypeOf(entry) === File.prototype &&
                        entry.name.endsWith(".css");
                }),
                hasMonokaiTheme: results[2].some(function (entry) {
                    return entry.name === "monokai.css";
                }),
                unsupportedModeExists: results[3],
                unrelatedPathExists: results[4],
                writeError: results[5],
                renameError: results[6],
                unlinkError: results[7],
                moveToTrashError: results[8],
                createDirectoryError: results[9],
                unlinkAsyncError: results[10],
                createDirectoryAsyncError: results[11],
                entryExistsAsync: results[12],
                entryStatAsyncIsFile: results[13].isFile,
                directoryContentsAsyncCount:
                    results[14].entries.length,
                exportedExistsAsync: results[15],
                unsupportedExistsAsync: results[16],
                unrelatedExistsAsync: results[17],
                resolveReturnsVirtualFile:
                    !results[18].error &&
                    results[18].entry === vueModeFile &&
                    results[18].stats.isFile,
                resolveAsyncReturnsVirtualDirectory:
                    results[19].entry === themeDirectory &&
                    results[19].stat.isDirectory,
                virtualFileUsesFilePrototype:
                    Object.getPrototypeOf(vueModeFile) === File.prototype,
                virtualDirectoryUsesDirectoryPrototype:
                    Object.getPrototypeOf(themeDirectory) ===
                        Directory.prototype,
                virtualEntryBackerIsInaccessible:
                    !Object.prototype.hasOwnProperty.call(
                        vueModeFile,
                        "_fileSystem"
                    ) &&
                    vueModeFile._fileSystem === null &&
                    !_hasEntryReference(vueModeFile) &&
                    hidesOriginalFunctions,
                virtualMetadataIsImmutable:
                    _metadataIsImmutable(vueModeFile) &&
                    _metadataIsImmutable(themeDirectory),
                unsupportedResolveError: results[20].error,
                unrelatedResolveAsyncError: results[21].error,
                wrongModeBasenameExists: results[22],
                wrongModeBasenameExistsAsync: results[23],
                wrongModeBasenameResolveError: results[24].error,
                traversalEntryIsCanonical:
                    traversalFile.fullPath ===
                    `${applicationRoot}/cm5-traversal-regression-does-not-exist.js`,
                traversalEntryIsPhysical:
                    Object.getPrototypeOf(traversalFile) === File.prototype &&
                    Object.prototype.hasOwnProperty.call(
                        traversalFile,
                        "_fileSystem"
                    ) &&
                    !Object.prototype.hasOwnProperty.call(
                        traversalFile,
                        "read"
                    ),
                traversalExists: results[25],
                traversalExistsAsync: results[26],
                traversalResolveError: results[27].error,
                traversalDelegates:
                    results[25] === results[26] &&
                    results[27].error === FileSystemError.NOT_FOUND,
                virtualEntryIsCached:
                    FileSystem.getFileForPath(vueModePath) === vueModeFile &&
                    FileSystem.getDirectoryForPath(themeDirectoryPath) ===
                        themeDirectory,
                loadedLegacyAssets: loadedLegacyAssets
            };
            deferred.resolve();
        }).catch(function (error) {
            deferred.reject(error);
        });

        return deferred.promise();
    };
});
