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

/*global logger*/

/**
 * Coordinates the boot-time greeting dialogs (auto-update "What's New",
 * pro trial start, paid-Pro "What's New") so that downstream UI like the
 * onboarding tour can wait until none of them are on screen.
 *
 * Usage:
 *   // At module load (synchronously, before AppInit.appReady):
 *   BootGreetings.registerBlocker("pro-greeting");
 *
 *   // Once that module has decided/finished — every code path, including
 *   // error paths:
 *   BootGreetings.unblockBlocker("pro-greeting");
 *
 *   // From the consumer (e.g. onboarding tour):
 *   await BootGreetings.allDismissed();
 *
 * Contract: every registered blocker MUST be unblocked on every code
 * path. If a module forgets, `allDismissed` stays pending forever and the
 * downstream UI never fires. The names make a forgotten gate easy to
 * spot in a debugger by inspecting which entries are still pending.
 */
define(function (require, exports, module) {

    // Name -> entry. Each entry holds the promise and resolver and a
    // `resolved` flag so a duplicate `unblockBlocker` is a no-op.
    const _blockers = new Map();

    /**
     * Reserve a named blocker. Names must be unique and non-empty —
     * misuse is reported via `logger.reportError` (which surfaces to the
     * error logger without crashing the app) and the call is otherwise a
     * no-op. Boot stability matters more than a strict contract here.
     *
     * @param {string} name Short identifier (e.g. "pro-greeting").
     */
    function registerBlocker(name) {
        if (!name) {
            logger.reportError(new Error("BootGreetings.registerBlocker called without a name"));
            return;
        }
        if (_blockers.has(name)) {
            logger.reportError(new Error(
                "BootGreetings: blocker '" + name + "' is already registered"));
            return;
        }
        let resolveFn;
        const promise = new Promise(function (resolve) {
            resolveFn = resolve;
        });
        _blockers.set(name, { promise: promise, resolve: resolveFn, resolved: false });
    }

    /**
     * Mark a registered blocker as done. Safe to call more than once.
     * An unknown name is reported via `logger.reportError` but does not
     * disrupt the boot flow.
     *
     * @param {string} name The name passed to `registerBlocker`.
     */
    function unblockBlocker(name) {
        const entry = _blockers.get(name);
        if (!entry) {
            logger.reportError(new Error(
                "BootGreetings.unblockBlocker: unknown blocker '" + name + "'"));
            return;
        }
        if (entry.resolved) {
            return;
        }
        entry.resolved = true;
        entry.resolve();
    }

    /**
     * Resolves once every registered blocker has been unblocked.
     *
     * @return {Promise<void>}
     */
    function allDismissed() {
        if (!_blockers.size) {
            return Promise.resolve();
        }
        const promises = [];
        _blockers.forEach(function (entry) { promises.push(entry.promise); });
        return Promise.all(promises);
    }

    exports.registerBlocker = registerBlocker;
    exports.unblockBlocker = unblockBlocker;
    exports.allDismissed = allDismissed;
});
