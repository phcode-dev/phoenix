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
 * Resolves historical CodeMirror 5 AMD module IDs to Phoenix's CodeMirror 6
 * compatibility facade. This keeps third-party extensions loadable without
 * shipping the old CodeMirror package or mirroring its addon/mode file tree.
 */
define(function (require, exports, module) {

    const CodeMirror = require("editor/CodeMirrorCompat"),
        LegacyAddons = require("editor/CodeMirrorLegacyAddons"),
        LegacyExtendedAddons =
            require("editor/CodeMirrorLegacyExtendedAddons"),
        SublimeCompat = require("editor/CodeMirrorSublimeCompat"),
        TwigCompat = require("editor/CodeMirrorTwigCompat"),
        VimCompat = require("editor/CodeMirrorVimCompat");
    const LEGACY_MODULE_PATTERN = /^thirdparty\/CodeMirror(?:2)?(?:\/|$)/;
    const LOAD_WRAPPER_MARKER = "__phoenixCodeMirrorLegacyModuleLoader";
    const CORE_MODULES = new Set([
        "",
        "lib/codemirror"
    ]);
    const FACADE_ADDON_MODULES = new Set([
        "addon/display/placeholder",
        "addon/display/rulers",
        "addon/edit/closebrackets",
        "addon/edit/matchbrackets",
        "addon/mode/multiplex",
        "addon/mode/overlay",
        "addon/mode/simple",
        "addon/scroll/annotatescrollbar",
        "addon/scroll/scrollpastend",
        "addon/search/match-highlighter",
        "addon/search/matchesonscrollbar",
        "addon/selection/active-line"
    ]);
    const COMPAT_ADDON_MODULES = new Set([
        "addon/hint/anyword-hint",
        "addon/hint/show-hint",
        "addon/search/jump-to-line",
        "addon/search/search"
    ]);
    const SUBLIME_KEYMAP_MODULE = "keymap/sublime";
    const VIM_KEYMAP_MODULE = "keymap/vim";
    const MODE_META_MODULE = "mode/meta";

    TwigCompat.install(CodeMirror);

    function isLegacyModule(moduleName) {
        return typeof moduleName === "string" &&
            LEGACY_MODULE_PATTERN.test(moduleName);
    }

    function getLegacyPath(moduleName) {
        if (!isLegacyModule(moduleName)) {
            return null;
        }
        return moduleName
            .replace(/^thirdparty\/CodeMirror(?:2)?\/?/, "")
            .replace(/[?#].*$/, "")
            .replace(/\.js$/, "");
    }

    function getModeName(moduleName) {
        const legacyPath = getLegacyPath(moduleName);
        if (legacyPath === null) {
            return null;
        }
        const pathParts = legacyPath.split("/");
        if (pathParts[0] !== "mode" || !pathParts[1]) {
            return null;
        }
        return pathParts[1];
    }

    function createCompatibilityError(moduleName, detail) {
        const error = new Error(
            `Unsupported CodeMirror 5 module "${moduleName}". ${detail} ` +
            "Phoenix uses CodeMirror 6 and will not load CodeMirror 5 code."
        );
        error.code = "PHOENIX_UNSUPPORTED_CODEMIRROR5_MODULE";
        return error;
    }

    function getModuleType(moduleName) {
        const legacyPath = getLegacyPath(moduleName);
        if (legacyPath === null) {
            return null;
        }
        if (CORE_MODULES.has(legacyPath)) {
            return "core";
        }
        if (legacyPath === MODE_META_MODULE) {
            return "mode-meta";
        }
        if (legacyPath.indexOf("mode/") === 0) {
            return "mode";
        }
        if (LegacyAddons.isSupported(legacyPath)) {
            return "addon";
        }
        if (LegacyExtendedAddons.isSupported(legacyPath)) {
            return "extended-addon";
        }
        if (FACADE_ADDON_MODULES.has(legacyPath)) {
            return "facade-addon";
        }
        if (COMPAT_ADDON_MODULES.has(legacyPath)) {
            return "compat-addon";
        }
        if (legacyPath === SUBLIME_KEYMAP_MODULE) {
            return "sublime-keymap";
        }
        if (legacyPath === VIM_KEYMAP_MODULE) {
            return "vim-keymap";
        }
        if (legacyPath.indexOf("theme/") === 0) {
            return "theme";
        }
        return "unsupported";
    }

    function resolveLegacyModule(moduleName) {
        const legacyPath = getLegacyPath(moduleName);
        const moduleType = getModuleType(moduleName);
        if (!moduleType) {
            throw new TypeError(`Not a legacy CodeMirror module: ${moduleName}`);
        }

        if (moduleType === "core" ||
                moduleType === "mode-meta" ||
                moduleType === "facade-addon" ||
                moduleType === "theme") {
            return CodeMirror;
        }

        if (moduleType === "compat-addon") {
            if (!CodeMirror.installLegacyCompatibility(legacyPath)) {
                throw createCompatibilityError(
                    moduleName,
                    "Its CM6-backed compatibility behavior could not be installed."
                );
            }
            return CodeMirror;
        }

        if (moduleType === "addon") {
            if (!LegacyAddons.install(CodeMirror, legacyPath)) {
                throw createCompatibilityError(
                    moduleName,
                    "Its addon behavior could not be installed."
                );
            }
            return CodeMirror;
        }

        if (moduleType === "extended-addon") {
            if (!LegacyExtendedAddons.install(CodeMirror, legacyPath)) {
                throw createCompatibilityError(
                    moduleName,
                    "Its extended CM6-backed addon behavior could not be installed."
                );
            }
            return CodeMirror;
        }

        if (moduleType === "sublime-keymap") {
            LegacyAddons.install(CodeMirror, "addon/comment/comment");
            SublimeCompat.install(CodeMirror);
            return CodeMirror;
        }

        if (moduleType === "vim-keymap") {
            VimCompat.install(CodeMirror);
            return CodeMirror;
        }

        const modeName = getModeName(moduleName);
        if (moduleType === "mode") {
            if (!modeName || !CodeMirror.loadMode(modeName)) {
                throw createCompatibilityError(
                    moduleName,
                    `The "${modeName || legacyPath}" mode has no bundled ` +
                        "CodeMirror 6 compatibility parser."
                );
            }
            return CodeMirror;
        }

        throw createCompatibilityError(
            moduleName,
            "No CM6-backed compatibility implementation is registered for this path."
        );
    }

    /**
     * Installs a RequireJS transport wrapper that supplies an AMD module for
     * any historical CodeMirror path before RequireJS attempts a network load.
     *
     * @param {Object=} loader RequireJS global
     * @param {function(string, Array, function())=} defineModule AMD define
     * @return {boolean} Whether the compatibility loader is installed
     */
    function install(loader, defineModule) {
        const requireLoader = loader || window.requirejs || window.require;
        const amdDefine = defineModule || window.define;
        if (!requireLoader || typeof requireLoader.load !== "function" ||
                typeof amdDefine !== "function") {
            return false;
        }
        if (requireLoader.load[LOAD_WRAPPER_MARKER]) {
            return true;
        }

        const originalLoad = requireLoader.load;
        const compatibilityLoad = function (context, moduleName, url) {
            if (!isLegacyModule(moduleName)) {
                return originalLoad.call(requireLoader, context, moduleName, url);
            }

            let compatibilityModule;
            let compatibilityError;
            try {
                compatibilityModule = resolveLegacyModule(moduleName);
            } catch (error) {
                compatibilityError = error;
            }
            amdDefine(moduleName, [], function () {
                if (compatibilityError) {
                    throw compatibilityError;
                }
                return compatibilityModule;
            });
            context.completeLoad(moduleName);
        };
        compatibilityLoad[LOAD_WRAPPER_MARKER] = true;
        compatibilityLoad.originalLoad = originalLoad;
        requireLoader.load = compatibilityLoad;
        return true;
    }

    install();

    exports.createCompatibilityError = createCompatibilityError;
    exports.getLegacyPath = getLegacyPath;
    exports.getModeName = getModeName;
    exports.getModuleType = getModuleType;
    exports.install = install;
    exports.isLegacyModule = isLegacyModule;
    exports.resolveLegacyModule = resolveLegacyModule;
});
