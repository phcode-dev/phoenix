/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
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
  * This is JavaScript API exposed to the native shell when Brackets is run in a native shell rather than a browser.
  */
define(function (require, exports, module) {


    // Load dependent modules
    var AppInit        = require("utils/AppInit"),
        CommandManager = require("command/CommandManager"),
        Commands       = require("command/Commands");

    var appReady = false; // Set to true after app is fully initialized

    /**
     * The native function BracketsShellAPI::DispatchBracketsJSCommand calls this function in order to enable
     * calling Brackets commands from the native shell.
     */
    function executeCommand(eventName) {
        // Temporary fix for #2616 - don't execute the command if a modal dialog is open.
        // This should really be fixed with proper menu enabling.
        if ($(".modal.instance").length || !appReady) {
            // Another hack to fix issue #3219 so that all test windows are closed
            // as before the fix for #3152 has been introduced. isBracketsTestWindow
            // property is explicitly set in createTestWindowAndRun() in SpecRunnerUtils.js.
            if (window.isBracketsTestWindow) {
                return false;
            }
            // Return false for all commands except file.close_window command for
            // which we have to return true (issue #3152).
            return (eventName === Commands.FILE_CLOSE_WINDOW);
        }

        // Use E for Error so that uglify doesn't change this to simply Error()
        var promise, E = Error, e = new E(), stackDepth = e.stack.split("\n").length;

        // This function should *only* be called as a top-level function. If the current
        // stack depth is > 2, it is most likely because we are at a breakpoint.
        if (stackDepth < 3) {
            promise = CommandManager.execute(eventName);
        } else {
            console.error("Skipping command " + eventName + " because it looks like you are " +
                          "at a breakpoint. If you are NOT at a breakpoint, please " +
                          "file a bug and mention this comment. Stack depth = " + stackDepth + ".");
        }
        return (promise && promise.state() === "rejected") ? false : true;
    }

    AppInit.appReady(function () {
        appReady = true;
    });

    exports.executeCommand = executeCommand;
});
