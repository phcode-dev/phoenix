/* eslint-disable no-invalid-this */
define(function (require, exports, module) {

    const DropdownButton = require("widgets/DropdownButton");
    const MainViewManager = require("view/MainViewManager");
    const CommandManager = require("command/CommandManager");
    const Commands = require("command/Commands");
    const EditorManager = require("editor/EditorManager");
    const FileSystem = require("filesystem/FileSystem");


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

        // first, remove any existing dropdown menus to prevent duplicates
        $(".dropdown-overflow-menu").remove();

        // Create a map to track tabs that are being closed
        // Using paths as keys for quick lookup
        const closingTabPaths = {};

        // create the dropdown
        const dropdown = new DropdownButton.DropdownButton("", hiddenTabs, function (item, index) {
            const iconHtml = item.$icon[0].outerHTML; // the file icon
            const dirtyHtml = item.isDirty
                ? '<span class="tab-dirty-icon">•</span>'
                : ''; // to display the dirty icon in the overflow menu

            const closeIconHtml =
                `<span class="tab-close-icon-overflow" data-tab-path="${item.path}" data-tab-index="${index}">
                <i class="fa-solid fa-times"></i>
            </span>`;

            // return html for this item
            return {
                html:
                    `<div class="dropdown-tab-item" data-tab-path="${item.path}">
                        <span class="tab-icon-container">${iconHtml}</span>
                        <span class="tab-name-container">${item.name}</span>
                        ${dirtyHtml}
                        ${closeIconHtml}
                    </div>`,
                enabled: true  // make sure items are enabled
            };
        });

        // add the custom classes for styling the dropdown
        dropdown.dropdownExtraClasses = "dropdown-overflow-menu";
        dropdown.$button.addClass("btn-overflow-tabs");

        // appending to document body. we'll position this with absolute positioning
        $("body").append(dropdown.$button);

        // position the dropdown where the user clicked
        dropdown.$button.css({
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

        dropdown.showDropdown();

        // handle the option selection
        dropdown.on("select", function (e, item, index) {
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
            }
        });

        // clean up when the dropdown is closed
        dropdown.$button.on("dropdown-closed", function () {
            $(document).off("mousedown", ".tab-close-icon-overflow");
            dropdown.$button.remove();
        });

        // a button was getting displayed on the screen wherever a click was made. not sure why
        // but this fixes it
        dropdown.$button.css({
            display: "none"
        });
    }


    /**
     * Scrolls the tab bar to the active tab
     *
     * @param {JQuery} $tabBarElement - The tab bar element,
     * this is either $('#phoenix-tab-bar') or $('phoenix-tab-bar-2')
     */
    function scrollToActiveTab($tabBarElement) {
        if (!$tabBarElement || !$tabBarElement.length) {
            return;
        }

        // make sure there is an active editor
        const activeEditor = EditorManager.getActiveEditor();
        if (!activeEditor || !activeEditor.document || !activeEditor.document.file) {
            return;
        }

        const activePath = activeEditor.document.file.fullPath;
        // get the active tab. the active tab is the tab that is currently open
        const $activeTab = $tabBarElement.find(`.tab[data-path="${activePath}"]`);

        if ($activeTab.length) {
            // get the tab bar container's dimensions
            const tabBarRect = $tabBarElement[0].getBoundingClientRect();
            const tabBarVisibleWidth = tabBarRect.width;

            // get the active tab's dimensions
            const tabRect = $activeTab[0].getBoundingClientRect();

            // calculate the tab's position relative to the tab bar container
            const tabLeftRelative = tabRect.left - tabBarRect.left;
            const tabRightRelative = tabRect.right - tabBarRect.left;

            // get the current scroll position
            const currentScroll = $tabBarElement.scrollLeft();

            // Adjust scroll position if the tab is off-screen
            if (tabLeftRelative < 0) {
                // tab is too far to the left
                $tabBarElement.scrollLeft(currentScroll + tabLeftRelative - 10); // 10px padding
            } else if (tabRightRelative > tabBarVisibleWidth) {
                // tab is too far to the right
                const scrollAdjustment = tabRightRelative - tabBarVisibleWidth + 10; // 10px padding
                $tabBarElement.scrollLeft(currentScroll + scrollAdjustment);
            }
        }
    }


    /**
     * To setup the handlers for the overflow menu
     */
    function setupOverflowHandlers() {
        // handle when the overflow button is clicked for the first pane
        $(document).on("click", "#overflow-button", function (e) {
            e.stopPropagation();
            showOverflowMenu("first-pane", e.pageX, e.pageY);
        });

        // for second pane
        $(document).on("click", "#overflow-button-2", function (e) {
            e.stopPropagation();
            showOverflowMenu("second-pane", e.pageX, e.pageY);
        });
    }

    // initialize the handling of the overflow buttons
    function init() {
        setupOverflowHandlers();
    }

    module.exports = {
        init,
        toggleOverflowVisibility,
        scrollToActiveTab
    };
});
