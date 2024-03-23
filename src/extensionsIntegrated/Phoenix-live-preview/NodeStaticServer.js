/*
 * Copyright (c) 2012 - present Adobe Systems Incorporated. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

/*global logger, fs, path */

define(function (require, exports, module) {

    const BaseServer = require("LiveDevelopment/Servers/BaseServer").BaseServer,
        LiveDevelopmentUtils = require("LiveDevelopment/LiveDevelopmentUtils"),
        LiveDevelopment    = require("LiveDevelopment/main"),
        LiveDevProtocol = require("LiveDevelopment/MultiBrowserImpl/protocol/LiveDevProtocol"),
        marked = require('thirdparty/marked.min'),
        DocumentManager = require("document/DocumentManager"),
        Mustache = require("thirdparty/mustache/mustache"),
        FileSystem = require("filesystem/FileSystem"),
        EventDispatcher = require("utils/EventDispatcher"),
        ProjectManager = require("project/ProjectManager"),
        EventManager = require("utils/EventManager"),
        CommandManager     = require("command/CommandManager"),
        Commands           = require("command/Commands"),
        Strings = require("strings"),
        utils = require('./utils'),
        NativeApp = require("utils/NativeApp"),
        Dialogs = require("widgets/Dialogs"),
        StringUtils         = require("utils/StringUtils"),
        BootstrapCSSText = require("text!thirdparty/bootstrap/bootstrap.min.css"),
        GithubCSSText = require("text!thirdparty/highlight.js/styles/github.min.css"),
        HilightJSText = require("text!thirdparty/highlight.js/highlight.min.js"),
        GFMCSSText = require("text!thirdparty/gfm.min.css"),
        markdownHTMLTemplate = require("text!./markdown.html"),
        NodeConnector = require("NodeConnector"),
        redirectionHTMLTemplate = require("text!./redirectPage.html");

    const LIVE_SERVER_NODE_CONNECTOR_ID = "ph_live_server";
    const PREVIEW_PORT_KEY = "preview_port";
    const EVENT_EMBEDDED_IFRAME_HREF_CLICK = 'embeddedIframeHrefClick';
    const EVENT_EMBEDDED_IFRAME_ESCAPE_PRESS = 'embeddedEscapeKeyPressed';
    let liveServerConnector;
    let staticServerURL, livePreviewCommURL;

    function _getProjectPreferredPort(projectPath) {
        const preferredPortKey = `${PREVIEW_PORT_KEY}-${projectPath}`;
        return PhStore.getItem(preferredPortKey);
    }

    function _setProjectPreferredPort(projectPath, port) {
        const preferredPortKey = `${PREVIEW_PORT_KEY}-${projectPath}`;
        PhStore.setItem(preferredPortKey, port);
    }


    const EVENT_TAB_ONLINE = 'TAB_ONLINE';
    const EVENT_SERVER_READY = 'SERVER_READY';

    EventDispatcher.makeEventDispatcher(exports);

    const livePreviewTabs = new Map();
    const PHCODE_LIVE_PREVIEW_QUERY_PARAM = "phcodeLivePreview";

    let _staticServerInstance;
    let projectServerPort = 0;

    function getNoPreviewURL(
        heading = Strings.DESCRIPTION_LIVEDEV_NO_PREVIEW,
        message = Strings.DESCRIPTION_LIVEDEV_NO_PREVIEW_DETAILS
    ){
        if(!staticServerURL){
            return `${window.Phoenix.baseURL}assets/phoenix-splash/no-preview.html?jsonInput=`+
                encodeURIComponent(`{"heading":"${heading}",`
                    +`"details":"${message}"}`);
        }
        return `${staticServerURL}phoenix-splash/no-preview.html?jsonInput=`+
            encodeURIComponent(`{"heading":"${heading}",`
                +`"details":"${message}"}`);
    }

    async function tabLoaderOnline(data) {
        window.logger.livePreview.log("Live Preview navigator channel: tabLoaderOnline: ", data);
        livePreviewTabs.set(data.pageLoaderID, {
            lastSeen: new Date(),
            URL: data.URL,
            navigationTab: true
        });
    }

    // see markdown advanced rendering options at https://marked.js.org/using_advanced
    marked.setOptions({
        renderer: new marked.Renderer(),
        pedantic: false,
        gfm: true,
        breaks: false,
        sanitize: false,
        smartLists: true,
        smartypants: false,
        xhtml: false
    });

    /**
     * @constructor
     * @extends {BaseServer}
     * Live preview server that uses a built-in HTTP server to serve static
     * and instrumented files.
     *
     * @param {!{baseUrl: string, root: string, pathResolver: function(string), nodeDomain: NodeDomain}} config
     *    Configuration parameters for this server:
     *        baseUrl        - Optional base URL (populated by the current project)
     *        pathResolver   - Function to covert absolute native paths to project relative paths
     *        root           - Native path to the project root (and base URL)
     */
    function StaticServer(config) {
        const self = this;
        this._serverStartPromise = liveServerConnector.execPeer('startStaticServer', {
            projectRoot: config.root,
            preferredPort: _getProjectPreferredPort(config.root)
        }).then((projectConfig)=>{
            projectServerPort = projectConfig.port;
            self._baseUrl       = `http://localhost:${projectServerPort}`;
            if(!_getProjectPreferredPort(config.root)){
                _setProjectPreferredPort(config.root, projectConfig.port);
            }
        });
        this._getInstrumentedContent = this._getInstrumentedContent.bind(this);
        BaseServer.call(this, config);
    }

    StaticServer.prototype = Object.create(BaseServer.prototype);
    StaticServer.prototype.constructor = StaticServer;

    /**
     * Returns a base url for current project.
     *
     * @return {string}
     * Base url for current project.
     */
    StaticServer.prototype.getBaseUrl = function () {
        return this._baseUrl;
    };

    /**
     * Returns a URL for a given path
     * @param {string} path Absolute path to covert to a URL
     * @return {?string} Converts a path within the project root to a URL.
     *  Returns null if the path is not a descendant of the project root.
     */
    StaticServer.prototype.pathToUrl = function (path) {
        const baseUrl         = this.getBaseUrl(),
            relativePath    = this._pathResolver(path);

        // See if base url has been specified and path is within project
        if (relativePath !== path) {
            // Map to server url. Base url is already encoded, so don't encode again.
            return `${baseUrl}/${encodeURI(relativePath)}`;
        }

        return null;
    };

    /**
     * Convert a URL to a local full file path
     * @param {string} url
     * @return {?string} The absolute path for given URL or null if the path is
     *  not a descendant of the project.
     */
    StaticServer.prototype.urlToPath = function (url) {
        let baseUrl = this.getBaseUrl() || "";
        const projectRoot = this.getProjectRoot();

        if (baseUrl !== "" && url.startsWith(baseUrl)) {
            const urlObj = new URL(url);

            let relativePath = decodeURI(urlObj.pathname);
            if(relativePath.startsWith("/")){
                // security: prevent path leak out of project when /path/../../../another folder/ is given
                relativePath = path.normalize(relativePath);
                // remove starting slash
                relativePath = relativePath.slice(1);
            }
            return `${projectRoot}${relativePath}`;
        }

        return null;
    };

    /**
     * Determines whether we can serve local file.
     * @param {string} localPath A local path to file being served.
     * @return {boolean} true for yes, otherwise false.
     */
    StaticServer.prototype.canServe = function (localPath) {
        // If we can't transform the local path to a project relative path,
        // the path cannot be served
        if (localPath === this._pathResolver(localPath)) {
            return false;
        }

        // Url ending in "/" implies default file, which is usually index.html.
        // Return true to indicate that we can serve it.
        if (localPath.match(/\/$/)) {
            return true;
        }

        // FUTURE: do a MIME Type lookup on file extension
        return LiveDevelopmentUtils.isStaticHtmlFileExt(localPath);
    };

    /**
     * Gets the server details from the StaticServerDomain in node.
     * The domain itself handles starting a server if necessary (when
     * the staticServer.getServer command is called).
     *
     * @return {jQuery.Promise} A promise that resolves/rejects when
     *     the server is ready/failed.
     */
    StaticServer.prototype.readyToServe = function () {
        const result = new $.Deferred();
        this._serverStartPromise
            .then(()=>{
                exports.trigger(EVENT_SERVER_READY);
                const baseUrl = this.getBaseUrl();
                EventManager.setTrustedOrigin(baseUrl, true);
                result.resolve();
            })
            .catch((err)=>{
                logger.reportError(err);
                const baseUrl = this.getBaseUrl();
                EventManager.setTrustedOrigin(baseUrl, false);
                result.reject();
            });
        return result.promise();
    };

    /**
     * This will add the given text to be served when the path is hit in server. use this to either serve a file
     * that doesn't exist in project, or to override a given path to the contents you give.
     */
    StaticServer.prototype.addVirtualContentAtPath = function (path, docText) {
        BaseServer.prototype.addVirtualContentAtPath.call(this, path, docText);
    };

    /**
     * See BaseServer#add. StaticServer ignores documents that do not have
     * a setInstrumentationEnabled method. Updates request filters.
     */
    StaticServer.prototype.add = function (liveDocument) {
        if (liveDocument.setInstrumentationEnabled) {
            // enable instrumentation
            liveDocument.setInstrumentationEnabled(true);
        }

        BaseServer.prototype.add.call(this, liveDocument);
    };

    /**
     * See BaseServer#remove. Updates request filters.
     */
    StaticServer.prototype.remove = function (liveDocument) {
        BaseServer.prototype.remove.call(this, liveDocument);
    };

    /**
     * removes path added by addVirtualContentAtPath()
     */
    StaticServer.prototype.removeVirtualContentAtPath = function (path) {
        BaseServer.prototype.removeVirtualContentAtPath.call(this, path);
    };

    /**
     * See BaseServer#clear. Updates request filters.
     */
    StaticServer.prototype.clear = function () {
        BaseServer.prototype.clear.call(this);
    };

    function _getMarkdown(fullPath) {
        return new Promise((resolve, reject)=>{
            DocumentManager.getDocumentForPath(fullPath)
                .done(function (doc) {
                    let text = doc.getText();
                    //  Input: special ZERO WIDTH unicode characters (for example \uFEFF) might interfere with parsing.
                    //  Some text editors add them at the start of the file. See
                    // https://github.com/markedjs/marked/issues/2139
                    text = text.replace(/^[\u200B\u200C\u200D\u200E\u200F\uFEFF]/, "");
                    let markdownHtml = marked.parse(text);
                    let templateVars = {
                        markdownContent: markdownHtml,
                        BOOTSTRAP_LIB_CSS: BootstrapCSSText,
                        HIGHLIGHT_JS_CSS: GithubCSSText,
                        HIGHLIGHT_JS: HilightJSText,
                        TRUSTED_ORIGINS_EMBED:
                            `const TRUSTED_ORIGINS_EMBED = ${JSON.stringify(Phoenix.TRUSTED_ORIGINS)};`,
                        GFM_CSS: GFMCSSText,
                        PARENT_ORIGIN: location.origin
                    };
                    let html = Mustache.render(markdownHTMLTemplate, templateVars);
                    resolve({
                        textContents: html,
                        headers: {'Content-Type': 'text/html'},
                        path: fullPath
                    });
                })
                .fail(function (err) {
                    reject(new Error(`Markdown rendering failed for ${fullPath}: ` + err));
                });
        });
    }

    /**
     * return a page loader html with redirect script tag that just redirects the page to the given redirectURL.
     * Strips the PHCODE_LIVE_PREVIEW_QUERY_PARAM in redirectURL also, indicating this is not a live previewed url.
     *
     * @param redirectURL
     * @return {string}
     * @private
     */
    function _getRedirectionPage(redirectURL) {
        let url = new URL(redirectURL);
        // strip this query param as the redirection will be done by the page loader and not the content iframe.
        url.searchParams.delete(PHCODE_LIVE_PREVIEW_QUERY_PARAM);
        let templateVars = {
            redirectURL: _getPageLoaderURL(url.href)
        };
        return Mustache.render(redirectionHTMLTemplate, templateVars);
    }

    /**
     * @private
     * Events raised by broadcast channel from the service worker will be captured here. The service worker will ask
     * all phoenix instances if the url to be served should be replaced with instrumented content here or served
     * as static file from disk.
     */
    StaticServer.prototype._getInstrumentedContent = function (requestedPath, url) {
        return new Promise((resolve, reject)=>{
            let path = this._documentKey(requestedPath),
                liveDocument = this._liveDocuments[path],
                virtualDocument = this._virtualServingDocuments[path];
            let contents;
            if(!ProjectManager.isWithinProject(requestedPath)) {
                console.error("Security issue prevented: Live preview tried to access non project resource!!!", path);
                resolve({
                    path,
                    textContents: Strings.DESCRIPTION_LIVEDEV_SECURITY
                });
                return;
            }

            url = new URL(url);
            let isLivePreviewPopoutPage = false;
            if(url.searchParams.get(PHCODE_LIVE_PREVIEW_QUERY_PARAM)) {
                isLivePreviewPopoutPage = true;
            }
            if (virtualDocument) {
                // virtual document overrides takes precedence over live preview docs
                contents = virtualDocument;
            } else if (liveDocument && liveDocument.getResponseData) {
                contents = liveDocument.getResponseData().body;
                if(isLivePreviewPopoutPage && contents.indexOf(LiveDevProtocol.getRemoteScript()) === -1){
                    // #LIVE_PREVIEW_TAB_NAVIGATION_RACE_FIX
                    // check if this is a live preview html. If so, then if you are here, it means that users switched
                    // live preview to a different page while we are just about to serve an old live preview page that is
                    // no longer in live preview. If we just serve the raw html here, it will not have any tab navigation
                    // instrumentation on popped out tabs and live preview navigation will stop on this page. So we will
                    // use a page loader url to continue navigation.
                    console.log("serving stale live preview with navigable url", url);
                    contents = _getRedirectionPage(url);
                }
            } else {
                const file = FileSystem.getFileForPath(requestedPath);
                let doc = DocumentManager.getOpenDocumentForPath(file.fullPath);
                if (doc) {
                    // this file is open in some editor, so we sent the edited contents.
                    contents = doc.getText();
                } else {
                    fs.readFile(requestedPath, fs.BYTE_ARRAY_ENCODING, function (error, binContent) {
                        if(error){
                            resolve({
                                path,
                                is404: true
                            });
                            return;
                        }
                        resolve({
                            path,
                            buffer: binContent
                        });
                    });
                    return;
                }
            }

            resolve({
                path,
                textContents: contents
            });
        });
    };

    function getContent(url) {
        const currentDocument = DocumentManager.getCurrentDocument();
        const currentFile = currentDocument? currentDocument.file : ProjectManager.getSelectedItem();
        if(!_staticServerInstance){
            return Promise.reject("Static serve not started!");
        }
        if(!url.startsWith(_staticServerInstance.getBaseUrl())) {
            return Promise.reject("Not serving content as url invalid: " + url);
        }
        const filePath = _staticServerInstance.urlToPath(url);
        if(utils.isMarkdownFile(filePath) && currentFile && currentFile.fullPath === filePath){
            return _getMarkdown(filePath);
        }
        if(_staticServerInstance){
            return _staticServerInstance._getInstrumentedContent(filePath, url);
        }
        return Promise.reject("Cannot get content");
    }

    /*getExternalContent - Special Live Preview for External Project Files
    ------------------------------------------------
    Overview:
    - This feature allows for the preview of files that are not part of the current project.
      It's specifically for files that users open in the editor but which are outside the scope
      of the project being worked on. Useful when users want to quickly view or edit files that are not
      part of the project without integrating them into the project's environment.

    Domain Separation:
    - The previews for these external files are loaded from a static server URL, not the usual live preview
      server URL.
    - This separation ensures that the active live preview environment does not have access to resources
      from external projects.

    Security Measures:
    - For security reasons, only the content of the currently viewed file is served in this special
      live preview mode.
    - HTML files are specifically not served in the live preview of external project files.
      This decision is a precaution against disk file traversal attacks. For example, if a malicious HTML
      file from a user's documents folder were allowed in the live preview, it could potentially upload
      sensitive contents from the appdata folder to a remote server. By restricting the serving of HTML
      files and isolating the external file preview environment, the system enhances security while still
      providing the flexibility to view external files to a limited extend.*/
    function getExternalContent(url) {
        return new Promise((resolve, reject)=>{
            const currentDocument = DocumentManager.getCurrentDocument();
            const currentFile = currentDocument? currentDocument.file : ProjectManager.getSelectedItem();
            url = new URL(url);
            const requestedFileName = path.basename(url.pathname);
            if(currentFile && currentFile.fullPath.endsWith(requestedFileName)) {
                // serve preview
                const fullPath = currentFile.fullPath;
                if(utils.isMarkdownFile(fullPath)) {
                    resolve(_getMarkdown(fullPath));
                    return;
                }
                if(utils.isHTMLFile(fullPath)) {
                    const pageText = _getRedirectionPage(getNoPreviewURL(
                        Strings.DESCRIPTION_LIVEDEV_PREVIEW_RESTRICTED,
                        Strings.DESCRIPTION_LIVEDEV_PREVIEW_RESTRICTED_DETAILS));
                    resolve({
                        path,
                        textContents: pageText
                    });
                    return;
                }
                fs.readFile(fullPath, fs.BYTE_ARRAY_ENCODING, function (error, binContent) {
                    if(error){
                        resolve({
                            path: fullPath,
                            is404: true
                        });
                        return;
                    }
                    resolve({
                        path: fullPath,
                        buffer: binContent
                    });
                });
                return;
            }
            resolve({
                path: url,
                is404: true
            });
        });
    }

    /**
     * See BaseServer#start. Starts listenting to StaticServerDomain events.
     */
    StaticServer.prototype.start = async function () {
        _staticServerInstance = this;
        // in browsers, the virtual server is always loaded permanently in iframe.
    };

    StaticServer.prototype.isActive = function () {
        return _staticServerInstance === this;
    };

    /**
     * See BaseServer#stop. Remove event handlers from StaticServerDomain.
     */
    StaticServer.prototype.stop = function () {
        _staticServerInstance = undefined;
    };

    function _startHeartBeatListeners() {
        // If we didn't receive heartbeat message from a tab for 10 seconds, we assume tab closed
        const TAB_HEARTBEAT_TIMEOUT = 10000; // in millis secs
        setInterval(()=>{
            let endTime = new Date();
            for(let tab of livePreviewTabs.keys()){
                const tabInfo = livePreviewTabs.get(tab);
                let timeDiff = endTime - tabInfo.lastSeen; // in ms
                if(timeDiff > TAB_HEARTBEAT_TIMEOUT){
                    livePreviewTabs.delete(tab);
                    // the parent navigationTab `phcode.dev/live-preview-loader.html` which loads the live preview tab
                    // is in the list too. We should not raise browser close for a live-preview-loader tab.
                    if(!tabInfo.navigationTab) {
                        exports.trigger('BROWSER_CLOSE', { data: { message: {clientID: tab}}});
                    }
                }
            }
        }, 1000);
    }

    /**
     * The message should be and object of the form: {type, ...}. a type attribute is mandatory
     * @param message
     */
    function messageToLivePreviewTabs(message) {
        if(!message.type){
            throw new Error('Missing type attribute to send live preview message to tabs');
        }
        liveServerConnector.execPeer('messageToLivePreviewTabs', message);
    }

    async function onLivePreviewMessage(message) {
        switch (message.type) {
        case EVENT_TAB_ONLINE:
            livePreviewTabs.set(message.clientID, {
                lastSeen: new Date(),
                URL: message.URL
            });
            return;
        default:
            exports.trigger(message.type, { data: { message}});
        }
    }

    function redirectAllTabs(newURL) {
        liveServerConnector.execPeer('navRedirectAllTabs', {
            type: 'REDIRECT_PAGE',
            URL: getTabPopoutURL(newURL)
        });
    }

    function _projectOpened(_evt, projectRoot) {
        liveServerConnector.execPeer('navMessageProjectOpened', {
            type: 'PROJECT_SWITCH',
            projectRoot: projectRoot.fullPath
        });
    }

    function _getPageLoaderURL(url) {
        return `${staticServerURL}live-preview-navigator.html?initialURL=${encodeURIComponent(url)}`
            + `&livePreviewCommURL=${encodeURIComponent(livePreviewCommURL)}`
            + `&isLoggingEnabled=${logger.loggingOptions.logLivePreview}`;
    }

    function _getExternalPreviewURL(fullPath) {
        if(utils.isHTMLFile(fullPath)) {
            return getNoPreviewURL(Strings.DESCRIPTION_LIVEDEV_PREVIEW_RESTRICTED,
                Strings.DESCRIPTION_LIVEDEV_PREVIEW_RESTRICTED_DETAILS);
        }
        if(!utils.isPreviewableFile(fullPath)){
            return getNoPreviewURL();
        }
        return `${staticServerURL}externalProject/${path.basename(fullPath)}`;
    }

    function getTabPopoutURL(url) {
        let openURL = new URL(url);
        // we tag all externally opened urls with query string parameter phcodeLivePreview="true" to address
        // #LIVE_PREVIEW_TAB_NAVIGATION_RACE_FIX
        openURL.searchParams.set(PHCODE_LIVE_PREVIEW_QUERY_PARAM, "true");
        if(utils.isHTMLFile(openURL.pathname) && url.startsWith(_staticServerInstance.getBaseUrl())){
            // this is a live preview html with in built navigation, so we can sever it as is.
            return openURL.href;
        }
        return _getPageLoaderURL(openURL.href);
    }

    function hasActiveLivePreviews() {
        return livePreviewTabs.size > 0;
    }

    /**
     * Finds out a {URL,filePath} to live preview from the project. Will return and empty object if the current
     * file is not previewable.
     * @return {Promise<*>}
     */
    async function getPreviewDetails() {
        return new Promise(async (resolve, reject)=>{ // eslint-disable-line
            // async is explicitly caught
            try {
                const currentDocument = DocumentManager.getCurrentDocument();
                const currentFile = currentDocument? currentDocument.file : ProjectManager.getSelectedItem();
                if(!currentFile || !_staticServerInstance || !_staticServerInstance.getBaseUrl()){
                    resolve({
                        URL: getNoPreviewURL(),
                        isNoPreview: true
                    });
                    return;
                }
                const projectRoot = ProjectManager.getProjectRoot().fullPath;
                let fullPath = currentFile.fullPath;
                if(!ProjectManager.isWithinProject(fullPath)){
                    // external project file. Use secure external preview link.
                    resolve({
                        URL: _getExternalPreviewURL(fullPath),
                        filePath: fullPath,
                        fullPath: fullPath,
                        isMarkdownFile: utils.isMarkdownFile(fullPath),
                        isHTMLFile: utils.isHTMLFile(fullPath)
                    });
                    return;
                }
                let httpFilePath = null;
                if(fullPath.startsWith("http://") || fullPath.startsWith("https://")){
                    httpFilePath = fullPath;
                }
                if(utils.isPreviewableFile(fullPath)){
                    const relativeFilePath = httpFilePath || path.relative(projectRoot, fullPath);
                    let URL = httpFilePath || decodeURI(_staticServerInstance.pathToUrl(fullPath));
                    resolve({
                        URL,
                        filePath: relativeFilePath,
                        fullPath: fullPath,
                        isMarkdownFile: utils.isMarkdownFile(fullPath),
                        isHTMLFile: utils.isHTMLFile(fullPath)
                    });
                } else {
                    const currentLivePreviewDetails = LiveDevelopment.getLivePreviewDetails();
                    if(currentLivePreviewDetails && currentLivePreviewDetails.liveDocument
                        &&currentLivePreviewDetails.liveDocument.isRelated(fullPath)){
                        fullPath = currentLivePreviewDetails.liveDocument.doc.file.fullPath;
                        const relativeFilePath = httpFilePath || path.relative(projectRoot, fullPath);
                        let URL = httpFilePath || decodeURI(_staticServerInstance.pathToUrl(fullPath));
                        resolve({
                            URL,
                            filePath: relativeFilePath,
                            fullPath: fullPath,
                            isMarkdownFile: utils.isMarkdownFile(fullPath),
                            isHTMLFile: utils.isHTMLFile(fullPath)
                        });
                    }
                }
            }catch (e) {
                reject(e);
            }
        });
    }

    function getRemoteTransportScript() {
        return `TRANSPORT_CONFIG.LIVE_PREVIEW_WEBSOCKET_CHANNEL_URL = "${livePreviewCommURL}";\n`;
    }

    let urlsOpenedInLast5Secs = 0;
    const MAX_URLS_OPEN_BEFORE_CONFIRM = 4;
    setInterval(()=>{
        urlsOpenedInLast5Secs = 0;
    }, 5000);
    let dialogIsShown = false;
    exports.on(EVENT_EMBEDDED_IFRAME_HREF_CLICK, function(_ev, event){
        if(dialogIsShown) {
            return;
        }
        // only in tauri, as in browsers, browser will open the href urls unlike tauri and
        // manage too many popups case as well.
        const href = event.data.href;
        urlsOpenedInLast5Secs ++;
        if(urlsOpenedInLast5Secs >= MAX_URLS_OPEN_BEFORE_CONFIRM) {
            dialogIsShown = true;
            Dialogs.showConfirmDialog(Strings.CONFIRM_EXTERNAL_BROWSER_TITLE,
                StringUtils.format(Strings.CONFIRM_EXTERNAL_BROWSER_MESSAGE, href))
                .done(id=>{
                    if (id === Dialogs.DIALOG_BTN_OK) {
                        urlsOpenedInLast5Secs = 0;
                        href && NativeApp.openURLInDefaultBrowser(href);
                    }
                    dialogIsShown = false;
                });
        } else {
            href && NativeApp.openURLInDefaultBrowser(href);
        }
    });

    function _isLiveHighlightEnabled() {
        return CommandManager.get(Commands.FILE_LIVE_HIGHLIGHT).getChecked();
    }
    exports.on(EVENT_EMBEDDED_IFRAME_ESCAPE_PRESS, function () {
        if(!_isLiveHighlightEnabled()){
            return;
        }
        utils.focusActiveEditorIfFocusInLivePreview();
    });

    function init() {
        window.nodeSetupDonePromise.then(nodeConfig =>{
            staticServerURL = `${nodeConfig.staticServerURL}/`;
            livePreviewCommURL = `${nodeConfig.livePreviewCommURL}`;
        });
        liveServerConnector = NodeConnector.createNodeConnector(LIVE_SERVER_NODE_CONNECTOR_ID, exports);
        LiveDevelopment.setLivePreviewTransportBridge(exports);
        ProjectManager.on(ProjectManager.EVENT_PROJECT_OPEN, _projectOpened);
        _startHeartBeatListeners();
        EventManager.registerEventHandler("ph-liveServer", exports);
    }

    exports.init = init;
    exports.StaticServer = StaticServer;
    exports.messageToLivePreviewTabs = messageToLivePreviewTabs;
    exports.livePreviewTabs = livePreviewTabs;
    exports.redirectAllTabs = redirectAllTabs;
    exports.getTabPopoutURL = getTabPopoutURL;
    exports.hasActiveLivePreviews = hasActiveLivePreviews;
    exports.getNoPreviewURL = getNoPreviewURL;
    exports.getPreviewDetails = getPreviewDetails;
    exports.getRemoteTransportScript = getRemoteTransportScript;
    // node apis
    exports.tabLoaderOnline = tabLoaderOnline;
    exports.getContent = getContent;
    exports.getExternalContent = getExternalContent;
    exports.onLivePreviewMessage = onLivePreviewMessage;
    exports.PHCODE_LIVE_PREVIEW_QUERY_PARAM = PHCODE_LIVE_PREVIEW_QUERY_PARAM;
    exports.EVENT_SERVER_READY = EVENT_SERVER_READY;
});
