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
        NativeApp            = brackets.getModule("utils/NativeApp"),
        FileUtils           = brackets.getModule("file/FileUtils"),
        StaticServer   = require("StaticServer"),
        utils = require('utils');

    const PREVIEW_TRUSTED_PROJECT_KEY = "preview_trusted";
    const moduleDir = FileUtils.getNativeModuleDirectoryPath(module);

    const LIVE_PREVIEW_PANEL_ID = "live-preview-panel",
        IFRAME_EVENT_SERVER_READY = 'SERVER_READY';
    let serverReady = false;
    const LIVE_PREVIEW_IFRAME_HTML = `
    <iframe id="panel-live-preview-frame" title="Live Preview" style="border: none"
             width="100%" height="100%" seamless="true"
             src='about:blank'
             sandbox="allow-same-origin allow-scripts allow-forms allow-modals allow-pointer-lock">
    </iframe>
    `;

    function _getTrustProjectPage() {
        return `${moduleDir}/trust-project.html?`
            +`&localMessage=${encodeURIComponent(Strings.DESCRIPTION_LIVEDEV_SECURITY_TRUST_MESSAGE)}`
            +`&initialProjectRoot=${encodeURIComponent(ProjectManager.getProjectRoot().fullPath)}`
            +`&okMessage=${encodeURIComponent(Strings.TRUST_PROJECT)}`;
    }

    function _isProjectPreviewTrusted() {
        // In desktop builds, each project is securely sandboxed in its own live preview server:port domain.
        // This setup ensures security within the browser sandbox, eliminating the need for a trust
        // confirmation dialog. We can display the live preview immediately.
        if(Phoenix.browser.isTauri || Phoenix.isTestWindow){ // for test windows, we trust all test files
            return true;
        }
        // In browsers, since all live previews for all projects uses the same phcode.live domain,
        // untrusted projects can access data of past opened projects. So we have to show a trust project?
        // dialog in live preview in browser.
        // Future plans for browser versions include adopting a similar approach to dynamically generate
        // URLs in the format `project-name.phcode.live`. This will streamline the workflow by removing
        // the current reliance on users to manually verify and trust each project in the browser.
        const projectPath = ProjectManager.getProjectRoot().fullPath;
        if(projectPath === ProjectManager.getWelcomeProjectPath() ||
            projectPath === ProjectManager.getExploreProjectPath()){
            return true;
        }
        const isTrustedProject = `${PREVIEW_TRUSTED_PROJECT_KEY}-${projectPath}`;
        return !!PhStore.getItem(isTrustedProject);
    }

    window._trustCurrentProjectForLivePreview = function () {
        const projectPath = ProjectManager.getProjectRoot().fullPath;
        const isTrustedProjectKey = `${PREVIEW_TRUSTED_PROJECT_KEY}-${projectPath}`;
        PhStore.setItem(isTrustedProjectKey, true);
        _loadPreview(true);
    };

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
        } else if(!visible && LiveDevelopment.isActive()
            && !StaticServer.hasActiveLivePreviews()) {
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

    function _popoutLivePreview() {
        // We cannot use $iframe.src here if panel is hidden
        const openURL = StaticServer.getTabPopoutURL(currentLivePreviewURL);
        NativeApp.openURLInDefaultBrowser(openURL, "livePreview");
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

        const popoutSupported = Phoenix.browser.isTauri
            || Phoenix.browser.desktop.isChromeBased || Phoenix.browser.desktop.isFirefox;
        if(!popoutSupported){
            // live preview can be popped out currently in only chrome based browsers. The cross domain iframe
            // that serves the live preview(phcode.live) is sandboxed to the tab in which phcode.dev resides.
            // all iframes in the tab can communicate between each other, but when you popout another tab, it forms
            // its own sandbox and firefox/safari prevents communication from iframe in one tab to another. chrome
            // doesn't seem to enforce this restriction. Since this is a core usecase, we will try to enable this
            // workflow whenever possible.
            $livePreviewPopBtn.addClass("forced-hidden");
        }

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
        const isPreviewLoadable = serverReady && (panel.isVisible() || StaticServer.hasActiveLivePreviews());
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
            if(_isProjectPreviewTrusted()){
                $iframe.attr('src', newSrc);
            } else {
                $iframe.attr('src', _getTrustProjectPage());
            }
        }
        Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "render",
            utils.getExtension(previewDetails.fullPath));
        StaticServer.redirectAllTabs(newSrc);
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
    async function _projectOpened(_evt) {
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
            && (panel.isVisible() || StaticServer.hasActiveLivePreviews())) {
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
        fileMenu.addMenuItem(Commands.FILE_LIVE_FILE_PREVIEW, "", Menus.AFTER, Commands.FILE_EXTENSION_MANAGER);
        fileMenu.addMenuDivider(Menus.BEFORE, Commands.FILE_LIVE_FILE_PREVIEW);
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
        LiveDevelopment.on(LiveDevelopment.EVENT_LIVE_PREVIEW_RELOAD, ()=>{
            // Usually, this event is listened by live preview iframes/tabs and they initiate a location.reload.
            // But in firefox, the embedded iframe will throw a 404 when we try to reload from within the iframe as
            // in firefox security posture, the third party live preview iframe phcode.live itself cannot activate
            // the service worker. So we have to reload the iframe from its parent- ie. phcode.dev. This is not
            // required in chrome, but we just keep it just for all platforms behaving the same.
            _loadPreview(true);
        });
        StaticServer.on(IFRAME_EVENT_SERVER_READY, function (_evt, event) {
            serverReady = true;
            _loadPreview(true);
        });

        let consecutiveEmptyClientsCount = 0;
        setInterval(()=>{
            if(!StaticServer.hasActiveLivePreviews()){
                consecutiveEmptyClientsCount ++;
            } else {
                consecutiveEmptyClientsCount = 0;
            }
            if(consecutiveEmptyClientsCount > 5){
                _startOrStopLivePreviewIfRequired();
            }
        }, 1000);
    });

    // private API to be used inside phoenix codebase only
    exports.LIVE_PREVIEW_PANEL_ID = LIVE_PREVIEW_PANEL_ID;
});


