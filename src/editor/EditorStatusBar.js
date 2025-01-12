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

/*global fs*/

/**
 * Manages parts of the status bar related to the current editor's state.
 */
define(function (require, exports, module) {


    // Load dependent modules
    const _                    = require("thirdparty/lodash"),
        AnimationUtils       = require("utils/AnimationUtils"),
        AppInit              = require("utils/AppInit"),
        DropdownButton       = require("widgets/DropdownButton"),
        EditorManager        = require("editor/EditorManager"),
        MainViewManager      = require("view/MainViewManager"),
        Editor               = require("editor/Editor").Editor,
        KeyEvent             = require("utils/KeyEvent"),
        LanguageManager      = require("language/LanguageManager"),
        PreferencesManager   = require("preferences/PreferencesManager"),
        StatusBar            = require("widgets/StatusBar"),
        Strings              = require("strings"),
        InMemoryFile         = require("document/InMemoryFile"),
        ProjectManager       = require("project/ProjectManager"),
        Async                = require("utils/Async"),
        TaskManager    = require("features/TaskManager"),
        FileSystem           = require("filesystem/FileSystem"),
        CommandManager       = require("command/CommandManager"),
        Commands             = require("command/Commands"),
        DocumentManager      = require("document/DocumentManager"),
        StringUtils          = require("utils/StringUtils"),
        Metrics              = require("utils/Metrics");

    const SupportedEncodings = fs.SUPPORTED_ENCODINGS.sort();

    /* StatusBar indicators */
    var languageSelect, // this is a DropdownButton instance
        encodingSelect, // this is a DropdownButton instance
        tasksSelect, // this is a DropdownButton instance
        $cursorInfo,
        $statusInfo,
        $fileInfo,
        $indentType,
        $indentAuto,
        $indentWidthLabel,
        $indentWidthInput,
        $statusOverwrite;

    /** Special list item for the 'set as default' gesture in language switcher dropdown */
    var LANGUAGE_SET_AS_DEFAULT = {};


    /**
     * Determine string based on count
     * @param {number} number Count
     * @param {string} singularStr Singular string
     * @param {string} pluralStr Plural string
     * @return {string} Proper string to use for count
     */
    function _formatCountable(number, singularStr, pluralStr) {
        return StringUtils.format(number > 1 ? pluralStr : singularStr, number);
    }

    /**
     * Update file mode
     * @param {Editor} editor Current editor
     */
    function _updateLanguageInfo(editor) {
        var doc = editor.document,
            lang = doc.getLanguage();

        // Show the current language as button title
        languageSelect.$button.text(lang.getName());
    }

    /**
     * Update encoding
     * @param {Editor} editor Current editor
     */
    function _updateEncodingInfo(editor) {
        var doc = editor.document;

        // Show the current encoding as button title
        if (!doc.file._encoding) {
            doc.file._encoding = "utf8";
        }
        encodingSelect.$button.text(doc.file._encoding);
    }

    function _getLineCountStr(editor) {
        const lines = editor.lineCount();
        return _formatCountable(lines, Strings.STATUSBAR_LINE_COUNT_SINGULAR, Strings.STATUSBAR_LINE_COUNT_PLURAL);
    }

    /**
     * Update file information
     * @param {Editor} editor Current editor
     */
    function _updateFileInfo(editor) {
        $fileInfo.text(_getLineCountStr(editor));
    }

    /**
     * Update indent type and size
     * @param {string} fullPath Path to file in current editor
     */
    function _updateIndentType(fullPath) {
        var indentWithTabs = Editor.getUseTabChar(fullPath);
        $indentType.text(indentWithTabs ? Strings.STATUSBAR_TAB_SIZE : Strings.STATUSBAR_SPACES);
        $indentType.attr("title", indentWithTabs ? Strings.STATUSBAR_INDENT_TOOLTIP_SPACES : Strings.STATUSBAR_INDENT_TOOLTIP_TABS);
        $indentWidthLabel.attr("title", indentWithTabs ? Strings.STATUSBAR_INDENT_SIZE_TOOLTIP_TABS : Strings.STATUSBAR_INDENT_SIZE_TOOLTIP_SPACES);
    }

    function _updateAutoIndent(fullPath) {
        const autoIndent = Editor.getAutoTabSpaces(fullPath);
        $indentAuto.html(autoIndent ? Strings.STATUSBAR_AUTO_INDENT : Strings.STATUSBAR_FIXED_INDENT);
    }

    /**
     * Get indent size based on type
     * @param {string} fullPath Path to file in current editor
     * @return {number} Indent size
     */
    function _getIndentSize(fullPath) {
        return Editor.getUseTabChar(fullPath) ? Editor.getTabSize(fullPath) : Editor.getSpaceUnits(fullPath);
    }

    /**
     * Update indent size
     * @param {string} fullPath Path to file in current editor
     */
    function _updateIndentSize(fullPath) {
        var size = _getIndentSize(fullPath);
        $indentWidthLabel.text(size);
        $indentWidthInput.val(size);
    }

    /**
     * Toggle indent type
     */
    function _toggleIndentType() {
        var current = EditorManager.getActiveEditor(),
            fullPath = current && current.document.file.fullPath;

        Editor.setUseTabChar(!Editor.getUseTabChar(fullPath), fullPath);
        _updateIndentType(fullPath);
        _updateAutoIndent(fullPath);
        _updateIndentSize(fullPath);
    }

    function _toggleAutoIndent() {
        const current = EditorManager.getActiveEditor(),
            fullPath = current && current.document.file.fullPath;
        Editor.setAutoTabSpaces(!Editor.getAutoTabSpaces(fullPath), fullPath);
        if(Editor.getAutoTabSpaces(fullPath)){
            // if the user explicitly clicked on the auto indent status bar icon, he might mean to recompute it
            Editor._autoDetectTabSpaces(current, true, true);
        }
        _updateIndentType(fullPath);
        _updateAutoIndent(fullPath);
        _updateIndentSize(fullPath);
    }

    /**
     * Update cursor(s)/selection(s) information
     * @param {Event} event (unused)
     * @param {Editor} editor Current editor
     */
    function _updateCursorInfo(event, editor) {
        editor = editor || EditorManager.getActiveEditor();

        // compute columns, account for tab size
        const cursor = editor.getCursorPos(true);

        let cursorStr = StringUtils.format(Strings.STATUSBAR_CURSOR_POSITION, cursor.line + 1, cursor.ch + 1);
        let cursorStrShort = StringUtils.format(
            Strings.STATUSBAR_CURSOR_POSITION_SHORT, cursor.line + 1, cursor.ch + 1);

        let sels = editor.getSelections(),
            selStr = "",
            shortSelStr = "";

        if (sels.length > 1) {
            //Send analytics data for multicursor use
            Metrics.countEvent(
                Metrics.EVENT_TYPE.EDITOR,
                "multiCursor",
                "usage"
            );
            selStr = StringUtils.format(Strings.STATUSBAR_SELECTION_MULTIPLE, sels.length);
            shortSelStr = StringUtils.format(Strings.STATUSBAR_SELECTION_MULTIPLE_SHORT_DO_NOT_TRANSLATE, sels.length);
        } else if (editor.hasSelection()) {
            const sel = sels[0];
            if (sel.start.line !== sel.end.line) {
                let lines = sel.end.line - sel.start.line + 1;
                if (sel.end.ch === 0) {
                    lines--;  // end line is exclusive if ch is 0, inclusive otherwise
                }
                selStr = _formatCountable(lines, Strings.STATUSBAR_SELECTION_LINE_SINGULAR,
                    Strings.STATUSBAR_SELECTION_LINE_PLURAL);
                shortSelStr = StringUtils.format(Strings.STATUSBAR_SELECTION_SHORT_DO_NOT_TRANSLATE, lines);
            } else {
                // end ch is exclusive always
                const cols = editor.getColOffset(sel.end) - editor.getColOffset(sel.start);
                selStr = _formatCountable(cols, Strings.STATUSBAR_SELECTION_CH_SINGULAR,
                    Strings.STATUSBAR_SELECTION_CH_PLURAL);
                shortSelStr = StringUtils.format(Strings.STATUSBAR_SELECTION_SHORT_DO_NOT_TRANSLATE, cols);
            }
        }
        $cursorInfo.text(cursorStrShort + shortSelStr);
        $statusInfo.attr("title", cursorStr + selStr + " " + _getLineCountStr(editor)+ "\n" +
            Strings.STATUSBAR_CURSOR_GOTO);
    }

    /**
     * Change indent size
     * @param {string} fullPath Path to file in current editor
     * @param {string} value Size entered into status bar
     */
    function _changeIndentWidth(fullPath, value) {
        $indentWidthLabel.removeClass("hidden");
        $indentWidthInput.addClass("hidden");

        // remove all event handlers from the input field
        $indentWidthInput.off("blur keyup");

        // restore focus to the editor
        MainViewManager.focusActivePane();

        var valInt = parseInt(value, 10);
        if (Editor.getUseTabChar(fullPath)) {
            if (!Editor.setTabSize(valInt, fullPath)) {
                return;     // validation failed
            }
        } else {
            if (!Editor.setSpaceUnits(valInt, fullPath)) {
                return;     // validation failed
            }
        }

        // update indicator
        _updateIndentSize(fullPath);

        // column position may change when tab size changes
        _updateCursorInfo();
    }

    /**
     * Update insert/overwrite label
     * @param {Event} event (unused)
     * @param {Editor} editor Current editor
     * @param {string} newstate New overwrite state
     * @param {boolean=} doNotAnimate True if state should not be animated
     */
    function _updateOverwriteLabel(event, editor, newstate, doNotAnimate) {
        if ($statusOverwrite.text() === (newstate ? Strings.STATUSBAR_OVERWRITE : Strings.STATUSBAR_INSERT)) {
            // label already up-to-date
            return;
        }

        $statusOverwrite.text(newstate ? Strings.STATUSBAR_OVERWRITE : Strings.STATUSBAR_INSERT);

        if (!doNotAnimate) {
            AnimationUtils.animateUsingClass($statusOverwrite[0], "flash", 1500);
        }
    }

    /**
     * Update insert/overwrite indicator
     * @param {Event} event (unused)
     */
    function _updateEditorOverwriteMode(event) {
        var editor = EditorManager.getActiveEditor(),
            newstate = !editor._codeMirror.state.overwrite;

        // update label with no transition
        _updateOverwriteLabel(event, editor, newstate, true);
        editor.toggleOverwrite(newstate);
    }

    /**
     * Initialize insert/overwrite indicator
     * @param {Editor} currentEditor Current editor
     */
    function _initOverwriteMode(currentEditor) {
        currentEditor.toggleOverwrite($statusOverwrite.text() === Strings.STATUSBAR_OVERWRITE);
        $statusOverwrite.attr("title", Strings.STATUSBAR_INSOVR_TOOLTIP);
    }

    /**
     * Handle active editor change event
     * @param {Event} event (unused)
     * @param {Editor} current Current editor
     * @param {Editor} previous Previous editor
     */
    function _onActiveEditorChange(event, current, previous) {
        if (previous) {
            previous.off(".statusbar");
            previous.document.off(".statusbar");
            previous.document.releaseRef();
        }

        if (!current) {
            StatusBar.hideAllPanes();
        } else {
            Editor._autoDetectTabSpaces(current);
            const fullPath = current.document.file.fullPath;
            StatusBar.showAllPanes();

            current.on("cursorActivity.statusbar", _updateCursorInfo);
            current.on("optionChange.statusbar", function () {
                _updateIndentType(fullPath);
                _updateAutoIndent(fullPath);
                _updateIndentSize(fullPath);
            });
            current.on("change.statusbar", function () {
                // async update to keep typing speed smooth
                window.setTimeout(function () { _updateFileInfo(current); }, 0);
            });
            current.on("overwriteToggle.statusbar", _updateOverwriteLabel);

            current.document.addRef();
            current.document.on("languageChanged.statusbar", function () {
                _updateLanguageInfo(current);
            });

            _updateCursorInfo(null, current);
            _updateLanguageInfo(current);
            _updateEncodingInfo(current);
            _updateFileInfo(current);
            _initOverwriteMode(current);
            _updateIndentType(fullPath);
            _updateAutoIndent(fullPath);
            _updateIndentSize(fullPath);
        }
    }

    /**
     * Populate the languageSelect DropdownButton's menu with all registered Languages
     */
    function _populateLanguageDropdown() {
        // Get all non-binary languages
        var languages = _.values(LanguageManager.getLanguages()).filter(function (language) {
            return !language.isBinary();
        });

        // sort dropdown alphabetically
        languages.sort(function (a, b) {
            return a.getName().toLowerCase().localeCompare(b.getName().toLowerCase());
        });

        languageSelect.items = languages;

        // Add option to top of menu for persisting the override
        languageSelect.items.unshift("---");
        languageSelect.items.unshift(LANGUAGE_SET_AS_DEFAULT);
    }

    /**
     * Change the encoding and reload the current document.
     * If passed then save the preferred encoding in state.
     */
    function _changeEncodingAndReloadDoc(document) {
        var promise = document.reload();
        promise.done(function (text, readTimestamp) {
            encodingSelect.$button.text(document.file._encoding);
            // Store the preferred encoding in the state
            const encoding = PreferencesManager.getViewState("encoding", PreferencesManager.STATE_PROJECT_CONTEXT);
            encoding[document.file.fullPath] = document.file._encoding;
            PreferencesManager.setViewState("encoding", encoding, PreferencesManager.STATE_PROJECT_CONTEXT);
        });
        promise.fail(function (error) {
            console.log("Error reloading contents of " + document.file.fullPath, error);
        });
    }


    /**
     * Populate the encodingSelect DropdownButton's menu with all registered encodings
     */
    function _populateEncodingDropdown() {
        encodingSelect.items = SupportedEncodings;
    }

    /**
     * Initialize
     */
    function _init() {

        $cursorInfo         = $("#status-cursor");
        $statusInfo         = $("#status-info");
        $fileInfo           = $("#status-file");
        $indentType         = $("#indent-type");
        $indentAuto         = $("#indent-auto");
        $indentWidthLabel   = $("#indent-width-label");
        $indentWidthInput   = $("#indent-width-input");
        $statusOverwrite    = $("#status-overwrite");

        $statusInfo.click((event)=>{
            event.preventDefault();
            event.stopPropagation();
            CommandManager.execute(Commands.NAVIGATE_GOTO_LINE);
        });

        languageSelect      = new DropdownButton.DropdownButton("", [], function (item, index) {
            var document = EditorManager.getActiveEditor().document,
                defaultLang = LanguageManager.getLanguageForPath(document.file.fullPath, true);

            if (item === LANGUAGE_SET_AS_DEFAULT) {
                var label = _.escape(StringUtils.format(Strings.STATUSBAR_SET_DEFAULT_LANG, LanguageManager.getCompoundFileExtension(document.file.fullPath)));
                return { html: label, enabled: document.getLanguage() !== defaultLang };
            }

            var html = _.escape(item.getName());

            // Show indicators for currently selected & default languages for the current file
            if (item === defaultLang) {
                html += " <span class='default-language'>" + Strings.STATUSBAR_DEFAULT_LANG + "</span>";
            }
            if (item === document.getLanguage()) {
                html = "<span class='checked-language'></span>" + html;
            }
            return html;
        });

        languageSelect.dropdownExtraClasses = "dropdown-status-bar";
        languageSelect.$button.addClass("btn-status-bar");
        $("#status-language").append(languageSelect.$button);
        languageSelect.$button.attr("title", Strings.STATUSBAR_LANG_TOOLTIP);


        encodingSelect = new DropdownButton.DropdownButton("", [], function (item, index) {
            var document = EditorManager.getActiveEditor().document;
            var html = _.escape(item);

            // Show indicators for currently selected & default languages for the current file
            if (item === "utf8") {
                html += " <span class='default-language'>" + Strings.STATUSBAR_DEFAULT_LANG + "</span>";
            }
            if (item === document.file._encoding) {
                html = "<span class='checked-language'></span>" + html;
            }
            return html;
        });

        encodingSelect.dropdownExtraClasses = "dropdown-status-bar";
        encodingSelect.$button.addClass("btn-status-bar");
        $("#status-encoding").append(encodingSelect.$button);
        encodingSelect.$button.attr("title", Strings.STATUSBAR_ENCODING_TOOLTIP);
        let hideSpinner = PreferencesManager.getViewState("StatusBar.HideSpinner");
        if(hideSpinner){
            $("#status-tasks .spinner").addClass("hide-spinner");
        }

        tasksSelect = new DropdownButton.DropdownButton(Strings.STATUSBAR_TASKS, [Strings.STATUSBAR_TASKS_HIDE_SPINNER], function (item, index) {
            if (item === Strings.STATUSBAR_TASKS_HIDE_SPINNER) {
                hideSpinner = PreferencesManager.getViewState("StatusBar.HideSpinner");
                if(hideSpinner){
                    return  "<span class='checked-spinner'></span>" + item;
                }
                return item;
            }
            return TaskManager._renderItem(item, index);
        });
        TaskManager._setTaskSelect(tasksSelect);

        tasksSelect.dropdownExtraClasses = "dropdown-status-bar";
        tasksSelect.$button.addClass("btn-status-bar");
        $("#status-tasks").append(tasksSelect.$button);
        tasksSelect.$button.attr("title", Strings.STATUSBAR_TASKS_TOOLTIP);
        tasksSelect.on("select", function (e, selection) {
            if(selection === Strings.STATUSBAR_TASKS_HIDE_SPINNER){
                hideSpinner = !PreferencesManager.getViewState("StatusBar.HideSpinner");
                PreferencesManager.setViewState("StatusBar.HideSpinner", hideSpinner);
                if(hideSpinner){
                    $("#status-tasks .spinner").addClass("hide-spinner");
                } else {
                    $("#status-tasks .spinner").removeClass("hide-spinner");
                }
                return;
            }
            return TaskManager._onSelect(e, selection);
        });
        tasksSelect.on(DropdownButton.EVENT_DROPDOWN_SHOWN, (evt)=>{
            return TaskManager._onDropdownShown(evt);
        });

        // indentation event handlers
        $indentType.on("click", _toggleIndentType);
        $indentAuto.on("click", _toggleAutoIndent);
        $indentWidthLabel
            .on("click", function () {
                // update the input value before displaying
                var fullPath = EditorManager.getActiveEditor().document.file.fullPath;
                $indentWidthInput.val(_getIndentSize(fullPath));

                $indentWidthLabel.addClass("hidden");
                $indentWidthInput.removeClass("hidden");
                $indentWidthInput.focus();

                $indentWidthInput
                    .on("blur", function () {
                        _changeIndentWidth(fullPath, $indentWidthInput.val());
                    })
                    .on("keyup", function (event) {
                        if (event.keyCode === KeyEvent.DOM_VK_RETURN) {
                            $indentWidthInput.blur();
                        } else if (event.keyCode === KeyEvent.DOM_VK_ESCAPE) {
                            _changeIndentWidth(fullPath, false);
                        }
                    });
            });

        $indentWidthInput.focus(function () { $indentWidthInput.select(); });

        // Language select change handler
        languageSelect.on("select", function (e, lang) {
            var document = EditorManager.getActiveEditor().document,
                fullPath = document.file.fullPath;

            var fileType = (document.file instanceof InMemoryFile) ? "newFile" : "existingFile",
                filelanguageName = lang ? lang._name||"" : "";

            Metrics.countEvent(
                Metrics.EVENT_TYPE.EDITOR,
                "languageChange",
                `${filelanguageName.toLowerCase()}-${fileType}`
            );

            if (lang === LANGUAGE_SET_AS_DEFAULT) {
                // Set file's current language in preferences as a file extension override (only enabled if not default already)
                var fileExtensionMap = PreferencesManager.get("language.fileExtensions");
                fileExtensionMap[LanguageManager.getCompoundFileExtension(fullPath)] = document.getLanguage().getId();
                PreferencesManager.set("language.fileExtensions", fileExtensionMap);

            } else {
                // Set selected language as a path override for just this one file (not persisted)
                var defaultLang = LanguageManager.getLanguageForPath(fullPath, true);
                // if default language selected, pass null to clear the override
                LanguageManager.setLanguageOverrideForPath(fullPath, lang === defaultLang ? null : lang);
            }
        });

        // Encoding select change handler
        encodingSelect.on("select", function (e, encoding) {
            var document = EditorManager.getActiveEditor().document,
                originalPath = document.file.fullPath,
                originalEncoding = document.file._encoding;

            document.file._encoding = encoding;
            if (!(document.file instanceof InMemoryFile) && document.isDirty) {
                CommandManager.execute(Commands.FILE_SAVE_AS, {doc: document}).done(function () {
                    var doc = DocumentManager.getCurrentDocument();
                    if (originalPath === doc.file.fullPath) {
                        _changeEncodingAndReloadDoc(doc);
                    } else {
                        document.file._encoding = originalEncoding;
                    }
                }).fail(function () {
                    document.file._encoding = originalEncoding;
                });
            } else if (document.file instanceof InMemoryFile) {
                encodingSelect.$button.text(encoding);
            } else if (!document.isDirty) {
                _changeEncodingAndReloadDoc(document);
            }
        });

        $statusOverwrite.on("click", _updateEditorOverwriteMode);
    }

    // Initialize: status bar focused listener
    EditorManager.on("activeEditorChange", _onActiveEditorChange);

    function _checkFileExistance(filePath, index, encoding) {
        var deferred = new $.Deferred(),
            fileEntry = FileSystem.getFileForPath(filePath);

        fileEntry.exists(function (err, exists) {
            if (!err && exists) {
                deferred.resolve();
            } else {
                delete encoding[filePath];
                deferred.reject();
            }
        });

        return deferred.promise();
    }

    ProjectManager.on("projectOpen", function () {
        let encoding = PreferencesManager.getViewState("encoding", PreferencesManager.STATE_PROJECT_CONTEXT);
        if (!encoding) {
            encoding = {};
            PreferencesManager.setViewState("encoding", encoding, PreferencesManager.STATE_PROJECT_CONTEXT);
        }
        Async.doSequentially(Object.keys(encoding), function (filePath, index) {
            return _checkFileExistance(filePath, index, encoding);
        }, false)
            .always(function () {
                PreferencesManager.setViewState("encoding", encoding, PreferencesManager.STATE_PROJECT_CONTEXT);
            });
    });

    AppInit.htmlReady(_init);
    AppInit.appReady(function () {
        // Populate language switcher with all languages after startup; update it later if this set changes
        _populateLanguageDropdown();
        _populateEncodingDropdown();
        LanguageManager.on("languageAdded languageModified", _populateLanguageDropdown);
        _onActiveEditorChange(null, EditorManager.getActiveEditor(), null);
        StatusBar.show();
    });
});
