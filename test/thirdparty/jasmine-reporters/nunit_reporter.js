/* global __phantom_writeFile */
(function(global) {
    var UNDEFINED,
        exportObject;

    if (typeof module !== "undefined" && module.exports) {
        exportObject = exports;
    } else {
        exportObject = global.jasmineReporters = global.jasmineReporters || {};
    }

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
    function escapeInvalidXmlChars(str) {
        return str.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");
    }
    function dateString(date) {
        var year = date.getFullYear();
        var month = date.getMonth()+1; // 0-based
        var day = date.getDate();
        return year + "-" + pad(month) + "-" + pad(day);
    }
    function timeString(date) {
        var hours = date.getHours();
        var minutes = date.getMinutes();
        var seconds = date.getSeconds();
        return pad(hours) + ":" + pad(minutes) + ":" + pad(seconds);
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


    /**
     * Generates NUnit XML for the given spec run.
     * Allows the test results to be used in java based CI
     * systems like Jenkins.
     *
     * Originally from https://github.com/gmusick/jasmine-reporters. Adapted
     * to support file output via PhantomJS/Rhino/Node.js like JUnitXmlReporter.
     * Also fixed a couple minor bugs (ie month being reported incorrectly) and
     * added a few options to control how / where the file is generated.
     *
     * Usage:
     *
     * jasmine.getEnv().addReporter(new jasmineReporters.NUnitXmlReporter(options);
     *
     * @param {object} [options]
     * @param {string} [options.savePath] directory to save the files (default: '')
     * @param {string} [options.filename] name of xml output file (default: 'nunitresults.xml')
     * @param {string} [options.reportName] name for parent test-results node (default: 'Jasmine Results')
     */
    exportObject.NUnitXmlReporter = function(options) {
        var self = this;
        self.started = false;
        self.finished = false;
        // sanitize arguments
        options = options || {};
        self.savePath = options.savePath || "";
        self.filename = options.filename || "nunitresults.xml";
        self.reportName = options.reportName || "Jasmine Results";

        var suites = [],
            currentSuite = null,
            totalSpecsExecuted = 0,
            totalSpecsSkipped = 0,
            totalSpecsDisabled = 0,
            totalSpecsFailed = 0,
            totalSpecsDefined,
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

        self.jasmineStarted = function(summary) {
            totalSpecsDefined = summary && summary.totalSpecsDefined || NaN;
            exportObject.startTime = new Date();
            self.started = true;
        };
        self.suiteStarted = function(suite) {
            suite = getSuite(suite);
            suite._startTime = new Date();
            suite._specs = [];
            suite._suites = [];
            suite._failures = 0;
            suite._nestedFailures = 0;
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
        };
        self.specDone = function(spec) {
            spec = getSpec(spec, currentSuite);
            spec._endTime = new Date();
            if (isSkipped(spec)) {
                spec._suite._skipped++;
                totalSpecsSkipped++;
            }
            if (isDisabled(spec)) {
                spec._suite._disabled++;
                totalSpecsDisabled++;
            }
            if (isFailed(spec)) {
                spec._suite._failures++;
                // NUnit wants to know nested failures, so add for parents too
                for (var parent=spec._suite._parent; parent; parent=parent._parent) {
                    parent._nestedFailures++;
                }
                totalSpecsFailed++;
            }
            totalSpecsExecuted++;
        };
        self.suiteDone = function(suite) {
            suite = getSuite(suite);
            if (suite._parent === UNDEFINED) {
                // disabled suite (xdescribe) -- suiteStarted was never called
                self.suiteStarted(suite);
                suite._disabled = true;
            }
            suite._endTime = new Date();
            currentSuite = suite._parent;
        };
        self.jasmineDone = function() {
            if (currentSuite) {
                // focused spec (fit) -- suiteDone was never called
                self.suiteDone(fakeFocusedSuite);
            }
            self.writeFile(resultsAsXml());
            //log("Specs skipped but not reported (entire suite skipped or targeted to specific specs)", totalSpecsDefined - totalSpecsExecuted + totalSpecsDisabled);

            self.finished = true;
            // this is so phantomjs-testrunner.js can tell if we're done executing
            exportObject.endTime = new Date();
        };

        self.writeFile = function(text) {
            var errors = [];
            var path = self.savePath;
            var filename = self.filename;

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
            log("Warning: writing nunit report failed for '" + path + "', '" +
                filename + "'. Reasons:\n" +
                errors.join("\n")
            );
        };

        /******** Helper functions with closure access for simplicity ********/
        function resultsAsXml() {
            var date = new Date(),
                totalSpecs = totalSpecsDefined || totalSpecsExecuted,
                disabledSpecs = totalSpecs - totalSpecsExecuted + totalSpecsDisabled,
                skippedSpecs = totalSpecsSkipped + disabledSpecs;

            var xml = '<?xml version="1.0" encoding="utf-8" ?>';
            xml += '\n<test-results name="' + escapeInvalidXmlChars(self.reportName) + '"';
            xml += ' total="' + totalSpecs + '"';
            xml += ' failures="' + totalSpecsFailed + '"';
            xml += ' not-run="' + skippedSpecs + '"';
            xml += ' date="' + dateString(date) + '"';
            xml += ' time="' + timeString(date) + '"';
            xml += ">";

            for (var i=0; i<suites.length; i++) {
                xml += suiteAsXml(suites[i], " ");
            }
            xml += "\n</test-results>";
            return xml;
        }
    };

    function suiteAsXml(suite, indent) {
        indent = indent || "";
        var i, xml = "\n" + indent + "<test-suite";
        xml += ' name="' + escapeInvalidXmlChars(suite.description) + '"';
        xml += ' executed="' + !suite._disabled + '"';
        xml += ' success="' + !(suite._failures || suite._nestedFailures) + '"';
        xml += ' time="' + elapsed(suite._startTime, suite._endTime) + '"';
        xml += ">";
        xml += "\n" + indent + " <results>";

        for (i=0; i<suite._suites.length; i++) {
            xml += suiteAsXml(suite._suites[i], indent+"  ");
        }
        for (i=0; i<suite._specs.length; i++) {
            xml += specAsXml(suite._specs[i], indent+"  ");
        }
        xml += "\n" + indent + " </results>";
        xml += "\n" + indent + "</test-suite>";
        return xml;
    }
    function specAsXml(spec, indent) {
        indent = indent || "";
        var xml = "\n" + indent + "<test-case";
        xml += ' name="' + escapeInvalidXmlChars(spec.description) + '"';
        xml += ' executed="' + !(isSkipped(spec) || isDisabled(spec)) + '"';
        xml += ' success="' + !isFailed(spec) + '"';
        xml += ' time="' + elapsed(spec._startTime, spec._endTime) + '"';
        xml += ">";
        for (var i = 0, failure; i < spec.failedExpectations.length; i++) {
            failure = spec.failedExpectations[i];
            xml += "\n" + indent + " <failure>";
            xml += "\n" + indent + "  <message><![CDATA[" + failure.message + "]]></message>";
            xml += "\n" + indent + "  <stack-trace><![CDATA[" + failure.stack + "]]></stack-trace>";
            xml += "\n" + indent + " </failure>";
        }
        xml += "\n" + indent + "</test-case>";
        return xml;
    }
})(this);
