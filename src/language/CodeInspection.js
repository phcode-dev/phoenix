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

/*global jsPromise, path*/

/**
 * Manages linters and other code inspections on a per-language basis. Provides a UI and status indicator for
 * the resulting errors/warnings.
 *
 * Currently, inspection providers are only invoked on the current file and only when it is opened, switched to,
 * or saved. But in the future, inspectors may be invoked as part of a global scan, at intervals while typing, etc.
 * Currently, results are only displayed in a bottom panel list and in a status bar icon. But in the future,
 * results may also be displayed inline in the editor (as gutter markers, etc.).
 * In the future, support may also be added for error/warning providers that cannot process a single file at a time
 * (e.g. a full-project compiler).
 */
define(function (require, exports, module) {


    const _ = require("thirdparty/lodash");

    // Load dependent modules
    const Commands                = require("command/Commands"),
        WorkspaceManager        = require("view/WorkspaceManager"),
        CommandManager          = require("command/CommandManager"),
        DocumentManager         = require("document/DocumentManager"),
        EditorManager           = require("editor/EditorManager"),
        Dialogs                 = require("widgets/Dialogs"),
        Editor                  = require("editor/Editor").Editor,
        MainViewManager         = require("view/MainViewManager"),
        LanguageManager         = require("language/LanguageManager"),
        PreferencesManager      = require("preferences/PreferencesManager"),
        PerfUtils               = require("utils/PerfUtils"),
        Strings                 = require("strings"),
        StringUtils             = require("utils/StringUtils"),
        AppInit                 = require("utils/AppInit"),
        StatusBar               = require("widgets/StatusBar"),
        Async                   = require("utils/Async"),
        PanelTemplate           = require("text!htmlContent/problems-panel.html"),
        ResultsTemplate         = require("text!htmlContent/problems-panel-table.html"),
        Mustache                = require("thirdparty/mustache/mustache"),
        QuickViewManager  = require("features/QuickViewManager"),
        Metrics           = require("utils/Metrics");

    const CODE_INSPECTION_GUTTER_PRIORITY      = 500,
        CODE_INSPECTION_GUTTER = "code-inspection-gutter";

    const EDIT_ORIGIN_LINT_FIX = "lint_fix";

    const INDICATOR_ID = "status-inspection";

    /** Values for problem's 'type' property */
    const Type = {
        /** Unambiguous error, such as a syntax error */
        ERROR: "error",
        /** Maintainability issue, probable error / bad smell, etc. */
        WARNING: "warning",
        /** Inspector unable to continue, code too complex for static analysis, etc. Not counted in err/warn tally. */
        META: "meta"
    };

    function _getIconClassForType(type, isFixable) {
        switch (type) {
        case Type.ERROR: return isFixable ?
            "line-icon-problem_type_error fa-solid fa-wrench":
            "line-icon-problem_type_error fa-solid fa-times-circle";
        case Type.WARNING: return isFixable ?
            "line-icon-problem_type_warning fa-solid fa-wrench":
            "line-icon-problem_type_warning fa-solid fa-exclamation-triangle";
        case Type.META: return isFixable ?
            "line-icon-problem_type_info fa-solid fa-wrench":
            "line-icon-problem_type_info fa-solid fa-info-circle";
        default: return isFixable ?
            "line-icon-problem_type_info fa-solid fa-wrench":
            "line-icon-problem_type_info fa-solid fa-info-circle";
        }
    }

    const CODE_MARK_TYPE_INSPECTOR = "codeInspector";

    /**
     * Constants for the preferences defined in this file.
     */
    const PREF_ENABLED            = "enabled",
        PREF_COLLAPSED          = "collapsed",
        PREF_ASYNC_TIMEOUT      = "asyncTimeout",
        PREF_PREFER_PROVIDERS   = "prefer",
        PREF_PREFERRED_ONLY     = "usePreferredOnly";

    const prefs = PreferencesManager.getExtensionPrefs("linting");

    /**
     * When disabled, the errors panel is closed and the status bar icon is grayed out.
     * Takes precedence over _collapsed.
     * @private
     * @type {boolean}
     */
    var _enabled = false;

    /**
     * When collapsed, the errors panel is closed but the status bar icon is kept up to date.
     * @private
     * @type {boolean}
     */
    var _collapsed = false;

    /**
     * @private
     * @type {$.Element}
     */
    var $problemsPanel;

    let $fixAllBtn;

    /**
     * @private the panelView
     * @type {Panel}
     */
    var problemsPanel;

    /**
     * @private
     * @type {$.Element}
     */
    var $problemsPanelTable;

    /**
     * @private
     * @type {boolean}
     */
    var _gotoEnabled = false;

    /**
     * @private
     * @type {{languageId:string, Array.<{name:string, scanFileAsync:?function(string, string):!{$.Promise}, scanFile:?function(string, string):Object}>}}
     */
    var _providers = {};

    /**
     * @private
     * @type
     */
    let _registeredLanguageIDs = [];

    /**
     * @private
     * @type {boolean}
     */
    var _hasErrors;

    /**
     * Promise of the returned by the last call to inspectFile or null if linting is disabled. Used to prevent any stale promises
     * to cause updates of the UI.
     *
     * @private
     * @type {$.Promise}
     */
    var _currentPromise = null;

    /**
     * Enable or disable the "Go to First Error" command
     * @param {boolean} gotoEnabled Whether it is enabled.
     */
    function setGotoEnabled(gotoEnabled) {
        CommandManager.get(Commands.NAVIGATE_GOTO_FIRST_PROBLEM).setEnabled(gotoEnabled);
        CommandManager.get(Commands.NAVIGATE_GOTO_NEXT_PROBLEM).setEnabled(gotoEnabled);
        CommandManager.get(Commands.NAVIGATE_GOTO_PREV_PROBLEM).setEnabled(gotoEnabled);
        _gotoEnabled = gotoEnabled;
    }

    function _unregisterAll() {
        _providers = {};
    }

    /**
     * Returns a list of provider for given file path, if available.
     * Decision is made depending on the file extension.
     *
     * @param {!string} filePath
     * @return {Array.<{name:string, scanFileAsync:?function(string, string):!{$.Promise}, scanFile:?function(string, string):?{errors:!Array, aborted:boolean}}>}
     */
    function getProvidersForPath(filePath) {
        var language            = LanguageManager.getLanguageForPath(filePath).getId(),
            context             = PreferencesManager._buildContext(filePath, language),
            installedProviders  = getProvidersForLanguageId(language),
            preferredProviders,

            prefPreferredProviderNames  = prefs.get(PREF_PREFER_PROVIDERS, context),
            prefPreferredOnly           = prefs.get(PREF_PREFERRED_ONLY, context),

            providers;

        if (prefPreferredProviderNames && prefPreferredProviderNames.length) {
            if (typeof prefPreferredProviderNames === "string") {
                prefPreferredProviderNames = [prefPreferredProviderNames];
            }
            preferredProviders = prefPreferredProviderNames.reduce(function (result, key) {
                var provider = _.find(installedProviders, {name: key});
                if (provider) {
                    result.push(provider);
                }
                return result;
            }, []);
            if (prefPreferredOnly) {
                providers = preferredProviders;
            } else {
                providers = _.union(preferredProviders, installedProviders);
            }
        } else {
            providers = installedProviders;
        }
        return providers;
    }

    /**
     * Returns an array of the IDs of providers registered for a specific language
     *
     * @param {!string} languageId
     * @return {Array.<string>} Names of registered providers.
     */
    function getProviderIDsForLanguage(languageId) {
        if (!_providers[languageId]) {
            return [];
        }
        return _providers[languageId].map(function (provider) {
            return provider.name;
        });
    }

    /**
     * Runs a file inspection over passed file. Uses the given list of providers if specified, otherwise uses
     * the set of providers that are registered for the file's language.
     * This method doesn't update the Brackets UI, just provides inspection results.
     * These results will reflect any unsaved changes present in the file if currently open.
     *
     * The Promise yields an array of provider-result pair objects (the result is the return value of the
     * provider's scanFile() - see register() for details). The result object may be null if there were no
     * errors from that provider.
     * If there are no providers registered for this file, the Promise yields null instead.
     *
     * @param {!File} file File that will be inspected for errors.
     * @param {?Array.<{name:string, scanFileAsync:?function(string, string):!{$.Promise}, scanFile:?function(string, string):?{errors:!Array, aborted:boolean}}>} providerList
     * @return {$.Promise} a jQuery promise that will be resolved with ?Array.<{provider:Object, result: ?{errors:!Array, aborted:boolean}}>
     */
    function inspectFile(file, providerList) {
        var response = new $.Deferred(),
            results = [];

        providerList = providerList || getProvidersForPath(file.fullPath);

        if (!providerList.length) {
            response.resolve(null);
            return response.promise();
        }

        providerList = providerList.filter(function (provider) {
            return !provider.canInspect || provider.canInspect(file.fullPath);
        });

        DocumentManager.getDocumentText(file)
            .done(function (fileText) {
                var perfTimerInspector = PerfUtils.markStart("CodeInspection:\t" + file.fullPath),
                    masterPromise;

                masterPromise = Async.doInParallel(providerList, function (provider) {
                    var perfTimerProvider = PerfUtils.markStart("CodeInspection '" + provider.name + "':\t" + file.fullPath),
                        runPromise = new $.Deferred();

                    runPromise.done(function (scanResult) {
                        results.push({provider: provider, result: scanResult});
                    });

                    if (provider.scanFileAsync) {
                        window.setTimeout(function () {
                            // timeout error
                            var errTimeout = {
                                pos: { line: -1, col: 0},
                                message: StringUtils.format(Strings.LINTER_TIMED_OUT, provider.name, prefs.get(PREF_ASYNC_TIMEOUT)),
                                type: Type.ERROR
                            };
                            runPromise.resolve({errors: [errTimeout]});
                        }, prefs.get(PREF_ASYNC_TIMEOUT));
                        jsPromise(provider.scanFileAsync(fileText, file.fullPath))
                            .then(function (scanResult) {
                                PerfUtils.addMeasurement(perfTimerProvider);
                                runPromise.resolve(scanResult);
                            })
                            .catch(function (err) {
                                err = err || new Error("Unknown error while inspecting "+ file.fullPath);
                                PerfUtils.finalizeMeasurement(perfTimerProvider);
                                var errError = {
                                    pos: {line: -1, col: 0},
                                    message: StringUtils.format(Strings.LINTER_FAILED, provider.name, err),
                                    type: Type.ERROR
                                };
                                console.error("[CodeInspection] Provider " + provider.name + " (async) failed: " + err.stack);
                                runPromise.resolve({errors: [errError]});
                            });
                    } else {
                        try {
                            var scanResult = provider.scanFile(fileText, file.fullPath);
                            PerfUtils.addMeasurement(perfTimerProvider);
                            runPromise.resolve(scanResult);
                        } catch (err) {
                            PerfUtils.finalizeMeasurement(perfTimerProvider);
                            var errError = {
                                pos: {line: -1, col: 0},
                                message: StringUtils.format(Strings.LINTER_FAILED, provider.name, err),
                                type: Type.ERROR
                            };
                            console.error("[CodeInspection] Provider " + provider.name +
                                " (sync) threw an error: " + err && (err.stack || err));
                            runPromise.resolve({errors: [errError]});
                        }
                    }
                    return runPromise.promise();

                }, false);

                masterPromise.then(function () {
                    // sync async may have pushed results in different order, restore the original order
                    results.sort(function (a, b) {
                        return providerList.indexOf(a.provider) - providerList.indexOf(b.provider);
                    });
                    PerfUtils.addMeasurement(perfTimerInspector);
                    response.resolve(results);
                });

            })
            .fail(function (err) {
                console.error("[CodeInspection] Could not read file for inspection: " + file.fullPath);
                response.reject(err);
            });

        return response.promise();
    }

    /**
     * Update the title of the problem panel and the tooltip of the status bar icon. The title and the tooltip will
     * change based on the number of problems reported and how many provider reported problems.
     *
     * @param {Number} numProblems - total number of problems across all providers
     * @param {Array.<{name:string, scanFileAsync:?function(string, string):!{$.Promise}, scanFile:?function(string, string):Object}>} providersReportingProblems - providers that reported problems
     * @param {boolean} aborted - true if any provider returned a result with the 'aborted' flag set
     * @param fileName
     */
    function updatePanelTitleAndStatusBar(numProblems, providersReportingProblems, aborted, fileName) {
        $fixAllBtn.addClass("forced-hidden");
        var message, tooltip;

        if (providersReportingProblems.length === 1) {
            // don't show a header if there is only one provider available for this file type
            $problemsPanelTable.find(".inspector-section").hide();
            $problemsPanelTable.find("tr").removeClass("forced-hidden");

            if (numProblems === 1 && !aborted) {
                message = documentFixes.size ?
                    StringUtils.format(Strings.SINGLE_ERROR_FIXABLE, providersReportingProblems[0].name,
                        documentFixes.size, fileName):
                    StringUtils.format(Strings.SINGLE_ERROR, providersReportingProblems[0].name, fileName);
            } else {
                if (aborted) {
                    numProblems += "+";
                }

                message = documentFixes.size ?
                    StringUtils.format(Strings.MULTIPLE_ERRORS_FIXABLE, numProblems,
                        providersReportingProblems[0].name, documentFixes.size, fileName):
                    StringUtils.format(Strings.MULTIPLE_ERRORS, numProblems,
                        providersReportingProblems[0].name, fileName);
            }
        } else if (providersReportingProblems.length > 1) {
            $problemsPanelTable.find(".inspector-section").show();

            if (aborted) {
                numProblems += "+";
            }

            message = documentFixes.size ?
                StringUtils.format(Strings.ERRORS_PANEL_TITLE_MULTIPLE_FIXABLE, numProblems,
                    documentFixes.size, fileName):
                StringUtils.format(Strings.ERRORS_PANEL_TITLE_MULTIPLE, numProblems, fileName);
        } else {
            return;
        }

        $problemsPanel.find(".title").text(message);
        tooltip = StringUtils.format(Strings.STATUSBAR_CODE_INSPECTION_TOOLTIP, message);
        let iconType = "inspection-errors";
        if(documentFixes.size){
            iconType =  "inspection-repair";
            $fixAllBtn.removeClass("forced-hidden");
        }

        StatusBar.updateIndicator(INDICATOR_ID, true, iconType, tooltip);
    }

    function _getMarkOptions(error){
        switch (error.type) {
        case Type.ERROR: return Editor.getMarkOptionUnderlineError();
        case Type.WARNING: return Editor.getMarkOptionUnderlineWarn();
        case Type.META: return Editor.getMarkOptionUnderlineInfo();
        }
    }

    function _getMarkTypePriority(type){
        switch (type) {
        case Type.ERROR: return 3;
        case Type.WARNING: return 2;
        case Type.META: return 1;
        }
    }

    function _shouldMarkTokenAtPosition(editor, error) {
        if(isNaN(error.pos.line) || isNaN(error.pos.ch) || error.pos.line < 0 || error.pos.ch < 0){
            console.warn("CodeInspector: Invalid error position: ", error);
            return false;
        }
        return true;
    }

    /**
     * It creates a div element with a span element inside it, and then adds a click handler to move cursor to the
     * error position.
     * @param editor - the editor instance
     * @param line - the line number of the error
     * @param ch - the character position of the error
     * @param type - The type of the marker. This is a string that can be one of the error types
     * @param message - The message that will be displayed when you hover over the marker.
     * @param isFixable - true if we need to use the fix icon
     * @returns A DOM element.
     */
    function _createMarkerElement(editor, line, ch, type, message, isFixable) {
        let $marker = $('<div><span>')
            .attr('title', (message || "").trim())
            .addClass(CODE_INSPECTION_GUTTER);
        $marker.click(function (){
            editor.setCursorPos(line, ch);
            toggleCollapsed(false);
            scrollToProblem(line);
        });
        $marker.find('span')
            .addClass(_getIconClassForType(type, isFixable))
            .addClass("brackets-inspection-gutter-marker")
            .html('&nbsp;');
        return $marker[0];
    }

    /**
     * We have to draw empty gutter markers if it doesnt exist, else there is a visual gap in the gutter when
     * codemirror renders gutter with lines having no gutter icons
     * @param editor
     * @param line
     * @private
     */
    function _addDummyGutterMarkerIfNotExist(editor, line) {
        let marker = editor.getGutterMarker(line, CODE_INSPECTION_GUTTER);
        if(!marker){
            let $marker = $('<div>')
                .addClass(CODE_INSPECTION_GUTTER);
            editor.setGutterMarker(line, CODE_INSPECTION_GUTTER, $marker[0]);
        }
    }

    function _populateDummyGutterElements(editor, from, to) {
        for(let line=from; line <= to; line++) {
            _addDummyGutterMarkerIfNotExist(editor, line);
        }
    }

    function _updateGutterMarks(editor, gutterErrorMessages) {
        // add gutter icons
        for(let lineno of Object.keys(gutterErrorMessages)){
            // We mark the line with the Highest priority icon. (Eg. error icon if same line has warnings and info)
            let highestPriorityMarkTypeSeen = Type.META;
            let fixableMarkFound = false;
            let gutterMessage = gutterErrorMessages[lineno].reduce((prev, current)=>{
                if(current.fixable || prev.fixable){
                    fixableMarkFound = true;
                }
                if(_getMarkTypePriority(current.type) > _getMarkTypePriority(highestPriorityMarkTypeSeen)){
                    highestPriorityMarkTypeSeen = current.type;
                }
                return {message: `${prev.message}\n${current.message} at column: ${current.ch+1}`};
            }, {message: ''});
            let line = gutterErrorMessages[lineno][0].line,
                ch = gutterErrorMessages[lineno][0].ch,
                message = gutterMessage.message;
            let marker = _createMarkerElement(editor, line, ch, highestPriorityMarkTypeSeen, message, fixableMarkFound);
            editor.setGutterMarker(line, CODE_INSPECTION_GUTTER, marker);
        }
        _populateDummyGutterElements(editor, 0, editor.getLastVisibleLine());
    }

    function _editorVieportChangeHandler(_evt, editor, from, to) {
        if(gutterRegistrationInProgress){
            if(editor.gutterViewportChangeTimer){
                clearTimeout(editor.gutterViewportChangeTimer);
            }
            editor.gutterViewportChangeTimer = setTimeout(()=>{
                const vp = editor.getViewport();
                _editorVieportChangeHandler(_evt, editor, vp.from, vp.to);
                clearTimeout(editor.gutterViewportChangeTimer);
                delete editor.gutterViewportChangeTimer;
            });
            return;
        }
        _populateDummyGutterElements(editor, from, to);
    }

    function scrollToProblem(lineNumber) {
        const $lineElement = $problemsPanelTable.find('td.line-number[data-line="' + lineNumber + '"]');
        if ($lineElement.length) {
            $lineElement[0].scrollIntoView({ behavior: 'instant', block: 'start' });
            return $($lineElement[0]).parent();
        }
        return null;
    }


    function getQuickView(editor, pos, token, line) {
        return new Promise((resolve, reject)=>{
            let codeInspectionMarks = editor.findMarksAt(pos, CODE_MARK_TYPE_INSPECTOR) || [];
            let $hoverMessage = $(`<div class="code-inspection-item"></div>`);
            let quickViewPresent;
            let startPos = {line: pos.line, ch: token.start},
                endPos = {line: pos.line, ch: token.end};
            for(let mark of codeInspectionMarks){
                let $problemView;
                quickViewPresent = true;
                const fixID = `${mark.metadata}`;
                let errorMessageHTML = `<a style="cursor:pointer;color: unset;">${_.escape(mark.message)}</a>`;
                if(documentFixes.get(fixID)){
                    $problemView = $(`<div class="code-inspection-quick-view-item">
                        <i title="${Strings.CLICK_VIEW_PROBLEM}" style="margin-right: 3px;cursor: pointer;"
                            class="${_getIconClassForType(mark.type, mark.isFixable)}"></i>
                        <button class="btn btn-mini fix-problem-btn" style="margin-right: 5px;">${Strings.FIX}</button>
                        ${errorMessageHTML}
                        <button class="btn btn-mini copy-qv-error-text-btn" title="${Strings.COPY_ERROR}">
                            <i class="fas fa-copy copy-qv-error-text-btn"></i>
                        </button>
                        <br/>
                    </div>`);
                    $problemView.find(".fix-problem-btn").click(()=>{
                        Metrics.countEvent(Metrics.EVENT_TYPE.LINT, "fixClick", "quickView");
                        scrollToProblem(pos.line);
                        _fixProblem(fixID);
                    });
                    $hoverMessage.append($problemView);
                } else {
                    $problemView = $(`<div class="code-inspection-quick-view-item">
                        <i title="${Strings.CLICK_VIEW_PROBLEM}" style="margin-right: 5px; cursor: pointer;"
                            class="${_getIconClassForType(mark.type, mark.isFixable)}"></i>
                        ${errorMessageHTML}
                        <button class="btn btn-mini copy-qv-error-text-btn" title="${Strings.COPY_ERROR}">
                            <i class="fas fa-copy copy-qv-error-text-btn"></i>
                        </button>
                        <br/></div>`);
                    $hoverMessage.append($problemView);
                }
                $problemView.click(function () {
                    const selection = window.getSelection();
                    if(selection && selection.rangeCount > 0 && !selection.isCollapsed) {
                        // the user may be trying to select text from the error in quick view, in which case we
                        // shouldnt open the problems panel
                        return;
                    }
                    toggleCollapsed(false);
                    scrollToProblem(pos.line);
                    // todo strobe effect
                });
                $problemView.find(".copy-qv-error-text-btn").click(function (evt) {
                    evt.preventDefault();
                    evt.stopPropagation();
                    Phoenix.app.copyToClipboard(mark.message);
                });
                const markPos = mark.find();
                if(markPos.from && markPos.from.line < startPos.line){
                    startPos.line = markPos.from.line;
                }
                if(markPos.from && markPos.from.ch < startPos.ch){
                    startPos.ch = markPos.from.ch;
                }
                if(markPos.to && markPos.to.line > endPos.line){
                    endPos.line = markPos.to.line;
                }
                if(markPos.to && markPos.to.ch > endPos.ch){
                    endPos.ch = markPos.to.ch;
                }
            }
            if(quickViewPresent){
                Metrics.countEvent(Metrics.EVENT_TYPE.LINT, "quickView", "shown");
                resolve({
                    start: startPos,
                    end: endPos,
                    content: $hoverMessage
                });
                return;
            }
            reject();
        });
    }

    let fixIDCounter = 1;
    let documentFixes = new Map(), lastDocumentScanTimeStamp;
    function _registerNewFix(editor, fix, providerName, maxOffset) {
        if(!editor || !fix || !fix.rangeOffset) {
            return null;
        }
        if(editor.document.lastChangeTimestamp !== lastDocumentScanTimeStamp){
            // the document changed from the last time the fixes where registered, we have to
            // invalidate all existing fixes in that case.
            lastDocumentScanTimeStamp = editor.document.lastChangeTimestamp;
            documentFixes.clear();
        }
        if(_isInvalidFix(fix, maxOffset)){
            return null;
        }
        fixIDCounter++;
        fix.providerName = providerName;
        documentFixes.set(`${fixIDCounter}`, fix);
        return fixIDCounter;
    }

    /**
     * Adds gutter icons and squiggly lines under err/warn/info to editor after lint.
     * also updates  the passed in resultProviderEntries with fixes that can be applied.
     * @param resultProviderEntries
     * @private
     */
    function _updateEditorMarksAndFixResults(resultProviderEntries) {
        let editor = EditorManager.getCurrentFullEditor();
        if(!(editor && resultProviderEntries && resultProviderEntries.length)) {
            return;
        }
        const maxOffset = editor.document.getText().length;
        editor.operation(function () {
            editor.off("viewportChange.codeInspection");
            editor.on("viewportChange.codeInspection", _editorVieportChangeHandler);
            let gutterErrorMessages = {};
            for (let resultProvider of resultProviderEntries) {
                let errors = (resultProvider.result && resultProvider.result.errors) || [];
                for (let error of errors) {
                    let line = error.pos.line || 0;
                    let ch = error.pos.ch || 0;
                    let fixable = false;
                    // add squiggly lines
                    if (_shouldMarkTokenAtPosition(editor, error)) {
                        let mark;
                        const markOptions = _getMarkOptions(error);
                        const fixID = _registerNewFix(editor, error.fix, resultProvider.provider.name, maxOffset);
                        if(fixID) {
                            markOptions.metadata = fixID;
                            markOptions.isFixable = true;
                            error.fix.id = fixID;
                            fixable = true;
                        }
                        if(error.endPos && !editor.isSamePosition(error.pos, error.endPos)) {
                            mark = editor.markText(CODE_MARK_TYPE_INSPECTOR, error.pos, error.endPos, markOptions);
                        } else {
                            mark = editor.markToken(CODE_MARK_TYPE_INSPECTOR, error.pos, markOptions);
                        }
                        mark.type = error.type;
                        mark.message = error.message;
                    }
                    let gutterMessage = gutterErrorMessages[line] || [];
                    gutterMessage.push({message: error.message, type: error.type, fixable, line, ch});
                    gutterErrorMessages[line] = gutterMessage;
                }
            }
            _updateGutterMarks(editor, gutterErrorMessages);
        });
    }

    const scrollPositionMap = new Map();

    function _noProviderReturnedResults(currentDoc, fullFilePath) {
        // No provider for current file
        _hasErrors = false;
        _currentPromise = null;
        updatePanelTitleAndStatusBar(0, [], false,
            fullFilePath ? path.basename(fullFilePath) : Strings.ERRORS_NO_FILE);
        if(problemsPanel){
            problemsPanel.hide();
        }
        const language = currentDoc && LanguageManager.getLanguageForPath(currentDoc.file.fullPath);
        if (language) {
            StatusBar.updateIndicator(INDICATOR_ID, true, "inspection-disabled",
                StringUtils.format(Strings.NO_LINT_AVAILABLE, language.getName()));
        } else {
            StatusBar.updateIndicator(INDICATOR_ID, true, "inspection-disabled", Strings.NOTHING_TO_LINT);
        }
        setGotoEnabled(false);
    }

    /**
     * Run inspector applicable to current document. Updates status bar indicator and refreshes error list in
     * bottom panel. Does not run if inspection is disabled or if a providerName is given and does not
     * match the current doc's provider name.
     *
     * @param {?string} providerName name of the provider that is requesting a run
     */
    function run() {
        if(!problemsPanel){
            return;
        }
        if (!_enabled) {
            _hasErrors = false;
            _currentPromise = null;
            problemsPanel.hide();
            StatusBar.updateIndicator(INDICATOR_ID, true, "inspection-disabled", Strings.LINT_DISABLED);
            setGotoEnabled(false);
            return;
        }

        let currentDoc = DocumentManager.getCurrentDocument(),
            providerList = currentDoc && getProvidersForPath(currentDoc.file.fullPath);

        providerList = providerList && providerList.filter(function (provider) {
            return !provider.canInspect || provider.canInspect(currentDoc.file.fullPath);
        });

        let editor = EditorManager.getCurrentFullEditor(), fullFilePath;
        if(editor){
            lastDocumentScanTimeStamp = editor.document.lastChangeTimestamp;
            documentFixes.clear();
            fullFilePath = editor.document.file.fullPath;
        }

        if (providerList && providerList.length) {
            let numProblems = 0,
                aborted = false,
                allErrors = [],
                html,
                providersReportingProblems = [];
            scrollPositionMap.set($problemsPanelTable.lintFilePath || fullFilePath, $problemsPanelTable.scrollTop());

            // run all the providers registered for this file type
            (_currentPromise = inspectFile(currentDoc.file, providerList)).then(function (results) {
                // filter out any ignored results
                results = results.filter(function (providerResult) {
                    return !providerResult.result || !providerResult.result.isIgnored;
                });
                if(!results.length) {
                    _noProviderReturnedResults(currentDoc, fullFilePath);
                    return;
                }
                editor.clearAllMarks(CODE_MARK_TYPE_INSPECTOR);
                editor.clearGutter(CODE_INSPECTION_GUTTER);
                _updateEditorMarksAndFixResults(results);
                // check if promise has not changed while inspectFile was running
                if (this !== _currentPromise) {
                    return;
                }

                // how many errors in total?
                var errors = results.reduce(function (a, item) { return a + (item.result ? item.result.errors.length : 0); }, 0);

                _hasErrors = Boolean(errors);

                if (!errors) {
                    problemsPanel.hide();

                    var message = Strings.NO_ERRORS_MULTIPLE_PROVIDER;
                    if (providerList.length === 1) {
                        message = StringUtils.format(Strings.NO_ERRORS, providerList[0].name);
                    }

                    StatusBar.updateIndicator(INDICATOR_ID, true, "inspection-valid", message);

                    setGotoEnabled(false);
                    return;
                }

                var perfTimerDOM = PerfUtils.markStart("ProblemsPanel render:\t" + currentDoc.file.fullPath);

                // Augment error objects with additional fields needed by Mustache template
                results.forEach(function (inspectionResult) {
                    var provider = inspectionResult.provider;
                    var isExpanded = prefs.get(provider.name + ".collapsed") !== false;

                    if (inspectionResult.result) {
                        inspectionResult.result.errors.forEach(function (error) {
                            // some inspectors don't always provide a line number or report a negative line number
                            if (!isNaN(error.pos.line) &&
                                    (error.pos.line + 1) > 0 &&
                                    (error.codeSnippet = currentDoc.getLine(error.pos.line)) !== undefined) {
                                error.friendlyLine = error.pos.line + 1;
                                error.codeSnippet = error.codeSnippet.substr(0, 175);  // limit snippet width
                            }

                            if (error.type !== Type.META) {
                                numProblems++;
                            }

                            error.iconClass = _getIconClassForType(error.type, error.fix && error.fix.id);

                            // Hide the errors when the provider is collapsed.
                            error.display = isExpanded ? "" : "forced-hidden";
                        });

                        // if the code inspector was unable to process the whole file, we keep track to show a different status
                        if (inspectionResult.result.aborted) {
                            aborted = true;
                        }

                        if (inspectionResult.result.errors.length) {
                            allErrors.push({
                                isExpanded: isExpanded,
                                providerName: provider.name,
                                results: inspectionResult.result.errors
                            });

                            providersReportingProblems.push(provider);
                        }
                    }
                });

                // Update results table
                html = Mustache.render(ResultsTemplate, {Strings: Strings, reportList: allErrors});

                $problemsPanelTable.lintFilePath = fullFilePath;
                $problemsPanelTable
                    .empty()
                    .append(html);  // otherwise scroll pos from previous contents is remembered

                if (!_collapsed) {
                    problemsPanel.show();
                }

                updatePanelTitleAndStatusBar(numProblems, providersReportingProblems, aborted,
                    path.basename(fullFilePath));
                setGotoEnabled(true);

                const scrollPosition = scrollPositionMap.get(fullFilePath) || 0;
                $problemsPanelTable.scrollTop(scrollPosition);
                PerfUtils.addMeasurement(perfTimerDOM);
            });

        } else {
            _noProviderReturnedResults(currentDoc, fullFilePath);
        }
    }

    let gutterRegistrationInProgress = false;

    /**
     * Registers a provider for a specific language to inspect files and provide linting results.
     *
     * The provider is passed the text of the file and its full path. Providers should not assume that
     * the file is open (i.e., `DocumentManager.getOpenDocumentForPath()` may return `null`) or that the
     * file on disk matches the text given (the file may have unsaved changes).
     *
     * Registering any provider for the "javascript" language automatically unregisters the built-in
     * Brackets JSLint provider. This is a temporary convenience until a UI exists for disabling
     * registered providers.
     *
     * Providers must implement `canInspect()`, `scanFile()`, or `scanFileAsync()`. If both `scanFile()`
     * and `scanFileAsync()` are implemented, `scanFile()` is ignored.
     *
     * - `canInspect(fullPath)`: A synchronous call to determine if the file can be scanned by this provider.
     * - `scanFile(text, fullPath)`: A synchronous function returning linting results or `null`.
     * - `scanFileAsync(text, fullPath)`: An asynchronous function returning a jQuery Promise resolved with
     *   the same type of value as `scanFile()`. Rejecting the promise is treated as an internal error in the provider.
     *
     * Each error object in the results should have the following structure:
     *              { pos:{line,ch},
     *                endPos:?{line,ch},
     *                message:string,
     *                htmlMessage:string,
     *                type:?Type ,
     *                fix: { // an optional fix, if present will show the fix button
     *                     replace: "text to replace the offset given below",
     *                     rangeOffset: {
     *                         start: number,
     *                         end: number
     *                }}}
     * @typedef {Object} Error
     * @property {Object} pos - The start position of the error.
     * @property {number} pos.line - The line number (0-based).
     * @property {number} pos.ch - The character position within the line (0-based).
     * @property {?Object} endPos - The end position of the error.
     * @property {number} endPos.line - The end line number (0-based).
     * @property {number} endPos.ch - The end character position within the line (0-based).
     * @property {string} message - The error message to be displayed as text.
     * @property {string} htmlMessage - The error message to be displayed as HTML.
     * @property {?Type} type - The type of the error. Defaults to `Type.WARNING` if unspecified.
     * @property {?Object} fix - An optional fix object.
     * @property {string} fix.replace - The text to replace the error with.
     * @property {Object} fix.rangeOffset - The range within the text to replace.
     * @property {number} fix.rangeOffset.start - The start offset of the range.
     * @property {number} fix.rangeOffset.end - The end offset of the range.
     *
     * If no errors are found, return either `null`(treated as file is problem free) or an object with a
     * zero-length `errors` array. Always use `message` to safely display the error as text. If you want to display HTML
     * error message, then explicitly use `htmlMessage` to display it. Both `message` and `htmlMessage` can
     * be used simultaneously.
     *
     * After scanning the file, if you need to omit the lint result, return or resolve with `{isIgnored: true}`.
     * This prevents the file from being marked with a no errors tick mark in the status bar and excludes the linter
     * from the problems panel.
     *
     * @param {string} languageId - The language ID for which the provider is registered.
     * @param {Object} provider - The provider object.
     * @param {string} provider.name - The name of the provider.
     * @param {?function(string, string): { errors: Array<Error>, aborted: boolean }} provider.scanFile - Synchronous scan function.
     * @param {?function(string, string): jQuery.Promise} provider.scanFileAsync - Asynchronous scan function returning a Promise.
     */
    function register(languageId, provider) {
        if (!_providers[languageId]) {
            _providers[languageId] = [];
        } else {
            // Check if provider with same name exists for the given language
            // If yes, remove the provider before inserting the most recently loaded one
            var indexOfProvider = _.findIndex(_providers[languageId], function(entry) { return entry.name === provider.name; });
            if (indexOfProvider !== -1) {
                _providers[languageId].splice(indexOfProvider, 1);
            }
        }

        _providers[languageId].push(provider);

        if(!_registeredLanguageIDs.includes(languageId)){
            _registeredLanguageIDs.push(languageId);
            gutterRegistrationInProgress = true;
            Editor.unregisterGutter(CODE_INSPECTION_GUTTER);
            gutterRegistrationInProgress = false;
            Editor.registerGutter(CODE_INSPECTION_GUTTER, CODE_INSPECTION_GUTTER_PRIORITY, _registeredLanguageIDs);
        }

        run();  // in case a file of this type is open currently
    }

    /**
     * Returns a list of providers registered for given languageId through register function
     */
    function getProvidersForLanguageId(languageId) {
        var result = [];
        if (_providers[languageId]) {
            result = result.concat(_providers[languageId]);
        }
        if (_providers['*']) {
            result = result.concat(_providers['*']);
        }
        return result;
    }

    /**
     * Update DocumentManager listeners.
     */
    function updateListeners() {
        if (_enabled) {
            // register our event listeners
            MainViewManager
                .on("currentFileChange.codeInspection", function () {
                    run();
                });
            DocumentManager
                .on("currentDocumentLanguageChanged.codeInspection", function () {
                    run();
                })
                .on("documentSaved.codeInspection documentRefreshed.codeInspection", function (event, document) {
                    if (document === DocumentManager.getCurrentDocument()) {
                        run();
                    }
                });
        } else {
            DocumentManager.off(".codeInspection");
            MainViewManager.off(".codeInspection");
        }
    }

    /**
     * Enable or disable all inspection.
     * @param {?boolean} enabled Enabled state. If omitted, the state is toggled.
     * @param {?boolean} doNotSave true if the preference should not be saved to user settings. This is generally for events triggered by project-level settings.
     */
    function toggleEnabled(enabled, doNotSave) {
        if (enabled === undefined) {
            enabled = !_enabled;
        }

        // Take no action when there is no change.
        if (enabled === _enabled) {
            return;
        }

        _enabled = enabled;

        CommandManager.get(Commands.VIEW_TOGGLE_INSPECTION).setChecked(_enabled);
        updateListeners();
        if (!doNotSave) {
            prefs.set(PREF_ENABLED, _enabled);
            prefs.save();
        }

        // run immediately
        run();
    }

    function toggleProblems() {
        toggleCollapsed();
    }

    let lastRunTime;
    $(window.document).on("mousemove", ()=>{
        if(Phoenix.isTestWindow){
            return;
        }
        const editor = EditorManager.getCurrentFullEditor();
        if(!editor || editor.document.lastChangeTimestamp === lastDocumentScanTimeStamp) {
            return;
        }
        const currentTime = Date.now();
        if(lastRunTime && (currentTime - lastRunTime) < 1000) {
            // we dont run the linter on mouse operations more than 1 times a second.
            return;
        }
        lastRunTime = currentTime;
        run();
    });

    /**
     * Toggle the collapsed state for the panel. This explicitly collapses the panel (as opposed to
     * the auto collapse due to files with no errors & filetypes with no provider). When explicitly
     * collapsed, the panel will not reopen automatically on switch files or save.
     *
     * @param {?boolean} collapsed Collapsed state. If omitted, the state is toggled.
     * @param {?boolean} doNotSave true if the preference should not be saved to user settings. This is generally for events triggered by project-level settings.
     */
    function toggleCollapsed(collapsed, doNotSave) {
        if (collapsed === undefined) {
            collapsed = !_collapsed;
        }

        if (collapsed === _collapsed) {
            return;
        }

        _collapsed = collapsed;
        if (!doNotSave) {
            prefs.set(PREF_COLLAPSED, _collapsed);
            prefs.save();
        }

        if (_collapsed) {
            problemsPanel.hide();
        } else {
            if (_hasErrors) {
                problemsPanel.show();
            }
        }
    }

    /** Command to go to the first Problem */
    function handleGotoFirstProblem() {
        run();
        if (_gotoEnabled) {
            $problemsPanel.find("tr:not(.inspector-section)").first().trigger("click");
        }
    }

    function handleGotoNextProblem() {
        if (_gotoEnabled) {
            const editor = EditorManager.getCurrentFullEditor();
            if(!editor){
                return;
            }
            const currentCursor = editor.getCursorPos();
            const nextMarks = editor.getMarksAfter(currentCursor, CODE_MARK_TYPE_INSPECTOR);
            if(!nextMarks.length || !nextMarks[0].find()){
                return;
            }

            let nextMark = null;
            for (let i = 0; i < nextMarks.length; i++) {
                const markRange = nextMarks[i].find();
                if (markRange && (markRange.from.line > currentCursor.line ||
                    (markRange.from.line === currentCursor.line && markRange.from.ch > currentCursor.ch))) {
                    nextMark = nextMarks[i];
                    break;
                }
            }

            if (!nextMark) {
                return;
            }
            const nextMarkRange = nextMark.find();
            if (nextMarkRange) {
                editor.setCursorPos(nextMarkRange.from.line, nextMarkRange.from.ch);
            }
        }
    }

    function handleGotoPrevProblem() {
        if (_gotoEnabled) {
            const editor = EditorManager.getCurrentFullEditor();
            if (!editor) {
                return;
            }
            const currentCursor = editor.getCursorPos();
            const prevMarks = editor.getMarksBefore(currentCursor, CODE_MARK_TYPE_INSPECTOR);

            if (!prevMarks.length) {
                return;
            }

            let prevMark = null;
            for (let i = prevMarks.length - 1; i >= 0; i--) {
                const markRange = prevMarks[i].find();
                if (markRange && (markRange.to.line < currentCursor.line ||
                    (markRange.to.line === currentCursor.line && markRange.to.ch < currentCursor.ch))) {
                    prevMark = prevMarks[i];
                    break;
                }
            }

            if (!prevMark) {
                return;
            }

            const prevMarkRange = prevMark.find();
            if (prevMarkRange) {
                editor.setCursorPos(prevMarkRange.from.line, prevMarkRange.from.ch);
            }
        }
    }

    // Register command handlers
    CommandManager.register(Strings.CMD_VIEW_TOGGLE_INSPECTION, Commands.VIEW_TOGGLE_INSPECTION,        toggleEnabled);
    CommandManager.register(Strings.CMD_VIEW_TOGGLE_PROBLEMS, Commands.VIEW_TOGGLE_PROBLEMS,        toggleProblems);
    CommandManager.register(Strings.CMD_GOTO_FIRST_PROBLEM,     Commands.NAVIGATE_GOTO_FIRST_PROBLEM,   handleGotoFirstProblem);
    CommandManager.register(Strings.CMD_GOTO_NEXT_PROBLEM,     Commands.NAVIGATE_GOTO_NEXT_PROBLEM,   handleGotoNextProblem);
    CommandManager.register(Strings.CMD_GOTO_PREV_PROBLEM,     Commands.NAVIGATE_GOTO_PREV_PROBLEM,   handleGotoPrevProblem);

    // Register preferences
    prefs.definePreference(PREF_ENABLED, "boolean", brackets.config["linting.enabled_by_default"], {
        description: Strings.DESCRIPTION_LINTING_ENABLED
    })
        .on("change", function (e, data) {
            toggleEnabled(prefs.get(PREF_ENABLED), true);
        });

    prefs.definePreference(PREF_COLLAPSED, "boolean", false, {
        description: Strings.DESCRIPTION_LINTING_COLLAPSED
    })
        .on("change", function (e, data) {
            toggleCollapsed(prefs.get(PREF_COLLAPSED), true);
        });

    prefs.definePreference(PREF_ASYNC_TIMEOUT, "number", 10000, {
        description: Strings.DESCRIPTION_ASYNC_TIMEOUT
    });

    prefs.definePreference(PREF_PREFER_PROVIDERS, "array", [], {
        description: Strings.DESCRIPTION_LINTING_PREFER,
        valueType: "string"
    });

    prefs.definePreference(PREF_PREFERRED_ONLY, "boolean", false, {
        description: Strings.DESCRIPTION_USE_PREFERED_ONLY
    });

    function _isInvalidFix(fixDetails, maxOffset) {
        return (!_.isNumber(fixDetails.rangeOffset.start) || !_.isNumber(fixDetails.rangeOffset.end) ||
            fixDetails.rangeOffset.start < 0 || fixDetails.rangeOffset.end < 0 ||
            fixDetails.rangeOffset.start > maxOffset || fixDetails.rangeOffset.end > maxOffset ||
            typeof fixDetails.replaceText !== "string");
    }

    function _fixProblem(fixID) {
        const fixDetails = documentFixes.get(fixID);
        const editor = EditorManager.getCurrentFullEditor();
        const maxOffset = editor.document.getText().length;
        if(!editor || !fixDetails || editor.document.lastChangeTimestamp !== lastDocumentScanTimeStamp) {
            Metrics.countEvent(Metrics.EVENT_TYPE.LINT, "fixFail", "dialogShown");
            Dialogs.showErrorDialog(Strings.CANNOT_FIX_TITLE, Strings.CANNOT_FIX_MESSAGE);
        } else if(_isInvalidFix(fixDetails, maxOffset)){
            Metrics.countEvent(Metrics.EVENT_TYPE.LINT, "fixFail", "invalid");
            console.error("Invalid fix:", fixDetails); // this should never happen as we filter the fix while inserting
        } else {
            const from = editor.posFromIndex(fixDetails.rangeOffset.start),
                to =  editor.posFromIndex(fixDetails.rangeOffset.end);
            editor.setSelection(from, to, true, Editor.BOUNDARY_BULLSEYE, EDIT_ORIGIN_LINT_FIX);
            editor.replaceSelection(fixDetails.replaceText, "around");
        }
        MainViewManager.focusActivePane();
        run();
    }

    function _fixAllProblems() {
        const editor = EditorManager.getCurrentFullEditor();
        if(!editor || editor.document.lastChangeTimestamp !== lastDocumentScanTimeStamp) {
            Dialogs.showErrorDialog(Strings.CANNOT_FIX_TITLE, Strings.CANNOT_FIX_MESSAGE);
            return;
        }
        if(!documentFixes.size){
            return;
        }
        const replacements = [];
        const maxOffset = editor.document.getText().length;
        for(let fixDetails of documentFixes.values()){
            if(_isInvalidFix(fixDetails, maxOffset)){
                console.error("Invalid fix:", fixDetails); // this should never happen
            }
            replacements.push({
                from: editor.posFromIndex(fixDetails.rangeOffset.start),
                to: editor.posFromIndex(fixDetails.rangeOffset.end),
                text: fixDetails.replaceText
            });
        }
        editor.replaceMultipleRanges(replacements, EDIT_ORIGIN_LINT_FIX);
        const finalCursor = replacements[replacements.length - 1].from;
        editor.setCursorPos(finalCursor.line, finalCursor.ch);
        MainViewManager.focusActivePane();
        run();
    }

    // Initialize items dependent on HTML DOM
    AppInit.htmlReady(function () {
        Editor.registerGutter(CODE_INSPECTION_GUTTER, CODE_INSPECTION_GUTTER_PRIORITY);
        // Create bottom panel to list error details
        var panelHtml = Mustache.render(PanelTemplate, Strings);
        problemsPanel = WorkspaceManager.createBottomPanel("errors", $(panelHtml), 100);
        $problemsPanel = $("#problems-panel");
        $fixAllBtn = $problemsPanel.find(".problems-fix-all-btn");
        $fixAllBtn.click(()=>{
            Metrics.countEvent(Metrics.EVENT_TYPE.LINT, "fixAllClick", "panel");
            _fixAllProblems();
        });

        function checkSelectionInsideElement(range, element) {
            if(!range || range.endOffset === range.startOffset) {
                return false; // this is a cursor, not a selection.
            }
            const startNode = range.startContainer;
            const endNode = range.endContainer;

            // Checking if the selection's start and end nodes are within the specified element
            return $.contains(element, startNode) && $.contains(element, endNode);
        }

        var $selectedRow;
        $problemsPanelTable = $problemsPanel.find(".table-container")
            .on("click", "tr", function (e) {
                if ($(e.target).hasClass('ph-copy-problem')) {
                    // Retrieve the message from the data attribute of the clicked element
                    let message = $(e.target).parent().parent().find(".line-text").text();
                    if(!message){
                        message = $(e.target).parent().parent().parent().find(".line-text").text();
                    }
                    message && Phoenix.app.copyToClipboard(message);
                    e.preventDefault();
                    e.stopPropagation();
                    MainViewManager.focusActivePane();
                    return;
                }
                if ($(e.target).hasClass('ph-fix-problem')) {
                    // Retrieve the message from the data attribute of the clicked element
                    Metrics.countEvent(Metrics.EVENT_TYPE.LINT, "fixClick", "panel");
                    _fixProblem("" + $(e.target).data("fixid"));
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }

                if ($selectedRow) {
                    $selectedRow.removeClass("selected");
                }

                $selectedRow  = $(e.currentTarget);
                $selectedRow.addClass("selected");

                // This is a inspector title row, expand/collapse on click
                if ($selectedRow.hasClass("inspector-section")) {
                    var $triangle = $(".disclosure-triangle", $selectedRow);
                    var isExpanded = $triangle.hasClass("expanded");

                    // Clicking the inspector title section header collapses/expands result rows
                    if (isExpanded) {
                        $selectedRow.nextUntil(".inspector-section").addClass("forced-hidden");
                    } else {
                        $selectedRow.nextUntil(".inspector-section").removeClass("forced-hidden");
                    }
                    $triangle.toggleClass("expanded");

                    var providerName = $selectedRow.find("input[type='hidden']").val();
                    prefs.set(providerName + ".collapsed", !isExpanded);
                    prefs.save();
                } else {
                    const selection = window.getSelection();
                    if (selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        if(checkSelectionInsideElement(range, $problemsPanel[0])){
                            // some text is selected in the problems panel, user may want to copy the text, so
                            // dont set focus to the text area.
                            return;
                        }
                    }
                    // This is a problem marker row, show the result on click
                    // Grab the required position data
                    var lineTd    = $selectedRow.find(".line-number");
                    var line      = parseInt(lineTd.text(), 10) - 1;  // convert friendlyLine back to pos.line
                    // if there is no line number available, don't do anything
                    if (!isNaN(line)) {
                        var character = lineTd.data("character");

                        var editor = EditorManager.getCurrentFullEditor();
                        editor.setCursorPos(line, character, true);
                        MainViewManager.focusActivePane();
                    }
                }
            });

        $("#problems-panel .close").click(function () {
            toggleCollapsed(true);
            MainViewManager.focusActivePane();
        });

        // Status bar indicator - icon & tooltip updated by run()
        var statusIconHtml = Mustache.render("<div id=\"status-inspection\">&nbsp;</div>", Strings);
        StatusBar.addIndicator(INDICATOR_ID, $(statusIconHtml), true, "", "", "status-indent");

        $("#status-inspection").click(function () {
            // Clicking indicator toggles error panel, if any errors in current file
            if (_hasErrors) {
                toggleCollapsed();
            }
        });

        // Set initial UI state
        toggleEnabled(prefs.get(PREF_ENABLED), true);
        toggleCollapsed(prefs.get(PREF_COLLAPSED), true);

        QuickViewManager.registerQuickViewProvider({
            getQuickView,
            QUICK_VIEW_NAME: "CodeInspection"
        }, ["all"]);
    });

    AppInit.appReady(function () {
        // on boot the linter is not somehow showing the lint editor underlines at first time. So we trigger a run
        // after 2 seconds
        if(!Phoenix.isTestWindow) {
            setTimeout(run, 2000);
        }
    });

    // Testing
    exports._unregisterAll          = _unregisterAll;
    exports._PREF_ASYNC_TIMEOUT     = PREF_ASYNC_TIMEOUT;
    exports._PREF_PREFER_PROVIDERS  = PREF_PREFER_PROVIDERS;
    exports._PREF_PREFERRED_ONLY    = PREF_PREFERRED_ONLY;

    // Public API
    exports.CODE_INSPECTION_GUTTER      = CODE_INSPECTION_GUTTER;
    exports.register                    = register;
    exports.Type                        = Type;
    exports.toggleEnabled               = toggleEnabled;
    exports.inspectFile                 = inspectFile;
    exports.requestRun                  = run;
    exports.getProvidersForPath         = getProvidersForPath;
    exports.getProviderIDsForLanguage   = getProviderIDsForLanguage;
    exports.scrollToProblem             = scrollToProblem;
});
