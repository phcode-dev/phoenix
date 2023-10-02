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

// unfortunately live preview tests doesnt work in playwright :(
// service workers are supported in playwright, debug this
// test("Execute livepreview tests", async ({ page }) => {
//     await execTests(page, "http://localhost:5000/test/SpecRunner.html?spec=all&category=livepreview");
// });
