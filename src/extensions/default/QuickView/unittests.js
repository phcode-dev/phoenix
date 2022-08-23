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

/*global describe, it, expect, beforeEach, awaitsForDone, afterAll */

define(function (require, exports, module) {


    var SpecRunnerUtils    = brackets.getModule("spec/SpecRunnerUtils"),
        PreferencesManager = brackets.getModule("preferences/PreferencesManager"),
        prefs              = PreferencesManager.getExtensionPrefs("quickview");

    describe("extension:Quick View", function () {
        let testFolder = SpecRunnerUtils.getTestPath("/spec/quickview-extn-test-files");

        // load from testWindow
        var testWindow,
            brackets,
            extensionRequire,
            CommandManager,
            Commands,
            EditorManager,
            QuickView,
            editor,
            testFile = "test.css",
            oldFile;

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
            extensionRequire = brackets.test.ExtensionLoader.getRequireContextForExtension("QuickView");
            QuickView = extensionRequire("main");

            if (testFile !== oldFile) {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles([testFile]), "open test file: " + testFile);

                editor  = EditorManager.getCurrentFullEditor();
                oldFile = testFile;
            }
        }, 30000);

        afterAll(async function () {
            testWindow       = null;
            brackets         = null;
            CommandManager   = null;
            Commands         = null;
            EditorManager    = null;
            extensionRequire = null;
            QuickView        = null;
            await SpecRunnerUtils.closeTestWindow();
        });

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
            expect(popoverInfo._previewCSS).toBe(expectedColor);
        }

        async function checkGradientAtPos(expectedGradient, line, ch) {
            // Just call await checkColorAtPos since both have the same function calls.
            await checkColorAtPos(expectedGradient, line, ch);
        }

        async function checkImagePathAtPos(expectedPathEnding, line, ch) {
            var popoverInfo = await getPopoverAtPos(line, ch),
                imagePath = popoverInfo._imgPath;

            // Just check end of path - local drive location prefix unimportant
            expect(imagePath.substr(imagePath.length - expectedPathEnding.length)).toBe(expectedPathEnding);
        }

        async function checkImageDataAtPos(expectedData, line, ch) {
            var popoverInfo = await getPopoverAtPos(line, ch);
            expect(popoverInfo._imgPath).toBe(expectedData);
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
                await expectNoPreviewAtPos(38, 25);    // cursor on hsla(90, 100%, 50%, 2)
                await expectNoPreviewAtPos(39, 24);    // cursor on hsla(0, 200%, 50%, 0.5)
                await expectNoPreviewAtPos(40, 25);    // cursor on hsla(0.0, 100%, 50%, .5)
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

        describe("Quick view display", function () {

            async function showPopoverAtPos(line, ch) {
                var popoverInfo = await getPopoverAtPos(line, ch);
                QuickView._forceShow(popoverInfo);
            }

            function getBounds(object, useOffset) {
                var left = (useOffset ? object.offset().left : parseInt(object.css("left"), 10)),
                    top = (useOffset ? object.offset().top : parseInt(object.css("top"), 10));
                return {
                    left: left,
                    top: top,
                    right: left + object.outerWidth(),
                    bottom: top + object.outerHeight()
                };
            }

            function boundsInsideWindow(object) {
                // For the popover, we can't use offset(), because jQuery gets confused by the
                // scale factor and transform origin that the animation uses. Instead, we rely
                // on the fact that its offset parent is body, and just test its explicit left/top
                // values.
                var bounds = getBounds(object, false),
                    editorBounds = getBounds(testWindow.$("#editor-holder"), true);
                return bounds.left   >= editorBounds.left   &&
                    bounds.right  <= editorBounds.right  &&
                    bounds.top    >= editorBounds.top    &&
                    bounds.bottom <= editorBounds.bottom;
            }

            async function toggleOption(commandID, text) {
                var promise = CommandManager.execute(commandID);
                await awaitsForDone(promise, text);
            }

            it("popover is positioned within window bounds", async function () {
                var $popover  = testWindow.$("#quick-view-container");
                expect($popover.length).toEqual(1);

                // Popover should be below item
                await showPopoverAtPos(3, 12);
                expect(boundsInsideWindow($popover)).toBeTruthy();

                // Popover should above item
                await showPopoverAtPos(20, 33);
                expect(boundsInsideWindow($popover)).toBeTruthy();

                // Turn off word wrap for next tests
                await toggleOption(Commands.TOGGLE_WORD_WRAP, "Toggle word-wrap");

                // Popover should be inside right edge
                await showPopoverAtPos(81, 36);
                expect(boundsInsideWindow($popover)).toBeTruthy();

                // Popover should be inside left edge
                var scrollX = editor._codeMirror.defaultCharWidth()  * 80,
                    scrollY = editor._codeMirror.defaultTextHeight() * 70;

                editor.setScrollPos(scrollX, scrollY);      // Scroll right
                await showPopoverAtPos(82, 136);
                expect(boundsInsideWindow($popover)).toBeTruthy();

                // restore word wrap
                await toggleOption(Commands.TOGGLE_WORD_WRAP, "Toggle word-wrap");
            });

            it("highlight matched text when popover shown",async function () {
                await showPopoverAtPos(4, 14);
                var markers = editor._codeMirror.findMarksAt({line: 4, ch: 14});
                let rangeMarker = null;
                for(let marker of markers){
                    if(marker.type === 'range'){
                        rangeMarker = marker;
                        break;
                    }
                }
                expect(rangeMarker).toBeDefined();
                let range = rangeMarker.find();
                expect(range.from.ch).toBe(11);
                expect(range.to.ch).toBe(18);
            });

        });

        describe("Quick view images", function () {
            it("Should show image preview for file path inside url()",async function () {
                await checkImagePathAtPos("img/grabber_color-well.png", 140, 26);
                await checkImagePathAtPos("img/Color.png",              141, 26);
                await checkImagePathAtPos("img/throbber.gif",           142, 26);
                await checkImagePathAtPos("img/update_large_icon.svg",  143, 26);
            });

            it("Should show image preview for urls with http/https",async function () {
                await checkImagePathAtPos("https://raw.github.com/gruehle/HoverPreview/master/screenshots/Image.png", 145, 26);
            });

            it("Should show image preview for file path inside single or double quotes",async function () {
                await checkImagePathAtPos("img/med_hero.jpg",  147, 26);
                await checkImagePathAtPos("img/Gradient.png",  148, 26);
                await checkImagePathAtPos("img/specials.jpeg", 149, 26);
            });

            it("Should show image preview for subsequent images in a line",async function () {
                await checkImagePathAtPos("img/Gradient.png", 153, 80);    // url("")
                await checkImagePathAtPos("img/Gradient.png", 154, 80);    // url()
                await checkImagePathAtPos("img/Gradient.png", 155, 80);    // ""
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
    });
});
