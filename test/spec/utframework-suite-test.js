/*global describe, beforeEach, it, runs, waitsFor, waitsForDone, waitsForFail, expect */
// sample tests to develop the unit test spec runner framework
define(function (require, exports, module) {
    describe("unit test framework suite test", function() {
        beforeEach(function() {
            console.log("before each");
            expect(true).toBeTruthy();
        });

        it("spec async work", function() {
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

    describe("integration:integration test category works test", function() {

        it("should pass", function() {
            expect(true).toBeTruthy();
        });
    });

});
