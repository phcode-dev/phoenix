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

/*global Phoenix, logger, fs */

define(function (require, exports, module) {

    const BaseServer = brackets.getModule("LiveDevelopment/Servers/BaseServer").BaseServer,
        LiveDevelopmentUtils = brackets.getModule("LiveDevelopment/LiveDevelopmentUtils"),
        LiveDevelopment    = brackets.getModule("LiveDevelopment/main"),
        LiveDevServerManager = brackets.getModule("LiveDevelopment/LiveDevServerManager"),
        marked = brackets.getModule('thirdparty/marked.min'),
        DocumentManager = brackets.getModule("document/DocumentManager"),
        Mustache = brackets.getModule("thirdparty/mustache/mustache"),
        FileSystem = brackets.getModule("filesystem/FileSystem"),
        EventDispatcher = brackets.getModule("utils/EventDispatcher"),
        EventManager = brackets.getModule("utils/EventManager"),
        ProjectManager = brackets.getModule("project/ProjectManager"),
        Strings = brackets.getModule("strings"),
        markdownHTMLTemplate = require("text!markdown.html");

    EventDispatcher.makeEventDispatcher(exports);

    let _staticServerInstance, $livepreviewServerIframe;

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

    const EVENT_GET_PHOENIX_INSTANCE_ID = 'GET_PHOENIX_INSTANCE_ID';
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
        config.baseUrl= LiveDevServerManager.getStaticServerBaseURLs().projectBaseURL;
        this._sendInstrumentedContent = this._sendInstrumentedContent.bind(this);
        BaseServer.call(this, config);
    }

    StaticServer.prototype = Object.create(BaseServer.prototype);
    StaticServer.prototype.constructor = StaticServer;

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
            baseUrl = "";

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

    /**
     * @private
     * Send HTTP response data back to the StaticServerSomain
     */
    StaticServer.prototype._send = function (location, response) {
        this._nodeDomain.exec("writeFilteredResponse", location.root, location.pathname, response);
    };

    function _sendMarkdown(fullPath, requestID) {
        DocumentManager.getDocumentForPath(fullPath)
            .done(function (doc) {
                let text = doc.getText();
                let markdownHtml = marked.parse(text);
                let templateVars = {
                    markdownContent: markdownHtml,
                    BOOTSTRAP_LIB_CSS: `${window.parent.Phoenix.baseURL}thirdparty/bootstrap/bootstrap.min.css`,
                    HIGHLIGHT_JS_CSS: `${window.parent.Phoenix.baseURL}thirdparty/highlight.js/styles/github.min.css`,
                    HIGHLIGHT_JS: `${window.parent.Phoenix.baseURL}thirdparty/highlight.js/highlight.min.js`,
                    GFM_CSS: `${window.parent.Phoenix.baseURL}thirdparty/gfm.min.css`
                };
                let html = Mustache.render(markdownHTMLTemplate, templateVars);
                messageToLivePreviewTabs({
                    type: 'REQUEST_RESPONSE',
                    requestID, //pass along the requestID to call the appropriate callback at service worker
                    fullPath,
                    contents: html,
                    headers: {'Content-Type': 'text/html'}
                });
            })
            .fail(function (err) {
                console.error(`Markdown rendering failed for ${fullPath}: `, err);
            });
    }

    function _getExtension(filePath) {
        filePath = filePath || '';
        let pathSplit = filePath.split('.');
        return pathSplit && pathSplit.length>1 ? pathSplit[pathSplit.length-1] : '';
    }

    function _isMarkdownFile(filePath) {
        let extension = _getExtension(filePath);
        return ['md', 'markdown'].includes(extension.toLowerCase());
    }

    /**
     * @private
     * Events raised by broadcast channel from the service worker will be captured here. The service worker will ask
     * all phoenix instances if the url to be served should be replaced with instrumented content here or served
     * as static file from disk.
     * @param {{hostname: string, pathname: string, port: number, root: string, id: number}} request
     */
    StaticServer.prototype._sendInstrumentedContent = function (data) {
        if(data.phoenixInstanceID && data.phoenixInstanceID !== Phoenix.PHOENIX_INSTANCE_ID) {
            return;
        }
        let path = this._documentKey(data.path),
            requestID = data.requestID,
            liveDocument = this._liveDocuments[path],
            virtualDocument = this._virtualServingDocuments[path];
        let contents;
        if(!ProjectManager.isWithinProject(data.path)) {
            console.error("Security issue prevented: Live preview tried to access non project resource!!!", path);
            messageToLivePreviewTabs({
                type: 'REQUEST_RESPONSE',
                requestID, //pass along the requestID
                path,
                contents: Strings.DESCRIPTION_LIVEDEV_SECURITY
            });
            return;
        }

        if (virtualDocument) {
            // virtual document overrides takes precedence over live preview docs
            contents = virtualDocument;
        } else if (liveDocument && liveDocument.getResponseData) {
            contents = liveDocument.getResponseData().body;
        } else {
            const file = FileSystem.getFileForPath(data.path);
            let doc = DocumentManager.getOpenDocumentForPath(file.fullPath);
            if (doc) {
                // this file is open in some editor, so we sent the edited contents.
                contents = doc.getText();
            } else {
                fs.readFile(data.path, fs.BYTE_ARRAY_ENCODING, function (error, binContent) {
                    if(error){
                        contents = null;
                    }
                    contents = binContent;
                    messageToLivePreviewTabs({
                        type: 'REQUEST_RESPONSE',
                        requestID, //pass along the requestID
                        path,
                        contents
                    });
                });
                return;
            }
        }

        messageToLivePreviewTabs({
            type: 'REQUEST_RESPONSE',
            requestID, //pass along the requestID so that the appropriate callback will be hit at the service worker
            path,
            contents: contents
        });
    };

    function getContent(eventData) {
        window.logger.livePreview.log("Static server: ", eventData, Phoenix.PHOENIX_INSTANCE_ID);
        if (eventData.eventName === "GET_CONTENT"
            && eventData.message.phoenixInstanceID === Phoenix.PHOENIX_INSTANCE_ID) {
            // localStorage is domain specific so when it changes in one window it changes in the other
            if(_isMarkdownFile(eventData.message.path)){
                _sendMarkdown(eventData.message.path, eventData.message.requestID);
                return;
            }
            if(_staticServerInstance){
                _staticServerInstance._sendInstrumentedContent(eventData.message);
            }
        }
    };

    let serverStarted = false;
    /**
     * See BaseServer#start. Starts listenting to StaticServerDomain events.
     */
    StaticServer.prototype.start = function () {
        _staticServerInstance = this;

        // load the hidden iframe that loads the service worker server page once. we will reuse the same server
        // as this is a cross-origin server phcode.live, the browser will identify it as a security issue
        // if we continuously reload the service worker loader page frequently and it will stop working.
        if(serverStarted){
            return;
        }
        $livepreviewServerIframe = $("#live-preview-server-iframe");
        let url = LiveDevServerManager.getStaticServerBaseURLs().baseURL +
            `?parentOrigin=${location.origin}`;
        $livepreviewServerIframe.attr("src", url);
        serverStarted = true;
    };

    /**
     * See BaseServer#stop. Remove event handlers from StaticServerDomain.
     */
    StaticServer.prototype.stop = function () {
        _staticServerInstance = undefined;
    };

    EventManager.registerEventHandler("ph-liveServer", exports);
    exports.on("REPORT_ERROR", function(_ev, event){
        logger.reportError(new Error(event.data.message));
    });
    exports.on("GET_CONTENT", function(_ev, event){
        window.logger.livePreview.log(event.data);
        getContent(event.data);
    });
    exports.on(EVENT_GET_PHOENIX_INSTANCE_ID, function(_ev){
        messageToLivePreviewTabs({
            type: 'PHOENIX_INSTANCE_ID',
            PHOENIX_INSTANCE_ID: Phoenix.PHOENIX_INSTANCE_ID
        });
    });

    /**
     * The message should be and object of the form: {type, ...}. a type attribute is mandatory
     * @param message
     */
    function messageToLivePreviewTabs(message) {
        if(!message.type){
            throw new Error('Missing type attribute to send live preview message to tabs');
        }
        // The embedded iframe is a trusted origin and hence we use '*'. We can alternatively use
        // LiveDevServerManager.getStaticServerBaseURLs().origin, but there seems to be a single error on startup
        // Most likely as we switch frequently between about:blank and the live preview server host page.
        // Error message in console:
        // `Failed to execute 'postMessage' on 'DOMWindow': The target origin provided ('http://localhost:8001')
        // does not match the recipient window's origin ('http://localhost:8000').`
        $livepreviewServerIframe && $livepreviewServerIframe[0].contentWindow.postMessage(message, '*');
    }

    LiveDevelopment.setLivePreviewTransportBridge(exports);
    exports.StaticServer = StaticServer;
    exports.messageToLivePreviewTabs = messageToLivePreviewTabs;
});
