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
 * Bidirectional sync between Phoenix's CM5 document editor and the mdviewr iframe.
 * Handles content sync, theme sync, locale sync, and edit mode relay.
 */

define(function (require, exports, module) {

    const ThemeManager = require("view/ThemeManager"),
        NativeApp = require("utils/NativeApp"),
        utils = require("./utils");

    let _active = false;
    let _doc = null;
    let _$iframe = null;
    let _baseURL = "";
    let _syncId = 0;
    let _lastReceivedSyncId = -1;
    let _syncingFromIframe = false;
    let _iframeReady = false;
    let _debounceTimer = null;
    let _messageHandler = null;
    let _docChangeHandler = null;
    let _themeChangeHandler = null;

    const DEBOUNCE_TO_IFRAME_MS = 150;

    /**
     * Start syncing for the given document and iframe.
     * If the iframe is the same as the previous activation (e.g. switching between markdown files),
     * content is sent immediately without waiting for mdviewrReady.
     *
     * @param {Document} doc - Phoenix CM5 Document
     * @param {jQuery} $iframe - The iframe jQuery element
     * @param {string} baseURL - Base URL for resolving relative image/resource paths
     */
    function activate(doc, $iframe, baseURL) {
        const sameIframe = _$iframe && $iframe && _$iframe[0] === $iframe[0];

        if (_active) {
            deactivate();
        }

        _doc = doc;
        _$iframe = $iframe;
        _baseURL = baseURL;
        _active = true;
        _iframeReady = sameIframe; // If reusing iframe, it's already ready
        _syncId = 0;
        _lastReceivedSyncId = -1;

        // Listen for messages from iframe
        _messageHandler = function (event) {
            if (!_active) {
                return;
            }
            const data = event.data;
            if (!data || data.type !== "MDVIEWR_EVENT") {
                return;
            }
            // Verify message is from our iframe
            if (_$iframe && _$iframe[0] && event.source !== _$iframe[0].contentWindow) {
                return;
            }

            switch (data.eventName) {
            case "mdviewrReady":
                _onIframeReady();
                break;
            case "mdviewrContentChanged":
                _onIframeContentChanged(data);
                break;
            case "mdviewrEditModeChanged":
                // Could be used to sync edit mode UI state in Phoenix if needed
                break;
            case "embeddedIframeFocusEditor":
                utils.focusActiveEditorIfFocusInLivePreview();
                break;
            case "embeddedIframeHrefClick":
                _handleHrefClick(data);
                break;
            case "embeddedEscapeKeyPressed":
                utils.focusActiveEditorIfFocusInLivePreview();
                break;
            }
        };
        window.addEventListener("message", _messageHandler);

        // Listen for CM5 document changes (Phoenix → iframe)
        _docChangeHandler = function () {
            if (_syncingFromIframe) {
                return;
            }
            if (!_iframeReady) {
                return;
            }
            clearTimeout(_debounceTimer);
            _debounceTimer = setTimeout(function () {
                _sendUpdate();
            }, DEBOUNCE_TO_IFRAME_MS);
        };
        _doc.on("change", _docChangeHandler);

        // Listen for theme changes
        _themeChangeHandler = function () {
            _sendTheme();
        };
        ThemeManager.on("themeChange", _themeChangeHandler);

        // If iframe is already ready (reusing same iframe), send content immediately
        if (_iframeReady) {
            _sendContent();
            _sendTheme();
            _sendLocale();
        }
    }

    /**
     * Stop syncing, remove all listeners.
     */
    function deactivate() {
        if (!_active) {
            return;
        }

        clearTimeout(_debounceTimer);

        if (_doc && _docChangeHandler) {
            _doc.off("change", _docChangeHandler);
        }

        if (_messageHandler) {
            window.removeEventListener("message", _messageHandler);
        }

        if (_themeChangeHandler) {
            ThemeManager.off("themeChange", _themeChangeHandler);
        }

        _doc = null;
        _$iframe = null;
        _active = false;
        _iframeReady = false;
        _docChangeHandler = null;
        _messageHandler = null;
        _themeChangeHandler = null;
    }

    /**
     * @return {boolean} Whether mdviewr sync is currently active
     */
    function isActive() {
        return _active;
    }

    // --- iframe ready ---

    function _onIframeReady() {
        _iframeReady = true;
        _sendContent();
        _sendTheme();
        _sendLocale();
    }

    // --- Phoenix → iframe ---

    function _sendContent() {
        if (!_active || !_iframeReady || !_doc) {
            return;
        }
        const iframeWindow = _getIframeWindow();
        if (!iframeWindow) {
            return;
        }

        iframeWindow.postMessage({
            type: "MDVIEWR_SET_CONTENT",
            markdown: _doc.getText(),
            baseURL: _baseURL,
            filePath: _doc.file.fullPath
        }, "*");
    }

    function _sendUpdate() {
        if (!_active || !_iframeReady || !_doc) {
            return;
        }
        const iframeWindow = _getIframeWindow();
        if (!iframeWindow) {
            return;
        }

        _syncId++;
        iframeWindow.postMessage({
            type: "MDVIEWR_UPDATE_CONTENT",
            markdown: _doc.getText(),
            _syncId: _syncId
        }, "*");
    }

    function _sendTheme() {
        if (!_active || !_iframeReady) {
            return;
        }
        const iframeWindow = _getIframeWindow();
        if (!iframeWindow) {
            return;
        }

        const currentTheme = ThemeManager.getCurrentTheme();
        const isDark = currentTheme && currentTheme.dark;
        iframeWindow.postMessage({
            type: "MDVIEWR_SET_THEME",
            theme: isDark ? "dark" : "light"
        }, "*");
    }

    function _sendLocale() {
        if (!_active || !_iframeReady) {
            return;
        }
        const iframeWindow = _getIframeWindow();
        if (!iframeWindow) {
            return;
        }

        iframeWindow.postMessage({
            type: "MDVIEWR_SET_LOCALE",
            locale: brackets.getLocale()
        }, "*");
    }

    // --- iframe → Phoenix ---

    function _onIframeContentChanged(data) {
        if (!_active || !_doc) {
            return;
        }

        const markdown = data.markdown;
        const remoteSyncId = data._syncId;

        // Ignore stale updates
        if (remoteSyncId !== undefined && remoteSyncId <= _lastReceivedSyncId) {
            return;
        }
        if (remoteSyncId !== undefined) {
            _lastReceivedSyncId = remoteSyncId;
        }

        _syncingFromIframe = true;
        _doc.setText(markdown);
        _syncingFromIframe = false;
    }

    function _handleHrefClick(data) {
        const href = data.href;
        if (!href) {
            return;
        }
        NativeApp.openURLInDefaultBrowser(href);
    }

    // --- Helpers ---

    function _getIframeWindow() {
        if (!_$iframe || !_$iframe[0]) {
            return null;
        }
        return _$iframe[0].contentWindow;
    }

    exports.activate = activate;
    exports.deactivate = deactivate;
    exports.isActive = isActive;
});
