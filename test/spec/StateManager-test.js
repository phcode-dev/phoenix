/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global describe, it, expect, beforeEach, afterEach, fs, path, Phoenix*/

define(function (require, exports, module) {
    if(!window.__TAURI__) {
        return;
    }

    const SpecRunnerUtils     = require("spec/SpecRunnerUtils");

    describe("unit: StateManager Tests", function () {

        beforeEach(async function () {

        });

        afterEach(async function () {

        });

        it("Should be able to fetch files in {appLocalData}/assets folder", async function () {
            const appLocalData = fs.getTauriVirtualPath(await window.__TAURI__.path.appLocalDataDir());
            expect(await SpecRunnerUtils.pathExists(appLocalData, true)).toBeTrue();
            expect(appLocalData.split("/")[1]).toEql("tauri"); // should be /tauri/applocaldata/path

            // now write a test html file to the assets folder
            const assetHTMLPath = `${appLocalData}/assets/a9322657236.html`;
            const assetHtmlText = "Hello world random37834324";
            await SpecRunnerUtils.ensureExistsDirAsync(path.dirname(assetHTMLPath));
            await SpecRunnerUtils.createTextFileAsync(assetHTMLPath, assetHtmlText);

            const appLocalDataPlatformPath = fs.getTauriPlatformPath(assetHTMLPath);
            const appLocalDataURL = window.__TAURI__.tauri.convertFileSrc(appLocalDataPlatformPath);

            const fetchedData = await ((await fetch(appLocalDataURL)).text());
            expect(fetchedData).toEqual(assetHtmlText);

            // delete test file
            await SpecRunnerUtils.deletePathAsync(assetHTMLPath);
        });
    });
});
