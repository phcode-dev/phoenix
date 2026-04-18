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
    const Strings           = require("strings");
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

    function _getRenderedSidebarWidth() {
        // Use offsetWidth (not jQuery's outerWidth) to force a synchronous reflow
        // read — with the design-mode `max-width` cap on #sidebar, style.width
        // and rendered width can diverge mid-drag, and outerWidth has returned the
        // uncapped style value in some frames which left CCB / main-toolbar stuck
        // at stale offsets.
        if (!$sidebar || !$sidebar.is(":visible")) {
            return 0;
        }
        return $sidebar[0].offsetWidth || 0;
    }

    function _syncLeftPositions() {
        if (!$sidebar || !$bar || !$content) {
            return;
        }
        const sidebarWidth = _getRenderedSidebarWidth();
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
            const sidebarWidth = _getRenderedSidebarWidth();
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

    function _restoreExpandedLayout(skipToolbarRestore) {
        const $mainToolbar = $("#main-toolbar");
        const mainToolbar = $mainToolbar[0];
        if (mainToolbar) {
            mainToolbar.style.removeProperty("left");
            mainToolbar.style.removeProperty("right");
            mainToolbar.style.removeProperty("width");
        }
        $mainToolbar.css({ left: "", right: "", width: "" });
        $content.css({ width: "", "min-width": "", right: "", visibility: "", "pointer-events": "" });
        savedToolbarWidth = null;
        livePreviewWasOpen = false;
        if (savedSidebarMaxSize !== null) {
            $sidebar.data("maxsize", savedSidebarMaxSize);
            savedSidebarMaxSize = null;
        }
        if (skipToolbarRestore) {
            // Live preview panel was just hidden (e.g. user clicked toolbar-go-live
            // while in design mode). WorkspaceManager._hidePluginSidePanel has
            // already sized #main-toolbar correctly for the no-panel state, so we
            // only need to clear our design-mode overrides and sync positions.
            _syncLeftPositions();
            if (WorkspaceManager.recomputeLayout) {
                WorkspaceManager.recomputeLayout(true);
            }
            return;
        }
        // The <> button never closes live preview. If we have a saved width from
        // before the collapse (LP was already open), restore it. If LP was opened
        // by the collapse action, fall back to the default panel size so it stays
        // visibly open at a reasonable width.
        const defaultWidth = Math.floor(window.innerWidth / 2.5);
        let targetWidth = (savedToolbarWidth && savedToolbarWidth > 50) ? savedToolbarWidth : defaultWidth;
        // If the sidebar was resized larger while collapsed (e.g. to fill most of
        // the screen), restoring the pre-collapse live-preview width would push
        // main-toolbar back under the sidebar. Clamp so sidebar + CCB + a
        // reasonable minimum editor width still fits in the window; if even the
        // min doesn't fit, trim the sidebar so the live-preview panel keeps its
        // own declared minWidth (below which the panel renders broken).
        const MIN_EDITOR_WIDTH = 200;
        const livePanel = WorkspaceManager.getPanelForID &&
            WorkspaceManager.getPanelForID("live-preview-panel");
        const panelIconsWidth = $("#plugin-icons-bar").outerWidth() || 30;
        const minLPToolbarWidth = ((livePanel && livePanel.minWidth) || 0) + panelIconsWidth;
        const sidebarWidth = _getRenderedSidebarWidth();
        const availableForLP = window.innerWidth - sidebarWidth - BAR_WIDTH - MIN_EDITOR_WIDTH;
        if (targetWidth > availableForLP) {
            targetWidth = Math.max(minLPToolbarWidth, availableForLP);
        }
        if (targetWidth < minLPToolbarWidth) {
            targetWidth = minLPToolbarWidth;
        }
        if (sidebarWidth + BAR_WIDTH + targetWidth + MIN_EDITOR_WIDTH > window.innerWidth) {
            const trimmedSidebar = Math.max(30, window.innerWidth - BAR_WIDTH - targetWidth - MIN_EDITOR_WIDTH);
            $sidebar.width(trimmedSidebar);
            // jQuery .width() sidesteps Resizer — manually reposition its handle so
            // the resizer doesn't stay stuck at the pre-trim position.
            const resync = $sidebar.data("resyncSizer");
            if (typeof resync === "function") {
                resync();
            }
        }
        $mainToolbar.width(targetWidth);
        $content.css("right", targetWidth + "px");
        _syncLeftPositions();
        if (WorkspaceManager.recomputeLayout) {
            WorkspaceManager.recomputeLayout(true);
        }
    }

    function _setEditorCollapsed(collapsed, opts) {
        const wantCollapsed = !!collapsed;
        if (wantCollapsed === editorCollapsed) {
            return;
        }
        const skipToolbarRestore = !!(opts && opts.skipToolbarRestore);
        // Capture sidebar's currently rendered width BEFORE flipping the body
        // class. In design mode the `max-width` cap can make the rendered
        // width smaller than sidebar.style.width. Removing the class drops the
        // cap and the sidebar would otherwise snap back to the stale style.width.
        if (editorCollapsed && !wantCollapsed && $sidebar && $sidebar[0]) {
            const rendered = _getRenderedSidebarWidth();
            if (rendered > 0) {
                $sidebar[0].style.width = rendered + "px";
                const resync = $sidebar.data("resyncSizer");
                if (typeof resync === "function") {
                    resync();
                }
            }
        }
        editorCollapsed = wantCollapsed;
        $("body").toggleClass("ccb-editor-collapsed", editorCollapsed);
        const $collapseBtn = $("#ccbCollapseEditorBtn");
        $collapseBtn.toggleClass("is-active", editorCollapsed)
            .attr("title", editorCollapsed ? "Switch to Code Editor" : "Switch to Visual Edit");
        $collapseBtn.find("i").attr("class", editorCollapsed ? "fa-solid fa-code" : "fa-solid fa-feather");
        if (_toggleDesignModeCommand) {
            _toggleDesignModeCommand.setChecked(editorCollapsed);
        }
        if (WorkspaceManager.setDesignMode) {
            WorkspaceManager.setDesignMode(editorCollapsed);
        }

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
            _restoreExpandedLayout(skipToolbarRestore);
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
            CommandManager.execute(Commands.VIEW_TOGGLE_DESIGN_MODE);
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

    const _toggleDesignModeCommand = CommandManager.register(Strings.CMD_TOGGLE_DESIGN_MODE,
        Commands.VIEW_TOGGLE_DESIGN_MODE, function () {
            _setEditorCollapsed(!editorCollapsed);
        });

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
        // misbehave — the heavy work is done once at resize-end instead. The
        // design-mode cap itself is enforced in CSS (`max-width: calc(100vw -
        // 230px)`, i.e. CCB + LP minimum) so the
        // browser refuses to render past it no matter what the Resizer writes.
        // In design mode the sidebar's right-resizer doubles as the
        // sidebar↔live-preview splitter (the main-toolbar's own left-resizer is
        // hidden). Forward the sidebar's panel-resize events to #main-toolbar
        // so listeners that watch main-toolbar (e.g. the live-preview resize
        // ruler / media-query ruler in lpedit-helper) still react to the drag.
        function _forwardResizeToMainToolbar(type) {
            if (!editorCollapsed) {
                return;
            }
            const mtWidth = $("#main-toolbar").outerWidth() || 0;
            $("#main-toolbar").trigger(type, [mtWidth]);
        }
        $sidebar.on("panelResizeStart.ccb", function () {
            _forwardResizeToMainToolbar("panelResizeStart");
        });
        $sidebar.on("panelResizeUpdate.ccb", function () {
            _syncLeftPositions();
            _forwardResizeToMainToolbar("panelResizeUpdate");
        });
        $sidebar.on("panelResizeEnd.ccb panelCollapsed.ccb panelExpanded.ccb", function (e) {
            _syncLeftPositions();
            if (editorCollapsed) {
                _applyCollapsedLayout();
            }
            _updateSidebarToggleIcon();
            if (e.type === "panelResizeEnd") {
                _forwardResizeToMainToolbar("panelResizeEnd");
            }
        });
        $(window).on("resize.ccb", function () {
            _syncLeftPositions();
            if (editorCollapsed) {
                _applyCollapsedLayout();
            }
        });
        WorkspaceManager.on(WorkspaceManager.EVENT_WORKSPACE_PANEL_SHOWN + ".ccb", function () {
            if (editorCollapsed) {
                _applyCollapsedLayout();
            }
        });
        WorkspaceManager.on(WorkspaceManager.EVENT_WORKSPACE_PANEL_HIDDEN + ".ccb", function (e, panelID) {
            // Closing the live-preview panel (e.g. via the toolbar-go-live button)
            // while in design mode leaves a blank area where live preview used to
            // be — exit design mode so the editor comes back in its place. Skip
            // our own toolbar-width restore: WorkspaceManager._hidePluginSidePanel
            // has already shrunk #main-toolbar back to the icon-bar width, and
            // restoring the pre-collapse live-preview width here would re-open
            // a dead zone where LP used to be.
            if (editorCollapsed && panelID === "live-preview-panel") {
                _setEditorCollapsed(false, { skipToolbarRestore: true });
                return;
            }
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

        // In design mode #main-toolbar's geometry is pinned with !important so
        // external callers of WorkspaceManager.setPluginPanelWidth(w) can't
        // actually size the live-preview panel. Wrap the API: while collapsed,
        // translate the requested live-preview content width into a sidebar
        // width so the sidebar drag/clamp/sync pipeline produces the equivalent
        // layout. In normal mode we fall through to the original implementation.
        const _origSetPluginPanelWidth = WorkspaceManager.setPluginPanelWidth;
        if (typeof _origSetPluginPanelWidth === "function") {
            WorkspaceManager.setPluginPanelWidth = function (width) {
                if (!editorCollapsed) {
                    return _origSetPluginPanelWidth.apply(this, arguments);
                }
                const iconsBarWidth = $("#plugin-icons-bar").outerWidth() || 30;
                const requestedToolbar = width + iconsBarWidth;
                let newSidebar = window.innerWidth - requestedToolbar - BAR_WIDTH;
                if (newSidebar < 0) {
                    newSidebar = 0;
                }
                if ($sidebar && $sidebar[0]) {
                    $sidebar[0].style.width = newSidebar + "px";
                    const resync = $sidebar.data("resyncSizer");
                    if (typeof resync === "function") {
                        resync();
                    }
                }
                _syncLeftPositions();
                if (WorkspaceManager.recomputeLayout) {
                    WorkspaceManager.recomputeLayout(true);
                }
            };
        }

        MainViewManager.on("currentFileChange.ccb", _updateFileLabel);
        DocumentManager.on("dirtyFlagChange.ccb", _updateFileLabel);
        DocumentManager.on("pathDeleted.ccb fileNameChange.ccb", _updateFileLabel);

        _updateFileLabel();
        _updateSidebarToggleIcon();
    });


    exports.isEditorCollapsed = function () { return editorCollapsed; };
    exports.setEditorCollapsed = _setEditorCollapsed;
});
