/* global __phantom_writeFile */
(function(global) {
    var UNDEFINED,
        exportObject;

    if (typeof module !== "undefined" && module.exports) {
        exportObject = exports;
    } else {
        exportObject = global.jasmineReporters = global.jasmineReporters || {};
    }

    function trim(str) { return str.replace(/^\s+/, "" ).replace(/\s+$/, "" ); }
    function elapsed(start, end) { return (end - start)/1000; }
    function isFailed(obj) { return obj.status === "failed"; }
    function isSkipped(obj) { return obj.status === "pending"; }
    function isDisabled(obj) { return obj.status === "disabled"; }
    function pad(n) { return n < 10 ? "0"+n : n; }
    function extend(dupe, obj) { // performs a shallow copy of all props of `obj` onto `dupe`
        for (var prop in obj) {
            if (obj.hasOwnProperty(prop)) {
                dupe[prop] = obj[prop];
            }
        }
        return dupe;
    }
    function ISODateString(d) {
        return d.getFullYear() + "-" +
            pad(d.getMonth()+1) + "-" +
            pad(d.getDate()) + "T" +
            pad(d.getHours()) + ":" +
            pad(d.getMinutes()) + ":" +
            pad(d.getSeconds());
    }
    function escapeControlChars(str) {
        // Remove control character from Jasmine default output
        return str.replace(/[\x1b]/g, "");
    }
    function escapeInvalidXmlChars(str) {
        var escaped = str.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");
        return escapeControlChars(escaped);
    }
    function getQualifiedFilename(path, filename, separator) {
        if (path && path.substr(-1) !== separator && filename.substr(0) !== separator) {
            path += separator;
        }
        return path + filename;
    }
    function log(str) {
        var con = global.console || console;
        if (con && con.log) {
            con.log(str);
        }
    }
    /** Hooks into either process.stdout (node) or console.log, if that is not
     *  available (see https://gist.github.com/pguillory/729616).
     */
    function hook_stdout(callback) {
        var old_write;
        var useProcess;
        if(typeof(process)!=="undefined") {
            old_write = process.stdout.write;
            useProcess = true;
            process.stdout.write = (function(write) {
                return function(string, encoding, fd) {
                    write.apply(process.stdout, arguments);
                    callback(string, encoding, fd);
                };
            })(old_write);
        }
        else {
            old_write = console.log.bind(console);
            useProcess = false;
            console.log = (function(write) {
                return function(string) {
                    write.apply(string);
                    callback(string, "utf8");
                };
            })(old_write);
        }
        return function() {
            if(useProcess) {
                process.stdout.write = old_write;
            }
            else {
                console.log = old_write;
            }
        };
    }

    /**
     * A delegate for letting the consumer
     * modify the suite name when it is used inside the junit report.
     * This is useful when running a test suite against multiple capabilities
     * because the report can have unique names for each combination of suite/spec
     * and capability/test environment.
     *
     * @callback modifySuiteName
     * @param {string} fullName
     * @param {object} suite
     */

    /**
     * A delegate for letting the consumer
     * modify the report filename when it is used inside the junit report.
     * This is useful when running a test suite against multiple capabilities
     * because the report can have unique names for each combination of suite/spec
     * and capability/test environment.
     *
     * @callback modifyReportFileName
     * @param {string} suggestedName
     * @param {object} suite
     */

    /**
     * Generates JUnit XML for the given spec run. There are various options
     * to control where the results are written, and the default values are
     * set to create as few .xml files as possible. It is possible to save a
     * single XML file, or an XML file for each top-level `describe`, or an
     * XML file for each `describe` regardless of nesting.
     *
     * Usage:
     *
     * jasmine.getEnv().addReporter(new jasmineReporters.JUnitXmlReporter(options));
     *
     * @param {object} [options]
     * @param {string} [savePath] directory to save the files (default: '')
     * @param {boolean} [consolidateAll] whether to save all test results in a
     *   single file (default: true)
     *   NOTE: if true, {filePrefix} is treated as the full filename (excluding
     *     extension)
     * @param {boolean} [consolidate] whether to save nested describes within the
     *   same file as their parent (default: true)
     *   NOTE: true does nothing if consolidateAll is also true.
     *   NOTE: false also sets consolidateAll to false.
     * @param {boolean} [useDotNotation] whether to separate suite names with
     *   dots instead of spaces, ie "Class.init" not "Class init" (default: true)
     * @param {boolean} [useFullTestName] whether to use the fully qualified Test
     *   name for the TestCase name attribute, ie "Suite Name Spec Name" not
     *   "Spec Name" (default: false)
     * @param {string} [filePrefix] is the string value that is prepended to the
     *   xml output file (default: junitresults-)
     *   NOTE: if consolidateAll is true, the default is simply "junitresults" and
     *     this becomes the actual filename, ie "junitresults.xml"
     * @param {string} [package] is the base package for all test suits that are
     *   handled by this report {default: none}
     * @param {function} [modifySuiteName] a delegate for letting the consumer
     *   modify the suite name when it is used inside the junit report.
     *   This is useful when running a test suite against multiple capabilities
     *   because the report can have unique names for each combination of suite/spec
     *   and capability/test environment.
     * @param {function} [modifyReportFileName] a delegate for letting the consumer
     *   modify the report filename.
     *   This is useful when running a test suite against multiple capabilities
     *   because the report can have unique names for each combination of suite/spec
     *   and capability/test environment.
     * @param {string} [stylesheetPath] is the string value that specifies a path
     *   to an XSLT stylesheet to add to the junit XML file so that it can be
     *   opened directly in a browser. (default: none, no xml-stylesheet tag is added)
     * @param {function} [suppressDisabled] if true, will not include `disabled=".."` in XML output
     * @param {function} [systemOut] a delegate for letting the consumer add content
     *   to a <system-out> tag as part of each <testcase> spec output. If provided,
     *   it is invoked with the spec object and the fully qualified suite as filename.
     * @param {boolean} [captureStdout] enables capturing all output from stdout as spec output in the
     * xml-output elements of the junit reports {default: false}. If a systemOut delegate is defined and captureStdout
     * is true, the output of the spec can be accessed via spec._stdout
     */
    exportObject.JUnitXmlReporter = function(options) {
        var self = this;
        self.started = false;
        self.finished = false;
        // sanitize arguments
        options = options || {};
        self.savePath = options.savePath || "";
        self.consolidate = options.consolidate === UNDEFINED ? true : options.consolidate;
        self.consolidateAll = self.consolidate !== false && (options.consolidateAll === UNDEFINED ? true : options.consolidateAll);
        self.useDotNotation = options.useDotNotation === UNDEFINED ? true : options.useDotNotation;
        self.useFullTestName = options.useFullTestName === UNDEFINED ? false : options.useFullTestName;
        if (self.consolidateAll) {
            self.filePrefix = options.filePrefix || "junitresults";
        } else {
            self.filePrefix = typeof options.filePrefix === "string" ? options.filePrefix : "junitresults-";
        }
        self.package = typeof(options.package) === "string" ? escapeInvalidXmlChars(options.package) : UNDEFINED;
        self.stylesheetPath = typeof(options.stylesheetPath) === "string" && options.stylesheetPath || UNDEFINED;

        if(options.modifySuiteName && typeof options.modifySuiteName !== "function") {
            throw new Error('option "modifySuiteName" must be a function');
        }
        if(options.modifyReportFileName && typeof options.modifyReportFileName !== "function") {
            throw new Error('option "modifyReportFileName" must be a function');
        }
        if(options.systemOut && typeof options.systemOut !== "function") {
            throw new Error('option "systemOut" must be a function');
        }

        self.captureStdout = options.captureStdout || false;
        if(self.captureStdout && !options.systemOut) {
            options.systemOut = function (spec) {
                return spec._stdout;
            };
        }
        self.removeStdoutWrapper = undefined;

        var delegates = {};
        delegates.modifySuiteName = options.modifySuiteName;
        delegates.modifyReportFileName = options.modifyReportFileName;
        delegates.systemOut = options.systemOut;

        self.logEntries = [];

        var suites = [],
            currentSuite = null,
            // when use use fit, jasmine never calls suiteStarted / suiteDone, so make a fake one to use
            fakeFocusedSuite = {
                id: "focused",
                description: "focused specs",
                fullName: "focused specs"
            };

        var __suites = {}, __specs = {};
        function getSuite(suite) {
            __suites[suite.id] = extend(__suites[suite.id] || {}, suite);
            return __suites[suite.id];
        }
        function getSpec(spec, suite) {
            __specs[spec.id] = extend(__specs[spec.id] || {}, spec);
            var ret = __specs[spec.id];
            if (suite && !ret._suite) {
                ret._suite = suite;
                suite._specs.push(ret);
            }
            return ret;
        }

        self.jasmineStarted = function() {
            exportObject.startTime = new Date();
            self.started = true;
            if(self.captureStdout) {
                self.removeStdoutWrapper = hook_stdout(function(string) {
                    self.logEntries.push(string);
                });
            }
        };
        self.suiteStarted = function(suite) {
            suite = getSuite(suite);
            suite._startTime = new Date();
            suite._specs = [];
            suite._suites = [];
            suite._failures = 0;
            suite._skipped = 0;
            suite._disabled = 0;
            suite._parent = currentSuite;
            if (!currentSuite) {
                suites.push(suite);
            } else {
                currentSuite._suites.push(suite);
            }
            currentSuite = suite;
        };
        self.specStarted = function(spec) {
            if (!currentSuite) {
                // focused spec (fit) -- suiteStarted was never called
                self.suiteStarted(fakeFocusedSuite);
            }
            spec = getSpec(spec, currentSuite);
            spec._startTime = new Date();
            spec._stdout = "";
        };
        self.specDone = function(spec) {
            spec = getSpec(spec, currentSuite);
            spec._endTime = new Date();
            storeOutput(spec);
            if (isSkipped(spec)) { spec._suite._skipped++; }
            if (isDisabled(spec)) { spec._suite._disabled++; }
            if (isFailed(spec)) { spec._suite._failures += spec.failedExpectations.length; }
        };
        self.suiteDone = function(suite) {
            suite = getSuite(suite);
            if (suite._parent === UNDEFINED) {
                // disabled suite (xdescribe) -- suiteStarted was never called
                self.suiteStarted(suite);
            }
            suite._endTime = new Date();
            currentSuite = suite._parent;
        };
        self.jasmineDone = function() {
            if (currentSuite) {
                // focused spec (fit) -- suiteDone was never called
                self.suiteDone(fakeFocusedSuite);
            }
            var output = "";
            var testSuitesResults = { disabled: 0, failures: 0, tests: 0, time: 0 };
            for (var i = 0; i < suites.length; i++) {
                output += self.getOrWriteNestedOutput(suites[i]);
                // retrieve nested suite data to include in the testsuites tag
                var suiteResults = self.getNestedSuiteData(suites[i]);
                for (var key in suiteResults) {
                    testSuitesResults[key] += suiteResults[key];
                }
            }
            // if we have anything to write here, write out the consolidated file
            if (output) {
                wrapOutputAndWriteFile(self.filePrefix, output, testSuitesResults);
            }
            //log("Specs skipped but not reported (entire suite skipped or targeted to specific specs)", totalSpecsDefined - totalSpecsExecuted + totalSpecsDisabled);

            self.finished = true;
            // this is so phantomjs-testrunner.js can tell if we're done executing
            exportObject.endTime = new Date();
            if(self.removeStdoutWrapper) {
                self.removeStdoutWrapper();
            }
        };

        self.formatSuiteData = function(suite) {
            return {
                disabled: suite._disabled || 0,
                failures: suite._failures || 0,
                tests: suite._specs.length || 0,
                time: (suite._endTime.getTime() - suite._startTime.getTime()) || 0
            };
        };

        self.getNestedSuiteData = function (suite) {
            var suiteResults = self.formatSuiteData(suite);
            for (var i = 0; i < suite._suites.length; i++) {
                var childSuiteResults = self.getNestedSuiteData(suite._suites[i]);
                for (var key in suiteResults) {
                    suiteResults[key] += childSuiteResults[key];
                }
            }
            return suiteResults;
        };

        self.getOrWriteNestedOutput = function(suite) {
            var output = suiteAsXml(suite);
            for (var i = 0; i < suite._suites.length; i++) {
                output += self.getOrWriteNestedOutput(suite._suites[i]);
            }
            if (self.consolidateAll || self.consolidate && suite._parent) {
                return output;
            } else {
                // if we aren't supposed to consolidate output, just write it now
                wrapOutputAndWriteFile(generateFilename(suite), output, self.getNestedSuiteData(suite));
                return "";
            }
        };

        self.writeFile = function(filename, text) {
            var errors = [];
            var path = self.savePath;

            function phantomWrite(path, filename, text) {
                // turn filename into a qualified path
                filename = getQualifiedFilename(path, filename, window.fs_path_separator);
                // write via a method injected by phantomjs-testrunner.js
                __phantom_writeFile(filename, text);
            }

            function nodeWrite(path, filename, text) {
                var fs = require("fs");
                var nodejs_path = require("path");
                require("mkdirp").sync(path); // make sure the path exists
                var filepath = nodejs_path.join(path, filename);
                var xmlfile = fs.openSync(filepath, "w");
                fs.writeSync(xmlfile, text, 0);
                fs.closeSync(xmlfile);
                return;
            }
            // Attempt writing with each possible environment.
            // Track errors in case no write succeeds
            try {
                phantomWrite(path, filename, text);
                return;
            } catch (e) { errors.push("  PhantomJs attempt: " + e.message); }
            try {
                nodeWrite(path, filename, text);
                return;
            } catch (f) { errors.push("  NodeJS attempt: " + f.message); }

            // If made it here, no write succeeded.  Let user know.
            log("Warning: writing junit report failed for '" + path + "', '" +
                filename + "'. Reasons:\n" +
                errors.join("\n")
            );
        };

        /******** Helper functions with closure access for simplicity ********/
        function generateFilename(suite) {
            return self.filePrefix + getFullyQualifiedSuiteName(suite, true) + ".xml";
        }

        function getFullyQualifiedSuiteName(suite, isFilename) {
            var fullName;
            if (self.useDotNotation || isFilename) {
                fullName = suite.description;
                for (var parent = suite._parent; parent; parent = parent._parent) {
                    fullName = parent.description + "." + fullName;
                }
            } else {
                fullName = suite.fullName;
            }

            // Either remove or escape invalid XML characters
            if (isFilename) {
                var fileName = "",
                    rFileChars = /[\w.]/,
                    chr;
                while (fullName.length) {
                    chr = fullName[0];
                    fullName = fullName.substr(1);
                    if (rFileChars.test(chr)) {
                        fileName += chr;
                    }
                }
                if(delegates.modifyReportFileName) {
                    fileName = delegates.modifyReportFileName(fileName, suite);
                }
                return fileName;
            } else {

                if(delegates.modifySuiteName) {
                    fullName = delegates.modifySuiteName(fullName, suite);
                }

                return escapeInvalidXmlChars(fullName);
            }
        }

        function suiteAsXml(suite) {
            var xml = '\n <testsuite name="' + getFullyQualifiedSuiteName(suite) + '"';
            xml += ' timestamp="' + ISODateString(suite._startTime) + '"';
            xml += ' hostname="localhost"'; // many CI systems like Jenkins don't care about this, but junit spec says it is required
            xml += ' time="' + elapsed(suite._startTime, suite._endTime) + '"';
            xml += ' errors="0"';
            xml += ' tests="' + suite._specs.length + '"';
            xml += ' skipped="' + suite._skipped + '"';
            if (!options.suppressDisabled) {
                xml += ' disabled="' + suite._disabled + '"';
            }
            // Because of JUnit's flat structure, only include directly failed tests (not failures for nested suites)
            xml += ' failures="' + suite._failures + '"';
            if (self.package) {
                xml += ' package="' + self.package + '"';
            }
            xml += ">";

            for (var i = 0; i < suite._specs.length; i++) {
                xml += specAsXml(suite._specs[i]);
            }
            xml += "\n </testsuite>";
            return xml;
        }
        function specAsXml(spec) {
            var testName = self.useFullTestName ? spec.fullName : spec.description;

            var xml = '\n  <testcase classname="' + getFullyQualifiedSuiteName(spec._suite) + '"';
            xml += ' name="' + escapeInvalidXmlChars(testName) + '"';
            xml += ' time="' + elapsed(spec._startTime, spec._endTime) + '"';

            var testCaseBody = "";
            if (isSkipped(spec) || isDisabled(spec)) {
                if (spec.pendingReason) {
                    testCaseBody = '\n   <skipped message="' + trim(escapeInvalidXmlChars(spec.pendingReason)) + '" />';
                } else {
                    testCaseBody = "\n   <skipped />";
                }
            } else if (isFailed(spec)) {
                for (var i = 0, failure; i < spec.failedExpectations.length; i++) {
                    failure = spec.failedExpectations[i];
                    testCaseBody += '\n   <failure type="' + (failure.matcherName || "exception") + '"';
                    testCaseBody += ' message="' + trim(escapeInvalidXmlChars(failure.message))+ '"';
                    testCaseBody += ">";
                    testCaseBody += "<![CDATA[" + trim(escapeControlChars(failure.stack || failure.message)) + "]]>";
                    testCaseBody += "\n   </failure>";
                }
            }

            if (testCaseBody || delegates.systemOut) {
                xml += ">" + testCaseBody;
                if (delegates.systemOut) {
                    xml += "\n   <system-out>" + trim(escapeInvalidXmlChars(delegates.systemOut(spec, getFullyQualifiedSuiteName(spec._suite, true)))) + "</system-out>";
                }
                xml += "\n  </testcase>";
            } else {
                xml += " />";
            }
            return xml;
        }
        function storeOutput(spec) {
            if(self.captureStdout && !isSkipped(spec)) {
                if(!isSkipped(spec) && !isDisabled(spec)) {
                    spec._stdout = self.logEntries.join("") + "\n";
                }
                self.logEntries.splice(0, self.logEntries.length);
            }
        }
        function getPrefix(results) {
            results = results ? results : {};
            // To remove complexity and be more DRY about the silly preamble and <testsuites> element
            var prefix = '<?xml version="1.0" encoding="UTF-8" ?>';
            if (self.stylesheetPath) {
                prefix += '\n<?xml-stylesheet type="text/xsl" href="' + self.stylesheetPath + '" ?>';
            }
            prefix += "\n<testsuites " + (options.suppressDisabled ? "" : 'disabled="' + results.disabled + '" ') + 'errors="0" failures="' + results.failures +
                '" tests="' + results.tests + '" time="' + results.time/1000 + '">';
            return prefix;
        }
        var suffix = "\n</testsuites>";
        function wrapOutputAndWriteFile(filename, text, testSuitesResults) {
            if (filename.substr(-4) !== ".xml") { filename += ".xml"; }
            self.writeFile(filename, (getPrefix(testSuitesResults) + text + suffix));
        }
    };
})(this);
