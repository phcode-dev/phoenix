// @ts-check
const { test, expect } = require("@playwright/test");

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
}

test("Execute integration tests", async ({ page }) => {
    await execTests(page, "http://localhost:5000/test/SpecRunner.html?spec=all&category=integration");
});

test("Execute LegacyInteg tests", async ({ page }) => {
    await execTests(page, "http://localhost:5000/test/SpecRunner.html?spec=all&category=LegacyInteg");
});

test("Execute mainview tests", async ({ page }) => {
    await execTests(page, "http://localhost:5000/test/SpecRunner.html?spec=all&category=mainview");
});

test("Execute livepreview tests", async ({ page, browserName }) => {
    if(browserName !== 'firefox'){
        // unfortunateley, we can run the live preview integ tests only in chrome
        // In Firefox, sandbox prevents service worker access from nested iframes. So the virtual server itself will
        // not be loaded in firefox tests in playwright.
        // In tauri, we use node server, so this limitation doesn't apply in tauri test runners. This restriction is
        // only there for firefox tests in playwright.
        await execTests(page, "http://localhost:5000/test/SpecRunner.html?spec=all&category=livepreview");
    }
});
