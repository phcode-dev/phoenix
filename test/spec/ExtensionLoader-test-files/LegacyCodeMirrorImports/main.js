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

/*global define, brackets, window*/

define([
    "thirdparty/CodeMirror",
    "thirdparty/CodeMirror2",
    "thirdparty/CodeMirror/lib/codemirror",
    "thirdparty/CodeMirror2/lib/codemirror",
    "thirdparty/CodeMirror/mode/meta",
    "thirdparty/CodeMirror2/mode/meta.js?cache=1",
    "thirdparty/CodeMirror/addon/display/rulers",
    "thirdparty/CodeMirror/addon/search/searchcursor",
    "thirdparty/CodeMirror/addon/search/match-highlighter",
    "thirdparty/CodeMirror/addon/search/matchesonscrollbar",
    "thirdparty/CodeMirror2/addon/scroll/annotatescrollbar",
    "thirdparty/CodeMirror2/addon/edit/matchbrackets",
    "thirdparty/CodeMirror/addon/edit/closebrackets",
    "thirdparty/CodeMirror/addon/display/placeholder",
    "thirdparty/CodeMirror/addon/hint/show-hint",
    "thirdparty/CodeMirror2/addon/hint/anyword-hint",
    "thirdparty/CodeMirror/addon/mode/overlay",
    "thirdparty/CodeMirror2/addon/mode/multiplex",
    "thirdparty/CodeMirror/addon/mode/simple",
    "thirdparty/CodeMirror2/addon/scroll/scrollpastend",
    "thirdparty/CodeMirror/addon/selection/active-line",
    "thirdparty/CodeMirror2/addon/comment/comment",
    "thirdparty/CodeMirror/addon/comment/continuecomment",
    "thirdparty/CodeMirror2/addon/edit/closetag",
    "thirdparty/CodeMirror/addon/edit/matchtags",
    "thirdparty/CodeMirror2/addon/edit/trailingspace",
    "thirdparty/CodeMirror/addon/fold/brace-fold",
    "thirdparty/CodeMirror2/addon/fold/comment-fold",
    "thirdparty/CodeMirror/addon/fold/markdown-fold",
    "thirdparty/CodeMirror2/addon/fold/xml-fold",
    "thirdparty/CodeMirror/addon/runmode/runmode",
    "thirdparty/CodeMirror/addon/search/search",
    "thirdparty/CodeMirror2/addon/search/jump-to-line",
    "thirdparty/CodeMirror/addon/selection/mark-selection",
    "thirdparty/CodeMirror2/keymap/sublime",
    "thirdparty/CodeMirror/keymap/vim",
    "thirdparty/CodeMirror2/keymap/vim",
    "thirdparty/CodeMirror/theme/monokai",
    "thirdparty/CodeMirror/mode/erlang/erlang",
    "thirdparty/CodeMirror2/mode/pascal/pascal",
    "thirdparty/CodeMirror/mode/cmake/cmake",
    "thirdparty/CodeMirror2/mode/dockerfile/dockerfile",
    "thirdparty/CodeMirror/mode/powershell/powershell",
    "thirdparty/CodeMirror2/mode/protobuf/protobuf",
    "thirdparty/CodeMirror/mode/r/r",
    "thirdparty/CodeMirror2/mode/verilog/verilog",
    "thirdparty/CodeMirror/mode/vhdl/vhdl",
    "thirdparty/CodeMirror2/mode/twig/twig",
    "thirdparty/CodeMirror/mode/vue/vue",
    "text!thirdparty/CodeMirror/lib/codemirror.css",
    "text!thirdparty/CodeMirror2/addon/fold/foldgutter.css",
    "text!thirdparty/CodeMirror/addon/hint/show-hint.css",
    "text!thirdparty/CodeMirror2/addon/search/match-highlighter.css",
    "text!thirdparty/CodeMirror/addon/search/matchesonscrollbar.css",
    "text!thirdparty/CodeMirror/theme/monokai.css"
], function (
    codeMirrorRoot,
    codeMirror2Root,
    codeMirrorLib,
    codeMirror2Lib,
    modeMeta,
    modeMetaWithQuery,
    rulersAddon,
    searchCursorAddon,
    matchHighlighterAddon,
    matchesOnScrollbarAddon,
    annotateScrollbarAddon,
    matchBracketsAddon,
    closeBracketsAddon,
    placeholderAddon,
    showHintAddon,
    anywordHintAddon,
    overlayAddon,
    multiplexAddon,
    simpleModeAddon,
    scrollPastEndAddon,
    activeLineAddon,
    commentAddon,
    continueCommentAddon,
    closeTagAddon,
    matchTagsAddon,
    trailingSpaceAddon,
    braceFoldAddon,
    commentFoldAddon,
    markdownFoldAddon,
    xmlFoldAddon,
    runModeAddon,
    searchAddon,
    jumpToLineAddon,
    selectedTextAddon,
    sublimeKeyMap,
    vimKeyMap,
    vim2KeyMap,
    legacyTheme,
    erlangMode,
    pascalMode,
    cmakeMode,
    dockerfileMode,
    powershellMode,
    protobufMode,
    rMode,
    verilogMode,
    vhdlMode,
    twigMode,
    vueMode,
    legacyCoreStyles,
    legacyFoldGutterStyles,
    legacyHintStyles,
    legacyMatchHighlighterStyles,
    legacyScrollbarStyles,
    legacyThemeStyles
) {
    const modules = [
        codeMirrorRoot,
        codeMirror2Root,
        codeMirrorLib,
        codeMirror2Lib,
        modeMeta,
        modeMetaWithQuery,
        rulersAddon,
        searchCursorAddon,
        matchHighlighterAddon,
        matchesOnScrollbarAddon,
        annotateScrollbarAddon,
        matchBracketsAddon,
        closeBracketsAddon,
        placeholderAddon,
        showHintAddon,
        anywordHintAddon,
        overlayAddon,
        multiplexAddon,
        simpleModeAddon,
        scrollPastEndAddon,
        activeLineAddon,
        commentAddon,
        continueCommentAddon,
        closeTagAddon,
        matchTagsAddon,
        trailingSpaceAddon,
        braceFoldAddon,
        commentFoldAddon,
        markdownFoldAddon,
        xmlFoldAddon,
        runModeAddon,
        searchAddon,
        jumpToLineAddon,
        selectedTextAddon,
        sublimeKeyMap,
        vimKeyMap,
        vim2KeyMap,
        legacyTheme,
        erlangMode,
        pascalMode,
        cmakeMode,
        dockerfileMode,
        powershellMode,
        protobufMode,
        rMode,
        verilogMode,
        vhdlMode,
        twigMode,
        vueMode,
        brackets.getModule("thirdparty/CodeMirror2/addon/comment/comment"),
        brackets.getModule("thirdparty/CodeMirror/mode/scheme/scheme")
    ];
    const legacyAssetPattern =
        /\/thirdparty\/CodeMirror(?:2)?(?:\/|$)/;
    const loadedLegacyAssets = window.performance.getEntriesByType("resource")
        .map(function (entry) {
            return entry.name;
        })
        .filter(function (resourceURL) {
            return legacyAssetPattern.test(resourceURL);
        });

    window.extensionLoaderLegacyCodeMirrorImports = {
        addonAPIs: [
            "blockComment",
            "closeTag",
            "continueComment",
            "findEnclosingTag",
            "lineComment",
            "runMode",
            "scanForClosingTag",
            "selectMatches",
            "toMatchingTag",
            "uncomment"
        ].every(function (apiName) {
            return typeof codeMirrorLib.prototype[apiName] === "function" ||
                typeof codeMirrorLib[apiName] === "function" ||
                typeof codeMirrorLib.commands[apiName] === "function";
        }),
        foldHelpers: [
            "brace",
            "brace-paren",
            "comment",
            "import",
            "include",
            "markdown",
            "xml"
        ].every(function (helperName) {
            return typeof codeMirrorLib.fold[helperName] === "function";
        }),
        allUseFacade: modules.every(function (legacyModule) {
            return legacyModule === codeMirrorLib;
        }),
        hasAdditionalModes: [
            "cmake",
            "dockerfile",
            "powershell",
            "protobuf",
            "r",
            "verilog",
            "tlv",
            "vhdl"
        ].every(function (modeName) {
            return Boolean(codeMirrorLib.modes[modeName]);
        }),
        hasErlangMode: Boolean(codeMirrorLib.modes.erlang),
        hasHintCompatibility: Boolean(
            codeMirrorLib.hint &&
            typeof codeMirrorLib.hint.anyword === "function" &&
            typeof codeMirrorLib.hint.fromList === "function" &&
            codeMirrorLib.hint.auto &&
            typeof codeMirrorLib.hint.auto.resolve === "function" &&
            typeof codeMirrorLib.showHint === "function" &&
            typeof codeMirrorLib.prototype.showHint === "function" &&
            typeof codeMirrorLib.commands.autocomplete === "function"
        ),
        hasModeMetadata: Boolean(
            codeMirrorLib.modeInfo &&
            codeMirrorLib.modeInfo.length === 157 &&
            typeof codeMirrorLib.findModeByMIME === "function" &&
            typeof codeMirrorLib.findModeByExtension === "function" &&
            typeof codeMirrorLib.findModeByFileName === "function" &&
            typeof codeMirrorLib.findModeByName === "function" &&
            codeMirrorLib.findModeByMIME("application/problem+json").name ===
                "JSON" &&
            codeMirrorLib.findModeByFileName("README.md").name ===
                "GitHub Flavored Markdown"
        ),
        hasPascalMode: Boolean(codeMirrorLib.modes.pascal),
        hasSchemeMode: Boolean(codeMirrorLib.modes.scheme),
        hasSearchCommands: [
            "clearSearch",
            "find",
            "findNext",
            "findPersistent",
            "findPersistentNext",
            "findPersistentPrev",
            "findPrev",
            "jumpToLine",
            "replace",
            "replaceAll"
        ].every(function (commandName) {
            return typeof codeMirrorLib.commands[commandName] === "function";
        }),
        hasScrollbarAnnotations: Boolean(
            typeof codeMirrorLib.prototype.annotateScrollbar === "function" &&
            typeof codeMirrorLib.prototype.showMatchesOnScrollbar === "function"
        ),
        hasTwigMode: Boolean(
            codeMirrorLib.modes.twig &&
            codeMirrorLib.modes["twig:inner"] &&
            codeMirrorLib.resolveMode("text/x-twig").name === "twig"
        ),
        hasSublimeKeyMap: Boolean(
            codeMirrorLib.keyMap.sublime &&
            codeMirrorLib.keyMap.pcSublime &&
            codeMirrorLib.keyMap.macSublime
        ),
        hasVimKeyMap: Boolean(
            codeMirrorLib.Vim &&
            codeMirrorLib.keyMap.vim &&
            codeMirrorLib.keyMap["vim-insert"] &&
            codeMirrorLib.keyMap["vim-replace"]
        ),
        hasVueMode: Boolean(
            codeMirrorLib.modes.vue &&
            codeMirrorLib.modes["vue-template"] &&
            codeMirrorLib.resolveMode("text/x-vue").name === "vue"
        ),
        inputStyle: codeMirrorLib.defaults.inputStyle,
        legacyCoreStylesAreVirtual:
            legacyCoreStyles.indexOf("CodeMirror 6 compatibility") !== -1 &&
            legacyFoldGutterStyles.indexOf("CodeMirror 6 compatibility") !== -1 &&
            legacyHintStyles.indexOf("CodeMirror 6 compatibility") !== -1 &&
            legacyMatchHighlighterStyles.indexOf("CodeMirror 6 compatibility") !== -1 &&
            legacyScrollbarStyles.indexOf("CodeMirror 6 compatibility") !== -1 &&
            legacyThemeStyles.indexOf("monokai theme is bundled") !== -1,
        loadedLegacyAssets: loadedLegacyAssets,
        trailingSpaceOption: Boolean(
            codeMirrorLib.optionHandlers.showTrailingSpace
        ),
        version: codeMirrorLib.version
    };
});
