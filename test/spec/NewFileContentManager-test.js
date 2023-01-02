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

/*global describe, it, expect*/

define(function (require, exports, module) {


    const NewFileContentManager = require("features/NewFileContentManager");

    describe("unit:New File Content Manager", function () {
        describe("New File Content Manager register provider", function (){

            function getProvider(content, {noContent, name}) {
                return {
                    CONTENT_PROVIDER_NAME: name,
                    getContent: function(fullPath) {
                        expect(fullPath).toBeDefined();
                        return new Promise((resolve, reject)=>{
                            if(noContent){
                                reject();
                                return;
                            }
                            resolve(content);
                        });
                    }
                };
            }

            const content1 = "content1", content2 = "content2", content3 = "content3",
                provider1 = getProvider(content1, {name: "provider"}),
                provider2 = getProvider(content2, {name: "provider2"}),
                provider3 = getProvider(content3, {name: "provider3"}),
                providerNoContent = getProvider(undefined, {noContent:true, name: "providerNoPreview"});

            it("should register and unregister content provider for all languages", async function () {
                NewFileContentManager.registerContentProvider(provider1, ["all"]);
                let content = await NewFileContentManager.getInitialContentForFile("/a.txt");
                expect(content).toBe(content1);

                NewFileContentManager.removeContentProvider(provider1, ["all"]);
                content = await NewFileContentManager.getInitialContentForFile("/a.txt");
                expect(content).toBe("");
            });

            it("should register and unregister content provider for js language", async function () {
                NewFileContentManager.registerContentProvider(provider1, ["javascript"]);
                let content = await NewFileContentManager.getInitialContentForFile("/a.js");
                expect(content).toBe(content1);

                NewFileContentManager.removeContentProvider(provider1, ["javascript"]);
                content = await NewFileContentManager.getInitialContentForFile("/a.js");
                expect(content).toBe("");
            });

            it("should higher priority provider win for multiple providers", async function () {
                NewFileContentManager.registerContentProvider(provider1, ["javascript"]);
                NewFileContentManager.registerContentProvider(provider3, ["javascript"], 3);
                NewFileContentManager.registerContentProvider(provider2, ["javascript"], 2);
                let content = await NewFileContentManager.getInitialContentForFile("/a.js");
                expect(content).toBe(content3);

                NewFileContentManager.removeContentProvider(provider3, ["javascript"]);
                content = await NewFileContentManager.getInitialContentForFile("/a.js");
                expect(content).toBe(content2);

                NewFileContentManager.removeContentProvider(provider2, ["javascript"]);
                content = await NewFileContentManager.getInitialContentForFile("/a.js");
                expect(content).toBe(content1);

                NewFileContentManager.removeContentProvider(provider1, ["javascript"]);
                content = await NewFileContentManager.getInitialContentForFile("/a.js");
                expect(content).toBe("");
            });

            it("should get content if some providers didnt give preview", async function () {
                NewFileContentManager.registerContentProvider(provider1, ["javascript"]);
                NewFileContentManager.registerContentProvider(providerNoContent, ["javascript"], 3);
                NewFileContentManager.registerContentProvider(provider2, ["javascript"], 2);
                let content = await NewFileContentManager.getInitialContentForFile("/a.js");
                expect(content).toBe(content2);

                NewFileContentManager.removeContentProvider(provider2, ["javascript"]);
                content = await NewFileContentManager.getInitialContentForFile("/a.js");
                expect(content).toBe(content1);

                NewFileContentManager.removeContentProvider(provider1, ["javascript"]);
                content = await NewFileContentManager.getInitialContentForFile("/a.js");
                expect(content).toBe("");

                NewFileContentManager.removeContentProvider(providerNoContent, ["javascript"]);
                content = await NewFileContentManager.getInitialContentForFile("/a.js");
                expect(content).toBe("");
            });
        });
    });
});
