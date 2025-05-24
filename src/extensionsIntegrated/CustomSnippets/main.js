define(function (require, exports, module) {
    const AppInit = require("utils/AppInit");
    const CommandManager = require("command/CommandManager");
    const Menus = require("command/Menus");
    const Commands = require("command/Commands");
    const WorkspaceManager = require("view/WorkspaceManager");

    const Driver = require("./src/driver");
    const SnippetsList = require("./src/snippetsList");
    const SnippetCodeHints = require("./src/snippetCodeHints");
    const Helper = require("./src/helper");
    const UIHelper = require("./src/UIHelper");

    const snippetsPanelTpl = require("text!./htmlContent/snippets-panel.html");
    // the html content of the panel will be stored in this variable
    let $snippetsPanel;

    const MY_COMMAND_ID = "custom_snippets";
    const PANEL_ID = "customSnippets.panel";
    const MENU_ITEM_NAME = "Custom Snippets..."; // this name will appear as the menu item
    const PANEL_MIN_SIZE = 100; // the minimum size more than which its height cannot be decreased

    // this is to store the panel reference,
    // as we only need to create this once. rest of the time we can just toggle the visibility of the panel
    let customSnippetsPanel;

    /**
     * This function is called when the first time the custom snippets panel button is clicked
     * this is responsible to create the custom snippets bottom panel and show that
     * @private
     */
    function _createPanel() {
        customSnippetsPanel = WorkspaceManager.createBottomPanel(PANEL_ID, $snippetsPanel, PANEL_MIN_SIZE);
        customSnippetsPanel.show();

        // also register the handlers
        _registerHandlers();
    }

    /**
     * This function is responsible to toggle the visibility of the panel
     * this is called every time (after the panel is created) to show/hide the panel
     * @private
     */
    function _togglePanelVisibility() {
        if (customSnippetsPanel.isVisible()) {
            customSnippetsPanel.hide();
        } else {
            customSnippetsPanel.show();
        }
    }

    /**
     * This function is responsible to hide the panel
     * this is called when user clicks on the 'cross' icon inside the panel itself and that is the reason,
     * why we don't need to check whether the panel is visible or not
     * @private
     */
    function _hidePanel() {
        customSnippetsPanel.hide();
    }

    /**
     * This function is responsible to create the bottom panel, if not created
     * if panel is already created, we just toggle its visibility
     * this will be called when the custom snippets menu item is clicked from the menu bar
     */
    function showCustomSnippetsPanel() {
        // make sure that the panel is not created,
        // if it is then we can just toggle its visibility
        if (!customSnippetsPanel) {
            _createPanel();
        } else {
            _togglePanelVisibility();
        }
    }

    /**
     * This function is responsible to add the Custom Snippets menu item to the menu bar
     * @private
     */
    function _addToMenu() {
        const menu = Menus.getMenu(Menus.AppMenuBar.FILE_MENU);
        menu.addMenuItem(MY_COMMAND_ID, "", Menus.BEFORE, Commands.FILE_EXTENSION_MANAGER);
    }

    /**
     * This function is responsible to register all the required handlers
     * @private
     */
    function _registerHandlers() {
        const $closePanelBtn = $("#close-custom-snippets-panel-btn");
        const $saveCustomSnippetBtn = $("#save-custom-snippet-btn");
        const $abbrInput = $("#abbr-box");
        const $templateInput = $("#template-text-box");
        const $addSnippetBtn = $("#add-snippet-btn");
        const $addNewSnippetBtn = $("#add-new-snippet-btn");
        const $backToListMenuBtn = $("#back-to-list-menu-btn");

        $addSnippetBtn.on("click", function () {
            UIHelper.showAddSnippetMenu();
        });

        $addNewSnippetBtn.on("click", function () {
            UIHelper.showAddSnippetMenu();
        });

        $backToListMenuBtn.on("click", function () {
            UIHelper.showSnippetListMenu();
            SnippetsList.showSnippetsList();
        });

        $closePanelBtn.on("click", function () {
            _hidePanel();
        });

        $saveCustomSnippetBtn.on("click", function () {
            Driver.handleSaveBtnClick();
        });

        $abbrInput.on("input", Helper.toggleSaveButtonDisability);
        $templateInput.on("input", Helper.toggleSaveButtonDisability);
    }

    AppInit.appReady(function () {
        CommandManager.register(MENU_ITEM_NAME, MY_COMMAND_ID, showCustomSnippetsPanel);
        $snippetsPanel = $(snippetsPanelTpl);
        _addToMenu();
        SnippetCodeHints.init();
        SnippetsList.showSnippetsList();
    });
});
