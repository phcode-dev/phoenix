/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

/**
 * Shared drag helpers for integ tests.
 *
 * The test harness loads the app inside a child window (testWindow). Production
 * code — most importantly `utils/Resizer` — attaches `mousemove` / `mouseup`
 * listeners to that window's document via jQuery, and commits its work in
 * `requestAnimationFrame` callbacks. To exercise those paths we must:
 *
 *   - construct MouseEvents with `view: testWindow` so `event.view` is set and
 *     jQuery's normalization picks up the correct document,
 *   - dispatch `mousedown` against the drag handle itself (Resizer only arms
 *     its pointer-tracking after seeing the mousedown),
 *   - dispatch `mousemove` / `mouseup` against `testWindow.document`,
 *   - yield for at least one `requestAnimationFrame` tick between moves so
 *     `doRedraw` can run.
 *
 * Works under the harness's modern browser engines (the Chrome-based Tauri
 * shell, Firefox, Safari, and the standalone Electron test runner). The
 * MouseEvent constructor is the only spec-blessed path that sets coordinates
 * on bubbled events across those engines — `document.createEvent("MouseEvents")`
 * + `initMouseEvent` is deprecated and drops clientX/clientY in some Safari
 * versions, so we deliberately avoid it.
 */
define(function (require, exports, module) {

    function _awaitFrames(win, n) {
        return new Promise(function (resolve) {
            let remaining = n;
            function tick() {
                remaining -= 1;
                if (remaining <= 0) {
                    resolve();
                    return;
                }
                win.requestAnimationFrame(tick);
            }
            win.requestAnimationFrame(tick);
        });
    }

    function _fireMouse(target, type, x, y, win, buttons) {
        const ev = new win.MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            view: win,
            clientX: x,
            clientY: y,
            button: 0,
            buttons: buttons
        });
        target.dispatchEvent(ev);
    }

    /**
     * Simulate a user drag from the center of `startEl` to (endX, endY) inside
     * `testWindow`. Emits one mousedown on the handle, `steps` mousemoves along
     * the straight line to the destination, and a final mouseup, yielding to
     * rAF between moves so Resizer's doRedraw commits each increment.
     *
     * @param {DOMElement|jQuery} startEl   The element the drag starts on
     *     (typically the resizer handle).
     * @param {number} endX                  Final clientX (in testWindow viewport).
     * @param {number} endY                  Final clientY (in testWindow viewport).
     * @param {Window} testWindow            The child window that owns the DOM.
     * @param {?number} steps                Number of intermediate mousemoves
     *     (default 8). More steps = smoother drag, more rAF waits.
     */
    async function dragFromElement(startEl, endX, endY, testWindow, steps) {
        const el = startEl.jquery ? startEl[0] : startEl;
        const rect = el.getBoundingClientRect();
        const startX = rect.left + rect.width / 2;
        const startY = rect.top + rect.height / 2;
        const doc = testWindow.document;
        const moveSteps = (typeof steps === "number" && steps > 0) ? steps : 8;

        _fireMouse(el, "mousedown", startX, startY, testWindow, 1);
        await _awaitFrames(testWindow, 1);

        for (let i = 1; i <= moveSteps; i++) {
            const t = i / moveSteps;
            const x = startX + (endX - startX) * t;
            const y = startY + (endY - startY) * t;
            _fireMouse(doc, "mousemove", x, y, testWindow, 1);
            await _awaitFrames(testWindow, 1);
        }

        _fireMouse(doc, "mouseup", endX, endY, testWindow, 0);
        await _awaitFrames(testWindow, 2);
        // After a real drag Resizer removes its full-viewport `.resizing-container`
        // shield immediately on mouseup, but a press+release with no effective
        // movement leaves it in the DOM for 300ms (so a trailing mousedown still
        // registers as a double-click). If a drag degenerates to no movement and
        // the next test fires its mousedown before the shield is removed, it lands
        // on the shield rather than the handle and the drag silently no-ops.
        // Waiting the window out keeps consecutive drags reliable either way.
        await new Promise(function (resolve) { testWindow.setTimeout(resolve, 320); });
    }

    exports.dragFromElement = dragFromElement;
});
