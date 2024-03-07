/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global Phoenix*/

/**
 * Initializes the default brackets menu items.
 */
define(function (require, exports, module) {


    var AppInit         = require("utils/AppInit"),
        Commands        = require("command/Commands"),
        Menus           = require("command/Menus"),
        Strings         = require("strings"),
        MainViewManager = require("view/MainViewManager"),
        CommandManager  = require("command/CommandManager");

    /**
     * Disables menu items present in items if enabled is true.
     * enabled is true if file is saved and present on user system.
     * @param {boolean} enabled
     * @param {array} items
     */
    function _setContextMenuItemsVisible(enabled, items) {
        items.forEach(function (item) {
            CommandManager.get(item).setEnabled(enabled);
        });
    }

    /**
     * Checks if file saved and present on system and
     * disables menu items accordingly
     */
    function _setMenuItemsVisible() {
        var file = MainViewManager.getCurrentlyViewedFile(MainViewManager.ACTIVE_PANE);
        if (file) {
            file.exists(function (err, isPresent) {
                if (err) {
                    return err;
                }
                _setContextMenuItemsVisible(isPresent, [Commands.FILE_RENAME,
                    Commands.NAVIGATE_SHOW_IN_FILE_TREE, Commands.NAVIGATE_SHOW_IN_OS]);
            });
        }
    }

    const isBrowser = !Phoenix.browser.isTauri;
    const isDesktop = Phoenix.browser.isTauri;
    const fileNewShortcut = isDesktop ? "Ctrl-N" : ""; // Ctrl-1 universal shortcut is set in keyboard.json
    //`Ctrl-Shift-N` - desktop only. In browser, use can do `ctrl-T` and type phcode.dev using browser shortcuts itself. So we dont make a browser shortcut for this.
    const fileNewWindowShortcut = isDesktop ? "Ctrl-Shift-N" : "";
    const fileCloseShortcut = isDesktop ? "Ctrl-W" : ""; // Ctrl-` universal shortcut is set in keyboard.json
    // In browser open file option is not available, so we assign ctrl-o to open folder in browser
    // open folder has no shortcut in desktop, as this is not a frequently used workflow
    // and only ever used when the user opens a project once in a while.
    const fileCloseAllShortcut = isDesktop ? "Ctrl-Shift-W" : ""; // Ctrl-Alt-Shift-W` universal shortcut is set in keyboard.json
    const openFileShortcut = isDesktop ? "Ctrl-O" : "";
    const openFolderShortcut = isBrowser ? "Ctrl-O" : "";

    AppInit.htmlReady(function () {
        /**
         * Rules to follow when figuring out default shortcuts:
         * 1. Default shortcuts should only be applied for frequently used workflows. If it's rarely used like
         *    opening a project, etc., we should not allocate a shortcut. Ideally, assign a shortcut if the user is likely
         *    to use it several times in a five-minute window.
         * 2. In Windows, shortcuts cannot start with a `Ctrl-Alt-<something>` as it's reserved for special OS functionalities. See wiki.
         * 3. In macOS, shortcuts can't start with a single Alt-key combo as it's used for unicode typing in Eastern European languages.
         * 3. Maintain Consistency Across Browser and Desktop Applications: Shortcuts should offer a uniform experience
         *    in both browser-based and desktop environments, even when accounting for platform-specific restrictions.
         *    For instance, 'Ctrl-N' is used for creating a new file in the desktop, but this shortcut
         *    is reserved by the browser, an alternative like 'Ctrl-1' can was used in the browser. To ensure
         *    consistency, the same 'Ctrl-1' shortcut was also be enabled for creating a new file in the desktop
         *    app along with `Ctrl-N`. This approach helps users experience predictable across different platforms.
         *
         * Additional considerations:
         * 4. Avoid conflicts with standard OS shortcuts: Ensure that the chosen shortcuts do not conflict with common
         *    operating system shortcuts. For instance, shortcuts like Alt-F4 in Windows or Cmd-Q in macOS are universally
         *    used for closing applications and should not be overridden.
         * 6. Consistency with similar applications: Where possible, align shortcuts with those used in similar applications
         *    to reduce the learning curve for new users. For example, using Ctrl/Cmd + S for 'save' is a widely recognized standard.
         * 7. Avoid overloading single keys with multiple modifiers: Combining too many modifier keys (like Ctrl-Shift-Alt-Cmd-K)
         *    can make shortcuts hard to remember and physically challenging to perform.
         * 8. Localization and Internationalization: Be aware of how shortcuts might interact with different keyboard layouts
         *    and languages. For example, what is convenient on a QWERTY keyboard might not be on AZERTY or QWERTZ.
         * 9. User Customization: Allow users to customize or reassign shortcuts, as personal preferences and workflows vary.
         *    This also helps users resolve any unforeseen conflicts with other software they use.
         * 10. Document Shortcuts: See keyboard.json for most shortcuts. Other shortcuts may be set programmatically
         *    by the phoenix extensions.
         **/

        var menu;
        menu = Menus.addMenu(Strings.FILE_MENU, Menus.AppMenuBar.FILE_MENU);
        menu.addMenuItem(Commands.FILE_NEW, fileNewShortcut);
        menu.addMenuItem(Commands.FILE_NEW_FOLDER);
        menu.addMenuItem(Commands.FILE_NEW_WINDOW, fileNewWindowShortcut);
        menu.addMenuDivider();
        if(Phoenix.browser.isTauri){
            menu.addMenuItem(Commands.FILE_OPEN, openFileShortcut);
        }
        menu.addMenuItem(Commands.FILE_OPEN_FOLDER, openFolderShortcut);
        menu.addMenuItem(Commands.FILE_CLOSE, fileCloseShortcut);
        menu.addMenuItem(Commands.FILE_CLOSE_ALL, fileCloseAllShortcut);
        menu.addMenuDivider();
        menu.addMenuItem(Commands.FILE_SAVE);
        menu.addMenuItem(Commands.FILE_SAVE_ALL);
        menu.addMenuItem(Commands.FILE_DUPLICATE_FILE);
        menu.addMenuItem(Commands.FILE_DOWNLOAD_PROJECT, undefined, undefined, undefined, {
            hideWhenCommandDisabled: true
        });
        // menu.addMenuItem(Commands.FILE_SAVE_AS); not yet available in phoenix
        // menu.addMenuItem(Commands.FILE_PROJECT_SETTINGS); not yet available in phoenix
        menu.addMenuDivider();
        menu.addMenuItem(Commands.FILE_EXTENSION_MANAGER);
        if(Phoenix.browser.isTauri){
            menu.addMenuDivider();
            menu.addMenuItem(Commands.FILE_QUIT);
        }

        /*
         * Edit  menu
         */
        menu = Menus.addMenu(Strings.EDIT_MENU, Menus.AppMenuBar.EDIT_MENU);
        menu.addMenuItem(Commands.EDIT_UNDO);
        menu.addMenuItem(Commands.EDIT_REDO);
        menu.addMenuDivider();

        // TODO: add js handlers for copy and paste using browser standards.
        menu.addMenuItem(Commands.EDIT_CUT);
        menu.addMenuItem(Commands.EDIT_COPY);
        if(window.Phoenix.browser.isTauri || !window.Phoenix.browser.desktop.isFirefox){
            menu.addMenuItem(Commands.EDIT_PASTE);
        }
        menu.addMenuDivider();

        menu.addMenuItem(Commands.EDIT_SELECT_ALL);
        menu.addMenuItem(Commands.EDIT_SELECT_LINE);
        menu.addMenuItem(Commands.EDIT_SPLIT_SEL_INTO_LINES);
        menu.addMenuItem(Commands.EDIT_ADD_CUR_TO_PREV_LINE);
        menu.addMenuItem(Commands.EDIT_ADD_CUR_TO_NEXT_LINE);
        menu.addMenuDivider();
        menu.addMenuItem(Commands.EDIT_INDENT);
        menu.addMenuItem(Commands.EDIT_UNINDENT);
        menu.addMenuItem(Commands.EDIT_DUPLICATE);
        menu.addMenuItem(Commands.EDIT_DELETE_LINES);
        menu.addMenuItem(Commands.EDIT_LINE_UP);
        menu.addMenuItem(Commands.EDIT_LINE_DOWN);
        menu.addMenuDivider();
        menu.addMenuItem(Commands.EDIT_LINE_COMMENT);
        menu.addMenuItem(Commands.EDIT_BLOCK_COMMENT);
        menu.addMenuDivider();
        menu.addMenuItem(Commands.SHOW_CODE_HINTS);
        menu.addMenuDivider();
        menu.addMenuItem(Commands.TOGGLE_CLOSE_BRACKETS);

        /*
         * Find menu
         */
        menu = Menus.addMenu(Strings.FIND_MENU, Menus.AppMenuBar.FIND_MENU);
        menu.addMenuItem(Commands.CMD_FIND);
        menu.addMenuItem(Commands.CMD_FIND_NEXT);
        menu.addMenuItem(Commands.CMD_FIND_PREVIOUS);
        menu.addMenuItem(Commands.CMD_ADD_NEXT_MATCH);
        menu.addMenuItem(Commands.CMD_FIND_ALL_AND_SELECT);
        menu.addMenuItem(Commands.CMD_SKIP_CURRENT_MATCH);
        menu.addMenuDivider();
        menu.addMenuItem(Commands.CMD_FIND_IN_FILES);
        menu.addMenuItem(Commands.CMD_FIND_ALL_REFERENCES);
        menu.addMenuDivider();
        menu.addMenuItem(Commands.CMD_REPLACE);
        menu.addMenuItem(Commands.CMD_REPLACE_IN_FILES);

        /*
         * View menu
         */
        menu = Menus.addMenu(Strings.VIEW_MENU, Menus.AppMenuBar.VIEW_MENU);
        menu.addMenuItem(Commands.CMD_THEMES_OPEN_SETTINGS);
        menu.addMenuDivider();
        menu.addMenuItem(Commands.CMD_SPLITVIEW_NONE);
        menu.addMenuItem(Commands.CMD_SPLITVIEW_VERTICAL);
        menu.addMenuItem(Commands.CMD_SPLITVIEW_HORIZONTAL);
        menu.addMenuDivider();
        menu.addMenuItem(Commands.VIEW_HIDE_SIDEBAR);
        menu.addMenuItem(Commands.TOGGLE_SEARCH_AUTOHIDE);
        menu.addMenuDivider();
        let subMenu = menu.addSubMenu(Strings.CMD_ZOOM_UI, Commands.VIEW_ZOOM_SUBMENU);
        subMenu.addMenuItem(Commands.VIEW_ZOOM_IN);
        subMenu.addMenuItem(Commands.VIEW_ZOOM_OUT);
        subMenu.addMenuItem(Commands.VIEW_INCREASE_FONT_SIZE);
        subMenu.addMenuItem(Commands.VIEW_DECREASE_FONT_SIZE);
        subMenu.addMenuItem(Commands.VIEW_RESTORE_FONT_SIZE);
        menu.addMenuDivider();
        menu.addMenuItem(Commands.TOGGLE_ACTIVE_LINE);
        menu.addMenuItem(Commands.TOGGLE_LINE_NUMBERS);
        menu.addMenuItem(Commands.TOGGLE_WORD_WRAP);
        menu.addMenuDivider();
        menu.addMenuItem(Commands.FILE_LIVE_HIGHLIGHT);
        menu.addMenuDivider();
        menu.addMenuItem(Commands.VIEW_TOGGLE_INSPECTION);

        /*
         * Navigate menu
         */
        menu = Menus.addMenu(Strings.NAVIGATE_MENU, Menus.AppMenuBar.NAVIGATE_MENU);
        menu.addMenuItem(Commands.NAVIGATE_QUICK_OPEN);
        menu.addMenuItem(Commands.NAVIGATE_GOTO_LINE);
        menu.addMenuItem(Commands.NAVIGATE_GOTO_DEFINITION);
        menu.addMenuItem(Commands.NAVIGATE_GOTO_DEFINITION_PROJECT);
        menu.addMenuItem(Commands.NAVIGATE_JUMPTO_DEFINITION);
        menu.addMenuItem(Commands.NAVIGATE_GOTO_FIRST_PROBLEM);
        menu.addMenuDivider();
        menu.addMenuItem(Commands.NAVIGATE_NEXT_DOC);
        menu.addMenuItem(Commands.NAVIGATE_PREV_DOC);
        menu.addMenuItem(Commands.NAVIGATE_NEXT_DOC_LIST_ORDER);
        menu.addMenuItem(Commands.NAVIGATE_PREV_DOC_LIST_ORDER);
        menu.addMenuDivider();
        menu.addMenuItem(Commands.NAVIGATE_SHOW_IN_FILE_TREE);
        menu.addMenuDivider();
        menu.addMenuItem(Commands.TOGGLE_QUICK_EDIT);
        menu.addMenuItem(Commands.QUICK_EDIT_PREV_MATCH);
        menu.addMenuItem(Commands.QUICK_EDIT_NEXT_MATCH);
        menu.addMenuItem(Commands.CSS_QUICK_EDIT_NEW_RULE);
        menu.addMenuDivider();
        menu.addMenuItem(Commands.TOGGLE_QUICK_DOCS);

        /*
         * Help menu
         */
        menu = Menus.addMenu(Strings.HELP_MENU, Menus.AppMenuBar.HELP_MENU);
        if (brackets.config.support_url) {
            menu.addMenuItem(Commands.HELP_SUPPORT);
        }
        if (brackets.config.suggest_feature_url) {
            menu.addMenuItem(Commands.HELP_SUGGEST);
        }
        if (brackets.config.get_involved_url) {
            menu.addMenuItem(Commands.HELP_GET_INVOLVED);
        }

        var hasAboutItem = true;

        // Add final divider only if we have a homepage URL or twitter URL or about item
        if (hasAboutItem || brackets.config.homepage_url || brackets.config.twitter_url) {
            menu.addMenuDivider();
        }

        if (brackets.config.twitter_url) {
            menu.addMenuItem(Commands.HELP_TWITTER);
        }
        if (brackets.config.homepage_url) {
            menu.addMenuItem(Commands.HELP_HOMEPAGE);
        }
        if (hasAboutItem) {
            menu.addMenuItem(Commands.HELP_ABOUT);
        }

        /*
        * Debug menu
        */
        Menus.addMenu(Strings.DEBUG_MENU, Menus.AppMenuBar.DEBUG_MENU, Menus.BEFORE, Menus.AppMenuBar.HELP_MENU);

        /*
         * Context Menus
         */

        // WorkingSet context menu - Unlike most context menus, we can't attach
        // listeners here because the DOM nodes for each pane's working set are
        // created dynamically. Each WorkingSetView attaches its own listeners.
        var workingset_cmenu = Menus.registerContextMenu(Menus.ContextMenuIds.WORKING_SET_CONTEXT_MENU);
        workingset_cmenu.addMenuItem(Commands.FILE_SAVE);
        workingset_cmenu.addMenuItem(Commands.NAVIGATE_SHOW_IN_FILE_TREE);
        if(Phoenix.browser.isTauri){
            workingset_cmenu.addMenuItem(Commands.NAVIGATE_SHOW_IN_OS);
        }
        workingset_cmenu.addMenuDivider();
        workingset_cmenu.addMenuItem(Commands.FILE_COPY);
        workingset_cmenu.addMenuItem(Commands.FILE_COPY_PATH);
        workingset_cmenu.addMenuItem(Commands.FILE_DUPLICATE);
        workingset_cmenu.addMenuItem(Commands.FILE_DOWNLOAD, undefined, undefined, undefined, {
            hideWhenCommandDisabled: true
        });
        workingset_cmenu.addMenuDivider();
        workingset_cmenu.addMenuItem(Commands.FILE_RENAME);
        workingset_cmenu.addMenuItem(Commands.FILE_DELETE);
        workingset_cmenu.addMenuDivider();
        workingset_cmenu.addMenuItem(Commands.CMD_FIND_IN_SUBTREE);
        workingset_cmenu.addMenuItem(Commands.CMD_REPLACE_IN_SUBTREE);
        workingset_cmenu.addMenuDivider();
        workingset_cmenu.addMenuItem(Commands.FILE_CLOSE);

        var splitview_menu = Menus.registerContextMenu(Menus.ContextMenuIds.SPLITVIEW_MENU);
        splitview_menu.addMenuItem(Commands.CMD_SPLITVIEW_NONE);
        splitview_menu.addMenuItem(Commands.CMD_SPLITVIEW_VERTICAL);
        splitview_menu.addMenuItem(Commands.CMD_SPLITVIEW_HORIZONTAL);
        splitview_menu.addMenuDivider();
        splitview_menu.addMenuItem(Commands.CMD_WORKINGSET_SORT_BY_ADDED);
        splitview_menu.addMenuItem(Commands.CMD_WORKINGSET_SORT_BY_NAME);
        splitview_menu.addMenuItem(Commands.CMD_WORKINGSET_SORT_BY_TYPE);
        splitview_menu.addMenuDivider();
        splitview_menu.addMenuItem(Commands.CMD_WORKING_SORT_TOGGLE_AUTO);
        splitview_menu.addMenuItem(Commands.FILE_SHOW_FOLDERS_FIRST);

        var project_cmenu = Menus.registerContextMenu(Menus.ContextMenuIds.PROJECT_MENU);
        project_cmenu.addMenuItem(Commands.FILE_NEW);
        project_cmenu.addMenuItem(Commands.FILE_NEW_FOLDER);
        if(Phoenix.browser.isTauri){
            project_cmenu.addMenuItem(Commands.NAVIGATE_SHOW_IN_OS);
        }
        project_cmenu.addMenuDivider();
        project_cmenu.addMenuItem(Commands.FILE_CUT);
        project_cmenu.addMenuItem(Commands.FILE_COPY);
        project_cmenu.addMenuItem(Commands.FILE_COPY_PATH);
        project_cmenu.addMenuItem(Commands.FILE_DUPLICATE);
        project_cmenu.addMenuItem(Commands.FILE_PASTE);
        project_cmenu.addMenuItem(Commands.FILE_DOWNLOAD, undefined, undefined, undefined, {
            hideWhenCommandDisabled: true
        });
        project_cmenu.addMenuDivider();
        project_cmenu.addMenuItem(Commands.FILE_RENAME);
        project_cmenu.addMenuItem(Commands.FILE_DELETE);
        project_cmenu.addMenuDivider();
        project_cmenu.addMenuItem(Commands.CMD_FIND_IN_SUBTREE);
        project_cmenu.addMenuItem(Commands.CMD_REPLACE_IN_SUBTREE);
        project_cmenu.addMenuDivider();
        project_cmenu.addMenuItem(Commands.FILE_REFRESH);

        var editor_cmenu = Menus.registerContextMenu(Menus.ContextMenuIds.EDITOR_MENU);
        // editor_cmenu.addMenuItem(Commands.NAVIGATE_JUMPTO_DEFINITION);
        editor_cmenu.addMenuItem(Commands.TOGGLE_QUICK_EDIT);
        editor_cmenu.addMenuItem(Commands.TOGGLE_QUICK_DOCS);
        editor_cmenu.addMenuItem(Commands.NAVIGATE_JUMPTO_DEFINITION);
        editor_cmenu.addMenuItem(Commands.CMD_FIND_ALL_REFERENCES);
        editor_cmenu.addMenuDivider();
        editor_cmenu.addMenuItem(Commands.EDIT_CUT);
        editor_cmenu.addMenuItem(Commands.EDIT_COPY);
        if(window.Phoenix.browser.isTauri || !window.Phoenix.browser.desktop.isFirefox){
            editor_cmenu.addMenuItem(Commands.EDIT_PASTE);
        }
        editor_cmenu.addMenuDivider();
        editor_cmenu.addMenuItem(Commands.EDIT_SELECT_ALL);

        var inline_editor_cmenu = Menus.registerContextMenu(Menus.ContextMenuIds.INLINE_EDITOR_MENU);
        inline_editor_cmenu.addMenuItem(Commands.TOGGLE_QUICK_EDIT);
        inline_editor_cmenu.addMenuItem(Commands.EDIT_SELECT_ALL);
        inline_editor_cmenu.addMenuDivider();
        inline_editor_cmenu.addMenuItem(Commands.QUICK_EDIT_PREV_MATCH);
        inline_editor_cmenu.addMenuItem(Commands.QUICK_EDIT_NEXT_MATCH);

        /**
         * Context menu for code editors (both full-size and inline)
         * Auto selects the word the user clicks if the click does not occur over
         * an existing selection
         */
        $("#editor-holder").on("contextmenu", function (e) {
            require(["editor/EditorManager"], function (EditorManager) {
                if ($(e.target).parents(".CodeMirror-gutter").length !== 0) {
                    return;
                }

                // Note: on mousedown before this event, CodeMirror automatically checks mouse pos, and
                // if not clicking on a selection moves the cursor to click location. When triggered
                // from keyboard, no pre-processing occurs and the cursor/selection is left as is.

                var editor = EditorManager.getFocusedEditor(),
                    inlineWidget = EditorManager.getFocusedInlineWidget();

                if (editor) {
                    //if (!editor.hasSelection()) {
                        // Prevent menu from overlapping text by moving it down a little
                        // Temporarily backout this change for now to help mitigate issue #1111,
                        // which only happens if mouse is not over context menu. Better fix
                        // requires change to bootstrap, which is too risky for now.
                        //e.pageY += 6;
                    //}

                    // Inline text editors have a different context menu (safe to assume it's not some other
                    // type of inline widget since we already know an Editor has focus)
                    if (inlineWidget) {
                        inline_editor_cmenu.open(e);
                    } else {
                        editor_cmenu.open(e);
                    }
                }
            });
        });

        /**
         * Context menu for folder tree
         */
        $("#project-files-container").on("contextmenu", function (e) {
            project_cmenu.open(e);
        });

        // Dropdown menu for view splitting
        Menus.ContextMenu.assignContextMenuToSelector(".working-set-splitview-btn", splitview_menu);

        // Prevent the browser context menu since Brackets creates a custom context menu
        $(window).contextmenu(function (e) {
            e.preventDefault();
        });

        /*
         * General menu event processing
         */
        // Prevent clicks on top level menus and menu items from taking focus
        $(window.document).on("mousedown", ".dropdown", function (e) {
            e.preventDefault();
        });

        // Switch menus when the mouse enters an adjacent menu
        // Only open the menu if another one has already been opened
        // by clicking
        $(window.document).on("mouseenter", "#titlebar .dropdown", function (e) {
            var open = $(this).siblings(".open");
            if (open.length > 0) {
                open.removeClass("open");
                $(this).addClass("open");
            }
        });
        // Check the visibility of context menu items before opening the context menu.
        // 'Rename', 'Show in file tree' and 'Show in explorer' items will be disabled for files that have not yet been saved to disk.
        Menus.getContextMenu(Menus.ContextMenuIds.WORKING_SET_CONTEXT_MENU).on("beforeContextMenuOpen", _setMenuItemsVisible);
        Menus.getContextMenu(Menus.ContextMenuIds.PROJECT_MENU).on("beforeContextMenuOpen", _setMenuItemsVisible);
    });
});
