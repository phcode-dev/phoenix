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

/**
 * Utilities for showing notifications.
 */
define(function (require, exports, module) {


    let AppInit         = require("utils/AppInit"),
        EventDispatcher = require("utils/EventDispatcher"),
        CommandManager  = require("command/CommandManager"),
        KeyEvent        = require("utils/KeyEvent");

    /**
     * Creates a new modal dialog from a given template.
     * The template can either be a string or a jQuery object representing a DOM node that is *not* in the current DOM.
     *
     * @param {string} template A string template or jQuery object to use as the dialog HTML.
     * @return {Notification}
     */
    function showNotification(template) {
        console.log(FloatingUIDOM);
        if (autoDismiss === undefined) {
            autoDismiss = true;
        }

        $("body").append("<div class='modal-wrapper'><div class='modal-inner-wrapper'></div></div>");
    }

    exports.showNotification = showNotification;
});
