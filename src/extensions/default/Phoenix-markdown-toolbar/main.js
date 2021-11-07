/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, brackets */

define(function (require, exports, module) {
    "use strict";

    var CommandManager     = brackets.getModule("command/CommandManager"),
        EditorManager      = brackets.getModule("editor/EditorManager"),
        ExtensionUtils     = brackets.getModule("utils/ExtensionUtils"),
        KeyBindingManager  = brackets.getModule("command/KeyBindingManager"),
        Menus              = brackets.getModule("command/Menus"),
        ModalBar           = brackets.getModule("widgets/ModalBar").ModalBar,
        Mustache           = brackets.getModule("thirdparty/mustache/mustache"),
        PreferencesManager = brackets.getModule("preferences/PreferencesManager");

    var Handler = require("handler"),
        KeyboardPrefs = JSON.parse(require("text!keyboard.json")),
        Strings = require("strings"),
        _markdownBarTemplate = require("text!templates/markdown-bar.html");
    
    var prefs = PreferencesManager.getExtensionPrefs("markdownbar");

    var toolBar = null,
        barShouldShow = false,
        cmdToolbar = null;

    function registerCallbacks(toolBar) {
        var root = toolBar.getRoot();
        root.on("click", "#markdown-heading1", function () {
            Handler.h1();
        });
        root.on("click", "#markdown-heading2", function () {
            Handler.h2();
        });
        root.on("click", "#markdown-heading3", function () {
            Handler.h3();
        });
        root.on("click", "#markdown-heading4", function () {
            Handler.h4();
        });
        root.on("click", "#markdown-heading5", function () {
            Handler.h5();
        });
        root.on("click", "#markdown-heading6", function () {
            Handler.h6();
        });
        root.on("click", "#markdown-bold", function () {
            Handler.bold();
        });
        root.on("click", "#markdown-italic", function () {
            Handler.italic();
        });
        root.on("click", "#markdown-strikethrough", function () {
            Handler.strikethrough();
        });
        root.on("click", "#markdown-code", function () {
            Handler.code();
        });
        root.on("click", "#markdown-bullet", function () {
            Handler.bullet();
        });
        root.on("click", "#markdown-numbered", function () {
            Handler.numbered();
        });
        root.on("click", "#markdown-quote", function () {
            Handler.quote();
        });
        root.on("click", "#markdown-codeblock", function () {
            Handler.codeblock();
        });
        root.on("click", "#markdown-image", function () {
            Handler.image();
        });
        root.on("click", "#markdown-link", function () {
            Handler.link();
        });
        root.on("click", "#markdown-paragraph", function () {
            Handler.paragraph();
        });
        root.on("click", "#markdown-reflow", function () {
            Handler.reflow();
        });
    }
    
    function showBar() {
        if (!toolBar) {
            var templateVars = {
                Strings: Strings
            };
            toolBar = new ModalBar(Mustache.render(_markdownBarTemplate, templateVars), false);
            registerCallbacks(toolBar);
            cmdToolbar.setChecked(true);
        }
    }

    function closeBar() {
        if (toolBar) {
            toolBar.close();
            toolBar = null;
            cmdToolbar.setChecked(false);
        }
    }

    function toggleBar() {
        if (toolBar) {
            barShouldShow = false;
            closeBar();
        } else {
            barShouldShow = true;
            showBar();
        }
    }

    function activeEditorChangeHandler(event, activeEditor, previousEditor) {
        var mode = null;
        if (activeEditor && activeEditor.document) {
            mode = activeEditor._getModeFromDocument();
        }
        if (mode === "gfm" || mode === "markdown") {
            cmdToolbar.setEnabled(true);
            if (barShouldShow) {
                showBar();
            }
        } else {
            cmdToolbar.setEnabled(false);
            closeBar();
        }
    }

    prefs.definePreference("showOnStartup", "boolean", false, {
        description: Strings.DESCRIPTION_SHOW_ON_STARTUP
    });

    prefs.definePreference("maxLength", "number", 80, {
        description: Strings.DESCRIPTION_MAX_LINE_LENGTH
    });

    var BAR_COMMAND_ID = "alanhohn.togglemarkdownbar",
        H1_COMMAND_ID = "alanhohn.markdownheading1",
        H2_COMMAND_ID = "alanhohn.markdownheading2",
        H3_COMMAND_ID = "alanhohn.markdownheading3",
        H4_COMMAND_ID = "alanhohn.markdownheading4",
        BOLD_COMMAND_ID = "alanhohn.markdownbold",
        ITALIC_COMMAND_ID = "alanhohn.markdownitalic",
        STRIKE_COMMAND_ID = "alanhohn.markdownstrike",
        CODE_COMMAND_ID = "alanhohn.markdowncode",
        BULLET_COMMAND_ID = "alanhohn.markdownbullet",
        NUMBERED_COMMAND_ID = "alanhohn.markdownnumbered",
        QUOTE_COMMAND_ID = "alanhohn.markdownquote",
        CODEBLOCK_COMMAND_ID = "alanhohn.markdowncodeblock",
        PARAGRAPH_COMMAND_ID = "alanhohn.markdownparagraph",
        REFLOW_COMMAND_ID = "alanhohn.markdownreflow";
    
    cmdToolbar = CommandManager.register(Strings.MENU_TOOLBAR, BAR_COMMAND_ID, toggleBar);
    var menu = Menus.getMenu(Menus.AppMenuBar.VIEW_MENU);
    menu.addMenuItem(BAR_COMMAND_ID, "Ctrl-Shift-T");

    CommandManager.register(Strings.HINT_H1, H1_COMMAND_ID, Handler.h1);
    CommandManager.register(Strings.HINT_H2, H2_COMMAND_ID, Handler.h2);
    CommandManager.register(Strings.HINT_H3, H3_COMMAND_ID, Handler.h3);
    CommandManager.register(Strings.HINT_H4, H4_COMMAND_ID, Handler.h4);
    CommandManager.register(Strings.HINT_BOLD, BOLD_COMMAND_ID, Handler.bold);
    CommandManager.register(Strings.HINT_ITALIC, ITALIC_COMMAND_ID, Handler.italic);
    CommandManager.register(Strings.HINT_STRIKE, STRIKE_COMMAND_ID, Handler.strikethrough);
    CommandManager.register(Strings.HINT_CODE, CODE_COMMAND_ID, Handler.code);
    CommandManager.register(Strings.HINT_BULLET, BULLET_COMMAND_ID, Handler.bullet);
    CommandManager.register(Strings.HINT_NUMBERED, NUMBERED_COMMAND_ID, Handler.numbered);
    CommandManager.register(Strings.HINT_QUOTE, QUOTE_COMMAND_ID, Handler.quote);
    CommandManager.register(Strings.HINT_CODEBLOCK, CODEBLOCK_COMMAND_ID, Handler.codeblock);
    CommandManager.register(Strings.HINT_PARAGRAPH, PARAGRAPH_COMMAND_ID, Handler.paragraph);
    CommandManager.register(Strings.HINT_REFLOW, REFLOW_COMMAND_ID, Handler.reflow);

    KeyBindingManager.addBinding(H1_COMMAND_ID, KeyboardPrefs.heading1);
    KeyBindingManager.addBinding(H2_COMMAND_ID, KeyboardPrefs.heading2);
    KeyBindingManager.addBinding(H3_COMMAND_ID, KeyboardPrefs.heading3);
    KeyBindingManager.addBinding(H4_COMMAND_ID, KeyboardPrefs.heading4);
    KeyBindingManager.addBinding(BOLD_COMMAND_ID, KeyboardPrefs.bold);
    KeyBindingManager.addBinding(ITALIC_COMMAND_ID, KeyboardPrefs.italic);
    KeyBindingManager.addBinding(STRIKE_COMMAND_ID, KeyboardPrefs.strikethrough);
    KeyBindingManager.addBinding(CODE_COMMAND_ID, KeyboardPrefs.code);
    KeyBindingManager.addBinding(BULLET_COMMAND_ID, KeyboardPrefs.bullet);
    KeyBindingManager.addBinding(NUMBERED_COMMAND_ID, KeyboardPrefs.numbered);
    KeyBindingManager.addBinding(QUOTE_COMMAND_ID, KeyboardPrefs.quote);
    KeyBindingManager.addBinding(CODEBLOCK_COMMAND_ID, KeyboardPrefs.codeblock);
    KeyBindingManager.addBinding(PARAGRAPH_COMMAND_ID, KeyboardPrefs.paragraph);
    KeyBindingManager.addBinding(REFLOW_COMMAND_ID, KeyboardPrefs.reflow);

    ExtensionUtils.loadStyleSheet(module, "styles/styles.css");
    ExtensionUtils.loadStyleSheet(module, "styles/octicons.css");
    
    if (prefs.get("showOnStartup")) {
        barShouldShow = true;
    }

    activeEditorChangeHandler(null, EditorManager.getActiveEditor(), null);
    EditorManager.on("activeEditorChange", activeEditorChangeHandler);

});
