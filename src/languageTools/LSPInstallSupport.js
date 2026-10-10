/*
 * Copyright (c) 2026 core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

define(function (require, exports, module) {
    const TaskManager = require("features/TaskManager"),
        Dialogs = require("widgets/Dialogs"),
        Strings = require("strings"),
        _ = require("thirdparty/lodash");

    /** @return {string} Today's local calendar date, shared across app restarts. */
    function today() {
        const now = new Date();
        return now.getFullYear() + "-" + (now.getMonth() + 1) + "-" + now.getDate();
    }

    /**
     * Keep automatic setup to one attempt per day and leave manual recovery in the task list.
     * @param {string} id Stable language/tool identifier.
     * @param {string} title Localized task and error dialog title.
     * @param {string} iconHTML Task icon markup.
     * @return {Object} Install attempt policy and task helpers.
     */
    function create(id, title, iconHTML) {
        const storageKey = "lsp-install-" + id;
        let recoveryTask = null;

        /** @return {Object} The last attempt and optional error, without affecting other tools. */
        function readState() {
            try {
                const state = JSON.parse(PhStore.getItem(storageKey) || "null");
                return state && typeof state === "object" ? state : {};
            } catch (err) {
                return {};
            }
        }

        /** @return {boolean} Whether automatic setup may start today. */
        function canAutoInstall() {
            return readState().date !== today();
        }

        /** Remove an old recovery task before starting a new attempt or after dismissal. */
        function clearTask() {
            if (recoveryTask) {
                recoveryTask.close();
                recoveryTask = null;
            }
        }

        /** Record actual attempts, including manual retries, before downloads or file changes. */
        function recordAttempt() {
            clearTask();
            PhStore.setItem(storageKey, JSON.stringify({ date: today() }));
        }

        /** Show technical details only when requested; Copy leaves the dialog open. */
        function showDetails() {
            const error = readState().error;
            if (!error) {
                return;
            }
            const dialog = Dialogs.showModalDialog("lsp-install-error", title,
                "<p>" + _.escape(Strings.LSP_INSTALL_ERROR_DETAILS) + "</p>" +
                '<pre style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:300px;overflow:auto;">' +
                _.escape(error) + "</pre>", [
                    { className: "left", id: "copy", text: Strings.COPY_ERROR },
                    { className: "primary", id: Dialogs.DIALOG_BTN_OK, text: Strings.OK }
                ], false);
            dialog.getElement().on("buttonClick", function (event, buttonId) {
                if (buttonId === "copy") {
                    Phoenix.app.copyToClipboard(error);
                } else {
                    dialog.close();
                }
            });
        }

        /**
         * Reuse one quiet task when today's attempt has already run.
         * @param {function(): Promise} install Explicit install/retry action, unaffected by the daily limit.
         */
        function showManualInstall(install) {
            if (recoveryTask) {
                return;
            }
            recoveryTask = TaskManager.addNewTask(title, Strings.LSP_INSTALL_MANUAL, iconHTML, {
                noSpinnerNotification: true,
                hideProgressBar: true,
                onRetryClick: function () { clearTask(); install(); },
                onStopClick: clearTask,
                onSelect: showDetails
            });
            recoveryTask.showRestartIcon(Strings.LSP_INSTALL_NOW);
            recoveryTask.showStopIcon(Strings.CLOSE);
        }

        /**
         * Keep a failed task actionable without a toast or raw error text in the task list.
         * @param {Object} task The existing installation task.
         * @param {Error} error Failure whose details can be copied on request.
         */
        function showFailure(task, error) {
            const state = readState();
            state.error = (error && error.message) || String(error);
            PhStore.setItem(storageKey, JSON.stringify(state));
            recoveryTask = task;
            task.onSelect = showDetails;
            task.onStopClick = clearTask;
            task.setFailed();
            task.setMessage(Strings.LSP_INSTALL_FAILED);
            task.showRestartIcon(Strings.LSP_INSTALL_NOW);
            task.showStopIcon(Strings.CLOSE);
        }

        return { canAutoInstall, recordAttempt, showManualInstall, showFailure };
    }

    exports.create = create;
});
