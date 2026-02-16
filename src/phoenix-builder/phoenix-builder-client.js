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

// Thin AMD wrapper over the boot-time phoenix-builder connection (window._phoenixBuilder).
// Registers Phoenix-API-dependent handlers (screenshot, FILE_CLOSE_ALL reload).

/*globals */

define(function (require, exports, module) {

    const CommandManager = require("command/CommandManager");
    const Commands = require("command/Commands");

    const boot = window._phoenixBuilder || null;

    function _handleScreenshotRequest(msg) {
        if (!Phoenix || !Phoenix.app || !Phoenix.app.screenShotBinary) {
            boot.sendMessage({
                type: "error",
                id: msg.id,
                message: "Screenshot API not available"
            });
            return;
        }

        Phoenix.app.screenShotBinary(msg.selector || undefined)
            .then(function (bytes) {
                let binary = "";
                const chunkSize = 8192;
                for (let i = 0; i < bytes.length; i += chunkSize) {
                    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
                    binary += String.fromCharCode.apply(null, chunk);
                }
                const base64 = btoa(binary);
                boot.sendMessage({
                    type: "screenshot_response",
                    id: msg.id,
                    data: base64
                });
            })
            .catch(function (err) {
                boot.sendMessage({
                    type: "error",
                    id: msg.id,
                    message: err.message || "Screenshot failed"
                });
            });
    }

    function _handleReloadRequest(msg) {
        const closeArgs = msg.forceClose ? { _forceClose: true } : undefined;
        CommandManager.execute(Commands.FILE_CLOSE_ALL, closeArgs)
            .done(function () {
                boot.sendMessage({
                    type: "reload_response",
                    id: msg.id,
                    success: true
                });
                setTimeout(function () {
                    location.reload();
                }, 100);
            })
            .fail(function (err) {
                boot.sendMessage({
                    type: "reload_response",
                    id: msg.id,
                    success: false,
                    message: (err && err.message) || "Close cancelled by user"
                });
            });
    }

    // Register handlers on the boot module
    if (boot) {
        boot.registerHandler("screenshot_request", _handleScreenshotRequest);
        boot.registerHandler("reload_request", _handleReloadRequest);
    }

    exports.connect = function (url) { if (boot) { boot.connect(url); } };
    exports.disconnect = function () { if (boot) { boot.disconnect(); } };
    exports.isConnected = function () { return boot ? boot.isConnected() : false; };
    exports.getInstanceName = function () { return boot ? boot.getInstanceName() : ""; };
});
