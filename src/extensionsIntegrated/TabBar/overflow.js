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


/*
 * This file houses the functionality for overflow tabs,
 * the overflow tabs appear when there are too many tabs in a pane
 * overflow button when clicked opens up a dropdown menu which displays all the hidden tabs
 * and allows the user to open them, close them and to achieve other functionalities from there
 */
/* eslint-disable no-invalid-this */
define(function (require, exports, module) {
    const _ = require("thirdparty/lodash");
    const DropdownButton = require("widgets/DropdownButton");
    const CommandManager = require("command/CommandManager");
    const Commands = require("command/Commands");
    const FileSystem = require("filesystem/FileSystem");

    // the open dropdown, there is only ever one
    let _dropdown = null;

    /**
     * This function determines which tabs are hidden in the tab bar due to overflow
     * and returns them as an array of tab data objects. It reads the DOM, so it is only
     * ever called when the menu is actually opened
     *
     * @param {HTMLElement} bar - the pane's tab bar element
     * @returns {Array} - Array of hidden tab data objects
     */
    function _getHiddenTabs(bar) {
        const barRect = bar.getBoundingClientRect();
        const hiddenTabs = [];

        for (const tab of bar.children) {
            const tabRect = tab.getBoundingClientRect();

            // A tab is considered hidden if it is not completely visible
            // 2 is added here, because when we scroll till the very end of the tab bar even though,
            // the last tab was shown in the overflow menu even though it was completely visible
            // this bug was coming because a part of the last tab got hidden inside the dropdown icon
            if (tabRect.left < barRect.left || tabRect.right > barRect.right + 2) {
                hiddenTabs.push({
                    path: tab.getAttribute("data-path"),
                    name: tab.querySelector(".tab-name").textContent,
                    isDirty: tab.classList.contains("dirty"),
                    isPinned: tab.classList.contains("pinned"),
                    isPlaceholder: tab.classList.contains("placeholder"),
                    iconHtml: tab.querySelector(".tab-icon").innerHTML
                });
            }
        }

        return hiddenTabs;
    }

    /**
     * renders a single item of the dropdown
     * @param {Object} item - a hidden tab data object
     * @return {{html: string, enabled: boolean}}
     */
    function _renderItem(item) {
        const path = _.escape(item.path);
        const dirtyHtml = item.isDirty
            ? '<span class="tab-dirty-icon-overflow">•</span>'
            : '<span class="tab-dirty-icon-overflow empty"></span>'; // adding an empty span for better alignment
        const controlHtml = item.isPinned
            ? `<span class="tab-pin-icon-overflow" data-tab-path="${path}">
                <i class="pinned-file-icon"></i></span>`
            : `<span class="tab-close-icon-overflow" data-tab-path="${path}">
                <i class="fa-solid fa-times"></i></span>`;

        return {
            html: `<div class="dropdown-tab-item${item.isPlaceholder ? " placeholder-item" : ""}" data-tab-path="${path}">
                <div class="tab-info-container">
                    ${dirtyHtml}
                    <span class="tab-icon-container">${item.iconHtml}</span>
                    <span class="tab-name-container">${_.escape(item.name)}</span>
                </div>
                ${controlHtml}
            </div>`,
            enabled: true
        };
    }

    /**
     * This function is called when the overflow button is clicked
     * This will show the overflow context menu
     *
     * @param {String} paneId - the id of the pane ["first-pane", "second-pane"]
     * @param {HTMLElement} bar - the pane's tab bar element
     * @param {jQuery} $button - the overflow button that was clicked
     */
    function _showOverflowMenu(paneId, bar, $button) {
        const hiddenTabs = _getHiddenTabs(bar);
        if (!hiddenTabs.length) {
            return;
        }

        const dropdown = new DropdownButton.DropdownButton("", hiddenTabs, _renderItem);
        // add custom class to separate overflow dropdown from regular ones
        dropdown.dropdownExtraClasses = "dropdown-overflow-menu";
        // the real overflow button stands in for the one DropdownButton creates, that way the list opens
        // right under it and clicking it again isn't taken as a click outside the list
        dropdown.$button = $button;
        _dropdown = dropdown;

        dropdown.on("select", function (event, item) {
            CommandManager.execute(Commands.FILE_OPEN, { fullPath: item.path, paneId: paneId });
        });
        dropdown.on(DropdownButton.EVENT_DROPDOWN_CLOSED, function () {
            if (_dropdown === dropdown) {
                _dropdown = null;
            }
        });

        dropdown.showDropdown();

        // these icons sit inside the list items. Being the innermost element they get the click first
        // and keep it from reaching the item, which would otherwise open the file
        dropdown.$dropdown.find(".tab-close-icon-overflow").on("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            const file = FileSystem.getFileForPath(this.getAttribute("data-tab-path"));
            dropdown.closeDropdown();
            CommandManager.execute(Commands.FILE_CLOSE, { file: file, paneId: paneId });
        });
        dropdown.$dropdown.find(".tab-pin-icon-overflow").on("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            const file = FileSystem.getFileForPath(this.getAttribute("data-tab-path"));
            dropdown.closeDropdown();
            CommandManager.execute(Commands.FILE_PIN, { file: file, paneId: paneId, pinned: false });
        });
    }

    /**
     * initialize the handling of the overflow buttons
     * this also registers the event handlers
     */
    function init() {
        // the overflow button opens the dropdown and closes it when it is open already
        $(document).on("click", ".tab-bar-container .overflow-button", function (event) {
            event.stopPropagation();
            if (_dropdown) {
                _dropdown.closeDropdown();
                return;
            }
            const container = this.closest(".tab-bar-container");
            _showOverflowMenu(container.getAttribute("data-pane-id"),
                container.querySelector(".phoenix-tab-bar"), $(this));
        });

        // DropdownButton closes itself on a mousedown outside the list, this covers plain clicks too
        $(document).on("click", function (event) {
            if (_dropdown && !$(event.target).closest(".dropdown-overflow-menu, .overflow-button").length) {
                _dropdown.closeDropdown();
            }
        });
    }

    module.exports = {
        init
    };
});
