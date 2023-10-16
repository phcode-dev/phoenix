// @ts-check
/*global process*/
const { test, expect } = require("@playwright/test");

const testEnv = process.env.TEST_ENV || "unit";
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

const LIVE_PREVIEW_CATEGORY = 'livepreview';

test(`Execute ${testEnv} tests`, async ({ page, browserName }) => {
    if(testEnv === LIVE_PREVIEW_CATEGORY) {
        // unfortunateley, we can run the live preview integ tests only in chrome
        // In Firefox, sandbox prevents service worker access from nested iframes. So the virtual server itself will
        // not be loaded in firefox tests in playwright.
        // In tauri, we use node server, so this limitation doesn't apply in tauri test runners. This restriction is
        // only there for firefox tests in playwright.
        if(browserName !== 'firefox') {
            await execTests(page, `${baseURL}?spec=all&category=${testEnv}`);
        }
        return;
    }

    await execTests(page, `${baseURL}?spec=all&category=${testEnv}`);
});
