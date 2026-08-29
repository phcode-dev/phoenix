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
 * Shared configuration for the one time move off the legacy web origin onto web.phcode.dev.
 *
 * Everything that has to change when the rollout moves forward lives here, which is the two
 * origins. `LEGACY_ORIGIN` is live and points at phcode.dev, which serves migrateAssist.html and
 * still holds the data of everyone who has not moved across yet.
 *
 * There is deliberately no retirement date. The move has no announced cutoff, and the runaway
 * probe case the date used to guard is already bounded per user by MAX_AUTO_ATTEMPTS.
 *
 * @module extensionsIntegrated/MigrateAssist/constants
 */
define(function (require, exports, module) {

    // Domain names, package ids and store urls are brand identifiers rather than prose. They must
    // render identically in every locale, so they stay here instead of going through strings.js.

    /**
     * The origin we are migrating away from. It must keep serving migrateAssist.html for as long as
     * migration is offered, since that page is what reads the old storage.
     * @type {string}
     */
    const LEGACY_ORIGIN = "https://phcode.dev";

    /**
     * The origin we are migrating to.
     * @type {string}
     */
    const NEW_ORIGIN = "https://web.phcode.dev";

    /**
     * Human readable form of the new origin, used inside translated sentences via StringUtils.format.
     * The legacy equivalent is derived from the origin instead, see getLegacyDomainName.
     */
    const NEW_DOMAIN_NAME = "web.phcode.dev";

    /**
     * PhStore key recording that the migration already ran. Once set, the automatic path never runs
     * again and the user has to ask for it from the Help menu.
     * @type {string}
     */
    const MIGRATION_DONE_KEY = "migrateAssist.v1.done";

    /**
     * PhStore key holding how many times the transfer has actually been started. The automatic path
     * gets MAX_AUTO_ATTEMPTS of them, so a single bad network moment does not cost the user their
     * migration, while a persistently broken setup stops nagging and points at the Help menu.
     * @type {string}
     */
    const MIGRATION_ATTEMPTS_KEY = "migrateAssist.v1.attempts";

    /**
     * One attempt, and one retry.
     * @type {number}
     */
    const MAX_AUTO_ATTEMPTS = 2;

    /**
     * Dev only override, so the whole cross origin flow can be exercised on one dev server.
     * http://localhost:8000 and http://127.0.0.1:8000 are different origins with separate IndexedDB
     * but the same files, and both are already trusted, so they make a usable legacy/new pair.
     * Set localStorage.MIGRATE_ORIGINS_OVERRIDE to {"legacy": "...", "target": "..."}.
     */
    const ORIGINS_OVERRIDE_KEY = "MIGRATE_ORIGINS_OVERRIDE";

    let _override = null;
    function _getOverride() {
        if (_override) {
            return _override;
        }
        _override = {};
        // Mirrors the accounts server override in index.html: dev builds only, never in tests, so a
        // stray localStorage value can never redirect a production user to an attacker's origin.
        if (Phoenix.isTestWindow || !Phoenix.config || Phoenix.config.environment !== "dev") {
            return _override;
        }
        try {
            const parsed = JSON.parse(localStorage.getItem(ORIGINS_OVERRIDE_KEY));
            if (parsed && typeof parsed.legacy === "string" && typeof parsed.target === "string") {
                _override = parsed;
                console.log("MigrateAssist: using dev origin override", _override);
            }
        } catch (e) {
            console.warn("MigrateAssist: could not read origin override, using defaults", e);
        }
        return _override;
    }

    /**
     * The origin holding the data to be moved.
     * @return {string}
     */
    function getLegacyOrigin() {
        return _getOverride().legacy || LEGACY_ORIGIN;
    }

    /**
     * The origin the data is being moved into.
     * @return {string}
     */
    function getNewOrigin() {
        return _getOverride().target || NEW_ORIGIN;
    }

    /**
     * True when this window is the site being retired.
     * @return {boolean}
     */
    function isLegacyOrigin() {
        return !Phoenix.isNativeApp && location.origin === getLegacyOrigin();
    }

    /**
     * True when this window is the new home.
     * @return {boolean}
     */
    function isNewOrigin() {
        return !Phoenix.isNativeApp && location.origin === getNewOrigin();
    }

    /**
     * Hostname of the origin being retired, for use inside user facing sentences. Derived from the
     * origin rather than written out separately so the two can never disagree, which matters because
     * the dev override below can repoint the legacy origin.
     * @return {string}
     */
    function getLegacyDomainName() {
        return new URL(getLegacyOrigin()).hostname;
    }

    /**
     * URL of the helper page on the legacy origin.
     *
     * Both origins serve the same artifact with the same layout, so the helper sits at the same path
     * prefix as the page asking for it. In production that is the origin root; on the dev server the
     * app lives under /src/, and hardcoding "/" there would 404.
     * @return {string}
     */
    function getMigrateAssistURL() {
        const pathname = location.pathname;
        const prefix = pathname.substring(0, pathname.lastIndexOf("/") + 1);
        return `${getLegacyOrigin()}${prefix}migrateAssist.html`;
    }

    /**
     * Safari and iOS are deliberately out of scope for the automatic migration. This is a product
     * decision rather than a technical limit; the same site iframe would very likely work there too.
     * @return {boolean}
     */
    function isMigrationSupportedBrowser() {
        return !(Phoenix.browser.desktop.isSafari || Phoenix.browser.mobile.isIos);
    }

    exports.NEW_DOMAIN_NAME = NEW_DOMAIN_NAME;
    exports.MIGRATION_DONE_KEY = MIGRATION_DONE_KEY;
    exports.MIGRATION_ATTEMPTS_KEY = MIGRATION_ATTEMPTS_KEY;
    exports.MAX_AUTO_ATTEMPTS = MAX_AUTO_ATTEMPTS;
    exports.getLegacyOrigin = getLegacyOrigin;
    exports.getMigrateAssistURL = getMigrateAssistURL;
    exports.getLegacyDomainName = getLegacyDomainName;
    exports.getNewOrigin = getNewOrigin;
    exports.isLegacyOrigin = isLegacyOrigin;
    exports.isNewOrigin = isNewOrigin;
    exports.isMigrationSupportedBrowser = isMigrationSupportedBrowser;
});
