/*jslint plusplus: true, vars: true, nomen: true */
/*global define */

define(function (require, exports, module) {

    function ExpectedError() {
        Error.apply(this, arguments);
        this.message = arguments[0];
    }
    ExpectedError.prototype = new Error();
    ExpectedError.prototype.name = "ExpectedError";
    ExpectedError.prototype.toString = function () {
        return this.message;
    };

    module.exports = ExpectedError;
});
