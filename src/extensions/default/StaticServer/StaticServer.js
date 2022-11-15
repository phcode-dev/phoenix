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

    const BaseServer           = brackets.getModule("LiveDevelopment/Servers/BaseServer").BaseServer,
        LiveDevelopmentUtils = brackets.getModule("LiveDevelopment/LiveDevelopmentUtils"),
        broadcastChannel = new BroadcastChannel('sw-virtual-server-msgs');

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
        BaseServer.call(this, config);
    }

    StaticServer.prototype = Object.create(BaseServer.prototype);
    StaticServer.prototype.constructor = StaticServer;

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
    StaticServer.prototype.handleEvent = function (event) {
        switch (event.data.type){
        default: console.error("StaticServer Extn, received unknown message: ", event);
        }
        /* TODO: enable below code for next stage of live preview
        var key             = request.location.pathname,
            liveDocument    = this._liveDocuments[key],
            response;

        // send instrumented response or null to fallback to static file
        if (liveDocument && liveDocument.getResponseData) {
            response = liveDocument.getResponseData();
        } else {
            response = {};  // let server fall back on loading file off disk
        }
        response.id = request.id;

        this._send(request.location, response);*/
    };

    /**
     * See BaseServer#start. Starts listenting to StaticServerDomain events.
     */
    StaticServer.prototype.start = function () {
        broadcastChannel.addEventListener('message', this);
    };

    /**
     * See BaseServer#stop. Remove event handlers from StaticServerDomain.
     */
    StaticServer.prototype.stop = function () {
        broadcastChannel.removeEventListener('message', this);
    };

    module.exports = StaticServer;
});
