/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

/**
 * Reads `phoenix_override_config.json` from a machine wide, admin owned location and exposes the
 * values in it as overrides for `brackets.config`. This is only available in the desktop app.
 *
 * The file lives in a directory that only an administrator/root can write to, so the presence of
 * the file is itself the proof that a machine admin put it there. A standard user cannot create it,
 * which is what stops a random extension or a downloaded project from pointing the app at an
 * attacker controlled server.
 *
 * This is the shared "Phoenix Code Control" admin folder that machine wide policies should use going
 * forward. It is a new folder, so it will not exist on already provisioned machines. The older AI
 * disable policy still reads its own `Phoenix AI Control` folder(see phoenix-pro services/ai-control.js)
 * and can be moved here later.
 *
 * Locations (create the directory as admin/root, then drop the file in):
 *  windows: C:\Program Files\Phoenix Code Control\phoenix_override_config.json
 *  mac    : /Library/Application Support/Phoenix Code Control/phoenix_override_config.json
 *  linux  : /etc/phoenix-code-control/phoenix_override_config.json
 *
 * File format - a flat json of `brackets.config` keys to override. Eg. to point the auto updater at
 * a locally served update manifest:
 * {
 *     "app_update_url": "http://localhost:8000/update-latest-experimental-build.json"
 * }
 *
 * Only the keys listed in `OVERRIDABLE_KEYS` are honoured, everything else in the file is ignored.
 */

/*global logger*/

define(function (require, exports, module) {
    const OVERRIDE_FILE_NAME = "phoenix_override_config.json";

    // Only these `brackets.config` keys can be overridden from the system file. Keep this list
    // as small as possible, add a key only when there is a real need to override it on a machine.
    const OVERRIDABLE_KEYS = [
        "app_update_url"
    ];

    /**
     * Gets the platform specific path of the admin owned override file, or "" in non desktop builds.
     * @returns {string} virtual path of the override file
     */
    function _getOverrideFilePath() {
        if (!Phoenix.isNativeApp) {
            return "";
        }
        let platformPath;
        if (Phoenix.platform === "win") {
            platformPath = `C:\\Program Files\\Phoenix Code Control\\${OVERRIDE_FILE_NAME}`;
        } else if (Phoenix.platform === "mac") {
            platformPath = `/Library/Application Support/Phoenix Code Control/${OVERRIDE_FILE_NAME}`;
        } else if (Phoenix.platform === "linux") {
            platformPath = `/etc/phoenix-code-control/${OVERRIDE_FILE_NAME}`;
        } else {
            console.error("System config override: unsupported platform", Phoenix.platform);
            return "";
        }
        return Phoenix.VFS.getTauriVirtualPath(platformPath);
    }

    const OVERRIDE_FILE_PATH = _getOverrideFilePath();

    let overridesPromise = null;

    /**
     * Reads and parses the override file. The file is read once per app session and the result cached,
     * so that an admin edit needs an app restart to take effect(same as any other boot config).
     * Never rejects- a missing or malformed file just means "no overrides".
     * @returns {Promise<Object>} the overridable key value pairs present in the file, may be empty
     */
    function getOverrides() {
        if (overridesPromise) {
            return overridesPromise;
        }
        overridesPromise = (async function () {
            if (!OVERRIDE_FILE_PATH) {
                return {};
            }
            const fileData = await Phoenix.VFS.readFileResolves(OVERRIDE_FILE_PATH, "utf8");
            if (fileData.error || !fileData.data) {
                // the common case, no admin has placed an override file on this machine.
                return {};
            }
            try {
                const rawOverrides = JSON.parse(fileData.data);
                const overrides = {};
                for (const key of OVERRIDABLE_KEYS) {
                    if (rawOverrides[key] !== undefined) {
                        overrides[key] = rawOverrides[key];
                    }
                }
                console.warn(`System config override in effect from ${OVERRIDE_FILE_PATH}:`, overrides);
                return overrides;
            } catch (e) {
                console.error(`Error parsing system config override ${OVERRIDE_FILE_PATH}`, e);
                logger.reportError(e, "Error parsing system config override file");
                return {};
            }
        }());
        return overridesPromise;
    }

    exports.OVERRIDE_FILE_PATH = OVERRIDE_FILE_PATH;
    exports.getOverrides = getOverrides;
});
