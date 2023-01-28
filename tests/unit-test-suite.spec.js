// @ts-check
const { test, expect } = require("@playwright/test");

test("Execute all unit tests", async ({ page }) => {
    await page.goto(
        "http://localhost:5000/test/SpecRunner.html?spec=all&category=unit"
    );
    // wait for spec runner to complete
    await page.waitForFunction(() => window.playWrightRunComplete);
    const result = await page.evaluate(() => {
        return Promise.resolve(window.testResults);
    });
    expect(result.errors).toStrictEqual({});
});
