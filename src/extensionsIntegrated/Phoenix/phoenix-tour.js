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

/*global PhStore */

/**
 * One-shot, app-lifetime onboarding tour that introduces the design-mode
 * toggle and the AI sidebar tab. Distinct from the NotificationUI-based
 * guided tour: it owns its own overlay (concentric pulse rings + tooltip)
 * and drives a short demo of design mode before pointing the user at the
 * AI tab.
 */
define(function (require, exports, module) {

    const Strings           = require("strings"),
        StringUtils         = require("utils/StringUtils"),
        Metrics             = require("utils/Metrics"),
        SidebarView         = require("project/SidebarView"),
        SidebarTabs         = require("view/SidebarTabs"),
        ProjectManager      = require("project/ProjectManager"),
        EditorManager       = require("editor/EditorManager"),
        CommandManager      = require("command/CommandManager"),
        Commands            = require("command/Commands"),
        WorkspaceManager    = require("view/WorkspaceManager"),
        CentralControlBar   = require("view/CentralControlBar");

    // Capture the kernel trust ring at module-load time — it's deleted from
    // `window` shortly after boot. Treated as optional: community-edition
    // builds without the pro trial flow won't expose `loginService` and the
    // tour will simply proceed without waiting.
    const _LoginService = (window.KernalModeTrust && window.KernalModeTrust.loginService) || null;

    const TOUR_STORAGE_KEY = "phoenixOnboardingTourState";
    const CURRENT_TOUR_VERSION = 1;

    const STEP_START_DELAY_MS = 2500;
    const STEP1_INVITE_MS = 1800;
    const STEP1_DESIGN_MODE_HOLD_MS = 2000;

    function _loadState() {
        const raw = PhStore.getItem(TOUR_STORAGE_KEY);
        if (!raw) {
            return { version: 0 };
        }
        try {
            return JSON.parse(raw);
        } catch (e) {
            return { version: 0 };
        }
    }

    function _saveState(state) {
        PhStore.setItem(TOUR_STORAGE_KEY, JSON.stringify(state));
    }

    let _state = _loadState();
    let _ranThisSession = false;

    let $overlay = null;
    let _rafId = null;
    let _timers = [];

    // Per-step: tracks a click on the highlighted target while the
    // overlay is showing, fires a metric, then detaches. Cleared by
    // _detachStepClickMetric on step transitions and teardown.
    let _activeStepClickHandler = null;
    let _activeStepClickTarget = null;

    // Step 2: when the step starts we briefly switch the sidebar to the
    // AI tab as an automatic peek (2s) and revert to whatever the user
    // was on. _peekPrevTab is non-null only while a peek is in flight so
    // teardown can revert cleanly if the tour ends mid-peek.
    let _step2PeekTimer = null;
    let _step2PeekPrevTab = null;
    const STEP2_PEEK_HOLD_MS = 2000;
    const SIDEBAR_AI_TAB_ID = "ai";

    function _markComplete() {
        _state.version = CURRENT_TOUR_VERSION;
        _saveState(_state);
    }

    function _clearTimers() {
        for (let i = 0; i < _timers.length; i++) {
            clearTimeout(_timers[i]);
        }
        _timers = [];
        if (_rafId) {
            cancelAnimationFrame(_rafId);
            _rafId = null;
        }
    }

    /**
     * Attach a one-shot click listener to `$target` that fires a "stepN_clicked"
     * metric. Captures real user clicks during the overlay session — not the
     * synthetic class toggles the demos do. Replaces any previously attached
     * step handler so we never double-count across step transitions.
     */
    function _attachStepClickMetric(stepNum, $target) {
        _detachStepClickMetric();
        if (!$target || !$target.length || !$target[0]) {
            return;
        }
        const targetEl = $target[0];
        const handler = function () {
            Metrics.countEvent(Metrics.EVENT_TYPE.GUIDE, "tour", "step" + stepNum + "_clicked");
            _detachStepClickMetric();
        };
        targetEl.addEventListener("click", handler, true);
        _activeStepClickTarget = targetEl;
        _activeStepClickHandler = handler;
    }

    function _detachStepClickMetric() {
        if (_activeStepClickTarget && _activeStepClickHandler) {
            _activeStepClickTarget.removeEventListener("click", _activeStepClickHandler, true);
        }
        _activeStepClickTarget = null;
        _activeStepClickHandler = null;
    }

    /**
     * Step 2 only: automatically switch the sidebar to the AI tab for a
     * couple of seconds so the user sees what's behind the tab, then
     * revert. No-op if the user is already on the AI tab.
     */
    function _runStep2AIPeek() {
        _cancelStep2AIPeek();
        const current = SidebarTabs.getActiveTab && SidebarTabs.getActiveTab();
        if (current === SIDEBAR_AI_TAB_ID) {
            return;
        }
        _step2PeekPrevTab = current;
        SidebarTabs.setActiveTab(SIDEBAR_AI_TAB_ID);
        _step2PeekTimer = setTimeout(function () {
            if (_step2PeekPrevTab) {
                SidebarTabs.setActiveTab(_step2PeekPrevTab);
            }
            _step2PeekPrevTab = null;
            _step2PeekTimer = null;
        }, STEP2_PEEK_HOLD_MS);
    }

    function _cancelStep2AIPeek() {
        if (_step2PeekTimer) {
            clearTimeout(_step2PeekTimer);
            _step2PeekTimer = null;
        }
        // If we tore down or transitioned mid-peek, restore the previous
        // tab so the sidebar doesn't get stranded on AI.
        if (_step2PeekPrevTab) {
            SidebarTabs.setActiveTab(_step2PeekPrevTab);
            _step2PeekPrevTab = null;
        }
    }

    function _teardown() {
        _clearTimers();
        _detachStepClickMetric();
        _cancelStep2AIPeek();
        if ($overlay) {
            $overlay.remove();
            $overlay = null;
        }
    }

    const TOTAL_STEPS = 4;

    function _ensureOverlay() {
        if ($overlay) {
            return;
        }
        $overlay = $(
            '<div class="phoenix-tour-overlay" data-tip-placement="right">' +
              '<div class="phoenix-tour-ring"></div>' +
              '<div class="phoenix-tour-ring phoenix-tour-ring-2"></div>' +
              '<div class="phoenix-tour-tooltip">' +
                '<div class="phoenix-tour-step"></div>' +
                '<div class="phoenix-tour-text"></div>' +
                '<div class="phoenix-tour-actions"></div>' +
              '</div>' +
            '</div>'
        );
        $overlay.appendTo(document.body);
    }

    function _setText(text) {
        if ($overlay) {
            // `text` may include `\n` for multi-line steps; CSS uses
            // `white-space: pre-line` to render those line breaks.
            $overlay.find(".phoenix-tour-text").text(text);
        }
    }

    function _setStep(stepNum) {
        if ($overlay) {
            $overlay.find(".phoenix-tour-step")
                .text(StringUtils.format(Strings.PHOENIX_TOUR_STEP_OF, stepNum, TOTAL_STEPS));
        }
    }

    /**
     * Replace tooltip action buttons. Pass an empty array to hide the row.
     * @param {Array<{label: string, kind: string, onClick: Function}>} buttons
     */
    function _setActions(buttons) {
        if (!$overlay) {
            return;
        }
        const $actions = $overlay.find(".phoenix-tour-actions").empty();
        if (!buttons || !buttons.length) {
            $actions.removeClass("has-buttons");
            return;
        }
        $actions.addClass("has-buttons");
        buttons.forEach(function (b) {
            const kind = b.kind || "primary";
            const $btn = $('<button type="button" class="phoenix-tour-btn"></button>')
                .addClass("phoenix-tour-btn-" + kind)
                .text(b.label);
            $btn.on("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                b.onClick();
            });
            $actions.append($btn);
        });
    }

    function _trackTarget($target, placement) {
        function update() {
            if (!$overlay || !$target.length || !$target[0].isConnected) {
                _rafId = null;
                return;
            }
            const r = $target[0].getBoundingClientRect();
            if (r.width === 0 && r.height === 0) {
                _rafId = requestAnimationFrame(update);
                return;
            }
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            const el = $overlay[0];
            el.style.left = cx + "px";
            el.style.top = cy + "px";
            _rafId = requestAnimationFrame(update);
        }
        if (_rafId) {
            cancelAnimationFrame(_rafId);
        }
        $overlay.attr("data-tip-placement", placement || "right");
        update();
    }

    /**
     * Make sure the sidebar is showing before each step. Upgrade flows can
     * boot Phoenix with the sidebar hidden (the user's last-session state),
     * which would hide the AI tab and the new-project button this tour
     * points at. Cheap to call when already visible — SidebarView.show()
     * is a no-op then.
     */
    function _ensureSidebarVisible() {
        if (SidebarView && SidebarView.isVisible && !SidebarView.isVisible()) {
            SidebarView.show();
        }
    }

    function _runStep1() {
        _ensureSidebarVisible();
        const $btn = $("#ccbCollapseEditorBtn");
        if (!$btn.length) {
            _markComplete();
            _teardown();
            return;
        }
        _ensureOverlay();
        _trackTarget($btn, "right");
        _setStep(1);
        Metrics.countEvent(Metrics.EVENT_TYPE.GUIDE, "tour", "step1");
        _attachStepClickMetric(1, $btn);
        // Single, stable message for the entire step. The visible toggle of
        // design mode does the explaining; rotating text under a 2-second
        // demo is too quick to read.
        _setText(Strings.PHOENIX_TOUR_DESIGN_MODE);
        _setActions([]); // hidden during the auto-demo
        $overlay.addClass("phoenix-tour-visible");

        // Auto-demo: enter design mode, hold, exit, then show "Next".
        _timers.push(setTimeout(function () {
            $btn.addClass("phoenix-tour-pressed");
            _timers.push(setTimeout(function () {
                $btn.removeClass("phoenix-tour-pressed");
            }, 220));
            CentralControlBar.setEditorCollapsed(true);

            _timers.push(setTimeout(function () {
                $btn.addClass("phoenix-tour-pressed");
                _timers.push(setTimeout(function () {
                    $btn.removeClass("phoenix-tour-pressed");
                }, 220));
                CentralControlBar.setEditorCollapsed(false);
                _setActions([
                    {
                        label: Strings.PHOENIX_TOUR_NEXT_BTN,
                        kind: "primary",
                        onClick: function () {
                            _runStep2();
                        }
                    }
                ]);
            }, STEP1_DESIGN_MODE_HOLD_MS));
        }, STEP1_INVITE_MS));
    }

    function _runStep2() {
        // Each step transition cancels the previous step's instrumentation.
        _detachStepClickMetric();
        _cancelStep2AIPeek();
        _ensureSidebarVisible();
        const $tab = $('.sidebar-tab[data-tab-id="ai"]');
        if (!$tab.length) {
            // No AI tab in this build — skip ahead to the next step.
            _runStep3();
            return;
        }
        _ensureOverlay();
        _trackTarget($tab, "right");
        _setStep(2);
        Metrics.countEvent(Metrics.EVENT_TYPE.GUIDE, "tour", "step2");
        _setText(Strings.PHOENIX_TOUR_AI_PANEL);
        _setActions([
            {
                label: Strings.PHOENIX_TOUR_NEXT_BTN,
                kind: "primary",
                onClick: function () {
                    _runStep3();
                }
            }
        ]);
        _attachStepClickMetric(2, $tab);
        // Auto-peek the AI panel for a couple of seconds so the user gets
        // a glance at its contents, then revert.
        _runStep2AIPeek();
        // Intentionally do NOT advance on a real click of the target — the
        // user needs time to read the prompt; only the Next button advances.
    }

    function _runStep3() {
        _detachStepClickMetric();
        _cancelStep2AIPeek();
        _ensureSidebarVisible();
        const $newBtn = $("#newProject");
        if (!$newBtn.length) {
            // No new-project button — skip to the live-preview step instead
            // of giving up on the tour entirely.
            _runStep4();
            return;
        }
        _ensureOverlay();
        _trackTarget($newBtn, "right");
        _setStep(3);
        Metrics.countEvent(Metrics.EVENT_TYPE.GUIDE, "tour", "step3");
        _attachStepClickMetric(3, $newBtn);
        _setText(Strings.PHOENIX_TOUR_NEW_PROJECT);
        _setActions([
            {
                label: Strings.PHOENIX_TOUR_NEXT_BTN,
                kind: "primary",
                onClick: function () {
                    _runStep4();
                }
            }
        ]);
        // Intentionally do NOT advance on a real click of the target — only
        // the Next button advances.
    }

    /**
     * Bring the workspace to a state where the live-preview Edit Mode button
     * is visible and meaningful: the welcome project must be open, the
     * active editor file must be one the preview can render (the welcome
     * project's index.html or phoenix-pro.html), and the LP panel must be
     * showing. Each branch is a no-op when already true.
     */
    async function _ensureLivePreviewReady() {
        const welcomeRoot = ProjectManager.getWelcomeProjectPath();

        // 1. Switch to the welcome project if we're not already there.
        const currentRoot = ProjectManager.getProjectRoot();
        if (!currentRoot || currentRoot.fullPath !== welcomeRoot) {
            await new Promise(function (resolve) {
                ProjectManager.openProject(welcomeRoot)
                    .done(resolve).fail(resolve);
            });
        }

        // 2. Make sure the active file is one the LP can render. Prefer
        //    phoenix-pro.html (Pro flow) and fall back to index.html.
        const proPath = welcomeRoot + "phoenix-pro.html";
        const indexPath = welcomeRoot + "index.html";
        const editor = EditorManager.getActiveEditor();
        const currentFile = editor && editor.document && editor.document.file
            ? editor.document.file.fullPath : null;
        if (currentFile !== proPath && currentFile !== indexPath) {
            let target = null;
            try {
                if (await Phoenix.VFS.existsAsync(proPath)) {
                    target = proPath;
                } else if (await Phoenix.VFS.existsAsync(indexPath)) {
                    target = indexPath;
                }
            } catch (e) { /* fall through with target=null */ }
            if (target) {
                await new Promise(function (resolve) {
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: target })
                        .done(resolve).fail(resolve);
                });
            }
        }

        // 3. Open the live-preview panel if it isn't visible.
        const lpPanel = WorkspaceManager.getPanelForID("live-preview-panel");
        if (!lpPanel || !lpPanel.isVisible()) {
            await new Promise(function (resolve) {
                CommandManager.execute(Commands.FILE_LIVE_FILE_PREVIEW)
                    .done(resolve).fail(resolve);
            });
        }
    }

    async function _runStep4() {
        _detachStepClickMetric();
        _cancelStep2AIPeek();
        _ensureSidebarVisible();
        try {
            await _ensureLivePreviewReady();
        } catch (e) { /* best-effort prep — proceed and let the rect-zero
                         RAF gate sort out a missing target */ }

        const $btn = $("#previewModeLivePreviewButton");
        if (!$btn.length) {
            // LP panel never came up (custom server, unsupported file, etc.)
            // — finalize the tour rather than stalling on a missing target.
            _markComplete();
            _teardown();
            return;
        }
        _ensureOverlay();
        // LP panel sits on the right edge; keep the default tooltip
        // placement (lower-right of the ring) so the tooltip extends back
        // into the panel area rather than off the right edge of the viewport.
        _trackTarget($btn, "left");
        _setStep(4);
        Metrics.countEvent(Metrics.EVENT_TYPE.GUIDE, "tour", "step4");
        _attachStepClickMetric(4, $btn);
        _setText(Strings.PHOENIX_TOUR_EDIT_MODE);
        _setActions([
            {
                label: Strings.PHOENIX_TOUR_DISMISS_BTN,
                kind: "secondary",
                onClick: function () {
                    Metrics.countEvent(Metrics.EVENT_TYPE.GUIDE, "tour", "dismiss");
                    _markComplete();
                    _teardown();
                }
            }
        ]);
    }

    function _shouldRun() {
        if (_ranThisSession) {
            return false;
        }
        if (_state.version >= CURRENT_TOUR_VERSION) {
            return false;
        }
        if (Phoenix.isTestWindow || Phoenix.isSpecRunnerWindow) {
            return false;
        }
        if (CentralControlBar.isEditorCollapsed && CentralControlBar.isEditorCollapsed()) {
            // User has already discovered design mode in some other way.
            return false;
        }
        if (!$("#ccbCollapseEditorBtn").length) {
            return false;
        }
        return true;
    }

    /**
     * Resolves once the pro trial start dialog has been dismissed. The
     * dialog is guaranteed to fire `proTrialStartDialogDismissed` on every
     * boot path (including builds where the dialog isn't shown), so we
     * just await it without a timeout fallback.
     */
    function _waitForTrialStartDialogDismissed() {
        const dismissed = _LoginService && _LoginService.proTrialStartDialogDismissed;
        // Community-edition builds expose no login service at all — skip
        // the wait so the tour still works there.
        if (!dismissed) {
            return Promise.resolve();
        }
        return Promise.resolve(dismissed);
    }

    function startTour() {
        if (!_shouldRun()) {
            return;
        }
        _ranThisSession = true;
        Metrics.countEvent(Metrics.EVENT_TYPE.GUIDE, "tour", "start");

        _waitForTrialStartDialogDismissed().then(function () {
            // Re-check primary preconditions after the wait — the user may
            // have already discovered design mode while a trial dialog was
            // up, or the button may have been torn down.
            if (!$("#ccbCollapseEditorBtn").length) {
                _markComplete();
                _teardown();
                return;
            }
            if (CentralControlBar.isEditorCollapsed && CentralControlBar.isEditorCollapsed()) {
                _markComplete();
                _teardown();
                return;
            }
            _timers.push(setTimeout(function () {
                if (!$("#ccbCollapseEditorBtn").length) {
                    _markComplete();
                    _teardown();
                    return;
                }
                _runStep1();
            }, STEP_START_DELAY_MS));
        });
    }

    exports.startTour = startTour;
});
