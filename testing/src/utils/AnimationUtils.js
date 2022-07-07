/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

/**
 * Utilities for dealing with animations in the UI.
 */
define(function (require, exports, module) {


    var _     = require("thirdparty/lodash"),
        Async = require("utils/Async");

    /**
     * @private
     * Detect the browser's supported transitionend event.
     * @return {string} The supported transitionend event name.
     */
    function _detectTransitionEvent() {
        var event, el = window.document.createElement("fakeelement");

        var transitions = {
            "OTransition": "oTransitionEnd",
            "MozTransition": "transitionend",
            "WebkitTransition": "webkitTransitionEnd",
            "transition": "transitionend"
        };

        _.forEach(transitions, function (value, key) {
            if (el.style[key] !== undefined) {
                event = value;
            }
        });
        return event;
    }

    var _transitionEvent = _detectTransitionEvent();

    /**
     * Start an animation by adding the given class to the given target. When the
     * animation is complete, removes the class, clears the event handler we attach
     * to watch for the animation to finish, and resolves the returned promise.
     *
     * @param {Element} target The DOM node to animate.
     * @param {string} animClass The class that applies the animation/transition to the target.
     * @param {number=} timeoutDuration Time to wait in ms before rejecting promise. Default is 400.
     * @return {$.Promise} A promise that is resolved when the animation completes. Never rejected.
     */
    function animateUsingClass(target, animClass, timeoutDuration) {
        var result  = new $.Deferred(),
            $target = $(target);

        timeoutDuration = timeoutDuration || 400;

        function finish(e) {
            if (e.target === target) {
                result.resolve();
            }
        }

        function cleanup() {
            $target
                .removeClass(animClass)
                .off(_transitionEvent, finish);
        }

        if ($target.is(":hidden")) {
            // Don't do anything if the element is hidden because transitionEnd wouldn't fire
            result.resolve();
        } else {
            // Note that we can't just use $.one() here because we only want to remove
            // the handler when we get the transition end event for the correct target (not
            // a child).
            $target
                .addClass(animClass)
                .on(_transitionEvent, finish);
        }

        // Use timeout in case transition end event is not sent
        return Async.withTimeout(result.promise(), timeoutDuration, true)
            .done(cleanup);
    }

    exports.animateUsingClass = animateUsingClass;
});
