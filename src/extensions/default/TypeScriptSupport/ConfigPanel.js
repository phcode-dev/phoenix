/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

/**
 * ConfigPanel - a friendly settings UI for the project's tsconfig.json/jsconfig.json.
 *
 * Auto-shows as a bottom panel whenever the project-root ts/jsconfig is the file being viewed and
 * hides when the user navigates away. The JSON stays the source of truth: every control change is
 * applied to the OPEN document (visible + undoable in the editor above) and saved immediately, and
 * hand-edits to the JSON flow back into the controls. tsserver watches config files natively, so a
 * saved change re-scopes the language server without an explicit restart.
 *
 * Files whose text is not strict JSON (comments / custom formatting) are shown a read-only notice
 * instead of controls - a JSON.stringify round-trip would destroy the user's formatting.
 *
 * @module extensions/default/TypeScriptSupport/ConfigPanel
 */
define(function (require, exports, module) {


    const WorkspaceManager = brackets.getModule("view/WorkspaceManager"),
        MainViewManager = brackets.getModule("view/MainViewManager"),
        DocumentManager = brackets.getModule("document/DocumentManager"),
        ProjectManager = brackets.getModule("project/ProjectManager"),
        CommandManager = brackets.getModule("command/CommandManager"),
        Commands = brackets.getModule("command/Commands"),
        PreferencesManager = brackets.getModule("preferences/PreferencesManager"),
        NativeApp = brackets.getModule("utils/NativeApp"),
        NotificationUI = brackets.getModule("widgets/NotificationUI"),
        Mustache = brackets.getModule("thirdparty/mustache/mustache"),
        _ = brackets.getModule("thirdparty/lodash"),
        StringUtils = brackets.getModule("utils/StringUtils"),
        Strings = brackets.getModule("strings"),
        CodeIntelligence = require("./CodeIntelligence"),
        panelTemplate = require("text!./htmlContent/config-panel.html");

    const PANEL_ID = "typescript.config-settings";
    const CONFIG_FILES = ["tsconfig.json", "jsconfig.json"];
    // Sync the panel this long after JSON hand-edits settle (typing in the editor above).
    const REFRESH_DEBOUNCE_MS = 300;

    // Curated select options: [file value, display label]. File values are the TS-canonical
    // lowercase forms our generator emits; matching against the file is case-insensitive.
    const TARGET_OPTIONS = [
        ["es5", "ES5"], ["es2015", "ES2015"], ["es2017", "ES2017"],
        ["es2020", "ES2020"], ["es2022", "ES2022"], ["esnext", "ESNext"]
    ];
    const MODULE_OPTIONS = [
        ["preserve", "Preserve"], ["esnext", "ESNext"], ["nodenext", "NodeNext"], ["commonjs", "CommonJS"]
    ];
    const JSX_OFF = ""; // "Off" option: the jsx key is removed from compilerOptions
    const JSX_OPTIONS = [
        ["react-jsx", "React JSX"], ["react", "React (classic)"], ["preserve", "Preserve"]
    ];

    let panel = null;          // WorkspaceManager panel
    let $panel = null;
    let _currentPath = null;   // fullPath of the config the panel is bound to, or null
    let _applying = false;     // a panel-driven edit is in flight - ignore its change echo
    let _refreshTimer = null;

    function _projectConfigPath(fullPath) {
        const root = ProjectManager.getProjectRoot();
        if (!root || !fullPath) {
            return null;
        }
        const isRootConfig = CONFIG_FILES.some(function (name) {
            return fullPath === root.fullPath + name;
        });
        return isRootConfig ? fullPath : null;
    }

    function _doc() {
        return _currentPath ? DocumentManager.getOpenDocumentForPath(_currentPath) : null;
    }

    // Strict parse only: a file with comments/JSONC would be destroyed by a stringify round-trip,
    // so anything JSON.parse rejects puts the panel in read-only mode.
    function _parsedConfig() {
        const doc = _doc();
        if (!doc) {
            return null;
        }
        try {
            return JSON.parse(doc.getText());
        } catch (e) {
            return null;
        }
    }

    // ----- select population ----------------------------------------------------------------

    // Fill a <select> with the curated options, selecting the file's current value. A value outside
    // the list is kept selectable as "(current: x)" so the panel never silently clobbers it.
    function _fillSelect($select, options, currentValue, allowOff) {
        $select.empty();
        const current = (currentValue === undefined || currentValue === null)
            ? "" : String(currentValue).toLowerCase();
        let matched = false;
        if (allowOff) {
            $("<option>").attr("value", JSX_OFF).text(Strings.CODE_INTEL_CFG_JSX_OFF).appendTo($select);
            matched = matched || current === "";
        }
        options.forEach(function (opt) {
            $("<option>").attr("value", opt[0]).text(opt[1]).appendTo($select);
            matched = matched || current === opt[0];
        });
        if (!matched && current !== "") {
            $("<option>").attr("value", current)
                .text(StringUtils.format(Strings.CODE_INTEL_CFG_CURRENT_VALUE, currentValue))
                .prependTo($select);
        }
        $select.val(current);
    }

    // ----- panel refresh (file -> controls) ------------------------------------------------------

    function _refresh() {
        if (!panel || !_currentPath) {
            return;
        }
        const cfg = _parsedConfig();
        const $controls = $panel.find(".ts-cfg-controls");
        const $readOnly = $panel.find(".ts-cfg-read-only");
        $panel.find(".ts-cfg-file-name").text("— " + _currentPath.split("/").pop());

        if (!cfg) {
            $controls.addClass("forced-hidden");
            $readOnly.removeClass("forced-hidden");
            $panel.find(".ts-cfg-origin").addClass("forced-hidden");
            return;
        }
        $controls.removeClass("forced-hidden");
        $readOnly.addClass("forced-hidden");

        const compilerOptions = cfg.compilerOptions || {};
        $panel.find(".ts-cfg-check-js").prop("checked", compilerOptions.checkJs === true);
        $panel.find(".ts-cfg-auto-types").prop("checked",
            !!(cfg.typeAcquisition && cfg.typeAcquisition.enable === true));

        // The autoManage toggle + origin note only make sense for files carrying the Phoenix marker.
        const marker = cfg.autoGeneratedByPhoenixCode;
        $panel.find(".ts-cfg-auto-manage-wrap").toggleClass("forced-hidden", !marker);
        $panel.find(".ts-cfg-origin").toggleClass("forced-hidden", !marker);
        if (marker) {
            $panel.find(".ts-cfg-auto-manage").prop("checked", marker.autoManage === true);
        }

        _fillSelect($panel.find(".ts-cfg-target"), TARGET_OPTIONS, compilerOptions.target, false);
        _fillSelect($panel.find(".ts-cfg-module"), MODULE_OPTIONS, compilerOptions.module, false);
        _fillSelect($panel.find(".ts-cfg-jsx"), JSX_OPTIONS, compilerOptions.jsx, true);

        $panel.find(".ts-cfg-auto-create-check").prop("checked",
            PreferencesManager.get(CodeIntelligence.PREF_AUTO_CREATE) !== false);
    }

    function _scheduleRefresh() {
        if (_refreshTimer) {
            clearTimeout(_refreshTimer);
        }
        _refreshTimer = setTimeout(function () {
            _refreshTimer = null;
            _refresh();
        }, REFRESH_DEBOUNCE_MS);
    }

    // ----- applying control changes (controls -> file) --------------------------------------------

    // Mutate the parsed config and write it back through the OPEN document (keeps the editor in
    // sync, keeps the change undoable), then save so the setting actually takes effect - tsserver
    // watches config files on disk and re-scopes the project on save.
    function _apply(mutate) {
        const doc = _doc();
        const cfg = _parsedConfig();
        if (!doc || !cfg) {
            _refresh(); // lost editability mid-flight (e.g. a comment was just typed) - resync UI
            return;
        }
        mutate(cfg);
        _applying = true;
        doc.setText(JSON.stringify(cfg, null, 4) + "\n");
        CommandManager.execute(Commands.FILE_SAVE, { doc: doc }).always(function () {
            _applying = false;
        });
    }

    function _wireControls() {
        $panel.find(".ts-cfg-check-js").on("change", function (event) {
            const checked = event.currentTarget.checked;
            _apply(function (cfg) {
                cfg.compilerOptions = cfg.compilerOptions || {};
                cfg.compilerOptions.checkJs = checked;
            });
        });
        $panel.find(".ts-cfg-auto-types").on("change", function (event) {
            const checked = event.currentTarget.checked;
            _apply(function (cfg) {
                cfg.typeAcquisition = { enable: checked };
            });
        });
        $panel.find(".ts-cfg-auto-manage").on("change", function (event) {
            const checked = event.currentTarget.checked;
            _apply(function (cfg) {
                if (cfg.autoGeneratedByPhoenixCode) {
                    cfg.autoGeneratedByPhoenixCode.autoManage = checked;
                }
            });
        });
        $panel.find(".ts-cfg-target").on("change", function (event) {
            const value = $(event.currentTarget).val();
            _apply(function (cfg) {
                cfg.compilerOptions = cfg.compilerOptions || {};
                cfg.compilerOptions.target = value;
            });
        });
        $panel.find(".ts-cfg-module").on("change", function (event) {
            const value = $(event.currentTarget).val();
            _apply(function (cfg) {
                cfg.compilerOptions = cfg.compilerOptions || {};
                cfg.compilerOptions.module = value;
            });
        });
        $panel.find(".ts-cfg-jsx").on("change", function (event) {
            const value = $(event.currentTarget).val();
            _apply(function (cfg) {
                cfg.compilerOptions = cfg.compilerOptions || {};
                if (value === JSX_OFF) {
                    delete cfg.compilerOptions.jsx;
                } else {
                    cfg.compilerOptions.jsx = value;
                }
            });
        });
        $panel.find(".ts-cfg-auto-create-check").on("change", function (event) {
            PreferencesManager.set(CodeIntelligence.PREF_AUTO_CREATE, event.currentTarget.checked);
            PreferencesManager.save();
        });
        $panel.find(".ts-cfg-all-options").on("click", function (e) {
            e.preventDefault();
            NativeApp.openURLInDefaultBrowser(CodeIntelligence.DOCS_URL);
        });

        // Per-card rich tooltips: the sublabels stay terse; the (i) icon expands into a structured
        // explanation - title / muted subtitle, then either aligned option->meaning rows (selects)
        // or a body paragraph with a code example card (toggles). Built from the ph-tip-* content
        // classes the core tooltip stylesheet provides, so the typography is reusable app-wide.
        // The icons sit inside <label>s, so clicks must not toggle the control.
        function _tipHeader(title, sub) {
            return "<div class='ph-tip-title'>" + _.escape(title) + "</div>" +
                "<div class='ph-tip-sub'>" + _.escape(sub) + "</div>";
        }
        function _toggleTip(title, sub, body, egCode, egText) {
            let html = _tipHeader(title, sub) +
                "<div class='ph-tip-body'>" + _.escape(body) + "</div>";
            if (egCode && egText) {
                html += "<div class='ph-tip-example'><code>" + _.escape(egCode) + "</code>" +
                    "<span>" + _.escape(egText) + "</span></div>";
            }
            return html;
        }
        function _optionsTip(title, sub, rows, foot) {
            let html = _tipHeader(title, sub) + "<div class='ph-tip-rows'>";
            rows.forEach(function (row) {
                html += "<span class='ph-tip-term'>" + _.escape(row[0]) + "</span>" +
                    "<span class='ph-tip-def'>" + _.escape(row[1]) + "</span>";
            });
            html += "</div>";
            if (foot) {
                html += "<div class='ph-tip-foot'>" + _.escape(foot) + "</div>";
            }
            return html;
        }
        const TIP_BUILDERS = {
            checkJs: () => _toggleTip(Strings.CODE_INTEL_CFG_CHECK_JS, Strings.CODE_INTEL_CFG_CHECK_JS_SUB,
                Strings.CODE_INTEL_CFG_CHECK_JS_INFO,
                Strings.CODE_INTEL_CFG_CHECK_JS_EG_CODE, Strings.CODE_INTEL_CFG_CHECK_JS_EG_TEXT),
            autoTypes: () => _toggleTip(Strings.CODE_INTEL_CFG_AUTO_TYPES, Strings.CODE_INTEL_CFG_AUTO_TYPES_SUB,
                Strings.CODE_INTEL_CFG_AUTO_TYPES_INFO,
                Strings.CODE_INTEL_CFG_AUTO_TYPES_EG_CODE, Strings.CODE_INTEL_CFG_AUTO_TYPES_EG_TEXT),
            autoManage: () => _toggleTip(Strings.CODE_INTEL_CFG_AUTO_MANAGE, Strings.CODE_INTEL_CFG_AUTO_MANAGE_SUB,
                Strings.CODE_INTEL_CFG_AUTO_MANAGE_INFO,
                Strings.CODE_INTEL_CFG_AUTO_MANAGE_EG_CODE, Strings.CODE_INTEL_CFG_AUTO_MANAGE_EG_TEXT),
            target: () => _optionsTip(Strings.CODE_INTEL_CFG_TARGET, Strings.CODE_INTEL_CFG_TARGET_SUB, [
                ["ES5", Strings.CODE_INTEL_CFG_TARGET_ES5],
                ["ES2015", Strings.CODE_INTEL_CFG_TARGET_ES2015],
                ["ES2017", Strings.CODE_INTEL_CFG_TARGET_ES2017],
                ["ES2020", Strings.CODE_INTEL_CFG_TARGET_ES2020],
                ["ES2022", Strings.CODE_INTEL_CFG_TARGET_ES2022],
                ["ESNext", Strings.CODE_INTEL_CFG_TARGET_ESNEXT]
            ], Strings.CODE_INTEL_CFG_TARGET_FOOT),
            module: () => _optionsTip(Strings.CODE_INTEL_CFG_MODULE, Strings.CODE_INTEL_CFG_MODULE_SUB, [
                ["Preserve", Strings.CODE_INTEL_CFG_MODULE_PRESERVE],
                ["ESNext", Strings.CODE_INTEL_CFG_MODULE_ESNEXT],
                ["NodeNext", Strings.CODE_INTEL_CFG_MODULE_NODENEXT],
                ["CommonJS", Strings.CODE_INTEL_CFG_MODULE_COMMONJS]
            ]),
            jsx: () => _optionsTip(Strings.CODE_INTEL_CFG_JSX, Strings.CODE_INTEL_CFG_JSX_SUB, [
                ["React JSX", Strings.CODE_INTEL_CFG_JSX_REACT_JSX],
                ["React (classic)", Strings.CODE_INTEL_CFG_JSX_REACT],
                ["Preserve", Strings.CODE_INTEL_CFG_JSX_PRESERVE],
                [Strings.CODE_INTEL_CFG_JSX_OFF, Strings.CODE_INTEL_CFG_JSX_OFF_INFO]
            ])
        };
        NotificationUI.attachRichTooltip($panel.find(".ts-cfg-info"), function (element) {
            const builder = TIP_BUILDERS[$(element).attr("data-ts-tip")];
            return builder ? builder() : "";
        });
        $panel.find(".ts-cfg-info").on("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
        });

        // The origin note's "Problems panel" is a teaching link: hovering it pulses the status-bar
        // problems indicator (so the user learns where it lives), clicking it opens the panel.
        const linkHtml = "<a class='ts-cfg-problems-link' href='#'>" +
            _.escape(Strings.CODE_INTEL_CFG_PROBLEMS_PANEL) + "</a>";
        $panel.find(".ts-cfg-origin-text")
            .html(StringUtils.format(_.escape(Strings.CODE_INTEL_CFG_ORIGIN_NOTE), linkHtml));
        $panel.find(".ts-cfg-problems-link")
            .on("click", function (e) {
                e.preventDefault();
                $("#status-inspection").removeClass("ts-cfg-locate-pulse");
                if (!$("#problems-panel").is(":visible")) {
                    CommandManager.execute(Commands.VIEW_TOGGLE_PROBLEMS);
                }
            })
            .on("mouseenter", function () {
                $("#status-inspection").addClass("ts-cfg-locate-pulse");
            })
            .on("mouseleave", function () {
                $("#status-inspection").removeClass("ts-cfg-locate-pulse");
            });
    }

    // ----- lifecycle ------------------------------------------------------------------------------

    function _onCurrentFileChange(event, newFile) {
        const configPath = _projectConfigPath(newFile && newFile.fullPath);
        if (configPath) {
            _currentPath = configPath;
            _refresh();
            panel.show();
        } else {
            _currentPath = null;
            if (panel.isVisible()) {
                panel.hide();
            }
        }
    }

    function _onDocumentChange(event, doc) {
        if (_applying || !_currentPath || !doc || doc.file.fullPath !== _currentPath) {
            return;
        }
        _scheduleRefresh(); // hand-edits to the JSON flow back into the controls
    }

    function init() {
        if (panel) {
            return;
        }
        // Panel styles live in src/styles/Extn-TypeScriptSupport.less (imported by
        // brackets.less, like other default-extension panels) - no runtime stylesheet load.
        const html = Mustache.render(panelTemplate, { Strings: Strings });
        panel = WorkspaceManager.createBottomPanel(PANEL_ID, $(html), 100,
            Strings.CODE_INTEL_CFG_TITLE, { iconSvg: "styles/images/panel-icon-code-intel.svg" });
        $panel = panel.$panel;
        _wireControls();

        // Uniform column counts: all rows always show the same number of columns. A ResizeObserver
        // on the body picks 3/2/1 by available width (thresholds ~= 3 or 2 cards of ~230px + gaps).
        const bodyEl = $panel.find(".ts-cfg-body")[0];
        function _updateColumns() {
            const width = bodyEl.clientWidth;
            const cols = width >= 760 ? 3 : (width >= 500 ? 2 : 1);
            $(bodyEl).removeClass("ts-cfg-cols-1 ts-cfg-cols-2 ts-cfg-cols-3")
                .addClass("ts-cfg-cols-" + cols);
        }
        new ResizeObserver(_updateColumns).observe(bodyEl);
        _updateColumns();

        MainViewManager.on("currentFileChange.tsCfgPanel", _onCurrentFileChange);
        DocumentManager.on(DocumentManager.EVENT_DOCUMENT_CHANGE + ".tsCfgPanel", _onDocumentChange);
        // Keep the footer preference checkbox honest if the pref changes elsewhere.
        PreferencesManager.on("change", CodeIntelligence.PREF_AUTO_CREATE, function () {
            if (panel.isVisible()) {
                $panel.find(".ts-cfg-auto-create-check").prop("checked",
                    PreferencesManager.get(CodeIntelligence.PREF_AUTO_CREATE) !== false);
            }
        });

        // Evaluate the file already showing at startup (e.g. a restored session on the config).
        _onCurrentFileChange(null, MainViewManager.getCurrentlyViewedFile());
    }

    exports.init = init;
});
