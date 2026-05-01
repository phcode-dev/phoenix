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
 * Tiny shared HTML5 `<video>` widget. Two entry points:
 *
 *   createPlayer(options) — returns a configured `<video>` wrapper the
 *       caller can drop anywhere in their UI.
 *
 *   renderFullScreenPlayer(srcElement, options) — opens a viewport-
 *       covering overlay with a large auto-playing player that
 *       expands out of `srcElement` (genie-style) and contracts back
 *       on close. Useful when an inline thumbnail should expand into
 *       a focused fullscreen view on click.
 */
define(function (require, exports, module) {

    const Strings = require("strings");

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

    /**
     * Open a viewport-covering overlay with a large autoplaying video that
     * expands out of `srcElement` (Mac-dock-genie style) and contracts
     * back to it on close. Click on the dimmed backdrop, the close (×)
     * button, or pressing Escape closes the overlay.
     *
     * Defaults: muted, autoplay, controls, preload="auto" (so the bytes
     * stream while the open animation runs and the user can hit play
     * straight away). Override via `options`.
     *
     * @param {HTMLElement|jQuery} srcElement Element the lightbox should
     *      expand from / contract back to. Used only for the source rect;
     *      not modified.
     * @param {Object} options                See createPlayer's options;
     *      additionally honours all the same player flags. `src` required.
     * @returns {{ close: Function }} Handle exposing a programmatic close.
     */
    function renderFullScreenPlayer(srcElement, options) {
        options = options || {};
        if (!options.src) {
            throw new Error("VideoPlayer.renderFullScreenPlayer: options.src is required");
        }

        const srcEl = srcElement && srcElement.jquery ? srcElement[0] : srcElement;
        const originRect = srcEl ? srcEl.getBoundingClientRect() : null;

        const $overlay = $('<div class="phx-video-fullscreen-overlay"></div>');
        const $player = createPlayer({
            src: options.src,
            poster: options.poster,
            // Fullscreen defaults — overridable via options.
            muted:    options.muted    !== false,
            controls: options.controls !== false,
            autoplay: options.autoplay !== false,
            loop:     options.loop === true,
            preload:  options.preload || "auto",
            className: "phx-video-fullscreen-player"
        });
        const closeLabel = (Strings && Strings.CLOSE) || "Close";
        const $closeBtn = $(
            '<button class="phx-video-fullscreen-close" type="button">' +
                '<i class="fa-solid fa-xmark"></i>' +
            '</button>'
        ).attr("title", closeLabel).attr("aria-label", closeLabel);

        const ANIM_OPEN_MS  = 280;
        const ANIM_CLOSE_MS = 220;
        let isClosing = false;

        // Compute the transform that snaps the centered final-position
        // player back over the origin rect — used for both the initial
        // collapsed state and the close animation.
        function transformToOrigin() {
            if (!originRect) { return null; }
            const r = $player[0].getBoundingClientRect();
            if (!r.width || !r.height) { return null; }
            const dx = (originRect.left + originRect.width / 2) -
                       (r.left + r.width / 2);
            const dy = (originRect.top + originRect.height / 2) -
                       (r.top + r.height / 2);
            const scale = Math.min(
                originRect.width / r.width,
                originRect.height / r.height
            );
            return "translate(" + dx + "px," + dy + "px) scale(" + scale + ")";
        }

        function close() {
            if (isClosing) { return; }
            isClosing = true;
            $(document).off("keydown.phxVideoFullscreen");
            const collapseT = transformToOrigin();
            if (collapseT) {
                $player.css({
                    transition: "transform " + ANIM_CLOSE_MS +
                        "ms cubic-bezier(0.4, 0, 1, 1), opacity " +
                        ANIM_CLOSE_MS + "ms ease",
                    transform: collapseT,
                    opacity: 0
                });
                $closeBtn.css({
                    transition: "opacity " + (ANIM_CLOSE_MS - 40) + "ms ease",
                    opacity: 0
                });
                $overlay.css({
                    transition: "background-color " + ANIM_CLOSE_MS + "ms ease",
                    backgroundColor: "rgba(0,0,0,0)"
                });
                setTimeout(function () { $overlay.remove(); }, ANIM_CLOSE_MS + 20);
            } else {
                $overlay.remove();
            }
        }

        $overlay.on("click", close);
        $player.on("click", function (e) { e.stopPropagation(); });
        $closeBtn.on("click", function (e) { e.stopPropagation(); close(); });
        $(document).on("keydown.phxVideoFullscreen", function (e) {
            if (e.key === "Escape") { close(); }
        });

        $overlay.append($player).append($closeBtn);
        $("body").append($overlay);

        // Two-frame FLIP open animation: lay out at the natural centered
        // position so we can measure the destination rect, snap visually
        // back to the origin with a transform, force a paint, then animate
        // to identity. Result: the lightbox appears to expand out of the
        // source element.
        const startT = transformToOrigin();
        if (startT) {
            $player.css({
                transform: startT,
                opacity: 0.6,
                transition: "none"
            });
            // Force reflow so the next style write transitions instead
            // of collapsing into a single paint.
            void $player[0].offsetWidth;
            $player.css({
                transition: "transform " + ANIM_OPEN_MS +
                    "ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity " +
                    (ANIM_OPEN_MS - 80) + "ms ease",
                transform: "translate(0px, 0px) scale(1)",
                opacity: 1
            });
        }

        return { close: close };
    }

    exports.createPlayer            = createPlayer;
    exports.renderFullScreenPlayer  = renderFullScreenPlayer;
});
