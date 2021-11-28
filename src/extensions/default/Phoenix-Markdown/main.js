/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
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
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, brackets */
//jshint-ignore:no-start

define(function (require, exports, module) {


    var CommandManager     = brackets.getModule("command/CommandManager"),
        EditorManager      = brackets.getModule("editor/EditorManager"),
        ExtensionUtils     = brackets.getModule("utils/ExtensionUtils"),
        WorkspaceManager   = brackets.getModule("view/WorkspaceManager"),
        KeyBindingManager  = brackets.getModule("command/KeyBindingManager"),
        ModalBar           = brackets.getModule("widgets/ModalBar").ModalBar,
        Mustache           = brackets.getModule("thirdparty/mustache/mustache"),
        PreferencesManager = brackets.getModule("preferences/PreferencesManager"),
        AppInit            = brackets.getModule("utils/AppInit"),
        NativeApp          = brackets.getModule("utils/NativeApp"),
        DocumentManager    = brackets.getModule("document/DocumentManager"),
        FileUtils          = brackets.getModule("file/FileUtils"),
        MainViewManager    = brackets.getModule("view/MainViewManager"),
        PopUpManager       = brackets.getModule("widgets/PopUpManager"),
        _                  = brackets.getModule("thirdparty/lodash");

    var Handler = require("handler"),
        KeyboardPrefs = JSON.parse(require("text!keyboard.json")),
        Strings = require("strings");


    // Templates
    var panelHTML       = require("text!templates/panel.html"),
        previewHTML     = require("text!templates/preview.html"),
        settingsHTML    = require("text!templates/settings.html"),
        _markdownBarTemplate = require("text!templates/markdown-bar.html");

    var prefs = PreferencesManager.getExtensionPrefs("markdownbar");

    // Local modules
    var marked          = require("lib/marked");

    var toolBar = null,
        barShouldShow = false,
        cmdToolbar = null;

    // jQuery objects
    var $icon,
        $iframe,
        $panel,
        $settingsToggle,
        $settings;

    // Other vars
    var currentDoc,
        currentEditor,
        panel,
        toggleCmd,
        visible = false,
        realVisibility = false;

    // Prefs
    var _prefs = PreferencesManager.getExtensionPrefs("markdown-preview");
    _prefs.definePreference("useGFM", "boolean", false);
    _prefs.definePreference("theme", "string", "clean");
    _prefs.definePreference("syncScroll", "boolean", true);

    // (based on code in brackets.js)
    function _handleLinkClick(e) {
        // Check parents too, in case link has inline formatting tags
        var node = e.target, url;
        while (node) {
            if (node.tagName === "A") {
                url = node.getAttribute("href");
                if (url && !url.match(/^#/)) {
                    NativeApp.openURLInDefaultBrowser(url);
                }
                e.preventDefault();
                break;
            }
            node = node.parentElement;
        }

        // Close settings dropdown, if open
        _hideSettings();
    }

    function _calcScrollPos() {
        var scrollInfo = currentEditor._codeMirror.getScrollInfo();
        var scrollPercentage = scrollInfo.top / (scrollInfo.height - scrollInfo.clientHeight);
        var scrollTop = ($iframe[0].contentDocument.body.scrollHeight - $iframe[0].clientHeight) * scrollPercentage;

        return Math.round(scrollTop);
    }

    function _editorScroll() {
        if (_prefs.get("syncScroll") && $iframe) {
            var scrollTop = _calcScrollPos();

            $iframe[0].contentDocument.body.scrollTop = scrollTop;
        }
    }

    function _loadDoc(doc, isReload) {
        if (doc && visible && $iframe) {
            var docText     = doc.getText(),
                scrollPos   = 0,
                bodyText    = "",
                yamlRegEx   = /^-{3}([\w\W]+?)(-{3})/,
                yamlMatch   = yamlRegEx.exec(docText);

            // If there's yaml front matter, remove it.
            if (yamlMatch) {
                docText = docText.substr(yamlMatch[0].length);
            }

            if (isReload) {
                scrollPos = $iframe.contents()[0].body.scrollTop;
            } else if (_prefs.get("syncScroll")) {
                scrollPos = _calcScrollPos();
            }

            // Parse markdown into HTML
            bodyText = marked(docText);

            // Show URL in link tooltip
            bodyText = bodyText.replace(/(href=\"([^\"]*)\")/g, "$1 title=\"$2\"");

            // Convert protocol-relative URLS
            bodyText = bodyText.replace(/src="\/\//g, "src=\"http://");

            if (isReload) {
                $iframe[0].contentDocument.body.innerHTML = bodyText;
            } else {
                // Make <base> tag for relative URLS
                var baseUrl = window.location.protocol + "//" + FileUtils.getDirectoryPath(doc.file.fullPath);

                // Assemble the HTML source
                var htmlSource = _.template(previewHTML)({
                    baseUrl    : baseUrl,
                    themeUrl   : require.toUrl("./themes/" + _prefs.get("theme") + ".css"),
                    scrollTop  : scrollPos,
                    bodyText   : bodyText
                });
                $iframe.attr("srcdoc", htmlSource);

                // Remove any existing load handlers
                $iframe.off("load");
                $iframe.load(function () {
                    // Open external browser when links are clicked
                    // (similar to what brackets.js does - but attached to the iframe's document)
                    $iframe[0].contentDocument.body.addEventListener("click", _handleLinkClick, true);

                    // Sync scroll position (if needed)
                    if (!isReload) {
                        _editorScroll();
                    }

                    // Make sure iframe is showing
                    $iframe.show();
                });
            }
        }
    }

    function _documentChange(e) {
        _loadDoc(e.target, true);
    }

    function _resizeIframe() {
        if (visible && $iframe) {
            var iframeWidth = panel.$panel.innerWidth();
            $iframe.attr("width", iframeWidth + "px");
        }
    }

    function _updateSettings() {
        // Format
        var useGFM = _prefs.get("useGFM");
        marked.setOptions({
            breaks: useGFM,
            gfm: useGFM
        });

        // Re-render
        _loadDoc(currentDoc);
    }

    function _documentClicked(e) {
        if (!$settings.is(e.target) &&
            !$settingsToggle.is(e.target) &&
            $settings.has(e.target).length === 0) {
            _hideSettings();
        }
    }

    function _hideSettings() {
        if ($settings) {
            $settings.remove();
            $settings = null;
            $(window.document).off("mousedown", _documentClicked);
        }
    }

    function _showSettings(e) {
        _hideSettings();

        $settings = $(settingsHTML)
            .css({
                right: 12,
                top: $settingsToggle.position().top + $settingsToggle.outerHeight() + 12
            })
            .appendTo($panel);

        $settings.find("#markdown-preview-format")
            .prop("selectedIndex", _prefs.get("useGFM") ? 1 : 0)
            .change(function (e) {
                _prefs.set("useGFM", e.target.selectedIndex === 1);
                _updateSettings();
            });

        $settings.find("#markdown-preview-theme")
            .val(_prefs.get("theme"))
            .change(function (e) {
                _prefs.set("theme", e.target.value);
                _updateSettings();
            });

        var $syncScroll = $settings.find("#markdown-preview-sync-scroll");

        $syncScroll.change(function (e) {
            _prefs.set("syncScroll", e.target.checked);
            _editorScroll();
        });

        if (_prefs.get("syncScroll")) {
            $syncScroll.attr("checked", true);
        }

        PopUpManager.addPopUp($settings, _hideSettings, true);
        $(window.document).on("mousedown", _documentClicked);
    }

    function _setPanelVisibility(isVisible) {
        if (isVisible === realVisibility) {
            return;
        }

        realVisibility = isVisible;
        var editor = $(" #editor-holder");

        if (isVisible) {
            if (!panel) {
                $panel = $(panelHTML);
                $iframe = $panel.find("#panel-markdown-preview-frame");

                panel = WorkspaceManager.createBottomPanel("markdown-preview-panel", $panel);

                $panel.on("panelResizeUpdate", function (e, newSize) {
                    $iframe.attr("height", newSize);
                });


                $iframe.attr("height", $panel.height());

                $panel.css("overflow","hidden");

                window.setTimeout(_resizeIframe);

                $settingsToggle = $("#markdown-settings-toggle")
                    .click(function (e) {
                        if ($settings) {
                            _hideSettings();
                        } else {
                            _showSettings(e);
                        }
                    });

                $iframe.hide();
            }
            _loadDoc(DocumentManager.getCurrentDocument());
            editor.css("display", "none");

            $icon.toggleClass("active");

            panel.show();

        } else {
            $icon.toggleClass("active");
            panel.hide();
            //fixing height of pane
            editor.css("display", "block");
            var editorPane = $(" #editor-holder ").find(".view-pane").find(".pane-content");
            editorPane.css("height", "100%");
            var codemirror = $(" #editor-holder ").find(".view-pane").find(".pane-content").children().eq(1);
            codemirror.css("height", "100%");
            $iframe.hide();
        }
    }


    function _currentDocChangedHandler() {
        var doc = DocumentManager.getCurrentDocument(),
            ext = doc ? FileUtils.getFileExtension(doc.file.fullPath).toLowerCase() : "";

        if (currentDoc) {
            currentDoc.off("change", _documentChange);
            currentDoc = null;
        }

        if (currentEditor) {
            currentEditor.off("scroll", _editorScroll);
            currentEditor = null;
        }

        if (doc && /md|markdown|litcoffee|txt/.test(ext)) {
            currentDoc = doc;
            currentDoc.on("change", _documentChange);
            currentEditor = EditorManager.getCurrentFullEditor();
            currentEditor.on("scroll", _editorScroll);
            $icon.css({display: "block"});
            _setPanelVisibility(visible);

            toggleCmd.setEnabled(true);
            _loadDoc(doc);
        } else {
            $icon.css({display: "none"});
            toggleCmd.setEnabled(false);

            _setPanelVisibility(false);
        }
    }

    function _toggleVisibility() {
        visible = !visible;
        _setPanelVisibility(visible);

        toggleCmd.setChecked(visible);
    }

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
            toolBar = new ModalBar(Mustache.render(_markdownBarTemplate, templateVars), false, false);
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
    barShouldShow = true;

    activeEditorChangeHandler(null, EditorManager.getActiveEditor(), null);
    EditorManager.on("activeEditorChange", activeEditorChangeHandler);

    var editor = $(" #editor-holder");
    editor.css("display", "block");
    //TODO: update the code in workspace manager to handle code editor height adjustment in initial rendering
    WorkspaceManager.recomputeLayout(true);
    //editor height gets adjusted after any operation including toggling, resizing
    editor.css("height","80%");     //temporary height fix

    editor.css("overflow","hidden");

    var editorPane = $(" #editor-holder ").find(".view-pane").find(".pane-content");
    editorPane.css("height", "100%");
    var codemirror = $(" #editor-holder ").find(".view-pane").find(".pane-content").children().eq(1);
    codemirror.css("height", "100%");

    // Debounce event callback to avoid excess overhead
    // Update preview 300 ms ofter document change
    // Sync scroll 1ms after document scroll (just enough to ensure
    // the document scroll isn't blocked).
    _documentChange = _.debounce(_documentChange, 300);
    _editorScroll = _.debounce(_editorScroll, 1);

    // Insert CSS for this extension
    ExtensionUtils.loadStyleSheet(module, "styles/MarkdownPreview.css");

    // Add toolbar icon

    $icon = $("<a>")
        .attr({
            id: "markdown-preview-icon",
            href: "#"
        })
        .css({
            display: "none"
        })
        .click(_toggleVisibility)
        .appendTo($("#main-toolbar .buttons"));



    // Add a document change handler
    MainViewManager.on("currentFileChange", _currentDocChangedHandler);

    toggleCmd = CommandManager.register("Markdown Preview", "toggleMarkdownPreview", _toggleVisibility);
    toggleCmd.setChecked(realVisibility);
    toggleCmd.setEnabled(realVisibility);

    // currentDocumentChange is *not* called for the initial document. Use
    // appReady() to set initial state.
    AppInit.appReady(function () {
        _currentDocChangedHandler();
    });

    // Listen for resize events
    WorkspaceManager.on("workspaceUpdateLayout", _resizeIframe);
    $("#sidebar").on("panelCollapsed panelExpanded panelResizeUpdate", _resizeIframe);

});


