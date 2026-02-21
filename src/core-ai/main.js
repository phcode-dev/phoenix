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

/**
 * AI sidebar tab integration. Sets up a NodeConnector to the claude-code-agent
 * running in the node process and initializes the AIChatPanel UI.
 *
 * In non-native (browser) builds, shows a placeholder message instead.
 */
define(function (require, exports, module) {

    const AppInit             = require("utils/AppInit"),
        SidebarTabs         = require("view/SidebarTabs"),
        NodeConnector       = require("NodeConnector"),
        AIChatPanel         = require("core-ai/AIChatPanel"),
        PhoenixConnectors   = require("core-ai/aiPhoenixConnectors");

    const AI_CONNECTOR_ID = "ph_ai_claude";

    exports.getFileContent = async function (params) {
        return PhoenixConnectors.getFileContent(params);
    };

    exports.applyEditToBuffer = async function (params) {
        return PhoenixConnectors.applyEditToBuffer(params);
    };

    exports.getEditorState = async function () {
        return PhoenixConnectors.getEditorState();
    };

    exports.takeScreenshot = async function (params) {
        return PhoenixConnectors.takeScreenshot(params);
    };

    exports.execJsInLivePreview = async function (params) {
        return PhoenixConnectors.execJsInLivePreview(params);
    };

    AppInit.appReady(function () {
        SidebarTabs.addTab("ai", "AI", "fa-solid fa-wand-magic-sparkles", { priority: 200 });

        if (Phoenix.isNativeApp) {
            const nodeConnector = NodeConnector.createNodeConnector(AI_CONNECTOR_ID, exports);
            AIChatPanel.init(nodeConnector);
        } else {
            AIChatPanel.initPlaceholder();
        }
    });
});
