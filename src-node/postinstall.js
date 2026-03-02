const fs = require("fs");
const path = require("path");

// Workaround for node-pty #850: spawn-helper ships without +x in npm tarball.
// Fixed in node-pty >=1.2.0; remove this script once we upgrade.
if (process.platform === "darwin") {
    const candidates = ["darwin-arm64", "darwin-x64"];
    for (const dir of candidates) {
        const helperPath = path.join(
            __dirname, "node_modules", "node-pty",
            "prebuilds", dir, "spawn-helper"
        );
        try {
            fs.chmodSync(helperPath, 0o755);
            console.log(`postinstall: chmod 755 ${helperPath}`);
        } catch (e) {
            if (e.code === "ENOENT") {
                console.log(`postinstall: spawn-helper not found for ${dir} (expected on other arch)`);
            } else {
                console.error(`postinstall: failed to chmod spawn-helper for ${dir}: ${e.message}`);
            }
        }
    }
}
