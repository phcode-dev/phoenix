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

/* Displays a Collapse button in the sidebar area */
/* when the button gets clicked, it closes all the directories recursively that are opened */
/* Styling for the button is done in `../../styles/Extn-CollapseFolders.less` */
define(function (require, exports, module) {
    const AppInit = require("utils/AppInit");
    const ProjectManager = require("project/ProjectManager");

    /**
     * This is the main function that handles the closing of all the directories
     */
    function handleCollapseBtnClick() {
        // this will give us an array of array's
        // the root level directories will be at index 0, its next level will be at index 1 and so on
        const openNodes = ProjectManager._actionCreator.model.getOpenNodes();
        if (!openNodes || openNodes.length === 0) {
            return;
        }

        // traversing from the back because the deepest nested directories should be closed first
        // Note: this is an array of all the directories at the deepest level
        for (let i = openNodes.length - 1; i >= 0; i--) {
            // close all the directories
            openNodes[i].forEach(function (folderPath) {
                try {
                    // to close each dir
                    ProjectManager._actionCreator.setDirectoryOpen(folderPath, false);
                } catch (error) {
                    console.error("Failed to close folder:", folderPath, error);
                }
            });
        }
    }

    /**
     * This function is responsible to create the 'Collapse All' button
     * and append it to the sidebar area on the project-files-header
     */
    function createCollapseButton() {
        const $projectFilesHeader = $("#project-files-header");
        // make sure that we were able to get the project-files-header DOM element
        if ($projectFilesHeader.length === 0) {
            return;
        }

        // create the collapse btn
        const $collapseBtn = $(`
            <div id="collapse-folders" class="btn-alt-quiet" title="Collapse All">
                <i class="fa-solid fa-chevron-down collapse-icon" aria-hidden="true"></i>
                <i class="fa-solid fa-chevron-up collapse-icon" aria-hidden="true"></i>
            </div>
        `);

        $collapseBtn.on("click", handleCollapseBtnClick);

        $projectFilesHeader.append($collapseBtn); // append the btn to the project-files-header

        _setupHoverBehavior($collapseBtn); // hover functionality to show/hide the button
    }

    /**
     * This function is responsible for the hover behavior to show/hide the collapse button
     * we only show the button when the cursor is over the sidebar area
     */
    function _setupHoverBehavior($collapseBtn) {
        const $sidebar = $("#sidebar");
        if ($sidebar.length === 0) {
            return;
        }

        // we need this check to see if on site load the mouse is already over the sidebar area or not
        // because if it is, then we need to show the button
        if ($sidebar.is(":hover")) {
            $collapseBtn.addClass("show");
        }

        $sidebar.on("mouseenter", function () {
            $collapseBtn.addClass("show");
        });

        $sidebar.on("mouseleave", function () {
            $collapseBtn.removeClass("show");
        });
    }

    AppInit.appReady(function () {
        createCollapseButton();
    });
});
