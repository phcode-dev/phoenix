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

/*global describe, it, expect, beforeEach, awaitsFor, awaitsForDone, afterAll */

define(function (require, exports, module) {


    var SpecRunnerUtils    = brackets.getModule("spec/SpecRunnerUtils"),
        PreferencesManager = brackets.getModule("preferences/PreferencesManager"),
        prefs              = PreferencesManager.getExtensionPrefs("quickview");

    describe("integration:Quick View", function () {
        let testFolder = SpecRunnerUtils.getTestPath("/spec/quickview-extn-test-files");

        // load from testWindow
        var testWindow,
            brackets,
            CommandManager,
            Commands,
            MainViewManager,
            EditorManager,
            QuickView,
            editor,
            testFile = "test.css";

        beforeEach(async function () {
            // Create a new window that will be shared by ALL tests in this spec.
            if (!testWindow) {
                testWindow = await SpecRunnerUtils.createTestWindowAndRun();

                await SpecRunnerUtils.loadProjectInTestWindow(testFolder);
            }

            // Load module instances from brackets.test
            brackets = testWindow.brackets;
            CommandManager = brackets.test.CommandManager;
            Commands = brackets.test.Commands;
            EditorManager = brackets.test.EditorManager;
            QuickView = brackets.test.QuickViewManager;
            MainViewManager = brackets.test.MainViewManager;

            await awaitsForDone(SpecRunnerUtils.openProjectFiles([testFile]), "open test file: " + testFile);

            editor  = EditorManager.getCurrentFullEditor();
        }, 30000);

        afterAll(async function () {
            testWindow       = null;
            brackets         = null;
            CommandManager   = null;
            Commands         = null;
            EditorManager    = null;
            QuickView        = null;
            MainViewManager  = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        async function getPopoverAtPos(lineNum, columnNum) {
            editor  = EditorManager.getCurrentFullEditor();
            var cm = editor._codeMirror,
                pos = { line: lineNum, ch: columnNum },
                token;

            editor.setCursorPos(pos);
            token = cm.getTokenAt(pos, true);

            return QuickView._queryPreviewProviders(editor, pos, token);
        }

        async function expectNoPreviewAtPos(line, ch) {
            var popoverInfo = await getPopoverAtPos(line, ch);
            expect(popoverInfo).toBeFalsy();
        }

        async function checkColorAtPos(expectedColor, line, ch) {
            var popoverInfo = await getPopoverAtPos(line, ch);
            expect(popoverInfo.content.find("#quick-view-color-swatch").attr("data-for-test")).toBe(expectedColor);
        }

        async function checkGradientAtPos(expectedGradient, line, ch) {
            // Just call await checkColorAtPos since both have the same function calls.
            await checkColorAtPos(expectedGradient, line, ch);
        }

        async function checkImagePathAtPos(expectedPathEnding, line, ch) {
            var popoverInfo = await getPopoverAtPos(line, ch),
                imagePath = popoverInfo.content.find("#quick-view-image-preview").attr("data-for-test");

            // Just check end of path - local drive location prefix unimportant
            expect(imagePath.substr(imagePath.length - expectedPathEnding.length)).toBe(expectedPathEnding);
        }

        async function checkNumberPopoverAtPos(expectedData, line, ch) {
            var popoverInfo = await getPopoverAtPos(line, ch),
                input = popoverInfo.content.find(".dial");
            expect(input.attr("value")).toBe(expectedData);
        }

        async function checkImageDataAtPos(expectedData, line, ch) {
            var popoverInfo = await getPopoverAtPos(line, ch),
                imagePath = popoverInfo.content.find("#quick-view-image-preview").attr("data-for-test");
            expect(imagePath).toBe(expectedData);
        }

        describe("Quick view colors", function () {
            it("should show preview of hex colors either in 3 digit hex or or 6-digit hex",async function () {
                await checkColorAtPos("#369", 3, 12);
                await checkColorAtPos("#2491F5", 4, 13);
            });

            it("should NOT show preview of color on words start with #",async function () {
                await expectNoPreviewAtPos(7, 7);     // cursor on #invalid_hex
                await expectNoPreviewAtPos(8, 15);    // cursor on #web
            });

            it("should show preview of valid rgb/rgba colors",async function () {
                await checkColorAtPos("rgb(255,0,0)",           12, 12);  // no whitespace
                await checkColorAtPos("rgb(100%,   0%,   0%)",  13, 17);  // extra whitespace
                await checkColorAtPos("rgb(50%, 75%, 25%)",     14, 24);

                // rgba with values of 0-255
                await checkColorAtPos("rgba(255, 0, 0, 0.5)", 15, 23);
                await checkColorAtPos("rgba(255, 0, 0, 1)",   16, 22);
                await checkColorAtPos("rgba(255, 0, 0, .5)",  17, 19);

                // rgba with percentage values
                await checkColorAtPos("rgba(100%, 0%, 0%, 0.5)",  18, 32);
                await checkColorAtPos("rgba(80%, 50%, 50%, 1)",   20, 33);
                await checkColorAtPos("rgba(50%, 75%, 25%, 1.0)", 21, 23);
            });

            it("should NOT show preview of unsupported rgb/rgba colors",async function () {
                await expectNoPreviewAtPos(25, 14);    // cursor on rgb(300, 0, 0)
                await expectNoPreviewAtPos(26, 15);    // cursor on rgb(0, 95.5, 0)
                await expectNoPreviewAtPos(27, 15);    // cursor on rgba(-0, 0, 0, 0.5)
            });

            it("should show preview of valid hsl/hsla colors",async function () {
                await checkColorAtPos("hsl(0, 100%, 50%)",       31, 22);
                await checkColorAtPos("hsla(0, 100%, 50%, 0.5)", 32, 23);
                await checkColorAtPos("hsla(0, 100%, 50%, .5)",  33, 23);
                await checkColorAtPos("hsl(390, 100%, 50%)",     34, 24);
            });

            it("should NOT show preview of unsupported hsl/hsla colors",async function () {
                await expectNoPreviewAtPos(38, 14);    // cursor on hsla(90, 100%, 50%, 2)
                await expectNoPreviewAtPos(39, 14);    // cursor on hsla(0, 200%, 50%, 0.5)
                await expectNoPreviewAtPos(40, 14);    // cursor on hsla(0.0, 100%, 50%, .5)
            });

            it("should show preview of colors with valid names", async function () {
                await checkColorAtPos("blueviolet",    47, 15);
                await checkColorAtPos("darkgoldenrod", 49, 16);
                await checkColorAtPos("darkgray",      50, 16);
                await checkColorAtPos("firebrick",     51, 15);
                await checkColorAtPos("honeydew",      53, 16);
                await checkColorAtPos("lavenderblush", 56, 16);
                await checkColorAtPos("salmon",        61, 16);
                await checkColorAtPos("tomato",        66, 16);
            });

            it("should NOT show preview of colors with invalid names", async function () {
                await expectNoPreviewAtPos(72, 15);    // cursor on redsox
                await expectNoPreviewAtPos(73, 16);    // cursor on pinky
                await expectNoPreviewAtPos(74, 16);    // cursor on blue in hyphenated word blue-cheese
                await expectNoPreviewAtPos(75, 18);    // cursor on white in hyphenated word @bc-bg-highlight
            });

            it("should open quick edit if clicked on colorview",async function () {
                const color = "#369";
                var popoverInfo = await getPopoverAtPos(3, 12);
                let quickViewSwatch = popoverInfo.content.find("#quick-view-color-swatch");
                expect(quickViewSwatch.attr("data-for-test")).toBe(color);
                quickViewSwatch.click();
                expect(EditorManager.getFocusedInlineWidget()._color).toBe(color);
            });

            describe("JavaScript file", function () {
                testFile = "test.js";

                it("should NOT show preview of color-named functions and object/array keys", async function () {
                    await expectNoPreviewAtPos(2, 12);    // cursor on green()
                    await expectNoPreviewAtPos(4, 22);    // cursor on Math.tan
                    await expectNoPreviewAtPos(5, 14);    // cursor on tan()
                    await expectNoPreviewAtPos(5, 38);    // cursor on array[red]
                });
                it("should not show preview of literal color names", async function () {
                    await expectNoPreviewAtPos(2, 36);  // green
                    await expectNoPreviewAtPos(3, 21);  // green
                    await expectNoPreviewAtPos(5, 25);  // red
                    await expectNoPreviewAtPos(7,  1);  // darkgray
                });
            });
        });

        describe("Quick view gradients", function () {
            testFile = "test.css";

            it("Should show linear gradient preview for those with vendor prefix",async function () {
                var expectedGradient1 = "-webkit-linear-gradient(top,  #d2dfed 0%, #c8d7eb 26%, #bed0ea 51%, #a6c0e3 51%, #afc7e8 62%, #bad0ef 75%, #99b5db 88%, #799bc8 100%)",
                    expectedGradient2 = "-webkit-gradient(linear, left top, left bottom, color-stop(0%,#d2dfed), color-stop(26%,#c8d7eb), color-stop(51%,#bed0ea), color-stop(51%,#a6c0e3), color-stop(62%,#afc7e8), color-stop(75%,#bad0ef), color-stop(88%,#99b5db), color-stop(100%,#799bc8))",
                    expectedGradient3 = "-webkit-linear-gradient(top,  #d2dfed 0%,#c8d7eb 26%,#bed0ea 51%,#a6c0e3 51%,#afc7e8 62%,#bad0ef 75%,#99b5db 88%,#799bc8 100%)",
                    expectedGradient4 = "-webkit-gradient(linear, left top, left bottom, from(rgb(51,51,51)), to(rgb(204,204,204)))";
                await checkGradientAtPos(expectedGradient1, 80, 36);   // -moz- prefix gets stripped
                await checkGradientAtPos(expectedGradient2, 81, 36);   // Old webkit syntax
                await checkGradientAtPos(expectedGradient3, 82, 36);   // -webkit- prefix gets stripped
                await checkGradientAtPos(expectedGradient3, 83, 36);   // -o- prefix gets stripped
                await checkGradientAtPos(expectedGradient3, 84, 36);   // -ms- prefix gets stripped
                await checkGradientAtPos(expectedGradient4, 90, 36);   // test parameters with 2 levels of nested parens
            });

            it("Should show linear gradient preview for those with colon or space before",async function () {
                var expectedGradient = "linear-gradient(to bottom, black 0%, white 100%)";
                await checkGradientAtPos(expectedGradient, 169, 25);   // space colon space
                await checkGradientAtPos(expectedGradient, 170, 25);   // colon space
                await checkGradientAtPos(expectedGradient, 171, 25);   // space colon
                await checkGradientAtPos(expectedGradient, 172, 25);   // colon
            });

            it("Should show radial gradient preview for those with colon or space before",async function () {
                var expectedGradient = "radial-gradient(red, white 50%, blue 100%)";
                await checkGradientAtPos(expectedGradient, 176, 25);   // space colon space
                await checkGradientAtPos(expectedGradient, 177, 25);   // colon space
                await checkGradientAtPos(expectedGradient, 178, 25);   // space colon
                await checkGradientAtPos(expectedGradient, 179, 25);   // colon
            });

            it("Should show linear gradient preview for those with w3c standard syntax (no prefix)",async function () {
                await checkGradientAtPos("linear-gradient(#333, #CCC)",                  99, 50);
                await checkGradientAtPos("linear-gradient(135deg, #333, #CCC)",          101, 50);

                await checkGradientAtPos("linear-gradient(to right, #333, #CCC)",        98, 50);
                await checkGradientAtPos("linear-gradient(to bottom right, #333, #CCC)", 100, 50);


                // multiple colors
                await checkGradientAtPos("linear-gradient(#333, #CCC, #333)",             104, 50);
                await checkGradientAtPos("linear-gradient(#333 0%, #CCC 33%, #333 100%)", 105, 50);
                await checkGradientAtPos("linear-gradient(yellow, blue 20%, #0f0)",       106, 50);
            });

            it("Should show radial gradient preview for those with vendor prefix syntax", async function () {
                var expectedGradient1 = "-webkit-gradient(radial, center center, 0, center center, 141, from(black), to(white), color-stop(25%, blue), color-stop(40%, green), color-stop(60%, red), color-stop(80%, purple))",
                    expectedGradient2 = "-webkit-radial-gradient(center center, circle contain, black 0%, blue 25%, green 40%, red 60%, purple 80%, white 100%)";
                await checkGradientAtPos(expectedGradient1, 110, 93);   // old webkit syntax
                await checkGradientAtPos(expectedGradient2, 111, 36);   // -webkit- prefix preserved
                await checkGradientAtPos(expectedGradient2, 112, 36);   // -moz- prefix gets stripped
                await checkGradientAtPos(expectedGradient2, 113, 36);   // -ms- prefix gets stripped
                await checkGradientAtPos(expectedGradient2, 114, 36);   // -0- prefix gets stripped
            });

            it("Should show radial gradient preview for those with w3c standard syntax (no prefix)", async function () {
                await checkGradientAtPos("radial-gradient(yellow, green)", 118, 35);
                await checkGradientAtPos("radial-gradient(yellow, green)", 118, 40);
            });

            it("Should show repeating linear gradient preview",async function () {
                await checkGradientAtPos("repeating-linear-gradient(red, blue 50%, red 100%)", 122, 50);
                await checkGradientAtPos("repeating-linear-gradient(red 0%, white 0%, blue 0%)", 123, 50);
                await checkGradientAtPos("repeating-linear-gradient(red 0%, white 50%, blue 100%)", 124, 50);
            });

            it("Should show repeating radial gradient preview", async function () {
                await checkGradientAtPos("repeating-radial-gradient(circle closest-side at 20px 30px, red, yellow, green 100%, yellow 150%, red 200%)", 128, 40);
                await checkGradientAtPos("repeating-radial-gradient(red, blue 50%, red 100%)", 129, 40);
            });

            it("Should show comma-separated gradients",async function () {
                // line ending in comma
                await checkGradientAtPos("linear-gradient(63deg, #999 23%, transparent 23%)", 135,  50);

                // multiple gradients on a line
                await checkGradientAtPos("linear-gradient(63deg, transparent 74%, #999 78%)", 136,  50);
                await checkGradientAtPos("linear-gradient(63deg, transparent 0%, #999 38%, #999 58%, transparent 100%)",   136, 100);
            });

            it("should not open quick edit if clicked on gradients",async function () {
                const color = "linear-gradient(63deg, transparent 74%, #999 78%)";
                var popoverInfo = await getPopoverAtPos(136, 50);
                let quickViewSwatch = popoverInfo.content.find("#quick-view-color-swatch");
                expect(quickViewSwatch.attr("data-for-test")).toBe(color);
                quickViewSwatch.click();
                expect(EditorManager.getFocusedInlineWidget()).toBeFalsy();
            });

            it("Should convert gradients arguments from pixel to percent",async function () {
                // linear gradient in px
                await checkGradientAtPos("-webkit-linear-gradient(top, rgba(0,0,0,0) 0%, green 50%, red 100%)", 163, 40);
                // repeating linear-gradient in pixels (no prefix)
                await checkGradientAtPos("repeating-linear-gradient(red, blue 50%, red 100%)", 164, 40);
                // repeating radial-gradient in pixels (no prefix)
                await checkGradientAtPos("repeating-radial-gradient(red, blue 50%, red 100%)", 165, 40);
            });

            it("Should not go into infinite loop on unbalanced parens", async function () {
                // no preview, and no infinite loop
                await expectNoPreviewAtPos(189, 30);
                await expectNoPreviewAtPos(190, 40);
            });
        });

        describe("Quick view images", function () {
            beforeEach(async function () {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles([testFile]), "open test file: " + testFile);

                editor  = EditorManager.getCurrentFullEditor();
            }, 30000);
            it("Should show image preview for file path inside url()",async function () {
                await checkImagePathAtPos("img/grabber_color-well.png", 140, 26);
                await checkImagePathAtPos("img/Color.png",              141, 26);
                await checkImagePathAtPos("img/throbber.gif",           142, 26);
                await checkImagePathAtPos("img/update_large_icon.svg",  143, 26);
            });

            it("Should click on image preview open the corresponding file", async function () {
                const popoverInfo = await getPopoverAtPos(140, 26),
                    imagePreview = popoverInfo.content.find("#quick-view-image-preview"),
                    imagePath = imagePreview.attr("data-for-test"),
                    expectedPathEnding = "img/grabber_color-well.png";

                // Just check end of path - local drive location prefix unimportant
                expect(imagePath.substr(imagePath.length - expectedPathEnding.length)).toBe(expectedPathEnding);
                imagePreview.click();
                await awaitsFor(()=>{
                    let currentFile = MainViewManager.getCurrentlyViewedFile();
                    return currentFile.fullPath.endsWith(expectedPathEnding);
                }, "waits for image to open");
            });

            it("Should show image preview for urls with http/https",async function () {
                await checkImagePathAtPos("https://raw.github.com/gruehle/HoverPreview/master/screenshots/Image.png", 145, 26);
            });

            it("Should click on http image preview not open file in editor", async function () {
                const popoverInfo = await getPopoverAtPos(145, 26),
                    imagePreview = popoverInfo.content.find("#quick-view-image-preview"),
                    imagePath = imagePreview.attr("data-for-test"),
                    expectedPathEnding = "https://raw.github.com/gruehle/HoverPreview/master/screenshots/Image.png";

                // Just check end of path - local drive location prefix unimportant
                expect(imagePath.substr(imagePath.length - expectedPathEnding.length)).toBe(expectedPathEnding);
                imagePreview.click();
                let currentFile = MainViewManager.getCurrentlyViewedFile();
                expect(currentFile.fullPath.endsWith(testFile)).toBeTrue();
            });

            it("Should show image preview for file path inside single or double quotes",async function () {
                await checkImagePathAtPos("img/update_large_icon.svg",  147, 26);
                await checkImagePathAtPos("img/Color.png",  148, 26);
                await checkImagePathAtPos("img/throbber.gif", 149, 26);
            });

            it("Should show image preview for subsequent images in a line",async function () {
                await checkImagePathAtPos("img/Color.png", 153, 70);    // url("")
                await checkImagePathAtPos("img/Color.png", 154, 70);    // url()
                await checkImagePathAtPos("img/Color.png", 155, 70);    // ""
            });

            it("Should show image preview for URIs containing quotes",async function () {
                await checkImagePathAtPos("img/don't.png", 183, 26);  // url() containing '
                await checkImagePathAtPos("img/don't.png", 184, 26);  // url("") containing '
                await checkImageDataAtPos("data:image/svg+xml;utf8, <svg version='1.1' xmlns='http://www.w3.org/2000/svg'></svg>", 185, 26);  // data url("") containing '
            });

            it("Should show image preview for URLs with known image extensions",async function () {
                await checkImageDataAtPos("http://example.com/image.gif", 194, 20);
                await checkImageDataAtPos("http://example.com/image.png", 195, 20);
                await checkImageDataAtPos("http://example.com/image.jpe", 196, 20);
                await checkImageDataAtPos("http://example.com/image.jpeg", 197, 20);
                await checkImageDataAtPos("http://example.com/image.jpg", 198, 20);
                await checkImageDataAtPos("http://example.com/image.ico", 199, 20);
                await checkImageDataAtPos("http://example.com/image.bmp", 200, 20);
                await checkImageDataAtPos("http://example.com/image.svg", 201, 20);
            });

            it("Should show image preview for extensionless URLs (with protocol) with pref set",async function () {
                // Flip the pref on and restore when done
                var original = prefs.get("extensionlessImagePreview");
                prefs.set("extensionlessImagePreview", true);

                await checkImageDataAtPos("https://image.service.com/id/1234513", 203, 20); // https
                await checkImageDataAtPos("http://image.service.com/id/1234513", 204, 20);  // http
                await checkImageDataAtPos("https://image.service.com/id/1234513?w=300&h=400", 205, 20); // qs params

                prefs.set("extensionlessImagePreview", original);
            });

            it("Should not show image preview for extensionless URLs (with protocol) without pref set", async function () {
                // Flip the pref off and restore when done
                var original = prefs.get("extensionlessImagePreview");
                prefs.set("extensionlessImagePreview", false);

                await checkImageDataAtPos("https://image.service.com/id/1234513", 203, 20); // https
                await checkImageDataAtPos("http://image.service.com/id/1234513", 204, 20);  // http
                await checkImageDataAtPos("https://image.service.com/id/1234513?w=300&h=400", 205, 20); // qs params

                prefs.set("extensionlessImagePreview", original);
            });

            it("Should ignore URLs for common non-image extensions", async function () {
                await expectNoPreviewAtPos(209, 20); // .html
                await expectNoPreviewAtPos(210, 20); // .css
                await expectNoPreviewAtPos(211, 20); // .js
                await expectNoPreviewAtPos(212, 20); // .json
                await expectNoPreviewAtPos(213, 20); // .md
                await expectNoPreviewAtPos(214, 20); // .xml
                await expectNoPreviewAtPos(215, 20); // .mp3
                await expectNoPreviewAtPos(216, 20); // .ogv
                await expectNoPreviewAtPos(217, 20); // .mp4
                await expectNoPreviewAtPos(218, 20); // .mpeg
                await expectNoPreviewAtPos(219, 20); // .webm
                await expectNoPreviewAtPos(220, 20); // .zip
                await expectNoPreviewAtPos(221, 20); // .tgz
            });

            it("Should show image preview for a data URI inside url()", async function () {
                await checkImageDataAtPos("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAYAAABWdVznAAABq0lEQVQoU11RPUgcURD+Zt/unnrcCf4QIugRMcS7a2xjmmArRlRIFRBFgrVtGgmBRFCwTBoLsQiBGMxiJ4iksLRSFEzQRC2EAwm5g727feP3LpyFy1tm5s33zcz7RnDvG4x0zFgMJRY/jiewhy/w8FKSJkyaTuG7Fumvi+ARbQiLpcMDvH/Qj1S6Bf6vI5SxKPUG4fGm5kMf6wr08MKHILCKldoZlk0OIeuHjNuDBBcNAqvvENTLwKii1ZFoF/7G2PQDpNo8dFUt1AcSGfymz42PVfI8ghxht1bHh9MpucCiegMFdJoUOtSD+MxLPtI5T/GaHWhg+NjRk3G5utPikwb5bjzhq40JSChs6Sx1eOYAojg/fCFv7yvnBLGCLPMqxS2dZrtXnDthhySuYebnpFw3ST2RtmUVIx5z1sIKdX9qgDcOTJAj7WsNa8eTUhrY0Gwqg2FldeZiduH5r9JHvqEDigzDS/4VJvYJfMh9VLmbNO9+s9hNg5D/qjkJ8I6uW0yFtkrwHydCg+AhVgsp/8Pnu00XI+0jYJ7gjANRiEsmQ3aNOXuJhG035i1QA6g+uONCrgAAAABJRU5ErkJggg==",  159, 26);
            });
        });

        describe("Quick view numeric", function () {
            async function openTextFile(testFile = "test.css") {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles([testFile]), "open test file: " + testFile);
                editor  = EditorManager.getCurrentFullEditor();
            }

            it("Should show numeric quick view on numbers except gradients or colors", async function () {
                await openTextFile();
                // We should do the following test too in the future.
                // should increment based on decimal places count:  0.7 + .1,  0.07 + .01

                await checkNumberPopoverAtPos("7px", 135, 60);
                await checkGradientAtPos("linear-gradient(63deg, #999 23%, transparent 23%)", 135, 27);
                await checkColorAtPos("hsla(0, 100%, 50%, 0.5)", 32, 18);
            });

            it("Should show numeric quick view in html file on numbers except gradients or colors", async function () {
                await openTextFile("test.html");
                await checkNumberPopoverAtPos("10px", 7, 28);
                await checkNumberPopoverAtPos("11px", 8, 28);
                await checkNumberPopoverAtPos("12%", 9, 28);
                await checkNumberPopoverAtPos("1", 10, 24);
                await checkColorAtPos("#000", 7, 53);
                await checkNumberPopoverAtPos("12%", 11, 28);
                await checkNumberPopoverAtPos("22%", 12, 28);
                await checkNumberPopoverAtPos("13px", 12, 32);
                await checkNumberPopoverAtPos("14em", 12, 37);
            });
        });
    });
});
