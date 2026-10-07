/* eslint-env node */
const fs = require("node:fs/promises");
const path = require("node:path");

/** Copy the actual Builder implementation into native test assets, without dependencies or state. */
async function prepareBuilderTestFixture() {
    const destination = path.resolve(__dirname, "../src-node/test/builder-fixture");
    await fs.mkdir(destination, { recursive: true });
    for (const file of await fs.readdir(__dirname)) {
        if (file.endsWith(".js") || file.endsWith(".cjs") || file === "package.json") {
            await fs.copyFile(path.join(__dirname, file), path.join(destination, file));
        }
    }
}
module.exports = { prepareBuilderTestFixture };
if (require.main === module) {
    prepareBuilderTestFixture().catch(error => { console.error(error); process.exitCode = 1; });
}
