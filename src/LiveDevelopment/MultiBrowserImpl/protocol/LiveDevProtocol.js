/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2014 - 2021 Adobe Systems Incorporated. All rights reserved.
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
 * Provides the protocol that Brackets uses to talk to a browser instance for live development.
 * Protocol methods are converted to a JSON message format, which is then sent over a provided
 * low-level transport and interpreted in the browser. For messages that expect a response, the
 * response is returned through a promise as an object. Scripts that implement remote logic are
 * provided during the instrumentation stage by "getRemoteFunctions()".
 *
 * Events raised by the remote browser are dispatched as jQuery events which type is equal to the 'method'
 * property. The received message object is dispatched as the first parameter and enriched with a
 * 'clientId' property being the client ID of the remote browser.
 *
 * It keeps active connections which are  updated when receiving "connect" and "close" from the
 * underlying transport. Events "Connection.connect"/"Connection.close" are triggered as
 * propagation of transport's "connect"/"close".
 *
 */

define(function (require, exports, module) {


    const EventDispatcher = require("utils/EventDispatcher");

    // Text of the script we'll inject into the browser that handles protocol requests.
    const LiveDevProtocolRemote = require("text!LiveDevelopment/BrowserScripts/LiveDevProtocolRemote.js"),
        DocumentObserver      = require("text!LiveDevelopment/BrowserScripts/DocumentObserver.js"),
        LanguageManager     = require("language/LanguageManager"),
        RemoteFunctions       = require("text!LiveDevelopment/BrowserScripts/RemoteFunctions.js"),
        EditorManager         = require("editor/EditorManager"),
        LiveDevMultiBrowser   = require("LiveDevelopment/LiveDevMultiBrowser"),
        PreferencesManager  = require("preferences/PreferencesManager"),
        HTMLInstrumentation   = require("LiveDevelopment/MultiBrowserImpl/language/HTMLInstrumentation"),
        StringUtils = require("utils/StringUtils"),
        FileViewController    = require("project/FileViewController"),
        MainViewManager     = require("view/MainViewManager"),
        LivePreviewEdit     = require("LiveDevelopment/LivePreviewEdit");

    const LIVE_DEV_REMOTE_SCRIPTS_FILE_NAME = `phoenix_live_preview_scripts_instrumented_${StringUtils.randomString(8)}.js`;
    const LIVE_DEV_REMOTE_WORKER_SCRIPTS_FILE_NAME = `pageLoaderWorker_${StringUtils.randomString(8)}.js`;

    const EVENT_LIVE_PREVIEW_CLICKED = "livePreviewClicked",
        EVENT_LIVE_PREVIEW_RELOAD = "livePreviewReload";

    /**
     * @private
     * Active connections.
     * @type {Object}
     */
    var _connections = {};

    /**
     * @private
     * The low-level transport we're communicating over, set by `setTransport()`.
     * @type {{start: function(), send: function(number|Array.<number>, string), close: function(number), getRemoteScript: function(): ?string}}
     */
    var _transport = null;

    /**
     * @private
     * A unique message serial number, used to match up responses with request messages.
     * @type {number}
     */
    var _nextMsgId = 1;

    /**
     * @private
     * A map of response IDs to deferreds, for messages that are awaiting responses.
     * @type {Object}
     */
    var _responseDeferreds = {};

    /**
     * Returns an array of the client IDs that are being managed by this live document.
     * @return {Array.<number>}
     */
    function getConnectionIds() {
        return Object.keys(_connections);
    }

    /**
     * When user clicks on text boxes or other focusable keyboard elements in live preview, we should not
     * set focus to editor
     * @private
     */
    function _focusEditorIfNeeded(editor, tagName, contentEditable) {
        const focusShouldBeInLivePreview = ['INPUT', 'TEXTAREA'].includes(tagName) || contentEditable;
        if(focusShouldBeInLivePreview){
            return;
        }
        editor.focus();
    }

    const cssLangIDS = ["css", "scss", "sass", "less"];
    const lessLangIDS = ["scss", "sass", "less"];
    function _isLessOrSCSS(editor) {
        if(!editor){
            return false;
        }
        const language = LanguageManager.getLanguageForPath(editor.document.file.fullPath);
        return language && lessLangIDS.includes(language.getId());
    }

    function _searchAndCursorIfCSS(editor, allSelectors, nodeName) {
        const codeMirror =  editor._codeMirror;
        const language = LanguageManager.getLanguageForPath(editor.document.file.fullPath);
        if(!language || !cssLangIDS.includes(language.getId())){
            return;
        }

        // this is a css file
        if(allSelectors && allSelectors.length){
            // check if we can find a class selector
            for(let selector of allSelectors){
                const cursor = codeMirror.getSearchCursor(selector);
                const found = cursor.findNext();
                if (found) {
                    editor.setCursorPos(cursor.from().line, cursor.from().ch, true);
                    return;
                }
            }
        }
        // check if we can do tag matching, html tag selectors are not case-sensitive
        const htmlTagSearch = new RegExp(nodeName, "i");
        const cursor = codeMirror.getSearchCursor(htmlTagSearch);
        const found = cursor.findNext();
        if (found) {
            editor.setCursorPos(cursor.from().line, cursor.from().ch, true);
        }
    }

    function _tagSelectedInLivePreview(tagId, nodeName, contentEditable, allSelectors) {
        const highlightPref = PreferencesManager.getViewState("livedevHighlight");
        if(!highlightPref){
            // live preview highlight and reverse highlight feature is disabled
            return;
        }
        const liveDoc = LiveDevMultiBrowser.getCurrentLiveDoc(),
            activeEditor = EditorManager.getActiveEditor(), // this can be an inline editor
            activeFullEditor = EditorManager.getCurrentFullEditor();
        const liveDocPath = liveDoc ? liveDoc.doc.file.fullPath : null,
            activeEditorPath = activeEditor ? activeEditor.document.file.fullPath : null,
            activeFullEditorPath = activeFullEditor ? activeFullEditor.document.file.fullPath : null;
        if(!liveDocPath){
            activeEditor && activeEditor.focus(); // restore focus from live preview
            return;
        }
        const allOpenFileCount = MainViewManager.getWorkingSetSize(MainViewManager.ALL_PANES);
        function selectInHTMLEditor(fullHtmlEditor) {
            const position = HTMLInstrumentation.getPositionFromTagId(fullHtmlEditor, parseInt(tagId, 10)).from;
            if(position && fullHtmlEditor) {
                const masterEditor = fullHtmlEditor.document._masterEditor || fullHtmlEditor;
                masterEditor.setCursorPos(position.line, position.ch, true);
                _focusEditorIfNeeded(masterEditor, nodeName, contentEditable);
            }
        }
        if(liveDocPath === activeFullEditorPath) {
            // if the active pane is the html being live previewed, select that.
            selectInHTMLEditor(activeFullEditor);
        } else if(liveDoc.isRelated(activeEditorPath) || _isLessOrSCSS(activeEditor)) {
            // the active editor takes the priority in the workflow. If a css related file is active,
            // then we dont need to open the html live doc. For less files, we dont check if its related as
            // its not directly linked usually and needs a compile step. so we just do a fuzzy search.
            _focusEditorIfNeeded(activeEditor, nodeName, contentEditable);
            _searchAndCursorIfCSS(activeEditor, allSelectors, nodeName);
            // in this case, see if we need to do any css reverse highlight magic here
        } else if(!allOpenFileCount){
            // no open editor in any panes, then open the html file directly.
            FileViewController.openAndSelectDocument(liveDocPath,
                FileViewController.WORKING_SET_VIEW, MainViewManager.ACTIVE_PANE)
                .done(()=>{
                    selectInHTMLEditor(EditorManager.getActiveEditor());
                });
        }
    }

    /**
     * @private
     * Handles a message received from the remote protocol handler via the transport.
     * If the message has an `id` field, it's assumed to be a response to a previous
     * request, and will be passed along to the original promise returned by `_send()`.
     * Otherwise, it's treated as an event and dispatched.
     * TODO: we should probably have a way of returning the results from all clients, not just the first?
     *
     * @param {number} clientId ID of the client that sent the message
     * @param {string} msg The message that was sent, in JSON string format
     */
    function _receive(clientId, msgStr) {
        var msg = JSON.parse(msgStr),
            event = msg.method || "event",
            deferred;
        if (msg.livePreviewEditEnabled) {
            LivePreviewEdit.handleLivePreviewEditOperation(msg);
        }

        if (msg.id) {
            deferred = _responseDeferreds[msg.id];
            if (deferred) {
                delete _responseDeferreds[msg.id];
                if (msg.error) {
                    deferred.reject(msg);
                } else {
                    deferred.resolve(msg);
                }
            }
        } else if (msg.clicked && msg.tagId) {
            _tagSelectedInLivePreview(msg.tagId, msg.nodeName, msg.contentEditable, msg.allSelectors);
            exports.trigger(EVENT_LIVE_PREVIEW_CLICKED, msg);
        } else {
            // enrich received message with clientId
            msg.clientId = clientId;
            exports.trigger(event, msg);
        }
    }

    /**
     * @private
     * Dispatches a message to the remote protocol handler via the transport.
     *
     * @param {Object} msg The message to send.
     * @param {number|Array.<number>} idOrArray ID or IDs of the client(s) that should
     *     receive the message.
     * @return {$.Promise} A promise that's fulfilled when the response to the message is received.
     */
    function _send(msg, clients) {
        var id = _nextMsgId++,
            result = new $.Deferred();

        // broadcast if there are no specific clients
        clients = clients || getConnectionIds();
        msg.id = id;
        _responseDeferreds[id] = result;
        _transport.send(clients, JSON.stringify(msg));
        return result.promise();
    }

     /**
     * @private
     * Handles when a connection is made to the live development protocol handler.
     * Injects the RemoteFunctions script in order to provide highlighting and live DOM editing functionality.
     * Records the connection's client ID and triggers the "Coonnection.connect" event.
     * @param {number} clientId
     * @param {string} url
     */
    function _connect(clientId, url) {
        // add new connections
        // TODO: check URL
        _connections[clientId] = true;

        exports.trigger("ConnectionConnect", {
            clientId: clientId,
            url: url
        });
    }

    /**
     * @private
     * Handles when a connection is closed.
     * @param {number} clientId
     */
    function _close(clientId) {
        if(!_connections[clientId]){
            return;
        }
        delete _connections[clientId];
        exports.trigger("ConnectionClose", {
            clientId: clientId
        });
    }


    /**
     * Sets the transport that should be used by the protocol. See `LiveDevelopment.setTransport()`
     * for more detail on the transport.
     * @param {{start: function(string), send: function(number|Array.<number>, string), close: function(number), getRemoteScript: function(): ?string}} transport
     */
    function setTransport(transport) {
        if (_transport) {
            _transport.off(".livedev");
        }
        _transport = transport;

        _transport
            .on("connect.livedev", function (event, msg) {
                _connect(msg[0], msg[1]);
            })
            .on("message.livedev", function (event, msg) {
                _receive(msg[0], msg[1]);
            })
            .on("close.livedev", function (event, msg) {
                _close(msg[0]);
            });
        _transport.start();
    }


    /**
     * Returns a script that should be injected into the HTML that's launched in the
     * browser in order to implement remote commands that handle protocol requests.
     * Includes the <script> tags.
     * @return {string}
     */
    function _getRemoteFunctionsScript() {
        let script = "";
        // Inject DocumentObserver into the browser (tracks related documents)
        script += DocumentObserver;
        // Inject remote functions into the browser.
        script += "\nwindow._LD=(" + RemoteFunctions + "(" + JSON.stringify(LiveDevMultiBrowser.config) + "))";
        return "\n" + script + "\n";
    }

    /**
     * Returns a script that should be injected into the HTML that's launched in the
     * browser in order to handle protocol requests. Includes the <script> tags.
     * This script will also include the script required by the transport, if any.
     * @return {string}
     */
    function getRemoteScriptContents() {
        const transportScript = _transport.getRemoteScript() || "";
        const remoteFunctionsScript = _getRemoteFunctionsScript() || "";
        return transportScript +
            "\n" + LiveDevProtocolRemote + "\n" +
            remoteFunctionsScript;
    }

    /**
     * Returns a script that should be injected into the HTML that's launched in the
     * browser in order to handle protocol requests. Includes the <script> tags.
     * This script will also include the script required by the transport, if any.
     * @return {string}
     */
    function getRemoteScript() {
        // give a wrong random file name that wont have a possibility of an actual file name
        return `\n\t\t<script src="${LIVE_DEV_REMOTE_SCRIPTS_FILE_NAME}"></script>`;
    }

    /**
     * Protocol method. Evaluates the given script in the browser (in global context), and returns a promise
     * that will be fulfilled with the result of the script, if any.
     * @param {number|Array.<number>} clients A client ID or array of client IDs that should evaluate
     *      the script.
     * @param {string} script The script to evaluate.
     * @return {$.Promise} A promise that's resolved with the return value from the first client that responds
     *      to the evaluation.
     */
    function evaluate(script, clients) {
        return _send(
            {
                method: "Runtime.evaluate",
                params: {
                    expression: script
                }
            },
            clients
        );
    }

    /**
     * Protocol method. Reloads a CSS styleseet in the browser (by replacing its text) given its url.
     * @param {string} url Absolute URL of the stylesheet
     * @param {string} text The new text of the stylesheet
     * @param {number|Array.<number>} clients A client ID or array of client IDs that should evaluate
     *      the script.
     * @return {$.Promise} A promise that's resolved with the return value from the first client that responds
     *      to the evaluation.
     */
    function setStylesheetText(url, text, clients) {
        return _send(
            {
                method: "CSS.setStylesheetText",
                params: {
                    url: url,
                    text: text
                }
            }
        );
    }

     /**
     * Protocol method. Rretrieves the content of a given stylesheet (for unit testing)
     * @param {number|Array.<number>} clients A client ID or array of client IDs that should navigate to the given URL.
     * @param {string} url Absolute URL that identifies the stylesheet.
     * @return {$.Promise} A promise that's resolved with the return value from the first client that responds
     *      to the method.
     */
    function getStylesheetText(url, clients) {
        return _send(
            {
                method: "CSS.getStylesheetText",
                params: {
                    url: url
                }
            },
            clients
        );
    }

    /**
     * Protocol method. Reloads the page that is currently loaded into the browser, optionally ignoring cache.
     * @param {number|Array.<number>} clients A client ID or array of client IDs that should reload the page.
     * @param {boolean} ignoreCache If true, browser cache is ignored.
     * @return {$.Promise} A promise that's resolved with the return value from the first client that responds
     *      to the method.
     */
    function reload(ignoreCache, clients) {
        exports.trigger(EVENT_LIVE_PREVIEW_RELOAD, clients);
        return _send(
            {
                method: "Page.reload",
                params: {
                    ignoreCache: true
                }
            },
            clients
        );
    }

    /**
     * Closes the connection to the given client. Proxies to the transport.
     * @param {number} clientId
     */
    function close(clientId) {
        _transport.close(clientId);
    }

    function closeAllConnections() {
        getConnectionIds().forEach(function (clientId) {
            close(clientId);
        });
        _connections = {};
    }

    EventDispatcher.makeEventDispatcher(exports);

    // public API
    exports.setTransport = setTransport;
    exports.getRemoteScript = getRemoteScript;
    exports.getRemoteScriptContents = getRemoteScriptContents;
    exports.evaluate = evaluate;
    exports.setStylesheetText = setStylesheetText;
    exports.getStylesheetText = getStylesheetText;
    exports.reload = reload;
    exports.close = close;
    exports.getConnectionIds = getConnectionIds;
    exports.closeAllConnections = closeAllConnections;
    exports.LIVE_DEV_REMOTE_SCRIPTS_FILE_NAME = LIVE_DEV_REMOTE_SCRIPTS_FILE_NAME;
    exports.LIVE_DEV_REMOTE_WORKER_SCRIPTS_FILE_NAME = LIVE_DEV_REMOTE_WORKER_SCRIPTS_FILE_NAME;
    exports.EVENT_LIVE_PREVIEW_CLICKED = EVENT_LIVE_PREVIEW_CLICKED;
    exports.EVENT_LIVE_PREVIEW_RELOAD = EVENT_LIVE_PREVIEW_RELOAD;
});
