/*jslint plusplus: true, vars: true, nomen: true */
/*global $, brackets, define */

define(function (require, exports) {

    const DocumentManager = brackets.getModule("document/DocumentManager"),
        Commands        = brackets.getModule("command/Commands"),
        CommandManager  = brackets.getModule("command/CommandManager"),
        Strings         = brackets.getModule("strings"),
        MainViewManager = brackets.getModule("view/MainViewManager");

    const Events      = require("src/Events"),
        EventEmitter  = require("src/EventEmitter"),
        Git           = require("src/git/Git"),
        Preferences   = require("src/Preferences"),
        Constants     = require("src/Constants"),
        Utils         = require("src/Utils");

    let closeUnmodifiedCmd;

    function handleCloseNotModified() {
        Git.status().then(function (modifiedFiles) {
            var openFiles      = MainViewManager.getWorkingSet(MainViewManager.ALL_PANES),
                currentGitRoot = Preferences.get("currentGitRoot");

            openFiles.forEach(function (openFile) {
                var removeOpenFile = true;
                modifiedFiles.forEach(function (modifiedFile) {
                    if (currentGitRoot + modifiedFile.file === openFile.fullPath) {
                        removeOpenFile = false;
                    }
                });

                if (removeOpenFile) {
                    // check if file doesn't have any unsaved changes
                    const doc = DocumentManager.getOpenDocumentForPath(openFile.fullPath);
                    // document will not  be present for images, or if the file is in working set but
                    // no editor is attached yet(eg. session restore on app start)
                    if (!doc || !doc.isDirty) {
                        CommandManager.execute(Commands.FILE_CLOSE_LIST, {PaneId: MainViewManager.ALL_PANES, fileList: [openFile]});
                    }
                }
            });

            MainViewManager.focusActivePane();
        });
    }

    function init() {
        closeUnmodifiedCmd       = CommandManager.register(Strings.CMD_CLOSE_UNMODIFIED,
            Constants.CMD_GIT_CLOSE_UNMODIFIED, handleCloseNotModified);
        Utils.enableCommand(Constants.CMD_GIT_CLOSE_UNMODIFIED, false);
    }

    EventEmitter.on(Events.GIT_ENABLED, function () {
        Utils.enableCommand(Constants.CMD_GIT_CLOSE_UNMODIFIED, true);
    });

    EventEmitter.on(Events.GIT_DISABLED, function () {
        Utils.enableCommand(Constants.CMD_GIT_CLOSE_UNMODIFIED, false);
    });

    // Public API
    exports.init = init;
});
