/*global describe, beforeEach, it, runs, waitsFor, waitsForDone, waitsForFail, expect */
define(function (require, exports, module) {
    describe("when song has been paused", function() {
        beforeEach(function() {
            console.log("before each");
        });

        it("should pass", function() {
            expect(true).toBeTruthy();
        });

        it("should fail", function() {
            expect(true).toBeFalsy();
        });
    });

});
