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

/* This file houses the functionality for dragging and dropping tabs */
/* eslint-disable no-invalid-this */
define(function (require, exports, module) {
    const MainViewManager = require("view/MainViewManager");
    const CommandManager = require("command/CommandManager");
    const Commands = require("command/Commands");

    /**
     * These variables track the drag and drop state of tabs
     * draggedTab: The tab that is currently being dragged
     * dragOverTab: The tab that is currently being hovered over
     * dragIndicator: Visual indicator showing where the tab will be dropped
     * scrollInterval: Used for automatic scrolling when dragging near edges
     * dragSourcePane: To track which pane the dragged tab originated from
     */
    let draggedTab = null;
    let dragOverTab = null;
    let dragIndicator = null;
    let scrollInterval = null;
    let dragSourcePane = null;

    /**
     * this function is responsible to make sure that all the drag state is properly cleaned up
     * it is needed to make sure that the tab bar doesn't get unresponsive
     * because of handlers not being attached properly
     */
    function cleanupDragState() {
        $(".tab").removeClass("dragging drag-target");
        $(".empty-pane-drop-target").removeClass("empty-pane-drop-target");
        updateDragIndicator(null);
        draggedTab = null;
        dragOverTab = null;
        dragSourcePane = null;

        if (scrollInterval) {
            clearInterval(scrollInterval);
            scrollInterval = null;
        }

        $("#tab-drag-extended-zone").remove();
    }

    /**
     * Initialize drag and drop functionality for tab bars
     * This is called from `main.js`
     * This function sets up event listeners for both panes' tab bars
     * and creates the visual drag indicator
     *
     * @param {String} firstPaneSelector - Selector for the first pane tab bar $("#phoenix-tab-bar")
     * @param {String} secondPaneSelector - Selector for the second pane tab bar $("#phoenix-tab-bar-2")
     */
    function init(firstPaneSelector, secondPaneSelector) {
        setupDragForTabBar(firstPaneSelector);
        setupDragForTabBar(secondPaneSelector);
        setupContainerDrag(firstPaneSelector);
        setupContainerDrag(secondPaneSelector);

        // Create drag indicator element if it doesn't exist
        if (!dragIndicator) {
            dragIndicator = $('<div class="tab-drag-indicator"></div>');
            $("body").append(dragIndicator);
        }

        // add initialization for empty panes
        initEmptyPaneDropTargets();
    }

    /**
     * Setup drag and drop for a specific tab bar
     * Makes tabs draggable and adds all the necessary event listeners
     *
     * @param {String} tabBarSelector - The selector for the tab bar
     */
    function setupDragForTabBar(tabBarSelector) {
        const $tabs = $(tabBarSelector).find(".tab");

        // Make tabs draggable
        $tabs.attr("draggable", "true");

        // Remove any existing event listeners first to prevent duplicates
        // This is important when the tab bar is recreated or updated
        $tabs.off("dragstart dragover dragenter dragleave drop dragend");

        // Add drag event listeners to each tab
        // Each event has its own handler function for better organization
        $tabs.on("dragstart", handleDragStart);
        $tabs.on("dragover", handleDragOver);
        $tabs.on("dragenter", handleDragEnter);
        $tabs.on("dragleave", handleDragLeave);
        $tabs.on("drop", handleDrop);
        $tabs.on("dragend", handleDragEnd);
    }

    /**
     * Setup container-level drag events
     * This enables dropping tabs in empty spaces and auto-scrolling
     * when dragging near the container's edges
     *
     * @param {String} containerSelector - The selector for the tab bar container
     */
    function setupContainerDrag(containerSelector) {
        const $container = $(containerSelector);
        let lastKnownMousePosition = { x: 0 };
        const boundaryTolerance = 50; // px tolerance outside the container that still allows dropping

        // create a larger drop zone around the container
        // this is done to make sure that even if the tab is not exactly over the tab bar, we still allow drag-drop
        const createOuterDropZone = () => {
            if (draggedTab && !$("#tab-drag-extended-zone").length) {
                // an invisible larger zone around the container that can still receive drops
                const containerRect = $container[0].getBoundingClientRect();
                const $outerZone = $('<div id="tab-drag-extended-zone"></div>').css({
                    position: "fixed",
                    top: containerRect.top - boundaryTolerance,
                    left: containerRect.left - boundaryTolerance,
                    width: containerRect.width + boundaryTolerance * 2,
                    height: containerRect.height + boundaryTolerance * 2,
                    zIndex: 9999,
                    pointerEvents: "all"
                });

                $("body").append($outerZone);

                $outerZone.on("dragover", function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    lastKnownMousePosition.x = e.originalEvent.clientX;

                    autoScrollContainer($container[0], lastKnownMousePosition.x);

                    updateDragIndicatorFromOuterZone($container, lastKnownMousePosition.x);

                    return false;
                });

                $outerZone.on("drop", function (e) {
                    e.preventDefault();
                    e.stopPropagation();

                    // to handle drop the same way as if it happened in the container
                    handleOuterZoneDrop($container, lastKnownMousePosition.x);

                    return false;
                });
            }
        };

        const removeOuterDropZone = () => {
            $("#tab-drag-extended-zone").remove();
        };

        // When dragging over the container but not directly over a tab element
        $container.on("dragover", function (e) {
            if (e.preventDefault) {
                e.preventDefault();
            }

            lastKnownMousePosition.x = e.originalEvent.clientX;

            // Clear any existing scroll interval
            if (scrollInterval) {
                clearInterval(scrollInterval);
            }

            // auto-scroll if near container edge
            autoScrollContainer(this, e.originalEvent.clientX);

            // Set up interval for continuous scrolling while dragging near the edge
            scrollInterval = setInterval(() => {
                if (draggedTab) {
                    // Only continue scrolling if still dragging
                    autoScrollContainer(this, lastKnownMousePosition.x);
                } else {
                    clearInterval(scrollInterval);
                    scrollInterval = null;
                }
            }, 16); // this is almost about 60fps

            // if the target is not a tab, update the drag indicator using the container bounds
            if ($(e.target).closest(".tab").length === 0) {
                const containerRect = this.getBoundingClientRect();
                const mouseX = e.originalEvent.clientX;

                // determine if dropping on left or right half of container
                const onLeftSide = mouseX < containerRect.left + containerRect.width / 2;

                const $tabs = $container.find(".tab");
                if ($tabs.length) {
                    // choose the first tab for left drop, last tab for right drop
                    const targetTab = onLeftSide ? $tabs.first()[0] : $tabs.last()[0];
                    updateDragIndicator(targetTab, onLeftSide);
                }
            }

            // Create the extended drop zone if we're actively dragging
            if (draggedTab) {
                createOuterDropZone();
            }
        });

        // handle drop on the container (empty space)
        $container.on("drop", function (e) {
            if (e.preventDefault) {
                e.preventDefault();
            }

            // get container dimensions to determine drop position
            const containerRect = this.getBoundingClientRect();
            const mouseX = e.originalEvent.clientX;
            // determine if dropping on left or right half of container
            const onLeftSide = mouseX < containerRect.left + containerRect.width / 2;

            const $tabs = $container.find(".tab");
            if ($tabs.length) {
                // If dropping on left half, target the first tab; otherwise, target the last tab
                const targetTab = onLeftSide ? $tabs.first()[0] : $tabs.last()[0];

                // make sure that the draggedTab exists and isn't the same as the target
                if (draggedTab && targetTab && draggedTab !== targetTab) {
                    // check which pane the container belongs to
                    const isSecondPane = $container.attr("id") === "phoenix-tab-bar-2";
                    const targetPaneId = isSecondPane ? "second-pane" : "first-pane";
                    const draggedPath = $(draggedTab).attr("data-path");
                    const targetPath = $(targetTab).attr("data-path");

                    // check if we're dropping in a different pane
                    if (dragSourcePane !== targetPaneId) {
                        // cross-pane drop
                        moveTabBetweenPanes(dragSourcePane, targetPaneId, draggedPath, targetPath, onLeftSide);
                    } else {
                        // same pane drop
                        moveWorkingSetItem(targetPaneId, draggedPath, targetPath, onLeftSide);
                    }
                }
            }

            // ensure all drag state is cleaned up
            cleanupDragState();
        });

        /**
         * Updates the drag indicator when mouse is in the extended zone (outside actual tab bar)
         * @param {jQuery} $container - The tab bar container
         * @param {number} mouseX - Current mouse X position
         */
        function updateDragIndicatorFromOuterZone($container, mouseX) {
            const containerRect = $container[0].getBoundingClientRect();
            const $tabs = $container.find(".tab");

            if ($tabs.length) {
                // Determine if dropping on left half or right half
                let onLeftSide = true;
                let targetTab;

                // If beyond the right edge, use the last tab
                if (mouseX > containerRect.right) {
                    targetTab = $tabs.last()[0];
                    onLeftSide = false;
                }
                // If beyond the left edge, use the first tab
                else if (mouseX < containerRect.left) {
                    targetTab = $tabs.first()[0];
                    onLeftSide = true;
                }
                // If within bounds, find the closest tab
                else {
                    onLeftSide = mouseX < containerRect.left + containerRect.width / 2;
                    targetTab = onLeftSide ? $tabs.first()[0] : $tabs.last()[0];
                }

                updateDragIndicator(targetTab, onLeftSide);
            }
        }

        /**
         * Handles drops that occur in the extended drop zone
         * @param {jQuery} $container - The tab bar container
         * @param {number} mouseX - Current mouse X position
         */
        function handleOuterZoneDrop($container, mouseX) {
            const containerRect = $container[0].getBoundingClientRect();
            const $tabs = $container.find(".tab");

            if ($tabs.length && draggedTab) {
                // Determine drop position similar to updateDragIndicatorFromOuterZone
                let onLeftSide = true;
                let targetTab;

                if (mouseX > containerRect.right) {
                    targetTab = $tabs.last()[0];
                    onLeftSide = false;
                } else if (mouseX < containerRect.left) {
                    targetTab = $tabs.first()[0];
                    onLeftSide = true;
                } else {
                    onLeftSide = mouseX < containerRect.left + containerRect.width / 2;
                    targetTab = onLeftSide ? $tabs.first()[0] : $tabs.last()[0];
                }

                // Process the drop
                const isSecondPane = $container.attr("id") === "phoenix-tab-bar-2";
                const targetPaneId = isSecondPane ? "second-pane" : "first-pane";
                const draggedPath = $(draggedTab).attr("data-path");
                const targetPath = $(targetTab).attr("data-path");

                if (dragSourcePane !== targetPaneId) {
                    // cross-pane drop
                    moveTabBetweenPanes(dragSourcePane, targetPaneId, draggedPath, targetPath, onLeftSide);
                } else {
                    // same pane drop
                    moveWorkingSetItem(targetPaneId, draggedPath, targetPath, onLeftSide);
                }
            }

            cleanupDragState();
        }
    }

    /**
     * enhanced auto-scroll function for container when the mouse is near its left or right edge
     * creates a smooth scrolling effect with speed based on proximity to the edge
     *
     * @param {HTMLElement} container - The scrollable container element
     * @param {Number} mouseX - The current mouse X coordinate
     */
    function autoScrollContainer(container, mouseX) {
        const rect = container.getBoundingClientRect();
        const edgeThreshold = 100; // Increased threshold for edge detection (was 50)
        const outerThreshold = 50; // Distance outside the container that still triggers scrolling

        // Calculate distance from edges, allowing for mouse to be slightly outside bounds
        const distanceFromLeft = mouseX - (rect.left - outerThreshold);
        const distanceFromRight = rect.right + outerThreshold - mouseX;

        // Determine scroll speed based on distance from edge (closer = faster scroll)
        let scrollSpeed = 0;

        // Only activate scrolling when within the threshold (including the outer buffer)
        if (distanceFromLeft < edgeThreshold + outerThreshold && mouseX < rect.right) {
            // Non-linear scroll speed: faster as you get closer to the edge
            scrollSpeed = -Math.pow(1 - distanceFromLeft / (edgeThreshold + outerThreshold), 2) * 25;
        } else if (distanceFromRight < edgeThreshold + outerThreshold && mouseX > rect.left) {
            scrollSpeed = Math.pow(1 - distanceFromRight / (edgeThreshold + outerThreshold), 2) * 25;
        }

        // Apply scrolling if needed
        if (scrollSpeed !== 0) {
            container.scrollLeft += scrollSpeed;

            // If we're already at the edge, don't keep trying to scroll
            if (
                (scrollSpeed < 0 && container.scrollLeft <= 0) ||
                (scrollSpeed > 0 && container.scrollLeft >= container.scrollWidth - container.clientWidth)
            ) {
                return;
            }
        }
    }

    /**
     * Handle the start of a drag operation
     * Stores the tab being dragged and adds visual styling
     *
     * @param {Event} e - The event object
     */
    function handleDragStart(e) {
        // store reference to the dragged tab
        draggedTab = this;

        // set data transfer (required for Firefox)
        // Firefox requires data to be set for the drag operation to work
        e.originalEvent.dataTransfer.effectAllowed = "move";
        e.originalEvent.dataTransfer.setData("text/html", this.innerHTML);

        // Store which pane this tab came from
        dragSourcePane = $(this).closest("#phoenix-tab-bar-2").length > 0 ? "second-pane" : "first-pane";

        // Add dragging class for styling
        $(this).addClass("dragging");

        // Use a timeout to let the dragging class apply before taking measurements
        // This ensures visual updates are applied before we calculate positions
        setTimeout(() => {
            updateDragIndicator(null);
        }, 0);
    }

    /**
     * Handle the dragover event to enable drop
     * Updates the visual indicator showing where the tab will be dropped
     *
     * @param {Event} e - The event object
     */
    function handleDragOver(e) {
        if (e.preventDefault) {
            e.preventDefault(); // Allows us to drop
        }
        e.originalEvent.dataTransfer.dropEffect = "move";

        // Update the drag indicator position
        // We need to determine if it should be on the left or right side of the target tab
        const targetRect = this.getBoundingClientRect();
        const mouseX = e.originalEvent.clientX;
        const midPoint = targetRect.left + targetRect.width / 2;
        const onLeftSide = mouseX < midPoint;

        updateDragIndicator(this, onLeftSide);

        return false;
    }

    /**
     * Handle entering a potential drop target
     * Applies styling to indicate the current drop target
     *
     * @param {Event} e - The event object
     */
    function handleDragEnter(e) {
        dragOverTab = this;
        $(this).addClass("drag-target");
    }

    /**
     * Handle leaving a potential drop target
     * Removes styling when no longer hovering over a drop target
     *
     * @param {Event} e - The event object
     */
    function handleDragLeave(e) {
        const relatedTarget = e.originalEvent.relatedTarget;
        // Only remove the class if we're truly leaving this tab
        // This prevents flickering when moving over child elements
        if (!$(this).is(relatedTarget) && !$(this).has(relatedTarget).length) {
            $(this).removeClass("drag-target");
            if (dragOverTab === this) {
                dragOverTab = null;
            }
        }
    }

    /**
     * Handle dropping a tab onto a target
     * Moves the file in the working set to the new position
     *
     * @param {Event} e - The event object
     */
    function handleDrop(e) {
        if (e.stopPropagation) {
            e.stopPropagation(); // Stops browser from redirecting
        }

        // Only process the drop if the dragged tab is different from the drop target
        if (draggedTab !== this) {
            // Determine which pane the drop target belongs to
            const isSecondPane = $(this).closest("#phoenix-tab-bar-2").length > 0;
            const targetPaneId = isSecondPane ? "second-pane" : "first-pane";
            const draggedPath = $(draggedTab).attr("data-path");
            const targetPath = $(this).attr("data-path");

            // Determine if we're dropping to the left or right of the target
            const targetRect = this.getBoundingClientRect();
            const mouseX = e.originalEvent.clientX;
            const midPoint = targetRect.left + targetRect.width / 2;
            const onLeftSide = mouseX < midPoint;

            // Check if dragging between different panes
            if (dragSourcePane !== targetPaneId) {
                // Move the tab between panes
                moveTabBetweenPanes(dragSourcePane, targetPaneId, draggedPath, targetPath, onLeftSide);
            } else {
                // Move within the same pane
                moveWorkingSetItem(targetPaneId, draggedPath, targetPath, onLeftSide);
            }
        }

        cleanupDragState();
        return false;
    }

    /**
     * Handle the end of a drag operation
     * Cleans up classes and resets state variables
     *
     * @param {Event} e - The event object
     */
    function handleDragEnd(e) {
        cleanupDragState();
    }

    /**
     * Update the drag indicator position and visibility
     * The indicator shows where the tab will be dropped
     * Ensures the indicator stays within the bounds of the tab bar
     *
     * @param {HTMLElement} targetTab - The tab being dragged over, or null to hide
     * @param {Boolean} onLeftSide - Whether the indicator should be on the left or right side
     */
    function updateDragIndicator(targetTab, onLeftSide) {
        if (!targetTab) {
            dragIndicator.hide();
            return;
        }

        // Get the target tab's position and size
        const targetRect = targetTab.getBoundingClientRect();

        // Find the containing tab bar to ensure the indicator stays within bounds
        const $tabBar = $(targetTab).closest("#phoenix-tab-bar, #phoenix-tab-bar-2");
        const tabBarRect = $tabBar[0] ? $tabBar[0].getBoundingClientRect() : null;

        if (onLeftSide) {
            // Position indicator at the left edge of the target tab
            // Ensure it doesn't go beyond the tab bar's left edge
            const leftPos = tabBarRect ? Math.max(targetRect.left, tabBarRect.left) : targetRect.left;
            dragIndicator.css({
                top: targetRect.top,
                left: leftPos,
                height: targetRect.height
            });
        } else {
            // Position indicator at the right edge of the target tab
            // Ensure it doesn't go beyond the tab bar's right edge
            const rightPos = tabBarRect ? Math.min(targetRect.right, tabBarRect.right) : targetRect.right;
            dragIndicator.css({
                top: targetRect.top,
                left: rightPos,
                height: targetRect.height
            });
        }
        dragIndicator.show();
    }

    /**
     * Move an item in the working set
     * This function actually performs the reordering of tabs
     *
     * @param {String} paneId - The ID of the pane ("first-pane" or "second-pane")
     * @param {String} draggedPath - Path of the dragged file
     * @param {String} targetPath - Path of the drop target file
     * @param {Boolean} beforeTarget - Whether to place before or after the target
     */
    function moveWorkingSetItem(paneId, draggedPath, targetPath, beforeTarget) {
        const workingSet = MainViewManager.getWorkingSet(paneId);
        let draggedIndex = -1;
        let targetIndex = -1;

        // Find the indices of both the dragged item and the target item
        for (let i = 0; i < workingSet.length; i++) {
            if (workingSet[i].fullPath === draggedPath) {
                draggedIndex = i;
            }
            if (workingSet[i].fullPath === targetPath) {
                targetIndex = i;
            }
        }

        // Only move if we found both items
        if (draggedIndex !== -1 && targetIndex !== -1) {
            // Calculate the new position based on whether we're inserting before or after the target
            let newPosition = beforeTarget ? targetIndex : targetIndex + 1;
            // Adjust position if the dragged item is before the target
            // This is necessary because removing the dragged item will shift all following items
            if (draggedIndex < newPosition) {
                newPosition--;
            }
            // Perform the actual move in the MainViewManager
            MainViewManager._moveWorkingSetItem(paneId, draggedIndex, newPosition);
        }
    }

    /**
     * Move a tab from one pane to another
     * This function handles cross-pane drag and drop operations
     *
     * @param {String} sourcePaneId - The ID of the source pane ("first-pane" or "second-pane")
     * @param {String} targetPaneId - The ID of the target pane ("first-pane" or "second-pane")
     * @param {String} draggedPath - Path of the dragged file
     * @param {String} targetPath - Path of the drop target file (in the target pane)
     * @param {Boolean} beforeTarget - Whether to place before or after the target
     */
    function moveTabBetweenPanes(sourcePaneId, targetPaneId, draggedPath, targetPath, beforeTarget) {
        const sourceWorkingSet = MainViewManager.getWorkingSet(sourcePaneId);
        const targetWorkingSet = MainViewManager.getWorkingSet(targetPaneId);

        let draggedIndex = -1;
        let targetIndex = -1;
        let draggedFile = null;

        // Find the dragged file and its index in the source pane
        for (let i = 0; i < sourceWorkingSet.length; i++) {
            if (sourceWorkingSet[i].fullPath === draggedPath) {
                draggedIndex = i;
                draggedFile = sourceWorkingSet[i];
                break;
            }
        }

        // Find the target index in the target pane
        for (let i = 0; i < targetWorkingSet.length; i++) {
            if (targetWorkingSet[i].fullPath === targetPath) {
                targetIndex = i;
                break;
            }
        }

        // Only continue if we found the dragged file
        if (draggedIndex !== -1 && draggedFile) {
            // Remove the file from source pane
            CommandManager.execute(Commands.FILE_CLOSE, { file: draggedFile, paneId: sourcePaneId });

            // Calculate where to add it in the target pane
            let targetInsertIndex;

            if (targetIndex !== -1) {
                // We have a specific target index to aim for
                targetInsertIndex = beforeTarget ? targetIndex : targetIndex + 1;
            } else {
                // No specific target, add to end of the working set
                targetInsertIndex = targetWorkingSet.length;
            }

            // Add to the target pane at the calculated position
            MainViewManager.addToWorkingSet(targetPaneId, draggedFile, targetInsertIndex);

            // we always need to make the dragged tab active in the target pane when moving between panes
            CommandManager.execute(Commands.FILE_OPEN, { fullPath: draggedPath, paneId: targetPaneId });
        }
    }

    /**
     * Initialize drop targets for empty panes
     * This creates invisible drop zones when a pane has no files and thus no tab bar
     */
    function initEmptyPaneDropTargets() {
        // get the references to the editor holders (these are always present, even when empty)
        const $firstPaneHolder = $("#first-pane .pane-content");
        const $secondPaneHolder = $("#second-pane .pane-content");

        // handle the drop events on empty panes
        setupEmptyPaneDropTarget($firstPaneHolder, "first-pane");
        setupEmptyPaneDropTarget($secondPaneHolder, "second-pane");
    }

    /**
     * sets up the whole pane as a drop target when it has no tabs
     *
     * @param {jQuery} $paneHolder - The jQuery object for the pane content area
     * @param {String} paneId - The ID of the pane ("first-pane" or "second-pane")
     */
    function setupEmptyPaneDropTarget($paneHolder, paneId) {
        // remove if any existing handlers to prevent duplicates
        $paneHolder.off("dragover dragenter dragleave drop");

        // Handle drag over empty pane
        $paneHolder.on("dragover dragenter", function (e) {
            if (draggedTab) {
                e.preventDefault();
                e.stopPropagation();

                // add visual indicator that this is a drop target [refer to Extn-TabBar.less]
                $(this).addClass("empty-pane-drop-target");

                // set the drop effect
                e.originalEvent.dataTransfer.dropEffect = "move";
            }
        });

        // handle leaving an empty pane drop target
        $paneHolder.on("dragleave", function (e) {
            $(this).removeClass("empty-pane-drop-target");
        });

        // Handle drop on empty pane
        $paneHolder.on("drop", function (e) {
            const $tabBar = paneId === "first-pane" ? $("#phoenix-tab-bar") : $("#phoenix-tab-bar-2");
            const isEmptyPane = !$tabBar.length || $tabBar.is(":hidden") || $tabBar.children(".tab").length === 0;

            if (draggedTab) {
                e.preventDefault();
                e.stopPropagation();

                // remove the highlight
                $(this).removeClass("empty-pane-drop-target");

                // get the dragged file path
                const draggedPath = $(draggedTab).attr("data-path");

                // Determine source pane
                const sourcePaneId =
                    $(draggedTab).closest("#phoenix-tab-bar-2").length > 0 ? "second-pane" : "first-pane";

                // we only want to proceed if we're not dropping in the same pane or,
                // allow if it's the same pane with existing tabs
                if (sourcePaneId !== paneId || !isEmptyPane) {
                    const sourceWorkingSet = MainViewManager.getWorkingSet(sourcePaneId);
                    const targetWorkingSet = MainViewManager.getWorkingSet(paneId);
                    let draggedFile = null;

                    // Find the dragged file in the source pane
                    for (let i = 0; i < sourceWorkingSet.length; i++) {
                        if (sourceWorkingSet[i].fullPath === draggedPath) {
                            draggedFile = sourceWorkingSet[i];
                            break;
                        }
                    }

                    if (draggedFile) {
                        if (sourcePaneId !== paneId) {
                            // If different panes, close in source pane
                            CommandManager.execute(Commands.FILE_CLOSE, { file: draggedFile, paneId: sourcePaneId });

                            // For non-empty panes, find current active file to place tab after it
                            if (!isEmptyPane && targetWorkingSet.length > 0) {
                                const currentActiveFile = MainViewManager.getCurrentlyViewedFile(paneId);

                                if (currentActiveFile) {
                                    // Find index of current active file
                                    let targetIndex = -1;
                                    for (let i = 0; i < targetWorkingSet.length; i++) {
                                        if (targetWorkingSet[i].fullPath === currentActiveFile.fullPath) {
                                            targetIndex = i;
                                            break;
                                        }
                                    }

                                    if (targetIndex !== -1) {
                                        // Add after current active file
                                        MainViewManager.addToWorkingSet(paneId, draggedFile, targetIndex + 1);
                                    } else {
                                        // Fallback to adding at the end
                                        MainViewManager.addToWorkingSet(paneId, draggedFile);
                                    }
                                } else {
                                    // No active file, add to the end
                                    MainViewManager.addToWorkingSet(paneId, draggedFile);
                                }
                            } else {
                                // Empty pane, just add it
                                MainViewManager.addToWorkingSet(paneId, draggedFile);
                            }

                            // Open file in target pane
                            CommandManager.execute(Commands.FILE_OPEN, { fullPath: draggedPath, paneId: paneId });
                        } else if (isEmptyPane) {
                            // Same pane, empty pane case (should never happen but kept for safety)
                            MainViewManager.addToWorkingSet(paneId, draggedFile);
                            CommandManager.execute(Commands.FILE_OPEN, { fullPath: draggedPath, paneId: paneId });
                        }
                    }
                }

                cleanupDragState();
            }
        });
    }

    module.exports = {
        init
    };
});
