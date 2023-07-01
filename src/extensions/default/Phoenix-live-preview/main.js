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
/*global Phoenix*/
//jshint-ignore:no-start

define(function (require, exports, module) {
    const ExtensionUtils   = brackets.getModule("utils/ExtensionUtils"),
        EditorManager      = brackets.getModule("editor/EditorManager"),
        ExtensionInterface = brackets.getModule("utils/ExtensionInterface"),
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
        LiveDevelopment    = brackets.getModule("LiveDevelopment/main"),
        LiveDevServerManager = brackets.getModule("LiveDevelopment/LiveDevServerManager"),
        LivePreviewTransport  = brackets.getModule("LiveDevelopment/MultiBrowserImpl/transports/LivePreviewTransport"),
        StaticServer         = require("StaticServer"),
        utils = require('utils');

    const LIVE_PREVIEW_PANEL_ID = "live-preview-panel",
        NAVIGATOR_REDIRECT_PAGE = "REDIRECT_PAGE",
        IFRAME_EVENT_SERVER_READY = 'SERVER_READY',
        livePreviewTabs = new Map();
    window.livePreviewTabs = livePreviewTabs;
    let serverReady = false;
    const LIVE_PREVIEW_IFRAME_HTML = `
    <iframe id="panel-live-preview-frame" title="Live Preview" style="border: none"
             width="100%" height="100%" seamless="true"
             src='about:blank'
             sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals allow-pointer-lock allow-presentation">
    </iframe>
    `;

    ExtensionInterface.registerExtensionInterface(
        ExtensionInterface._DEFAULT_EXTENSIONS_INTERFACE_NAMES.PHOENIX_LIVE_PREVIEW, exports);

    /**
     * @private
     * @return {StaticServerProvider} The singleton StaticServerProvider initialized
     * on app ready.
     */
    function _createStaticServer() {
        var config = {
            pathResolver: ProjectManager.makeProjectRelativeIfPossible,
            root: ProjectManager.getProjectRoot().fullPath
        };

        return new StaticServer.StaticServer(config);
    }

    // jQuery objects
    let $icon,
        $iframe,
        $panel,
        $pinUrlBtn,
        $highlightBtn,
        $livePreviewPopBtn,
        $reloadBtn;

    StaticServer.on('TAB_ONLINE', function(_ev, event){
        livePreviewTabs.set(event.data.message.clientID, {
            lastSeen: new Date(),
            URL: event.data.message.URL
        });
    });

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

    function _blankIframe() {
        // we have to remove the dom node altog as at time chrome fails to clear workers if we just change
        // src. so we delete the node itself to eb thorough.
        let newIframe = $(LIVE_PREVIEW_IFRAME_HTML);
        newIframe.insertAfter($iframe);
        $iframe.remove();
        $iframe = newIframe;
    }

    function _setPanelVisibility(isVisible) {
        if (isVisible) {
            $icon.toggleClass("active");
            panel.show();
            _loadPreview(true);
        } else {
            $icon.toggleClass("active");
            _blankIframe();
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
        _loadPreview(true);
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

    function _getTabNavigationURL(url) {
        let details = LiveDevelopment.getLivePreviewDetails(),
            openURL = url;
        if(details.URL !== url) {
            openURL = `${LiveDevServerManager.getStaticServerBaseURLs().baseURL}pageLoader.html?`
                +`broadcastChannel=${LivePreviewTransport.BROADCAST_CHANNEL_ID}&URL=${encodeURIComponent(url)}`;
        }
        return openURL;
    }

    function _redirectAllTabs(newURL) {
        const openURL = _getTabNavigationURL(newURL);
        StaticServer.messageToLivePreviewTabs({
            type: NAVIGATOR_REDIRECT_PAGE,
            URL: openURL
        });
    }

    function _popoutLivePreview() {
        // We cannot use $iframe.src here if panel is hidden
        const openURL = _getTabNavigationURL(currentLivePreviewURL);
        open(openURL, "livePreview", "noopener,noreferrer");
        Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "popoutBtn", "click");
        _loadPreview(true);
        _setPanelVisibility(false);
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

    async function _loadPreview(force) {
        // we wait till the first server ready event is received till we render anything. else a 404-page may
        // briefly flash on first load of phoenix as we try to load the page before the server is available.
        const isPreviewLoadable = serverReady && (panel.isVisible() || livePreviewTabs.size > 0);
        if(!isPreviewLoadable){
            return;
        }
        // panel-live-preview-title
        let previewDetails = await utils.getPreviewDetails();
        if(urlPinned && !force) {
            return;
        }
        let newSrc = encodeURI(previewDetails.URL);
        _setTitle(previewDetails.filePath);
        // we have to create a new iframe on every switch as we use cross domain iframes for phcode.live which
        // the browser sandboxes strictly and sometimes it wont allow a src change on our iframe causing live
        // preview breaks sporadically. to alleviate this, we create a new iframe every time.
        currentLivePreviewURL = newSrc;
        if(panel.isVisible()) {
            let newIframe = $(LIVE_PREVIEW_IFRAME_HTML);
            newIframe.insertAfter($iframe);
            $iframe.remove();
            $iframe = newIframe;
            const iframeURL = utils.isImage(previewDetails.fullPath) ? _getTabNavigationURL(newSrc) : newSrc;
            $iframe.attr('src', iframeURL);
        }
        Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "render",
            utils.getExtension(previewDetails.fullPath));
        _redirectAllTabs(newSrc);
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
        }
    }

    let livePreviewEnabledOnProjectSwitch = false;
    async function _projectOpened() {
        if(urlPinned){
            _togglePinUrl();
        }
        $iframe.attr('src', utils.getNoPreviewURL());
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
        LiveDevServerManager.registerServer({ create: _createStaticServer }, 5);
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
        StaticServer.on(IFRAME_EVENT_SERVER_READY, function (_evt, event) {
            serverReady = true;
            _loadPreview(true);
        });
    });

    // private API to be used inside phoenix codebase only
    exports.LIVE_PREVIEW_PANEL_ID = LIVE_PREVIEW_PANEL_ID;
});


