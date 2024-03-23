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
/*global path*/
//jshint-ignore:no-start

define(function (require, exports, module) {
    const ExtensionUtils   = require("utils/ExtensionUtils"),
        EditorManager      = require("editor/EditorManager"),
        ExtensionInterface = require("utils/ExtensionInterface"),
        CommandManager     = require("command/CommandManager"),
        Commands           = require("command/Commands"),
        Menus              = require("command/Menus"),
        WorkspaceManager   = require("view/WorkspaceManager"),
        AppInit            = require("utils/AppInit"),
        ProjectManager     = require("project/ProjectManager"),
        MainViewManager    = require("view/MainViewManager"),
        Strings            = require("strings"),
        Mustache           = require("thirdparty/mustache/mustache"),
        Metrics            = require("utils/Metrics"),
        LiveDevelopment    = require("LiveDevelopment/main"),
        LiveDevServerManager = require("LiveDevelopment/LiveDevServerManager"),
        NativeApp           = require("utils/NativeApp"),
        StringUtils         = require("utils/StringUtils"),
        FileSystem          = require("filesystem/FileSystem"),
        BrowserStaticServer  = require("./BrowserStaticServer"),
        NodeStaticServer  = require("./NodeStaticServer"),
        TrustProjectHTML    = require("text!./trust-project.html"),
        panelHTML       = require("text!./panel.html"),
        utils = require('./utils');

    const StaticServer = Phoenix.browser.isTauri? NodeStaticServer : BrowserStaticServer;

    const EVENT_EMBEDDED_IFRAME_WHO_AM_I = 'whoAmIframePhoenix';

    const PREVIEW_TRUSTED_PROJECT_KEY = "preview_trusted";
    const PREVIEW_PROJECT_README_KEY = "preview_readme";

    const LIVE_PREVIEW_PANEL_ID = "live-preview-panel";
    const LIVE_PREVIEW_IFRAME_ID = "panel-live-preview-frame";
    const LIVE_PREVIEW_IFRAME_HTML = `
    <iframe id="${LIVE_PREVIEW_IFRAME_ID}" title="Live Preview" style="border: none"
             width="100%" height="100%" seamless="true"
             src='about:blank'
             sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-scripts allow-forms allow-modals allow-pointer-lock">
    </iframe>
    `;

    // jQuery objects
    let $icon,
        $iframe,
        $panel,
        $pinUrlBtn,
        $highlightBtn,
        $livePreviewPopBtn,
        $reloadBtn;

    StaticServer.on(EVENT_EMBEDDED_IFRAME_WHO_AM_I, function () {
        if($iframe && $iframe[0]) {
            const iframeDom = $iframe[0];
            iframeDom.contentWindow.postMessage({
                isTauri: Phoenix.browser.isTauri
            }, "*"); // this is not sensitive info, and is only dispatched if requested by the iframe
        }
    });

    function _isLiveHighlightEnabled() {
        return CommandManager.get(Commands.FILE_LIVE_HIGHLIGHT).getChecked();
    }

    window.addEventListener('blur', function() {
        setTimeout(function() {
            const editor  = EditorManager.getActiveEditor();
            if(!_isLiveHighlightEnabled() || !editor){
                return;
            }
            if (document.activeElement === document.getElementById(LIVE_PREVIEW_IFRAME_ID)
                && !utils.isHTMLFile(editor.document.file.fullPath)) {
                // Editor focus is never lost to live preview if live highlights is enabled.
                // For html files, they have special handling to set focus so that live preview can take inputs in
                // text fields and text area for user to be able to type in live preview html text areas.
                editor.focus();
            }
        }, 100);
    });

    function _getTrustProjectPage() {
        const trustProjectMessage = StringUtils.format(Strings.TRUST_PROJECT,
            path.basename(ProjectManager.getProjectRoot().fullPath));
        const templateVars = {
            trustProjectMessage,
            Strings: Strings
        };
        return Mustache.render(TrustProjectHTML, templateVars);
    }

    function _isProjectPreviewTrusted() {
        // We Do not show a trust project window before executing a live preview in desktop builds as in
        // desktop, each project will have its on live preview `server:port` domain isolation.
        // Live preview is almost the same as opening a url in the browser. The user opening a project by going though
        // a lot of selection folder picker dialogs should be regarded as enough confirmation that the user
        // intents to open that file for preview via a browser url. The browser security sandbox should
        // take care of most of the security issues as much as any other normal browsing in a browser.
        // Showing a trust window is UI friction for 99% of users. The user confirm dialog also relies on the user
        // taking the decision that an anti-virus/firewall would make- which is not going to end well; and a lot of
        // our users are school students or new devs, who we should assist. Phoenix trust model will heavily rely on
        // us doing the necessary sand boxing whenever possible.
        // A compromised project can have special html that can instruct phoenix to change editor selections and
        // edit only the project files. We will have safeguards in place to detect anomalous large change requests
        // to mitigate DOS attacks coming from the live preview in the future. A malicious project changing its on
        // text only using its own code should be an acceptable risk for now as it cant affect anything else in the
        // system.
        if(Phoenix.isTestWindow || Phoenix.browser.isTauri){ // for test windows, we trust all test files
            return true;
        }
        // In browsers, The url bar will show up as phcode.dev for live previews and there is a chance that
        // a malicious project can appear as `phcode.dev` when user live previews. So for every live preview
        // popout tab which shows `phcode.dev` in browser address bar, we will show a trust live preview
        // confirm dialog every single time when user opens live preivew project.
        // Further, since all live previews for all projects uses the same phcode.live domain,
        // untrusted projects can access data of past opened projects. Future plans for browser versions
        // include adopting a similar approach to desktop to dynamically generate URLs in the format
        // `project-name.phcode.live` preventing the past data access problem in browser. This will also let us drop the
        // trust project screen an work the same as desktop apps.
        const projectPath = ProjectManager.getProjectRoot().fullPath;
        if(projectPath === ProjectManager.getWelcomeProjectPath() ||
            projectPath === ProjectManager.getExploreProjectPath()){
            return true;
        }
        const isTrustedProject = `${PREVIEW_TRUSTED_PROJECT_KEY}-${projectPath}`;
        return !!PhStore.getItem(isTrustedProject);
    }

    window._trustCurrentProjectForLivePreview = function () {
        $iframe.attr('srcdoc', null);
        const projectPath = ProjectManager.getProjectRoot().fullPath;
        const isTrustedProjectKey = `${PREVIEW_TRUSTED_PROJECT_KEY}-${projectPath}`;
        PhStore.setItem(isTrustedProjectKey, true);
        _loadPreview(true);
    };

    function _setProjectReadmePreviewdOnce() {
        const projectPath = ProjectManager.getProjectRoot().fullPath;
        const previewReadmeKey = `${PREVIEW_PROJECT_README_KEY}-${projectPath}`;
        PhStore.setItem(previewReadmeKey, true);
    }

    function _isProjectReadmePreviewdOnce() {
        const projectPath = ProjectManager.getProjectRoot().fullPath;
        const previewReadmeKey = `${PREVIEW_PROJECT_README_KEY}-${projectPath}`;
        return !!PhStore.getItem(previewReadmeKey);
    }

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

    // Templates
    ExtensionUtils.loadStyleSheet(module, "live-preview.css");
    // Other vars
    let panel,
        urlPinned,
        currentLivePreviewURL = "",
        currentPreviewFile = '';

    function _blankIframe() {
        // we have to remove the dom node altog as at time chrome fails to clear workers if we just change
        // src. so we delete the node itself to eb thorough.
        let newIframe = $(LIVE_PREVIEW_IFRAME_HTML);
        newIframe.insertAfter($iframe);
        $iframe.remove();
        $iframe = newIframe;
    }

    let panelShownOnce = false;
    function _setPanelVisibility(isVisible) {
        if (isVisible) {
            panelShownOnce = true;
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
        if(visible && (LiveDevelopment.isInactive() || explicitClickOnLPIcon)) {
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
        LiveDevelopment.setLivePreviewPinned(urlPinned, currentPreviewFile);
        _loadPreview(true);
        Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "pinURLBtn", "click");
    }

    function _updateLiveHighlightToggleStatus() {
        let isHighlightEnabled = _isLiveHighlightEnabled();
        if(isHighlightEnabled){
            $highlightBtn.removeClass('pointer-icon').addClass('pointer-fill-icon');
        } else {
            $highlightBtn.removeClass('pointer-fill-icon').addClass('pointer-icon');
        }
    }

    function _toggleLiveHighlights() {
        LiveDevelopment.togglePreviewHighlight();
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
            LiveDevelopment.openLivePreview();
            _loadPreview(true);
            Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "reloadBtn", "click");
        });
    }

    async function _loadPreview(force) {
        // we wait till the first server ready event is received till we render anything. else a 404-page may
        // briefly flash on first load of phoenix as we try to load the page before the server is available.
        const isPreviewLoadable = panel.isVisible() || StaticServer.hasActiveLivePreviews();
        if(!isPreviewLoadable){
            return;
        }
        // panel-live-preview-title
        let previewDetails = await StaticServer.getPreviewDetails();
        if(urlPinned && !force) {
            return;
        }
        let newSrc = encodeURI(previewDetails.URL);
        if($iframe.attr('src') === newSrc && !force){
            // we already have this url loaded in previews!
            return;
        }
        // we have to create a new iframe on every switch as we use cross domain iframes for phcode.live which
        // the browser sandboxes strictly and sometimes it wont allow a src change on our iframe causing live
        // preview breaks sporadically. to alleviate this, we create a new iframe every time.
        if(!urlPinned) {
            currentLivePreviewURL = newSrc;
            currentPreviewFile = previewDetails.fullPath;
        }
        let relativeOrFullPath= ProjectManager.makeProjectRelativeIfPossible(currentPreviewFile);
        relativeOrFullPath = Phoenix.app.getDisplayPath(relativeOrFullPath);
        _setTitle(relativeOrFullPath);
        if(panel.isVisible()) {
            let newIframe = $(LIVE_PREVIEW_IFRAME_HTML);
            newIframe.insertAfter($iframe);
            $iframe.remove();
            $iframe = newIframe;
            if(_isProjectPreviewTrusted()){
                $iframe.attr('src', currentLivePreviewURL);
            } else {
                $iframe.attr('srcdoc', _getTrustProjectPage());
            }
        }
        Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "render",
            utils.getExtension(previewDetails.fullPath));
        StaticServer.redirectAllTabs(currentLivePreviewURL);
    }

    async function _projectFileChanges(evt, changedFile) {
        if(changedFile && utils.isPreviewableFile(changedFile.fullPath)){
            // we are getting this change event somehow.
            // bug, investigate why we get this change event as a project file change.
            const previewDetails = await StaticServer.getPreviewDetails();
            if(!(LiveDevelopment.isActive() && previewDetails.isHTMLFile)) {
                // We force reload live preview on save for all non html preview-able file or
                // if html file and live preview isnt active.
                _loadPreview(true);
            }
        }
    }

    function _openReadmeMDIfFirstTime() {
        if(!_isProjectReadmePreviewdOnce() && !Phoenix.isTestWindow){
            const readmePath = `${ProjectManager.getProjectRoot().fullPath}README.md`;
            const fileEntry = FileSystem.getFileForPath(readmePath);
            fileEntry.exists(function (err, exists) {
                if (!err && exists) {
                    CommandManager.execute(Commands.FILE_ADD_TO_WORKING_SET, {fullPath: readmePath});
                    _setProjectReadmePreviewdOnce();
                }
            });
        }
    }

    async function _projectOpened(_evt) {
        _openReadmeMDIfFirstTime();
        if(!LiveDevelopment.isActive()
            && (panel.isVisible() || StaticServer.hasActiveLivePreviews())) {
            // we do this only once after project switch if live preview for a doc is not active.
            LiveDevelopment.openLivePreview();
        }
        if(urlPinned){
            _togglePinUrl();
        }
        $iframe.attr('src', StaticServer.getNoPreviewURL());
        if(!panel.isVisible()){
            return;
        }
        _loadPreview(true);
    }

    function _projectClosed() {
        if(urlPinned) {
            _togglePinUrl();
        }
        LiveDevelopment.closeLivePreview();
    }

    function _activeDocChanged() {
        if(!LiveDevelopment.isActive()
            && (panel.isVisible() || StaticServer.hasActiveLivePreviews())) {
            // we do this only once after project switch if live preview for a doc is not active.
            LiveDevelopment.openLivePreview();
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
        const currentPreviewDetails = await StaticServer.getPreviewDetails();
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
        if(Phoenix.isSpecRunnerWindow){
            return;
        }
        _createExtensionPanel();
        StaticServer.init();
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
        LiveDevelopment.openLivePreview();
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
        StaticServer.on(StaticServer.EVENT_SERVER_READY, function (_evt, event) {
            // We always show the live preview panel on startup if there is a preview file
            StaticServer.getPreviewDetails().then(previewDetails =>{
                if(previewDetails.URL && !panelShownOnce){
                    // only show if there is some file to preview and not the default no-preview preview on startup
                    _setPanelVisibility(true);
                }
                _loadPreview(true);
            });
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
        _projectOpened();
    });

    // private API to be used inside phoenix codebase only
    exports.LIVE_PREVIEW_PANEL_ID = LIVE_PREVIEW_PANEL_ID;
});


