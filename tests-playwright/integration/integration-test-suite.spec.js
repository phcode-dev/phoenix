// @ts-check
const { test, expect } = require("@playwright/test");

test("Execute LegacyInteg tests", async ({ page }) => {
    await page.goto(
        "http://localhost:5000/test/SpecRunner.html?spec=all&category=LegacyInteg"
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
});
