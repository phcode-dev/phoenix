define(function (require, exports, module) {
    const AppInit = require("utils/AppInit");
    const CommandManager = require("command/CommandManager");
    const Menus = require("command/Menus");
    const Strings = require("strings");

    const Bookmarks = require("./src/bookmarks");

    // command ids
    const CMD_TOGGLE_BOOKMARK = "bookmarks.toggleBookmark";
    const CMD_NEXT_BOOKMARK = "bookmarks.nextBookmark";
    const CMD_PREV_BOOKMARK = "bookmarks.prevBookmark";

    // default keyboard shortcuts
    const TOGGLE_BOOKMARK_KB_SHORTCUT = "Ctrl-Alt-B";
    const NEXT_BOOKMARK_KB_SHORTCUT = "Ctrl-Alt-N";
    const PREV_BOOKMARK_KB_SHORTCUT = "Ctrl-Alt-P";

    /**
     * This function is responsible for registering all the required commands
     */
    function _registerCommands() {
        CommandManager.register(Strings.TOGGLE_BOOKMARK, CMD_TOGGLE_BOOKMARK, Bookmarks.toggleBookmark);
        CommandManager.register(Strings.GOTO_NEXT_BOOKMARK, CMD_NEXT_BOOKMARK, Bookmarks.goToNextBookmark);
        CommandManager.register(Strings.GOTO_PREV_BOOKMARK, CMD_PREV_BOOKMARK, Bookmarks.goToPrevBookmark);
    }

    /**
     * This function is responsible to add the bookmarks menu items to the navigate menu
     */
    function _addItemsToMenu() {
        const navigateMenu = Menus.getMenu(Menus.AppMenuBar.NAVIGATE_MENU);
        navigateMenu.addMenuDivider(); // add a line to separate the other items from the bookmark ones

        navigateMenu.addMenuItem(CMD_TOGGLE_BOOKMARK, TOGGLE_BOOKMARK_KB_SHORTCUT);
        navigateMenu.addMenuItem(CMD_NEXT_BOOKMARK, NEXT_BOOKMARK_KB_SHORTCUT);
        navigateMenu.addMenuItem(CMD_PREV_BOOKMARK, PREV_BOOKMARK_KB_SHORTCUT);
    }

    function init() {
        _registerCommands();
        _addItemsToMenu();
    }

    AppInit.appReady(function () {
        init();
    });
});
