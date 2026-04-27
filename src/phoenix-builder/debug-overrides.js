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

/*globals AppConfig*/

/**
 * Debug → Diagnostic Tools → Debug Overrides
 *
 * A small dev-only dialog for toggling local-service overrides
 * without rebuilding. Values are persisted as a single JSON blob in
 * localStorage under LOCAL_OVERIDES_FOR_PHOIENXI_DEBUG so consumers
 * can read overrides at startup with a single getItem.
 *
 * Read flags from anywhere via:
 *   const overrides = (function () {
 *       try { return JSON.parse(localStorage.getItem(
 *           "LOCAL_OVERIDES_FOR_PHOIENXI_DEBUG")) || {}; }
 *       catch (e) { return {}; }
 *   })();
 *   if (overrides.AI_PANEL_LOCAL_OVERRIDE) { ... }
 */
define(function (require, exports, module) {

    if (!window.AppConfig || AppConfig.config.environment !== "dev") {
        return;
    }

    const CommandManager = require("command/CommandManager"),
        Dialogs        = require("widgets/Dialogs"),
        Mustache       = require("thirdparty/mustache/mustache"),
        OverridesTpl   = require("text!./debug-overrides-dialog.html");

    const COMMAND_ID = "debug.debugOverrides";
    const STORAGE_KEY = "LOCAL_OVERIDES_FOR_PHOIENXI_DEBUG";

    function _readOverrides() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) { return {}; }
            const parsed = JSON.parse(raw);
            return (parsed && typeof parsed === "object") ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    function _writeOverrides(obj) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(obj || {}));
        } catch (e) {
            console.warn("[Debug Overrides] Failed to persist:", e);
        }
    }

    function _handleDebugOverrides() {
        const overrides = _readOverrides();
        let aiPanelLocalOverride = !!overrides.AI_PANEL_LOCAL_OVERRIDE;

        const html = Mustache.render(OverridesTpl, {
            aiPanelLocalOverride: aiPanelLocalOverride
        });

        Dialogs.showModalDialogUsingTemplate(html).done(function (id) {
            if (id !== Dialogs.DIALOG_BTN_OK) { return; }
            const next = _readOverrides();
            next.AI_PANEL_LOCAL_OVERRIDE = aiPanelLocalOverride;
            _writeOverrides(next);
        });

        const $dialog = $(".phoenix-debug-overrides.instance");
        $dialog.find(".ai-panel-local-override").on("change", function () {
            aiPanelLocalOverride = $(this).is(":checked");
        });
    }

    CommandManager.register("Debug Overrides…", COMMAND_ID, _handleDebugOverrides);

    exports.COMMAND_ID = COMMAND_ID;
    exports.STORAGE_KEY = STORAGE_KEY;
});
