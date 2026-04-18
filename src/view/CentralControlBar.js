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

define(function (require, exports, module) {

    const AppInit           = require("utils/AppInit");
    const CommandManager    = require("command/CommandManager");
    const Commands          = require("command/Commands");
    const DocumentManager   = require("document/DocumentManager");
    const MainViewManager   = require("view/MainViewManager");
    const WorkspaceManager  = require("view/WorkspaceManager");

    const BAR_WIDTH = 30;

    let $bar;
    let $sidebar;
    let $content;
    let $fileLabel;
    let $fileName;
    let editorCollapsed = false;
    let savedToolbarWidth = null;
    let livePreviewWasOpen = false;
    let savedSidebarMaxSize = null;
    let applyingCollapsedLayout = false;

    function _syncLeftPositions() {
        if (!$sidebar || !$bar || !$content) {
            return;
        }
        const sidebarWidth = $sidebar.is(":visible") ? ($sidebar.outerWidth() || 0) : 0;
        $bar.css("left", sidebarWidth + "px");
        if (!editorCollapsed) {
            $content.css("left", (sidebarWidth + BAR_WIDTH) + "px");
        } else {
            const mainToolbar = document.getElementById("main-toolbar");
            const fullToolbarWidth = Math.max(0, window.innerWidth - sidebarWidth - BAR_WIDTH);
            if (mainToolbar) {
                mainToolbar.style.setProperty("left", (sidebarWidth + BAR_WIDTH) + "px", "important");
                mainToolbar.style.setProperty("right", "auto", "important");
                mainToolbar.style.setProperty("width", fullToolbarWidth + "px", "important");
            }
        }
    }

    function _updateFileLabel() {
        if (!$fileLabel) {
            return;
        }
        const doc = DocumentManager.getCurrentDocument();
        if (!doc) {
            $fileLabel.removeClass("is-dirty");
            $fileName.text("");
            $fileLabel.attr("title", "");
            return;
        }
        const name = doc.file && doc.file.name ? doc.file.name : "";
        const fullPath = doc.file && doc.file.fullPath ? doc.file.fullPath : "";
        const displayPath = fullPath && Phoenix && Phoenix.app && Phoenix.app.getDisplayPath
            ? Phoenix.app.getDisplayPath(fullPath)
            : fullPath || name;
        $fileName.text(name);
        $fileLabel.attr("title", displayPath);
        $fileLabel.toggleClass("is-dirty", !!doc.isDirty);
    }

    function _executeCmd(id) {
        CommandManager.execute(id);
    }

    function _isLivePreviewOpen() {
        const panel = WorkspaceManager.getPanelForID && WorkspaceManager.getPanelForID("live-preview-panel");
        return !!(panel && panel.isVisible());
    }

    function _applyCollapsedLayout() {
        if (applyingCollapsedLayout) {
            return;
        }
        applyingCollapsedLayout = true;
        try {
            const mainToolbar = document.getElementById("main-toolbar");
            const sidebarWidth = $sidebar.is(":visible") ? ($sidebar.outerWidth() || 0) : 0;
            const fullToolbarWidth = Math.max(0, window.innerWidth - sidebarWidth - BAR_WIDTH);
            // Keep .content in flow (display:block) but collapse it to zero width to avoid
            // TabBar infinite-loop when its ancestor becomes :hidden. visibility:hidden keeps
            // layout queries stable while the bar animates out.
            $content.css({ width: 0, "min-width": 0, right: "auto", visibility: "hidden", "pointer-events": "none" });
            // Use !important on the main-toolbar geometry so WorkspaceManager's clamping
            // inside handleWindowResize can't fight our width during active window resizes
            // (which produced a visible width flicker in full-preview mode).
            if (mainToolbar) {
                mainToolbar.style.setProperty("left", (sidebarWidth + BAR_WIDTH) + "px", "important");
                mainToolbar.style.setProperty("right", "auto", "important");
                mainToolbar.style.setProperty("width", fullToolbarWidth + "px", "important");
            }
            // Sidebar's data-maxsize is a percentage of _sideBarMaxSize() (main-view width
            // minus all non-content siblings). In collapsed mode #main-toolbar is itself a
            // huge sibling, so _sideBarMaxSize collapses to ~sidebarWidth, and every window
            // resize clamps the sidebar a pixel smaller (Resizer.js updateResizeLimits) —
            // producing a slow shrink a short moment after each resize. Raising the
            // percentage well above 100% short-circuits the clamp in this mode while still
            // coming from the same upstream code path. Numeric values are ignored by that
            // code path, so we must use a percentage string.
            if (savedSidebarMaxSize === null) {
                savedSidebarMaxSize = $sidebar.data("maxsize");
            }
            $sidebar.data("maxsize", "1000%");
            if (WorkspaceManager.recomputeLayout) {
                WorkspaceManager.recomputeLayout(true);
            }
        } finally {
            applyingCollapsedLayout = false;
        }
    }

    function _restoreExpandedLayout() {
        const $mainToolbar = $("#main-toolbar");
        const mainToolbar = $mainToolbar[0];
        if (mainToolbar) {
            mainToolbar.style.removeProperty("left");
            mainToolbar.style.removeProperty("right");
            mainToolbar.style.removeProperty("width");
        }
        $mainToolbar.css({ left: "", right: "", width: "" });
        $content.css({ width: "", "min-width": "", right: "", visibility: "", "pointer-events": "" });
        // The <> button never closes live preview. If we have a saved width from
        // before the collapse (LP was already open), restore it. If LP was opened
        // by the collapse action, fall back to the default panel size so it stays
        // visibly open at a reasonable width.
        const defaultWidth = Math.floor(window.innerWidth / 2.5);
        const targetWidth = (savedToolbarWidth && savedToolbarWidth > 50) ? savedToolbarWidth : defaultWidth;
        $mainToolbar.width(targetWidth);
        $content.css("right", targetWidth + "px");
        savedToolbarWidth = null;
        livePreviewWasOpen = false;
        if (savedSidebarMaxSize !== null) {
            $sidebar.data("maxsize", savedSidebarMaxSize);
            savedSidebarMaxSize = null;
        }
        _syncLeftPositions();
        if (WorkspaceManager.recomputeLayout) {
            WorkspaceManager.recomputeLayout(true);
        }
    }

    function _setEditorCollapsed(collapsed) {
        const wantCollapsed = !!collapsed;
        if (wantCollapsed === editorCollapsed) {
            return;
        }
        editorCollapsed = wantCollapsed;
        $("body").toggleClass("ccb-editor-collapsed", editorCollapsed);
        const $collapseBtn = $("#ccbCollapseEditorBtn");
        $collapseBtn.toggleClass("is-active", editorCollapsed)
            .attr("title", editorCollapsed ? "Switch to Code Editor" : "Switch to Visual Edit");
        $collapseBtn.find("i").attr("class", editorCollapsed ? "fa-solid fa-code" : "fa-solid fa-feather");

        if (editorCollapsed) {
            livePreviewWasOpen = _isLivePreviewOpen();
            savedToolbarWidth = livePreviewWasOpen ? ($("#main-toolbar").outerWidth() || null) : null;
            if (!livePreviewWasOpen) {
                // Open live preview first, then apply collapsed layout after the panel mounts.
                CommandManager.execute(Commands.FILE_LIVE_FILE_PREVIEW).always(function () {
                    if (editorCollapsed) {
                        _applyCollapsedLayout();
                    }
                });
                return;
            }
            _applyCollapsedLayout();
        } else {
            _restoreExpandedLayout();
        }
    }

    function _updateSidebarToggleIcon() {
        const $btn = $("#ccbSidebarToggleBtn");
        if (!$btn.length) {
            return;
        }
        const isVisible = $("#sidebar").is(":visible");
        $btn.find("i").attr("class", isVisible ? "fa-solid fa-angles-left" : "fa-solid fa-angles-right");
    }

    function _wireButtons() {
        $("#ccbUndoBtn").on("click", function (e) { e.preventDefault(); _executeCmd(Commands.EDIT_UNDO); });
        $("#ccbRedoBtn").on("click", function (e) { e.preventDefault(); _executeCmd(Commands.EDIT_REDO); });
        $("#ccbSaveBtn").on("click", function (e) { e.preventDefault(); _executeCmd(Commands.FILE_SAVE); });
        $("#ccbCollapseEditorBtn").on("click", function (e) {
            e.preventDefault();
            _setEditorCollapsed(!editorCollapsed);
        });
        $("#ccbSidebarToggleBtn").on("click", function (e) {
            e.preventDefault();
            _executeCmd(Commands.VIEW_HIDE_SIDEBAR);
        });
        $("#ccbFileLabel").on("click", function (e) {
            e.preventDefault();
            _executeCmd(Commands.NAVIGATE_SHOW_IN_FILE_TREE);
        });
    }

    AppInit.htmlReady(function () {
        $bar = $("#centralControlBar");
        $sidebar = $("#sidebar");
        $content = $(".content");
        $fileLabel = $("#ccbFileLabel");
        $fileName = $fileLabel.find(".ccb-file-name");

        _wireButtons();
        _syncLeftPositions();

        // While the sidebar is being dragged we only reposition CCB / main-toolbar.
        // Running the full collapsed-layout (with recomputeLayout) on every resize
        // update fires cascading editor relayouts that can make the sidebar drag
        // misbehave — the heavy work is done once at resize-end instead.
        $sidebar.on("panelResizeUpdate.ccb", function () {
            _syncLeftPositions();
        });
        $sidebar.on("panelResizeEnd.ccb panelCollapsed.ccb panelExpanded.ccb", function () {
            _syncLeftPositions();
            if (editorCollapsed) {
                _applyCollapsedLayout();
            }
            _updateSidebarToggleIcon();
        });
        $(window).on("resize.ccb", function () {
            _syncLeftPositions();
            if (editorCollapsed) {
                _applyCollapsedLayout();
            }
        });
        WorkspaceManager.on(WorkspaceManager.EVENT_WORKSPACE_PANEL_SHOWN + ".ccb " +
            WorkspaceManager.EVENT_WORKSPACE_PANEL_HIDDEN + ".ccb", function () {
            if (editorCollapsed) {
                _applyCollapsedLayout();
            }
        });
        // WorkspaceManager's handleWindowResize runs _clampPluginPanelWidth on every
        // window resize, which caps #main-toolbar at min(innerWidth * 0.75, innerWidth
        // - sidebar - 100). That's tighter than what we want in collapsed mode (fill
        // to innerWidth - sidebar - 30), leaving a blank gap on the right. Listen for
        // the layout-update event that fires after the clamp and reassert our widths.
        // The applyingCollapsedLayout guard breaks the recursion because our own
        // recomputeLayout call would otherwise re-enter this handler.
        WorkspaceManager.on(WorkspaceManager.EVENT_WORKSPACE_UPDATE_LAYOUT + ".ccb", function () {
            if (editorCollapsed) {
                _applyCollapsedLayout();
            }
        });


        MainViewManager.on("currentFileChange.ccb", _updateFileLabel);
        DocumentManager.on("dirtyFlagChange.ccb", _updateFileLabel);
        DocumentManager.on("pathDeleted.ccb fileNameChange.ccb", _updateFileLabel);

        _updateFileLabel();
        _updateSidebarToggleIcon();
    });

    exports.isEditorCollapsed = function () { return editorCollapsed; };
    exports.setEditorCollapsed = _setEditorCollapsed;
});
