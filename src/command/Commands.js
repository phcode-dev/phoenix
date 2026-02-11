/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
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

// @INCLUDE_IN_API_DOCS

define(function (require, exports, module) {

    var DeprecationWarning = require("utils/DeprecationWarning");

    /** Creates a new untitled document */
    exports.FILE_NEW_UNTITLED           = "file.newDoc";                // DocumentCommandHandlers.js   handleFileNew()

    /** Creates a new file in the current project */
    exports.FILE_NEW                    = "file.newFile";               // DocumentCommandHandlers.js   handleFileNewInProject()

    /** Creates a new project */
    exports.FILE_NEW_PROJECT            = "file.newProject";            // Phoenix extension: new-project.js

    /** Creates a new folder in the current project */
    exports.FILE_NEW_FOLDER             = "file.newFolder";             // DocumentCommandHandlers.js   handleNewFolderInProject()

    /** Duplicates the selected file or folder */
    exports.FILE_DUPLICATE              = "file.duplicate";             // ProjectManager.js

    /** Duplicates the selected file */
    exports.FILE_DUPLICATE_FILE         = "file.duplicateFile";             // ProjectManager.js

    /** Downloads the selected file */
    exports.FILE_DOWNLOAD               = "file.download";              // ProjectManager.js

    /** Downloads the entire project */
    exports.FILE_DOWNLOAD_PROJECT       = "file.downloadProject";              // ProjectManager.js

    /** Cuts the selected file or folder to clipboard */
    exports.FILE_CUT                    = "file.cut";                   // ProjectManager.js

    /** Copies the selected file or folder to clipboard */
    exports.FILE_COPY                   = "file.copy";                  // ProjectManager.js

    /** Copies the path of selected file or folder */
    exports.FILE_COPY_PATH              = "file.copy.path";             // ProjectManager.js

    /** Pastes file or folder from clipboard */
    exports.FILE_PASTE                  = "file.paste";                 // ProjectManager.js

    /** Opens a file */
    exports.FILE_OPEN                   = "file.open";                  // DocumentCommandHandlers.js   handleDocumentOpen()

    /** Opens a folder as a project */
    exports.FILE_OPEN_FOLDER            = "file.openFolder";            // ProjectManager.js            openProject()

    /** Saves the current file */
    exports.FILE_SAVE                   = "file.save";                  // DocumentCommandHandlers.js   handleFileSave()

    /** Saves all open files */
    exports.FILE_SAVE_ALL               = "file.saveAll";               // DocumentCommandHandlers.js   handleFileSaveAll()

    /** Saves current file with a new name */
    exports.FILE_SAVE_AS                = "file.saveAs";                // DocumentCommandHandlers.js   handleFileSaveAs()

    /** Closes the current file */
    exports.FILE_CLOSE                  = "file.close";                 // DocumentCommandHandlers.js   handleFileClose()

    /** Closes all open files */
    exports.FILE_CLOSE_ALL              = "file.close_all";             // DocumentCommandHandlers.js   handleFileCloseAll()

    /** Closes files from list */
    exports.FILE_CLOSE_LIST             = "file.close_list";            // DocumentCommandHandlers.js   handleFileCloseList()

    /** Reopens last closed file */
    exports.FILE_REOPEN_CLOSED          = "file.reopen_closed";         // DocumentCommandHandlers.js   handleReopenClosed()

    /** Opens files that were dropped */
    exports.FILE_OPEN_DROPPED_FILES     = "file.openDroppedFiles";      // DragAndDrop.js               openDroppedFiles()

    /** Toggles live file preview */
    exports.FILE_LIVE_FILE_PREVIEW      = "file.liveFilePreview";       // LiveDevelopment/main.js      _handleGoLiveCommand()

    /** Opens live preview settings */
    exports.FILE_LIVE_FILE_PREVIEW_SETTINGS = "file.liveFilePreviewSettings";       // LiveDevelopment/main.js      _handleGoLiveCommand()

    /** Toggles live preview multi-browser mode */
    exports.TOGGLE_LIVE_PREVIEW_MB_MODE = "file.toggleLivePreviewMB";   // LiveDevelopment/main.js      _toggleLivePreviewMultiBrowser()

    /** Reloads live preview */
    exports.CMD_RELOAD_LIVE_PREVIEW     = "file.reloadLivePreview";     // LiveDevelopment/main.js      _handleReloadLivePreviewCommand()

    /** Opens project settings */
    exports.FILE_PROJECT_SETTINGS       = "file.projectSettings";       // ProjectManager.js            _projectSettings()

    /** Renames selected file or folder */
    exports.FILE_RENAME                 = "file.rename";                // DocumentCommandHandlers.js   handleFileRename()

    /** Deletes selected file or folder */
    exports.FILE_DELETE                 = "file.delete";                // DocumentCommandHandlers.js   handleFileDelete()

    /** Opens extension manager */
    exports.FILE_EXTENSION_MANAGER      = "file.extensionManager";      // ExtensionManagerDialog.js    _showDialog()

    /** Refreshes the file tree */
    exports.FILE_REFRESH                = "file.refresh";               // ProjectManager.js            refreshFileTree()

    /** Toggles show folders first in file tree */
    exports.FILE_SHOW_FOLDERS_FIRST     = "file.showFolderFirst";       // ProjectManager.js

    /** Opens preferences */
    exports.FILE_OPEN_PREFERENCES       = "file.openPreferences";       // PreferencesManager.js        _handleOpenPreferences()

    /** Opens keymap settings */
    exports.FILE_OPEN_KEYMAP            = "file.openKeyMap";            // KeyBindingManager.js         _openUserKeyMap()

    /** Opens new window */
    exports.FILE_NEW_WINDOW             = "file.new_window";            // DocumentCommandHandlers.js   handleFileNewWindow()

    /** Closes current window */
    exports.FILE_CLOSE_WINDOW           = "file.close_window";          // DocumentCommandHandlers.js   handleFileCloseWindow()

    /** Quits the application */
    exports.FILE_QUIT                   = "file.quit";                  // DocumentCommandHandlers.js   handleFileQuit()



    // EDIT
    // File shell callbacks - string must MATCH string in native code (appshell/command_callbacks.h)
    /** Undoes the last edit operation */
    exports.EDIT_UNDO                   = "edit.undo";                  // EditorCommandHandlers.js     handleUndo()

    /** Redoes the last undone edit operation */
    exports.EDIT_REDO                   = "edit.redo";                  // EditorCommandHandlers.js     handleRedo()

    /** Cuts the selected text to clipboard */
    exports.EDIT_CUT                    = "edit.cut";                   // EditorCommandHandlers.js     ignoreCommand()

    /** Copies the selected text to clipboard */
    exports.EDIT_COPY                   = "edit.copy";                  // EditorCommandHandlers.js     ignoreCommand()

    /** Pastes text from clipboard */
    exports.EDIT_PASTE                  = "edit.paste";                 // EditorCommandHandlers.js     ignoreCommand()

    /** Selects all text in the current document */
    exports.EDIT_SELECT_ALL             = "edit.selectAll";             // EditorCommandHandlers.js     _handleSelectAll()

    /** Selects the current line */
    exports.EDIT_SELECT_LINE            = "edit.selectLine";            // EditorCommandHandlers.js     selectLine()

    /** Splits selection into individual lines */
    exports.EDIT_SPLIT_SEL_INTO_LINES   = "edit.splitSelIntoLines";     // EditorCommandHandlers.js     splitSelIntoLines()

    /** Adds cursor to the next line */
    exports.EDIT_ADD_CUR_TO_NEXT_LINE   = "edit.addCursorToNextLine";   // EditorCommandHandlers.js     addCursorToNextLine()

    /** Adds cursor to the previous line */
    exports.EDIT_ADD_CUR_TO_PREV_LINE   = "edit.addCursorToPrevLine";   // EditorCommandHandlers.js     addCursorToPrevLine()

    /** Indents the selected text */
    exports.EDIT_INDENT                 = "edit.indent";                // EditorCommandHandlers.js     indentText()

    /** Unindents the selected text */
    exports.EDIT_UNINDENT               = "edit.unindent";              // EditorCommandHandlers.js     unindentText()

    /** Duplicates the selected text */
    exports.EDIT_DUPLICATE              = "edit.duplicate";             // EditorCommandHandlers.js     duplicateText()

    /** Deletes the current line(s) */
    exports.EDIT_DELETE_LINES           = "edit.deletelines";           // EditorCommandHandlers.js     deleteCurrentLines()

    /** Toggles line comment for current selection */
    exports.EDIT_LINE_COMMENT           = "edit.lineComment";           // EditorCommandHandlers.js     lineComment()

    /** Toggles block comment for current selection */
    exports.EDIT_BLOCK_COMMENT          = "edit.blockComment";          // EditorCommandHandlers.js     blockComment()

    /** Moves current line up */
    exports.EDIT_LINE_UP                = "edit.lineUp";                // EditorCommandHandlers.js     moveLineUp()

    /** Moves current line down */
    exports.EDIT_LINE_DOWN              = "edit.lineDown";              // EditorCommandHandlers.js     moveLineDown()

    /** Opens a new line above current line */
    exports.EDIT_OPEN_LINE_ABOVE        = "edit.openLineAbove";         // EditorCommandHandlers.js     openLineAbove()

    /** Opens a new line below current line */
    exports.EDIT_OPEN_LINE_BELOW        = "edit.openLineBelow";         // EditorCommandHandlers.js     openLineBelow()

    /** Toggles auto close brackets */
    exports.TOGGLE_CLOSE_BRACKETS       = "edit.autoCloseBrackets";     // EditorOptionHandlers.js      _getToggler()

    /** Shows code hints */
    exports.SHOW_CODE_HINTS             = "edit.showCodeHints";         // CodeHintManager.js           _startNewSession()

    /** Beautifies the current code */
    exports.EDIT_BEAUTIFY_CODE          = "edit.beautifyCode";         // CodeHintManager.js           _startNewSession()

    /** Toggles code beautification on save */
    exports.EDIT_BEAUTIFY_CODE_ON_SAVE  = "edit.beautifyOnSave";         // CodeHintManager.js           _startNewSession()

    exports.EDIT_EMMET                 = "edit.emmet";                 // HTMLCodeHints CSSCodeHints

    /** Opens find dialog */
    exports.CMD_FIND                    = "cmd.find";                   // FindReplace.js               _launchFind()

    /** Opens find in files dialog */
    exports.CMD_FIND_IN_FILES           = "cmd.findInFiles";            // FindInFilesUI.js             _showFindBar()

    /** Opens find in subtree dialog */
    exports.CMD_FIND_IN_SUBTREE         = "cmd.findInSubtree";          // FindInFilesUI.js             _showFindBarForSubtree()

    /** Finds next match */
    exports.CMD_FIND_NEXT               = "cmd.findNext";               // FindReplace.js               _findNext()

    /** Finds previous match */
    exports.CMD_FIND_PREVIOUS           = "cmd.findPrevious";           // FindReplace.js               _findPrevious()

    /** Finds all matches and selects them */
    exports.CMD_FIND_ALL_AND_SELECT     = "cmd.findAllAndSelect";       // FindReplace.js               _findAllAndSelect()

    /** Adds next match to selection */
    exports.CMD_ADD_NEXT_MATCH          = "cmd.addNextMatch";           // FindReplace.js               _expandAndAddNextToSelection()

    /** Skips current match */
    exports.CMD_SKIP_CURRENT_MATCH      = "cmd.skipCurrentMatch";       // FindReplace.js               _skipCurrentMatch()

    /** Replaces current match */
    exports.CMD_REPLACE                 = "cmd.replace";                // FindReplace.js               _replace()

    /** Opens replace in files dialog */
    exports.CMD_REPLACE_IN_FILES        = "cmd.replaceInFiles";         // FindInFilesUI.js             _showReplaceBar()

    /** Opens replace in subtree dialog */
    exports.CMD_REPLACE_IN_SUBTREE      = "cmd.replaceInSubtree";       // FindInFilesUI.js             _showReplaceBarForSubtree()

    /** Opens find references panel */
    exports.CMD_FIND_ALL_REFERENCES     = "cmd.findAllReferences";      // findReferencesManager.js     _openReferencesPanel()

    // VIEW
    /** Opens theme settings */
    exports.CMD_THEMES_OPEN_SETTINGS    = "view.themesOpenSetting";     // MenuCommands.js              Settings.open()

    /** Toggles sidebar visibility */
    exports.VIEW_HIDE_SIDEBAR           = "view.toggleSidebar";         // SidebarView.js               toggle()

    /** Toggles tabbar visibility */
    exports.TOGGLE_TABBAR            = "view.toggleTabbar";
    // extensionsIntegrated/TabBar/main.js

    /** Zooms in the editor view */
    exports.VIEW_ZOOM_IN                = "view.zoomIn";                // ViewCommandHandlers.js       _handleZoomIn()

    /** Zooms out the editor view */
    exports.VIEW_ZOOM_OUT               = "view.zoomOut";                // ViewCommandHandlers.js       _handleZoomOut()

    /** Submenu for zoom options */
    exports.VIEW_ZOOM_SUBMENU           = "zoom-view-submenu";

    /** Submenu for Open in project context menu */
    exports.OPEN_IN_SUBMENU             = "file-open-in-submenu";

    /** Submenu for Open in working set context menu */
    exports.OPEN_IN_SUBMENU_WS          = "file-open-in-submenu-ws";

    /** Increases editor font size */
    exports.VIEW_INCREASE_FONT_SIZE     = "view.increaseFontSize";      // ViewCommandHandlers.js       _handleIncreaseFontSize()

    /** Decreases editor font size */
    exports.VIEW_DECREASE_FONT_SIZE     = "view.decreaseFontSize";      // ViewCommandHandlers.js       _handleDecreaseFontSize()

    /** Restores editor font size to default */
    exports.VIEW_RESTORE_FONT_SIZE      = "view.restoreFontSize";       // ViewCommandHandlers.js       _handleRestoreFontSize()

    /** Scrolls editor view up by one line */
    exports.VIEW_SCROLL_LINE_UP         = "view.scrollLineUp";          // ViewCommandHandlers.js       _handleScrollLineUp()

    /** Scrolls editor view down by one line */
    exports.VIEW_SCROLL_LINE_DOWN       = "view.scrollLineDown";        // ViewCommandHandlers.js       _handleScrollLineDown()

    /** Toggles code inspection */
    exports.VIEW_TOGGLE_INSPECTION      = "view.toggleCodeInspection";  // CodeInspection.js            toggleEnabled()

    /** Toggles problems panel visibility */
    exports.VIEW_TOGGLE_PROBLEMS        = "view.toggleProblems";        // CodeInspection.js            toggleProblems()

    /** Toggles line numbers visibility */
    exports.TOGGLE_LINE_NUMBERS         = "view.toggleLineNumbers";     // EditorOptionHandlers.js      _getToggler()

    /** Toggles active line highlight */
    exports.TOGGLE_ACTIVE_LINE          = "view.toggleActiveLine";      // EditorOptionHandlers.js      _getToggler()

    /** Toggles word wrap */
    exports.TOGGLE_WORD_WRAP            = "view.toggleWordWrap";        // EditorOptionHandlers.js      _getToggler()

    /** Toggles rulers visibility */
    exports.TOGGLE_RULERS               = "view.toggleRulers";          // EditorOptionHandlers.js

    /** Toggles indent guides visibility */
    exports.TOGGLE_INDENT_GUIDES        = "view.toggleIndentGuides";    // integrated extension indentGuides

    /** Toggles search auto-hide behavior */
    exports.TOGGLE_SEARCH_AUTOHIDE      = "view.toggleSearchAutoHide";  // EditorOptionHandlers.js      _getToggler()

    /** Opens a file */
    exports.CMD_OPEN                        = "cmd.open";

    /** Adds file to working set and opens it */
    exports.CMD_ADD_TO_WORKINGSET_AND_OPEN  = "cmd.addToWorkingSetAndOpen";          // DocumentCommandHandlers.js   handleOpenDocumentInNewPane()

    // ADD_TO_WORKING_SET is deprectated but we need a handler for it because the new command doesn't return the same result as the legacy command
    exports.FILE_ADD_TO_WORKING_SET     = "file.addToWorkingSet";       // Deprecated through DocumentCommandHandlers.js handleFileAddToWorkingSet

    // NAVIGATE
    /** Goes to next document */
    exports.NAVIGATE_NEXT_DOC           = "navigate.nextDoc";           // DocumentCommandHandlers.js   handleGoNextDoc()

    /** Goes to previous document */
    exports.NAVIGATE_PREV_DOC           = "navigate.prevDoc";           // DocumentCommandHandlers.js   handleGoPrevDoc()

    /** Goes to next document in list order */
    exports.NAVIGATE_NEXT_DOC_LIST_ORDER    = "navigate.nextDocListOrder";           // DocumentCommandHandlers.js   handleGoNextDocListOrder()

    /** Goes to previous document in list order */
    exports.NAVIGATE_PREV_DOC_LIST_ORDER    = "navigate.prevDocListOrder";           // DocumentCommandHandlers.js   handleGoPrevDocListOrder()

    /** Shows current file in file tree */
    exports.NAVIGATE_SHOW_IN_FILE_TREE  = "navigate.showInFileTree";    // DocumentCommandHandlers.js   handleShowInTree()

    /** Shows current file in OS file explorer */
    exports.NAVIGATE_SHOW_IN_OS         = "navigate.showInOS";          // DocumentCommandHandlers.js   handleShowInOS()

    /** Shows current file in OS Terminal */
    exports.NAVIGATE_OPEN_IN_TERMINAL         = "navigate.openInTerminal";

    /** Shows current file in open powershell in Windows os */
    exports.NAVIGATE_OPEN_IN_POWERSHELL         = "navigate.openInPowerShell";

    /** Open current file in the default associated app in the os */
    exports.NAVIGATE_OPEN_IN_DEFAULT_APP        = "navigate.openInDefaultApp";

    /** Opens quick open dialog */
    exports.NAVIGATE_QUICK_OPEN         = "navigate.quickOpen";         // QuickOpen.js                 doFileSearch()

    /** Jumps to definition of symbol at cursor */
    exports.NAVIGATE_JUMPTO_DEFINITION  = "navigate.jumptoDefinition";  // JumpToDefManager.js             _doJumpToDef()

    /** Opens go to definition search */
    exports.NAVIGATE_GOTO_DEFINITION    = "navigate.gotoDefinition";    // QuickOpen.js                 doDefinitionSearch()

    /** Opens go to definition in project search */
    exports.NAVIGATE_GOTO_DEFINITION_PROJECT = "navigate.gotoDefinitionInProject";    // QuickOpen.js                 doDefinitionSearchInProject()

    /** Opens go to line dialog */
    exports.NAVIGATE_GOTO_LINE          = "navigate.gotoLine";          // QuickOpen.js                 doGotoLine()

    /** Goes to first problem in current file */
    exports.NAVIGATE_GOTO_FIRST_PROBLEM = "navigate.gotoFirstProblem";  // CodeInspection.js            handleGotoFirstProblem()

    /** Goes to next problem in current file */
    exports.NAVIGATE_GOTO_NEXT_PROBLEM = "navigate.gotoNextProblem";  // CodeInspection.js            handleGotoNextProblem()

    /** Goes to previous problem in current file */
    exports.NAVIGATE_GOTO_PREV_PROBLEM = "navigate.gotoPrevProblem";  // CodeInspection.js            handleGotoPrevProblem()

    /** Toggles quick edit widget */
    exports.TOGGLE_QUICK_EDIT           = "navigate.toggleQuickEdit";   // EditorManager.js             _toggleInlineWidget()

    /** Toggles quick docs widget */
    exports.TOGGLE_QUICK_DOCS           = "navigate.toggleQuickDocs";   // EditorManager.js             _toggleInlineWidget()

    /** Goes to next match in quick edit */
    exports.QUICK_EDIT_NEXT_MATCH       = "navigate.nextMatch";         // MultiRangeInlineEditor.js    _nextRange()

    /** Goes to previous match in quick edit */
    exports.QUICK_EDIT_PREV_MATCH       = "navigate.previousMatch";     // MultiRangeInlineEditor.js    _previousRange()

    /** Creates new CSS rule in quick edit */
    exports.CSS_QUICK_EDIT_NEW_RULE     = "navigate.newRule";           // CSSInlineEditor.js           _handleNewRule()


    // HELP
    /** Opens how to use Brackets guide */
    exports.HELP_HOW_TO_USE_BRACKETS    = "help.howToUseBrackets";      // HelpCommandHandlers.js       _handleLinkMenuItem()

    /** Opens documentation */
    exports.HELP_DOCS                   = "help.docs";                  // HelpCommandHandlers.js       _handleLinkMenuItem()

    /** Opens support resources */
    exports.HELP_SUPPORT                = "help.support";               // HelpCommandHandlers.js       _handleLinkMenuItem()

    /** Opens Phoenix Pro page */
    exports.HELP_GET_PRO                = "help.getPro";                // HelpCommandHandlers.js       _handleLinkMenuItem()

    /** Cancels Phoenix Pro trial */
    exports.HELP_CANCEL_TRIAL           = "help.cancelTrial";

    /** Opens Phoenix License page */
    exports.HELP_VIEW_LICENSE           = "help.viewLicense";           // HelpCommandHandlers.js       _handleLinkMenuItem()

    /** Manage Pro licenses */
    exports.HELP_MANAGE_LICENSES        = "help.manageLicenses";        // HelpCommandHandlers.js       _handleLinkMenuItem()

    /** Opens feature suggestion page */
    exports.HELP_SUGGEST                = "help.suggest";               // HelpCommandHandlers.js       _handleLinkMenuItem()

    /** Opens report issue page */
    exports.HELP_REPORT_ISSUE           = "help.reportIssue";               // HelpCommandHandlers.js       _handleLinkMenuItem()

    /** Opens release notes */
    exports.HELP_RELEASE_NOTES          = "help.releaseNotes";          // HelpCommandHandlers.js       _handleLinkMenuItem()

    /** Opens contributor guidelines */
    exports.HELP_GET_INVOLVED           = "help.getInvolved";           // HelpCommandHandlers.js       _handleLinkMenuItem()

    /** Shows extensions folder in OS */
    exports.HELP_SHOW_EXT_FOLDER        = "help.showExtensionsFolder";  // HelpCommandHandlers.js       _handleShowExtensionsFolder()

    /** Opens project homepage */
    exports.HELP_HOMEPAGE               = "help.homepage";              // HelpCommandHandlers.js       _handleLinkMenuItem()

    /** Opens YouTube channel */
    exports.HELP_YOUTUBE                = "help.youtube";               // HelpCommandHandlers.js       _handleLinkMenuItem()

    /** Opens Twitter page */
    exports.HELP_TWITTER                = "help.twitter";               // HelpCommandHandlers.js       _handleLinkMenuItem()

    /** Toggles keyboard shortcuts panel */
    exports.HELP_TOGGLE_SHORTCUTS_PANEL = "help.toggleShortcuts";       // shortcuts integrated extension

    /** Checks for updates */
    exports.HELP_CHECK_UPDATES          = "help.checkUpdates";          // shortcuts integrated extension

    /** Toggles auto update */
    exports.HELP_AUTO_UPDATE            = "help.autoUpdate";             // shortcuts integrated extension

    // Working Set Configuration
    /** Sorts working set by order files were added */
    exports.CMD_WORKINGSET_SORT_BY_ADDED  = "cmd.sortWorkingSetByAdded";     // WorkingSetSort.js       _handleSort()

    /** Sorts working set by file name */
    exports.CMD_WORKINGSET_SORT_BY_NAME   = "cmd.sortWorkingSetByName";      // WorkingSetSort.js       _handleSort()

    /** Sorts working set by file type */
    exports.CMD_WORKINGSET_SORT_BY_TYPE   = "cmd.sortWorkingSetByType";      // WorkingSetSort.js       _handleSort()

    /** Toggles automatic working set sorting */
    exports.CMD_WORKING_SORT_TOGGLE_AUTO  = "cmd.sortWorkingSetToggleAuto";  // WorkingSetSort.js       _handleToggleAutoSort()

    /** Toggles working set visibility */
    exports.CMD_TOGGLE_SHOW_WORKING_SET  = "cmd.toggleShowWorkingSet";      // SidebarView.js       _handleToggleWorkingSet()

    /** Toggles file tabs visibility */
    exports.CMD_TOGGLE_SHOW_FILE_TABS  = "cmd.toggleShowFileTabs";          // SidebarView.js       _handleToggleFileTabs()

    /** Opens keyboard navigation UI overlay */
    exports.CMD_KEYBOARD_NAV_UI_OVERLAY  = "cmd.keyboardNavUI";  // WorkingSetSort.js       _handleToggleAutoSort()

    // Split View
    /** Removes split view */
    exports.CMD_SPLITVIEW_NONE          = "cmd.splitViewNone";          // SidebarView.js               _handleSplitNone()

    /** Splits view vertically */
    exports.CMD_SPLITVIEW_VERTICAL      = "cmd.splitViewVertical";      // SidebarView.js               _handleSplitVertical()

    /** Splits view horizontally */
    exports.CMD_SPLITVIEW_HORIZONTAL    = "cmd.splitViewHorizontal";    // SidebarView.js               _handleSplitHorizontal()

    /** Switches focus between split panes */
    exports.CMD_SWITCH_PANE_FOCUS       = "cmd.switchPaneFocus";        // MainViewManager.js           _switchPaneFocus()

    // File shell callbacks - string must MATCH string in native code (appshell/command_callbacks.h)
    /** Shows about dialog */
    exports.HELP_ABOUT                  = "help.about";                 // HelpCommandHandlers.js       _handleAboutDialog()

    // APP
    /** Reloads the application */
    exports.APP_RELOAD                  = "app.reload";                 // DocumentCommandHandlers.js   handleReload()

    /** Reloads the application without extensions */
    exports.APP_RELOAD_WITHOUT_EXTS     = "app.reload_without_exts";    // DocumentCommandHandlers.js   handleReloadWithoutExts()

    // File shell callbacks - string must MATCH string in native code (appshell/command_callbacks.h)
    /** Aborts application quit */
    exports.APP_ABORT_QUIT              = "app.abort_quit";             // DocumentCommandHandlers.js   handleAbortQuit()

    /** Handler before menu popup */
    exports.APP_BEFORE_MENUPOPUP        = "app.before_menupopup";       // DocumentCommandHandlers.js   handleBeforeMenuPopup()

    // Show or Hide sidebar
    /** Hides the sidebar */
    exports.HIDE_SIDEBAR                = "view.hideSidebar";           // SidebarView.js               hide()

    /** Shows the sidebar */
    exports.SHOW_SIDEBAR                = "view.showSidebar";           // SidebarView.js               show()

    /** Reinstalls credentials in keychain */
    exports.REINSTALL_CREDS             = "debug.reinstallCreds";       // login-service.js             handleReinstallCreds()

    // commands
    /** Initializes a new git repository */
    exports.CMD_GIT_INIT = "git-init";

    /** Clones a git repository */
    exports.CMD_GIT_CLONE = "git-clone";

    /** Clones a git repository with a specific URL */
    exports.CMD_GIT_CLONE_WITH_URL = "git-clone-url";

    /** Opens git settings */
    exports.CMD_GIT_SETTINGS_COMMAND_ID = "git-settings";

    /** Closes unmodified files */
    exports.CMD_GIT_CLOSE_UNMODIFIED = "git-close-unmodified-files";

    /** Checks out a branch or commit */
    exports.CMD_GIT_CHECKOUT = "git-checkout";

    /** Performs a hard reset */
    exports.CMD_GIT_RESET_HARD = "git-reset-hard";

    /** Performs a soft reset */
    exports.CMD_GIT_RESET_SOFT = "git-reset-soft";

    /** Performs a mixed reset */
    exports.CMD_GIT_RESET_MIXED = "git-reset-mixed";

    /** Toggles the git panel */
    exports.CMD_GIT_TOGGLE_PANEL = "git-toggle-panel";

    /** Goes to next git change */
    exports.CMD_GIT_GOTO_NEXT_CHANGE = "git-gotoNextChange";

    /** Goes to previous git change */
    exports.CMD_GIT_GOTO_PREVIOUS_CHANGE = "git-gotoPrevChange";

    /** Commits current file changes */
    exports.CMD_GIT_COMMIT_CURRENT = "git-commitCurrent";

    /** Commits all changes */
    exports.CMD_GIT_COMMIT_ALL = "git-commitAll";

    /** Fetches from remote */
    exports.CMD_GIT_FETCH = "git-fetch";

    /** Pulls from remote */
    exports.CMD_GIT_PULL = "git-pull";

    /** Pushes to remote */
    exports.CMD_GIT_PUSH = "git-push";

    /** Refreshes git status */
    exports.CMD_GIT_REFRESH = "git-refresh";

    /** Creates a git tag */
    exports.CMD_GIT_TAG = "git-tag";

    /** Discards all changes */
    exports.CMD_GIT_DISCARD_ALL_CHANGES = "git-discard-all-changes";

    /** Undoes the last commit */
    exports.CMD_GIT_UNDO_LAST_COMMIT = "git-undo-last-commit";

    /** Changes git username */
    exports.CMD_GIT_CHANGE_USERNAME = "git-change-username";

    /** Changes git email */
    exports.CMD_GIT_CHANGE_EMAIL = "git-change-email";

    /** Pushes to Gerrit code review */
    exports.CMD_GIT_GERRIT_PUSH_REF = "git-gerrit-push_ref";

    /** Shows authors of selected code */
    exports.CMD_GIT_AUTHORS_OF_SELECTION = "git-authors-of-selection";

    /** Shows authors of current file */
    exports.CMD_GIT_AUTHORS_OF_FILE = "git-authors-of-file";

    /** Toggles display of untracked files */
    exports.CMD_GIT_TOGGLE_UNTRACKED = "git-toggle-untracked";

    /** Toggles global history view in history panel */
    exports.CMD_GIT_HISTORY_GLOBAL = "git-history-global";

    /** Toggles file history view in history panel */
    exports.CMD_GIT_HISTORY_FILE = "git-history-file";

    // DEPRECATED: Working Set Commands
    DeprecationWarning.deprecateConstant(exports, "SORT_WORKINGSET_BY_ADDED",   "CMD_WORKINGSET_SORT_BY_ADDED");
    DeprecationWarning.deprecateConstant(exports, "SORT_WORKINGSET_BY_NAME",    "CMD_WORKINGSET_SORT_BY_NAME");
    DeprecationWarning.deprecateConstant(exports, "SORT_WORKINGSET_BY_TYPE",    "CMD_WORKINGSET_SORT_BY_TYPE");
    DeprecationWarning.deprecateConstant(exports, "SORT_WORKINGSET_AUTO",       "CMD_WORKING_SORT_TOGGLE_AUTO");
});
