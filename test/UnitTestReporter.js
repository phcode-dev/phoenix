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

/**
 * A Jasmine reporter that summarizes test results data:
 *  - summarizes the results for each top-level suite (instead of flattening out all suites)
 *  - counts the number of passed/failed specs instead of counting each expect()
 *  - tracks performance data for tests that want to log it
 * and rebroadcasts the summarized results to the reporter view, as well as serializing the data
 * to JSON.
 */

/*global jasmine, jasmineReporters*/

define(function (require, exports, module) {


    let SpecRunnerUtils = require("spec/SpecRunnerUtils"),
        BuildInfoUtils = require("utils/BuildInfoUtils");

    // make sure the global brackets variable is loaded
    require("utils/Global");

    let activeReporter;
    let knownCategories = [
        "all",
        "unit",
        "integration",
        "livepreview",
        "mainview",
        "performance",
        "extension"
    ];

    function _getKnownCategory(name) {
        name = name || '';
        if(name.includes(':')){
            let category = name.split(':')[0];
            if(knownCategories.includes(category)){
                return category;
            }
        }
        return '';
    }

    /**
     * @constructor
     * Creates a UnitTestReporter object. This has a number public properties:
     *
     * suites - an object with entries for each top-level suite; each value is an object containing:
     *    name - the full name of the suite
     *    specCount - number of specs in the suite and its descendants
     *    passedCount - number of passed specs in the suite and its descendants
     *    failedCount - number of failed specs in the suite and its descendants
     *    specs - an array of results for each spec; each result is an object containing:
     *        name - the full name of the spec
     *        passed - true if the spec passed, false otherwise
     *        messages - if defined, an array of message objects for the failed spec
     *        perf - if defined, the performance record for the spec
     *
     * passed - true if all specs passed, false otherwise
     * sortedNames - a sorted list of suite names (including all the keys in the suites object except All).
     * selectedCategories - the active category from url
     * activeSuite - the suite currently selected in the URL params, "all" if all are being run, and null if no tests are being run.
     * activeSpecCount - the number of specs that will actually be run given the current filter
     * activeSpecCompleteCount - the number of specs that have been run so far
     * totalSpecCount - the total number of specs (ignoring filter)
     * totalPassedCount - the total number of specs passed across all suites
     * totalFailedCount - the total number of specs failed across all suites
     *
     * runInfo - an object containing info about the current run:
     *     app - name of the app
     *     version - version number
     *     branch - branch the current build is running on
     *     sha - sha of the current build
     *     platform - platform of the current run
     *     startTime - time the run was started
     *     endTime - time the run finished
     *
     * @param {!Object} env The Jasmine environment we're running in.
     * @param {string} activeSuite The suite currently selected in the URL params, or null if all are being run.
     * @param selectedCategories array of selected categories
     */
    function UnitTestReporter(env, activeSuite, selectedCategories) {
        let self = this;

        self.activeSuite = activeSuite;
        self.selectedCategories = selectedCategories;
        self.specFilter = self._createSpecFilter(self.activeSuite, self.selectedCategories);

        self.runInfo = {
            app: brackets.metadata.name,
            version: brackets.metadata.version,
            platform: brackets.platform
        };
        BuildInfoUtils.getBracketsSHA().done(function (branch, sha) {
            self.runInfo.branch = branch;
            self.runInfo.sha = sha;
        });

        self.queryString = new jasmine.QueryString({
            getWindowLocation: function() {
                return window.location;
            }
        });

        let config = {
            stopOnSpecFailure: false,
            stopSpecOnExpectationFailure: false,
            hideDisabled: false
        };
        config.specFilter = self.specFilter;

        env.configure(config);
        // Jasmine's runner uses the specFilter to choose which tests to run.
        // If you selected an option other than "All" this will be a subset of all tests loaded.
        //

        self.suites = {};
        self.jasmineRootSuite = env.topSuite();
        self.specIdToSpecMap = {};
        self.specIdToSuiteMap = {};
        self.specIdToCategoryMap = {};
        self._populateSpecIdMaps(self.jasmineRootSuite);

        self.passed = false;
        self.totalSpecCount = 0;
        self.totalPassedCount = 0;
        self.totalFailedCount = 0;
        self.jasmineRootSuite.children.forEach(function (suite) {
            let specCount = self._countSpecs(suite, config.specFilter);
            self.suites[suite.getFullName()] = {
                id: suite.id,
                name: suite.getFullName(),
                specCount: specCount,
                passedCount: 0,
                failedCount: 0,
                specs: []
            };
            self.totalSpecCount += specCount;
        });

        self.sortedNames = Object.keys(self.suites).sort(function (a, b) {
            a = a.toLowerCase();
            b = b.toLowerCase();
            if (a < b) {
                return -1;
            } else if (a > b) {
                return 1;
            }
            return 0;
        });

        self.activeSpecCount = 0;
        self.activeSpecCompleteCount = 0;

        Object.keys(self.specIdToSpecMap).forEach(specID => {
            if (self.specFilter(self.specIdToSpecMap[specID])) {
                self.activeSpecCount++;
            }
        });

        let htmlReporter = new jasmine.HtmlReporter({
            env: env,
            navigateWithNewParam: function(key, value) {
                return self.queryString.navigateWithNewParam(key, value);
            },
            addToExistingQueryString: function(key, value) {
                return self.queryString.fullStringWithNewParam(key, value);
            },
            getContainer: function() {
                return document.body;
            },
            createElement: function() {
                return document.createElement.apply(document, arguments);
            },
            createTextNode: function() {
                return document.createTextNode.apply(document, arguments);
            },
            timer: new jasmine.Timer()
            //filterSpecs: self.specFilter
        });
        env.addReporter(htmlReporter);
        htmlReporter.initialize();
    }

    /**
     * @private
     * Filters specs by full name.
     * for a matching starting substring.
     */
    UnitTestReporter.prototype._createSpecFilter = function (filterString, selectedCategories = []) {
        let self = this,
            filter = filterString ? filterString.toLowerCase() : undefined;

        return function (spec) {
            // filterString is undefined when no top-level suite is active (e.g. "All", "HTMLUtils", etc.)
            // When undefined, all specs fail this filter and no tests are ran. This is by design.
            // This setup allows the SpecRunner to load initially without automatically running all tests.
            if (filter === undefined) {
                return false;
            }

            let runAll = (selectedCategories.indexOf("all") >= 0);
            // special case "all" suite to run unit, perf, extension, and integration tests
            if (runAll) {
                return true;
            }
            // todo TEST_MODERN if unit tests are selected, make sure there is no category in the heirarchy
            // if not a unit test, make sure the category is selected
            // return (selectedCategories.indexOf("unit") >= 0 && category === undefined) ||
            //     (selectedCategories.indexOf(category) >= 0);

            let specCat = self.specIdToCategoryMap[spec.id];
            if(!selectedCategories.includes(specCat)){
                return false;
            }

            if (filter === "all") {
                return true;
            }

            if (filter === spec.getFullName().toLowerCase()) {
                return true;
            }

            // spec.getFullName() concatenates the names of all containing describe()s.
            // eg. `suite nestedSuite spec1 spec2` . so if we have to allow all in nestedSuite, we have to check for
            // prefix `suite nestedSuite spec1 ` (mind the space). if the space isn't there, it will match
            // `suite nestedSuite spec1a spec2` too, where `spec1a` tests are not to be run.
            return spec.getFullName() === filter
                || spec.getFullName().toLowerCase().startsWith(filter+ " ");
        };
    };

    UnitTestReporter.prototype._populateSpecIdMaps = function (suite, category) {
        const self = this;
        category = _getKnownCategory(suite.description) || category || 'unit';

        // count specs attached directly to this suite
        suite.children.forEach(function (specOrSuite) {
            let isSuite = (specOrSuite.constructor.name === 'SuiteMetadata');
            if(isSuite){
                // recursively count child suites
                self._populateSpecIdMaps(specOrSuite, category);
            } else {
                self.specIdToSuiteMap[specOrSuite.id] = suite;
                self.specIdToSpecMap[specOrSuite.id] = specOrSuite;
                self.specIdToCategoryMap[specOrSuite.id] = category;
            }
        });
    };

    /**
     * @private
     *
     * @param {!jasmine.Suite} suite
     * @param {Function} filter
     * @return {Number} count The number of specs in the given suite (and its descendants) that match the filter.
     */
    UnitTestReporter.prototype._countSpecs = function (suite, filter) {
        let count = 0,
            self = this;

        // count specs attached directly to this suite
        suite.children.forEach(function (specOrSuite) {
            let isSuite = (specOrSuite.constructor.name === 'SuiteMetadata');
            if(isSuite){
                // recursively count child suites
                count += self._countSpecs(specOrSuite, filter);
            } else if (!filter || filter(specOrSuite)) {
                count++;
            }
        });

        return count;
    };

    /**
     * Returns the name of the top-level suite containing the given spec.
     * @param {!jasmine.Spec} spec
     * @return {string} the top level suite name
     */
    UnitTestReporter.prototype.getTopLevelSuiteName = function (spec) {
        var topLevelSuite = self.specIdToSuiteMap[spec.id];

        while (topLevelSuite.parentSuite && topLevelSuite.parentSuite !== self.jasmineRootSuite) {
            topLevelSuite = topLevelSuite.parentSuite;
        }

        return topLevelSuite.getFullName();
    };

    /**
     * Returns a JSON string containing all our public data. See the constructor
     * docs for a list.
     * @return {string} the JSON string
     */
    UnitTestReporter.prototype.toJSON = function () {
        var data = {}, prop;
        for (prop in this) {
            if (this.hasOwnProperty(prop) && prop.charAt(0) !== "_") {
                data[prop] = this[prop];
            }
        }
        return JSON.stringify(data, null, "    ");
    };

    // Handlers for Jasmine callback functions

    UnitTestReporter.prototype.reportRunnerStarting = function (runner) {
        activeReporter = this;
        this.runInfo.startTime = new Date().toString();
        $(this).triggerHandler("runnerStart", [this]);
    };

    UnitTestReporter.prototype.reportRunnerResults = function (runner) {
        this.passed = runner.results().passed();
        this.runInfo.endTime = new Date().toString();
        $(this).triggerHandler("runnerEnd", [this]);
        activeReporter = null;
    };

    UnitTestReporter.prototype.reportSuiteResults = function (suite) {
        if (suite.parentSuite === null) {
            $(this).triggerHandler("suiteEnd", [this, this.suites[suite.getFullName()]]);
        }
    };

    UnitTestReporter.prototype.reportSpecStarting = function (spec) {
        let self = this;
        if (self.specIdToCategoryMap[spec.id] === "performance") {
            self._currentPerfRecord = [];
        }
        $(self).triggerHandler("specStart", [self, spec.getFullName()]);
    };

    UnitTestReporter.prototype.reportSpecResults = function (spec) {
        if (!spec.results().skipped) {
            var specData = this._addSpecResults(spec, spec.results(), this._currentPerfRecord);
            $(this).triggerHandler("specEnd", [this, specData, this.suites[this.getTopLevelSuiteName(spec)]]);
        }
        this._currentPerfRecord = null;
    };

    /**
     * @private
     * Adds the passed/failed counts and failure messages for the given spec to the data for its top level suite,
     * and updates the total counts on the All record.
     * @param {!jasmine.Spec} spec The spec to record
     * @param {Object} results Jasmine result object for that spec
     * @return {Object} the spec data for the given spec, listing whether it passed and any
     * messages/perf data
     */
    UnitTestReporter.prototype._addSpecResults = function (spec, results, perfRecord) {
        var suiteData = this.suites[this.getTopLevelSuiteName(spec)],
            specData = {
                name: spec.getFullName(),
                description: spec.description,
                passed: results.passed()
            };

        this.activeSpecCompleteCount++;

        if (specData.passed) {
            suiteData.passedCount++;
            this.totalPassedCount++;
        } else {
            suiteData.failedCount++;
            this.totalFailedCount++;
        }

        results.getItems().forEach(function (item) {
            var message = SpecRunnerUtils.getResultMessage(item);
            if (message) {
                specData.messages = specData.messages || [];
                specData.messages.push(message);
            }
        });

        if (perfRecord && perfRecord.length) {
            specData.perf = perfRecord;
        }

        suiteData.specs.push(specData);
        return specData;
    };

    // Performance tracking

    UnitTestReporter.prototype._getTestWindowPerf = function () {
        return SpecRunnerUtils.getTestWindow().brackets.test.PerfUtils;
    };

    UnitTestReporter.prototype._logTestWindowMeasurement = function (measureInfo) {
        var value,
            printName = measureInfo.measure.name || measureInfo.name,
            record = {},
            self = this;

        if (measureInfo.measure instanceof RegExp) {
            value = this._currentPerfUtils.searchData(measureInfo.measure);
        } else {
            value = this._currentPerfUtils.getData(measureInfo.measure.id);
        }

        if (value === undefined) {
            value = "(None)";
        }

        if (measureInfo.measure.name && measureInfo.name) {
            printName = measureInfo.measure.name + " - " + measureInfo.name;
        }

        if (measureInfo.operation === "sum") {
            if (Array.isArray(value)) {
                value = value.reduce(function (a, b) { return a + b; });
            }

            printName = "Sum of all " + printName;
        }

        record.name = printName;
        record.value = value;

        if (measureInfo.children) {
            record.children = [];
            measureInfo.children.forEach(function (child) {
                record.children.push(self._logTestWindowMeasurement(child));
            });
        }

        return record;
    };

    /**
     * Records a performance measurement from the test window for the current running spec.
     * @param {!(PerfMeasurement|string)} measure A PerfMeasurement or string key to query PerfUtils for metrics.
     * @param {string} name An optional name or description to print with the measurement name
     * @param {string} operation An optional operation to perform on the measurement data. Currently supports sum.
     */
    UnitTestReporter.prototype.logTestWindow = function (measures, name, operation) {
        var self = this;

        if (!this._currentPerfRecord) {
            return;
        }

        this._currentPerfUtils = this._getTestWindowPerf();

        if (!Array.isArray(measures)) {
            measures = [{measure: measures, name: name, operation: operation}];
        }

        measures.forEach(function (measure) {
            self._currentPerfRecord.push(self._logTestWindowMeasurement(measure));
        });

        this._currentPerfUtils = null;
    };

    /**
     * Clears the current set of performance measurements.
     */
    UnitTestReporter.prototype.clearTestWindow = function () {
        this._getTestWindowPerf().clear();
    };

    /**
     * @return The active unit test reporter, or null if no unit test is running.
     */
    function getActiveReporter() {
        return activeReporter;
    }

    // TODO TEST_MODERN enable for headless. only reporter is integrated nothing else is done.
    // var junitReporter = new jasmineReporters.JUnitXmlReporter({
    //     savePath: '..',
    //     consolidateAll: false
    // });
    // jasmine.getEnv().addReporter(junitReporter);

    // Exports

    exports.UnitTestReporter = UnitTestReporter;
    exports.getActiveReporter = getActiveReporter;
});
