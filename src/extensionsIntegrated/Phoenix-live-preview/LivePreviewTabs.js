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

/*
 * Liveness of the pages a live preview session talks to: the docked iframe and any
 * popped out tabs. Each page's worker sends a TAB_ONLINE heartbeat every few seconds,
 * and a page silent for longer than the timeout is reported closed, which is the only
 * close signal a crashed or killed tab ever gives. Silence is not always death, though:
 * the OS pauses the timers and sockets of a backgrounded or sleeping app. So a page that
 * heartbeats again after it was reported closed is reported back as connected, and a
 * check that finds the editor itself was paused gives every page a fresh window instead
 * of closing them all.
 */
define(function (require, exports, module) {

    const TAB_HEARTBEAT_TIMEOUT = 10000;
    const CHECK_INTERVAL = 1000;
    const MAX_EXPIRED = 50;

    // clientID -> {lastSeen: Date, URL: string, navigationTab: ?boolean}
    const livePreviewTabs = new Map();
    // clientID -> page url, for every page whose BROWSER_CONNECT the editor accepted
    const _pageURLs = new Map();
    // clientID -> page url, for the pages the heartbeat check reported closed
    const _expired = new Map();
    let _callbacks = null;
    let _timer = null;
    let _lastCheck = 0;

    /**
     * Records a page the editor accepted a connection from, so a later silence can be undone.
     * @param {string} clientID
     * @param {string} url the page url the connection was made with
     */
    function tabConnected(clientID, url) {
        _pageURLs.set(clientID, url);
        _expired.delete(clientID);
    }

    /**
     * A heartbeat. A page reported closed by the check is reported back as connected.
     * @param {string} clientID
     * @param {string} url
     * @param {boolean} [navigationTab] the loader tab hosting a popped out preview in the browser
     * @param {number} [now]
     */
    function tabOnline(clientID, url, navigationTab, now) {
        const info = { lastSeen: new Date(now || Date.now()), URL: url };
        if (navigationTab) {
            info.navigationTab = true;
        }
        livePreviewTabs.set(clientID, info);
        const pageURL = _expired.get(clientID);
        if (pageURL === undefined) {
            return;
        }
        _expired.delete(clientID);
        _pageURLs.set(clientID, pageURL);
        if (_callbacks) {
            _callbacks.reconnect(clientID, pageURL);
        }
    }

    /**
     * Forgets a page for good: one that closed itself, or one the editor removed. A late
     * heartbeat from it is then just a heartbeat, never a reconnect.
     * @param {string} clientID
     */
    function dropTab(clientID) {
        livePreviewTabs.delete(clientID);
        _pageURLs.delete(clientID);
        _expired.delete(clientID);
    }

    /**
     * Reports every page silent for longer than the timeout as closed.
     * @param {number} [now]
     */
    // Whether any page was heard from after the given time.
    function _heardSince(time) {
        for (const info of livePreviewTabs.values()) {
            if (info.lastSeen > time) {
                return true;
            }
        }
        return false;
    }

    function checkHeartbeats(now) {
        now = now || Date.now();
        const previousCheck = _lastCheck;
        _lastCheck = now;
        // A check that comes late with nothing heard in between is the editor itself
        // having been paused, so the silence is its own and not the pages'. A late
        // check with pages heard from in between is only this timer throttled in a
        // background window, and the silent pages are as dead as ever.
        if (previousCheck && now - previousCheck > TAB_HEARTBEAT_TIMEOUT && !_heardSince(previousCheck)) {
            livePreviewTabs.forEach(function (info) {
                info.lastSeen = new Date(now);
            });
            return;
        }
        for (const [clientID, info] of Array.from(livePreviewTabs.entries())) {
            if (now - info.lastSeen <= TAB_HEARTBEAT_TIMEOUT) {
                continue;
            }
            livePreviewTabs.delete(clientID);
            if (info.navigationTab) {
                continue;
            }
            const pageURL = _pageURLs.get(clientID);
            if (pageURL !== undefined) {
                _pageURLs.delete(clientID);
                _expired.set(clientID, pageURL);
                if (_expired.size > MAX_EXPIRED) {
                    _expired.delete(_expired.keys().next().value);
                }
            }
            if (_callbacks) {
                _callbacks.close(clientID);
            }
        }
    }

    /**
     * @param {{close: function(string), reconnect: function(string, string)}} callbacks
     */
    function setCallbacks(callbacks) {
        _callbacks = callbacks;
    }

    /**
     * Starts the periodic check. Safe to call more than once.
     * @param {{close: function(string), reconnect: function(string, string)}} callbacks
     */
    function start(callbacks) {
        setCallbacks(callbacks);
        if (_timer) {
            return;
        }
        _lastCheck = Date.now();
        _timer = setInterval(function () {
            checkHeartbeats();
        }, CHECK_INTERVAL);
    }

    function _resetForTests() {
        livePreviewTabs.clear();
        _pageURLs.clear();
        _expired.clear();
        _callbacks = null;
        _lastCheck = 0;
    }

    exports.livePreviewTabs = livePreviewTabs;
    exports.tabConnected = tabConnected;
    exports.tabOnline = tabOnline;
    exports.dropTab = dropTab;
    exports.checkHeartbeats = checkHeartbeats;
    exports.setCallbacks = setCallbacks;
    exports.start = start;
    exports.TAB_HEARTBEAT_TIMEOUT = TAB_HEARTBEAT_TIMEOUT;
    exports.MAX_EXPIRED = MAX_EXPIRED;
    exports._resetForTests = _resetForTests;
});
