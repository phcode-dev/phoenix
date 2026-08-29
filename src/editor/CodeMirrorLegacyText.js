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

/*global define*/

/**
 * Transparent wrapper around the RequireJS text plugin.
 *
 * Historical extensions sometimes request CodeMirror 5 styles through the
 * RequireJS text plugin. Phoenix no longer ships those assets, so styles whose
 * behavior is supplied by the CM6 surface resolve to an explicit compatibility
 * comment without issuing a network request. Stock legacy themes are compiled
 * into Phoenix's CM6 stylesheet, so their historical text imports resolve
 * without loading a CodeMirror 5 asset.
 */
define(["text-base"], function (BaseText) {

    const LEGACY_RESOURCE_PATTERN =
        /^thirdparty\/CodeMirror(?:2)?(?:\/(.*))?$/;
    const SUPPORTED_STYLES = new Set([
        "addon/dialog/dialog.css",
        "addon/display/fullscreen.css",
        "addon/fold/foldgutter.css",
        "addon/hint/show-hint.css",
        "addon/lint/lint.css",
        "addon/merge/merge.css",
        "addon/scroll/simplescrollbars.css",
        "addon/search/match-highlighter.css",
        "addon/search/matchesonscrollbar.css",
        "addon/tern/tern.css",
        "mode/tiddlywiki/tiddlywiki.css",
        "mode/tiki/tiki.css",
        "lib/codemirror.css"
    ]);
    const LEGACY_THEME_NAMES = Object.freeze([
        "3024-day", "3024-night", "abbott", "abcdef", "ambiance",
        "ambiance-mobile", "ayu-dark", "ayu-mirage", "base16-dark",
        "base16-light", "bespin", "blackboard", "cobalt", "colorforth",
        "darcula", "dracula", "duotone-dark", "duotone-light", "eclipse",
        "elegant", "erlang-dark", "gruvbox-dark", "hopscotch", "icecoder",
        "idea", "isotope", "juejin", "lesser-dark", "liquibyte", "lucario",
        "material", "material-darker", "material-ocean",
        "material-palenight", "mbo", "mdn-like", "midnight", "monokai",
        "moxer", "neat", "neo", "night", "nord", "oceanic-next",
        "panda-syntax", "paraiso-dark", "paraiso-light", "pastel-on-dark",
        "railscasts", "rubyblue", "seti", "shadowfox", "solarized", "ssms",
        "the-matrix", "tomorrow-night-bright", "tomorrow-night-eighties",
        "ttcn", "twilight", "vibrant-ink", "xq-dark", "xq-light", "yeti",
        "yonce", "zenburn"
    ]);
    const LEGACY_THEME_NAMES_SET = new Set(LEGACY_THEME_NAMES);
    const LEGACY_THEME_STYLE_PATTERN = /^theme\/([^/]+)\.css$/;
    const buildMap = {};

    function getLegacyResourcePath(resourceName) {
        if (typeof resourceName !== "string") {
            return null;
        }
        const parsed = BaseText.parseName(resourceName);
        const normalizedName = (
            parsed.moduleName + (parsed.ext ? `.${parsed.ext}` : "")
        ).replace(/[?#].*$/, "");
        const match = LEGACY_RESOURCE_PATTERN.exec(normalizedName);
        return match ? match[1] || "" : null;
    }

    function createCompatibilityError(resourceName) {
        const error = new Error(
            `Unsupported CodeMirror 5 resource "${resourceName}". ` +
            "Phoenix uses CodeMirror 6 and does not ship or load CM5 assets."
        );
        error.code = "PHOENIX_UNSUPPORTED_CODEMIRROR5_RESOURCE";
        return error;
    }

    function getLegacyThemeName(resourcePath) {
        const match = LEGACY_THEME_STYLE_PATTERN.exec(resourcePath);
        return match && LEGACY_THEME_NAMES_SET.has(match[1]) ?
            match[1] : null;
    }

    function getCompatibilityContent(resourceName) {
        const resourcePath = getLegacyResourcePath(resourceName);
        if (resourcePath === null) {
            return null;
        }
        const legacyThemeName = getLegacyThemeName(resourcePath);
        if (!SUPPORTED_STYLES.has(resourcePath) &&
                !legacyThemeName) {
            throw createCompatibilityError(resourceName);
        }
        if (legacyThemeName) {
            return "/* Phoenix CodeMirror 6 compatibility stylesheet; " +
                `the ${legacyThemeName} theme is bundled by Phoenix. */\n`;
        }
        return "/* Phoenix CodeMirror 6 compatibility stylesheet; " +
            "the equivalent styles are supplied by the application. */\n";
    }

    function load(name, req, onLoad, config) {
        let content;
        try {
            content = getCompatibilityContent(name);
        } catch (error) {
            if (onLoad.error) {
                onLoad.error(error);
                return;
            }
            throw error;
        }

        if (content === null) {
            BaseText.load(name, req, onLoad, config);
            return;
        }
        if (config && config.isBuild) {
            buildMap[name] = content;
        }
        onLoad(content);
    }

    function write(pluginName, moduleName, writeModule, config) {
        if (!Object.prototype.hasOwnProperty.call(buildMap, moduleName)) {
            BaseText.write(pluginName, moduleName, writeModule, config);
            return;
        }
        const content = BaseText.jsEscape(buildMap[moduleName]);
        const moduleDefinition = "de" +
            `fine(function () { return '${content}';});\n`;
        writeModule.asModule(
            `${pluginName}!${moduleName}`,
            moduleDefinition
        );
    }

    function writeFile(pluginName, moduleName, req, writeModule, config) {
        let content;
        try {
            content = getCompatibilityContent(moduleName);
        } catch (error) {
            throw error;
        }
        if (content === null) {
            BaseText.writeFile(pluginName, moduleName, req, writeModule, config);
            return;
        }

        const parsed = BaseText.parseName(moduleName);
        const extension = parsed.ext ? `.${parsed.ext}` : "";
        const nonStripName = parsed.moduleName + extension;
        const fileName = req.toUrl(nonStripName) + ".js";
        buildMap[nonStripName] = content;
        const textWrite = function (contents) {
            return writeModule(fileName, contents);
        };
        textWrite.asModule = function (name, contents) {
            return writeModule.asModule(name, fileName, contents);
        };
        write(pluginName, nonStripName, textWrite, config);
    }

    return Object.assign(Object.create(BaseText), {
        getCompatibilityContent: getCompatibilityContent,
        getLegacyResourcePath: getLegacyResourcePath,
        legacyThemeNames: LEGACY_THEME_NAMES,
        load: load,
        write: write,
        writeFile: writeFile
    });
});
