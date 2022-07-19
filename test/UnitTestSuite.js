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

define(function (require, exports, module) {

    require("spec/utframework-suite-test");
    require("spec/Async-test");
    require("spec/CommandManager-test");
    require("spec/CSSUtils-test");
    require("spec/CSSUtils-integ-test");
    require("spec/Document-test");
    require("spec/Document-integ-test");
    require("spec/Editor-test");
    require("spec/EditorRedraw-test");
    require("spec/EditorCommandHandlers-test");
    require("spec/EditorCommandHandlers-integ-test");
    require("spec/EditorManager-test");
    require("spec/EventDispatcher-test");
    require("spec/EventManager-test");
    require("spec/ExtensionInterface-test");
    require("spec/ExtensionLoader-test");
    require("spec/ExtensionManager-test");
    require("spec/FeatureGate-test");
    require("spec/FileFilters-test");
    require("spec/FileFilters-integ-test");
    require("spec/FileSystem-test");
    require("spec/FileTreeView-test");
    require("spec/FileTreeViewModel-test");
    require("spec/FileUtils-test");
    require("spec/FindReplace-test");
    require("spec/FindReplace-integ-test");
    require("spec/HTMLInstrumentation-test");
    require("spec/HTMLSimpleDOM-test");
    require("spec/HTMLTokenizer-test");
    require("spec/CodeHintUtils-test");
    require("spec/JSONUtils-test");
    require("spec/JSUtils-test");
    require("spec/JSUtils-integ-test");
    require("spec/KeyBindingManager-test");
    require("spec/LanguageManager-test");
    require("spec/LanguageManager-integ-test");
    require("spec/LowLevelFileIO-test");
    require("spec/Metrics-test");
    require("spec/MultiRangeInlineEditor-test");
    require("spec/MultiRangeInlineEditor-integ-test");
    require("spec/Pane-test");
    require("spec/PreferencesBase-test");
    require("spec/ProjectModel-test");
    require("spec/QuickSearchField-test");
    require("spec/RemoteFunctions-test");
    require("spec/SpecRunnerUtils-test");
    require("spec/StringMatch-test");
    require("spec/StringUtils-test");
    require("spec/TextRange-test");
    require("spec/ThemeManager-test");
    require("spec/UrlParams-test");
    require("spec/ValidationUtils-test");
    require("spec/ViewFactory-test");
    require("spec/ViewUtils-test");
    require("spec/XMLUtils-test");
    require("spec/CodeInspection-integ-test");
    require("spec/CodeHint-integ-test");
    require("spec/CSSInlineEdit-integ-test");
    require("spec/DocumentCommandHandlers-integ-test");
    require("spec/DocumentManager-integ-test");
    require("spec/DragAndDrop-integ-test");
    require("spec/EditorOptionHandlers-integ-test");
    require("spec/ExtensionUtils-integ-test");
    require("spec/InlineEditorProviders-integ-test");
    require("spec/PreferencesManager-integ-test");
    require("spec/MainViewFactory-integ-test");
    require("spec/MainViewManager-integ-test");
    require("spec/Menu-integ-test");
    require("spec/ProjectManager-integ-test");
    require("spec/QuickOpen-integ-test");
    require("spec/ViewCommandHandlers-integ-test");
    // require("spec/WorkingSetView-test");
    // require("spec/WorkingSetSort-test");
    // require("spec/FindInFiles-test");
    // todo TEST_MODERN
    // require("spec/LanguageTools-test"); LSP tests. disabled for now
    // require("spec/ExtensionInstallation-test"); To Remove after new extension manager framework
    // require("spec/InstallExtensionDialog-test"); reevaluate after new extension manager framework. all tests pass
    // require("spec/LiveDevelopment-test"); reevaluate after new live preview
    // require("spec/LiveDevelopmentMultiBrowser-test"); reevaluate after new live preview
    // require("spec/NodeConnection-test"); deprecate and remove node connection
    // require("spec/Menu-native-integ-test"); evaluate after we have native menus in os installed builds
});
