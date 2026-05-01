/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License along
 * with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

// @INCLUDE_IN_API_DOCS

/**
 * Tiny shared HTML5 `<video>` widget. Wraps a single `<video>` element in a
 * div so callers can drop a configured player into their UI without
 * re-deriving sensible defaults each time. Defaults (controls + muted +
 * playsinline + preload="metadata") are tuned for inline product videos —
 * the kind of "watch this short clip" surface where the user has not yet
 * signalled intent to play.
 */
define(function (require, exports, module) {


    /**
     * Build a `<video>` element wrapped in a div with sensible Phoenix
     * defaults. Returns the wrapper as a jQuery object; the caller appends
     * and disposes it.
     *
     * @param {Object}   options
     * @param {string}   options.src              Video URL (required).
     * @param {string}   [options.poster]         Optional poster image URL.
     * @param {boolean}  [options.controls=true]  Show native player controls.
     * @param {boolean}  [options.muted=true]     Start muted.
     * @param {boolean}  [options.autoplay=false] Autoplay on insert (browsers
     *                                            only honour this when also muted).
     * @param {boolean}  [options.loop=false]
     * @param {string}   [options.preload="metadata"] One of "none", "metadata",
     *                                                "auto". Use "auto" when you
     *                                                want the bytes to fetch in
     *                                                the background after the
     *                                                poster paints.
     * @param {string}   [options.className]      Extra class on the wrapper.
     * @returns {jQuery} `<div class="phx-video-player ..."><video.../></div>`
     */
    function createPlayer(options) {
        options = options || {};
        if (!options.src) {
            throw new Error("VideoPlayer.createPlayer: options.src is required");
        }
        const controls = options.controls !== false;
        const muted    = options.muted    !== false;
        const autoplay = options.autoplay === true;
        const loop     = options.loop     === true;
        const preload  = options.preload || "metadata";

        const wrapperClass = "phx-video-player" +
            (options.className ? " " + options.className : "");
        const $wrap = $('<div></div>').addClass(wrapperClass);
        const $video = $('<video playsinline></video>')
            .attr("preload", preload)
            .attr("src", options.src);

        if (options.poster) {
            $video.attr("poster", options.poster);
        }
        if (controls) {
            $video.attr("controls", "");
        }
        // The DOM properties are what HTMLMediaElement actually reads at
        // load time; the matching attributes are set so server-side / dev
        // tooling that scrapes outerHTML still sees the configured state.
        if (muted) {
            $video.attr("muted", "");
            $video[0].muted = true;
        }
        if (autoplay) {
            $video.attr("autoplay", "");
            $video[0].autoplay = true;
        }
        if (loop) {
            $video.attr("loop", "");
            $video[0].loop = true;
        }

        $wrap.append($video);
        return $wrap;
    }

    exports.createPlayer = createPlayer;
});
