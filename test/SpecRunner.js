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

/*global beforeEach, afterEach, beforeAll, afterAll, jasmine, Filer */

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

const EXTRACT_TEST_ASSETS_KEY = 'EXTRACT_TEST_ASSETS_KEY';
const EXTRACT = 'EXTRACT';
const DONT_EXTRACT = 'DONT_EXTRACT';

function jsPromise(jqueryOrJSPromise) {
    if(jqueryOrJSPromise && jqueryOrJSPromise.catch && jqueryOrJSPromise.then && jqueryOrJSPromise.finally){
        // this should be a normal js promise return as is
        return  jqueryOrJSPromise;
    }
    if(!jqueryOrJSPromise ||
        (jqueryOrJSPromise && !jqueryOrJSPromise.fail) || (jqueryOrJSPromise && !jqueryOrJSPromise.done)){
        throw new Error("this function expects a jquery promise with done and fail handlers");
    }
    return new Promise((resolve, reject)=>{
        jqueryOrJSPromise
            .done(resolve)
            .fail(reject);
    });
}
function awaitsFor(pollFn, _message, timeoutms, pollInterval = 10){
    return new Promise((resolve, reject)=>{
        let lapsedTime = 0;
        let interval = setInterval(()=>{
            if(pollFn()){
                clearInterval(interval);
                resolve();
                return;
            }
            lapsedTime += pollInterval;
            if(lapsedTime>timeoutms){
                clearInterval(interval);
                reject();
            }
        }, pollInterval);
    });
}
window.jsPromise = jsPromise;
window.awaitsFor = awaitsFor;

define(function (require, exports, module) {


    // Utility dependencies
    var AppInit                 = require("utils/AppInit"),
        SpecRunnerUtils         = require("spec/SpecRunnerUtils"),
        ExtensionLoader         = require("utils/ExtensionLoader"),
        Async                   = require("utils/Async"),
        FileSystem              = require("filesystem/FileSystem"),
        FileUtils               = require("file/FileUtils"),
        UrlParams               = require("utils/UrlParams").UrlParams,
        UnitTestReporter        = require("test/UnitTestReporter").UnitTestReporter,
        BootstrapReporterView   = require("test/BootstrapReporterView").BootstrapReporterView,
        NativeApp               = require("utils/NativeApp");

    // Load modules for later use
    require("language/CodeInspection");
    require("thirdparty/lodash");
    require("thirdparty/jszip");
    require("editor/CodeHintManager");
    require("utils/Global");
    require("command/Menus");
    require("utils/NodeDomain");
    require("utils/ColorUtils");
    require("preferences/PreferencesBase");
    require("JSUtils/Session");
    require("JSUtils/ScopeManager");
    require("widgets/InlineMenu");

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

    var selectedCategories,
        params          = new UrlParams(),
        reporter,
        reporterView,
        _writeResults   = new $.Deferred(),
        resultsPath;

    // parse URL parameters
    params.parse();
    resultsPath = params.get("resultsPath");

    function _loadExtensionTests(suitesToTest) {
        let isExtensionSuiteSelected = (suitesToTest.indexOf("extension") >= 0);
        if(!isExtensionSuiteSelected){
            return new $.Deferred().resolve();
        }
        // augment jasmine to identify extension unit tests
        var addSuite = jasmine.Runner.prototype.addSuite;
        jasmine.Runner.prototype.addSuite = function (suite) {
            suite.category = "extension";
            addSuite.call(this, suite);
        };

        let paths = ["default"];

        // load dev and user extensions only when running the extension test suite
        if (selectedCategories.indexOf("extension") >= 0) {
            paths.push("dev");
            paths.push("user");
        }

        return Async.doInParallel(paths, function (dir) {
            if(dir === "default"){
                return ExtensionLoader.testAllDefaultExtensions();
            } else {
                return ExtensionLoader.testAllExtensionsInNativeDirectory(dir);
            }
        });
    }

    function _documentReadyHandler() {
        if (brackets.app.showDeveloperTools) {
            $("#show-dev-tools").click(function () {
                brackets.app.showDeveloperTools();
            });
        } else {
            $("#show-dev-tools").remove();
        }

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

    function init() {
        selectedCategories = (params.get("category")
            || window.localStorage.getItem("SpecRunner.category") || "unit").split(",");

        /*
         * TODO (jason-sanjose): extension unit tests should only load the
         * extension and the extensions dependencies. We should not load
         * unrelated extensions. Currently, this solution is all or nothing.
         */

        // configure spawned test windows to load extensions
        SpecRunnerUtils.setLoadExtensionsInTestWindow(selectedCategories.indexOf("extension") >= 0);

        // todo TEST_MODERN enable extension tests
        //_loadExtensionTests(selectedCategories).always(function () {
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
        //});


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
            document.getElementById('loading').style='';
        } else {
            document.getElementById('loading').setAttribute('style', 'display: none;');
        }
    }

    function _copyZippedItemToFS(path, item) {
        return new Promise((resolve, reject) =>{
            let destPath = `/test/${path}`;
            if(item.dir){
                window.fs.mkdirs(destPath, '777', true, (err)=>{
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

    function setupAndRunTests() {
        let shouldExtract = localStorage.getItem(EXTRACT_TEST_ASSETS_KEY);
        if(shouldExtract === EXTRACT || shouldExtract === null) {
            _showLoading(true);
            let JSZip = require("thirdparty/jszip");
            window.JSZipUtils.getBinaryContent('test_folders.zip', function(err, data) {
                if(err) {
                    alert("Please run 'npm run test' before starting this test. " +
                        "Could not create test files in phoenix virtual fs. Some tests may fail");
                    _showLoading(false);
                    init();
                } else {
                    JSZip.loadAsync(data).then(function (zip) {
                        let keys = Object.keys(zip.files);
                        let allPromises=[];
                        for (let i = 0; i < keys.length; i++) {
                            let path = keys[i];
                            allPromises.push(_copyZippedItemToFS(path, zip.files[path]));
                        }
                        Promise.all(allPromises).then(()=>{
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
