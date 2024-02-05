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

/*global Phoenix*/

/**
 * Initializes the default brackets menu items.
 */
define(function (require, exports, module) {
    const KEY = {
        ENTER: "Enter",
        RETURN: "Return",
        ESCAPE: "Escape",
        ARROW_LEFT: "ArrowLeft",
        ARROW_RIGHT: "ArrowRight",
        ARROW_UP: "ArrowUp",
        ARROW_DOWN: "ArrowDown",
        SPACE: " ",
        TAB: "Tab",
        BACKSPACE: "Backspace",
        DELETE: "Delete",
        HOME: "Home",
        END: "End",
        PAGE_UP: "PageUp",
        PAGE_DOWN: "PageDown",
        SHIFT: "Shift",
        CONTROL: "Control",
        ALT: "Alt",
        META: "Meta", // Command key on Mac, Windows key on Windows
        F1: "F1",
        F2: "F2",
        F3: "F3",
        F4: "F4",
        F5: "F5",
        F6: "F6",
        F7: "F7",
        F8: "F8",
        F9: "F9",
        F10: "F10",
        F11: "F11",
        F12: "F12",
        INSERT: "Insert",
        CONTEXT_MENU: "ContextMenu", // Usually the menu key or right-click keyboard button
        NUM_LOCK: "NumLock",
        SCROLL_LOCK: "ScrollLock",
        CAPS_LOCK: "CapsLock"
    };
    exports.KEY = KEY;
});
