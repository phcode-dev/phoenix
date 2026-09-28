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

/*globals AppConfig, Phoenix*/

define(function (require, exports, module) {

    const SystemConfigOverride = require("utils/SystemConfigOverride"),
        AppInit                = require("utils/AppInit"),
        StatusBar              = require("widgets/StatusBar"),
        BuilderStrings         = require("strings");

    // Where the boot script looks to decide whether a non dev build may be
    // instrumented, see phoenix-builder-boot.js.
    const PROD_OVERRIDE_DATE_KEY = "prodMCPOverrideDate";
    const STATUS_INDICATOR_ID = "status-mcp-controlled";
    // the boot script's own switch, see phoenix-builder-boot.js
    const BUILDER_ENABLED_KEY = "phoenixBuilderEnabled";

    /**
     * Keep the cached admin permission in step with the admin owned file.
     *
     * Boot cannot read that file - it does no file reads, which is what keeps
     * startup quick - so it reads a cached copy from localStorage instead. This
     * writes that copy, one launch behind: a date placed today is honoured from
     * the next start, and a file removed stops being honoured from the start
     * after that. The value is a date rather than a flag exactly because of
     * that lag, so a copy left behind is worthless on any other day.
     *
     * Runs in every build, not just dev, since a production build is the only
     * place the permission means anything.
     * @private
     */
    function _refreshProdInstrumentationPermission() {
        // In dev the admin file plays no part in the gate, and this flag is the
        // user's own switch in the Settings tab - writing it from here would
        // stomp on a choice they made by hand.
        const managesEnabledFlag = AppConfig.config.environment !== "dev";
        SystemConfigOverride.getOverrides()
            .then(function (overrides) {
                const date = overrides && overrides[PROD_OVERRIDE_DATE_KEY];
                if (date) {
                    localStorage.setItem(PROD_OVERRIDE_DATE_KEY, date);
                    // The file is the admin saying so. Asking them to also type
                    // a command into the console of every machine would add a
                    // step without adding a decision.
                    if (managesEnabledFlag) {
                        localStorage.setItem(BUILDER_ENABLED_KEY, "true");
                    }
                } else {
                    localStorage.removeItem(PROD_OVERRIDE_DATE_KEY);
                    if (managesEnabledFlag) {
                        localStorage.removeItem(BUILDER_ENABLED_KEY);
                    }
                }
            })
            .catch(function (err) {
                // never leave a stale permission behind on an unreadable file
                localStorage.removeItem(PROD_OVERRIDE_DATE_KEY);
                if (managesEnabledFlag) {
                    localStorage.removeItem(BUILDER_ENABLED_KEY);
                }
                console.error("Could not read the system config override", err);
            });
    }

    /**
     * Say so, in the status bar, while something is driving this session.
     *
     * Shown on connection rather than on being enabled: a build that merely
     * allows instrumentation is not being instrumented, and the thing worth
     * telling the user about is that someone is on the other end right now.
     *
     * Not shown in dev, where being driven by the builder is the ordinary way
     * of working and a permanent badge would only be noise. It is the builds a
     * user runs that should say when something else is at the controls.
     * @private
     */
    function _watchInstrumentationState() {
        if (AppConfig.config.environment === "dev") {
            return;
        }
        const boot = window._phoenixBuilder;
        if (!boot || !boot.setConnectionListener) {
            return;
        }
        const $indicator = $("<div></div>").text(BuilderStrings.STATUSBAR_MCP_CONTROLLED);
        let shown = false;
        boot.setConnectionListener(function (connected) {
            if (connected && !shown) {
                StatusBar.addIndicator(STATUS_INDICATOR_ID, $indicator, true,
                    "mcp-controlled-indicator",
                    BuilderStrings.STATUSBAR_MCP_CONTROLLED_TOOLTIP);
                shown = true;
            } else if (!connected && shown) {
                StatusBar.updateIndicator(STATUS_INDICATOR_ID, false);
                shown = false;
            }
        });
    }

    AppInit.appReady(function () {
        _refreshProdInstrumentationPermission();
        _watchInstrumentationState();
    });

    // Only register the command in dev builds
    if (!window.AppConfig || AppConfig.config.environment !== "dev") {
        return;
    }

    const CommandManager       = require("command/CommandManager"),
        Dialogs              = require("widgets/Dialogs"),
        Strings              = require("strings"),
        Mustache             = require("thirdparty/mustache/mustache"),
        PhoenixBuilderClient = require("./phoenix-builder-client"),
        BuilderConnectTemplate = require("text!./builder-connect-dialog.html");

    const COMMAND_ID = "debug.phoenixBuilderConnect";
    const DEFAULT_WS_URL = "ws://localhost:38571";

    const LEVEL_COLORS = {
        error: "background:#f44336;color:white;",
        warn:  "background:#ff9800;color:white;",
        info:  "background:#2196f3;color:white;",
        log:   "background:#9e9e9e;color:white;"
    };

    function _escapeHtml(str) {
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function _renderLogs($dialog) {
        const boot = window._phoenixBuilder;
        const logs = boot ? boot.getLogBuffer() : [];
        const $container = $dialog.find(".builder-log-container");
        $container.empty();
        $dialog.find(".builder-log-count").text(logs.length + " entries");
        if (logs.length === 0) {
            $container.html('<span style="opacity:0.5;">No logs captured yet.</span>');
            return;
        }
        let html = "";
        for (let i = 0; i < logs.length; i++) {
            const entry = logs[i];
            const level = entry.level || "log";
            const ts = entry.timestamp ? entry.timestamp.replace("T", " ").replace("Z", "") : "";
            const badgeStyle = LEVEL_COLORS[level] || LEVEL_COLORS.log;
            html += '<div style="padding:2px 4px;border-bottom:1px solid rgba(128,128,128,0.15);">' +
                '<span style="opacity:0.5;margin-right:6px;">' + _escapeHtml(ts) + '</span>' +
                '<span style="' + badgeStyle + 'padding:1px 5px;border-radius:3px;font-size:11px;' +
                'margin-right:6px;display:inline-block;min-width:36px;text-align:center;">' +
                level.toUpperCase() + '</span>' +
                '<span>' + _escapeHtml(entry.message) + '</span>' +
                '</div>';
        }
        $container.html(html);
        $container.scrollTop($container[0].scrollHeight);
    }

    function _handlePhoenixBuilderConnect() {
        let url = localStorage.getItem("phoenixBuilderWsUrl") || DEFAULT_WS_URL,
            enabled = localStorage.getItem("phoenixBuilderEnabled") === "true";

        // Ready to run, so the Production tab needs nothing looked up elsewhere.
        // The path comes from SystemConfigOverride rather than being written out
        // again here, so the two cannot drift apart.
        const overrideFile = Phoenix.fs.getTauriPlatformPath(SystemConfigOverride.OVERRIDE_FILE_PATH);
        const overrideDir = overrideFile.replace(/[/\\][^/\\]+$/, "");
        const now = new Date();
        const today = now.getFullYear() + "-" +
            String(now.getMonth() + 1).padStart(2, "0") + "-" +
            String(now.getDate()).padStart(2, "0");
        const isWin = Phoenix.platform === "win";
        const grantCommand = isWin
            ? 'mkdir "' + overrideDir + '" & echo {"' + PROD_OVERRIDE_DATE_KEY + '": "' + today +
                '"} > "' + overrideFile + '"'
            : 'sudo mkdir -p "' + overrideDir + '" && echo \'{"' + PROD_OVERRIDE_DATE_KEY +
                '": "' + today + '"}\' | sudo tee "' + overrideFile + '"';
        const revokeCommand = isWin
            ? 'del "' + overrideFile + '"'
            : 'sudo rm "' + overrideFile + '"';

        const templateVars = {
            url: url,
            enabled: enabled,
            connected: PhoenixBuilderClient.isConnected(),
            instanceName: PhoenixBuilderClient.getInstanceName(),
            mcpOverrideFile: overrideFile,
            mcpToday: today,
            mcpGrantCommand: grantCommand,
            mcpRevokeCommand: revokeCommand
        };

        const template = Mustache.render(BuilderConnectTemplate, templateVars);
        Dialogs.showModalDialogUsingTemplate(template).done(function (id) {
            if (id === Dialogs.DIALOG_BTN_OK) {
                localStorage.setItem("phoenixBuilderWsUrl", url);
                localStorage.setItem("phoenixBuilderEnabled", enabled ? "true" : "false");

                if (enabled) {
                    PhoenixBuilderClient.connect(url);
                } else {
                    PhoenixBuilderClient.disconnect();
                    localStorage.removeItem("logToConsole");
                }
            }
        });

        const $dialog = $(".phoenix-builder-connect.instance");
        $dialog.find(".builder-url").on("input", function () {
            url = $(this).val();
        });
        $dialog.find(".builder-enable").on("change", function () {
            enabled = $(this).is(":checked");
        });
        $dialog.find(".builder-config-code").on("click", function () {
            Phoenix.app.copyToClipboard($(this).text());
            const $pre = $(this);
            const $copied = $('<span style="position:absolute;right:8px;top:8px;' +
                'padding:2px 8px;border-radius:3px;font-size:12px;' +
                'background:var(--accent-color);color:white;' +
                'pointer-events:none;">Copied!</span>');
            $pre.css("position", "relative").append($copied);
            setTimeout(function () { $copied.remove(); }, 1000);
        });

        // --- Tab switching ---
        $dialog.find('.nav-tabs a[data-toggle="tab"]').on("click", function (e) {
            e.preventDefault();
            const $this = $(this);
            const target = $this.attr("href");
            $dialog.find(".nav-tabs li").removeClass("active");
            $this.parent().addClass("active");
            $dialog.find(".tab-pane").removeClass("active");
            $dialog.find(target).addClass("active");
            if (target === "#builder-logs") {
                _renderLogs($dialog);
            }
        });

        // --- Refresh button ---
        $dialog.find(".builder-log-refresh").on("click", function () {
            _renderLogs($dialog);
        });
    }

    CommandManager.register(Strings.CMD_PHOENIX_BUILDER_CONNECT, COMMAND_ID, _handlePhoenixBuilderConnect, { supportsDesignMode: true });

    // Boot script already connects if enabled — no appReady action needed.

    exports.COMMAND_ID = COMMAND_ID;
});
