/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
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
 */

/**
 * LiveDevelopment allows Brackets to launch a browser with a "live preview" that's
 * connected to the current editor.
 *
 * # STARTING
 *
 * To start a session call `open`. This will read the currentDocument from brackets,
 * launch it in the default browser, and connect to it for live editing.
 *
 * # STOPPING
 *
 * To stop a session call `close`. This will close the connection to the browser
 * (but will not close the browser tab).
 *
 * # STATUS
 *
 * Status updates are dispatched as `statusChange` jQuery events. The status
 * is passed as the first parameter and the reason for the change as the second
 * parameter. Currently only the "Inactive" status supports the reason parameter.
 * The status codes are:
 *
 *  0: Inactive
 *  1: Connecting (waiting for a browser connection)
 *  2: Active
 *  3: Out of sync
 *  4: Sync error
 *  5: Reloading (after saving JS changes)
 *  6: Restarting (switching context to a new HTML live doc)
 *
 * The reason codes are:
 * - null (Unknown reason)
 * - "explicit_close" (LiveDevelopment.close() was called)
 * - "navigated_away" (The browser changed to a location outside of the project)
 * - "detached_target_closed" (The tab or window was closed)
 */
define(function (require, exports, module) {


    // Status Codes
    const STATUS_INACTIVE      = exports.STATUS_INACTIVE       =  0;
    const STATUS_CONNECTING    = exports.STATUS_CONNECTING     =  1;
    const STATUS_ACTIVE        = exports.STATUS_ACTIVE         =  2;
    const STATUS_OUT_OF_SYNC   = exports.STATUS_OUT_OF_SYNC    =  3;
    const STATUS_SYNC_ERROR    = exports.STATUS_SYNC_ERROR     =  4;
    const STATUS_RELOADING     = exports.STATUS_RELOADING      =  5;
    const STATUS_RESTARTING    = exports.STATUS_RESTARTING     =  6;

    // events
    const EVENT_OPEN_PREVIEW_URL = "openPreviewURL",
        EVENT_CONNECTION_CLOSE = "ConnectionClose",
        EVENT_STATUS_CHANGE = "statusChange";

    const Dialogs              = require("widgets/Dialogs"),
        DefaultDialogs       = require("widgets/DefaultDialogs"),
        DocumentManager      = require("document/DocumentManager"),
        EditorManager        = require("editor/EditorManager"),
        EventDispatcher      = require("utils/EventDispatcher"),
        MainViewManager      = require("view/MainViewManager"),
        ProjectManager       = require("project/ProjectManager"),
        Strings              = require("strings"),
        LiveDevelopmentUtils = require("LiveDevelopment/LiveDevelopmentUtils"),
        LiveDevServerManager = require("LiveDevelopment/LiveDevServerManager"),
        LivePreviewTransport  = require("LiveDevelopment/MultiBrowserImpl/transports/LivePreviewTransport"),
        LiveDevProtocol      = require("LiveDevelopment/MultiBrowserImpl/protocol/LiveDevProtocol"),
        Metrics              = require("utils/Metrics"),
        PageLoaderWorkerScript = require("text!LiveDevelopment/BrowserScripts/pageLoaderWorker.js");

    // Documents
    const LiveCSSDocument      = require("LiveDevelopment/MultiBrowserImpl/documents/LiveCSSDocument"),
        LiveHTMLDocument     = require("LiveDevelopment/MultiBrowserImpl/documents/LiveHTMLDocument");

    /**
     * @private
     * The live HTML document for the currently active preview.
     * @type {LiveHTMLDocument}
     */
    var _liveDocument;

    /**
     * Live preview only tracks the pinned document.
     * @type {boolean}
     */
    let livePreviewUrlPinned = false;
    let currentPreviewFilePath;

    /**
     * @private
     * Live documents related to the active HTML document - for example, CSS files
     * that are used by the document.
     * @type {Object.<string: {LiveHTMLDocument|LiveCSSDocument}>}
     */
    var _relatedDocuments = {};

    /**
     * @private
     * Protocol handler that provides the actual live development API on top of the current transport.
     */
    var _protocol = LiveDevProtocol;

    /**
     * @private
     * Current live preview server
     * @type {BaseServer}
     */
    var _server;

    /**
     * @private
     * Determine which live document class should be used for a given document
     * @param {Document} document The document we want to create a live document for.
     * @return {function} The constructor for the live document class; will be a subclass of LiveDocument.
     */
    function _classForDocument(doc) {
        if (doc.getLanguage().getId() === "css") {
            return LiveCSSDocument;
        }

        if (LiveDevelopmentUtils.isHtmlFileExt(doc.file.fullPath)) {
            return LiveHTMLDocument;
        }

        return null;
    }

    /**
     * Returns true if the global Live Development mode is on (might be in the middle of connecting).
     * @return {boolean}
     */
    function isActive() {
        return exports.status > STATUS_INACTIVE;
    }

    /**
     * Returns the live document for a given path, or null if there is no live document for it.
     * @param {string} path
     * @return {?LiveDocument}
     */
    function getLiveDocForPath(path) {
        if (!_server) {
            return null;
        }

        return _server.get(path);
    }

    /**
     * @private
     * Close a live document.
     * @param {LiveDocument}
     */
    function _closeDocument(liveDocument) {
        liveDocument.off(".livedev");
        _protocol.off(".livedev");
        liveDocument.close();
    }

    /**
     * Removes the given CSS/JSDocument from _relatedDocuments. Signals that the
     * given file is no longer associated with the HTML document that is live (e.g.
     * if the related file has been deleted on disk).
     * @param {string} url Absolute URL of the related document
     */
    function _handleRelatedDocumentDeleted(url) {
        var liveDoc = _relatedDocuments[url];
        if (liveDoc) {
            delete _relatedDocuments[url];
        }

        if (_server) {
            _server.remove(liveDoc);
        }
        _closeDocument(liveDoc);
    }

    /**
     * Update the status. Triggers a statusChange event.
     * @param {number} status new status
     * @param {?string} closeReason Optional string key suffix to display to
     *     user when closing the live development connection (see LIVE_DEV_* keys)
     */
    function _setStatus(status, closeReason) {
        // Don't send a notification when the status didn't actually change
        if (status === exports.status) {
            return;
        }

        exports.status = status;

        var reason = status === STATUS_INACTIVE ? closeReason : null;
        exports.trigger(EVENT_STATUS_CHANGE, status, reason);
    }

    /**
     * @private
     * Close all live documents.
     */
    function _closeDocuments() {
        if (_liveDocument) {
            _closeDocument(_liveDocument);
            _liveDocument = undefined;
        }

        Object.keys(_relatedDocuments).forEach(function (url) {
            _closeDocument(_relatedDocuments[url]);
            delete _relatedDocuments[url];
        });

        // Clear all documents from request filtering
        if (_server) {
            _server.clear();
        }
    }

    /**
     * @private
     * Returns the URL that we would serve the given path at.
     * @param {string} path
     * @return {string}
     */
    function _resolveUrl(path) {
        return _server && _server.pathToUrl(path);
    }

    /**
     * @private
     * Create a LiveDocument for a Brackets editor/document to manage communication between the
     * editor and the browser.
     * @param {Document} doc
     * @param {Editor} editor
     * @param {roots} roots
     * @return {?LiveDocument} The live document, or null if this type of file doesn't support live editing.
     */
    function _createLiveDocument(doc, editor, roots) {
        var DocClass = _classForDocument(doc),
            liveDocument;

        if (!DocClass) {
            return null;
        }

        liveDocument = new DocClass(_protocol, _resolveUrl, doc, editor, roots);

        liveDocument.on("errorStatusChanged.livedev", function (event, hasErrors) {
            if (isActive()) {
                _setStatus(hasErrors ? STATUS_SYNC_ERROR : STATUS_ACTIVE);
            }
        });

        return liveDocument;
    }

    /**
     * Documents are considered to be out-of-sync if they are dirty and
     * do not have "update while editing" support
     * @param {Document} doc
     * @return {boolean}
     */
    function _docIsOutOfSync(doc) {
        var liveDoc = _server && _server.get(doc.file.fullPath),
            isLiveEditingEnabled = liveDoc && liveDoc.isLiveEditingEnabled();

        return doc.isDirty && !isLiveEditingEnabled;
    }

    /**
     * Handles a notification from the browser that a stylesheet was loaded into
     * the live HTML document. If the stylesheet maps to a file in the project, then
     * creates a live document for the stylesheet and adds it to _relatedDocuments.
     * @param {$.Event} event
     * @param {string} url The URL of the stylesheet that was added.
     * @param {array} roots The URLs of the roots of the stylesheet (the css files loaded through <link>)
     */
    function _styleSheetAdded(event, url, roots) {
        var path = _server && _server.urlToPath(url),
            alreadyAdded = !!_relatedDocuments[url];

        // path may be null if loading an external stylesheet.
        // Also, the stylesheet may already exist and be reported as added twice
        // due to Chrome reporting added/removed events after incremental changes
        // are pushed to the browser
        if (!path || alreadyAdded) {
            return;
        }

        var docPromise = DocumentManager.getDocumentForPath(path);

        docPromise.done(function (doc) {
            if ((_classForDocument(doc) === LiveCSSDocument) &&
                    (!_liveDocument || (doc !== _liveDocument.doc))) {
                var liveDoc = _createLiveDocument(doc, doc._masterEditor, roots);
                if (liveDoc) {
                    _server.add(liveDoc);
                    _relatedDocuments[doc.url] = liveDoc;
                    liveDoc.on("updateDoc", function (event, url) {
                        var path = _server.urlToPath(url),
                            doc = getLiveDocForPath(path);
                        doc._updateBrowser();
                    });
                }
            }
        });
    }

    /**
     * @private
     * Close the connection and the associated window
     * @param {boolean} doCloseWindow Use true to close the window/tab in the browser
     * @param {?string} reason Optional string key suffix to display to user (see LIVE_DEV_* keys)
     */
    function _close(doCloseWindow, reason) {
        if (exports.status !== STATUS_INACTIVE) {
            // Close live documents
            _closeDocuments();
            // Close all active connections
            _protocol.closeAllConnections();

            if (_server) {
                // Stop listening for requests when disconnected
                _server.stop();

                // Dispose server
                _server = null;
            }
        }
    //TODO: implement closeWindow together with launchers.
//        if (doCloseWindow) {
//
//        }
        _setStatus(STATUS_INACTIVE, reason || "explicit_close");
    }

    /**
     * Closes all active connections.
     * Returns a resolved promise for API compatibility.
     * @return {$.Promise} A resolved promise
     */
    function close() {
        _close(true);
        return new $.Deferred().resolve().promise();
    }

    /**
     * @private
     * Displays an error when the server for live development files can't be started.
     */
    function _showLiveDevServerNotReadyError() {
        Dialogs.showModalDialog(
            DefaultDialogs.DIALOG_ID_ERROR,
            Strings.LIVE_DEVELOPMENT_ERROR_TITLE,
            Strings.LIVE_DEV_SERVER_NOT_READY_MESSAGE
        );
    }

    /**
     * @private
     * Creates the main live document for a given HTML document and notifies the server it exists.
     * TODO: we should really maintain the list of live documents, not the server.
     * @param {Document} doc
     */
    function _createLiveDocumentForFrame(doc) {
        // create live document
        doc._ensureMasterEditor();
        _liveDocument = _createLiveDocument(doc, doc._masterEditor);
        if(!_liveDocument){
            return;
        }
        _server.add(_liveDocument);
        _server.addVirtualContentAtPath(
            `${_liveDocument.doc.file.parentPath}${LiveDevProtocol.LIVE_DEV_REMOTE_SCRIPTS_FILE_NAME}`,
            _protocol.getRemoteScriptContents());
        _server.addVirtualContentAtPath(
            `${_liveDocument.doc.file.parentPath}${LiveDevProtocol.LIVE_DEV_REMOTE_WORKER_SCRIPTS_FILE_NAME}`,
            PageLoaderWorkerScript);
    }


     /**
     * Launches the given URL in the default browser.
     * @param {string} url
      * @param {string} fullPath
     * TODO: launchers for multiple browsers
     */
    function _launch(url, fullPath) {
        exports.trigger(EVENT_OPEN_PREVIEW_URL, {
            url,
            fullPath
        });
    }

    /**
     * @private
     * Launches the given document in the browser, given that a live document has already
     * been created for it.
     * @param {Document} doc
     */
    function _open(doc) {
        if (doc && _liveDocument && doc === _liveDocument.doc) {
            if (_server) {
                // Launch the URL in the browser. If it's the first one to connect back to us,
                // our status will transition to ACTIVE once it does so.
                if (exports.status < STATUS_ACTIVE) {
                    _launch(_resolveUrl(doc.file.fullPath), doc.file.fullPath);
                }
                if (exports.status === STATUS_RESTARTING) {
                    // change page in browser
                    _protocol.navigate(_resolveUrl(doc.file.fullPath));
                }

                _protocol
                    // TODO: timeout if we don't get a connection within a certain time
                    .on("ConnectionConnect.livedev", function (event, msg) {
                        if (_protocol.getConnectionIds().length >= 1) {
                            // check the page that connection comes from matches the current live document session
                            const url = new URL(msg.url);
                            const urlString = `${url.origin}${url.pathname}`;
                            if (_liveDocument &&  urlString === _resolveUrl(_liveDocument.doc.file.fullPath)) {
                                _setStatus(STATUS_ACTIVE);
                            }
                        }
                        Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "connect",
                            `${_protocol.getConnectionIds().length}-preview`);
                    })
                    .on("ConnectionClose.livedev", function (event, {clientId}) {
                        exports.trigger(EVENT_CONNECTION_CLOSE, {clientId});
                        window.logger.livePreview.log(
                            "Live Preview: Phoenix received ConnectionClose, live preview left: ",
                            _protocol.getConnectionIds().length, clientId);
                    })
                    // extract stylesheets and create related LiveCSSDocument instances
                    .on("DocumentRelated.livedev", function (event, msg) {
                        var relatedDocs = msg.related;
                        var docs = Object.keys(relatedDocs.stylesheets);
                        docs.forEach(function (url) {
                            _styleSheetAdded(null, url, relatedDocs.stylesheets[url]);
                        });
                    })
                    // create new LiveCSSDocument if a new stylesheet is added
                    .on("StylesheetAdded.livedev", function (event, msg) {
                        _styleSheetAdded(null, msg.href, msg.roots);
                    })
                    // remove LiveCSSDocument instance when stylesheet is removed
                    .on("StylesheetRemoved.livedev", function (event, msg) {
                        _handleRelatedDocumentDeleted(msg.href);
                    })
                    .on(LiveDevProtocol.EVENT_LIVE_PREVIEW_CLICKED + ".livedev", function (event, msg) {
                        exports.trigger(LiveDevProtocol.EVENT_LIVE_PREVIEW_CLICKED, msg);
                    })
                    .on(LiveDevProtocol.EVENT_LIVE_PREVIEW_RELOAD + ".livedev", function (event, clients) {
                        exports.trigger(LiveDevProtocol.EVENT_LIVE_PREVIEW_RELOAD, clients);
                    });
            } else {
                console.error("LiveDevelopment._open(): No server active");
            }
        } else {
            // a connection is in process but there is no current
            // document, Eg. A project that has only markdown or images that doesnt have a live html/css document
        }
    }

    /**
     * @private
     * Create the server in preparation for opening a live preview.
     * @param {Document} doc The document we want the server for. Different servers handle
     * different types of project (a static server for when no app server is configured,
     * vs. a user server when there is an app server set in File > Project Settings).
     */
    function _prepareServer(doc) {
        const deferred = new $.Deferred();
        let initialServePath = doc && doc.file.fullPath;
        if(!initialServePath){
            initialServePath = `${ProjectManager.getProjectRoot().fullPath}index.html`;
        }

        _server = LiveDevServerManager.getServer(initialServePath);

        // Startup the server
        const readyPromise = _server.readyToServe();
        if (!readyPromise) {
            _showLiveDevServerNotReadyError();
            deferred.reject();
        } else {
            readyPromise.then(deferred.resolve, function () {
                _showLiveDevServerNotReadyError();
                deferred.reject();
            });
        }

        return deferred.promise();
    }

    /**
     * @private
     * MainViewManager.currentFileChange event handler.
     * When switching documents, close the current preview and open a new one.
     */
    function _onFileChange() {
        let doc = DocumentManager.getCurrentDocument();
        if (!isActive() || !doc || livePreviewUrlPinned) {
            return;
        }

        // close the current session and begin a new session
        let docUrl = _resolveUrl(doc.file.fullPath),
            isViewable = _server && _server.canServe(doc.file.fullPath);

        if (_liveDocument && _liveDocument.doc.url !== docUrl && isViewable) {
            // clear live doc and related docs
            _closeDocuments();
            // create new live doc
            _createLiveDocumentForFrame(doc);
            _setStatus(STATUS_RESTARTING);
            _open(doc);

        }
    }


    /**
     * Open a live preview on the current docuemnt.
     */
    function open() {
        let doc = DocumentManager.getCurrentDocument();
        if(livePreviewUrlPinned){
            doc = DocumentManager.getDocumentForPath(currentPreviewFilePath);
        }

        // wait for server (StaticServer, Base URL or file:)
        _prepareServer(doc)
            .done(function () {
                if(!_server){
                    return;
                }
                _setStatus(STATUS_CONNECTING);
                doc && _createLiveDocumentForFrame(doc);
                if(_server.isActive()){
                    doc && _open(doc);
                    return;
                }

                // start server and listen for requests
                _server.start()
                    .then(()=>{
                        // open browser to the url
                        doc && _open(doc);
                    });
            })
            .fail(function () {
                console.log("Live preview: no document to preview.");
            });
    }

    /**
     * For files that don't support as-you-type live editing, but are loaded by live HTML documents
     * (e.g. JS files), we want to reload the full document when they're saved.
     * @param {$.Event} event
     * @param {Document} doc
     */
    function _onDocumentSaved(event, doc) {
        if (!isActive() || !_server) {
            return;
        }

        var absolutePath            = doc.file.fullPath,
            liveDocument            = absolutePath && _server.get(absolutePath),
            liveEditingEnabled      = liveDocument && liveDocument.isLiveEditingEnabled  && liveDocument.isLiveEditingEnabled();

        // Skip reload if the saved document has live editing enabled
        if (liveEditingEnabled) {
            return;
        }

        // reload the page if the given document is a JS file related
        // to the current live document.
        if (_liveDocument.isRelated(absolutePath)) {
            if (doc.getLanguage().getId() === "javascript") {
                _setStatus(STATUS_RELOADING);
                _protocol.reload();
            }
        }
    }

    /**
     * For files that don't support as-you-type live editing, but are loaded by live HTML documents
     * (e.g. JS files), we want to show a dirty indicator on the live development icon when they
     * have unsaved changes, so the user knows s/he needs to save in order to have the page reload.
     * @param {$.Event} event
     * @param {Document} doc
     */
    function _onDirtyFlagChange(event, doc) {
        if (!isActive() || !_server) {
            return;
        }

        var absolutePath = doc.file.fullPath;

        if (_liveDocument.isRelated(absolutePath)) {
            // Set status to out of sync if dirty. Otherwise, set it to active status.
            _setStatus(_docIsOutOfSync(doc) ? STATUS_OUT_OF_SYNC : STATUS_ACTIVE);
        }
    }

    /**
     * Sets the current transport mechanism to be used by the live development protocol
     * (e.g. socket server, iframe postMessage, etc.)
     * The low-level transport. Must provide the following methods:
     *
     * - start(): Initiates transport (eg. creates Web Socket server).
     * - send(idOrArray, string): Dispatches the given protocol message (provided as a JSON string) to the given client ID
     *   or array of client IDs. (See the "connect" message for an explanation of client IDs.)
     * - close(id): Closes the connection to the given client ID.
     * - getRemoteScript(): Returns a script that should be injected into the page's HTML in order to handle the remote side
     *   of the transport. Should include the "<script>" tags. Should return null if no injection is necessary.
     *
     * It must also dispatch the following jQuery events:
     *
     * - "connect": When a target browser connects back to the transport. Must provide two parameters:
     *   - clientID - a unique number representing this connection
     *   - url - the URL of the page in the target browser that's connecting to us
     * - "message": When a message is received by the transport. Must provide two parameters:
     *   - clientID - the ID of the client sending the message
     *   - message - the text of the message as a JSON string
     * - "close": When the remote browser closes the connection. Must provide one parameter:
     *   - clientID - the ID of the client closing the connection
     *
     * @param {{launch: function(string), send: function(number|Array.<number>, string), close: function(number), getRemoteScript: function(): ?string}} transport
     */
    function setTransport(transport) {
        _protocol.setTransport(transport);
    }

    /**
     * Initialize the LiveDevelopment module.
     */
    function init(config) {
        exports.config = config;
        MainViewManager
            .on("currentFileChange", _onFileChange);
        DocumentManager
            .on("documentSaved", _onDocumentSaved)
            .on("dirtyFlagChange", _onDirtyFlagChange);

        // Default transport for live connection messages - can be changed
        setTransport(LivePreviewTransport);

        // Initialize exports.status
        _setStatus(STATUS_INACTIVE);
    }

    function getLiveDocForEditor(editor) {
        if (!editor) {
            return null;
        }
        return getLiveDocForPath(editor.document.file.fullPath);
    }

    /**
     *  Enable highlighting
     */
    function showHighlight() {
        var doc = getLiveDocForEditor(EditorManager.getActiveEditor());

        if (doc && doc.updateHighlight) {
            doc.updateHighlight();
        }
    }

    /**
     * Hide any active highlighting
     */
    function hideHighlight() {
        if (_protocol) {
            _protocol.evaluate("_LD.hideHighlight()");
        }
    }

    /**
     * Redraw highlights
     */
    function redrawHighlight() {
        if (_protocol) {
            _protocol.evaluate("_LD.redrawHighlights()");
        }
    }

    /**
     * Originally unload and reload agents. It doesn't apply for this new implementation.
     * @return {jQuery.Promise} Already resolved promise.
     */
    function reconnect() {
        return $.Deferred().resolve();
    }

    /**
     * Reload current page in all connected browsers.
     */
    function reload() {
        if (_protocol) {
            _protocol.reload();
        }
    }

    /**
     * @param urlPinned {boolean}
     */
    function setLivePreviewPinned(urlPinned, currentPinnedFilePath) {
        livePreviewUrlPinned = urlPinned;
        currentPreviewFilePath = currentPinnedFilePath;
    }

    // for unit testing only
    function getCurrentLiveDoc() {
        return _liveDocument;
    }

    /**
     * Returns an array of the client IDs that are being managed by this live document.
     * @return {Array.<number>}
     */
    function getConnectionIds() {
        return _protocol.getConnectionIds();
    }

    function getLivePreviewDetails() {
        return {
            liveDocument: _liveDocument,
            URL: _liveDocument ? _resolveUrl(_liveDocument.doc.file.fullPath) : null
        };
    }

    EventDispatcher.makeEventDispatcher(exports);

    // For unit testing
    exports._server                   = _server;

    // Events
    exports.EVENT_OPEN_PREVIEW_URL = EVENT_OPEN_PREVIEW_URL;
    exports.EVENT_CONNECTION_CLOSE = EVENT_CONNECTION_CLOSE;
    exports.EVENT_STATUS_CHANGE = EVENT_STATUS_CHANGE;
    exports.EVENT_LIVE_PREVIEW_CLICKED = LiveDevProtocol.EVENT_LIVE_PREVIEW_CLICKED;
    exports.EVENT_LIVE_PREVIEW_RELOAD = LiveDevProtocol.EVENT_LIVE_PREVIEW_RELOAD;

    // Export public functions
    exports.open                = open;
    exports.close               = close;
    exports.reconnect           = reconnect;
    exports.reload              = reload;
    exports.getLiveDocForPath   = getLiveDocForPath;
    exports.showHighlight       = showHighlight;
    exports.hideHighlight       = hideHighlight;
    exports.redrawHighlight     = redrawHighlight;
    exports.init                = init;
    exports.isActive            = isActive;
    exports.setLivePreviewPinned= setLivePreviewPinned;
    exports.getCurrentLiveDoc   = getCurrentLiveDoc;
    exports.getLivePreviewDetails = getLivePreviewDetails;
    exports.getConnectionIds = getConnectionIds;
    exports.setTransport        = setTransport;
});
