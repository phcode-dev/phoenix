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

/*globals path, logger, Phoenix*/
/*jslint regexp: true */

define(function (require, exports, module) {


    const _ = brackets.getModule("thirdparty/lodash");

    const Commands               = brackets.getModule("command/Commands"),
        CommandManager         = brackets.getModule("command/CommandManager"),
        Menus                  = brackets.getModule("command/Menus"),
        FileSystem             = brackets.getModule("filesystem/FileSystem"),
        FileUtils              = brackets.getModule("file/FileUtils"),
        PerfUtils              = brackets.getModule("utils/PerfUtils"),
        StringUtils            = brackets.getModule("utils/StringUtils"),
        Dialogs                = brackets.getModule("widgets/Dialogs"),
        DragAndDrop            = brackets.getModule("utils/DragAndDrop"),
        Strings                = brackets.getModule("strings"),
        PreferencesManager     = brackets.getModule("preferences/PreferencesManager"),
        LocalizationUtils      = brackets.getModule("utils/LocalizationUtils"),
        MainViewManager        = brackets.getModule("view/MainViewManager"),
        WorkingSetView         = brackets.getModule("project/WorkingSetView"),
        ExtensionManager       = brackets.getModule("extensibility/ExtensionManager"),
        Mustache               = brackets.getModule("thirdparty/mustache/mustache"),
        Locales                = brackets.getModule("nls/strings"),
        ProjectManager         = brackets.getModule("project/ProjectManager"),
        ExtensionLoader        = brackets.getModule("utils/ExtensionLoader"),
        NodeConnector          = brackets.getModule("NodeConnector"),
        extensionDevelopment   = require("extensionDevelopment"),
        PerfDialogTemplate     = require("text!htmlContent/perf-dialog.html"),
        LanguageDialogTemplate = require("text!htmlContent/language-dialog.html");

    const KeyboardPrefs = JSON.parse(require("text!keyboard.json"));

    const DIAGNOSTICS_SUBMENU = "debug-diagnostics-sub-menu",
        EXPERIMENTAL_FEATURES_SUB_MENU = "debug-experimental-features";

    // default preferences file name
    const DEFAULT_PREFERENCES_FILENAME = "defaultPreferences.json",
        SUPPORTED_PREFERENCE_TYPES   = ["number", "boolean", "string", "array", "object"];

    let recomputeDefaultPrefs        = true,
        defaultPreferencesFullPath   = path.normalize(brackets.app.getApplicationSupportDirectory() + "/" + DEFAULT_PREFERENCES_FILENAME);

     /**
      * Debug commands IDs
      * @enum {string}
      */
    const DEBUG_REFRESH_WINDOW                = "debug.refreshWindow", // string must MATCH string in native code (brackets_extensions)
        DEBUG_SHOW_DEVELOPER_TOOLS            = "debug.showDeveloperTools",
        DEBUG_LOAD_CURRENT_EXTENSION          = "debug.loadCurrentExtension",
        DEBUG_UNLOAD_CURRENT_EXTENSION        = "debug.unloadCurrentExtension",
        DEBUG_RUN_UNIT_TESTS                  = "debug.runUnitTests",
        DEBUG_SHOW_PERF_DATA                  = "debug.showPerfData",
        DEBUG_RELOAD_WITHOUT_USER_EXTS        = "debug.reloadWithoutUserExts",
        DEBUG_SWITCH_LANGUAGE                 = "debug.switchLanguage",
        DEBUG_ENABLE_LOGGING                  = "debug.enableLogging",
        DEBUG_ENABLE_PHNODE_INSPECTOR         = "debug.enablePhNodeInspector",
        DEBUG_GET_PHNODE_INSPECTOR_URL        = "debug.getPhNodeInspectorURL",
        DEBUG_LIVE_PREVIEW_LOGGING            = "debug.livePreviewLogging",
        DEBUG_OPEN_VFS                        = "debug.openVFS",
        DEBUG_OPEN_EXTENSION_FOLDER           = "debug.openExtensionFolders",
        DEBUG_OPEN_VIRTUAL_SERVER             = "debug.openVirtualServer",
        DEBUG_OPEN_PREFERENCES_IN_SPLIT_VIEW  = "debug.openPrefsInSplitView",
        DEBUG_DRAG_AND_DROP                   = "debug.dragAndDrop";

    const LOG_TO_CONSOLE_KEY = logger.loggingOptions.LOCAL_STORAGE_KEYS.LOG_TO_CONSOLE_KEY,
        LOG_LIVE_PREVIEW_KEY = logger.loggingOptions.LOCAL_STORAGE_KEYS.LOG_LIVE_PREVIEW;

    // define a preference to turn off opening preferences in split-view.
    var prefs = PreferencesManager.getExtensionPrefs("preferencesView");
    prefs.definePreference("openPrefsInSplitView",   "boolean", true, {
        description: Strings.DESCRIPTION_OPEN_PREFS_IN_SPLIT_VIEW
    });

    prefs.definePreference("openUserPrefsInSecondPane",   "boolean", true, {
        description: Strings.DESCRIPTION_OPEN_USER_PREFS_IN_SECOND_PANE
    });

    // Implements the 'Run Tests' menu to bring up the Jasmine unit test window
    function _runUnitTests(spec) {
        let queryString = spec ? "?spec=" + spec : "?suite=unit";
        let testBaseURL = "../test/SpecRunner.html";
        if(window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'){
            // must be a deployed in phcode.dev/other sites. point to site test url
            testBaseURL = "test/SpecRunner.html";
        }
        Phoenix.app.openURLInPhoenixWindow(testBaseURL + queryString, {
            windowTitle: "Test Runner",
            preferTabs: true,
            width: 1670,
            height: 900
        });
    }

    function handleReload() {
        CommandManager.execute(Commands.APP_RELOAD);
    }

    function handleReloadWithoutUserExts() {
        CommandManager.execute(Commands.APP_RELOAD_WITHOUT_EXTS);
    }

    function handleShowPerfData() {
        var templateVars = {
            delimitedPerfData: PerfUtils.getDelimitedPerfData(),
            perfData: []
        };

        var getValue = function (entry) {
            // entry is either an Array or a number
            if (Array.isArray(entry)) {
                // For Array of values, return: minimum/average(count)/maximum/last
                var i, e, avg, sum = 0, min = Number.MAX_VALUE, max = 0;

                for (i = 0; i < entry.length; i++) {
                    e = entry[i];
                    min = Math.min(min, e);
                    sum += e;
                    max = Math.max(max, e);
                }
                avg = Math.round(sum * 10 / entry.length) / 10; // tenth of a millisecond
                return String(min) + "/" + String(avg) + "(" + entry.length + ")/" + String(max) + "/" + String(e);
            }
            return entry;

        };

        var perfData = PerfUtils.getData();
        _.forEach(perfData, function (value, testName) {
            templateVars.perfData.push({
                testName: StringUtils.breakableUrl(testName),
                value: getValue(value)
            });
        });

        var template = Mustache.render(PerfDialogTemplate, templateVars);
        Dialogs.showModalDialogUsingTemplate(template);

        // Select the raw perf data field on click since select all doesn't
        // work outside of the editor
        $("#brackets-perf-raw-data").click(function () {
            $(this).focus().select();
        });
    }

    function handleSwitchLanguage() {
        const supportedLocales = Object.keys(Locales);

        var $dialog,
            $submit,
            $select,
            locale,
            curLocale = (brackets.isLocaleDefault() ? null : brackets.getLocale()),
            languages = [];

        var setLanguage = function (event) {
            locale = $select.val();
            $submit.prop("disabled", locale === (curLocale || ""));
        };

        for(let supportedLocale of supportedLocales){
            var match = supportedLocale.match(/^([a-z]{2})(-[a-z]{2})?$/);

            if (match) {
                var language = supportedLocale,
                    label = match[1];

                if (match[2]) {
                    label += match[2].toUpperCase();
                }

                languages.push({label: LocalizationUtils.getLocalizedLabel(label), language: language});
            }
        }
        // add English (US), which is the root folder and should be sorted as well
        languages.push({label: LocalizationUtils.getLocalizedLabel("en"),  language: "en"});

        // sort the languages via their display name
        languages.sort(function (lang1, lang2) {
            return lang1.label.localeCompare(lang2.label);
        });

        // add system default (which is placed on the very top)
        languages.unshift({label: Strings.LANGUAGE_SYSTEM_DEFAULT, language: null});

        var template = Mustache.render(LanguageDialogTemplate, {languages: languages, Strings: Strings});
        Dialogs.showModalDialogUsingTemplate(template).done(function (id) {
            if (id === Dialogs.DIALOG_BTN_OK && locale !== curLocale) {
                brackets.setLocale(locale);
                CommandManager.execute(Commands.APP_RELOAD);
            }
        });

        $dialog = $(".switch-language.instance");
        $submit = $dialog.find(".dialog-button[data-button-id='" + Dialogs.DIALOG_BTN_OK + "']");
        $select = $dialog.find("select");

        $select.on("change", setLanguage).val(curLocale);
    }

    function _openPrefFilesInSplitView(prefsPath, defaultPrefsPath, deferredPromise) {

        var currScheme         = MainViewManager.getLayoutScheme(),
            file               = FileSystem.getFileForPath(prefsPath),
            defaultPrefsFile   = FileSystem.getFileForPath(defaultPrefsPath),
            DEFAULT_PREFS_PANE = "first-pane",
            USER_PREFS_PANE    = "second-pane";

        // Exchange the panes, if default preferences need to be opened
        // in the right pane.
        if (!prefs.get("openUserPrefsInSecondPane")) {
            DEFAULT_PREFS_PANE = "second-pane";
            USER_PREFS_PANE    = "first-pane";
        }

        function _openFiles() {

            if (currScheme.rows === 1 && currScheme.columns === 1) {
                // Split layout is not active yet. Initiate the
                // split view.
                MainViewManager.setLayoutScheme(1, 2);
            }

            // Open the default preferences in the left pane in the read only mode.
            CommandManager.execute(Commands.FILE_OPEN, { fullPath: defaultPrefsPath, paneId: DEFAULT_PREFS_PANE, options: { isReadOnly: true } })
                .done(function () {

                    // Make sure the preference file is going to be opened in pane
                    // specified in the preference.
                    if (MainViewManager.findInWorkingSet(DEFAULT_PREFS_PANE, prefsPath) >= 0) {

                        MainViewManager._moveView(DEFAULT_PREFS_PANE, USER_PREFS_PANE, file, 0, true);

                        // Now refresh the project tree by asking
                        // it to rebuild the UI.
                        WorkingSetView.refresh(true);
                    }

                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: prefsPath, paneId: USER_PREFS_PANE})
                        .done(function () {
                            deferredPromise.resolve();
                        }).fail(function () {
                            deferredPromise.reject();
                        });
                }).fail(function () {
                    deferredPromise.reject();
                });
        }

        var resultObj = MainViewManager.findInAllWorkingSets(defaultPrefsPath);
        if (resultObj && resultObj.length > 0) {
            CommandManager.execute(Commands.FILE_CLOSE, {file: defaultPrefsFile, paneId: resultObj[0].paneId})
                .done(function () {
                    _openFiles();
                }).fail(function () {
                    deferredPromise.reject();
                });
        } else {
            _openFiles();
        }

    }

    function _isSupportedPrefType(prefType) {

        if (SUPPORTED_PREFERENCE_TYPES.indexOf(prefType) >= 0) {
            return true;
        }
        return false;

    }

   /*
    * This method tries to deduce the preference type
    * based on various parameters like objects initial
    * value, object type, object's type property.
    */
    function _getPrefType(prefItem) {

        var finalPrefType = "undefined";

        if (prefItem) {
            // check the type parameter.
            var _prefType = prefItem.type;
            if (_prefType !== undefined) {
                finalPrefType = prefItem.type.toLowerCase();
                // make sure the initial property's
                // object type matches to that of 'type' property.
                if (prefItem.initial !== undefined) {

                    if (Array.isArray(prefItem.initial)) {
                        _prefType = "array";
                    } else {
                        var _initialType = typeof (prefItem.initial);
                        _initialType = _initialType.toLowerCase();
                        if (_prefType !== _initialType) {
                            _prefType = _initialType;
                        }
                    }
                }
            }

            if (_prefType) {
                // preference object's type
                // is defined. Check if that is valid or not.
                finalPrefType = _prefType;
                if (!_isSupportedPrefType(finalPrefType)) {
                    finalPrefType = "undefined";
                }
            } else if (Array.isArray(prefItem)) {
                // Check if the object itself
                // is an array, in which case
                // we log the default.
                finalPrefType = "array";
            } else if (prefItem.initial !== undefined  ||
                       prefItem.keys !== undefined) {

                // OK looks like this preference has
                // no explicit type defined. instead
                // it needs to be deduced from initial/keys
                // variable.
                var _prefVar;
                if (prefItem.initial !== undefined) {
                    _prefVar = prefItem.initial;
                } else {
                    _prefVar = prefItem.keys;
                }

                if (Array.isArray(_prefVar)) {
                    // In cases of array the
                    // typeof is returning a function.
                    finalPrefType = "array";
                }

            } else {
                finalPrefType = typeof (prefItem);
            }
        }

        // Now make sure we recognize this format.
        if (!_isSupportedPrefType(finalPrefType)) {
            finalPrefType = "undefined";
        }

        return finalPrefType;
    }

    function _isValidPref(pref) {

        // Make sure to generate pref description only for
        // user overrides and don't generate for properties
        // meant to be used for internal purposes. Also check
        // if the preference type is valid or not.
        if (pref && !pref.excludeFromHints && _getPrefType(pref) !== "undefined") {
            return true;
        }

        return false;
    }

   /*
    * This method tries to match between initial objects
    * and key objects and then aggregates objects from both
    * the properties.
    */
    function _getChildPrefs(prefItem) {

        var finalObj = {},
            keysFound = false;

        if (!prefItem) {
            return {};
        }

        function _populateKeys(allKeys) {

            var prop;
            if (typeof (allKeys) === "object") {
                // iterate through the list.
                keysFound = true;
                for (prop in allKeys) {
                    if (allKeys.hasOwnProperty(prop)) {
                        finalObj[prop] = allKeys[prop];
                    }
                }
            }
        }

        _populateKeys(prefItem.initial);
        _populateKeys(prefItem.keys);

        // Last resort: Maybe plain objects, in which case
        // we blindly extract all the properties.
        if (!keysFound) {
            _populateKeys(prefItem);
        }

        return finalObj;
    }

    function _formatBasicPref(prefItem, prefName, tabIndentStr) {

        if (!prefItem || typeof (prefName) !== "string" || _getPrefType(prefItem) === "object") {
            // return empty string in case of
            // object or pref is not defined.
            return "";
        }

        var prefDescription = prefItem.description || "",
            prefDefault     = prefItem.initial,
            prefFormatText  = tabIndentStr + "\t// {0}\n" + tabIndentStr + "\t\"{1}\": {2}",
            prefItemType    = _getPrefType(prefItem);

        if (prefDefault === undefined && !prefItem.description) {
            // This could be the case when prefItem is a basic JS variable.
            if (prefItemType === "number" || prefItemType === "boolean" || prefItemType === "string") {
                prefDefault = prefItem;
            }
        }

        if (prefDefault === undefined) {
            if (prefItemType === "number") {
                prefDefault = 0;
            } else if (prefItemType === "boolean") {
                // Defaulting the preference to false,
                // in case this is missing.
                prefDefault = false;
            } else {
                // for all other types
                prefDefault = "";
            }
        }

        if ((prefDescription === undefined || prefDescription.length === 0)) {
            if (!Array.isArray(prefDefault)) {
                prefDescription = Strings.DEFAULT_PREFERENCES_JSON_DEFAULT + ": " + prefDefault;
            } else {
                prefDescription = "";
            }
        }

        if (prefItemType === "array") {
            prefDefault = "[]";
        } else if (prefDefault.length === 0 || (prefItemType !== "boolean" && prefItemType !== "number")) {
            prefDefault = "\"" + prefDefault + "\"";
        }

        return StringUtils.format(prefFormatText, prefDescription, prefName, prefDefault);
    }

    function _formatPref(prefName,  prefItem, indentLevel) {

        // check for validity of the parameters being passed
        if (!prefItem || indentLevel < 0 || !prefName || !prefName.length) {
            return "";
        }

        var iLevel,
            prefItemKeys,
            entireText     = "",
            prefItemDesc   = prefItem.description || "",
            prefItemType   = _getPrefType(prefItem),
            hasKeys        = false,
            tabIndents     = "",
            numKeys        = 0;

        // Generate the indentLevel string
        for (iLevel = 0; iLevel < indentLevel; iLevel++) {
            tabIndents += "\t";
        }

        // Check if the preference is an object.
        if (_getPrefType(prefItem) === "object") {
            prefItemKeys = _getChildPrefs(prefItem);
            if (Object.keys(prefItemKeys).length > 0) {
                hasKeys = true;
            }
        }

        // There are some properties like "highlightMatches" that
        // are declared as boolean type but still can take object keys.
        // The below condition check can take care of cases like this.
        if (prefItemType !== "object" && hasKeys === false) {
            return _formatBasicPref(prefItem, prefName, tabIndents);
        }

        // Indent the beginning of the object.
        tabIndents += "\t";

        if (prefItemDesc && prefItemDesc.length > 0) {
            entireText = tabIndents + "// " + prefItemDesc + "\n";
        }

        entireText += tabIndents + "\"" + prefName + "\": " + "{";

        if (prefItemKeys) {
            numKeys = Object.keys(prefItemKeys).length;
        }

        // In case the object array is empty
        if (numKeys <= 0) {
            entireText += "}";
            return entireText;
        }
        entireText += "\n";


        // Now iterate through all the keys
        // and generate nested formatted objects.

        Object.keys(prefItemKeys).sort().forEach(function (property) {

            if (prefItemKeys.hasOwnProperty(property)) {

                var pref = prefItemKeys[property];

                if (_isValidPref(pref)) {

                    var formattedText = "";

                    if (_getPrefType(pref) === "object") {
                        formattedText = _formatPref(property, pref, indentLevel + 1);
                    } else {
                        formattedText = _formatBasicPref(pref, property, tabIndents);
                    }

                    if (formattedText.length > 0) {
                        entireText += formattedText + ",\n\n";
                    }
                }
            }
        });

        // Strip ",\n\n" that got added above, for the last property
        if (entireText.length > 0) {
            entireText = entireText.slice(0, -3) + "\n" + tabIndents + "}";
        } else {
            entireText = "{}";
        }

        return entireText;
    }

    function _getDefaultPreferencesString() {

        var allPrefs       = PreferencesManager.getAllPreferences(),
            headerComment  = Strings.DEFAULT_PREFERENCES_JSON_HEADER_COMMENT + "\n\n{\n",
            entireText     = "";

        Object.keys(allPrefs).sort().forEach(function (property) {
            if (allPrefs.hasOwnProperty(property)) {

                var pref = allPrefs[property];

                if (_isValidPref(pref)) {
                    entireText += _formatPref(property, pref, 0) + ",\n\n";
                }
            }
        });

        // Strip ",\n\n" that got added above, for the last property
        if (entireText.length > 0) {
            entireText = headerComment + entireText.slice(0, -3) + "\n}\n";
        } else {
            entireText = headerComment + "}\n";
        }

        return entireText;
    }

    function _loadDefaultPrefs(prefsPath, deferredPromise) {

        var defaultPrefsPath = defaultPreferencesFullPath,
            file             = FileSystem.getFileForPath(defaultPrefsPath);

        function _executeDefaultOpenPrefsCommand() {

            CommandManager.execute(Commands.FILE_OPEN_PREFERENCES)
                .done(function () {
                    deferredPromise.resolve();
                }).fail(function () {
                    deferredPromise.reject();
                });
        }

        file.exists(function (err, doesExist) {

            if (doesExist) {

                // Go about recreating the default preferences file.
                if (recomputeDefaultPrefs) {

                    var prefsString       = _getDefaultPreferencesString();
                    recomputeDefaultPrefs = false;

                    // We need to delete this first
                    file.unlink(function (err) {
                        if (!err) {
                            // Go about recreating this
                            // file and write the default
                            // preferences string to this file.
                            FileUtils.writeText(file, prefsString, true)
                                .done(function () {
                                    recomputeDefaultPrefs = false;
                                    _openPrefFilesInSplitView(prefsPath, defaultPrefsPath, deferredPromise);
                                }).fail(function (error) {
                                    // Give a chance for default preferences command.
                                    console.error("Unable to write to default preferences file! error code:" + error);
                                    _executeDefaultOpenPrefsCommand();
                                });
                        } else {
                            // Some error occured while trying to delete
                            // the file. In this case open the user
                            // preferences alone.
                            console.error("Unable to delete the existing default preferences file! error code:" + err);
                            _executeDefaultOpenPrefsCommand();
                        }
                    });

                } else {
                    // Default preferences already generated.
                    // Just go about opening both the files.
                    _openPrefFilesInSplitView(prefsPath, defaultPrefsPath, deferredPromise);
                }
            } else {

                // The default prefs file does not exist at all.
                // So go about recreating the default preferences
                // file.
                var _prefsString = _getDefaultPreferencesString();
                FileUtils.writeText(file, _prefsString, true)
                    .done(function () {
                        recomputeDefaultPrefs = false;
                        _openPrefFilesInSplitView(prefsPath, defaultPrefsPath, deferredPromise);
                    }).fail(function (error) {
                        // Give a chance for default preferences command.
                        console.error("Unable to write to default preferences file! error code:" + error);
                        _executeDefaultOpenPrefsCommand();
                    });
            }
        });
    }

    function handleOpenPrefsInSplitView() {

        var fullPath        = PreferencesManager.getUserPrefFile(),
            file            = FileSystem.getFileForPath(fullPath),
            splitViewPrefOn = prefs.get("openPrefsInSplitView"),
            result          = new $.Deferred();

        if (!splitViewPrefOn) {
            return CommandManager.execute(Commands.FILE_OPEN_PREFERENCES);
        }
        file.exists(function (err, doesExist) {
            if (doesExist) {
                _loadDefaultPrefs(fullPath, result);
            } else {
                FileUtils.writeText(file, "", true)
                        .done(function () {
                            _loadDefaultPrefs(fullPath, result);
                        }).fail(function () {
                            result.reject();
                        });
            }
        });


        return result.promise();
    }

    function _updateLogToConsoleMenuItemChecked() {
        const isLogging = window.setupLogging();
        CommandManager.get(DEBUG_ENABLE_LOGGING).setChecked(isLogging);
        CommandManager.get(DEBUG_LIVE_PREVIEW_LOGGING).setEnabled(isLogging);
        logger.loggingOptions.logLivePreview = window.isLoggingEnabled(LOG_LIVE_PREVIEW_KEY);
        CommandManager.get(DEBUG_LIVE_PREVIEW_LOGGING).setChecked(logger.loggingOptions.logLivePreview);
        CommandManager.get(DEBUG_ENABLE_PHNODE_INSPECTOR).setChecked(NodeConnector.isInspectEnabled());
    }

    function _handleLogging() {
        window.toggleLoggingKey(LOG_TO_CONSOLE_KEY);
        _updateLogToConsoleMenuItemChecked();
    }

    function _handlePhNodeInspectEnable() {
        NodeConnector.setInspectEnabled(!NodeConnector.isInspectEnabled());
        _updateLogToConsoleMenuItemChecked();
    }

    function _handleGetPhNodeInspectURL() {
        Dialogs.showInfoDialog(Strings.CMD_GET_PHNODE_INSPECTOR_URL,
            `<div id="instructions">
  <p>
    1. Go to <a href="chrome://inspect/" target="_blank">chrome://inspect/#devices</a>
    <button onclick="Phoenix.app.copyToClipboard('chrome://inspect/')">
      <i class="fas fa-copy"></i> Copy
    </button>
  </p>
  <p>2. Select Option 'Open dedicated DevTools for Node'</p>
  <p>
    3. Use the URL in connection tab'<code>localhost:${NodeConnector.getInspectPort()}</code>'
    <button onclick="Phoenix.app.copyToClipboard('localhost:${NodeConnector.getInspectPort()}')">
      <i class="fas fa-copy"></i> Copy
    </button>
  </p>
</div>`);
    }

    function _handleLivePreviewLogging() {
        window.toggleLoggingKey(LOG_LIVE_PREVIEW_KEY);
        _updateLogToConsoleMenuItemChecked();
    }

    ExtensionManager.on("statusChange", function (id) {
        // Seems like an extension(s) got installed.
        // Need to recompute the default prefs.
        recomputeDefaultPrefs = true;
    });

    function _openVFS() {
        ProjectManager.openProject("/");
    }

    function _openExtensionsFolder() {
        Phoenix.app.openPathInFileBrowser(ExtensionLoader.getUserExtensionPath());
    }

    function _openVirtualServer() {
        const virtualServingURL = Phoenix.VFS.getVirtualServingURLForPath("/");
        if(!virtualServingURL) {
            throw new Error("Unable to find virtual server!");
        }
        Phoenix.app.openURLInPhoenixWindow(virtualServingURL, {
            preferTabs: true
        });
    }

    function _handleShowDeveloperTools() {
        brackets.app.toggleDevtools();
    }

    /* Register all the command handlers */
    let loadOrReloadString = extensionDevelopment.isProjectLoadedAsExtension() ?
        Strings.CMD_RELOAD_CURRENT_EXTENSION : Strings.CMD_LOAD_CURRENT_EXTENSION;
    CommandManager.register(loadOrReloadString,     DEBUG_LOAD_CURRENT_EXTENSION,
        extensionDevelopment.loadCurrentExtension);
    CommandManager.register(Strings.CMD_UNLOAD_CURRENT_EXTENSION,     DEBUG_UNLOAD_CURRENT_EXTENSION,
        extensionDevelopment.unloadCurrentExtension);
    CommandManager.register(Strings.CMD_REFRESH_WINDOW,             DEBUG_REFRESH_WINDOW,           handleReload);
    CommandManager.register(Strings.CMD_RELOAD_WITHOUT_USER_EXTS,   DEBUG_RELOAD_WITHOUT_USER_EXTS, handleReloadWithoutUserExts);

    // Start with the "Run Tests" item disabled. It will be enabled later if the test file can be found.
    CommandManager.register(Strings.CMD_RUN_UNIT_TESTS,       DEBUG_RUN_UNIT_TESTS,         _runUnitTests);

    CommandManager.register(Strings.CMD_SHOW_PERF_DATA,            DEBUG_SHOW_PERF_DATA,            handleShowPerfData);

    let switchLanguageStr = Strings.CMD_SWITCH_LANGUAGE === "Switch Language\u2026" ?
        Strings.CMD_SWITCH_LANGUAGE :
        `${Strings.CMD_SWITCH_LANGUAGE} (Switch Language)`;
    CommandManager.register(switchLanguageStr,           DEBUG_SWITCH_LANGUAGE,           handleSwitchLanguage);

    CommandManager.register(Strings.CMD_ENABLE_LOGGING, DEBUG_ENABLE_LOGGING,   _handleLogging);
    CommandManager.register(Strings.CMD_ENABLE_PHNODE_INSPECTOR, DEBUG_ENABLE_PHNODE_INSPECTOR, _handlePhNodeInspectEnable);
    CommandManager.register(Strings.CMD_GET_PHNODE_INSPECTOR_URL, DEBUG_GET_PHNODE_INSPECTOR_URL, _handleGetPhNodeInspectURL);
    CommandManager.register(Strings.CMD_ENABLE_LIVE_PREVIEW_LOGS, DEBUG_LIVE_PREVIEW_LOGGING, _handleLivePreviewLogging);
    CommandManager.register(Strings.CMD_OPEN_VFS, DEBUG_OPEN_VFS,   _openVFS);
    CommandManager.register(Strings.CMD_OPEN_EXTENSIONS_FOLDER, DEBUG_OPEN_EXTENSION_FOLDER,   _openExtensionsFolder);
    CommandManager.register(Strings.CMD_OPEN_VIRTUAL_SERVER, DEBUG_OPEN_VIRTUAL_SERVER,   _openVirtualServer);

    CommandManager.register(Strings.CMD_OPEN_PREFERENCES, DEBUG_OPEN_PREFERENCES_IN_SPLIT_VIEW, handleOpenPrefsInSplitView);
    const debugMenu = Menus.getMenu(Menus.AppMenuBar.DEBUG_MENU);
    debugMenu.addMenuItem(DEBUG_REFRESH_WINDOW, window.debugMode ? KeyboardPrefs.refreshWindow : undefined);
    debugMenu.addMenuItem(DEBUG_RELOAD_WITHOUT_USER_EXTS, window.debugMode ? KeyboardPrefs.reloadWithoutUserExts : undefined);
    debugMenu.addMenuItem(DEBUG_LOAD_CURRENT_EXTENSION);
    debugMenu.addMenuItem(DEBUG_UNLOAD_CURRENT_EXTENSION, undefined, undefined, undefined, {
        hideWhenCommandDisabled: true
    });
    debugMenu.addMenuItem(DEBUG_OPEN_EXTENSION_FOLDER, undefined, undefined, undefined, {
        hideWhenCommandDisabled: true
    });
    debugMenu.addMenuDivider();
    // Show Developer Tools (optionally enabled)
    if(Phoenix.isNativeApp){
        CommandManager.register(Strings.CMD_SHOW_DEV_TOOLS, DEBUG_SHOW_DEVELOPER_TOOLS, _handleShowDeveloperTools);
        debugMenu.addMenuItem(DEBUG_SHOW_DEVELOPER_TOOLS, KeyboardPrefs.showDeveloperTools);
    }
    // this command is defined in core, but exposed only in Debug menu for now
    debugMenu.addMenuItem(Commands.FILE_OPEN_KEYMAP, null);
    const diagnosticsSubmenu = debugMenu.addSubMenu(Strings.CMD_DIAGNOSTIC_TOOLS, DIAGNOSTICS_SUBMENU);
    diagnosticsSubmenu.addMenuItem(DEBUG_RUN_UNIT_TESTS);
    diagnosticsSubmenu.addMenuDivider();
    diagnosticsSubmenu.addMenuItem(DEBUG_ENABLE_LOGGING);
    diagnosticsSubmenu.addMenuItem(DEBUG_ENABLE_PHNODE_INSPECTOR, undefined, undefined, undefined, {
        hideWhenCommandDisabled: true
    });
    diagnosticsSubmenu.addMenuItem(DEBUG_GET_PHNODE_INSPECTOR_URL, undefined, undefined, undefined, {
        hideWhenCommandDisabled: true
    });
    diagnosticsSubmenu.addMenuItem(DEBUG_LIVE_PREVIEW_LOGGING);
    diagnosticsSubmenu.addMenuDivider();
    diagnosticsSubmenu.addMenuItem(DEBUG_SHOW_PERF_DATA);
    diagnosticsSubmenu.addMenuItem(DEBUG_OPEN_VFS);
    diagnosticsSubmenu.addMenuItem(DEBUG_OPEN_VIRTUAL_SERVER, undefined, undefined, undefined, {
        hideWhenCommandDisabled: true
    });

    if(Phoenix.isNativeApp && Phoenix.platform === "linux") {
        // there is only one experimental feature- drag and drop available in native linux apps only.
        const experimentalSubmenu = debugMenu.addSubMenu(Strings.CMD_EXPERIMENTAL_FEATURES, EXPERIMENTAL_FEATURES_SUB_MENU);
        CommandManager.register(Strings.CMD_ENABLE_DRAG_AND_DROP, DEBUG_DRAG_AND_DROP, ()=>{
            PreferencesManager.set(DragAndDrop._PREF_DRAG_AND_DROP,
                !PreferencesManager.get(DragAndDrop._PREF_DRAG_AND_DROP));
        });
        PreferencesManager.on("change", DragAndDrop._PREF_DRAG_AND_DROP, function () {
            CommandManager.get(DEBUG_DRAG_AND_DROP).setChecked(PreferencesManager.get(DragAndDrop._PREF_DRAG_AND_DROP));
        });
        experimentalSubmenu.addMenuItem(DEBUG_DRAG_AND_DROP);
    }

    CommandManager.get(DEBUG_UNLOAD_CURRENT_EXTENSION)
        .setEnabled(extensionDevelopment.isProjectLoadedAsExtension());
    CommandManager.get(DEBUG_OPEN_EXTENSION_FOLDER)
        .setEnabled(Phoenix.isNativeApp); // only show in tauri
    CommandManager.get(DEBUG_ENABLE_PHNODE_INSPECTOR)
        .setEnabled(Phoenix.isNativeApp); // only show in tauri
    CommandManager.get(DEBUG_GET_PHNODE_INSPECTOR_URL)
        .setEnabled(Phoenix.isNativeApp); // only show in tauri
    CommandManager.get(DEBUG_OPEN_VIRTUAL_SERVER)
        .setEnabled(!Phoenix.isNativeApp); // don't show in tauri as there is no virtual server in tauri

    _updateLogToConsoleMenuItemChecked();

    const helpMenu = Menus.getMenu(Menus.AppMenuBar.HELP_MENU);
    helpMenu.addMenuItem(DEBUG_SWITCH_LANGUAGE, "", Menus.BEFORE, Commands.HELP_YOUTUBE);
    helpMenu.addMenuDivider(Menus.AFTER, DEBUG_SWITCH_LANGUAGE);

    const fileMenu = Menus.getMenu(Menus.AppMenuBar.FILE_MENU);
    // this command will enable defaultPreferences and brackets preferences to be open side by side in split view.
    fileMenu.addMenuItem(DEBUG_OPEN_PREFERENCES_IN_SPLIT_VIEW, null, Menus.BEFORE, Menus.MenuSection.FILE_SETTINGS.sectionMarker);

    // exposed for convenience, but not official API
    exports._runUnitTests = _runUnitTests;
});
