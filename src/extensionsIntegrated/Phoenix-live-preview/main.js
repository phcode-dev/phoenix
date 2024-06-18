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
/*global path, jsPromise*/
//jshint-ignore:no-start

define(function (require, exports, module) {
    const ExtensionUtils   = require("utils/ExtensionUtils"),
        EditorManager      = require("editor/EditorManager"),
        FileViewController  = require("project/FileViewController"),
        DocumentManager = require("document/DocumentManager"),
        ExtensionInterface = require("utils/ExtensionInterface"),
        CommandManager     = require("command/CommandManager"),
        Commands           = require("command/Commands"),
        Menus              = require("command/Menus"),
        WorkspaceManager   = require("view/WorkspaceManager"),
        AppInit            = require("utils/AppInit"),
        ModalBar           = require("widgets/ModalBar").ModalBar,
        PreferencesManager = require("preferences/PreferencesManager"),
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
        LivePreviewSettings  = require("./LivePreviewSettings"),
        NodeUtils = require("utils/NodeUtils"),
        TrustProjectHTML    = require("text!./trust-project.html"),
        panelHTML       = require("text!./panel.html"),
        Dialogs = require("widgets/Dialogs"),
        DefaultDialogs = require("widgets/DefaultDialogs"),
        utils = require('./utils');

    const StateManager = PreferencesManager.stateManager;
    const STATE_CUSTOM_SERVER_BANNER_ACK = "customServerBannerDone";
    let customServerModalBar;

    const isBrowser = !Phoenix.isNativeApp;
    const StaticServer = Phoenix.isNativeApp? NodeStaticServer : BrowserStaticServer;

    const EVENT_EMBEDDED_IFRAME_WHO_AM_I = 'whoAmIframePhoenix';
    const EVENT_EMBEDDED_IFRAME_FOCUS_EDITOR = 'embeddedIframeFocusEditor';

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

    if(Phoenix.isTestWindow) {
        // for integ tests
        window._livePreviewIntegTest = {
            urlLoadCount: 0,
            STATE_CUSTOM_SERVER_BANNER_ACK
        };
    }

    // jQuery objects
    let $icon,
        $settingsIcon,
        $iframe,
        $panel,
        $pinUrlBtn,
        $highlightBtn,
        $livePreviewPopBtn,
        $reloadBtn,
        $chromeButton,
        $safariButton,
        $edgeButton,
        $firefoxButton,
        $chromeButtonBallast,
        $safariButtonBallast,
        $edgeButtonBallast,
        $firefoxButtonBallast,
        $panelTitle;

    let customLivePreviewBannerShown = false;

    StaticServer.on(EVENT_EMBEDDED_IFRAME_WHO_AM_I, function () {
        if($iframe && $iframe[0]) {
            const iframeDom = $iframe[0];
            iframeDom.contentWindow.postMessage({
                type: "WHO_AM_I_RESPONSE",
                isTauri: Phoenix.isNativeApp
            }, "*"); // this is not sensitive info, and is only dispatched if requested by the iframe
        }
    });
    StaticServer.on(EVENT_EMBEDDED_IFRAME_FOCUS_EDITOR, function () {
        const editor  = EditorManager.getActiveEditor();
        editor.focus();
    });

    function _isLiveHighlightEnabled() {
        return CommandManager.get(Commands.FILE_LIVE_HIGHLIGHT).getChecked();
    }

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
        if(Phoenix.isTestWindow || Phoenix.isNativeApp){ // for test windows, we trust all test files
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

    let panelShownAtStartup;
    function _setPanelVisibility(isVisible) {
        if (isVisible) {
            panelShownAtStartup = true;
            $icon.toggleClass("active");
            panel.show();
            _loadPreview(true, true);
            _showCustomServerBannerIfNeeded();
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

    const ALLOWED_BROWSERS_NAMES = [`chrome`, `firefox`, `safari`, `edge`, `browser`, `browserPrivate`];
    function _popoutLivePreview(browserName) {
        // We cannot use $iframe.src here if panel is hidden
        const openURL = StaticServer.getTabPopoutURL(currentLivePreviewURL);
        if(browserName && ALLOWED_BROWSERS_NAMES.includes(browserName)){
            Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "popout", browserName);
            NodeUtils.openUrlInBrowser(openURL, browserName)
                .then(()=>{
                    _loadPreview(true);
                    _setPanelVisibility(false);
                })
                .catch(err=>{
                    console.error("Error opening url in browser: ", browserName, err);
                    Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "popFail", browserName);
                    Dialogs.showModalDialog(
                        DefaultDialogs.DIALOG_ID_ERROR,
                        StringUtils.format(Strings.LIVE_DEV_OPEN_ERROR_TITLE, browserName),
                        StringUtils.format(Strings.LIVE_DEV_OPEN_ERROR_MESSAGE, browserName)
                    );
                });
        } else {
            NativeApp.openURLInDefaultBrowser(openURL, "livePreview");
            Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "popoutBtn", "click");
            _loadPreview(true);
            _setPanelVisibility(false);
        }
    }

    function _setTitle(fileName, fullPath, currentLivePreviewURL) {
        let message = Strings.LIVE_DEV_SELECT_FILE_TO_PREVIEW,
            tooltip = message;
        if(fileName){
            message = `${fileName} - ${Strings.LIVE_DEV_STATUS_TIP_OUT_OF_SYNC}`;
            tooltip = StringUtils.format(Strings.LIVE_DEV_TOOLTIP_SHOW_IN_EDITOR, fileName);
        }
        if(currentLivePreviewURL){
            tooltip = `${tooltip}\n${currentLivePreviewURL}`;
        }
        $panelTitle.text(currentLivePreviewURL || message);
        $panelTitle.attr("title", tooltip);
        $panelTitle.attr("data-fullPath", fullPath);
    }

    function _showOpenBrowserIcons() {
        if(!Phoenix.isNativeApp) {
            return;
        }
        // only in desktop builds we show open with browser icons
        $chromeButton.removeClass("forced-hidden");
        $chromeButtonBallast.removeClass("forced-hidden");
        $chromeButtonBallast.addClass("forced-inVisible");

        $edgeButton.removeClass("forced-hidden");
        $edgeButtonBallast.removeClass("forced-hidden");
        $edgeButtonBallast.addClass("forced-inVisible");

        $firefoxButton.removeClass("forced-hidden");
        $firefoxButtonBallast.removeClass("forced-hidden");
        $firefoxButtonBallast.addClass("forced-inVisible");
        if (brackets.platform === "mac") {
            $safariButton.removeClass("forced-hidden");
            $safariButtonBallast.removeClass("forced-hidden");
            $safariButtonBallast.addClass("forced-inVisible");
        }
    }

    async function _createExtensionPanel() {
        let templateVars = {
            Strings: Strings,
            livePreview: Strings.LIVE_DEV_STATUS_TIP_OUT_OF_SYNC,
            clickToReload: Strings.LIVE_DEV_CLICK_TO_RELOAD_PAGE,
            toggleLiveHighlight: Strings.LIVE_DEV_TOGGLE_LIVE_HIGHLIGHT,
            livePreviewSettings: Strings.LIVE_DEV_SETTINGS,
            clickToPopout: Strings.LIVE_DEV_CLICK_POPOUT,
            openInChrome: Strings.LIVE_DEV_OPEN_CHROME,
            openInSafari: Strings.LIVE_DEV_OPEN_SAFARI,
            openInEdge: Strings.LIVE_DEV_OPEN_EDGE,
            openInFirefox: Strings.LIVE_DEV_OPEN_FIREFOX,
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
        $chromeButton = $panel.find("#chromeButton");
        $safariButton = $panel.find("#safariButton");
        $edgeButton = $panel.find("#edgeButton");
        $firefoxButton = $panel.find("#firefoxButton");
        // ok i dont know enough CSS to do this without these Ballast/ this works for the limited dev time I have.
        $chromeButtonBallast = $panel.find("#chromeButtonBallast");
        $safariButtonBallast = $panel.find("#safariButtonBallast");
        $edgeButtonBallast = $panel.find("#edgeButtonBallast");
        $firefoxButtonBallast = $panel.find("#firefoxButtonBallast");
        $panelTitle = $panel.find("#panel-live-preview-title");
        $settingsIcon = $panel.find("#livePreviewSettingsBtn");

        $panel.find(".live-preview-settings-banner-btn").on("click", ()=>{
            CommandManager.execute(Commands.FILE_LIVE_FILE_PREVIEW_SETTINGS);
            Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "settingsBtnBanner", "click");
        });
        $panel.find(".custom-server-banner-close-icon").on("click", ()=>{
            $panel.find(".live-preview-custom-banner").addClass("forced-hidden");
        });
        $iframe[0].onload = function () {
            $iframe.attr('srcdoc', null);
        };
        $panelTitle.on("click", ()=>{
            const fullPath = $panelTitle.attr("data-fullPath");
            const openPanes = MainViewManager.findInAllWorkingSets(fullPath);
            let paneToUse = MainViewManager.ACTIVE_PANE;
            if(openPanes.length) {
                paneToUse = openPanes[0].paneId;
            }
            FileViewController.openFileAndAddToWorkingSet(fullPath, paneToUse);
        });
        $chromeButton.on("click", ()=>{
            _popoutLivePreview("chrome");
        });
        $safariButton.on("click", ()=>{
            _popoutLivePreview("safari");
        });
        $edgeButton.on("click", ()=>{
            _popoutLivePreview("edge");
        });
        $firefoxButton.on("click", ()=>{
            _popoutLivePreview("firefox");
        });
        _showOpenBrowserIcons();
        $settingsIcon.click(()=>{
            CommandManager.execute(Commands.FILE_LIVE_FILE_PREVIEW_SETTINGS);
            Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "settingsBtn", "click");
        });

        const popoutSupported = Phoenix.isNativeApp
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
            _loadPreview(true, true);
            Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "reloadBtn", "click");
        });
    }

    async function _loadPreview(force, isReload) {
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
        const existingPreviewFile = $iframe && $iframe.attr('data-original-path');
        const existingPreviewURL = $iframe && $iframe.attr('data-original-src');
        if(isReload && previewDetails.isNoPreview && existingPreviewURL &&
            existingPreviewFile && ProjectManager.isWithinProject(existingPreviewFile)) {
            currentLivePreviewURL = existingPreviewURL;
            currentPreviewFile = existingPreviewFile;
        } else if(isReload){
            LiveDevelopment.openLivePreview();
        }
        let relativeOrFullPath= ProjectManager.makeProjectRelativeIfPossible(currentPreviewFile);
        relativeOrFullPath = Phoenix.app.getDisplayPath(relativeOrFullPath);
        _setTitle(relativeOrFullPath, currentPreviewFile,
            previewDetails.isCustomServer ? currentLivePreviewURL : "");
        if(panel.isVisible()) {
            if(!customLivePreviewBannerShown && LivePreviewSettings.isUsingCustomServer()
                && previewDetails.isCustomServer) {
                customLivePreviewBannerShown = true;
                $panel.find(".live-preview-custom-banner").removeClass("forced-hidden");
                $panel.find(".live-preview-banner-message").text(
                    StringUtils.format(Strings.LIVE_PREVIEW_CUSTOM_SERVER_BANNER,
                        LivePreviewSettings.getCustomServeBaseURL())
                );
            }
            let newIframe = $(LIVE_PREVIEW_IFRAME_HTML);
            newIframe.insertAfter($iframe);
            $iframe.remove();
            $iframe = newIframe;
            if(_isProjectPreviewTrusted()){
                $iframe.attr('src', currentLivePreviewURL);
                // we have to save src as the iframe src attribute may have redirected, and we cannot read it as its
                // a third party domain once its redirected.
                $iframe.attr('data-original-src', currentLivePreviewURL);
                $iframe.attr('data-original-path', currentPreviewFile);
                if(Phoenix.isTestWindow) {
                    window._livePreviewIntegTest.currentLivePreviewURL = currentLivePreviewURL;
                    window._livePreviewIntegTest.urlLoadCount++;
                }
            } else {
                $iframe.attr('srcdoc', _getTrustProjectPage());
            }
        }
        Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "render",
            utils.getExtension(previewDetails.fullPath));
        StaticServer.redirectAllTabs(currentLivePreviewURL, force);
        if(Phoenix.isTestWindow) {
            // for integ tests
            window._livePreviewIntegTest.redirectURL = currentLivePreviewURL;
            window._livePreviewIntegTest.redirectURLforce = force;
        }
    }

    async function _projectFileChanges(evt, changedFile) {
        if(changedFile && changedFile.isFile && (utils.isPreviewableFile(changedFile.fullPath) ||
            utils.isServerRenderedFile(changedFile.fullPath))){
            // we are getting this change event somehow.
            // bug, investigate why we get this change event as a project file change.
            const previewDetails = await StaticServer.getPreviewDetails();
            let shouldReload = false;
            if(previewDetails.isCustomServer && !previewDetails.serverSupportsHotReload){
                shouldReload = true;
            }
            if(!previewDetails.isCustomServer && !(LiveDevelopment.isActive() && previewDetails.isHTMLFile)) {
                // We force reload live preview on save for all non html preview-able file or
                // if html file and live preview isnt active.
                shouldReload = true;
            }
            if(shouldReload) {
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
                    _setPanelVisibility(true);
                    CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, {fullPath: readmePath});
                    _setProjectReadmePreviewdOnce();
                }
            });
        }
    }

    let startupFilesLoadHandled = false;
    async function _projectOpened() {
        customLivePreviewBannerShown = false;
        $panel.find(".live-preview-custom-banner").addClass("forced-hidden");
        _openReadmeMDIfFirstTime();
        _customServerMetrics();
        if(!LiveDevelopment.isActive()
            && (panel.isVisible() || StaticServer.hasActiveLivePreviews())) {
            // we do this only once after project switch if live preview for a doc is not active.
            LiveDevelopment.openLivePreview();
        }
        if(urlPinned){
            _togglePinUrl();
        }
        $iframe.attr('src', StaticServer.getNoPreviewURL());
        if(!panelShownAtStartup && !isBrowser && ProjectManager.isStartupFilesLoaded()){
            // we dont do this in browser as the virtual server may not yet be started on app start
            // project open and a 404 page will briefly flash in the browser!
            // this mainly applies when phoenix is started with a preview file already open in previous exit
            startupFilesLoadHandled = true;
            const currentDocument = DocumentManager.getCurrentDocument();
            const currentFile = currentDocument? currentDocument.file : ProjectManager.getSelectedItem();
            const isPreviewable = currentFile ? utils.isPreviewableFile(currentFile.fullPath) : false;
            if(isPreviewable){
                _setPanelVisibility(true);
            }
        }
        if(!panel.isVisible()){
            return;
        }
        _loadPreview(true);
    }

    function _startupFilesLoaded() {
        if(startupFilesLoadHandled) {
            return;
            // we have to use this handled flag as there is no ordering of EVENT_AFTER_STARTUP_FILES_LOADED
            // and EVENT_PROJECT_OPEN. if _projectOpened has already shown the live preview panel when it saw that
            // ProjectManager.isStartupFilesLoaded() is true, we should not call project opened again at boot.
        }
        if(!panelShownAtStartup && !isBrowser && ProjectManager.isStartupFilesLoaded()){
            // we dont do this in browser as the virtual server may not yet be started on app start
            // project open and a 404 page will briefly flash in the browser!
            // this mainly applies when phoenix is started with a preview file already open in previous exit
            const currentDocument = DocumentManager.getCurrentDocument();
            const currentFile = currentDocument? currentDocument.file : ProjectManager.getSelectedItem();
            const isPreviewable = currentFile ? utils.isPreviewableFile(currentFile.fullPath) : false;
            if(isPreviewable){
                _setPanelVisibility(true);
                _loadPreview(true, true);
            }
        }
    }

    function _projectClosed() {
        if(urlPinned) {
            _togglePinUrl();
        }
        LiveDevelopment.closeLivePreview();
        if(customServerModalBar){
            customServerModalBar.close();
            customServerModalBar = null;
        }
    }

    function _activeDocChanged() {
        if(!LivePreviewSettings.isUsingCustomServer() && !LiveDevelopment.isActive()
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
        if(LivePreviewSettings.isUsingCustomServer()){
            return;
        }
        _loadPreview(true);
        const currentPreviewDetails = await StaticServer.getPreviewDetails();
        if(currentPreviewDetails.isHTMLFile && currentPreviewDetails.fullPath !== previewDetails.fullPath){
            console.error("Live preview URLs differ between phoenix live preview extension and core live preview",
                currentPreviewDetails, previewDetails);
        }
    }

    async function _currentFileChanged(_event, changedFile) {
        if(!changedFile || !changedFile.fullPath || !ProjectManager.isStartupFilesLoaded()){
            return;
        }
        const fullPath = changedFile.fullPath;
        if(changedFile && _shouldShowCustomServerBar(fullPath)){
            _showCustomServerBar();
        }
        const shouldUseInbuiltPreview = utils.isMarkdownFile(fullPath) || utils.isSVG(fullPath);
        if(urlPinned || (LivePreviewSettings.isUsingCustomServer() &&
            !LivePreviewSettings.getCustomServerConfig(fullPath) && !shouldUseInbuiltPreview)){
            return;
        }
        if(changedFile && (utils.isPreviewableFile(fullPath) ||
            utils.isServerRenderedFile(fullPath))){
            _loadPreview();
            if(!panelShownAtStartup && ProjectManager.isStartupFilesLoaded()){
                let previewDetails = await StaticServer.getPreviewDetails();
                if(previewDetails && !previewDetails.isNoPreview) {
                    _setPanelVisibility(true);
                    _loadPreview();
                }
            }
        }
    }

    function _showSettingsDialog() {
        return new Promise(resolve=>{
            LivePreviewSettings.showSettingsDialog()
                .then(()=>{
                    _loadPreview();
                    resolve();
                });
        });
    }

    function _customServerMetrics() {
        if(LivePreviewSettings.isUsingCustomServer()){
            Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "customServ", "yes");
            Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "framework",
                LivePreviewSettings.getCustomServerFramework() || "unknown");
            if(LivePreviewSettings.serverSupportsHotReload()) {
                Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "hotReload", "yes");
            }
        }
    }

    function _showCustomServerBannerIfNeeded() {
        const editor = EditorManager.getActiveEditor();
        if(!editor || !_shouldShowCustomServerBar(editor.document.file.fullPath)){
            return;
        }
        _showCustomServerBar();
    }

    function _shouldShowCustomServerBar(fullPath) {
        const isBannerAck = StateManager.get(STATE_CUSTOM_SERVER_BANNER_ACK, StateManager.PROJECT_CONTEXT);
        let panelVisible = panel && panel.isVisible();
        if(isBannerAck || LivePreviewSettings.isUsingCustomServer() || !panelVisible){
            return false;
        }
        return utils.isServerRenderedFile(fullPath);
    }

    function _showCustomServerBar() {
        if(customServerModalBar){
            return;
        }
        // Show the search bar
        const searchBarHTML =`<div style="display: flex;justify-content: end;align-items: baseline;">
            <div style="margin-right: 5px;">
                ${Strings.LIVE_DEV_SETTINGS_BANNER}
            </div>
            <button class="btn btn-mini live-preview-settings" style="margin-right: 5px;">
                ${Strings.LIVE_DEV_SETTINGS}
            </button>
            <div class="close-icon" style="align-self: center;margin-left: 10px;margin-right: 5px;cursor: pointer;"
                title="${Strings.CLOSE}">
                <i class="fa-solid fa-xmark"></i>
            </div>
        </div>`;
        customServerModalBar = new ModalBar(searchBarHTML);
        const $modal = customServerModalBar.getRoot();
        $modal.find(".live-preview-settings")
            .click(()=>{
                _showSettingsDialog()
                    .then(()=>{
                        if(LivePreviewSettings.isUsingCustomServer()){
                            customServerModalBar && customServerModalBar.close();
                            customServerModalBar = null;
                            StateManager.set(STATE_CUSTOM_SERVER_BANNER_ACK, true, StateManager.PROJECT_CONTEXT);
                        }
                    });
            });
        $modal.find(".close-icon").click(()=>{
            customServerModalBar && customServerModalBar.close();
            customServerModalBar = null;
            StateManager.set(STATE_CUSTOM_SERVER_BANNER_ACK, true, StateManager.PROJECT_CONTEXT);
        });
    }

    AppInit.appReady(function () {
        if(Phoenix.isSpecRunnerWindow){
            return;
        }
        panelShownAtStartup = !LivePreviewSettings.shouldShowLivePreviewAtStartup();
        Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "atStart",
            LivePreviewSettings.shouldShowLivePreviewAtStartup() ? "show" : "hide");
        _createExtensionPanel();
        StaticServer.init();
        LiveDevServerManager.registerServer({ create: _createStaticServer }, 5);
        ProjectManager.on(ProjectManager.EVENT_PROJECT_FILE_CHANGED, _projectFileChanges);
        ProjectManager.on(ProjectManager.EVENT_PROJECT_OPEN, _projectOpened);
        ProjectManager.on(ProjectManager.EVENT_PROJECT_CLOSE, _projectClosed);
        EditorManager.on("activeEditorChange", _activeDocChanged);
        ProjectManager.on(ProjectManager.EVENT_AFTER_STARTUP_FILES_LOADED, _startupFilesLoaded);
        let fileChangeListenerStartDelay = 0;
        if(Phoenix.isNativeApp && Phoenix.platform === "mac") {
            // in mac, if we do the `open with Phoenix Code` from finder, then, the open with events come as events
            // after app start. This causes a problem where if we open a txt file with open with, and an html file was
            // open previously, then currentFileChange listener will see the html file at first and open the live
            // preview panel, and immediately, the txt file event will be sent by os resulting in a no preview page.
            // we should not show a no preview page for opening txt / non-previewable files. So, we dont attach the
            // change listener in macos for a second to give some time for the os event to reach.
            fileChangeListenerStartDelay = 600;
        }
        setTimeout(()=>{
            MainViewManager.on("currentFileChange", _currentFileChanged);
            if(Phoenix.isNativeApp && Phoenix.platform === "mac" && MainViewManager.getCurrentlyViewedFile()) {
                _currentFileChanged(null, MainViewManager.getCurrentlyViewedFile());
            }
        }, fileChangeListenerStartDelay);
        CommandManager.register(Strings.CMD_LIVE_FILE_PREVIEW,  Commands.FILE_LIVE_FILE_PREVIEW, function () {
            _toggleVisibilityOnClick();
        });
        CommandManager.register(Strings.CMD_LIVE_FILE_PREVIEW_SETTINGS,
            Commands.FILE_LIVE_FILE_PREVIEW_SETTINGS, _showSettingsDialog);
        let fileMenu = Menus.getMenu(Menus.AppMenuBar.FILE_MENU);
        fileMenu.addMenuItem(Commands.FILE_LIVE_FILE_PREVIEW, "", Menus.AFTER, Commands.FILE_EXTENSION_MANAGER);
        fileMenu.addMenuItem(Commands.FILE_LIVE_FILE_PREVIEW_SETTINGS, "",
            Menus.AFTER, Commands.FILE_LIVE_FILE_PREVIEW);
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

        function refreshPreview() {
            StaticServer.getPreviewDetails().then((previewDetails)=>{
                _openReadmeMDIfFirstTime();
                if(!LivePreviewSettings.shouldShowLivePreviewAtStartup()){
                    return;
                }
                // we show the live preview
                // in browser, we always show the live preview on startup even if its a no preview page
                // Eg. in mac safari browser we show mac doesnt support live preview page in live preview.
                if(previewDetails.URL && (isBrowser || !previewDetails.isNoPreview) && !panelShownAtStartup){
                    // only show if there is some file to preview and not the default no-preview preview on startup
                    _setPanelVisibility(true);
                }
                // in browsers, the static server is not reset on every call to open live preview, so its safe to reload
                // we need to reload once as
                const shouldReload = !Phoenix.isNativeApp;
                _loadPreview(true, shouldReload);
            });
        }

        let customServerRefreshedOnce = false;
        StaticServer.on(StaticServer.EVENT_SERVER_READY, function (_evt, event) {
            if(LivePreviewSettings.isUsingCustomServer() && customServerRefreshedOnce){
                return;
            }
            customServerRefreshedOnce = true;
            refreshPreview();
        });
        function _handleNewCustomServer() {
            customLivePreviewBannerShown = false;
            refreshPreview();
            _customServerMetrics();
        }

        LivePreviewSettings.on(LivePreviewSettings.EVENT_SERVER_CHANGED, _handleNewCustomServer);
        LivePreviewSettings.on(LivePreviewSettings.EVENT_CUSTOM_SERVER_ENABLED_CHANGED, (_evt, enabled)=>{
            if(!enabled) {
                $panel.find(".live-preview-custom-banner").addClass("forced-hidden");
            } else {
                _handleNewCustomServer();
            }
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


