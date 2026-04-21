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

/* Displays sidebar-hover action buttons: "show in file tree" (binoculars) and
 * "collapse all folders" (stacked chevrons). Both appear on sidebar hover so the
 * sidebar stays visually quiet when the user isn't interacting with it. */
/* Styling for both buttons is done in `../../styles/Extn-CollapseFolders.less` */
define(function (require, exports, module) {
    const AppInit = require("utils/AppInit");
    const CommandManager = require("command/CommandManager");
    const Commands = require("command/Commands");
    const ProjectManager = require("project/ProjectManager");
    const Strings = require("strings");

    const SHOW_IN_TREE_SVG = '<svg class="show-in-tree-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<path fill="currentColor" d="M4.5 1A1.5 1.5 0 0 0 3 2.5V3h4v-.5A1.5 1.5 0 0 0 5.5 1h-1zM7 4v1h2V4h4v.882a.5.5 0 0 0 .276.447l.895.447A1.5 1.5 0 0 1 15 7.118V13H9v-1.5a.5.5 0 0 1 .146-.354l.854-.853V9.5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5v.793l.854.853A.5.5 0 0 1 7 11.5V13H1V7.118a1.5 1.5 0 0 1 .83-1.342l.894-.447A.5.5 0 0 0 3 4.882V4h4zM1 14v.5A1.5 1.5 0 0 0 2.5 16h3A1.5 1.5 0 0 0 7 14.5V14H1zm8 0v.5a1.5 1.5 0 0 0 1.5 1.5h3a1.5 1.5 0 0 0 1.5-1.5V14H9zm4-11H9v-.5A1.5 1.5 0 0 1 10.5 1h1A1.5 1.5 0 0 1 13 2.5V3z"/>' +
        '</svg>';

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

    function _handleShowInTreeClick() {
        CommandManager.execute(Commands.NAVIGATE_SHOW_IN_FILE_TREE);
    }

    /**
     * Append the sidebar hover actions: a "Show in File Tree" binoculars button
     * followed by the "Collapse All" chevron button. Both live in
     * #project-files-header and become visible only on #sidebar:hover.
     */
    function createSidebarHoverButtons() {
        const $projectFilesHeader = $("#project-files-header");
        if ($projectFilesHeader.length === 0) {
            return;
        }

        const $showInTreeBtn = $('<div id="show-in-file-tree" class="btn-alt-quiet" title="' +
            Strings.CMD_SHOW_IN_TREE + '">' + SHOW_IN_TREE_SVG + '</div>');
        $showInTreeBtn.on("click", _handleShowInTreeClick);
        $projectFilesHeader.append($showInTreeBtn);

        const $collapseBtn = $(`
            <div id="collapse-folders" class="btn-alt-quiet" title="${Strings.COLLAPSE_ALL_FOLDERS}">
                <i class="fa-solid fa-chevron-down collapse-icon" aria-hidden="true"></i>
                <i class="fa-solid fa-chevron-up collapse-icon" aria-hidden="true"></i>
            </div>
        `);
        $collapseBtn.on("click", handleCollapseBtnClick);
        $projectFilesHeader.append($collapseBtn);
    }

    AppInit.appReady(function () {
        createSidebarHoverButtons();
    });
});
