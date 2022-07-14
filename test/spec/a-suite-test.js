/*global describe, beforeEach, it, runs, waitsFor, waitsForDone, waitsForFail, expect */
// sample tests to develop the unit test spec runner framework
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

            function timer() {
                return new Promise(resolve=>{
                    setTimeout(() => {
                        resolve("hello");
                    }, 100);
                });
            }

            it("I am an async test", async function() {
                let msg = await timer();
                expect(msg).toEqual("hello");
            });
        });

    });

    describe("passing suite 3", function() {

        it("spec3 pass", function() {
            expect(true).toBeTruthy();
        });
    });

});
