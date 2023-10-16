// @ts-check
/*global process*/
const { test, expect } = require("@playwright/test");

const testDist = process.env.TEST_DIST === 'true';
let baseURL = 'http://localhost:5000/test/SpecRunner.html';
if(testDist){
   console.log("Testing distribution in: dist-test folder. Make sure to `npm run release:dev/prod` before running this mode.");
    baseURL = 'http://localhost:5000/dist-test/test/SpecRunner.html';
}
console.log("Playwright using base url for tests: ", baseURL);

test("Execute all unit tests", async ({ page }) => {
    await page.goto(
        `${baseURL}?spec=all&category=unit`
    );

    // Expose a function to the page
    await page.exposeFunction('testRunnerLogToConsole', (...args) => {
        console.log(...args);
    });
    await page.exposeFunction('testRunnerErrorToConsole', (...args) => {
        console.error(...args);
    });

    // wait for spec runner to complete
    await page.waitForFunction(() => window.playWrightRunComplete);
    const result = await page.evaluate(() => {
        return Promise.resolve(window.testResults);
    });
    expect(result.errors).toStrictEqual({});

    const externalJasmineFailures = await page.evaluate(() => {
        return Promise.resolve(window.externalJasmineFailures);
    });
    expect(externalJasmineFailures).toEqual(undefined);
});
