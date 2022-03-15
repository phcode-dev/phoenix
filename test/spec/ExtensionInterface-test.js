/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*global describe, it, expect, beforeFirst, afterLast, beforeEach, afterEach, waitsFor, runs, waitsForDone */

define(function (require, exports, module) {
    const ExtensionInterface = require("utils/ExtensionInterface"),
        INTERFACE_OBJ = {
            "hello": "world"
        };

    describe("Extension Interface tests", function () {
        it("should return a registered interface", function () {
            const INTERFACE_1 = "int1";
            ExtensionInterface.registerExtensionInterface(INTERFACE_1, INTERFACE_OBJ);
            expect(ExtensionInterface.isExistsExtensionInterface(INTERFACE_1)).toEqual(true);
        });

        it("should raise event on extension registration", function () {
            const INTERFACE_1 = "int1";
            let notified = false, interfaceObjNotified = null;
            ExtensionInterface.on(ExtensionInterface.EVENT_EXTENSION_INTERFACE_REGISTERED, (event, name, intrfaceObj)=>{
                notified = name;
                interfaceObjNotified = intrfaceObj;
            });
            ExtensionInterface.registerExtensionInterface(INTERFACE_1, INTERFACE_OBJ);
            expect(ExtensionInterface.isExistsExtensionInterface(INTERFACE_1)).toEqual(true);
            waitsFor(function () {
                return notified === INTERFACE_1 && interfaceObjNotified === INTERFACE_OBJ;
            }, 100, "extension interface registration notification");
        });

        it("should await and get the extension interface", function () {
            const INTERFACE_2 = "int2";
            let extensionInterface = null;
            ExtensionInterface.awaitGetExtensionInterface(INTERFACE_2).then((interfaceObj)=>{
                extensionInterface = interfaceObj;
            });

            ExtensionInterface.registerExtensionInterface(INTERFACE_2, INTERFACE_OBJ);
            waitsFor(function () {
                return extensionInterface === INTERFACE_OBJ;
            }, 100, "awaiting extension interface");
        });
    });
});
