/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2026 - present core.ai. All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
 * General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 */

/*global define, brackets, window*/

define([
    "thirdparty/CodeMirror/addon/dialog/dialog",
    "thirdparty/CodeMirror2/addon/display/autorefresh",
    "thirdparty/CodeMirror/addon/display/fullscreen",
    "thirdparty/CodeMirror2/addon/display/panel",
    "thirdparty/CodeMirror/addon/edit/continuelist",
    "thirdparty/CodeMirror2/addon/fold/foldcode",
    "thirdparty/CodeMirror/addon/fold/foldgutter",
    "thirdparty/CodeMirror2/addon/fold/indent-fold",
    "thirdparty/CodeMirror/addon/hint/css-hint",
    "thirdparty/CodeMirror2/addon/hint/html-hint",
    "thirdparty/CodeMirror/addon/hint/javascript-hint",
    "thirdparty/CodeMirror2/addon/hint/sql-hint",
    "thirdparty/CodeMirror/addon/hint/xml-hint",
    "thirdparty/CodeMirror2/addon/lint/coffeescript-lint",
    "thirdparty/CodeMirror/addon/lint/css-lint",
    "thirdparty/CodeMirror2/addon/lint/html-lint",
    "thirdparty/CodeMirror/addon/lint/javascript-lint",
    "thirdparty/CodeMirror2/addon/lint/json-lint",
    "thirdparty/CodeMirror/addon/lint/lint",
    "thirdparty/CodeMirror2/addon/lint/yaml-lint",
    "thirdparty/CodeMirror/addon/merge/merge",
    "thirdparty/CodeMirror2/addon/mode/loadmode",
    "thirdparty/CodeMirror/addon/mode/multiplex_test",
    "thirdparty/CodeMirror2/addon/runmode/colorize",
    "thirdparty/CodeMirror/addon/runmode/runmode-standalone",
    "thirdparty/CodeMirror2/addon/runmode/runmode.node",
    "thirdparty/CodeMirror/addon/scroll/simplescrollbars",
    "thirdparty/CodeMirror2/addon/selection/selection-pointer",
    "thirdparty/CodeMirror/addon/tern/tern",
    "thirdparty/CodeMirror2/addon/tern/worker",
    "thirdparty/CodeMirror/addon/wrap/hardwrap",
    "thirdparty/CodeMirror2/keymap/emacs",
    "text!thirdparty/CodeMirror/addon/dialog/dialog.css",
    "text!thirdparty/CodeMirror2/addon/display/fullscreen.css",
    "text!thirdparty/CodeMirror/addon/fold/foldgutter.css",
    "text!thirdparty/CodeMirror2/addon/hint/show-hint.css",
    "text!thirdparty/CodeMirror/addon/lint/lint.css",
    "text!thirdparty/CodeMirror2/addon/merge/merge.css",
    "text!thirdparty/CodeMirror/addon/scroll/simplescrollbars.css",
    "text!thirdparty/CodeMirror2/addon/search/match-highlighter.css",
    "text!thirdparty/CodeMirror/addon/search/matchesonscrollbar.css",
    "text!thirdparty/CodeMirror2/addon/tern/tern.css",
    "text!thirdparty/CodeMirror/lib/codemirror.css",
    "text!thirdparty/CodeMirror2/mode/tiddlywiki/tiddlywiki.css",
    "text!thirdparty/CodeMirror/mode/tiki/tiki.css"
], function () {
    const CodeMirror = brackets.getModule(
        "thirdparty/CodeMirror/lib/codemirror"
    );
    const dependencies = Array.prototype.slice.call(arguments);
    const moduleCount = 32;

    window.extensionLoaderLegacyCodeMirrorAllAddons = {
        allModulesUseFacade: dependencies.slice(0, moduleCount).every(
            function (legacyModule) {
                return legacyModule === CodeMirror;
            }
        ),
        allStylesAreVirtual: dependencies.slice(moduleCount).every(
            function (styleText) {
                return styleText.indexOf(
                    "Phoenix CodeMirror 6 compatibility"
                ) !== -1;
            }
        ),
        hasDialogAPI: [
            "openConfirm",
            "openDialog",
            "openNotification"
        ].every(function (methodName) {
            return typeof CodeMirror.prototype[methodName] === "function";
        }),
        hasDisplayAPI: Boolean(
            CodeMirror.optionHandlers.autoRefresh &&
            CodeMirror.optionHandlers.fullScreen &&
            typeof CodeMirror.prototype.addPanel === "function"
        ),
        hasFoldAPI: Boolean(
            typeof CodeMirror.prototype.foldCode === "function" &&
            typeof CodeMirror.prototype.foldOption === "function" &&
            typeof CodeMirror.prototype.isFolded === "function" &&
            typeof CodeMirror.fold.indent === "function"
        ),
        hasHintProviders: [
            "coffeescript",
            "css",
            "html",
            "javascript",
            "sql",
            "xml"
        ].every(function (helperName) {
            return typeof CodeMirror.hint[helperName] === "function";
        }),
        hasLintAPI: Boolean(
            CodeMirror.optionHandlers.lint &&
            typeof CodeMirror.prototype.performLint === "function" &&
            CodeMirror.lint
        ),
        hasMergeAPI: Boolean(
            typeof CodeMirror.MergeView === "function" &&
            typeof CodeMirror.commands.goNextDiff === "function" &&
            typeof CodeMirror.commands.goPrevDiff === "function"
        ),
        hasModeLoaderAPI: Boolean(
            typeof CodeMirror.modeURL === "string" &&
            typeof CodeMirror.requireMode === "function" &&
            typeof CodeMirror.autoLoadMode === "function"
        ),
        hasRunModeAPI: Boolean(
            typeof CodeMirror.runMode === "function" &&
            typeof CodeMirror.colorize === "function"
        ),
        hasScrollbarModels: Boolean(
            typeof CodeMirror.scrollbarModel.simple === "function" &&
            typeof CodeMirror.scrollbarModel.overlay === "function"
        ),
        hasSelectionPointer: Boolean(
            CodeMirror.optionHandlers.selectionPointer
        ),
        hasTernAPI: typeof CodeMirror.TernServer === "function",
        hasHardWrapAPI: [
            "wrapParagraph",
            "wrapParagraphsInRange",
            "wrapRange"
        ].every(function (methodName) {
            return typeof CodeMirror.prototype[methodName] === "function";
        }),
        hasEmacsKeyMap: Boolean(
            CodeMirror.emacs &&
            CodeMirror.keyMap.emacs
        )
    };
});
