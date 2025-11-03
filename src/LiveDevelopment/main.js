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

/*global less, Phoenix */

/**
 * main integrates LiveDevelopment into Brackets
 *
 * This module creates two menu items:
 *
 *  "Go Live": open or close a Live Development session and visualize the status
 *  "Highlight": toggle source highlighting
 */
define(function main(require, exports, module) {


    const Commands            = require("command/Commands"),
        AppInit             = require("utils/AppInit"),
        MultiBrowserLiveDev = require("LiveDevelopment/LiveDevMultiBrowser"),
        LivePreviewTransport  = require("LiveDevelopment/MultiBrowserImpl/transports/LivePreviewTransport"),
        CommandManager      = require("command/CommandManager"),
        PreferencesManager  = require("preferences/PreferencesManager"),
        StateManager        = require("preferences/StateManager"),
        UrlParams           = require("utils/UrlParams").UrlParams,
        Strings             = require("strings"),
        ExtensionUtils      = require("utils/ExtensionUtils"),
        StringUtils         = require("utils/StringUtils"),
        EventDispatcher      = require("utils/EventDispatcher"),
        WorkspaceManager    = require("view/WorkspaceManager"),
        EditorManager      = require("editor/EditorManager");


    // this is responsible to make the advanced live preview features active or inactive
    // @abose (make the first value true when its a paid user, everything rest is handled automatically)
    let isProUser = window.KernalModeTrust ? true : false;
    // when isFreeTrialUser is true isProUser should also be true
    // when its false, isProUser can be true/false doesn't matter
    let isFreeTrialUser = true;

    const EVENT_LIVE_HIGHLIGHT_PREF_CHANGED = "liveHighlightPrefChange";

    // state manager key to track image gallery selected state, by default we keep this as selected
    // if this is true we show the image gallery when an image element is clicked
    const IMAGE_GALLERY_STATE = "livePreview.imageGallery.state";

    /**
     * get the image gallery state from StateManager
     * @returns {boolean} true (default)
     */
    function _getImageGalleryState() {
        const savedState = StateManager.get(IMAGE_GALLERY_STATE);
        return savedState !== undefined && savedState !== null ? savedState : true;
    }

    /**
     * sets the image gallery state
     * @param {Boolean} the state that we need to set
     */
    function setImageGalleryState(state) {
        StateManager.set(IMAGE_GALLERY_STATE, state);

        // update the config with the new state
        config.imageGalleryState = state;
        if (MultiBrowserLiveDev && MultiBrowserLiveDev.status >= MultiBrowserLiveDev.STATUS_ACTIVE) {
            MultiBrowserLiveDev.updateConfig(JSON.stringify(config));
        }
    }

    var params = new UrlParams();
    var config = {
        experimental: false, // enable experimental features
        debug: true, // enable debug output and helpers
        highlight: true, // enable highlighting?
        highlightConfig: { // the highlight configuration for the Inspector
            borderColor:  {r: 255, g: 229, b: 153, a: 0.66},
            contentColor: {r: 111, g: 168, b: 220, a: 0.55},
            marginColor:  {r: 246, g: 178, b: 107, a: 0.66},
            paddingColor: {r: 147, g: 196, b: 125, a: 0.66},
            showInfo: true
        },
        isProUser: isProUser,
        elemHighlights: "hover", // default value, this will get updated when the extension loads
        imageGalleryState: _getImageGalleryState(), // image gallery selected state
        // this strings are used in RemoteFunctions.js
        // we need to pass this through config as remoteFunctions runs in browser context and cannot
        // directly reference Strings file
        strings: {
            selectParent: Strings.LIVE_DEV_MORE_OPTIONS_SELECT_PARENT,
            editText: Strings.LIVE_DEV_MORE_OPTIONS_EDIT_TEXT,
            duplicate: Strings.LIVE_DEV_MORE_OPTIONS_DUPLICATE,
            delete: Strings.LIVE_DEV_MORE_OPTIONS_DELETE,
            ai: Strings.LIVE_DEV_MORE_OPTIONS_AI,
            imageGallery: Strings.LIVE_DEV_MORE_OPTIONS_IMAGE_GALLERY,
            aiPromptPlaceholder: Strings.LIVE_DEV_AI_PROMPT_PLACEHOLDER,
            imageGalleryUseImage: Strings.LIVE_DEV_IMAGE_GALLERY_USE_IMAGE,
            imageGallerySelectFromComputer: Strings.LIVE_DEV_IMAGE_GALLERY_SELECT_FROM_COMPUTER,
            imageGallerySelectDownloadFolder: Strings.LIVE_DEV_IMAGE_GALLERY_SELECT_DOWNLOAD_FOLDER,
            imageGallerySearchPlaceholder: Strings.LIVE_DEV_IMAGE_GALLERY_SEARCH_PLACEHOLDER,
            imageGallerySearchButton: Strings.LIVE_DEV_IMAGE_GALLERY_SEARCH_BUTTON,
            imageGalleryLoadingInitial: Strings.LIVE_DEV_IMAGE_GALLERY_LOADING_INITIAL,
            imageGalleryLoadingMore: Strings.LIVE_DEV_IMAGE_GALLERY_LOADING_MORE,
            imageGalleryNoImages: Strings.LIVE_DEV_IMAGE_GALLERY_NO_IMAGES,
            imageGalleryLoadError: Strings.LIVE_DEV_IMAGE_GALLERY_LOAD_ERROR,
            imageGalleryClose: Strings.LIVE_DEV_IMAGE_GALLERY_CLOSE,
            imageGalleryUpload: Strings.LIVE_DEV_IMAGE_GALLERY_UPLOAD
        }
    };
    // Status labels/styles are ordered: error, not connected, progress1, progress2, connected.
    var _status,
        _allStatusStyles = ["warning", "info", "success", "out-of-sync", "sync-error"].join(" ");

    var _$btnGoLive; // reference to the GoLive button

    var prefs = PreferencesManager.getExtensionPrefs("livedev");

    // "livedev.remoteHighlight" preference
    var PREF_REMOTEHIGHLIGHT = "remoteHighlight";
    var remoteHighlightPref = prefs.definePreference(PREF_REMOTEHIGHLIGHT, "object", {
        animateStartValue: {
            "background-color": "rgba(0, 162, 255, 0.5)",
            "opacity": 0
        },
        animateEndValue: {
            "background-color": "rgba(0, 162, 255, 0)",
            "opacity": 0.6
        },
        "paddingStyling": {
            "background-color": "rgba(200, 249, 197, 0.7)"
        },
        "marginStyling": {
            "background-color": "rgba(249, 204, 157, 0.7)"
        },
        "borderColor": "rgba(200, 249, 197, 0.85)",
        "showPaddingMargin": true
    }, {
        description: Strings.DESCRIPTION_LIVE_DEV_HIGHLIGHT_SETTINGS
    });

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
            CommandManager.get(Commands.FILE_LIVE_HIGHLIGHT)
                .setEnabled(status === MultiBrowserLiveDev.STATUS_ACTIVE);
        });
    }

    function _updateHighlightCheckmark() {
        CommandManager.get(Commands.FILE_LIVE_HIGHLIGHT).setChecked(config.highlight);
        exports.trigger(EVENT_LIVE_HIGHLIGHT_PREF_CHANGED, config.highlight);
    }

    function togglePreviewHighlight() {
        config.highlight = !config.highlight;
        _updateHighlightCheckmark();
        if (config.highlight) {
            MultiBrowserLiveDev.showHighlight();
        } else {
            MultiBrowserLiveDev.hideHighlight();
        }
        PreferencesManager.setViewState("livedevHighlight", config.highlight);
    }

    /** Setup window references to useful LiveDevelopment modules */
    function _setupDebugHelpers() {
        window.report = function report(params) { window.params = params; console.info(params); };
    }

    /** force reload the live preview currently only with shortcut ctrl-shift-R */
    function _handleReloadLivePreviewCommand() {
        if (MultiBrowserLiveDev.status >= MultiBrowserLiveDev.STATUS_ACTIVE) {
            MultiBrowserLiveDev.reload();
        }
    }

    /**
     * this function handles escape key for live preview to hide boxes if they are visible
     * @param {Event} event
     */
    function _handleLivePreviewEscapeKey(event) {
        // we only handle the escape keypress for live preview when its active
        if (MultiBrowserLiveDev.status === MultiBrowserLiveDev.STATUS_ACTIVE) {
            MultiBrowserLiveDev.dismissLivePreviewBoxes();
        }
        // returning false to let the editor also handle the escape key
        return false;
    }

    /** Initialize LiveDevelopment */
    AppInit.appReady(function () {
        params.parse();
        config.remoteHighlight = prefs.get(PREF_REMOTEHIGHLIGHT);

        // init experimental multi-browser implementation
        // it can be enable by setting 'livedev.multibrowser' preference to true.
        // It has to be initiated at this point in case of dynamically switching
        // by changing the preference value.
        MultiBrowserLiveDev.init(config);

        _loadStyles();
        _updateHighlightCheckmark();

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

        if (config.debug) {
            _setupDebugHelpers();
        }

        remoteHighlightPref
            .on("change", function () {
                config.remoteHighlight = prefs.get(PREF_REMOTEHIGHLIGHT);
                if (MultiBrowserLiveDev && MultiBrowserLiveDev.status >= MultiBrowserLiveDev.STATUS_ACTIVE) {
                    MultiBrowserLiveDev.updateConfig(JSON.stringify(config));
                }
            });

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

        // allow live preview to handle escape key event
        // Escape is mainly to hide boxes if they are visible
        WorkspaceManager.addEscapeKeyEventHandler("livePreview", _handleLivePreviewEscapeKey);
    });

    // init prefs
    PreferencesManager.stateManager.definePreference("livedevHighlight", "boolean", true)
        .on("change", function () {
            config.highlight = PreferencesManager.getViewState("livedevHighlight");
            _updateHighlightCheckmark();
            if (MultiBrowserLiveDev && MultiBrowserLiveDev.status >= MultiBrowserLiveDev.STATUS_ACTIVE) {
                MultiBrowserLiveDev.updateConfig(JSON.stringify(config));
            }
        });

    config.highlight = PreferencesManager.getViewState("livedevHighlight");

    function setLivePreviewEditFeaturesActive(enabled) {
        // TODO: @abose here add kernal mode trust check
        isProUser = enabled;
        config.isProUser = enabled;
        if (MultiBrowserLiveDev && MultiBrowserLiveDev.status >= MultiBrowserLiveDev.STATUS_ACTIVE) {
            MultiBrowserLiveDev.updateConfig(JSON.stringify(config));
            MultiBrowserLiveDev.registerHandlers();
        }
    }

    // this function is responsible to update element highlight config
    // called from live preview extension when preference changes
    function updateElementHighlightConfig() {
        const prefValue = PreferencesManager.get("livePreviewElementHighlights");
        config.elemHighlights = prefValue || "hover";
        if (MultiBrowserLiveDev && MultiBrowserLiveDev.status >= MultiBrowserLiveDev.STATUS_ACTIVE) {
            MultiBrowserLiveDev.updateConfig(JSON.stringify(config));
            MultiBrowserLiveDev.registerHandlers();
        }
    }

    // init commands
    CommandManager.register(Strings.CMD_LIVE_HIGHLIGHT, Commands.FILE_LIVE_HIGHLIGHT, togglePreviewHighlight);
    CommandManager.register(Strings.CMD_RELOAD_LIVE_PREVIEW, Commands.CMD_RELOAD_LIVE_PREVIEW, _handleReloadLivePreviewCommand);

    CommandManager.get(Commands.FILE_LIVE_HIGHLIGHT).setEnabled(false);

    EventDispatcher.makeEventDispatcher(exports);

    exports.isProUser = isProUser;
    exports.isFreeTrialUser = isFreeTrialUser;

    // public events
    exports.EVENT_OPEN_PREVIEW_URL = MultiBrowserLiveDev.EVENT_OPEN_PREVIEW_URL;
    exports.EVENT_CONNECTION_CLOSE = MultiBrowserLiveDev.EVENT_CONNECTION_CLOSE;
    exports.EVENT_LIVE_PREVIEW_CLICKED = MultiBrowserLiveDev.EVENT_LIVE_PREVIEW_CLICKED;
    exports.EVENT_LIVE_PREVIEW_RELOAD = MultiBrowserLiveDev.EVENT_LIVE_PREVIEW_RELOAD;
    exports.EVENT_LIVE_HIGHLIGHT_PREF_CHANGED = EVENT_LIVE_HIGHLIGHT_PREF_CHANGED;

    // Export public functions
    exports.openLivePreview = openLivePreview;
    exports.closeLivePreview = closeLivePreview;
    exports.isInactive = isInactive;
    exports.isActive = isActive;
    exports.setLivePreviewPinned = setLivePreviewPinned;
    exports.setLivePreviewTransportBridge = setLivePreviewTransportBridge;
    exports.togglePreviewHighlight = togglePreviewHighlight;
    exports.setLivePreviewEditFeaturesActive = setLivePreviewEditFeaturesActive;
    exports.setImageGalleryState = setImageGalleryState;
    exports.updateElementHighlightConfig = updateElementHighlightConfig;
    exports.getConnectionIds = MultiBrowserLiveDev.getConnectionIds;
    exports.getLivePreviewDetails = MultiBrowserLiveDev.getLivePreviewDetails;
    exports.hideHighlight = MultiBrowserLiveDev.hideHighlight;
    exports.dismissLivePreviewBoxes = MultiBrowserLiveDev.dismissLivePreviewBoxes;
});
