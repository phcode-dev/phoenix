/*global describe, beforeEach, it, runs, waitsFor, waitsForDone, waitsForFail, expect */
define(function (require, exports, module) {
    describe("suite2", function() {
        this.category = "performance";
        beforeEach(function() {
            console.log("before each");
        });

        it("spec 2 should pass", function() {
            expect(true).toBeTruthy();
        });

        it("spec 2 should fail", function() {
            expect(true).toBeFalsy();
        });

        it("spec2 I throws", function() {
            throw new Error("i throw");
        });
    });

    describe("integration:suite2a", function() {

        it("spec2a pass", function() {
            expect(true).toBeTruthy();
        });

        describe("nested suite2a", function() {

            it("nested spec2a pass", function() {
                expect(true).toBeTruthy();
            });
        });

    });

    describe("passing suite 3", function() {

        it("spec3 pass", function() {
            expect(true).toBeTruthy();
        });
    });

});
