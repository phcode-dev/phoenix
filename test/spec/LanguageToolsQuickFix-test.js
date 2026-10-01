/*
 * GNU AGPL-3.0 License
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 */

/*global describe, it, expect */

define(function (require, exports, module) {
    const DefaultProviders = require("languageTools/DefaultProviders");

    describe("unit:Language server quickfix paths", function () {
        /**
         * Convert a single-edit action using simulated platform paths, without starting a server.
         * @param {string} platform Phoenix platform id.
         * @param {string} ownUri Active document URI.
         * @param {string} editUri URI supplied in the server's edit.
         * @return {?Object} Accepted fix, or null for a different file.
         */
        function fixForPaths(platform, ownUri, editUri) {
            const originalPlatform = brackets.platform;
            const provider = Object.create(DefaultProviders.LintingProvider.prototype);
            provider._quickFixClient = {uriForPath: () => ownUri};
            const action = {
                title: "Change spelling to console",
                kind: "quickfix",
                edit: {changes: {[editUri]: [{
                    range: {start: {line: 0, character: 0}, end: {line: 0, character: 6}},
                    newText: "console"
                }]}}
            };
            try {
                brackets.platform = platform;
                return provider._fixFromAction(action, {indexFromPos: pos => pos.ch}, "/test/fixable.ts");
            } finally {
                brackets.platform = originalPlatform;
            }
        }

        it("accepts an encoded lowercase Windows drive for the same file", function () {
            const fix = fixForPaths("win", "file:///C:/Project/fixable.ts", "file:///c%3A/Project/fixable.ts");
            expect(fix).not.toBeNull();
            if (fix) {
                expect(fix.replaceText).toBe("console");
                expect(fix.rangeOffset).toEqual({start: 0, end: 6});
            }
        });

        it("rejects a Windows edit on another drive", function () {
            expect(fixForPaths("win", "file:///C:/Project/fixable.ts", "file:///d%3A/Project/fixable.ts"))
                .toBeNull();
        });

        it("rejects an edit to another file", function () {
            expect(fixForPaths("win", "file:///C:/Project/fixable.ts", "file:///c%3A/Project/other.ts"))
                .toBeNull();
        });

        it("preserves case distinctions in Unix paths", function () {
            expect(fixForPaths("linux", "file:///Project/fixable.ts", "file:///project/fixable.ts"))
                .toBeNull();
        });
    });
});
