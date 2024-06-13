// @ts-check
/*global process*/
const { test, expect } = require("@playwright/test");

const testEnv = process.env.TEST_ENV || "unit";
const isTestWindowGitHubActions = process.env.GITHUB_ACTIONS ? "yes" : "no";
if(!process.env.TEST_ENV){
    console.log("Test environment TEST_ENV not provided. Defaulting to execute unit tests only.");
}
console.log("Test environment TEST_ENV is", testEnv);

const testDist = process.env.TEST_DIST === 'true';
let baseURL = 'http://localhost:5000/test/SpecRunner.html';
if(testDist){
    console.log("Testing distribution in: dist-test folder. Make sure to `npm run release:dev/prod` before running this mode.");
    baseURL = 'http://localhost:5000/dist-test/test/SpecRunner.html';
}
console.log("Playwright using base url for tests: ", baseURL);

async function execTests(page, url) {
    await page.setViewportSize({ width: 1566, height: 1024 });
    await page.goto(url);

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
}

test(`Execute ${testEnv} tests`, async ({ page}) => {
    await execTests(page, `${baseURL}?spec=all&category=${testEnv}&isTestWindowGitHubActions=${isTestWindowGitHubActions}&playwrightTests=true`);
});
