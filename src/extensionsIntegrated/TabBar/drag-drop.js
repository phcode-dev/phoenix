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
    const FileSystem = require("filesystem/FileSystem");

    /**
     * These variables track the drag and drop state of tabs
     * draggedTab: The tab that is currently being dragged
     * dragIndicator: Visual indicator showing where the tab will be dropped
     * dragSourcePane: To track which pane the dragged tab originated from
     */
    let draggedTab = null;
    let dragIndicator = null;
    let dragSourcePane = null;

    /**
     * this function is responsible to make sure that all the drag state is properly cleaned up
     * it is needed to make sure that the tab bar doesn't get unresponsive
     * because of handlers not being attached properly
     */
    function cleanupDragState() {
        $(".tab").removeClass("dragging drag-target");
        $(".empty-pane-drop-target").removeClass("empty-pane-drop-target");

        // this is to make sure that the drag indicator is hidden and remove any inline styles
        if (dragIndicator) {
            dragIndicator.hide().css({
                top: "",
                left: "",
                height: ""
            });
        }

        // Reset all drag state variables
        draggedTab = null;
        dragSourcePane = null;

        // remove any temporary elements
        $("#tab-drag-helper").remove();
    }

    /**
     * create the drag indicator if it doesn't exist
     */
    function ensureDragIndicator() {
        if (!dragIndicator || !dragIndicator.length) {
            dragIndicator = $('<div class="tab-drag-indicator"></div>');
            $("body").append(dragIndicator);
        }
    }

    /**
     * this function is to update the drag indicator position
     * @param {Element} targetTab - The target tab element
     * @param {boolean} insertBefore - Whether to insert before the target tab
     */
    function updateDragIndicator(targetTab, insertBefore) {
        if (!targetTab) {
            dragIndicator.hide();
            return;
        }

        const rect = targetTab.getBoundingClientRect();
        const x = insertBefore ? rect.left : rect.right;

        dragIndicator
            .css({
                position: "fixed",
                left: x + "px",
                top: rect.top + "px",
                height: rect.height + "px",
                width: "2px",
                zIndex: 10001
            })
            .show();
    }

    /**
     * get the drop position relative to a target tab
     * @param {Element} targetTab - The target tab element
     * @param {number} mouseX - The mouse X coordinate
     * @returns {boolean} True if should insert before, false if after
     */
    function getDropPosition(targetTab, mouseX) {
        const rect = targetTab.getBoundingClientRect();
        const midpoint = rect.left + rect.width / 2;
        return mouseX < midpoint;
    }

    /**
     * find the closest tab to mouse position
     * @param {jQuery} container - The tab container element
     * @param {number} mouseX - The mouse X coordinate
     * @returns {Element|null} The closest tab element or null
     */
    function findClosestTab(container, mouseX) {
        const tabs = container.find(".tab").get();
        let closestTab = null;
        let closestDistance = Infinity;

        for (let tab of tabs) {
            if (tab === draggedTab) {
                continue;
            }

            const rect = tab.getBoundingClientRect();
            const tabCenter = rect.left + rect.width / 2;
            const distance = Math.abs(mouseX - tabCenter);

            if (distance < closestDistance) {
                closestDistance = distance;
                closestTab = tab;
            }
        }

        return closestTab;
    }

    /**
     * this function handles the drag start
     * @param {Event} event - the event instance
     */
    function handleDragStart(event) {
        draggedTab = this;
        dragSourcePane = $(this).closest("#phoenix-tab-bar-2").length > 0 ? "second-pane" : "first-pane";

        // Set up drag data
        event.originalEvent.dataTransfer.effectAllowed = "move";
        event.originalEvent.dataTransfer.setData("application/x-phoenix-tab", "tab-drag");

        // Add visual styling
        $(this).addClass("dragging");

        ensureDragIndicator();

        // Small delay to let the dragging class take effect
        setTimeout(() => {
            dragIndicator.hide();
        }, 10);
    }

    /**
     * this function handles the drag over
     * @param {Event} event - the event instance
     */
    function handleDragOver(event) {
        if (!draggedTab) {
            return;
        }

        event.preventDefault();
        event.originalEvent.dataTransfer.dropEffect = "move";

        const targetTab = event.currentTarget;
        if (targetTab === draggedTab) {
            return;
        }

        const insertBefore = getDropPosition(targetTab, event.originalEvent.clientX);
        updateDragIndicator(targetTab, insertBefore);

        // Clear any existing drag-target classes
        $(".tab").removeClass("drag-target");
        $(targetTab).addClass("drag-target");
    }

    /**
     * handles the container drag over (for empty space drops)
     * @param {Event} event
     */
    function handleContainerDragOver(event) {
        if (!draggedTab) {
            return;
        }

        event.preventDefault();

        const container = $(this);
        const mouseX = event.originalEvent.clientX;
        const closestTab = findClosestTab(container, mouseX);

        if (closestTab) {
            const insertBefore = getDropPosition(closestTab, mouseX);
            updateDragIndicator(closestTab, insertBefore);

            // Clear existing classes and add to closest
            $(".tab").removeClass("drag-target");
            $(closestTab).addClass("drag-target");
        } else {
            dragIndicator.hide();
        }
    }

    /**
     * this handles the drop
     * @param {Event} event
     */
    function handleDrop(event) {
        event.preventDefault();
        event.stopPropagation();

        if (!draggedTab || this === draggedTab) {
            cleanupDragState();
            return;
        }

        const targetTab = this;
        const targetPaneId = $(targetTab).closest("#phoenix-tab-bar-2").length > 0 ? "second-pane" : "first-pane";
        const insertBefore = getDropPosition(targetTab, event.originalEvent.clientX);

        performTabMove(targetTab, targetPaneId, insertBefore);
        cleanupDragState();
    }

    /**
     * this function handles the drop on container (empty space)
     * @param {Event} event
     */
    function handleContainerDrop(event) {
        event.preventDefault();

        if (!draggedTab) {
            cleanupDragState();
            return;
        }

        const container = $(this);
        const mouseX = event.originalEvent.clientX;
        const closestTab = findClosestTab(container, mouseX);

        if (closestTab) {
            const targetPaneId = container.attr("id") === "phoenix-tab-bar-2" ? "second-pane" : "first-pane";
            const insertBefore = getDropPosition(closestTab, mouseX);
            performTabMove(closestTab, targetPaneId, insertBefore);
        }

        cleanupDragState();
    }

    /**
     * this function performs the actual tab move
     * it can be of two types: tab move in same pane, tab move between different panes
     * @param {Element} targetTab - The target tab element
     * @param {string} targetPaneId - The target pane ID
     * @param {boolean} insertBefore - Whether to insert before the target
     */
    function performTabMove(targetTab, targetPaneId, insertBefore) {
        const draggedPath = $(draggedTab).attr("data-path");
        const targetPath = $(targetTab).attr("data-path");

        if (dragSourcePane === targetPaneId) {
            // same pane move
            moveWorkingSetItem(targetPaneId, draggedPath, targetPath, insertBefore);
        } else {
            // different pane move
            moveTabBetweenPanes(dragSourcePane, targetPaneId, draggedPath, targetPath, insertBefore);
        }
    }

    /**
     * this function is responsible to move the tab within the pane
     * @param {string} paneId - The pane ID
     * @param {string} draggedPath - The path of the dragged file
     * @param {string} targetPath - The path of the target file
     * @param {boolean} beforeTarget - Whether to insert before the target
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

        if (draggedIndex !== -1 && targetIndex !== -1) {
            let newPosition = beforeTarget ? targetIndex : targetIndex + 1;
            if (draggedIndex < newPosition) {
                newPosition--;
            }
            MainViewManager._moveWorkingSetItem(paneId, draggedIndex, newPosition);

            // we check if the dragged file is pinned, cause if it is we might need to unpin it,
            // if it is dropped after an unpinned file
            const isDraggedFilePinned = MainViewManager.isPathPinned(paneId, draggedPath);

            if (isDraggedFilePinned && newPosition > 0) {
                const newWorkingSet = MainViewManager.getWorkingSet(paneId);
                const prevFilePath = newWorkingSet[newPosition - 1].fullPath;

                // if the prev file is not pinned, we unpin this file too!
                if (!MainViewManager.isPathPinned(paneId, prevFilePath)) {
                    const fileObj = FileSystem.getFileForPath(draggedPath);
                    CommandManager.execute(Commands.FILE_UNPIN, { file: fileObj, paneId: paneId });
                }
            }
        }
    }

    /**
     * this function is responsible to move the tab in between different panes
     * @param {string} sourcePaneId - The source pane ID
     * @param {string} targetPaneId - The target pane ID
     * @param {string} draggedPath - The path of the dragged file
     * @param {string} targetPath - The path of the target file
     * @param {boolean} beforeTarget - Whether to insert before the target
     */
    function moveTabBetweenPanes(sourcePaneId, targetPaneId, draggedPath, targetPath, beforeTarget) {
        try {
            const sourceWorkingSet = MainViewManager.getWorkingSet(sourcePaneId);
            const targetWorkingSet = MainViewManager.getWorkingSet(targetPaneId);

            let draggedFile = null;
            let targetIndex = -1;

            // Find the dragged file and its index in the source pane
            for (let i = 0; i < sourceWorkingSet.length; i++) {
                if (sourceWorkingSet[i].fullPath === draggedPath) {
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

            if (draggedFile) {
                // Close in source pane
                CommandManager.execute(Commands.FILE_CLOSE, { file: draggedFile, paneId: sourcePaneId });

                // calculate where to insert it in the target pane
                const insertIndex =
                    targetIndex !== -1 ? (beforeTarget ? targetIndex : targetIndex + 1) : targetWorkingSet.length;

                // Add to target pane
                MainViewManager.addToWorkingSet(targetPaneId, draggedFile, insertIndex);
                CommandManager.execute(Commands.FILE_OPEN, { fullPath: draggedPath, paneId: targetPaneId });
            }
        } catch (error) {
            console.error("Error during cross-pane tab move:", error);
        }
    }

    /**
     * this function handles the drag end event
     * @param {Event} event - the event instance
     */
    function handleDragEnd(event) {
        // Small delay to ensure other events finish
        setTimeout(() => {
            cleanupDragState();
        }, 50);
    }

    /**
     * this function handles drag leave
     * @param {Event} event - the event instance
     */
    function handleDragLeave(event) {
        // Only remove styling if truly leaving the element
        const relatedTarget = event.originalEvent.relatedTarget;
        if (!$(this).is(relatedTarget) && !$(this).has(relatedTarget).length) {
            $(this).removeClass("drag-target");
        }
    }

    /**
     * Setup drag handlers for a tab bar
     * @param {string} tabBarSelector - The jQuery selector for the tab bar
     */
    function setupTabBarDragHandlers(tabBarSelector) {
        const $tabBar = $(tabBarSelector);

        // Remove existing handlers to prevent duplicates
        $tabBar.off("dragstart dragover dragenter dragleave drop dragend");

        // add the handlers
        $tabBar.on("dragstart", ".tab", handleDragStart);
        $tabBar.on("dragover", ".tab", handleDragOver);
        $tabBar.on("dragleave", ".tab", handleDragLeave);
        $tabBar.on("drop", ".tab", handleDrop);
        $tabBar.on("dragend", ".tab", handleDragEnd);

        // container level handlers (for empty space)
        $tabBar.on("dragover", handleContainerDragOver);
        $tabBar.on("drop", handleContainerDrop);

        // Make tabs draggable
        $tabBar.find(".tab").attr("draggable", true);
    }

    /**
     * setup the pane drop targets
     */
    function setupPaneDropTargets() {
        const panes = ["#first-pane .pane-content", "#second-pane .pane-content"];

        panes.forEach((paneSelector, index) => {
            const paneId = index === 0 ? "first-pane" : "second-pane";
            const $pane = $(paneSelector);

            $pane.off("dragover dragenter dragleave drop");

            $pane.on("dragover dragenter", function (event) {
                if (draggedTab && dragSourcePane !== paneId) {
                    // Only allow cross-pane drops
                    event.preventDefault();

                    // Check if this pane is empty for visual styling
                    const tabBarId = paneId === "first-pane" ? "#phoenix-tab-bar" : "#phoenix-tab-bar-2";
                    const $tabBar = $(tabBarId);
                    const isEmptyPane =
                        !$tabBar.length || $tabBar.is(":hidden") || $tabBar.children(".tab").length === 0;

                    if (isEmptyPane) {
                        $(this).addClass("empty-pane-drop-target");
                    } else {
                        // Add a different class for non-empty panes
                        $(this).addClass("pane-drop-target");
                    }
                }
            });

            $pane.on("dragleave", function (event) {
                $(this).removeClass("empty-pane-drop-target pane-drop-target");
            });

            $pane.on("drop", function (event) {
                if (draggedTab && dragSourcePane !== paneId) {
                    event.preventDefault();
                    $(this).removeClass("empty-pane-drop-target pane-drop-target");

                    const draggedPath = $(draggedTab).attr("data-path");
                    const sourceWorkingSet = MainViewManager.getWorkingSet(dragSourcePane);
                    const targetWorkingSet = MainViewManager.getWorkingSet(paneId);
                    let draggedFile = null;

                    // Find dragged file
                    for (let file of sourceWorkingSet) {
                        if (file.fullPath === draggedPath) {
                            draggedFile = file;
                            break;
                        }
                    }

                    if (draggedFile) {
                        // Close in source pane
                        CommandManager.execute(Commands.FILE_CLOSE, { file: draggedFile, paneId: dragSourcePane });

                        // Check if target pane is empty or has files
                        const tabBarId = paneId === "first-pane" ? "#phoenix-tab-bar" : "#phoenix-tab-bar-2";
                        const $tabBar = $(tabBarId);
                        const isEmptyPane =
                            !$tabBar.length || $tabBar.is(":hidden") || $tabBar.children(".tab").length === 0;

                        if (isEmptyPane) {
                            // Empty pane: just add the file
                            MainViewManager.addToWorkingSet(paneId, draggedFile);
                        } else {
                            // Non-empty pane: add after the currently active file
                            const currentActiveFile = MainViewManager.getCurrentlyViewedFile(paneId);
                            if (currentActiveFile) {
                                // Find index of current active file and insert after it
                                let targetIndex = -1;
                                for (let i = 0; i < targetWorkingSet.length; i++) {
                                    if (targetWorkingSet[i].fullPath === currentActiveFile.fullPath) {
                                        targetIndex = i;
                                        break;
                                    }
                                }
                                MainViewManager.addToWorkingSet(paneId, draggedFile, targetIndex + 1);
                            } else {
                                // Fallback: add to end
                                MainViewManager.addToWorkingSet(paneId, draggedFile);
                            }
                        }

                        // Open file in target pane
                        CommandManager.execute(Commands.FILE_OPEN, { fullPath: draggedPath, paneId: paneId });
                    }

                    cleanupDragState();
                }
            });
        });
    }

    /**
     * clean up the handlers
     */
    function setupGlobalCleanup() {
        // Clean up on document level events
        $(document).on("dragend mouseup", function () {
            if (draggedTab) {
                setTimeout(() => cleanupDragState(), 100);
            }
        });

        // Clean up on escape key
        $(document).on("keydown", function (event) {
            if (event.key === "Escape" && draggedTab) {
                cleanupDragState();
            }
        });
    }

    /**
     * Initialize drag and drop functionality
     * @param {string} firstPaneSelector - The selector for the first pane tab bar
     * @param {string} secondPaneSelector - The selector for the second pane tab bar
     */
    function init(firstPaneSelector, secondPaneSelector) {
        // setup drag handlers for both tab bars
        if (firstPaneSelector) {
            setupTabBarDragHandlers(firstPaneSelector);
        }
        if (secondPaneSelector) {
            setupTabBarDragHandlers(secondPaneSelector);
        }

        setupPaneDropTargets();
        setupGlobalCleanup();
        ensureDragIndicator();
    }

    module.exports = {
        init
    };
});
