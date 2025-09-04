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

    const DropdownButton = require("widgets/DropdownButton");
    const MainViewManager = require("view/MainViewManager");
    const CommandManager = require("command/CommandManager");
    const Commands = require("command/Commands");
    const EditorManager = require("editor/EditorManager");
    const FileSystem = require("filesystem/FileSystem");

    // holds the dropdown instance
    let $dropdown = null;

    /**
     * This function determines which tabs are hidden in the tab bar due to overflow
     * and returns them as an array of tab data objects
     *
     * @param {String} paneId - The ID of the pane ("first-pane" or "second-pane")
     * @returns {Array} - Array of hidden tab data objects
     */
    function _getListOfHiddenTabs(paneId) {
        // get the appropriate tab bar based on pane ID
        const $currentTabBar = paneId === "first-pane"
            ? $("#phoenix-tab-bar")
            : $("#phoenix-tab-bar-2");

        // access the DOM element to get its bounding rectangle
        const tabBarRect = $currentTabBar[0].getBoundingClientRect();

        // an array of hidden tabs objects which will store properties like
        // path, name, isActive, isDirty and $icon
        const hiddenTabs = [];

        // check each tab to determine if it's visible
        $currentTabBar.find('.tab').each(function () {
            const tabRect = this.getBoundingClientRect();

            // A tab is considered hidden if it is not completely visible
            // 2 is added here, because when we scroll till the very end of the tab bar even though,
            // the last tab was shown in the overflow menu even though it was completely visible
            // this bug was coming because a part of the last tab got hidden inside the dropdown icon
            const isVisible = tabRect.left >= tabBarRect.left &&
                tabRect.right <= (tabBarRect.right + 2);

            if (!isVisible) {
                // extract and store information about the hidden tab
                const $tab = $(this);
                const tabData = {
                    path: $tab.data('path'),
                    name: $tab.find('.tab-name').text(),
                    isActive: $tab.hasClass('active'),
                    isDirty: $tab.hasClass('dirty'),
                    isPlaceholder: $tab.hasClass('placeholder'),
                    $icon: $tab.find('.tab-icon').clone()
                };

                hiddenTabs.push(tabData);
            }
        });

        return hiddenTabs;
    }


    /**
     * Toggles the visibility of the overflow button based on whether
     * there are any hidden tabs
     * Hidden tabs are tabs that are currently not visible in the tab bar
     *
     * @param {String} paneId - The ID of the pane ("first-pane" or "second-pane")
     */
    function toggleOverflowVisibility(paneId) {
        const hiddenTabs = _getListOfHiddenTabs(paneId);

        if (paneId === "first-pane") {
            // for the html element, refer to ./html/tabbar-pane.html
            const $overflowButton = $("#overflow-button");

            if (hiddenTabs.length > 0) {
                $overflowButton.removeClass("hidden");
            } else {
                $overflowButton.addClass("hidden");
            }
        } else {
            // for the html element, refer to ./html/tabbar-second-pane.html
            const $overflowButton = $("#overflow-button-2");

            if (hiddenTabs.length > 0) {
                $overflowButton.removeClass("hidden");
            } else {
                $overflowButton.addClass("hidden");
            }
        }
    }


    /**
     * This function is called when the overflow button is clicked
     * This will show the overflow context menu
     *
     * @param {String} paneId - the id of the pane ["first-pane", "second-pane"]
     * @param {Number} x - x coordinate for positioning the menu
     * @param {Number} y - y coordinate for positioning the menu
     */
    function showOverflowMenu(paneId, x, y) {
        const hiddenTabs = _getListOfHiddenTabs(paneId);

        // Create a map to track tabs that are being closed
        // Using paths as keys for quick lookup
        const closingTabPaths = {};

        // create the dropdown
        $dropdown = new DropdownButton.DropdownButton("", hiddenTabs, function (item, index) {
            const iconHtml = item.$icon[0].outerHTML; // the file icon
            const dirtyHtml = item.isDirty
                ? '<span class="tab-dirty-icon-overflow">•</span>'
                : '<span class="tab-dirty-icon-overflow empty"></span>'; // adding an empty span for better alignment

            const closeIconHtml =
                `<span class="tab-close-icon-overflow" data-tab-path="${item.path}" data-tab-index="${index}">
                <i class="fa-solid fa-times"></i>
            </span>`;

            // add placeholder class to style it differently
            const placeholderClass = item.isPlaceholder ? ' placeholder-name' : '';

            // return html for this item
            return {
                html:
                    `<div class="dropdown-tab-item${item.isPlaceholder
                        ? ' placeholder-item' : ''
                    }" data-tab-path="${item.path}">
                <div class="tab-info-container">
                    ${dirtyHtml}
                    <span class="tab-icon-container">${iconHtml}</span>
                    <span class="tab-name-container${placeholderClass}">${item.name}</span>
                </div>
                ${closeIconHtml}
            </div>`,
                enabled: true
            };
        });

        // add custom class to separate overflow dropdown from regular ones
        $dropdown.dropdownExtraClasses = "dropdown-overflow-menu";

        // appending to document body. we'll position this with absolute positioning
        $("body").append($dropdown.$button);

        // position the dropdown where the user clicked
        $dropdown.$button.css({
            position: "absolute",
            left: x + "px",
            top: y + "px",
            zIndex: 1000
        });


        // custom handler for close button clicks - must be set up BEFORE showing dropdown
        // using one because we only want to run this handler once
        $(document).one("mousedown", ".tab-close-icon-overflow", function (e) {
            // store the path of the tab being closed
            const tabPath = $(this).data("tab-path");
            closingTabPaths[tabPath] = true;

            // we don't stop propagation here - let the event bubble up
            // because we want the tab click handler to run as we are not closing the tab here
            // Why all this is done instead of simply closing the tab?
            // There was no way to stop the tab click handler from running.
            // Tried propagating the event, and all other stuff but that didn't work.
            // So what used to happen was that the tab used to get closed but then appeared again

            // But we do prevent the default action
            e.preventDefault();
        });

        $dropdown.showDropdown();

        // handle the option selection
        $dropdown.on("select", function (e, item, index) {
            // check if this tab was marked for closing
            if (closingTabPaths[item.path]) {
                // this tab is being closed, so handle the close operation
                const file = FileSystem.getFileForPath(item.path);

                if (file) {
                    // use setTimeout to ensure this happens after all event handlers
                    setTimeout(function () {
                        CommandManager.execute(Commands.FILE_CLOSE, { file: file, paneId: paneId });
                        // clean up
                        delete closingTabPaths[item.path];
                    }, 0);
                }

                return false;
            }
            // regular tab selection - open the file
            const filePath = item.path;
            if (filePath) {
                // Set the active pane and open the file
                MainViewManager.setActivePaneId(paneId);
                CommandManager.execute(Commands.FILE_OPEN, { fullPath: filePath });

                // get the tab bar element based on paneId and scroll to the active tab
                // we use setTimeout to ensure that the DOM has updated after the file open command
                setTimeout(function () {
                    const $tabBarElement = paneId === "first-pane" ?
                        $("#phoenix-tab-bar") : $("#phoenix-tab-bar-2");
                    scrollToActiveTab($tabBarElement);
                }, 100);
            }
        });

        // a button was getting displayed on the screen wherever a click was made. not sure why
        // but this fixes it
        $dropdown.$button.css({
            display: "none"
        });
    }


    /**
     * Scrolls the tab bar to the active tab.
     * When scrolling the tab bar, we calculate the distance we need to scroll and based on that distance,
     * we set the duration.
     * This ensures that the scrolling speed is consistent no matter the distance or number of tabs present in tab bar.
     *
     * @param {JQuery} $tabBarElement - The tab bar element,
     * this is either $('#phoenix-tab-bar') or $('phoenix-tab-bar-2')
     */
    function scrollToActiveTab($tabBarElement) {
        if (!$tabBarElement || !$tabBarElement.length) {
            return;
        }

        let activePath;

        // get the active file
        const activeEditor = EditorManager.getActiveEditor();
        if (activeEditor && activeEditor.document && activeEditor.document.file) {
            activePath = activeEditor.document.file.fullPath;
        } else {
            // If there is no active editor, we need to check if its an image file
            const currentFile = MainViewManager.getCurrentlyViewedFile();
            if (currentFile) {
                activePath = currentFile.fullPath;
            } else {
                // if not an image file, not a text file, we don't need to scroll
                return;
            }
        }

        // get the active tab. the active tab is the tab that is currently open
        const $activeTab = $tabBarElement.find(`.tab[data-path="${activePath}"]`);

        if ($activeTab.length) {
            // get the tab bar container's dimensions
            const tabBar = $tabBarElement[0];
            const tabBarRect = tabBar.getBoundingClientRect();
            const tabBarVisibleWidth = tabBarRect.width;

            // get the active tab's dimensions
            const tabRect = $activeTab[0].getBoundingClientRect();

            // calculate the tab's position relative to the tab bar container
            const tabLeftRelative = tabRect.left - tabBarRect.left;
            const tabRightRelative = tabRect.right - tabBarRect.left;

            // get current scroll position
            const currentScroll = tabBar.scrollLeft;
            let targetScroll = currentScroll;
            let scrollDistance = 0;

            // calculate needed scroll adjustment
            if (tabLeftRelative < 0) {
                targetScroll = currentScroll + tabLeftRelative - 10;
            } else if (tabRightRelative > tabBarVisibleWidth) {
                const scrollAdjustment = tabRightRelative - tabBarVisibleWidth + 10;
                targetScroll = currentScroll + scrollAdjustment;
            }

            // calculate the scroll distance in pixels
            scrollDistance = Math.abs(targetScroll - currentScroll);

            // calculate duration based on distance (0.15ms per pixel + 100ms base)
            // min 100ms, max 400ms
            let duration = Math.min(Math.max(scrollDistance * 0.15, 100), 400);

            // only animate if we need to move more than 5 pixels
            // otherwise, we can just jump
            if (scrollDistance > 5) {
                $tabBarElement.stop(true).animate(
                    { scrollLeft: targetScroll },
                    duration,
                    'linear'
                );
            } else {
                tabBar.scrollLeft = targetScroll;
            }
        }
    }

    /**
     * to close the overflow button's dropdown
     */
    function _closeDropdown() {
        if ($dropdown) {
            if ($dropdown.$button) {
                $dropdown.$button.remove();
            }
            $dropdown = null;
        }
    }

    /**
     * this function gets called when the overflow button gets clicked
     * it shows/closes the dropdown as required
     * @param {Event} e - the event instance
     * @param {String} paneId - the pane id "first-pane" or "second-pane"
     */
    function _handleOverflowButtonClick(e, paneId) {
        e.stopPropagation();
        $dropdown ? _closeDropdown() : showOverflowMenu(paneId, e.pageX, e.pageY);
    }

    /**
     * initialize the handling of the overflow buttons
     * this also registers the event handlers
     */
    function init() {
        // when clicked anywhere on the page we want to close the dropdown
        // except the overflow-buttons
        $("html").on("click", function (e) {
            if ($(e.target).closest("#overflow-button, #overflow-button-2").length) { return; }
            _closeDropdown();
        });

        // handle when the overflow button is clicked for the first pane
        $(document).on("click", "#overflow-button", function (e) {
            _handleOverflowButtonClick(e, "first-pane");
        });

        // for second pane
        $(document).on("click", "#overflow-button-2", function (e) {
            _handleOverflowButtonClick(e, "second-pane");
        });
    }

    module.exports = {
        init,
        toggleOverflowVisibility,
        scrollToActiveTab
    };
});
