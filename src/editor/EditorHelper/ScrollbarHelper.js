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
 * Editor scrollbar behaviour helpers. Only to be used from Editor.js.
 */

define(function (require, exports, module) {

    /**
     * Install click-to-jump on an editor's native scrollbars: clicking an empty part of the track
     * jumps straight to that proportional position, instead of the browser default of paging one
     * viewport at a time (painfully slow to reach a far-off spot in a large file). A click on the
     * thumb is left to the native drag.
     *
     * CodeMirror's "native" scrollbars are real overflow:scroll <div>s (.CodeMirror-vscrollbar /
     * .CodeMirror-hscrollbar); setting their scroll offset syncs the editor, since CodeMirror listens
     * to their scroll event. Unlike most native scrollbars, this webview still delivers mousedown on
     * them, so we can intercept a track click.
     *
     * @param {!Editor} editor
     */
    function installClickToJump(editor) {
        const cm = editor._codeMirror;
        const wrapper = cm && cm.getWrapperElement();
        if (!wrapper) {
            return;
        }

        // Capture phase so we can suppress the native paging before it runs.
        wrapper.addEventListener("mousedown", function (e) {
            const el = e.target;
            if (e.button !== 0 || !el || !el.classList) {
                return;
            }
            let axis;
            if (el.classList.contains("CodeMirror-vscrollbar")) {
                axis = "v";
            } else if (el.classList.contains("CodeMirror-hscrollbar")) {
                axis = "h";
            } else {
                return;
            }

            const rect = el.getBoundingClientRect();
            const view = (axis === "v") ? el.clientHeight : el.clientWidth;   // visible track px
            const full = (axis === "v") ? el.scrollHeight : el.scrollWidth;   // scrollable px
            if (full <= view) {
                return; // nothing to scroll
            }
            const cur = (axis === "v") ? el.scrollTop : el.scrollLeft;
            const thumbStart = (cur / full) * view;
            const thumbSize = (view / full) * view;
            const clickPos = (axis === "v") ? (e.clientY - rect.top) : (e.clientX - rect.left);
            if (clickPos >= thumbStart && clickPos <= thumbStart + thumbSize) {
                return; // on the thumb - let the native drag handle it
            }

            // Track click: centre the thumb on the cursor and jump there immediately.
            let target = (clickPos / view) * full - view / 2;
            target = Math.max(0, Math.min(target, full - view));
            e.preventDefault();
            if (axis === "v") {
                el.scrollTop = target;
            } else {
                el.scrollLeft = target;
            }
        }, true);
        // No explicit removal: the wrapper element is removed on editor.destroy().
    }

    exports.installClickToJump = installClickToJump;
});
