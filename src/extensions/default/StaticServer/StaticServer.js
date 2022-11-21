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

define(function (require, exports, module) {

    const BaseServer = brackets.getModule("LiveDevelopment/Servers/BaseServer").BaseServer,
        LiveDevelopmentUtils = brackets.getModule("LiveDevelopment/LiveDevelopmentUtils"),
        ServiceWorkerTransport = brackets.getModule("LiveDevelopment/MultiBrowserImpl/transports/ServiceWorkerTransport"),
        FileUtils = brackets.getModule("file/FileUtils");

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
        config.baseUrl = FileUtils.stripTrailingSlash(window.fsServerUrl);
        this._getInstrumentedContent = this._getInstrumentedContent.bind(this);
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
     * @private
     * Update the list of paths that fire "request" events
     * @return {jQuery.Promise} Resolved by the StaticServer domain when the message is acknowledged.
     */
    StaticServer.prototype._updateInstrumentedURLSInWorker = function () {
        let paths = Object.keys(this._liveDocuments);

        window.messageSW({
            type: 'setInstrumentedURLs',
            root: this._root,
            paths
        }).then((status)=>{
            console.log(`Static server received msg from Service worker: setInstrumentedURLs done: `, status);
        }).catch(err=>{
            console.error("Static server received msg from Service worker: Error while setInstrumentedURLs", err);
        });
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
     * See BaseServer#add. StaticServer ignores documents that do not have
     * a setInstrumentationEnabled method. Updates request filters.
     */
    StaticServer.prototype.add = function (liveDocument) {
        if (liveDocument.setInstrumentationEnabled) {
            // enable instrumentation
            liveDocument.setInstrumentationEnabled(true);
        }

        BaseServer.prototype.add.call(this, liveDocument);

        // update the paths to watch
        this._updateInstrumentedURLSInWorker();
    };

    /**
     * See BaseServer#remove. Updates request filters.
     */
    StaticServer.prototype.remove = function (liveDocument) {
        BaseServer.prototype.remove.call(this, liveDocument);

        this._updateInstrumentedURLSInWorker();
    };

    /**
     * See BaseServer#clear. Updates request filters.
     */
    StaticServer.prototype.clear = function () {
        BaseServer.prototype.clear.call(this);

        this._updateInstrumentedURLSInWorker();
    };

    /**
     * @private
     * Send HTTP response data back to the StaticServerSomain
     */
    StaticServer.prototype._send = function (location, response) {
        this._nodeDomain.exec("writeFilteredResponse", location.root, location.pathname, response);
    };

    /**
     * @private
     * Events raised by broadcast channel from the service worker will be captured here. The service worker will ask
     * all phoenix instances if the url to be served should be replaced with instrumented content here or served
     * as static file from disk.
     * @param {jQuery.Event} event the event raised by the service worker
     * @param {{hostname: string, pathname: string, port: number, root: string, id: number}} request
     */
    StaticServer.prototype._getInstrumentedContent = function (event, data) {
        let path = this._documentKey(data.path),
            requestID = data.requestID,
            liveDocument = this._liveDocuments[path];
        let response = {};
        if (liveDocument && liveDocument.getResponseData) {
            response = liveDocument.getResponseData();
        }
        navigator.serviceWorker.controller.postMessage({
            type: 'REQUEST_RESPONSE',
            requestID, // pass along the request ID so that the appropriate callback will be hit at the service worker
            path,
            contents: response.body
        });
    };

    /**
     * See BaseServer#start. Starts listenting to StaticServerDomain events.
     */
    StaticServer.prototype.start = function () {
        ServiceWorkerTransport.on("getInstrumentedContent", this._getInstrumentedContent);
    };

    /**
     * See BaseServer#stop. Remove event handlers from StaticServerDomain.
     */
    StaticServer.prototype.stop = function () {
        ServiceWorkerTransport.off("getInstrumentedContent", this._getInstrumentedContent);
    };

    module.exports = StaticServer;
});
