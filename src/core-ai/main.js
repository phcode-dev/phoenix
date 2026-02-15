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
 * Registers a placeholder AI sidebar tab. This serves as a starting point for
 * AI assistant integration. The tab displays a placeholder message until an AI
 * provider extension is installed.
 */
define(function (require, exports, module) {

    var AppInit      = require("utils/AppInit"),
        SidebarTabs  = require("view/SidebarTabs");

    AppInit.appReady(function () {
        SidebarTabs.addTab("ai", "AI", "fa-solid fa-wand-magic-sparkles", { priority: 200 });

        var $content = $(
            '<div class="ai-tab-placeholder">' +
                '<div class="ai-tab-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div>' +
                '<div class="ai-tab-title">AI Assistant</div>' +
                '<div class="ai-tab-message">Please add an AI provider to start using AI</div>' +
            '</div>'
        );

        SidebarTabs.addToTab("ai", $content);
    });
});
