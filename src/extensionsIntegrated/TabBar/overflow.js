define(function (require, exports, module) {

    /**
     * This function determines which tabs are hidden in the tab bar due to overflow
     * and returns them as an array of tab data objects
     *
     * @param {String} paneId - The ID of the pane ("first-pane" or "second-pane")
     * @returns {Array} - Array of hidden tab data objects
     */
    function _getListOfHiddenTabs(paneId) {
        // Select the appropriate tab bar based on pane ID
        const $currentTabBar = paneId === "first-pane"
            ? $("#phoenix-tab-bar")
            : $("#phoenix-tab-bar-2");

        // Need to access the DOM element to get its bounding rectangle
        const tabBarRect = $currentTabBar[0].getBoundingClientRect();

        // Get the overflow button element
        const $overflowButton = paneId === "first-pane"
            ? $("#overflow-button")
            : $("#overflow-button-2");

        // Account for overflow button width in calculation
        const overflowButtonWidth = $overflowButton.is(":visible") ? $overflowButton.outerWidth() : 0;

        const hiddenTabs = [];

        // Examine each tab to determine if it's visible
        $currentTabBar.find('.tab').each(function () {
            const tabRect = this.getBoundingClientRect();

            // A tab is considered hidden if it extends beyond the right edge of the tab bar
            // minus the width of the overflow button (if visible)
            const isVisible = tabRect.left >= tabBarRect.left &&
                tabRect.right <= (tabBarRect.right - overflowButtonWidth);

            if (!isVisible) {
                // Extract and store information about the hidden tab
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

    function _getNamesFromTabsData(tabsData) {
        return tabsData.map(tab => tab.name);
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
            // for the html elements, refer to ./html/tabbar-pane.html
            const $tabBar = $("#phoenix-tab-bar");
            const $overflowButton = $("#overflow-button");

            if (hiddenTabs.length > 0) {
                $overflowButton.removeClass("hidden");
            } else {
                $overflowButton.addClass("hidden");
            }
        } else {
            // for the html elements, refer to ./html/tabbar-second-pane.html
            const $tabBar = $("#phoenix-tab-bar-2");
            const $overflowButton = $("#overflow-button-2");

            if (hiddenTabs.length > 0) {
                $overflowButton.removeClass("hidden");
            } else {
                $overflowButton.addClass("hidden");
            }
        }
    }

    function showOverflowMenu(paneId, x, y) {
        const hiddenTabs = _getListOfHiddenTabs(paneId);



    }




    /**
     * To setup the handlers for the overflow menu
     */
    function setupOverflowHandlers() {

        $(document).on("click", "#overflow-button", function (e) {
            e.stopPropagation();
            showOverflowMenu("first-pane", e.pageX, e.pageY);
        });

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
        toggleOverflowVisibility
    };
});
