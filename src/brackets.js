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

// jshint ignore: start
/*eslint-env es6*/
/*eslint no-console: 0*/
/*eslint strict: ["error", "global"]*/
/*global jQuery, Phoenix*/

// TODO: (issue #264) break out the definition of brackets into a separate module from the application controller logic

/**
 * brackets is the root of the Brackets codebase. This file pulls in all other modules as
 * dependencies (or dependencies thereof), initializes the UI, and binds global menus & keyboard
 * shortcuts to their Commands.
 *
 * Unlike other modules, this one can be accessed without an explicit require() because it exposes
 * a global object, window.brackets.
 */
define(function (require, exports, module) {

    // Load dependent non-module scripts
    require("widgets/bootstrap-dropdown");
    require("widgets/bootstrap-modal");
    require("widgets/bootstrap-twipsy-mod");
    require("thirdparty/jquery.knob.modified");
    require('thirdparty/marked.min');

    // Load CodeMirror add-ons--these attach themselves to the CodeMirror module
    require("thirdparty/CodeMirror/addon/comment/continuecomment");
    require("thirdparty/CodeMirror/addon/edit/closebrackets");
    require("thirdparty/CodeMirror/addon/edit/closetag");
    require("thirdparty/CodeMirror/addon/edit/matchbrackets");
    require("thirdparty/CodeMirror/addon/edit/matchtags");
    require("thirdparty/CodeMirror/addon/fold/xml-fold");
    require("thirdparty/CodeMirror/addon/mode/multiplex");
    require("thirdparty/CodeMirror/addon/mode/overlay");
    require("thirdparty/CodeMirror/addon/mode/simple");
    require("thirdparty/CodeMirror/addon/scroll/scrollpastend");
    require("thirdparty/CodeMirror/addon/search/match-highlighter");
    require("thirdparty/CodeMirror/addon/search/searchcursor");
    require("thirdparty/CodeMirror/addon/selection/active-line");
    require("thirdparty/CodeMirror/addon/selection/mark-selection");
    require("thirdparty/CodeMirror/addon/display/rulers");
    require("thirdparty/CodeMirror/addon/comment/comment");
    require("thirdparty/CodeMirror/keymap/sublime");

    require("utils/EventDispatcher");
    require("worker/WorkerComm");
    require("utils/ZipUtils");
    require("NodeConnector");
    require("command/KeyboardOverlayMode");
    require("editor/EditorManager");
    require("project/FileViewController");

    // Load dependent modules
    const AppInit             = require("utils/AppInit"),
        LanguageManager     = require("language/LanguageManager"),
        ProjectManager      = require("project/ProjectManager"),
        FileSyncManager     = require("project/FileSyncManager"),
        Commands            = require("command/Commands"),
        CommandManager      = require("command/CommandManager"),
        PerfUtils           = require("utils/PerfUtils"),
        FileSystem          = require("filesystem/FileSystem"),
        Strings             = require("strings"),
        Dialogs             = require("widgets/Dialogs"),
        DefaultDialogs      = require("widgets/DefaultDialogs"),
        ExtensionLoader     = require("utils/ExtensionLoader"),
        ExtensionInterface  = require("utils/ExtensionInterface"),
        EventManager        = require("utils/EventManager"),
        FeatureGate         = require("utils/FeatureGate"),
        Async               = require("utils/Async"),
        UrlParams           = require("utils/UrlParams").UrlParams,
        PreferencesManager  = require("preferences/PreferencesManager"),
        DragAndDrop         = require("utils/DragAndDrop"),
        NativeApp           = require("utils/NativeApp"),
        DeprecationWarning  = require("utils/DeprecationWarning"),
        ViewCommandHandlers = require("view/ViewCommandHandlers"),
        NotificationUI      = require("widgets/NotificationUI"),
        Metrics             = require("utils/Metrics");
    require("view/MainViewManager");

    window.EventManager = EventManager; // Main event intermediary between brackets and other web pages.
    /**
     * The extension interface that can be used to communicate with extensions that supports it.
     */
    window.ExtensionInterface = ExtensionInterface;
    /**
     * The FeatureGate interface available in global context.
     */
    window.FeatureGate = FeatureGate;
    /**
     * All translation strings
     */
    window.Strings = Strings;
    /**
     * Global notification UI Widgets.
     */
    window.NotificationUI = NotificationUI;
    Phoenix.globalAPI.NotificationUI = NotificationUI;
    Phoenix.globalAPI.PreferencesManager = PreferencesManager;

    // load modules for later use
    require("utils/Global");
    require("editor/CSSInlineEditor");
    require("project/WorkingSetSort");
    require("search/QuickOpen");
    require("search/QuickOpenHelper");
    require("file/FileUtils");
    require("project/SidebarView");
    require("utils/Resizer");
    require("LiveDevelopment/main");
    require("utils/NodeConnection");
    require("utils/NodeDomain");
    require("utils/NodeUtils");
    require("utils/ColorUtils");
    require("view/ThemeManager");
    require("thirdparty/lodash");
    require("language/XMLUtils");
    require("language/JSONUtils");
    require("widgets/InlineMenu");
    require("thirdparty/tinycolor");
    require("utils/LocalizationUtils");
    require("services/login");

    // DEPRECATED: In future we want to remove the global CodeMirror, but for now we
    // expose our required CodeMirror globally so as to avoid breaking extensions in the
    // interim.
    const CodeMirror = require("thirdparty/CodeMirror/lib/codemirror");

    Object.defineProperty(window, "CodeMirror", {
        get: function () {
            DeprecationWarning.deprecationWarning('Use brackets.getModule("thirdparty/CodeMirror/lib/codemirror") instead of global CodeMirror.', true);
            return CodeMirror;
        }
    });

    // DEPRECATED: In future we want to remove the global Mustache, but for now we
    // expose our required Mustache globally so as to avoid breaking extensions in the
    // interim.
    const Mustache = require("thirdparty/mustache/mustache");

    Object.defineProperty(window, "Mustache", {
        get: function () {
            DeprecationWarning.deprecationWarning('Use brackets.getModule("thirdparty/mustache/mustache") instead of global Mustache.', true);
            return Mustache;
        }
    });

    // DEPRECATED: In future we want to remove the global PathUtils, but for now we
    // expose our required PathUtils globally so as to avoid breaking extensions in the
    // interim.
    const PathUtils = require("thirdparty/path-utils/path-utils");

    Object.defineProperty(window, "PathUtils", {
        get: function () {
            DeprecationWarning.deprecationWarning('Use brackets.getModule("thirdparty/path-utils/path-utils") instead of global PathUtils.', true);
            return PathUtils;
        }
    });

    //load language features
    require("features/ParameterHintsManager");
    require("features/JumpToDefManager");
    require("features/QuickViewManager");
    require("features/SelectionViewManager");
    require("features/TaskManager");
    require("features/BeautificationManager");
    require("features/NewFileContentManager");

    // Load modules that self-register and just need to get included in the main project
    require("command/DefaultMenus");
    require("document/ChangedDocumentTracker");
    require("editor/EditorCommandHandlers");
    require("editor/EditorOptionHandlers");
    require("editor/EditorStatusBar");
    require("editor/ImageViewer");
    require("extensibility/ExtensionDownloader");
    require("extensibility/InstallExtensionDialog");
    require("extensibility/ExtensionManagerDialog");
    require("help/HelpCommandHandlers");
    require("search/FindInFilesUI");
    require("search/FindReplace");

    //Load find References Feature Manager
    require("features/FindReferencesManager");

    //Load common JS module
    require("JSUtils/Session");
    require("JSUtils/ScopeManager");

    //load Language Tools Module
    require("languageTools/PathConverters");
    require("languageTools/LanguageTools");
    require("languageTools/ClientLoader");
    require("languageTools/BracketsToNodeInterface");
    require("languageTools/DefaultProviders");
    require("languageTools/DefaultEventHandlers");

    // web workers
    require("worker/IndexingWorker");
    require("worker/ExtensionsWorker");

    PerfUtils.addMeasurement("brackets module dependencies resolved");

    // Local variables
    const params = new UrlParams();

    // read URL params
    params.parse();


    /**
     * Setup test object
     */
    function _initTest() {
        // TODO: (issue #265) Make sure the "test" object is not included in final builds
        // All modules that need to be tested from the context of the application
        // must to be added to this object. The unit tests cannot just pull
        // in the modules since they would run in context of the unit test window,
        // and would not have access to the app html/css.
        brackets.test = {
            BeautificationManager: require("features/BeautificationManager"),
            CodeHintManager: require("editor/CodeHintManager"),
            CodeInspection: require("language/CodeInspection"),
            CommandManager: require("command/CommandManager"),
            Commands: require("command/Commands"),
            CSSUtils: require("language/CSSUtils"),
            DefaultDialogs: require("widgets/DefaultDialogs"),
            Dialogs: require("widgets/Dialogs"),
            DocumentCommandHandlers: require("document/DocumentCommandHandlers"),
            DocumentManager: require("document/DocumentManager"),
            DocumentModule: require("document/Document"),
            DragAndDrop: require("utils/DragAndDrop"),
            EditorManager: require("editor/EditorManager"),
            Editor: require("editor/Editor"),
            EventManager: require("utils/EventManager"),
            ExtensionLoader: require("utils/ExtensionLoader"),
            ExtensionUtils: require("utils/ExtensionUtils"),
            ExtensionInterface: require("utils/ExtensionInterface"),
            FeatureGate: require("utils/FeatureGate"),
            File: require("filesystem/File"),
            FileFilters: require("search/FileFilters"),
            FileSyncManager: require("project/FileSyncManager"),
            FileSystem: require("filesystem/FileSystem"),
            FileUtils: require("file/FileUtils"),
            FileViewController: require("project/FileViewController"),
            FindInFiles: require("search/FindInFiles"),
            FindInFilesUI: require("search/FindInFilesUI"),
            FindUtils: require("search/FindUtils"),
            HTMLInstrumentation: require("LiveDevelopment/MultiBrowserImpl/language/HTMLInstrumentation"),
            InstallExtensionDialog: require("extensibility/InstallExtensionDialog"),
            JSUtils: require("language/JSUtils"),
            KeyBindingManager: require("command/KeyBindingManager"),
            LanguageManager: require("language/LanguageManager"),
            LiveDevMultiBrowser: require("LiveDevelopment/LiveDevMultiBrowser"),
            LiveDevServerManager: require("LiveDevelopment/LiveDevServerManager"),
            LiveDevProtocol: require("LiveDevelopment/MultiBrowserImpl/protocol/LiveDevProtocol"),
            MainViewFactory: require("view/MainViewFactory"),
            MainViewManager: require("view/MainViewManager"),
            Menus: require("command/Menus"),
            MultiRangeInlineEditor: require("editor/MultiRangeInlineEditor").MultiRangeInlineEditor,
            NativeApp: require("utils/NativeApp"),
            NodeUtils: require("utils/NodeUtils"),
            PerfUtils: require("utils/PerfUtils"),
            PreferencesManager: require("preferences/PreferencesManager"),
            ProjectManager: require("project/ProjectManager"),
            QuickViewManager: require("features/QuickViewManager"),
            SelectionViewManager: require("features/SelectionViewManager"),
            TaskManager: require("features/TaskManager"),
            StatusBar: require("widgets/StatusBar"),
            ThemeManager: require("view/ThemeManager"),
            WorkspaceManager: require("view/WorkspaceManager"),
            SearchResultsView: require("search/SearchResultsView"),
            ScrollTrackMarkers: require("search/ScrollTrackMarkers"),
            WorkingSetView: require("project/WorkingSetView"),
            doneLoading: false
        };

        AppInit.appReady(function () {
            brackets.test.doneLoading = true;
        });
    }

    function _removePhoenixLoadingOverlay() {
        if(window.splashScreenPresent){
            document.getElementById('phoenix-loading-splash-screen-overlay').remove();
            window.splashScreenPresent = false;
            ProjectManager.off(ProjectManager.EVENT_PROJECT_OPEN_FAILED, _removePhoenixLoadingOverlay);
            ProjectManager.off(ProjectManager.EVENT_PROJECT_OPEN, _removePhoenixLoadingOverlay);
        }
    }

    // when project load fails, Phoenix shown a failure dialogue. Drop splash screen for the user to see it.
    ProjectManager.on(ProjectManager.EVENT_PROJECT_OPEN_FAILED, _removePhoenixLoadingOverlay);
    // as soon as the first theme loads up, phoenix is safe to view
    ProjectManager.on(ProjectManager.EVENT_PROJECT_OPEN, _removePhoenixLoadingOverlay);

    function _startupBrackets() {
        // Load all extensions. This promise will complete even if one or more
        // extensions fail to load.
        console.log("Starting Brackets...");
        const extensionPathOverride = params.get("extensions");  // used by unit tests
        const extensionLoaderPromise = ExtensionLoader.init(extensionPathOverride ? extensionPathOverride.split(",") : null);

        // Finish UI initialization
        ViewCommandHandlers.restoreFontSize();
        ProjectManager.getStartupProjectPath().then((initialProjectPath)=>{
            ProjectManager.openProject(initialProjectPath).always(function () {
                _initTest();

                // If this is the first launch, and we have an index.html file in the project folder (which should be
                // the samples folder on first launch), open it automatically. (We explicitly check for the
                // samples folder in case this is the first time we're launching Brackets after upgrading from
                // an old version that might not have set the "afterFirstLaunch" pref.)
                const deferred = new $.Deferred();

                if (!params.get("skipSampleProjectLoad") && !PreferencesManager.getViewState("afterFirstLaunch")) {
                    PreferencesManager.setViewState("afterFirstLaunch", "true");
                    if (ProjectManager.isWelcomeProjectPath(initialProjectPath)) {
                        FileSystem.resolve(initialProjectPath + "index.html", function (err, file) {
                            if (!err) {
                                const promise = CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, { fullPath: file.fullPath });
                                promise.then(deferred.resolve, deferred.reject);
                            } else {
                                deferred.reject();
                            }
                        });
                    } else {
                        deferred.resolve();
                    }
                } else {
                    deferred.resolve();
                }

                deferred.always(function () {
                    extensionLoaderPromise.always(function () {
                        // Signal that extensions are loaded
                        AppInit._dispatchReady(AppInit.EXTENSIONS_LOADED);
                        // Signal that Brackets is loaded
                        AppInit._dispatchReady(AppInit.APP_READY);

                        PerfUtils.addMeasurement("Application Startup");

                        if (PreferencesManager._isUserScopeCorrupt()) {
                            const userPrefFullPath = PreferencesManager.getUserPrefFile();
                            // user scope can get corrupt only if the file exists, is readable,
                            // but malformed. no need to check for its existence.
                            Metrics.countEvent(Metrics.EVENT_TYPE.STORAGE, "prefs.corrupt", "startup");
                            let file = FileSystem.getFileForPath(userPrefFullPath);
                            file.unlinkAsync().finally(function () {
                                Dialogs.showModalDialog(
                                    DefaultDialogs.DIALOG_ID_ERROR,
                                    Strings.ERROR_PREFS_RESET_TITLE,
                                    Strings.ERROR_PREFS_CORRUPT_RESET
                                );
                            });
                        }
                    });
                });
            });
        });
    }

    /**
     * Setup Brackets
     */
    function _onReady() {
        PerfUtils.addMeasurement("window.document Ready");

        // Use quiet scrollbars if we aren't on Lion. If we're on Lion, only
        // use native scroll bars when the mouse is not plugged in or when
        // using the "Always" scroll bar setting.
        const osxMatch = /Mac OS X 10\D([\d+])\D/.exec(window.navigator.userAgent);
        if (osxMatch && osxMatch[1] && Number(osxMatch[1]) >= 7) {
            // test a scrolling div for scrollbars
            const $testDiv = $("<div style='position:fixed;left:-50px;width:50px;height:50px;overflow:auto;'><div style='width:100px;height:100px;'/></div>").appendTo(window.document.body);

            if ($testDiv.outerWidth() === $testDiv.get(0).clientWidth) {
                $(".sidebar").removeClass("quiet-scrollbars");
            }

            $testDiv.remove();
        }

        // Load default languages and preferences
        Async.waitForAll([LanguageManager.ready, PreferencesManager.ready]).always(function () {
            window._phoenixfsAppDirsCreatePromise.finally(_startupBrackets);
        });
    }

    /**
     * Setup event handlers prior to dispatching AppInit.HTML_READY
     */
    function _beforeHTMLReady() {
        // Add the platform (mac, win or linux) to the body tag so we can have platform-specific CSS rules
        const $body = $("body");
        $body.addClass("platform-" + brackets.platform);
        if(Phoenix.isNativeApp){
            $body.addClass("tauri");
        }

        // Browser-hosted version may also have different CSS (e.g. since '#titlebar' is shown)
        $body.addClass("in-appshell");

        $('#toolbar-extension-manager').prop('title', Strings.EXTENSION_MANAGER_TITLE);
        $('#update-notification').prop('title', Strings.UPDATE_NOTIFICATION_TOOLTIP);

        // Update title
        $("title").text(brackets.config.app_title);

        // Respond to dragging & dropping files/folders onto the window by opening them. If we don't respond
        // to these events, the file would load in place of the Brackets UI
        DragAndDrop.attachHandlers();

        // TODO: (issue 269) to support IE, need to listen to document instead (and even then it may not work when focus is in an input field?)
        $(window).focus(function () {
            // This call to syncOpenDocuments() *should* be a no-op now that we have
            // file watchers, but is still here as a safety net.
            FileSyncManager.syncOpenDocuments();
            if(!Phoenix.browser.isTauri) { // dont do this in desktop builds as native fs watchers will take care of external changes
                // Refresh the project tree when the window comes back into focus
                // Changes made outside of Phoenix Code will be updated when the user returns
                ProjectManager.refreshFileTree();
              }
        });

        // Prevent unhandled middle button clicks from triggering native behavior
        // Example: activating AutoScroll (see #510)
        $("html").on("mousedown", ".inline-widget", function (e) {
            if (e.button === 1) {
                e.preventDefault();
            }
        });

        // The .no-focus style is added to clickable elements that should
        // not steal focus. Calling preventDefault() on mousedown prevents
        // focus from going to the click target.
        $("html").on("mousedown", ".no-focus", function (e) {
            // Text fields should always be focusable.
            const $target = $(e.target),
                isFormElement =
                    $target.is("input") ||
                    $target.is("textarea") ||
                    $target.is("select");

            if (!isFormElement) {
                e.preventDefault();
            }
        });

        // Prevent clicks on any link from navigating to a different page (which could lose unsaved
        // changes). We can't use a simple .on("click", "a") because of http://bugs.jquery.com/ticket/3861:
        // jQuery hides non-left clicks from such event handlers, yet middle-clicks still cause CEF to
        // navigate. Also, a capture handler is more reliable than bubble.
        window.document.body.addEventListener("click", function (e) {
            // Don't interfere with context menu clicks
            if (e.button === 2 || (brackets.platform === "mac" && e.ctrlKey)) {
                return;
            }

            // Check parents too, in case link has inline formatting tags
            let node = e.target, url;
            while (node) {
                if (node.tagName === "A") {
                    url = node.getAttribute("href");
                    if (url && !url.match(/^#/)) {
                        NativeApp.openURLInDefaultBrowser(url);
                        e.stopPropagation();
                    }
                    e.preventDefault();
                    break;
                }
                node = node.parentElement;
            }
        }, true);

        // jQuery patch to shim deprecated usage of $() on EventDispatchers
        const DefaultCtor = jQuery.fn.init;
        jQuery.fn.init = function (firstArg, secondArg) {
            const jQObject = new DefaultCtor(firstArg, secondArg);

            // Is this a Brackets EventDispatcher object? (not a DOM node or other object)
            if (firstArg && firstArg._EventDispatcher) {
                // Patch the jQ wrapper object so it calls EventDispatcher's APIs instead of jQuery's
                jQObject.on  = firstArg.on.bind(firstArg);
                jQObject.one = firstArg.one.bind(firstArg);
                jQObject.off = firstArg.off.bind(firstArg);
                // Don't offer legacy support for trigger()/triggerHandler() on core model objects; extensions
                // shouldn't be doing that anyway since it's basically poking at private API

                // Console warning, since $() is deprecated for EventDispatcher objects
                // (pass true to only print once per caller, and index 4 since the extension caller is deeper in the stack than usual)
                DeprecationWarning.deprecationWarning("Deprecated: Do not use $().on/off() on Brackets modules and model objects. Call on()/off() directly on the object without a $() wrapper.", true, 4);
            }
            return jQObject;
        };
    }

    // Dispatch htmlReady event
    _beforeHTMLReady();
    AppInit._dispatchReady(AppInit.HTML_READY);
    $(window.document).ready(_onReady);
});
