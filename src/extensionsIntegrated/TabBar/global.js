define(function (require, exports, module) {
    /**
     * This array's represents the current working set
     * It holds all the working set items that are to be displayed in the tab bar
     * Properties of each object:
     * path: {String} full path of the file
     * name: {String} name of the file
     * isFile: {Boolean} whether the file is a file or a directory
     * isDirty: {Boolean} whether the file is dirty
     * isPinned: {Boolean} whether the file is pinned
     * displayName: {String} name to display in the tab (may include directory info for duplicate files)
     */
    let firstPaneWorkingSet = [];
    let secondPaneWorkingSet = [];

    module.exports = {
        firstPaneWorkingSet,
        secondPaneWorkingSet
    };
});
