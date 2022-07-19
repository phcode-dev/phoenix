(function(global) {
    var UNDEFINED,
        exportObject;

    if (typeof module !== "undefined" && module.exports) {
        exportObject = exports;
    } else {
        exportObject = global.jasmineReporters = global.jasmineReporters || {};
    }

    function isFailed(obj) { return obj.status === "failed"; }
    function isSkipped(obj) { return obj.status === "pending"; }
    function isDisabled(obj) { return obj.status === "disabled"; }
    function pad(n) { return n < 10 ? "0"+n : n; }
    function padThree(n) { return n < 10 ? "00"+n : n < 100 ? "0"+n : n; }
    function extend(dupe, obj) { // performs a shallow copy of all props of `obj` onto `dupe`
        for (var prop in obj) {
            if (obj.hasOwnProperty(prop)) {
                dupe[prop] = obj[prop];
            }
        }
        return dupe;
    }
    function ISODateString(d) {
        return d.getUTCFullYear() + "-" +
            pad(d.getUTCMonth()+1) + "-" +
            pad(d.getUTCDate()) + "T" +
            pad(d.getUTCHours()) + ":" +
            pad(d.getUTCMinutes()) + ":" +
            pad(d.getUTCSeconds()) + "." +
            // TeamCity wants ss.SSS
            padThree(d.getUTCMilliseconds());
    }
    function log(str) {
        var con = global.console || console;
        if (con && con.log) {
            con.log(str);
        }
    }


    /**
     * Basic reporter that outputs spec results for the TeamCity build system
     *
     * Usage:
     *
     * jasmine.getEnv().addReporter(new jasmineReporters.TeamCityReporter());
     */
    exportObject.TeamCityReporter = function(options) {
        options = options || {};
        var self = this;
        self.started = false;
        self.finished = false;

        if(options.modifySuiteName && typeof options.modifySuiteName !== "function") {
            throw new Error('option "modifySuiteName" must be a function');
        }

        var delegates = {};
        delegates.modifySuiteName = options.modifySuiteName;

        var currentSuite = null,
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
        function getSpec(spec) {
            __specs[spec.id] = extend(__specs[spec.id] || {}, spec);
            return __specs[spec.id];
        }

        self.jasmineStarted = function() {
            exportObject.startTime = new Date();
            self.started = true;
            tclog("progressStart 'Running Jasmine Tests'");
        };
        self.suiteStarted = function(suite) {
            suite = getSuite(suite);
            suite._parent = currentSuite;
            currentSuite = suite;
            tclog("testSuiteStarted", {
                name: suite.description
            });
        };
        self.specStarted = function(spec) {
            if (!currentSuite) {
                // focused spec (fit) -- suiteStarted was never called
                self.suiteStarted(fakeFocusedSuite);
            }
            spec = getSpec(spec);
            tclog("testStarted", {
                name: spec.description,
                captureStandardOutput: "true"
            });
        };
        self.specDone = function(spec) {
            spec = getSpec(spec);
            if (isSkipped(spec) || isDisabled(spec)) {
                tclog("testIgnored", {
                    name: spec.description
                });
            }
            // TeamCity specifies there should only be a single `testFailed`
            // message, so we'll only grab the first failedExpectation
            if (isFailed(spec) && spec.failedExpectations.length) {
                var failure = spec.failedExpectations[0];
                tclog("testFailed", {
                    name: spec.description,
                    message: failure.message,
                    details: failure.stack
                });
            }
            tclog("testFinished", {
                name: spec.description
            });
        };
        self.suiteDone = function(suite) {
            suite = getSuite(suite);
            if (suite._parent === UNDEFINED) {
                // disabled suite (xdescribe) -- suiteStarted was never called
                self.suiteStarted(suite);
            }
            tclog("testSuiteFinished", {
                name: suite.description
            });
            currentSuite = suite._parent;
        };
        self.jasmineDone = function() {
            if (currentSuite) {
                // focused spec (fit) -- suiteDone was never called
                self.suiteDone(fakeFocusedSuite);
            }
            tclog("progressFinish 'Running Jasmine Tests'");

            self.finished = true;
            // this is so phantomjs-testrunner.js can tell if we're done executing
            exportObject.endTime = new Date();
        };

        // shorthand for logging TeamCity messages
        // defined here because it needs access to the `delegates` closure variable
        function tclog(message, attrs) {
            var str = "##teamcity[" + message;
            if (typeof(attrs) === "object") {
                if (!("timestamp" in attrs)) {
                    attrs.timestamp = new Date();
                }
                for (var prop in attrs) {
                    if (attrs.hasOwnProperty(prop)) {
                        if(delegates.modifySuiteName && message.indexOf("testSuite") === 0 && prop === "name") {
                            attrs[prop] = delegates.modifySuiteName(attrs[prop]);
                        }
                        str += " " + prop + "='" + escapeTeamCityString(attrs[prop]) + "'";
                    }
                }
            }
            str += "]";
            log(str);
        }
    };

    function escapeTeamCityString(str) {
        if(!str) {
            return "";
        }
        if (Object.prototype.toString.call(str) === "[object Date]") {
            return ISODateString(str);
        }

        return str.replace(/\|/g, "||")
            .replace(/'/g, "|'")
            .replace(/\n/g, "|n")
            .replace(/\r/g, "|r")
            .replace(/\u0085/g, "|x")
            .replace(/\u2028/g, "|l")
            .replace(/\u2029/g, "|p")
            .replace(/\[/g, "|[")
            .replace(/]/g, "|]");
    }
})(this);
