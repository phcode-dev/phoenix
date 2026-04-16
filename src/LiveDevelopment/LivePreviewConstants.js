/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*global less, Phoenix */

/**
 * main integrates LiveDevelopment into Brackets
 *
 * This module creates two menu items:
 *
 *  "Go Live": open or close a Live Development session and visualize the status
 *  "Highlight": toggle source highlighting
 */
define(function main(require, exports, module) {
    exports.LIVE_PREVIEW_MODE = "preview";
    exports.LIVE_HIGHLIGHT_MODE = "highlight";
    exports.LIVE_EDIT_MODE = "edit";

    exports.PREFERENCE_LIVE_PREVIEW_MODE = "livePreviewMode";

    exports.PREFERENCE_PROJECT_ELEMENT_HIGHLIGHT = "livePreviewInspectElement";
    exports.HIGHLIGHT_HOVER = "hover";
    exports.HIGHLIGHT_CLICK = "click";

    exports.PREFERENCE_SHOW_RULER_LINES = "livePreviewShowMeasurements";
});
