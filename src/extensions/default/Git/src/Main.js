define(function (require, exports) {

    const _               = brackets.getModule("thirdparty/lodash"),
        CommandManager    = brackets.getModule("command/CommandManager"),
        Commands          = brackets.getModule("command/Commands"),
        Menus             = brackets.getModule("command/Menus"),
        FileSystem        = brackets.getModule("filesystem/FileSystem"),
        Mustache          = brackets.getModule("thirdparty/mustache/mustache"),
        Metrics           = brackets.getModule("utils/Metrics"),
        ProjectManager    = brackets.getModule("project/ProjectManager");

    const Constants       = require("src/Constants"),
        Events            = require("src/Events"),
        EventEmitter      = require("src/EventEmitter"),
        Strings             = brackets.getModule("strings"),
        StringUtils             = brackets.getModule("utils/StringUtils"),
        ErrorHandler      = require("src/ErrorHandler"),
        Panel             = require("src/Panel"),
        Branch            = require("src/Branch"),
        SettingsDialog    = require("src/SettingsDialog"),
        Dialogs                 = brackets.getModule("widgets/Dialogs"),
        CloseNotModified  = require("src/CloseNotModified"),
        Setup             = require("src/utils/Setup"),
        Preferences       = require("src/Preferences"),
        Utils             = require("src/Utils"),
        Git               = require("src/git/Git"),
        gitTagDialogTemplate    = require("text!templates/git-tag-dialog.html");

    const CMD_ADD_TO_IGNORE      = "git.addToIgnore",
        CMD_REMOVE_FROM_IGNORE = "git.removeFromIgnore",
        $icon                  = $(`<a id='git-toolbar-icon' title="${Strings.STATUSBAR_SHOW_GIT}" href='#'></a>`)
            .addClass("forced-hidden")
            .prependTo($(".bottom-buttons"));

    let gitEnabled = false;

    EventEmitter.on(Events.GIT_DISABLED, function () {
        $icon.removeClass("dirty");
    });

    EventEmitter.on(Events.GIT_STATUS_RESULTS, function (sortedResults) {
        $icon.toggleClass("dirty", sortedResults.length !== 0);
    });

    // This only launches when Git is available
    function initUi() {
        // FUTURE: do we really need to launch init from here?
        Panel.init();
        Branch.init();
        CloseNotModified.init();
        // Attach events
        $icon.on("click", Panel.toggle);
    }

    function _addRemoveItemInGitignore(selectedEntry, method) {
        var gitRoot = Preferences.get("currentGitRoot"),
            entryPath = "/" + selectedEntry.fullPath.substring(gitRoot.length),
            gitignoreEntry = FileSystem.getFileForPath(gitRoot + ".gitignore");

        gitignoreEntry.read(function (err, content) {
            if (err) {
                Utils.consoleWarn(err);
                content = "";
            }

            // use trimmed lines only
            var lines = content.split("\n").map(function (l) { return l.trim(); });
            // clean start and end empty lines
            while (lines.length > 0 && !lines[0]) { lines.shift(); }
            while (lines.length > 0 && !lines[lines.length - 1]) { lines.pop(); }

            if (method === "add") {
                // add only when not already present
                if (lines.indexOf(entryPath) === -1) { lines.push(entryPath); }
            } else if (method === "remove") {
                lines = _.without(lines, entryPath);
            }

            // always have an empty line at the end of the file
            if (lines[lines.length - 1]) { lines.push(""); }

            gitignoreEntry.write(lines.join("\n"), function (err) {
                if (err) {
                    return ErrorHandler.showError(err, Strings.ERROR_MODIFY_GITIGNORE);
                }
                Panel.refresh();
            });
        });
    }

    function addItemToGitingore() {
        return _addRemoveItemInGitignore(ProjectManager.getSelectedItem(), "add");
    }

    function removeItemFromGitingore() {
        return _addRemoveItemInGitignore(ProjectManager.getSelectedItem(), "remove");
    }

    function addItemToGitingoreFromPanel() {
        var filePath = Panel.getPanel().find("tr.selected").attr("x-file"),
            fileEntry = FileSystem.getFileForPath(Preferences.get("currentGitRoot") + filePath);
        return _addRemoveItemInGitignore(fileEntry, "add");
    }

    function removeItemFromGitingoreFromPanel() {
        var filePath = Panel.getPanel().find("tr.selected").attr("x-file"),
            fileEntry = FileSystem.getFileForPath(Preferences.get("currentGitRoot") + filePath);
        return _addRemoveItemInGitignore(fileEntry, "remove");
    }

    function _refreshCallback() {
        EventEmitter.emit(Events.REFRESH_ALL);
    }

    function checkoutCommit(commitHash) {
        const commitDetail = Panel.getSelectedHistoryCommit() || {};
        commitHash = commitHash || commitDetail.hash;
        const commitDetailStr = commitDetail.subject || "";
        if(!commitHash){
            console.error(`Cannot do Git checkout as commit hash is ${commitHash}`);
            return;
        }
        const displayStr = StringUtils.format(Strings.CHECKOUT_COMMIT_DETAIL, commitDetailStr, commitHash);
        Utils.askQuestion(Strings.TITLE_CHECKOUT,
            displayStr + "<br><br>" + Strings.DIALOG_CHECKOUT,
            { booleanResponse: true, noescape: true, customOkBtn: Strings.CHECKOUT_COMMIT })
            .then(function (response) {
                if (response === true) {
                    return Git.checkout(commitHash).then(_refreshCallback);
                }
            });
    }

    function tagCommit(commitHash) {
        const commitDetail = Panel.getSelectedHistoryCommit() || {};
        commitHash = commitHash || commitDetail.hash || "";
        const compiledTemplate = Mustache.render(gitTagDialogTemplate, { Strings }),
            dialog           = Dialogs.showModalDialogUsingTemplate(compiledTemplate),
            $dialog          = dialog.getElement();
        $dialog.find("input").focus();
        $dialog.find("button.primary").on("click", function () {
            const tagname = $dialog.find("input.commit-message").val();
            Git.setTagName(tagname, commitHash).then(function () {
                EventEmitter.emit(Events.REFRESH_HISTORY);
            }).catch(function (err) {
                ErrorHandler.showError(err, Strings.ERROR_CREATE_TAG);
            });
        });
    }

    function _resetOperation(operation, commitHash, title, message) {
        const commitDetail = Panel.getSelectedHistoryCommit() || {};
        commitHash = commitHash || commitDetail.hash;
        const commitDetailStr = commitDetail.subject || "";
        if(!commitHash){
            console.error(`Cannot do Git Reset ${operation} as commit hash is ${commitHash}`);
            return;
        }
        const gitCmdUsed = `git reset ${operation} ${commitHash}`;
        const displayStr = StringUtils.format(Strings.RESET_DETAIL, commitDetailStr, gitCmdUsed);
        Utils.askQuestion(title,
            message + "<br><br>" + displayStr,
            { booleanResponse: true, noescape: true,
                customOkBtn: Strings.RESET, customOkBtnClass: "danger"})
            .then(function (response) {
                if (response === true) {
                    return Git.reset(operation, commitHash).then(_refreshCallback);
                }
            });
    }

    function resetHard(commitHash) {
        return _resetOperation("--hard", commitHash,
            Strings.RESET_HARD_TITLE, Strings.RESET_HARD_MESSAGE);
    }

    function resetMixed(commitHash) {
        return _resetOperation("--mixed", commitHash,
            Strings.RESET_MIXED_TITLE, Strings.RESET_MIXED_MESSAGE);
    }

    function resetSoft(commitHash) {
        return _resetOperation("--soft", commitHash,
            Strings.RESET_SOFT_TITLE, Strings.RESET_SOFT_MESSAGE);
    }

    /**
     * Disables all Git-related commands that were registered in `initGitMenu`.
     * After calling this function, none of these menu items will be clickable.
     */
    function disableAllMenus() {
        // Collect all command IDs that were registered in initGitMenu
        const commandsToDisable = [
            // File menu items
            Constants.CMD_GIT_INIT,
            Constants.CMD_GIT_CLONE,
            Constants.CMD_GIT_TOGGLE_PANEL,
            Constants.CMD_GIT_REFRESH,
            Constants.CMD_GIT_GOTO_NEXT_CHANGE,
            Constants.CMD_GIT_GOTO_PREVIOUS_CHANGE,
            Constants.CMD_GIT_CLOSE_UNMODIFIED,
            Constants.CMD_GIT_AUTHORS_OF_SELECTION,
            Constants.CMD_GIT_AUTHORS_OF_FILE,
            Constants.CMD_GIT_COMMIT_CURRENT,
            Constants.CMD_GIT_COMMIT_ALL,
            Constants.CMD_GIT_FETCH,
            Constants.CMD_GIT_PULL,
            Constants.CMD_GIT_PUSH,
            Constants.CMD_GIT_GERRIT_PUSH_REF,
            Constants.CMD_GIT_CHANGE_USERNAME,
            Constants.CMD_GIT_CHANGE_EMAIL,
            Constants.CMD_GIT_SETTINGS_COMMAND_ID,

            // Project tree/working files commands
            CMD_ADD_TO_IGNORE,
            CMD_REMOVE_FROM_IGNORE,
            // Panel context menu commands (with "2" suffix)
            CMD_ADD_TO_IGNORE + "2",
            CMD_REMOVE_FROM_IGNORE + "2",

            // History context menu commands
            Constants.CMD_GIT_CHECKOUT,
            Constants.CMD_GIT_TAG,
            Constants.CMD_GIT_RESET_HARD,
            Constants.CMD_GIT_RESET_MIXED,
            Constants.CMD_GIT_RESET_SOFT,

            // "More options" context menu commands
            Constants.CMD_GIT_DISCARD_ALL_CHANGES,
            Constants.CMD_GIT_UNDO_LAST_COMMIT,
            Constants.CMD_GIT_TOGGLE_UNTRACKED,

            Constants.CMD_GIT_HISTORY_GLOBAL,
            Constants.CMD_GIT_HISTORY_FILE
        ];

        // Disable each command
        commandsToDisable.forEach((cmdId) => {
            Utils.enableCommand(cmdId, false);
        });
    }


    function initGitMenu() {
        // Register command and add it to the menu.
        const fileMenu = Menus.getMenu(Menus.AppMenuBar.FILE_MENU);
        let gitSubMenu = fileMenu.addSubMenu(Constants.GIT_STRING_UNIVERSAL,
            Constants.GIT_SUB_MENU, Menus.AFTER, Commands.FILE_EXTENSION_MANAGER);
        fileMenu.addMenuDivider(Menus.AFTER, Commands.FILE_EXTENSION_MANAGER);
        gitSubMenu.addMenuItem(Constants.CMD_GIT_INIT, undefined, undefined, undefined, {
            hideWhenCommandDisabled: true
        });
        gitSubMenu.addMenuItem(Constants.CMD_GIT_CLONE, undefined, undefined, undefined, {
            hideWhenCommandDisabled: true
        });
        gitSubMenu.addMenuItem(Constants.CMD_GIT_TOGGLE_PANEL);
        gitSubMenu.addMenuItem(Constants.CMD_GIT_REFRESH);
        gitSubMenu.addMenuDivider();
        gitSubMenu.addMenuItem(Constants.CMD_GIT_GOTO_NEXT_CHANGE);
        gitSubMenu.addMenuItem(Constants.CMD_GIT_GOTO_PREVIOUS_CHANGE);
        gitSubMenu.addMenuItem(Constants.CMD_GIT_CLOSE_UNMODIFIED);
        gitSubMenu.addMenuDivider();
        gitSubMenu.addMenuItem(Constants.CMD_GIT_HISTORY_GLOBAL);
        gitSubMenu.addMenuItem(Constants.CMD_GIT_HISTORY_FILE);
        gitSubMenu.addMenuDivider();
        gitSubMenu.addMenuItem(Constants.CMD_GIT_AUTHORS_OF_SELECTION);
        gitSubMenu.addMenuItem(Constants.CMD_GIT_AUTHORS_OF_FILE);
        gitSubMenu.addMenuDivider();
        gitSubMenu.addMenuItem(Constants.CMD_GIT_COMMIT_CURRENT);
        gitSubMenu.addMenuItem(Constants.CMD_GIT_COMMIT_ALL);
        gitSubMenu.addMenuDivider();
        gitSubMenu.addMenuItem(Constants.CMD_GIT_FETCH);
        gitSubMenu.addMenuItem(Constants.CMD_GIT_PULL);
        gitSubMenu.addMenuItem(Constants.CMD_GIT_PUSH);
        gitSubMenu.addMenuDivider();
        gitSubMenu.addMenuItem(Constants.CMD_GIT_GERRIT_PUSH_REF);
        gitSubMenu.addMenuItem(Constants.CMD_GIT_CHANGE_USERNAME);
        gitSubMenu.addMenuItem(Constants.CMD_GIT_CHANGE_EMAIL);
        gitSubMenu.addMenuDivider();
        gitSubMenu.addMenuItem(Constants.CMD_GIT_SETTINGS_COMMAND_ID);

        // register commands for project tree / working files
        CommandManager.register(Strings.ADD_TO_GITIGNORE, CMD_ADD_TO_IGNORE, addItemToGitingore);
        CommandManager.register(Strings.REMOVE_FROM_GITIGNORE, CMD_REMOVE_FROM_IGNORE, removeItemFromGitingore);

        // create context menu for git panel
        const panelCmenu = Menus.registerContextMenu(Constants.GIT_PANEL_CHANGES_CMENU);
        CommandManager.register(Strings.ADD_TO_GITIGNORE, CMD_ADD_TO_IGNORE + "2", addItemToGitingoreFromPanel);
        CommandManager.register(Strings.REMOVE_FROM_GITIGNORE, CMD_REMOVE_FROM_IGNORE + "2", removeItemFromGitingoreFromPanel);
        panelCmenu.addMenuItem(CMD_ADD_TO_IGNORE + "2");
        panelCmenu.addMenuItem(CMD_REMOVE_FROM_IGNORE + "2");

        // create context menu for git history
        const historyCmenu = Menus.registerContextMenu(Constants.GIT_PANEL_HISTORY_CMENU);
        CommandManager.register(Strings.CHECKOUT_COMMIT, Constants.CMD_GIT_CHECKOUT, checkoutCommit);
        CommandManager.register(Strings.MENU_RESET_HARD, Constants.CMD_GIT_RESET_HARD, resetHard);
        CommandManager.register(Strings.MENU_RESET_MIXED, Constants.CMD_GIT_RESET_MIXED, resetMixed);
        CommandManager.register(Strings.MENU_RESET_SOFT, Constants.CMD_GIT_RESET_SOFT, resetSoft);
        CommandManager.register(Strings.MENU_TAG_COMMIT, Constants.CMD_GIT_TAG, tagCommit);
        historyCmenu.addMenuItem(Constants.CMD_GIT_CHECKOUT);
        historyCmenu.addMenuItem(Constants.CMD_GIT_TAG);
        historyCmenu.addMenuDivider();
        historyCmenu.addMenuItem(Constants.CMD_GIT_RESET_HARD);
        historyCmenu.addMenuItem(Constants.CMD_GIT_RESET_MIXED);
        historyCmenu.addMenuItem(Constants.CMD_GIT_RESET_SOFT);

        // create context menu for git more options
        const optionsCmenu = Menus.registerContextMenu(Constants.GIT_PANEL_OPTIONS_CMENU);
        Menus.ContextMenu.assignContextMenuToSelector(".git-more-options-btn", optionsCmenu);
        optionsCmenu.addMenuItem(Constants.CMD_GIT_DISCARD_ALL_CHANGES);
        optionsCmenu.addMenuItem(Constants.CMD_GIT_UNDO_LAST_COMMIT);
        optionsCmenu.addMenuDivider();
        optionsCmenu.addMenuItem(Constants.CMD_GIT_HISTORY_GLOBAL);
        optionsCmenu.addMenuItem(Constants.CMD_GIT_HISTORY_FILE);
        optionsCmenu.addMenuDivider();
        optionsCmenu.addMenuItem(Constants.CMD_GIT_AUTHORS_OF_SELECTION);
        optionsCmenu.addMenuItem(Constants.CMD_GIT_AUTHORS_OF_FILE);
        optionsCmenu.addMenuDivider();
        optionsCmenu.addMenuItem(Constants.CMD_GIT_FETCH);
        optionsCmenu.addMenuItem(Constants.CMD_GIT_PULL);
        optionsCmenu.addMenuItem(Constants.CMD_GIT_PUSH);
        optionsCmenu.addMenuDivider();
        optionsCmenu.addMenuItem(Constants.CMD_GIT_TOGGLE_UNTRACKED);
        optionsCmenu.addMenuItem(Constants.CMD_GIT_GERRIT_PUSH_REF);
        optionsCmenu.addMenuItem(Constants.CMD_GIT_CHANGE_USERNAME);
        optionsCmenu.addMenuItem(Constants.CMD_GIT_CHANGE_EMAIL);
        optionsCmenu.addMenuDivider();
        optionsCmenu.addMenuItem(Constants.CMD_GIT_SETTINGS_COMMAND_ID);

        if(!Setup.isExtensionActivated()){
            disableAllMenus();
        }
    }

    function init() {
        CommandManager.register(Strings.GIT_SETTINGS, Constants.CMD_GIT_SETTINGS_COMMAND_ID, SettingsDialog.show);
        // Try to get Git version, if succeeds then Git works
        return Setup.init().then(function (enabled) {
            initUi();
            initGitMenu();
            return enabled;
        });
    }

    var _toggleMenuEntriesState = false,
        _divider1 = null,
        _divider2 = null,
        _divider3 = null;
    function toggleMenuEntries(bool) {
        if (bool === _toggleMenuEntriesState) {
            return;
        }
        var projectCmenu = Menus.getContextMenu(Menus.ContextMenuIds.PROJECT_MENU);
        var workingCmenu = Menus.getContextMenu(Menus.ContextMenuIds.WORKING_SET_CONTEXT_MENU);
        var tabbarCmenu = Menus.getContextMenu("tabbar-context-menu");
        if (bool) {
            _divider1 = projectCmenu.addMenuDivider();
            _divider2 = workingCmenu.addMenuDivider();
            _divider3 = tabbarCmenu.addMenuDivider();
            projectCmenu.addMenuItem(CMD_ADD_TO_IGNORE);
            workingCmenu.addMenuItem(CMD_ADD_TO_IGNORE);
            tabbarCmenu.addMenuItem(CMD_ADD_TO_IGNORE);
            projectCmenu.addMenuItem(CMD_REMOVE_FROM_IGNORE);
            workingCmenu.addMenuItem(CMD_REMOVE_FROM_IGNORE);
            tabbarCmenu.addMenuItem(CMD_REMOVE_FROM_IGNORE);
        } else {
            projectCmenu.removeMenuDivider(_divider1.id);
            workingCmenu.removeMenuDivider(_divider2.id);
            tabbarCmenu.removeMenuDivider(_divider3.id);
            projectCmenu.removeMenuItem(CMD_ADD_TO_IGNORE);
            workingCmenu.removeMenuItem(CMD_ADD_TO_IGNORE);
            tabbarCmenu.removeMenuItem(CMD_ADD_TO_IGNORE);
            projectCmenu.removeMenuItem(CMD_REMOVE_FROM_IGNORE);
            workingCmenu.removeMenuItem(CMD_REMOVE_FROM_IGNORE);
            tabbarCmenu.removeMenuItem(CMD_REMOVE_FROM_IGNORE);
        }
        _toggleMenuEntriesState = bool;
    }

    function _enableAllCommands(enabled) {
        Utils.enableCommand(Constants.CMD_GIT_REFRESH, enabled);

        Utils.enableCommand(Constants.CMD_GIT_GOTO_NEXT_CHANGE, enabled);
        Utils.enableCommand(Constants.CMD_GIT_GOTO_PREVIOUS_CHANGE, enabled);
        Utils.enableCommand(Constants.CMD_GIT_CLOSE_UNMODIFIED, enabled);

        Utils.enableCommand(Constants.CMD_GIT_AUTHORS_OF_SELECTION, enabled);
        Utils.enableCommand(Constants.CMD_GIT_AUTHORS_OF_FILE, enabled);

        Utils.enableCommand(Constants.CMD_GIT_HISTORY_GLOBAL, enabled);
        Utils.enableCommand(Constants.CMD_GIT_HISTORY_FILE, enabled);

        Utils.enableCommand(Constants.CMD_GIT_COMMIT_CURRENT, enabled);
        Utils.enableCommand(Constants.CMD_GIT_COMMIT_ALL, enabled);

        Utils.enableCommand(Constants.CMD_GIT_FETCH, enabled);
        Utils.enableCommand(Constants.CMD_GIT_PULL, enabled);
        Utils.enableCommand(Constants.CMD_GIT_PUSH, enabled);

        Utils.enableCommand(Constants.CMD_GIT_DISCARD_ALL_CHANGES, enabled);
        Utils.enableCommand(Constants.CMD_GIT_UNDO_LAST_COMMIT, enabled);
        toggleMenuEntries(enabled);
        if(enabled){
            $icon.removeClass("forced-hidden");
        } else if(!$("#git-panel").is(":visible")){
            $icon.addClass("forced-hidden");
        }
    }

    let isCommandExecuting = false;
    let scheduledRefresh = null;
    const REFRESH_DEDUPE_TIME = 3000;

    // this variable tracks if user clicked on the live preview iframe
    // this is done cause when live preview iframe is clicked in highlight/edit mode,
    // we set cursor back to the editor because of which editor regains focus and refreshes git
    let focusWentToLivePreview = false;

    // when editor window loses focus we check if focus went to live preview,
    // if it did, then we just set the flag to true
    $(window).on("blur", function () {
        // delay to let activeElement update
        setTimeout(function () {
            const activeEl = document.activeElement;
            if (activeEl && activeEl.id === "panel-live-preview-frame") {
                focusWentToLivePreview = true;
            }
        }, 0);
    });

    function refreshOnFocusChange() {
        // ignore git refresh if focus went to live preview
        if (focusWentToLivePreview) {
            focusWentToLivePreview = false;
            return;
        }

        // to sync external git changes after switching to app.
        if (gitEnabled) {
            const isGitPanelVisible = Panel.getPanel().is(":visible");

            if (isCommandExecuting) {
                // if we haven't already scheduled a refresh, queue one
                if (!scheduledRefresh) {
                    scheduledRefresh = setTimeout(() => {
                        scheduledRefresh = null;
                        refreshOnFocusChange();
                    }, REFRESH_DEDUPE_TIME);
                }
                return;
            }
            isCommandExecuting = true;

            // if the git panel is visible, its very likely user is working with git (maybe external)
            // so when Phoenix gains focus, we do a complete git refresh to show latest status
            if(isGitPanelVisible) {
                CommandManager.execute(Constants.CMD_GIT_REFRESH).fail((err) => {
                    console.error("error refreshing on focus switch", err);
                }).always(() => {
                    isCommandExecuting = false;
                    // if a refresh got queued while we were executing, run it immediately now
                    if (scheduledRefresh) {
                        clearTimeout(scheduledRefresh);
                        scheduledRefresh = null;
                        refreshOnFocusChange();
                    }
                });
            } else {
                // if panel not visible, we just refresh the git branch (shown in sidebar)
                Branch.refresh();
                isCommandExecuting = false;

                // run if something got queued
                if (scheduledRefresh) {
                    clearTimeout(scheduledRefresh);
                    scheduledRefresh = null;
                    refreshOnFocusChange();
                }
            }
        }
    }
    $(window).focus(refreshOnFocusChange);

    // Event handlers
    let projectSwitched = true;
    EventEmitter.on(Events.BRACKETS_PROJECT_CHANGE, function () {
        // pressing refresh button will raise GIT_ENABLED event and we only want one enabled metric
        // per project open.
        projectSwitched = true;
    });
    EventEmitter.on(Events.GIT_ENABLED, function () {
        _enableAllCommands(true);
        gitEnabled = true;
        projectSwitched && Metrics.countEvent(Metrics.EVENT_TYPE.GIT, 'enabled', "project");
        projectSwitched = false;
    });
    EventEmitter.on(Events.GIT_DISABLED, function () {
        _enableAllCommands(false);
        gitEnabled = false;
    });

    // API
    exports.$icon = $icon;
    exports.init = init;

});
