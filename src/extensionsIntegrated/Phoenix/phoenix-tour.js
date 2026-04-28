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
    // Hard cap on how long we'll wait for the pro trial start dialog to be
    // dismissed before starting the tour. The dialog is shown on every fresh
    // first-run boot (where this tour also runs), so under normal conditions
    // the wait is bounded by the user dismissing it. The cap protects edge
    // cases where the dialog isn't shown at all (e.g. user already has a
    // subscription / a prior expired trial).
    const TRIAL_DIALOG_WAIT_TIMEOUT_MS = 60000;

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

    function _teardown() {
        _clearTimers();
        if ($overlay) {
            $overlay.remove();
            $overlay = null;
        }
    }

    const TOTAL_STEPS = 3;

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

    function _runStep1() {
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
        // Intentionally do NOT advance on a real click of the target — the
        // user needs time to read the prompt; only the Next button advances.
    }

    function _runStep3() {
        const $newBtn = $("#newProject");
        if (!$newBtn.length) {
            // No new-project button — tour is effectively done.
            _markComplete();
            _teardown();
            return;
        }
        _ensureOverlay();
        _trackTarget($newBtn, "right");
        _setStep(3);
        Metrics.countEvent(Metrics.EVENT_TYPE.GUIDE, "tour", "step3");
        _setText(Strings.PHOENIX_TOUR_NEW_PROJECT);
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
        // Intentionally do NOT end on a real click of the target — only the
        // Dismiss button ends the tour.
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
     * Resolves once the pro trial start dialog has been dismissed, or after
     * TRIAL_DIALOG_WAIT_TIMEOUT_MS as a fallback for builds/runs where the
     * dialog isn't shown.
     */
    function _waitForTrialStartDialogDismissed() {
        return new Promise(function (resolve) {
            const dismissed = _LoginService && _LoginService.proTrialStartDialogDismissed;
            if (!dismissed) {
                // No pro trial flow exposed — proceed immediately.
                resolve();
                return;
            }
            let settled = false;
            const fallback = setTimeout(function () {
                if (settled) {
                    return;
                }
                settled = true;
                resolve();
            }, TRIAL_DIALOG_WAIT_TIMEOUT_MS);
            // jQuery deferred or native promise — both implement .then
            Promise.resolve(dismissed).then(function () {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(fallback);
                resolve();
            });
        });
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
