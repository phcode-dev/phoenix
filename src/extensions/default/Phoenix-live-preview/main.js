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
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global Phoenix, logger*/
//jshint-ignore:no-start

define(function (require, exports, module) {
    const ExtensionUtils   = brackets.getModule("utils/ExtensionUtils"),
        EditorManager      = brackets.getModule("editor/EditorManager"),
        CommandManager     = brackets.getModule("command/CommandManager"),
        Commands           = brackets.getModule("command/Commands"),
        Menus              = brackets.getModule("command/Menus"),
        WorkspaceManager   = brackets.getModule("view/WorkspaceManager"),
        AppInit            = brackets.getModule("utils/AppInit"),
        ProjectManager     = brackets.getModule("project/ProjectManager"),
        MainViewManager    = brackets.getModule("view/MainViewManager"),
        Strings            = brackets.getModule("strings"),
        Mustache           = brackets.getModule("thirdparty/mustache/mustache"),
        Metrics            = brackets.getModule("utils/Metrics"),
        NotificationUI = brackets.getModule("widgets/NotificationUI"),
        LiveDevelopment = brackets.getModule("LiveDevelopment/main"),
        utils = require('utils');

    const LIVE_PREVIEW_PANEL_ID = "live-preview-panel",
        NAVIGATOR_REDIRECT_PAGE = "REDIRECT_PAGE",
        LIVE_PREVIEW_NAVIGATOR_CHANNEL_ID = `${Phoenix.PHOENIX_INSTANCE_ID}-nav-live-preview`,
        _livePreviewNavigationChannel = new BroadcastChannel(LIVE_PREVIEW_NAVIGATOR_CHANNEL_ID),
        livePreviewTabs = new Map();
    window.livePreviewTabs = livePreviewTabs;

    // jQuery objects
    let $icon,
        $iframe,
        $panel,
        $pinUrlBtn,
        $highlightBtn,
        $livePreviewPopBtn,
        $reloadBtn;

    _livePreviewNavigationChannel.onmessage = (event) => {
        const type = event.data.type;
        switch (type) {
        case 'TAB_ONLINE': livePreviewTabs.set(event.data.clientID, {
            lastSeen: new Date(),
            URL: event.data.URL
        }); break;
        default: console.error("Live Preview Navigation Channel: received unknown message:", event);
        }
    };

    // If we didn't receive heartbeat message from a tab for 5 seconds, we assume tab closed
    const TAB_HEARTBEAT_TIMEOUT = 5000; // in millis secs
    setInterval(()=>{
        let endTime = new Date();
        for(let tab of livePreviewTabs.keys()){
            let timeDiff = endTime - livePreviewTabs.get(tab).lastSeen; // in ms
            if(timeDiff > TAB_HEARTBEAT_TIMEOUT){
                livePreviewTabs.delete(tab);
            }
        }
        if(livePreviewTabs.size === 0){
            _startOrStopLivePreviewIfRequired();
        }
    }, 1000);


    // Templates
    let panelHTML       = require("text!panel.html");
    ExtensionUtils.loadStyleSheet(module, "live-preview.css");
    // Other vars
    let panel,
        urlPinned,
        currentLivePreviewURL = "";

    function _setPanelVisibility(isVisible) {
        if (isVisible) {
            $icon.toggleClass("active");
            panel.show();
            _loadPreview(true);
        } else {
            $icon.toggleClass("active");
            $iframe.attr('src', 'about:blank');
            panel.hide();
        }
    }

    function _startOrStopLivePreviewIfRequired(explicitClickOnLPIcon) {
        let visible = panel && panel.isVisible();
        if(visible && LiveDevelopment.isInactive()) {
            LiveDevelopment.openLivePreview();
        } else if(visible && explicitClickOnLPIcon) {
            LiveDevelopment.closeLivePreview();
            LiveDevelopment.openLivePreview();
        } else if(!visible && livePreviewTabs.size === 0) {
            LiveDevelopment.closeLivePreview();
        }
    }
    function _toggleVisibilityOnClick() {
        let visible = !panel.isVisible();
        _setPanelVisibility(visible);
        _startOrStopLivePreviewIfRequired(true);
    }

    function _togglePinUrl() {
        let pinStatus = $pinUrlBtn.hasClass('pin-icon');
        if(pinStatus){
            $pinUrlBtn.removeClass('pin-icon').addClass('unpin-icon');
        } else {
            $pinUrlBtn.removeClass('unpin-icon').addClass('pin-icon');
        }
        urlPinned = !pinStatus;
        LiveDevelopment.setLivePreviewPinned(urlPinned);
        _loadPreview();
        Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "pinURLBtn", "click");
    }

    function _updateLiveHighlightToggleStatus() {
        let isHighlightEnabled = CommandManager.get(Commands.FILE_LIVE_HIGHLIGHT).getChecked();
        if(isHighlightEnabled){
            $highlightBtn.removeClass('pointer-icon').addClass('pointer-fill-icon');
        } else {
            $highlightBtn.removeClass('pointer-fill-icon').addClass('pointer-icon');
        }
    }

    function _toggleLiveHighlights() {
        CommandManager.execute(Commands.FILE_LIVE_HIGHLIGHT);
        Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "HighlightBtn", "click");
    }

    function _stripURL(url) {
        if(url.includes("?")){
            url = url.split("?")[0];
        }
        if(url.includes("#")){
            url = url.split("#")[0];
        }
        return url;
    }

    function _getTabNavigationURL(url) {
        let details = LiveDevelopment.getLivePreviewDetails(),
            openURL = url;
        if(details.URL !== url) {
            openURL = `${_stripURL(location.href)}LiveDevelopment/pageLoader.html?`
                +`broadcastChannel=${LIVE_PREVIEW_NAVIGATOR_CHANNEL_ID}&URL=${encodeURIComponent(url)}`;
        }
        return openURL;
    }

    function _redirectAllTabs(newURL) {
        const openURL = _getTabNavigationURL(newURL);
        _livePreviewNavigationChannel.postMessage({
            type: NAVIGATOR_REDIRECT_PAGE,
            URL: openURL
        });
    }

    function _popoutLivePreview() {
        const openURL = _getTabNavigationURL(currentLivePreviewURL);
        open(openURL, "livePreview", "noopener,noreferrer");
        Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "popoutBtn", "click");
        _loadPreview(true);
    }

    function _setTitle(fileName) {
        let message = Strings.LIVE_DEV_SELECT_FILE_TO_PREVIEW,
            tooltip = message;
        if(fileName){
            message = `${fileName} - ${Strings.LIVE_DEV_STATUS_TIP_OUT_OF_SYNC}`;
            tooltip = `${Strings.LIVE_DEV_STATUS_TIP_OUT_OF_SYNC} - ${fileName}`;
        }
        document.getElementById("panel-live-preview-title").textContent = message;
        document.getElementById("live-preview-plugin-toolbar").title = tooltip;
    }

    async function _createExtensionPanel() {
        let templateVars = {
            Strings: Strings,
            livePreview: Strings.LIVE_DEV_STATUS_TIP_OUT_OF_SYNC,
            clickToReload: Strings.LIVE_DEV_CLICK_TO_RELOAD_PAGE,
            toggleLiveHighlight: Strings.LIVE_DEV_TOGGLE_LIVE_HIGHLIGHT,
            clickToPopout: Strings.LIVE_DEV_CLICK_POPOUT,
            clickToPinUnpin: Strings.LIVE_DEV_CLICK_TO_PIN_UNPIN
        };
        const PANEL_MIN_SIZE = 50;
        const INITIAL_PANEL_SIZE = document.body.clientWidth/2.5;
        $icon = $("#toolbar-go-live");
        $icon.click(_toggleVisibilityOnClick);
        $panel = $(Mustache.render(panelHTML, templateVars));
        $iframe = $panel.find("#panel-live-preview-frame");
        $pinUrlBtn = $panel.find("#pinURLButton");
        $highlightBtn = $panel.find("#highlightLPButton");
        $reloadBtn = $panel.find("#reloadLivePreviewButton");
        $livePreviewPopBtn = $panel.find("#livePreviewPopoutButton");
        $iframe[0].onload = function () {
            $iframe.attr('srcdoc', null);
        };

        panel = WorkspaceManager.createPluginPanel(LIVE_PREVIEW_PANEL_ID, $panel,
            PANEL_MIN_SIZE, $icon, INITIAL_PANEL_SIZE);

        WorkspaceManager.recomputeLayout(false);
        _updateLiveHighlightToggleStatus();
        $pinUrlBtn.click(_togglePinUrl);
        $highlightBtn.click(_toggleLiveHighlights);
        $livePreviewPopBtn.click(_popoutLivePreview);
        $reloadBtn.click(()=>{
            LiveDevelopment.closeLivePreview();
            LiveDevelopment.openLivePreview();
            _loadPreview(true);
            Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "reloadBtn", "click");
        });
    }

    function _renderMarkdown(fullPath, newSrc) {
        currentLivePreviewURL = newSrc;
        console.log(`Markdown Static server _updateInstrumentedURLSInWorker: `, [fullPath], newSrc);
        window.messageSW({
            type: 'setInstrumentedURLs',
            root: "",
            paths: [fullPath]
        }).then((status)=>{
            console.log(`Markdown server received msg from Service worker: setInstrumentedURLs done: `, status);
            if(panel.isVisible()){
                $iframe.attr('srcdoc', null);
                $iframe.attr('src', newSrc);
            }
            _redirectAllTabs(newSrc);
        }).catch(err=>{
            console.error(`Markdown error while from sw rendering failed for ${fullPath}: `, err);
        });
    }

    function _renderPreview(previewDetails, newSrc) {
        let fullPath = previewDetails.fullPath;
        if(previewDetails.isMarkdownFile){
            _renderMarkdown(fullPath, newSrc);
            Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "render", "markdown");
        } else {
            currentLivePreviewURL = newSrc;
            if(panel.isVisible()){
                $iframe.attr('srcdoc', null);
                $iframe.attr('src', newSrc);
            }
            _redirectAllTabs(newSrc);
            Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "render", utils.getExtension(fullPath));
        }
    }

    let savedScrollPositions = {};

    function _saveScrollPositionsIfPossible() {
        let currentSrc = $iframe.src || utils.getNoPreviewURL();
        try{
            let scrollX = $iframe[0].contentWindow.scrollX;
            let scrollY = $iframe[0].contentWindow.scrollY;
            savedScrollPositions[currentSrc] = {
                scrollX: scrollX,
                scrollY: scrollY
            };
            return {scrollX, scrollY, currentSrc};
        }catch (e) {
            return {scrollX: 0, scrollY: 0, currentSrc};
        }
    }

    async function _loadPreview(force) {
        if(panel.isVisible() || (livePreviewTabs.size > 0)){
            let saved = _saveScrollPositionsIfPossible();
            // panel-live-preview-title
            let previewDetails = await utils.getPreviewDetails();
            let newSrc = saved.currentSrc;
            if (!urlPinned && previewDetails.URL) {
                newSrc = encodeURI(previewDetails.URL);
                _setTitle(previewDetails.filePath);
            }
            $iframe[0].onload = function () {
                if(!$iframe[0].contentDocument){
                    return;
                }
                $iframe[0].contentDocument.savePageCtrlSDisabledByPhoenix = true;
                $iframe[0].contentDocument.addEventListener("keydown", function(e) {
                    // inside live preview iframe, we disable ctrl-s browser save page dialog
                    if (e.key === 's' && (navigator.platform.match("Mac") ? e.metaKey : e.ctrlKey)) {
                        e.preventDefault();
                    }
                }, false);
                if(saved.currentSrc === newSrc){
                    $iframe[0].contentWindow.scrollTo(saved.scrollX, saved.scrollY);
                } else {
                    let savedPositions = savedScrollPositions[newSrc];
                    if(savedPositions){
                        $iframe[0].contentWindow.scrollTo(savedPositions.scrollX, savedPositions.scrollY);
                    }
                }
            };
            if(saved.currentSrc !== newSrc || force === true){
                $iframe.src = newSrc;
                _renderPreview(previewDetails, newSrc);
            }
        }
    }

    async function _projectFileChanges(evt, changedFile) {
        if(changedFile && utils.isPreviewableFile(changedFile.fullPath)){
            // we are getting this change event somehow.
            // bug, investigate why we get this change event as a project file change.
            const previewDetails = await utils.getPreviewDetails();
            if(!(LiveDevelopment.isActive() && previewDetails.isHTMLFile)) {
                // We force reload live preview on save for all non html preview-able file or
                // if html file and live preview isnt active.
                _loadPreview(true);
            }
            _showPopoutNotificationIfNeeded(changedFile.fullPath);
        }
    }

    let livePreviewEnabledOnProjectSwitch = false;
    async function _projectOpened() {
        if(urlPinned){
            _togglePinUrl();
        }
        $iframe[0].src = utils.getNoPreviewURL();
        if(!panel.isVisible()){
            return;
        }
        _loadPreview(true);
    }

    function _projectClosed() {
        LiveDevelopment.closeLivePreview();
        livePreviewEnabledOnProjectSwitch = false;
    }

    function _activeDocChanged() {
        if(!LiveDevelopment.isActive() && !livePreviewEnabledOnProjectSwitch
            && (panel.isVisible() || (livePreviewTabs.size > 0))) {
            // we do this only once after project switch if live preview for a doc is not active.
            LiveDevelopment.closeLivePreview();
            LiveDevelopment.openLivePreview();
            livePreviewEnabledOnProjectSwitch = true;
        }
    }

    function _showPopoutNotificationIfNeeded(path) {
        let notificationKey = 'livePreviewPopoutShown';
        let popoutMessageShown = localStorage.getItem(notificationKey);
        if(!popoutMessageShown && WorkspaceManager.isPanelVisible(LIVE_PREVIEW_PANEL_ID)
            && (path.endsWith('.html') || path.endsWith('.htm'))){
            NotificationUI.createFromTemplate(Strings.GUIDED_LIVE_PREVIEW_POPOUT,
                "livePreviewPopoutButton", {
                    allowedPlacements: ['bottom'],
                    autoCloseTimeS: 15,
                    dismissOnClick: true}
            );
            localStorage.setItem(notificationKey, "true");
        }
    }

    /**
     * EVENT_OPEN_PREVIEW_URL triggers this once live preview infrastructure is instrumented and ready to accept live
     * preview connections from browsers. So, if we have loaded an earlier live preview, that is most likely not
     * instrumented code and just plain html for the previewed file. We force load the live preview again here to
     * load the instrumented live preview code.
     * @param _event
     * @param previewDetails
     * @return {Promise<void>}
     * @private
     */
    async function _openLivePreviewURL(_event, previewDetails) {
        _loadPreview(true);
        const currentPreviewDetails = await utils.getPreviewDetails();
        if(currentPreviewDetails.isHTMLFile && currentPreviewDetails.fullPath !== previewDetails.fullPath){
            console.error("Live preview URLs differ between phoenix live preview extension and core live preview",
                currentPreviewDetails, previewDetails);
        }
    }

    function _currentFileChanged(_event, newFile) {
        if(newFile && utils.isPreviewableFile(newFile.fullPath)){
            _loadPreview();
        }
    }

    AppInit.appReady(function () {
        _createExtensionPanel();
        ProjectManager.on(ProjectManager.EVENT_PROJECT_FILE_CHANGED, _projectFileChanges);
        MainViewManager.on("currentFileChange", _currentFileChanged);
        ProjectManager.on(ProjectManager.EVENT_PROJECT_OPEN, _projectOpened);
        ProjectManager.on(ProjectManager.EVENT_PROJECT_CLOSE, _projectClosed);
        EditorManager.on("activeEditorChange", _activeDocChanged);
        CommandManager.register(Strings.CMD_LIVE_FILE_PREVIEW,  Commands.FILE_LIVE_FILE_PREVIEW, function () {
            _toggleVisibilityOnClick();
        });
        let fileMenu = Menus.getMenu(Menus.AppMenuBar.FILE_MENU);
        fileMenu.addMenuItem(Commands.FILE_LIVE_FILE_PREVIEW, "");
        // We always show the live preview panel on startup if there is a preview file
        setTimeout(async ()=>{
            LiveDevelopment.openLivePreview();
            let previewDetails = await utils.getPreviewDetails();
            if(previewDetails.filePath){
                // only show if there is some file to preview and not the default no-preview preview on startup
                _setPanelVisibility(true);
            }
        }, 1000);
        LiveDevelopment.on(LiveDevelopment.EVENT_OPEN_PREVIEW_URL, _openLivePreviewURL);
        LiveDevelopment.on(LiveDevelopment.EVENT_LIVE_HIGHLIGHT_PREF_CHANGED, _updateLiveHighlightToggleStatus);
    });
});


