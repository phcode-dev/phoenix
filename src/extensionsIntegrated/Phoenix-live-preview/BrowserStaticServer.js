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

/*global Phoenix, logger, fs, path */

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
        EventManager = require("utils/EventManager"),
        ProjectManager = require("project/ProjectManager"),
        Strings = require("strings"),
        utils = require('./utils'),
        BootstrapCSSText = require("text!thirdparty/bootstrap/bootstrap.min.css"),
        GithubCSSText = require("text!thirdparty/highlight.js/styles/github.min.css"),
        HilightJSText = require("text!thirdparty/highlight.js/highlight.min.js"),
        GFMCSSText = require("text!thirdparty/gfm.min.css"),
        markdownHTMLTemplate = require("text!./markdown.html"),
        redirectionHTMLTemplate = require("text!./redirectPage.html");

    const EVENT_GET_PHOENIX_INSTANCE_ID = 'GET_PHOENIX_INSTANCE_ID';
    const EVENT_GET_CONTENT = 'GET_CONTENT';
    const EVENT_TAB_ONLINE = 'TAB_ONLINE';
    const EVENT_REPORT_ERROR = 'REPORT_ERROR';
    const EVENT_UPDATE_TITLE_ICON = 'UPDATE_TITLE_AND_ICON';
    const EVENT_SERVER_READY = 'SERVER_READY';

    EventDispatcher.makeEventDispatcher(exports);

    const livePreviewTabs = new Map();
    const PHCODE_LIVE_PREVIEW_QUERY_PARAM = "phcodeLivePreview";

    const NAVIGATOR_CHANNEL_ID = `live-preview-loader-${Phoenix.PHOENIX_INSTANCE_ID}`;
    let navigatorChannel;
    const LIVE_PREVIEW_MESSENGER_CHANNEL = `live-preview-messenger-${Phoenix.PHOENIX_INSTANCE_ID}`;
    let livePreviewChannel;
    let _staticServerInstance, $livepreviewServerIframe;

    const LIVE_PREVIEW_STATIC_SERVER_BASE_URL = "https://phcode.live/",
        LIVE_PREVIEW_STATIC_SERVER_ORIGIN = "https://phcode.live";
    // #LIVE_PREVIEW_STATIC_SERVER_BASE_URL_OVERRIDE uncomment below line if you are developing -
    // live preview server for browser.
    // const LIVE_PREVIEW_STATIC_SERVER_BASE_URL = "http://localhost:8001/";
    // const LIVE_PREVIEW_STATIC_SERVER_ORIGIN = "http://localhost:8001";
    function getStaticServerBaseURLs() {
        return {
            baseURL: LIVE_PREVIEW_STATIC_SERVER_BASE_URL,
            origin: LIVE_PREVIEW_STATIC_SERVER_ORIGIN,
            previewBaseURL:
                `${LIVE_PREVIEW_STATIC_SERVER_BASE_URL}vfs/PHOENIX_LIVE_PREVIEW_${Phoenix.PHOENIX_INSTANCE_ID}`
        };
    }

    function getLivePreviewBaseURL() {
        return getStaticServerBaseURLs().previewBaseURL;
    }

    function getLivePreviewNotSupportedURL() {
        return `${window.Phoenix.baseURL}assets/phoenix-splash/live-preview-error.html?mainHeading=`+
            encodeURIComponent(`${Strings.DESCRIPTION_LIVEDEV_MAIN_HEADING}`) + "&mainSpan="+
            encodeURIComponent(`${Strings.DESCRIPTION_LIVEDEV_MAIN_SPAN}`);
    }

    function getNoPreviewURL(){
        return `${window.Phoenix.baseURL}assets/phoenix-splash/no-preview.html?jsonInput=`+
            encodeURIComponent(`{"heading":"${Strings.DESCRIPTION_LIVEDEV_NO_PREVIEW}",`
                +`"details":"${Strings.DESCRIPTION_LIVEDEV_NO_PREVIEW_DETAILS}"}`);
    }

    function _isLivePreviewSupported() {
        // in safari, service workers are disabled in third party iframes. We use phcode.live for secure sandboxing
        // live previews into its own domain apart from phcode.dev. Since safari doesn't support this, we are left
        // with using phcode.dev domain directly for live previews. That is a large attack surface for untrusted
        // code execution. so we will disable live previews in safari instead of shipping a security vulnerability.
        return Phoenix.browser.isTauri || !(Phoenix.browser.desktop.isSafari || Phoenix.browser.mobile.isIos);
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
                if(!_isLivePreviewSupported()){
                    resolve({
                        URL: getLivePreviewNotSupportedURL(),
                        isNoPreview: true
                    });
                    return;
                }
                const projectRoot = ProjectManager.getProjectRoot().fullPath;
                const projectRootUrl = `${getLivePreviewBaseURL()}${projectRoot}`;
                const currentDocument = DocumentManager.getCurrentDocument();
                const currentFile = currentDocument? currentDocument.file : ProjectManager.getSelectedItem();
                if(currentFile){
                    let fullPath = currentFile.fullPath;
                    let httpFilePath = null;
                    if(fullPath.startsWith("http://") || fullPath.startsWith("https://")){
                        httpFilePath = fullPath;
                    }
                    if(utils.isPreviewableFile(fullPath)){
                        const filePath = httpFilePath || path.relative(projectRoot, fullPath);
                        let URL = httpFilePath || `${projectRootUrl}${filePath}`;
                        resolve({
                            URL,
                            filePath: filePath,
                            fullPath: fullPath,
                            isMarkdownFile: utils.isMarkdownFile(fullPath),
                            isHTMLFile: utils.isHTMLFile(fullPath)
                        });
                        return;
                    }
                }
                resolve({
                    URL: getNoPreviewURL(),
                    isNoPreview: true
                });
            }catch (e) {
                reject(e);
            }
        });
    }

    function _initNavigatorChannel() {
        navigatorChannel = new BroadcastChannel(NAVIGATOR_CHANNEL_ID);
        navigatorChannel.onmessage = (event) => {
            window.logger.livePreview.log("Live Preview navigator channel: Phoenix received event from tab: ", event);
            const type = event.data.type;
            switch (type) {
            case 'TAB_LOADER_ONLINE':
                livePreviewTabs.set(event.data.pageLoaderID, {
                    lastSeen: new Date(),
                    URL: event.data.URL,
                    navigationTab: true
                });
                return;
            default: return; // ignore messages not intended for us.
            }
        };
    }

    // this is the server tabs located at "src/live-preview.html" which embeds the `phcode.live` server and
    // preview iframes.
    function _sendToLivePreviewServerTabs(data, pageLoaderID=null) {
        livePreviewChannel.postMessage({
            pageLoaderID,
            data
        });
    }

    function _initLivePreviewChannel() {
        livePreviewChannel = new BroadcastChannel(LIVE_PREVIEW_MESSENGER_CHANNEL);
        livePreviewChannel.onmessage = (event) => {
            window.logger.livePreview.log("StaticServer: Live Preview message channel Phoenix recvd:", event);
            const pageLoaderID = event.data.pageLoaderID;
            const data = event.data.data;
            const eventName =  data.eventName;
            const message =  data.message;
            switch (eventName) {
            case EVENT_GET_PHOENIX_INSTANCE_ID:
                _sendToLivePreviewServerTabs({
                    type: 'PHOENIX_INSTANCE_ID',
                    PHOENIX_INSTANCE_ID: Phoenix.PHOENIX_INSTANCE_ID
                }, pageLoaderID);
                return;
            case EVENT_GET_CONTENT:
                getContent(message.path,  message.url)
                    .then(response =>{
                        // response has the following attributes set
                        // response.contents: <text or arrayBuffer content>,
                        // response.path
                        // headers: {'Content-Type': 'text/html'} // optional headers
                        response.type = 'REQUEST_RESPONSE';
                        response.requestID = message.requestID;
                        _sendToLivePreviewServerTabs(response, pageLoaderID);
                    })
                    .catch(console.error);
                return;
            case EVENT_TAB_ONLINE:
                livePreviewTabs.set(message.clientID, {
                    lastSeen: new Date(),
                    URL: message.URL
                });
                return;
            case EVENT_REPORT_ERROR:
                logger.reportError(new Error(message));
                return;
            default:
                exports.trigger(eventName, {
                    data
                });
            }
        };
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
        this._baseUrl       = getStaticServerBaseURLs().previewBaseURL;
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

            return `${baseUrl}${encodeURI(path)}`;
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
        let path,
            baseUrl = this.getBaseUrl();

        if (baseUrl !== "" && url.indexOf(baseUrl) === 0) {
            // Use base url to translate to local file path.
            // Need to use encoded project path because it's decoded below.
            path = url.replace(baseUrl, "");

            return decodeURI(path);
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
        return $.Deferred().resolve().promise(); // virtual server is always assumed present in phoenix
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
                        GFM_CSS: GFMCSSText
                    };
                    let html = Mustache.render(markdownHTMLTemplate, templateVars);
                    resolve({
                        contents: html,
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
            redirectURL: url.href
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
                    contents: Strings.DESCRIPTION_LIVEDEV_SECURITY
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
                            binContent = null;
                        }
                        resolve({
                            path,
                            contents: binContent
                        });
                    });
                    return;
                }
            }

            resolve({
                path,
                contents: contents
            });
        });
    };

    function getContent(path, url) {
        if(!_staticServerInstance){
            return Promise.reject("Static serve not started!");
        }
        if(!url.startsWith(_staticServerInstance.getBaseUrl())) {
            return Promise.reject("Not serving content as url belongs to another phcode instance: " + url);
        }
        if(utils.isMarkdownFile(path)){
            return _getMarkdown(path);
        }
        if(_staticServerInstance){
            return _staticServerInstance._getInstrumentedContent(path, url);
        }
        return Promise.reject("Cannot get content");
    };

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

    exports.on(EVENT_REPORT_ERROR, function(_ev, event){
        logger.reportError(new Error(event.data.message));
    });
    exports.on(EVENT_GET_CONTENT, function(_ev, event){
        window.logger.livePreview.log("Static Server GET_CONTENT", event);
        if(event.data.message && event.data.message.phoenixInstanceID === Phoenix.PHOENIX_INSTANCE_ID) {
            const requestPath = event.data.message.path,
                requestID = event.data.message.requestID,
                url = event.data.message.url;
            getContent(requestPath, url)
                .then(response =>{
                    // response has the following attributes set
                    // response.contents: <text or arrayBuffer content>,
                    // response.path
                    // headers: {'Content-Type': 'text/html'} // optional headers
                    response.type = 'REQUEST_RESPONSE';
                    response.requestID = requestID;
                    messageToLivePreviewTabs(response);
                })
                .catch(console.error);
        }
    });
    exports.on(EVENT_GET_PHOENIX_INSTANCE_ID, function(_ev){
        messageToLivePreviewTabs({
            type: 'PHOENIX_INSTANCE_ID',
            PHOENIX_INSTANCE_ID: Phoenix.PHOENIX_INSTANCE_ID
        });
    });

    exports.on(EVENT_TAB_ONLINE, function(_ev, event){
        livePreviewTabs.set(event.data.message.clientID, {
            lastSeen: new Date(),
            URL: event.data.message.URL
        });
    });

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
        // The embedded iframe is a trusted origin and hence we use '*'. We can alternatively use
        // getStaticServerBaseURLs().origin, but there seems to be a single error on startup
        // Most likely as we switch frequently between about:blank and the live preview server host page.
        // Error message in console:
        // `Failed to execute 'postMessage' on 'DOMWindow': The target origin provided ('http://localhost:8001')
        // does not match the recipient window's origin ('http://localhost:8000').`
        $livepreviewServerIframe && $livepreviewServerIframe[0].contentWindow.postMessage(message, '*');
        _sendToLivePreviewServerTabs(message);
    }

    function redirectAllTabs(newURL) {
        navigatorChannel.postMessage({
            type: 'REDIRECT_PAGE',
            url: newURL
        });
    }

    function _projectOpened(_evt, projectRoot) {
        navigatorChannel.postMessage({
            type: 'PROJECT_SWITCH',
            projectRoot: projectRoot.fullPath
        });
    }

    exports.on(EVENT_UPDATE_TITLE_ICON, function(_ev, event){
        const title = event.data.message.title;
        const faviconBase64 = event.data.message.faviconBase64;
        navigatorChannel.postMessage({
            type: 'UPDATE_TITLE_ICON',
            title,
            faviconBase64
        });
    });

    function getPageLoaderURL(url) {
        return `${Phoenix.baseURL}live-preview-loader.html?`
            +`virtualServerURL=${encodeURIComponent(getStaticServerBaseURLs().baseURL)}`
            +`&phoenixInstanceID=${Phoenix.PHOENIX_INSTANCE_ID}&initialURL=${encodeURIComponent(url)}`
            +`&localMessage=${encodeURIComponent(Strings.DESCRIPTION_LIVEDEV_SECURITY_POPOUT_MESSAGE)}`
            +`&appName=${encodeURIComponent(Strings.APP_NAME)}`
            +`&initialProjectRoot=${encodeURIComponent(ProjectManager.getProjectRoot().fullPath)}`
            +`&okMessage=${encodeURIComponent(Strings.TRUST_PROJECT)}`;
    }

    function getTabPopoutURL(url) {
        let openURL = new URL(url);
        // we tag all externally opened urls with query string parameter phcodeLivePreview="true" to address
        // #LIVE_PREVIEW_TAB_NAVIGATION_RACE_FIX
        openURL.searchParams.set(StaticServer.PHCODE_LIVE_PREVIEW_QUERY_PARAM, "true");
        return  getPageLoaderURL(openURL.href);
    }

    function hasActiveLivePreviews() {
        return livePreviewTabs.size > 0;
    }

    function init() {
        LiveDevelopment.setLivePreviewTransportBridge(exports);
        // load the hidden iframe that loads the service worker server page once. we will reuse the same server
        // as this is a cross-origin server phcode.live, the browser will identify it as a security issue
        // if we continuously reload the service worker loader page frequently and it will stop working.
        $livepreviewServerIframe = $("#live-preview-server-iframe");
        let url = getStaticServerBaseURLs().baseURL +
            `?parentOrigin=${location.origin}`;
        $livepreviewServerIframe.attr("src", url);
        _initNavigatorChannel();
        _initLivePreviewChannel();
        EventManager.registerEventHandler("ph-liveServer", exports);
        ProjectManager.on(ProjectManager.EVENT_PROJECT_OPEN, _projectOpened);
        _startHeartBeatListeners();
    }

    exports.init = init;
    exports.StaticServer = StaticServer;
    exports.messageToLivePreviewTabs = messageToLivePreviewTabs;
    exports.getPreviewDetails = getPreviewDetails;
    exports.livePreviewTabs = livePreviewTabs;
    exports.redirectAllTabs = redirectAllTabs;
    exports.getTabPopoutURL = getTabPopoutURL;
    exports.hasActiveLivePreviews = hasActiveLivePreviews;
    exports.getNoPreviewURL = getNoPreviewURL;
    exports.PHCODE_LIVE_PREVIEW_QUERY_PARAM = PHCODE_LIVE_PREVIEW_QUERY_PARAM;
    exports.EVENT_SERVER_READY = EVENT_SERVER_READY;
});
