define(function (require, exports, module) {

    const WorkspaceManager = require("view/WorkspaceManager");
    const DocumentManager = require("document/DocumentManager");
    const ViewUtils = require("utils/ViewUtils");
    const WorkingSetView = require("project/WorkingSetView");
    const FileUtils = require("file/FileUtils");


    /**
     * Shows the tab bar, when its hidden.
     * Its only shown when tab bar is enabled and there is atleast one working file
     * We need to show both the tab bar and the more options
     *
     * @param {$.Element} $tabBar - The tab bar element
     * @param {$.Element} $moreOptions - The more options element
     */
    function _showTabBar($tabBar, $moreOptions) {
        if ($tabBar) {
            $tabBar.show();
            if($moreOptions) {
                $moreOptions.show();
            }
            // when we add/remove something from the editor, the editor shifts up/down which leads to blank space
            // so we need to recompute the layout to make sure things are in the right place
            WorkspaceManager.recomputeLayout(true);
        }
    }

    /**
     * Hides the tab bar.
     * Its hidden when tab bar feature is disabled or there are no working files
     * Both the tab bar and the more options should be hidden to hide the tab bar container
     *
     * @param {$.Element} $tabBar - The tab bar element
     * @param {$.Element} $moreOptions - The more options element
     */
    function _hideTabBar($tabBar, $moreOptions) {
        if ($tabBar) {
            $tabBar.hide();
            if($moreOptions) {
                $moreOptions.hide();
            }
            WorkspaceManager.recomputeLayout(true);
        }
    }


    /**
     * Entry is a single object that comes from MainViewManager's getWorkingSet
     * We extract the required data from the entry
     *
     * @param {Object} entry - A single file entry from MainViewManager.getWorkingSet()
     * @returns {Object} - the required data
     */
    function _getRequiredDataFromEntry(entry) {
        return {
            path: entry.fullPath,
            name: entry.name,
            isFile: entry.isFile,
            isDirty: entry.isDirty,
            isPinned: entry.isPinned,
            displayName: entry.name // Initialize displayName with name, it will be updated if duplicates are found
        };
    }

    /**
     * checks whether a file is dirty or not
     *
     * @param {File} file - the file to check
     * @return {boolean} true if the file is dirty, false otherwise
     */
    function _isFileModified(file) {
        const doc = DocumentManager.getOpenDocumentForPath(file.fullPath);
        return doc && doc.isDirty;
    }


    /**
     * Returns a jQuery object containing the file icon for a given file
     *
     * @param {Object} fileData - The file data object
     * @returns {jQuery} jQuery object containing the file icon
     */
    function _getFileIcon(fileData) {
        const $link = $("<a href='#' class='mroitem'></a>").html(
            ViewUtils.getFileEntryDisplay({ name: fileData.name })
        );
        WorkingSetView.useIconProviders({
            fullPath: fileData.path,
            name: fileData.name,
            isFile: true
        }, $link);
        return $link.children().first();
    }


    /**
     * Checks for duplicate file names in the working set and updates displayName accordingly
     * if duplicate file names are found, we update the displayName to include the directory
     *
     * @param {Array} workingSet - The working set to check for duplicates
     */
    function _handleDuplicateFileNames(workingSet) {
        // Create a map to track filename occurrences
        const fileNameCount = {};

        // First, count occurrences of each filename
        workingSet.forEach(entry => {
            if (!fileNameCount[entry.name]) {
                fileNameCount[entry.name] = 1;
            } else {
                fileNameCount[entry.name]++;
            }
        });

        // Then, update the displayName for files with duplicate names
        workingSet.forEach(entry => {
            if (fileNameCount[entry.name] > 1) {
                // Get the parent directory name
                const path = entry.path;
                const parentDir = FileUtils.getDirectoryPath(path);

                // Get just the directory name, not the full path
                const dirName = parentDir.split("/");
                // Get the parent directory name (second-to-last part of the path)
                const parentDirName = dirName[dirName.length - 2] || "";

                // Set the display name to include the parent directory
                entry.displayName = parentDirName + "/" + entry.name;
            } else {
                entry.displayName = entry.name;
            }
        });
    }


    module.exports = {
        _showTabBar,
        _hideTabBar,
        _getRequiredDataFromEntry,
        _isFileModified,
        _getFileIcon,
        _handleDuplicateFileNames
    };
});
