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

/**
 * PathMapper - Maps Phoenix virtual paths to real filesystem paths for AI integration
 *
 * Handles three types of paths:
 * - Tauri (Desktop): /tauri/Users/name/project/ → real path via Phoenix.app.getPlatformPath()
 * - Mount (FUSE): /mnt/home/user/project/ → strip /mnt/ prefix
 * - Virtual (IndexedDB): /fs/local/project/ → requires user input
 */
define(function (require, exports, module) {

    const PreferencesManager = brackets.getModule("preferences/PreferencesManager");
    const ProjectManager = brackets.getModule("project/ProjectManager");
    const Dialogs = brackets.getModule("widgets/Dialogs");

    const PREF_KEY = "claudeCodeBridge.realPathMapping";

    /**
     * Extract project name from a path
     * @param {string} projectPath - Full project path
     * @returns {string} Project name (last segment of path)
     */
    function getProjectName(projectPath) {
        const parts = projectPath.replace(/\/$/, '').split('/');
        return parts[parts.length - 1];
    }

    /**
     * Try to determine the real filesystem path from a Phoenix path
     * @param {string} phoenixPath - Phoenix virtual path
     * @returns {string|null} Real path or null if cannot be determined
     */
    function getRealPath(phoenixPath) {
        // Tauri desktop path - has reliable path conversion
        if (phoenixPath.startsWith('/tauri/')) {
            return Phoenix.app.getPlatformPath(phoenixPath);
        }
        // Mounted paths (/mnt/) and virtual filesystem paths (/fs/)
        // cannot be reliably converted - need user input
        return null;
    }

    /**
     * Save real path mapping to project preferences
     * @param {string} realPath - The real filesystem path
     */
    function saveRealPathMapping(realPath) {
        PreferencesManager.setViewState(PREF_KEY, realPath,
            PreferencesManager.STATE_PROJECT_CONTEXT);
    }

    /**
     * Get saved real path mapping from project preferences
     * @returns {string|null} Saved path or null
     */
    function getSavedRealPathMapping() {
        return PreferencesManager.getViewState(PREF_KEY,
            PreferencesManager.STATE_PROJECT_CONTEXT);
    }

    /**
     * Show dialog prompting user to enter the real filesystem path
     * @param {string} projectName - Name of the project
     * @returns {Promise<string>} Resolves with the path entered by user
     */
    function promptForRealPath(projectName) {
        return new Promise((resolve, reject) => {
            const template = `
                <div class="modal phoenix-ai-path-dialog">
                    <div class="modal-header">
                        <h1 class="dialog-title">AI Integration Setup</h1>
                    </div>
                    <div class="modal-body">
                        <p>Project "<strong>${projectName}</strong>" needs a local path for AI editing.</p>
                        <p>Paste the root folder path:</p>
                        <input type="text" class="ai-path-input"
                               placeholder="/home/user/projects/${projectName}"
                               style="width: 100%; margin-top: 10px; padding: 8px;">
                    </div>
                    <div class="modal-footer">
                        <button class="dialog-button btn" data-button-id="cancel">Cancel</button>
                        <button class="dialog-button btn primary" data-button-id="ok">OK</button>
                    </div>
                </div>
            `;

            const dialog = Dialogs.showModalDialogUsingTemplate(template);
            const $input = dialog.getElement().find(".ai-path-input");
            $input.focus();

            dialog.done(function(buttonId) {
                if (buttonId === "ok") {
                    const path = $input.val().trim();
                    if (path) {
                        saveRealPathMapping(path);
                        resolve(path);
                    } else {
                        reject(new Error("No path entered"));
                    }
                } else {
                    reject(new Error("Cancelled"));
                }
            });
        });
    }

    /**
     * Get the path mapping for the current project
     * @returns {Promise<Object|null>} Object with projectName, rootPath, and optionally needsUserInput
     */
    async function getProjectPathMapping() {
        const projectRoot = ProjectManager.getProjectRoot();
        if (!projectRoot) {
            return null;
        }

        const phoenixPath = projectRoot.fullPath;
        const projectName = getProjectName(phoenixPath);

        // Try to get real path directly
        let rootPath = getRealPath(phoenixPath);
        if (rootPath) {
            return { projectName, rootPath };
        }

        // Check saved mapping for virtual fs
        rootPath = getSavedRealPathMapping();
        if (rootPath) {
            return { projectName, rootPath };
        }

        // Needs user input
        return { projectName, rootPath: null, needsUserInput: true };
    }

    exports.getProjectPathMapping = getProjectPathMapping;
    exports.promptForRealPath = promptForRealPath;
    exports.getProjectName = getProjectName;
});
