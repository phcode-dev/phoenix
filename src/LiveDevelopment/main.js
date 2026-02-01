/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global less */

/**
 * main integrates LiveDevelopment into Brackets
 *
 * This module creates two menu items:
 *
 *  "Go Live": open or close a Live Development session and visualize the status
 *  "Highlight": toggle source highlighting
 */
define(function main(require, exports, module) {


    const CONSTANTS           = require("LiveDevelopment/LivePreviewConstants"),
        Commands            = require("command/Commands"),
        AppInit             = require("utils/AppInit"),
        MultiBrowserLiveDev = require("LiveDevelopment/LiveDevMultiBrowser"),
        LivePreviewTransport  = require("LiveDevelopment/MultiBrowserImpl/transports/LivePreviewTransport"),
        CommandManager      = require("command/CommandManager"),
        PreferencesManager  = require("preferences/PreferencesManager"),
        UrlParams           = require("utils/UrlParams").UrlParams,
        Strings             = require("strings"),
        ExtensionUtils      = require("utils/ExtensionUtils"),
        StringUtils         = require("utils/StringUtils"),
        EventDispatcher      = require("utils/EventDispatcher");

    const LIVE_PREVIEW_MODE = CONSTANTS.LIVE_PREVIEW_MODE,
        LIVE_HIGHLIGHT_MODE = CONSTANTS.LIVE_HIGHLIGHT_MODE,
        LIVE_EDIT_MODE = CONSTANTS.LIVE_EDIT_MODE;

    // this will later be assigned its correct values once entitlementsManager loads
    let hasLiveEditCapability = false;
    let isPaidUser = false;
    let isLoggedIn = false;

    const PREFERENCE_LIVE_PREVIEW_MODE = CONSTANTS.PREFERENCE_LIVE_PREVIEW_MODE;

    PreferencesManager.definePreference(PREFERENCE_LIVE_PREVIEW_MODE, "string", LIVE_HIGHLIGHT_MODE, {
        description: StringUtils.format(
            Strings.LIVE_PREVIEW_MODE_PREFERENCE, LIVE_PREVIEW_MODE, LIVE_HIGHLIGHT_MODE, LIVE_EDIT_MODE),
        values: [LIVE_PREVIEW_MODE, LIVE_HIGHLIGHT_MODE, LIVE_EDIT_MODE]
    }).on("change", function () {
        // when mode changes we update the config mode and notify remoteFunctions so that it can get updated
        _previewModeUpdated();
    });

    let params = new UrlParams();
    const defaultConfig = {
        mode: LIVE_HIGHLIGHT_MODE, // will be updated when we fetch entitlements
        elemHighlights: CONSTANTS.HIGHLIGHT_HOVER, // default value, this will get updated when the extension loads
        showRulerLines: false, // default value, this will get updated when the extension loads
        isPaidUser: false, // will be updated when we fetch entitlements
        isLoggedIn: false, // will be updated when we fetch entitlements
        hasLiveEditCapability: false // handled inside _liveEditCapabilityChanged function
    };

    // Status labels/styles are ordered: error, not connected, progress1, progress2, connected.
    var _status,
        _allStatusStyles = ["warning", "info", "success", "out-of-sync", "sync-error"].join(" ");

    var _$btnGoLive; // reference to the GoLive button

    /** Load Live Development LESS Style */
    function _loadStyles() {
        var lessText = require("text!LiveDevelopment/main.less");

        less.render(lessText, function onParse(err, tree) {
            console.assert(!err, err);
            ExtensionUtils.addEmbeddedStyleSheet(tree.css);
        });
    }

    /**
     * Change the appearance of a button. Omit text to remove any extra text; omit style to return to default styling;
     * omit tooltip to leave tooltip unchanged.
     */
    function _setLabel($btn, text, style, tooltip) {
        // Clear text/styles from previous status
        $("span", $btn).remove();
        $btn.removeClass(_allStatusStyles);

        // Set text/styles for new status
        if (text && text.length > 0) {
            $("<span class=\"label\">")
                .addClass(style)
                .text(text)
                .appendTo($btn);
        } else {
            $btn.addClass(style);
        }

        if (tooltip) {
            $btn.attr("title", tooltip);
        }
    }

    function closeLivePreview() {
        MultiBrowserLiveDev.close();
    }

    function openLivePreview(doc) {
        if (!Phoenix.isTestWindow) {
            MultiBrowserLiveDev.open(doc);
        }
    }

    function isInactive() {
        return MultiBrowserLiveDev.status === MultiBrowserLiveDev.STATUS_INACTIVE;
    }

    function isActive() {
        return MultiBrowserLiveDev.status === MultiBrowserLiveDev.STATUS_ACTIVE;
    }

    function setLivePreviewPinned(urlPinned, currentPinnedFilePath) {
        MultiBrowserLiveDev.setLivePreviewPinned(urlPinned, currentPinnedFilePath);
    }

    function setLivePreviewTransportBridge(transportBridge) {
        LivePreviewTransport.setLivePreviewTransportBridge(transportBridge);
    }

    /** Called on status change */
    function _showStatusChangeReason(reason) {
        // Destroy the previous twipsy (options are not updated otherwise)
        _$btnGoLive.twipsy("hide").removeData("twipsy");

        // If there was no reason or the action was an explicit request by the user, don't show a twipsy
        if (!reason || reason === "explicit_close") {
            return;
        }

        // Translate the reason
        var translatedReason = Strings["LIVE_DEV_" + reason.toUpperCase()];
        if (!translatedReason) {
            translatedReason = StringUtils.format(Strings.LIVE_DEV_CLOSED_UNKNOWN_REASON, reason);
        }

        // Configure the twipsy
        var options = {
            placement: "left",
            trigger: "manual",
            autoHideDelay: 5000,
            title: function () {
                return translatedReason;
            }
        };

        // Show the twipsy with the explanation
        _$btnGoLive.twipsy(options).twipsy("show");
    }

    /** Create the menu item "Go Live" */
    function _setupGoLiveButton() {
        if (!_$btnGoLive) {
            _$btnGoLive = $("#toolbar-go-live");
        }
        MultiBrowserLiveDev.on(MultiBrowserLiveDev.EVENT_STATUS_CHANGE, function statusChange(event, status, reason) {
            // status starts at -1 (error), so add one when looking up name and style
            // See the comments at the top of LiveDevelopment.js for details on the
            // various status codes.
            _setLabel(_$btnGoLive, null, _status[status + 1].style, _status[status + 1].tooltip);
            _showStatusChangeReason(reason);
        });

        // Initialize tooltip for 'not connected' state
        _setLabel(_$btnGoLive, null, _status[1].style, _status[1].tooltip);
    }

    /** Maintains state of the Live Preview menu item */
    function _setupGoLiveMenu() {
        MultiBrowserLiveDev.on(MultiBrowserLiveDev.EVENT_STATUS_CHANGE, function statusChange(event, status) {
            // Update the checkmark next to 'Live Preview' menu item
            // Add checkmark when status is STATUS_ACTIVE; otherwise remove it
            CommandManager.get(Commands.FILE_LIVE_FILE_PREVIEW)
                .setChecked(status === MultiBrowserLiveDev.STATUS_ACTIVE);
        });
    }

    /**
     * Internal api used to update live edit capability status as entitlements changes. calling this will update the UI
     * but will not functionally enable live editing capabilities as that are dependent on entitlements framework.
     * @param newCapability
     * @private
     */
    function _liveEditCapabilityChanged(newCapability) {
        if(newCapability !== hasLiveEditCapability){
            hasLiveEditCapability = newCapability;

            // update the config to include the live edit capability
            const config = MultiBrowserLiveDev.getConfig();
            config.hasLiveEditCapability = hasLiveEditCapability;
            MultiBrowserLiveDev.updateConfig(config);

            if(!hasLiveEditCapability && getCurrentMode() === LIVE_EDIT_MODE){
                // downgraded, so we need to disable live edit mode
                setMode(LIVE_HIGHLIGHT_MODE);
            } else if(hasLiveEditCapability) {
                // this means that the user has switched to pro-account and we need to enable live edit mode
                // as user may have just logged in with a pro-capable account/upgraded to pro.
                setMode(LIVE_EDIT_MODE);
            }
        }
    }

    function _isPaidUserChanged(newStatus) {
        if(newStatus !== isPaidUser){
            isPaidUser = newStatus;
            const config = MultiBrowserLiveDev.getConfig();
            config.isPaidUser = isPaidUser;
            MultiBrowserLiveDev.updateConfig(config);
        }
    }

    function _isLoggedInChanged(newStatus) {
        if(newStatus !== isLoggedIn){
            isLoggedIn = newStatus;
            const config = MultiBrowserLiveDev.getConfig();
            config.isLoggedIn = isLoggedIn;
            MultiBrowserLiveDev.updateConfig(config);
        }
    }

    function setMode(mode) {
        if (mode === LIVE_EDIT_MODE && !hasLiveEditCapability) {
            return false;
        }
        PreferencesManager.set(PREFERENCE_LIVE_PREVIEW_MODE, mode);
        return true;
    }

    function getCurrentMode() {
        return PreferencesManager.get(PREFERENCE_LIVE_PREVIEW_MODE);
    }

    function isInPreviewMode() {
        return getCurrentMode() === LIVE_PREVIEW_MODE;
    }

    /** Initialize LiveDevelopment */
    AppInit.appReady(function () {
        params.parse();
        const config = Object.assign({}, defaultConfig, MultiBrowserLiveDev.getConfig());
        config.mode = getCurrentMode();
        MultiBrowserLiveDev.init(config);

        _loadStyles();

        // update styles for UI status
        _status = [
            { tooltip: Strings.LIVE_DEV_STATUS_TIP_NOT_CONNECTED, style: "warning" },
            { tooltip: Strings.LIVE_DEV_STATUS_TIP_NOT_CONNECTED, style: "" },
            { tooltip: Strings.LIVE_DEV_STATUS_TIP_PROGRESS1, style: "info" },
            { tooltip: Strings.LIVE_DEV_STATUS_TIP_CONNECTED, style: "success" },
            { tooltip: Strings.LIVE_DEV_STATUS_TIP_OUT_OF_SYNC, style: "out-of-sync" },
            { tooltip: Strings.LIVE_DEV_STATUS_TIP_SYNC_ERROR, style: "sync-error" },
            { tooltip: Strings.LIVE_DEV_STATUS_TIP_PROGRESS1, style: "info" },
            { tooltip: Strings.LIVE_DEV_STATUS_TIP_PROGRESS1, style: "info" }
        ];
        // setup status changes listeners for new implementation
        _setupGoLiveButton();
        _setupGoLiveMenu();

        MultiBrowserLiveDev.on(MultiBrowserLiveDev.EVENT_OPEN_PREVIEW_URL, function (event, previewDetails) {
            exports.trigger(exports.EVENT_OPEN_PREVIEW_URL, previewDetails);
        });
        MultiBrowserLiveDev.on(MultiBrowserLiveDev.EVENT_CONNECTION_CLOSE, function (event, {clientId}) {
            exports.trigger(exports.EVENT_CONNECTION_CLOSE, {clientId});
        });
        MultiBrowserLiveDev.on(MultiBrowserLiveDev.EVENT_LIVE_PREVIEW_CLICKED, function (_event, clickDetails) {
            exports.trigger(exports.EVENT_LIVE_PREVIEW_CLICKED, clickDetails);
        });
        MultiBrowserLiveDev.on(MultiBrowserLiveDev.EVENT_LIVE_PREVIEW_RELOAD, function (_event, clientDetails) {
            exports.trigger(exports.EVENT_LIVE_PREVIEW_RELOAD, clientDetails);
        });
    });

    function _previewModeUpdated() {
        const currentMode = getCurrentMode();
        if (currentMode === LIVE_EDIT_MODE && !hasLiveEditCapability) {
            PreferencesManager.set(PREFERENCE_LIVE_PREVIEW_MODE, LIVE_HIGHLIGHT_MODE);
            // we will get another update event for this immediately, so just return.
            return;
        }
        const config = MultiBrowserLiveDev.getConfig();
        config.mode = currentMode;
        MultiBrowserLiveDev.updateConfig(config);
    }

    // this function is responsible to update element highlight config
    // called from live preview extension when preference changes
    function updateElementHighlightConfig() {
        const prefValue = PreferencesManager.get(CONSTANTS.PREFERENCE_PROJECT_ELEMENT_HIGHLIGHT);
        const config = MultiBrowserLiveDev.getConfig();
        config.elemHighlights = prefValue || CONSTANTS.HIGHLIGHT_HOVER;
        MultiBrowserLiveDev.updateConfig(config);
    }

    function updateRulerLinesConfig() {
        const prefValue = PreferencesManager.get(CONSTANTS.PREFERENCE_SHOW_RULER_LINES);
        const config = MultiBrowserLiveDev.getConfig();
        config.showRulerLines = prefValue || false;
        MultiBrowserLiveDev.updateConfig(config);
    }

    EventDispatcher.makeEventDispatcher(exports);

    // private api
    exports._liveEditCapabilityChanged = _liveEditCapabilityChanged;
    exports._isPaidUserChanged = _isPaidUserChanged;
    exports._isLoggedInChanged = _isLoggedInChanged;

    // public events
    exports.EVENT_OPEN_PREVIEW_URL = MultiBrowserLiveDev.EVENT_OPEN_PREVIEW_URL;
    exports.EVENT_CONNECTION_CLOSE = MultiBrowserLiveDev.EVENT_CONNECTION_CLOSE;
    exports.EVENT_LIVE_PREVIEW_CLICKED = MultiBrowserLiveDev.EVENT_LIVE_PREVIEW_CLICKED;
    exports.EVENT_LIVE_PREVIEW_RELOAD = MultiBrowserLiveDev.EVENT_LIVE_PREVIEW_RELOAD;

    // Export public functions
    exports.CONSTANTS = CONSTANTS;
    exports.openLivePreview = openLivePreview;
    exports.closeLivePreview = closeLivePreview;
    exports.isInactive = isInactive;
    exports.isActive = isActive;
    exports.setLivePreviewPinned = setLivePreviewPinned;
    exports.setLivePreviewTransportBridge = setLivePreviewTransportBridge;
    exports.updateElementHighlightConfig = updateElementHighlightConfig;
    exports.updateRulerLinesConfig = updateRulerLinesConfig;
    exports.getConnectionIds = MultiBrowserLiveDev.getConnectionIds;
    exports.getLivePreviewDetails = MultiBrowserLiveDev.getLivePreviewDetails;
    exports.hideHighlight = MultiBrowserLiveDev.hideHighlight;
    exports.setMode = setMode;
    exports.getCurrentMode = getCurrentMode;
    exports.isInPreviewMode = isInPreviewMode;
});
