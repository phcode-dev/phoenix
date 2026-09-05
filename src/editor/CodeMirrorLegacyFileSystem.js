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

/*global define, window*/

/**
 * Exposes a narrow, read-only filesystem view for historical CodeMirror 5
 * paths that extensions probe before enabling functionality.
 *
 * The entries are backed by Phoenix's CodeMirror 6 compatibility modules and
 * styles. No CodeMirror 5 files are shipped, read, or written.
 */
define(function (require, exports, module) {

    const CodeMirrorLegacyModuleLoader =
            require("editor/CodeMirrorLegacyModuleLoader"),
        CodeMirrorLegacyText = require("text"),
        FileSystem = require("filesystem/FileSystem"),
        FileSystemError = require("filesystem/FileSystemError"),
        FileSystemStats = require("filesystem/FileSystemStats");
    const INSTALL_MARKER = "__phoenixCodeMirrorLegacyFileSystem";
    const VIRTUAL_ENTRY_MARKER = "__phoenixCodeMirrorLegacyVirtualEntry";
    const LEGACY_RESOURCE_PATTERN =
        /^thirdparty\/CodeMirror(?:2)?\/(.+)$/;
    const LEGACY_THEME_DIRECTORY_PATTERN =
        /^thirdparty\/CodeMirror(?:2)?\/theme\/?$/;
    const VIRTUAL_MTIME = new Date(0);
    const virtualFileEntries = new Map();
    const virtualDirectoryEntries = new Map();
    const ENTRY_METADATA_PROPERTIES = [
        "_path",
        "_name",
        "_parentPath",
        "_id",
        "_isFile",
        "_isDirectory"
    ];

    function _normalizeInputPath(path) {
        return typeof path === "string" ?
            Phoenix.VFS.getPathForVirtualServingURL(path) || path :
            path;
    }

    function _getApplicationRootPath() {
        let pathname = window.location.pathname;
        try {
            pathname = decodeURI(pathname);
        } catch (error) {
            // Keep the encoded path. FileUtils follows the same path shape,
            // so exact prefix matching remains safer than broad virtualization.
        }
        return pathname.slice(0, pathname.lastIndexOf("/")).replace(/\/+$/, "");
    }

    function _getLegacyResourcePath(path) {
        if (typeof path !== "string") {
            return null;
        }
        const fullPath = _normalizeInputPath(path).replace(/[?#].*$/, "");
        const applicationRoot = _getApplicationRootPath();
        const expectedPrefix = `${applicationRoot}/`;
        if (fullPath.indexOf(expectedPrefix) !== 0) {
            return null;
        }

        const relativePath = fullPath.slice(expectedPrefix.length);
        return LEGACY_RESOURCE_PATTERN.test(relativePath) ?
            relativePath : null;
    }

    function _createStats(isFile, size, hash) {
        return new FileSystemStats({
            isFile: isFile,
            mtime: VIRTUAL_MTIME,
            size: size,
            hash: hash
        });
    }

    function _rejectMutation(callback) {
        if (typeof callback === "function") {
            callback(FileSystemError.NOT_WRITABLE);
        }
    }

    function _copyImmutableEntryMetadata(entry, virtualEntry) {
        const descriptors = {};
        ENTRY_METADATA_PROPERTIES.forEach(function (propertyName) {
            descriptors[propertyName] = {
                value: entry[propertyName],
                enumerable: Object.prototype.propertyIsEnumerable.call(
                    entry,
                    propertyName
                )
            };
        });
        Object.defineProperties(virtualEntry, descriptors);
    }

    function _createCommonEntry(entry, stats) {
        const virtualEntry = Object.create(Object.getPrototypeOf(entry));
        _copyImmutableEntryMetadata(entry, virtualEntry);
        Object.defineProperty(virtualEntry, VIRTUAL_ENTRY_MARKER, {
            value: true
        });
        virtualEntry.exists = function (callback) {
            callback(null, true);
        };
        virtualEntry.stat = function (callback) {
            callback(null, stats);
        };
        virtualEntry.rename = function (newFullPath, callback) {
            _rejectMutation(callback);
        };
        virtualEntry.unlink = function (callback) {
            _rejectMutation(callback);
        };
        virtualEntry.moveToTrash = function (callback) {
            _rejectMutation(callback);
        };
        return virtualEntry;
    }

    function _getVirtualFileContent(fullPath) {
        const resourcePath = _getLegacyResourcePath(fullPath);
        if (!resourcePath) {
            return null;
        }

        if (/\.js$/i.test(resourcePath)) {
            const moduleName = resourcePath.replace(/\.js$/i, "");
            const legacyPath =
                CodeMirrorLegacyModuleLoader.getLegacyPath(moduleName);
            if (legacyPath && legacyPath.indexOf("mode/") === 0) {
                const pathParts = legacyPath.split("/");
                if (pathParts.length !== 3 ||
                        pathParts[1] !== pathParts[2]) {
                    return null;
                }
            }
            try {
                CodeMirrorLegacyModuleLoader.resolveLegacyModule(moduleName);
            } catch (error) {
                return null;
            }
            return "/* Phoenix CodeMirror 6 compatibility module. */\n" +
                "define" + "(function () {\n" +
                `    return brackets.getModule(${JSON.stringify(moduleName)});\n` +
                "});\n";
        }

        if (/\.css$/i.test(resourcePath)) {
            try {
                return CodeMirrorLegacyText.getCompatibilityContent(resourcePath);
            } catch (error) {
                return null;
            }
        }

        return null;
    }

    function _decorateFile(entry, content) {
        const cacheKey = entry.fullPath;
        const cachedEntry = virtualFileEntries.get(cacheKey);
        if (cachedEntry) {
            return cachedEntry;
        }
        const stats = _createStats(
            true,
            content.length,
            `phoenix-cm6-compat:${entry.fullPath}`
        );
        const virtualEntry = _createCommonEntry(entry, stats);
        virtualEntry.read = function (options, callback) {
            if (typeof options === "function") {
                callback = options;
            }
            callback(null, content, "utf8", stats);
        };
        virtualEntry.write = function (data, options, callback) {
            if (typeof options === "function") {
                callback = options;
            }
            _rejectMutation(callback);
        };
        virtualFileEntries.set(cacheKey, virtualEntry);
        return virtualEntry;
    }

    function _decorateDirectory(entry) {
        const cacheKey = entry.fullPath;
        const cachedEntry = virtualDirectoryEntries.get(cacheKey);
        if (cachedEntry) {
            return cachedEntry;
        }
        const stats = _createStats(
            false,
            0,
            `phoenix-cm6-compat:${entry.fullPath}`
        );
        const virtualEntry = _createCommonEntry(entry, stats);
        virtualEntry.getContents = function (callback) {
            const entries = CodeMirrorLegacyText.legacyThemeNames.map(
                function (themeName) {
                    return FileSystem.getFileForPath(
                        `${entry.fullPath}${themeName}.css`
                    );
                }
            );
            const entriesStats = entries.map(function (themeEntry) {
                const content = _getVirtualFileContent(themeEntry.fullPath);
                return _createStats(
                    true,
                    content.length,
                    `phoenix-cm6-compat:${themeEntry.fullPath}`
                );
            });
            callback(null, entries, entriesStats, undefined);
        };
        virtualEntry.create = function (callback) {
            _rejectMutation(callback);
        };
        virtualDirectoryEntries.set(cacheKey, virtualEntry);
        return virtualEntry;
    }

    function _getVirtualEntry(
        path,
        originalGetFileForPath,
        originalGetDirectoryForPath
    ) {
        const candidateResourcePath = _getLegacyResourcePath(path);
        if (!candidateResourcePath) {
            return null;
        }

        if (LEGACY_THEME_DIRECTORY_PATTERN.test(candidateResourcePath)) {
            const directoryEntry = originalGetDirectoryForPath(path);
            const canonicalResourcePath =
                _getLegacyResourcePath(directoryEntry.fullPath);
            return canonicalResourcePath &&
                LEGACY_THEME_DIRECTORY_PATTERN.test(canonicalResourcePath) ?
                _decorateDirectory(directoryEntry) : null;
        }

        const fileEntry = originalGetFileForPath(path);
        const content = _getVirtualFileContent(fileEntry.fullPath);
        if (content === null) {
            return null;
        }
        return _decorateFile(fileEntry, content);
    }

    function install() {
        if (!window.brackets ||
                typeof window.brackets.getModule !== "function") {
            throw new Error(
                "CodeMirror legacy filesystem compatibility must be installed " +
                "after the global brackets API is initialized."
            );
        }
        if (FileSystem.getFileForPath[INSTALL_MARKER]) {
            return true;
        }

        const originalGetFileForPath = FileSystem.getFileForPath;
        const originalGetDirectoryForPath = FileSystem.getDirectoryForPath;
        const originalExistsAsync = FileSystem.existsAsync;
        const originalResolve = FileSystem.resolve;
        const originalResolveAsync = FileSystem.resolveAsync;

        const getFileForPath = function (path) {
            const entry = originalGetFileForPath(path);
            const content = _getVirtualFileContent(entry.fullPath);
            return content === null ? entry : _decorateFile(entry, content);
        };
        const getDirectoryForPath = function (path) {
            const entry = originalGetDirectoryForPath(path);
            const resourcePath = _getLegacyResourcePath(entry.fullPath);
            return resourcePath &&
                LEGACY_THEME_DIRECTORY_PATTERN.test(resourcePath) ?
                _decorateDirectory(entry) : entry;
        };
        const existsAsync = function (path) {
            const virtualEntry = _getVirtualEntry(
                path,
                originalGetFileForPath,
                originalGetDirectoryForPath
            );
            return virtualEntry ?
                Promise.resolve(true) : originalExistsAsync(path);
        };
        const resolve = function (path, callback) {
            const virtualEntry = _getVirtualEntry(
                path,
                originalGetFileForPath,
                originalGetDirectoryForPath
            );
            if (!virtualEntry) {
                return originalResolve(path, callback);
            }
            virtualEntry.stat(function (err, stats) {
                callback(err, virtualEntry, stats);
            });
        };
        const resolveAsync = function (path) {
            const virtualEntry = _getVirtualEntry(
                path,
                originalGetFileForPath,
                originalGetDirectoryForPath
            );
            if (!virtualEntry) {
                return originalResolveAsync(path);
            }
            return virtualEntry.statAsync().then(function (stats) {
                return {
                    entry: virtualEntry,
                    stat: stats
                };
            });
        };

        [
            getFileForPath,
            getDirectoryForPath,
            existsAsync,
            resolve,
            resolveAsync
        ].forEach(function (wrappedFunction) {
            Object.defineProperty(wrappedFunction, INSTALL_MARKER, {
                value: true
            });
        });
        FileSystem.getFileForPath = getFileForPath;
        FileSystem.getDirectoryForPath = getDirectoryForPath;
        FileSystem.existsAsync = existsAsync;
        FileSystem.resolve = resolve;
        FileSystem.resolveAsync = resolveAsync;
        return true;
    }

    exports.install = install;
    exports.isInstalled = function () {
        return Boolean(FileSystem.getFileForPath[INSTALL_MARKER]);
    };
});
