(function(global) {
    var exportObject;

    if (typeof module !== "undefined" && module.exports) {
        exportObject = exports;
    } else {
        exportObject = global.jasmineReporters = global.jasmineReporters || {};
    }

    function elapsed(start, end) { return (end - start); }
    function isFailed(obj) { return obj.status === "failed"; }
    function isSkipped(obj) { return obj.status === "pending"; }
    function isDisabled(obj) { return obj.status === "disabled"; }
    function isPassed(obj) { return obj.status === "passed"; }
    function extend(dupe, obj) { // performs a shallow copy of all props of `obj` onto `dupe`
        for (var prop in obj) {
            if (obj.hasOwnProperty(prop)) {
                dupe[prop] = obj[prop];
            }
        }
        return dupe;
    }

    /**
     * Basic reporter that outputs spec results for the AppVeyor build system
     *
     * Usage:
     *
     * jasmine.getEnv().addReporter(new jasmineReporters.AppVeyorReporter(options));
     *
     * @param {object} [options]
     * @param {number} [options.batchSize] spec batch size to report to AppVeyor (default: 50)
     * @param {number} [options.verbosity] meaningful values are 0 through 2; anything
     *  greater than 2 is treated as 2 (default: 0)
     * @param {boolean} [options.color] print in color or not (default: true)
     */
    var DEFAULT_BATCHSIZE = 50,
        DEFAULT_VERBOSITY = 0,
        DEFAULT_COLOR = true,
        ATTRIBUTES_TO_ANSI = {
            "off": 0,
            "bold": 1,
            "red": 31,
            "green": 32,
            "yellow": 33,
            "blue": 34,
            "magenta": 35,
            "cyan": 36
        };

    exportObject.AppVeyorReporter = function(options) {
        var self = this;

        self.options = options || {};
        self.batchSize = typeof self.options.batchSize === "number" ? self.options.batchSize : DEFAULT_BATCHSIZE;
        self.verbosity = typeof self.options.verbosity === "number" ? self.options.verbosity : DEFAULT_VERBOSITY;
        self.color = typeof self.options.color === "boolean" ? self.options.color : DEFAULT_COLOR;

        self.unreportedSpecs = [];

        setApi();

        var __specs = {};
        // add or get excisting spec from __specs dictionary
        function getSpec(spec) {
            __specs[spec.id] = extend(__specs[spec.id] || {}, spec);
            return __specs[spec.id];
        }

        // set API host information
        function setApi() {
            self.api = {};
            if(process && process.env && process.env.APPVEYOR_API_URL) {
                var fullUrl = process.env.APPVEYOR_API_URL;

                var urlParts = fullUrl.split("/")[2].split(":");
                self.api = {
                    host: urlParts[0],
                    port: urlParts[1],
                    endpoint: "/api/tests/batch"
                };
            }
            else {
                throw Error("Not running in AppVeyor environment");
            }
        }

        // log object to handle verbosity
        var log = {
            info: function(str) {
                if(self.verbosity > 0) {
                    log.logOutput(str);
                }
            },
            debug: function(str) {
                if(self.verbosity > 1) {
                    log.logOutput(str);
                }
            },
            logOutput: function(str) {
                var con = global.console || console;
                if (con && con.log) {
                    con.log(str);
                }
            }
        };

        function inColor(string, color) {
            var color_attributes = color && color.split("+"),
                ansi_string = "",
                i;

            if (!string || !string.length) {
                return "";
            }

            if (!self.color || !color_attributes) {
                return string;
            }

            for(i = 0; i < color_attributes.length; i++) {
                ansi_string += "\u001b[" + ATTRIBUTES_TO_ANSI[color_attributes[i]] + "m";
            }
            ansi_string += string + "\u001b[" + ATTRIBUTES_TO_ANSI["off"] + "m";

            return ansi_string;
        }

        // post batch to AppVeyor API
        function postSpecsToAppVeyor() {
            log.info(inColor("Posting spec batch to AppVeyor API", "magenta"));

            var postData = JSON.stringify(self.unreportedSpecs);

            var options = {
                host: self.api.host,
                path: self.api.endpoint,
                port: self.api.port,
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                }
            };

            var http = require("http");
            var req =  http.request(options, function(res) {
                log.debug(inColor("  STATUS: " + res.statusCode, "yellow"));
                log.debug(inColor("  HEADERS: " + JSON.stringify(res.headers), "yellow"));
                res.setEncoding("utf8");

                res.on("data", function (chunk) {
                    log.debug(inColor("  BODY: " + chunk, "yellow"));
                });

                res.on("end", function() {
                    log.debug(inColor("    RESPONSE END", "yellow"));
                });
            });

            req.on("error", function(e) {
                log.debug(inColor("API request error: " + e.message, "red"));
            });

            req.write(postData);
            req.end();

            self.unreportedSpecs = [];
        }

        // detect spec outcome and return AppVeyor literals
        function getOutcome(spec) {
            var outcome = "None";

            if(isFailed(spec)) {
                outcome = "Failed";
            }

            if(isDisabled(spec)) {
                outcome = "Ignored";
            }

            if(isSkipped(spec)) {
                outcome = "Skipped";
            }

            if(isPassed(spec)) {
                outcome = "Passed";
            }

            return outcome;
        }

        // map jasmine spec to AppVeyor test result
        function mapSpecToResult(spec) {
            var firstFailedExpectation = spec.failedExpectations[0] || {};

            var result = {
                testName: spec.fullName,
                testFramework: "jasmine2",
                durationMilliseconds: elapsed(spec.__startTime, spec.__endTime),

                outcome: getOutcome(spec),
                ErrorMessage: firstFailedExpectation.message,
                ErrorStackTrace: firstFailedExpectation.stack
            };

            return result;
        }

        self.specStarted = function(spec) {
            spec = getSpec(spec);
            spec.__startTime = new Date();
        };

        self.specDone = function(spec) {
            spec = getSpec(spec);
            spec.__endTime = new Date();

            var avr = mapSpecToResult(spec);

            self.unreportedSpecs.push(avr);

            if(self.unreportedSpecs.length > self.batchSize) {
                postSpecsToAppVeyor();
            }
        };

        self.jasmineDone = function() {
            if(self.unreportedSpecs.length > 0) {
                postSpecsToAppVeyor();
            }

            // this is so phantomjs-testrunner.js can tell if we're done executing
            exportObject.endTime = new Date();
        };
    };
})(this);
