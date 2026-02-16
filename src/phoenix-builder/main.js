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

define(function (require, exports, module) {

    const AppInit            = require("utils/AppInit"),
        CommandManager       = require("command/CommandManager"),
        Dialogs              = require("widgets/Dialogs"),
        Strings              = require("strings"),
        PreferencesManager   = require("preferences/PreferencesManager"),
        Mustache             = require("thirdparty/mustache/mustache"),
        PhoenixBuilderClient = require("./phoenix-builder-client"),
        BuilderConnectTemplate = require("text!./builder-connect-dialog.html");

    const COMMAND_ID = "debug.phoenixBuilderConnect";

    const builderPrefs = PreferencesManager.getExtensionPrefs("phoenixBuilder");
    builderPrefs.definePreference("enabled", "boolean", false, {
        description: "Enable Phoenix Builder MCP connection"
    });
    builderPrefs.definePreference("wsUrl", "string", "ws://localhost:38571", {
        description: "Phoenix Builder MCP WebSocket URL"
    });

    function _handlePhoenixBuilderConnect() {
        var url = builderPrefs.get("wsUrl"),
            enabled = builderPrefs.get("enabled");

        var templateVars = {
            url: url,
            enabled: enabled,
            connected: PhoenixBuilderClient.isConnected(),
            instanceName: PhoenixBuilderClient.getInstanceName()
        };

        var template = Mustache.render(BuilderConnectTemplate, templateVars);
        Dialogs.showModalDialogUsingTemplate(template).done(function (id) {
            if (id === Dialogs.DIALOG_BTN_OK) {
                builderPrefs.set("wsUrl", url);
                builderPrefs.set("enabled", enabled);

                if (enabled) {
                    PhoenixBuilderClient.connect(url);
                } else {
                    PhoenixBuilderClient.disconnect();
                }
            }
        });

        var $dialog = $(".phoenix-builder-connect.instance");
        $dialog.find(".builder-url").on("input", function () {
            url = $(this).val();
        });
        $dialog.find(".builder-enable").on("change", function () {
            enabled = $(this).is(":checked");
        });
        $dialog.find(".builder-config-code").on("click", function () {
            Phoenix.app.copyToClipboard($(this).text());
            var $pre = $(this);
            var $copied = $('<span style="position:absolute;right:8px;top:8px;' +
                'padding:2px 8px;border-radius:3px;font-size:12px;' +
                'background:var(--accent-color);color:white;' +
                'pointer-events:none;">Copied!</span>');
            $pre.css("position", "relative").append($copied);
            setTimeout(function () { $copied.remove(); }, 1000);
        });
    }

    CommandManager.register(Strings.CMD_PHOENIX_BUILDER_CONNECT, COMMAND_ID, _handlePhoenixBuilderConnect);

    AppInit.appReady(function () {
        if (builderPrefs.get("enabled")) {
            PhoenixBuilderClient.connect(builderPrefs.get("wsUrl"));
        }
    });

    exports.COMMAND_ID = COMMAND_ID;
});
