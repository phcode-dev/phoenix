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
     * sourcePaneId: To track which pane the dragged tab originated from
     * targetTab: the tab the drop indicator is currently shown next to
     * $indicator: Visual indicator showing where the tab will be dropped
     */
    let draggedTab = null;
    let sourcePaneId = null;
    let targetTab = null;
    let $indicator = null;

    /**
     * the pane a tab bar element belongs to
     * @param {HTMLElement} element
     * @return {?string} the pane id
     */
    function _paneIdOf(element) {
        const container = element.closest(".tab-bar-container");
        return container ? container.getAttribute("data-pane-id") : null;
    }

    /**
     * create the drag indicator if it doesn't exist
     */
    function _getIndicator() {
        if (!$indicator) {
            $indicator = $('<div class="tab-drag-indicator"></div>').appendTo("body");
        }
        return $indicator;
    }

    /**
     * highlights the tab the dragged tab would be dropped next to and puts the indicator line there
     * @param {HTMLElement} tab - The target tab element
     * @param {boolean} before - Whether the dragged tab would be inserted before the target tab
     */
    function _markDropTarget(tab, before) {
        if (targetTab && targetTab !== tab) {
            targetTab.classList.remove("drag-target");
        }
        targetTab = tab;
        tab.classList.add("drag-target");

        const rect = tab.getBoundingClientRect();
        _getIndicator().css({
            left: (before ? rect.left : rect.right) + "px",
            top: rect.top + "px",
            height: rect.height + "px"
        }).show();
    }

    function _clearDropTarget() {
        if (targetTab) {
            targetTab.classList.remove("drag-target");
            targetTab = null;
        }
        if ($indicator) {
            $indicator.hide();
        }
    }

    /**
     * this function is responsible to make sure that all the drag state is properly cleaned up
     */
    function _cleanup() {
        if (draggedTab) {
            draggedTab.classList.remove("dragging");
        }
        $(".pane-content.pane-drop-target, .pane-content.empty-pane-drop-target")
            .removeClass("pane-drop-target empty-pane-drop-target");
        _clearDropTarget();
        draggedTab = null;
        sourcePaneId = null;
    }

    /**
     * get the drop position relative to a target tab
     * @param {HTMLElement} tab - The target tab element
     * @param {number} clientX - The mouse X coordinate
     * @returns {boolean} True if should insert before, false if after
     */
    function _dropsBefore(tab, clientX) {
        const rect = tab.getBoundingClientRect();
        return clientX < rect.left + rect.width / 2;
    }

    /**
     * find the closest tab to the mouse position, for drops on the empty part of the bar
     * @param {HTMLElement} bar - The tab bar element
     * @param {number} clientX - The mouse X coordinate
     * @returns {?HTMLElement} The closest tab element or null
     */
    function _closestTab(bar, clientX) {
        let closest = null;
        let closestDistance = Infinity;

        for (const tab of bar.children) {
            if (tab === draggedTab) {
                continue;
            }
            const rect = tab.getBoundingClientRect();
            const distance = Math.abs(clientX - (rect.left + rect.width / 2));
            if (distance < closestDistance) {
                closestDistance = distance;
                closest = tab;
            }
        }

        return closest;
    }

    /**
     * where in the pane's working set the dragged file should land when dropped on the given tab
     * a placeholder tab has no working set entry and sits at the end, so dropping on it means the end
     *
     * @param {string} paneId - the pane of the target tab
     * @param {HTMLElement} tab - the target tab
     * @param {boolean} before - whether to insert before the target tab
     * @return {number}
     */
    function _dropIndex(paneId, tab, before) {
        const index = MainViewManager.findInWorkingSet(paneId, tab.getAttribute("data-path"));
        if (index === -1) {
            return MainViewManager.getWorkingSetSize(paneId);
        }
        return before ? index : index + 1;
    }

    /**
     * this function is responsible to move the tab within the pane
     * moving in front of a pinned tab pins the tab and moving behind an unpinned one unpins it,
     * MainViewManager takes care of that
     *
     * @param {string} paneId - The pane ID
     * @param {string} draggedPath - The path of the dragged file
     * @param {number} toIndex - the working set index to move to, before the move
     */
    function _moveWithinPane(paneId, draggedPath, toIndex) {
        const fromIndex = MainViewManager.findInWorkingSet(paneId, draggedPath);

        // a dragged placeholder tab becomes a working set file right where it was dropped
        if (fromIndex === -1) {
            MainViewManager.addToWorkingSet(paneId, FileSystem.getFileForPath(draggedPath), toIndex);
            return;
        }

        if (fromIndex < toIndex) {
            toIndex--;
        }
        if (toIndex !== fromIndex) {
            MainViewManager._moveWorkingSetItem(paneId, fromIndex, toIndex);
        }
    }

    /**
     * this function is responsible to move the tab in between different panes
     * the view moves along with the file, so an unsaved file doesn't get a save prompt
     *
     * @param {string} targetPaneId - The target pane ID
     * @param {string} draggedPath - The path of the dragged file
     * @param {number} toIndex - the working set index in the target pane
     */
    function _moveToPane(targetPaneId, draggedPath, toIndex) {
        const fromPaneId = sourcePaneId;
        const file = FileSystem.getFileForPath(draggedPath);
        const open = () => CommandManager.execute(Commands.FILE_OPEN, { fullPath: draggedPath, paneId: targetPaneId });

        // a placeholder tab has nothing to move, the file joins the target pane's working set and the
        // preview in the source pane goes away
        if (MainViewManager.findInWorkingSet(fromPaneId, draggedPath) === -1) {
            MainViewManager.addToWorkingSet(targetPaneId, file, toIndex);
            open().always(() => CommandManager.execute(Commands.FILE_CLOSE, { file: file, paneId: fromPaneId }));
            return;
        }

        // the target pane already has this file, nothing to move, just show it there
        if (MainViewManager.findInWorkingSet(targetPaneId, draggedPath) !== -1 ||
            MainViewManager._getPane(targetPaneId).getViewForPath(draggedPath)) {
            open();
            return;
        }

        MainViewManager._moveView(fromPaneId, targetPaneId, file, toIndex).always(open);
    }

    /**
     * this handles the drop on a tab
     * @param {HTMLElement} tab - the tab that was dropped on
     * @param {boolean} before - Whether to insert before the target tab
     */
    function _dropOnTab(tab, before) {
        const targetPaneId = _paneIdOf(tab);
        const draggedPath = draggedTab.getAttribute("data-path");
        const toIndex = _dropIndex(targetPaneId, tab, before);

        if (targetPaneId === sourcePaneId) {
            _moveWithinPane(targetPaneId, draggedPath, toIndex);
        } else {
            _moveToPane(targetPaneId, draggedPath, toIndex);
        }
    }

    /**
     * Initialize drag and drop functionality. All handlers are delegated from the document, so they
     * are set up once and keep working as tabs come and go
     */
    function init() {
        const TAB = ".phoenix-tab-bar .tab";

        $(document)
            .on("dragstart", TAB, function (event) {
                draggedTab = this;
                sourcePaneId = _paneIdOf(this);

                const dataTransfer = event.originalEvent.dataTransfer;
                dataTransfer.effectAllowed = "move";
                dataTransfer.setData("application/x-phoenix-tab", this.getAttribute("data-path"));

                this.classList.add("dragging");
            })
            .on("dragover", TAB, function (event) {
                if (!draggedTab) {
                    return;
                }
                event.preventDefault();
                event.originalEvent.dataTransfer.dropEffect = "move";

                if (this === draggedTab) {
                    _clearDropTarget();
                    return;
                }
                _markDropTarget(this, _dropsBefore(this, event.originalEvent.clientX));
            })
            .on("dragover", ".phoenix-tab-bar", function (event) {
                // drags over a tab are handled above, this is for the empty space after the last tab
                if (!draggedTab || $(event.target).closest(".tab").length) {
                    return;
                }
                event.preventDefault();

                const tab = _closestTab(this, event.originalEvent.clientX);
                if (tab) {
                    _markDropTarget(tab, _dropsBefore(tab, event.originalEvent.clientX));
                } else {
                    _clearDropTarget();
                }
            })
            .on("dragleave", TAB, function (event) {
                // Only remove styling if truly leaving the element
                const related = event.originalEvent && event.originalEvent.relatedTarget;
                if (this === targetTab && !this.contains(related)) {
                    _clearDropTarget();
                }
            })
            .on("drop", TAB, function (event) {
                if (!draggedTab) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();

                if (this !== draggedTab) {
                    _dropOnTab(this, _dropsBefore(this, event.originalEvent.clientX));
                }
                _cleanup();
            })
            .on("drop", ".phoenix-tab-bar", function (event) {
                if (!draggedTab) {
                    return;
                }
                event.preventDefault();

                const tab = $(event.target).closest(".tab")[0] || _closestTab(this, event.originalEvent.clientX);
                if (tab && tab !== draggedTab) {
                    _dropOnTab(tab, _dropsBefore(tab, event.originalEvent.clientX));
                }
                _cleanup();
            })
            .on("dragend", TAB, _cleanup);

        // a tab dropped on the other pane's editor area goes to the end of that pane's tabs,
        // that's also the only way to drop into a pane that has no tabs yet
        $(document)
            .on("dragover dragenter", ".view-pane .pane-content", function (event) {
                const paneId = this.closest(".view-pane").id;
                if (!draggedTab || paneId === sourcePaneId) {
                    return;
                }
                event.preventDefault();

                const hasTabs = MainViewManager.getWorkingSetSize(paneId) > 0;
                this.classList.toggle("empty-pane-drop-target", !hasTabs);
                this.classList.toggle("pane-drop-target", hasTabs);
            })
            .on("dragleave", ".view-pane .pane-content", function (event) {
                const related = event.originalEvent && event.originalEvent.relatedTarget;
                if (!this.contains(related)) {
                    this.classList.remove("empty-pane-drop-target", "pane-drop-target");
                }
            })
            .on("drop", ".view-pane .pane-content", function (event) {
                const paneId = this.closest(".view-pane").id;
                if (!draggedTab || paneId === sourcePaneId) {
                    return;
                }
                event.preventDefault();

                _moveToPane(paneId, draggedTab.getAttribute("data-path"), MainViewManager.getWorkingSetSize(paneId));
                _cleanup();
            });

        // escape cancels the drag
        $(document).on("keydown", function (event) {
            if (event.key === "Escape" && draggedTab) {
                _cleanup();
            }
        });
    }

    module.exports = {
        init
    };
});
