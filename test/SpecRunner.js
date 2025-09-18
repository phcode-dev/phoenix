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

/*global beforeEach, afterEach, beforeAll, afterAll, jasmine, Filer, Phoenix,
globalTestRunnerLogToConsole, globalTestRunnerErrorToConsole */

// Set the baseUrl to brackets/src
require.config({
    baseUrl: "../src",
    paths: {
        "test": "../test",
        "perf": "../test/perf",
        "spec": "../test/spec",
        "text": "thirdparty/text/text",
        "i18n": "thirdparty/i18n/i18n",
        "fileSystemImpl": "filesystem/impls/appshell/AppshellFileSystem",
        "preferences/PreferencesImpl": "../test/TestPreferencesImpl",
        "preact-compat": "thirdparty/preact-compat/preact-compat.min",
        "preact": "thirdparty/preact/preact",
        "preact-test-utils": "thirdparty/preact-test-utils/preact-test-utils",
        "simulate-event": "thirdparty/simulate-event/simulate-event",
        "xtend": "thirdparty/xtend"
    },
    map: {
        "*": {
            "thirdparty/preact": "preact-compat",
            "thirdparty/preact-test-utils": "preact-test-utils"
        }
    }
});

window.logger = {
    error: console.error,
    warn: console.warn,
    reportError: function (error, message) {
        console.error(error, message);
    },
    leaveTrail: function (message) {
        console.log("[Trail] : ", message);
    },

    loggingOptions: {
        LOCAL_STORAGE_KEYS: {
            LOG_LIVE_PREVIEW: "logLivePreview",
            // these need not be dev enable for now
            LOG_GIT: "logGitDebugMode"
        },
        healthDataDisabled: false,
        logLivePreview: false // logLivePreview will be setup below
    },
    livePreview: {
        log: function (...args) {
            console.log(...args);
        }
    }
};

const EXTRACT_TEST_ASSETS_KEY = 'EXTRACT_TEST_ASSETS_KEY';
const EXTRACT = 'EXTRACT';
const DONT_EXTRACT = 'DONT_EXTRACT';

/**
 * global util to convert jquery/js promise to a js promise
 * @param jqueryOrJSPromise
 * @returns {{finally}|{then}|{catch}|*}
 */
function jsPromise(jqueryOrJSPromise) {
    if(jqueryOrJSPromise && jqueryOrJSPromise.catch && jqueryOrJSPromise.then && jqueryOrJSPromise.finally){
        // this should be a normal js promise return as is
        return  jqueryOrJSPromise;
    }
    if(!jqueryOrJSPromise ||
        (jqueryOrJSPromise && !jqueryOrJSPromise.fail) || (jqueryOrJSPromise && !jqueryOrJSPromise.done)){
        console.error("this function expects a jquery promise with done and fail handlers");
        throw new Error("this function expects a jquery promise with done and fail handlers");
    }
    return new Promise((resolve, reject)=>{
        jqueryOrJSPromise
            .done(resolve)
            .fail(reject);
    });
}
window.deferredToPromise = jsPromise;

/**
 * global test util to wait for a polling result.
 * @param pollFn return true or a promise that resolves to true of false to indicate success and break waiting.
 * @param {string|function}_timeoutMessageOrMessageFn - helpful string message or an async function returning a string
 *  message to show in case of time out.
 * @param timeoutms - max timeout to wait for. if not given, will wait for 2 seconds
 * @param pollInterval in millis, default poll interval is 10ms
 * @returns {*}
 */
function awaitsFor(pollFn, _timeoutMessageOrMessageFn, timeoutms = 2000, pollInterval = 30){
    if(typeof  _timeoutMessageOrMessageFn === "number"){
        timeoutms = _timeoutMessageOrMessageFn;
        pollInterval = timeoutms;
    }
    if(!(typeof  timeoutms === "number" && typeof  pollInterval === "number")){
        throw new Error("awaitsFor: invalid parameters when awaiting for " + _timeoutMessageOrMessageFn);
    }

    async function _getExpectMessage(_timeoutMessageOrMessageFn) {
        try{
            if(typeof _timeoutMessageOrMessageFn === "function") {
                _timeoutMessageOrMessageFn = _timeoutMessageOrMessageFn();
                if(_timeoutMessageOrMessageFn instanceof Promise){
                    _timeoutMessageOrMessageFn = await _timeoutMessageOrMessageFn;
                }
            }
        } catch (e) {
            console.error("Error executing expected message function:", e);
            _timeoutMessageOrMessageFn = "Error executing expected message function:" + e.stack;
        }
        return _timeoutMessageOrMessageFn;
    }

    function _timeoutPromise(promise, ms) {
        const timeout = new Promise((_, reject) => {
            setTimeout(async () => {
                _timeoutMessageOrMessageFn = await _getExpectMessage(_timeoutMessageOrMessageFn);
                reject(new Error(_timeoutMessageOrMessageFn || `Promise timed out after ${ms}ms`));
            }, ms);
        });

        return Promise.race([promise, timeout]);
    }

    return new Promise((resolve, reject)=>{
        let startTime = Date.now(),
            lapsedTime;
        async function pollingFn() {
            try{
                let result = pollFn();

                // If pollFn returns a promise, await it
                if (Object.prototype.toString.call(result) === "[object Promise]") {
                    // we cant simply check for result instanceof Promise as the Promise may be returned from an iframe.
                    // and iframe has a different instance of Promise than this spec runner.
                    result = await _timeoutPromise(result, timeoutms, _timeoutMessageOrMessageFn);
                }

                if (result) {
                    resolve();
                    return;
                }
                lapsedTime = Date.now() - startTime;
                if(lapsedTime>timeoutms){
                    _timeoutMessageOrMessageFn = await _getExpectMessage(_timeoutMessageOrMessageFn);
                    globalTestRunnerErrorToConsole("awaitsFor timed out waiting for", _timeoutMessageOrMessageFn);
                    reject("awaitsFor timed out waiting for - " + _timeoutMessageOrMessageFn);
                    return;
                }
                setTimeout(pollingFn, pollInterval);
            } catch (e) {
                console.error(e);
                reject(e);
            }
        }
        pollingFn();
    });
}

/**
 * global test util to wait for a period of time
 * @param waitTimeMs - max time to wait for in ms.
 * @returns {*}
 */
function awaits(waitTimeMs){
    return new Promise((resolve)=>{
        setTimeout(resolve, waitTimeMs);
    });
}

window.jsPromise = jsPromise;
window.awaitsFor = awaitsFor;
window.awaits = awaits;
window.delay = awaits;
/**
 * A safe way to return null on promise fail. This will never reject or throw.
 * @param promise
 * @param {string} logError - If a string is passed in, will log the error to console.
 * @return {*}
 */
window.catchToNull = function (promise, logError) {
    return new Promise(resolve=>{
        promise.then(resolve)
            .catch((err)=>{
                logError && console.error(logError, err);
                resolve(null);
            });
    });
};


Phoenix.baseURL = `${Phoenix.baseURL}../src/`;

define(function (require, exports, module) {


    // Utility dependencies
    const AppInit               = require("utils/AppInit"),
        SpecRunnerUtils         = require("spec/SpecRunnerUtils"),
        ExtensionLoader         = require("utils/ExtensionLoader"),
        Async                   = require("utils/Async"),
        FileSystem              = require("filesystem/FileSystem"),
        FileUtils               = require("file/FileUtils"),
        UrlParams               = require("utils/UrlParams").UrlParams,
        UnitTestReporter        = require("test/UnitTestReporter").UnitTestReporter,
        BootstrapReporterView   = require("test/BootstrapReporterView").BootstrapReporterView,
        NativeApp               = require("utils/NativeApp");

    window.Strings = require("strings");
    // Load modules for later use
    require("utils/EventDispatcher");
    require("language/CodeInspection");
    require("thirdparty/lodash");
    require("thirdparty/jszip");
    require("editor/CodeHintManager");
    require("editor/EditorOptionHandlers");
    require("utils/Global");
    require("command/Menus");
    require("utils/NodeDomain");
    require("utils/NodeUtils");
    require("utils/ColorUtils");
    require("preferences/PreferencesBase");
    require("JSUtils/Session");
    require("JSUtils/ScopeManager");
    require("widgets/InlineMenu");
    require("worker/ExtensionsWorker");
    require("thirdparty/tinycolor");
    require("widgets/NotificationUI");

    // Load modules that self-register and just need to get included in the test-runner window
    require("document/ChangedDocumentTracker");

    // TODO (#2155): These are used by extensions via brackets.getModule(), so tests that run those
    // extensions need these to be required up front. We need a better solution for this eventually.
    require("utils/ExtensionUtils");

    // Load both top-level suites. Filtering is applied at the top-level as a filter to BootstrapReporter.
    require("test/UnitTestSuite");
    require("test/PerformanceTestSuite");

    // Load JUnitXMLReporter
    require("test/thirdparty/jasmine-reporters/junit_reporter");
    require("thirdparty/jquery.knob.modified");
    require('thirdparty/marked.min');

    // Load CodeMirror add-ons--these attach themselves to the CodeMirror module
    require("thirdparty/CodeMirror/addon/fold/xml-fold");
    require("thirdparty/CodeMirror/addon/edit/matchtags");
    require("thirdparty/CodeMirror/addon/edit/matchbrackets");
    require("thirdparty/CodeMirror/addon/edit/closebrackets");
    require("thirdparty/CodeMirror/addon/edit/closetag");
    require("thirdparty/CodeMirror/addon/selection/active-line");
    require("thirdparty/CodeMirror/addon/mode/multiplex");
    require("thirdparty/CodeMirror/addon/mode/overlay");
    require("thirdparty/CodeMirror/addon/search/searchcursor");
    require("thirdparty/CodeMirror/addon/comment/comment");
    require("thirdparty/CodeMirror/keymap/sublime");

    //load Language Tools Module
    require("languageTools/PathConverters");
    require("languageTools/LanguageTools");
    require("languageTools/ClientLoader");
    require("languageTools/BracketsToNodeInterface");
    require("languageTools/DefaultProviders");
    require("languageTools/DefaultEventHandlers");

	//load language features
    require("features/ParameterHintsManager");
    require("features/JumpToDefManager");

    //node connector
    require("NodeConnector");

    var selectedCategories,
        params          = new UrlParams(),
        reporter,
        reporterView,
        _writeResults   = new $.Deferred(),
        resultsPath;

    // parse URL parameters
    params.parse();
    resultsPath = params.get("resultsPath");

    function _loadExtensionTests() {
        let paths = ["default", "dev", "user"];

        return Async.doInParallel(paths, function (dir) {
            if(dir === "default"){
                return ExtensionLoader.testAllDefaultExtensions();
            } else {
                return ExtensionLoader.testAllExtensionsInNativeDirectory(dir);
            }
        });
    }

    function _documentReadyHandler() {
        $("#show-report-to-copy").click(function () {
            let hidden = $("#printableReport").hasClass("forced-hidden");
            if(hidden){
                $("#printableReport").removeClass("forced-hidden");
                $("#interactiveReport").addClass("forced-hidden");
            } else {
                $("#printableReport").addClass("forced-hidden");
                $("#interactiveReport").removeClass("forced-hidden");
            }
        });

        $("#reload").click(function () {
            localStorage.setItem(EXTRACT_TEST_ASSETS_KEY, EXTRACT);
            window.location.reload(true);
        });

        if (selectedCategories.length === 1) {
            $("#" + (selectedCategories[0])).closest("li").toggleClass("active", true);
        }

        AppInit._dispatchReady(AppInit.APP_READY);

        jasmine.getEnv().execute();
    }

    function writeResults(path, text) {
        // check if the file already exists
        var file = FileSystem.getFileForPath(path);

        file.exists(function (err, exists) {
            if (err) {
                _writeResults.reject(err);
                return;
            }

            if (exists) {
                // file exists, do not overwrite
                _writeResults.reject();
            } else {
                // file not found, write the new file with xml content
                FileUtils.writeText(file, text)
                    .done(function () {
                        _writeResults.resolve();
                    })
                    .fail(function (writeErr) {
                        _writeResults.reject(writeErr);
                    });
            }
        });
    }

    /**
     * Listener for UnitTestReporter "runnerEnd" event. Attached only if
     * "resultsPath" URL parameter exists. Does not overwrite existing file.
     *
     * @param {!$.Event} event
     * @param {!UnitTestReporter} loaclReporter
     */
    function _runnerEndHandler(event, loaclReporter) {
        if (resultsPath && resultsPath.substr(-5) === ".json") {
            writeResults(resultsPath, loaclReporter.toJSON());
        }

        _writeResults.always(function () { brackets.app.quit(); });
    }

    /**
     * Patch JUnitXMLReporter to use FileSystem and to consolidate all results
     * into a single file.
     */
    function _patchJUnitReporter() {
        jasmine.JUnitXmlReporter.prototype.reportSpecResultsOriginal = jasmine.JUnitXmlReporter.prototype.reportSpecResults;
        jasmine.JUnitXmlReporter.prototype.getNestedOutputOriginal = jasmine.JUnitXmlReporter.prototype.getNestedOutput;

        jasmine.JUnitXmlReporter.prototype.reportSpecResults = function (spec) {
            if (spec.results().skipped) {
                return;
            }

            this.reportSpecResultsOriginal(spec);
        };

        jasmine.JUnitXmlReporter.prototype.getNestedOutput = function (suite) {
            if (suite.results().totalCount === 0) {
                return "";
            }

            return this.getNestedOutputOriginal(suite);
        };

        jasmine.JUnitXmlReporter.prototype.reportRunnerResults = function (runner) {
            var suites = runner.suites(),
                output = '<?xml version="1.0" encoding="UTF-8" ?>',
                i;

            output += "\n<testsuites>";

            for (i = 0; i < suites.length; i++) {
                var suite = suites[i];
                if (!suite.parentSuite) {
                    output += this.getNestedOutput(suite);
                }
            }

            output += "\n</testsuites>";
            writeResults(resultsPath, output);

            // When all done, make it known on JUnitXmlReporter
            jasmine.JUnitXmlReporter.finished_at = (new Date()).getTime();
        };

        jasmine.JUnitXmlReporter.prototype.writeFile = function (path, filename, text) {
            // do nothing
        };
    }

    function deepEqualKeyValuesOnly(object1, object2) {
        if((!object1 && !object2) || object1 === object2){
            return true;
        }
        if((!isObject(object1) || !isObject(object2)) && object1 !== object2){
            return false;
        }
        const keys1 = Object.keys(object1);
        const keys2 = Object.keys(object2);
        if (keys1.length !== keys2.length) {
            return false;
        }
        for (const key of keys1) {
            const val1 = object1[key];
            const val2 = object2[key];
            const areObjects = isObject(val1) && isObject(val2);
            if (areObjects && !deepEqualKeyValuesOnly(val1, val2) ||
                (!areObjects && val1 !== val2)) {
                return false;
            }
        }
        return true;
    }
    function isObject(object) {
        return object != null && typeof object === 'object';
    }
    window.deepEqualKeyValuesOnly = deepEqualKeyValuesOnly;

    function init() {
        selectedCategories = (params.get("category")
            || window.localStorage.getItem("SpecRunner.category") || "unit").split(",");

        jasmine.DEFAULT_TIMEOUT_INTERVAL = 15000; // 15 seconds

        /*
         * TODO (jason-sanjose): extension unit tests should only load the
         * extension and the extensions dependencies. We should not load
         * unrelated extensions. Currently, this solution is all or nothing.
         */

        // configure spawned test windows to load extensions
        SpecRunnerUtils.setLoadExtensionsInTestWindow(selectedCategories.indexOf("extension") >= 0);

        _loadExtensionTests().always(function () {
            var jasmineEnv = jasmine.getEnv();
            jasmineEnv.updateInterval = 1000;

            // Create the reporter, which is really a model class that just gathers
            // spec and performance data.
            reporter = new UnitTestReporter(jasmineEnv, params.get("spec"), selectedCategories);
            SpecRunnerUtils.setUnitTestReporter(reporter);

            // Optionally emit JUnit XML file for automated runs
            if (resultsPath) {
                if (resultsPath.substr(-4) === ".xml") {
                    _patchJUnitReporter();
                    jasmineEnv.addReporter(new jasmine.JUnitXmlReporter(null, true, false));
                }

                // Close the window
                $(reporter).on("runnerEnd", _runnerEndHandler);
            } else {
                _writeResults.resolve();
            }

            // Create the view that displays the data from the reporter. (Usually in
            // Jasmine this is part of the reporter, but we separate them out so that
            // we can more easily grab just the model data for output during automatic
            // testing.)
            reporterView = new BootstrapReporterView(window.document, reporter);

            // remember the suite for the next unit test window launch
            window.localStorage.setItem("SpecRunner.suite", selectedCategories);

            $(window.document).ready(_documentReadyHandler);
        });


        // Prevent clicks on any link from navigating to a different page (which could lose unsaved
        // changes). We can't use a simple .on("click", "a") because of http://bugs.jquery.com/ticket/3861:
        // jQuery hides non-left clicks from such event handlers, yet middle-clicks still cause CEF to
        // navigate. Also, a capture handler is more reliable than bubble.
        window.document.body.addEventListener("click", function (e) {
            // Check parents too, in case link has inline formatting tags
            var node = e.target, url;

            while (node) {
                if (node.tagName === "A") {
                    url = node.getAttribute("href");
                    if (url && url.match(/^http/)) {
                        NativeApp.openURLInDefaultBrowser(url);
                        e.preventDefault();
                    }
                    break;
                }
                node = node.parentElement;
            }
        }, true);
    }

    function _showLoading(show) {
        if(show){
            document.getElementById('loading').style='margin-top: 150px;';
        } else {
            document.getElementById('loading').setAttribute('style', 'display: none;');
        }
    }

    function _copyZippedItemToFS(path, item) {
        return new Promise((resolve, reject) =>{
            let destPath = `${SpecRunnerUtils.getTestPath()}/${path}`;
            if(item.dir){
                window.fs.mkdirs(destPath, 0o777, true, (err)=>{
                    if(err){
                        reject();
                    } else {
                        resolve(destPath);
                    }
                });
            } else {
                item.async("uint8array").then(function (data) {
                    window.fs.writeFile(destPath, Filer.Buffer.from(data), writeErr=>{
                        if(writeErr){
                            reject(writeErr);
                        } else {
                            resolve(destPath);
                        }
                    });
                }).catch(error=>{
                    reject(error);
                });
            }
        });
    }

    function makeTestDir() {
        return new Promise((resolve, reject)=>{
            let testPath = SpecRunnerUtils.getTestPath();
            window.fs.mkdirs(testPath, 0o777, true, (err)=>{
                if(err){
                    reject();
                } else {
                    resolve(testPath);
                }
            });
        });
    }

    async function setupAndRunTests() {
        globalTestRunnerLogToConsole("Starting tests...");
        await window._tauriBootVarsPromise;
        await window.PhStore.storageReadyPromise;
        let shouldExtract = localStorage.getItem(EXTRACT_TEST_ASSETS_KEY);
        if(shouldExtract === EXTRACT || shouldExtract === null) {
            _showLoading(true);
            let JSZip = require("thirdparty/jszip");
            globalTestRunnerLogToConsole("Extracting Test Files");
            window.JSZipUtils.getBinaryContent('test_folders.zip', function(err, data) {
                if(err) {
                    globalTestRunnerErrorToConsole("Please run 'npm run build' before starting this test. " +
                        "Could not create test files in phoenix virtual fs. Some tests may fail");
                    _showLoading(false);
                    init();
                } else {
                    JSZip.loadAsync(data).then(function (zip) {
                        let keys = Object.keys(zip.files);
                        let destPath = SpecRunnerUtils.getTestPath();
                        globalTestRunnerLogToConsole("Cleaning test directory: " + destPath);
                        window.fs.unlink(destPath, async function (err) {
                            if(err && err.code !== 'ENOENT'){
                                console.error("Could not clean test dir. we will try to move ahead", err);
                                // we will now try to overwrite existing
                            }
                            globalTestRunnerLogToConsole("Creating test folder " + destPath);
                            await makeTestDir();
                            globalTestRunnerLogToConsole("Copying test assets to " + destPath);
                            let progressMessageEl = document.getElementById("loadProgressMessage");
                            let lastPrintedPercent = 0;
                            for (let i = 0; i < keys.length; i++) {
                                let path = keys[i];
                                progressMessageEl.textContent = `${i+1} of ${keys.length}`;
                                await _copyZippedItemToFS(path, zip.files[path]);
                                const percentCopied = Math.round((i/keys.length)*100);
                                if(percentCopied % 10 === 0 && lastPrintedPercent !== percentCopied) {
                                    lastPrintedPercent = percentCopied;
                                    globalTestRunnerLogToConsole(percentCopied+ "% copied");
                                }
                            }
                            localStorage.setItem(EXTRACT_TEST_ASSETS_KEY, DONT_EXTRACT);
                            _showLoading(false);
                            init();
                        });
                    });
                }
            });
        } else {
            init();
        }
    }

    setupAndRunTests();
});
