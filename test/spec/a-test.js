/*global describe, beforeEach, it, runs, waitsFor, waitsForDone, waitsForFail, expect */
define(function (require, exports, module) {
    describe("suite1", function() {
        beforeEach(function() {
            console.log("before each");
        });

        describe("nested suite1", function() {

            it("nested spec1 pass", function() {
                expect(true).toBeTruthy();
            });

        });

        it("spec 1 should pass", function() {
            expect(true).toBeTruthy();
        });

        it("spec 1 should fail", function() {
            expect(true).toBeFalsy();
        });
    });

});
