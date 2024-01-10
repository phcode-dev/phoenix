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

/*jslint evil: true */

// This is the script that Brackets live development injects into HTML pages in order to
// establish and maintain the live development socket connection. Note that Brackets may
// also inject other scripts via "evaluate" once this has connected back to Brackets.

(function (global) {


    // This protocol handler assumes that there is also an injected transport script that
    // has the following methods:
    //     setCallbacks(obj) - a method that takes an object with a "message" callback that
    //         will be called with the message string whenever a message is received by the transport.
    //     send(msgStr) - sends the given message string over the transport.
    var transport = global._Brackets_LiveDev_Transport;

    /**
     * Manage messaging between Editor and Browser at the protocol layer.
     * Handle messages that arrives through the current transport and dispatch them
     * to subscribers. Subscribers are handlers that implements remote commands/functions.
     * Property 'method' of messages body is used as the 'key' to identify message types.
     * Provide a 'send' operation that allows remote commands sending messages to the Editor.
     */
    var MessageBroker = {

        /**
         * Collection of handlers (subscribers) per each method.
         * To be pushed by 'on' and consumed by 'trigger' stored this way:
         *      handlers[method] = [handler1, handler2, ...]
         */
        handlers: {},

         /**
          * Dispatch messages to handlers according to msg.method value.
          * @param {Object} msg Message to be dispatched.
          */
        trigger: function (msg) {
            var msgHandlers;
            if (!msg.method) {
                // no message type, ignoring it
                // TODO: should we trigger a generic event?
                console.error("[Brackets LiveDev] Received message without method.");
                return;
            }
            // get handlers for msg.method
            msgHandlers = this.handlers[msg.method];

            if (msgHandlers && msgHandlers.length > 0) {
                // invoke handlers with the received message
                msgHandlers.forEach(function (handler) {
                    try {
                        // TODO: check which context should be used to call handlers here.
                        handler(msg);
                        return;
                    } catch (e) {
                        console.error("[Brackets LiveDev] Error executing a handler for " + msg.method, e.stack);
                        return;
                    }
                });
            } else {
                // no subscribers, ignore it.
                // TODO: any other default handling? (eg. specific respond, trigger as a generic event, etc.);
                console.warn("[Brackets LiveDev] No subscribers for message " + msg.method);
                return;
            }
        },

        /**
         * Send a response of a particular message to the Editor.
         * Original message must provide an 'id' property
         * @param {Object} orig Original message.
         * @param {Object} response Message to be sent as the response.
         */
        respond: function (orig, response) {
            if (!orig.id) {
                console.error("[Brackets LiveDev] Trying to send a response for a message with no ID");
                return;
            }
            response.id = orig.id;
            this.send(response);
        },

        /**
         * Subscribe handlers to specific messages.
         * @param {string} method Message type.
         * @param {function} handler.
         * TODO: add handler name or any identification mechanism to then implement 'off'?
         */
        on: function (method, handler) {
            if (!method || !handler) {
                return;
            }
            if (!this.handlers[method]) {
                //initialize array
                this.handlers[method] = [];
            }
            // add handler to the stack
            this.handlers[method].push(handler);
        },

        /**
         * Send a message to the Editor.
         * @param {string} msgStr Message to be sent.
         */
        send: function (msgStr) {
            transport.send(JSON.stringify(msgStr));
        }
    };

    /**
     * Runtime Domain. Implements remote commands for "Runtime.*"
     */
    var Runtime = {
        /**
         * Evaluate an expresion and return its result.
         */
        evaluate: function (msg) {
            var result = eval(msg.params.expression);
            MessageBroker.respond(msg, {
                result: JSON.stringify(result) // TODO: in original protocol this is an object handle
            });
        }
    };

    // subscribe handler to method Runtime.evaluate
    MessageBroker.on("Runtime.evaluate", Runtime.evaluate);

    /**
     * CSS Domain.
     */
    var CSS = {

        setStylesheetText : function (msg) {

            if (!msg || !msg.params || !msg.params.text || !msg.params.url) {
                return;
            }

            var i,
                node;

            var head = window.document.getElementsByTagName('head')[0];
            // create an style element to replace the one loaded with <link>
            var s = window.document.createElement('style');
            s.type = 'text/css';
            s.appendChild(window.document.createTextNode(msg.params.text));

            for (i = 0; i < window.document.styleSheets.length; i++) {
                node = window.document.styleSheets[i];
                if (node.ownerNode.id === msg.params.url) {
                    head.insertBefore(s, node.ownerNode); // insert the style element here
                    // now can remove the style element previously created (if any)
                    node.ownerNode.parentNode.removeChild(node.ownerNode);
                } else if (node.href === msg.params.url  && !node.disabled) {
                    // if the link element to change
                    head.insertBefore(s, node.ownerNode); // insert the style element here
                    node.disabled = true;
                    i++; // since we have just inserted a stylesheet
                }
            }
            s.id = msg.params.url;
        },

        /**
        * retrieves the content of the stylesheet
        * TODO: it now depends on reloadCSS implementation
        */
        getStylesheetText: function (msg) {
            var i,
                sheet,
                text = "";
            for (i = 0; i < window.document.styleSheets.length; i++) {
                sheet = window.document.styleSheets[i];
                // if it was already 'reloaded'
                if (sheet.ownerNode.id ===  msg.params.url) {
                    text = sheet.ownerNode.textContent;
                } else if (sheet.href === msg.params.url && !sheet.disabled) {
                    var j,
                        rules;

                    // Deal with Firefox's SecurityError when accessing sheets
                    // from other domains, and Chrome returning `undefined`.
                    try {
                        rules = window.document.styleSheets[i].cssRules;
                    } catch (e) {
                        if (e.name !== "SecurityError") {
                            throw e;
                        }
                    }
                    if (!rules) {
                        return;
                    }

                    for (j = 0; j < rules.length; j++) {
                        text += rules[j].cssText + '\n';
                    }
                }
            }

            MessageBroker.respond(msg, {
                text: text
            });
        }
    };

    MessageBroker.on("CSS.setStylesheetText", CSS.setStylesheetText);
    MessageBroker.on("CSS.getStylesheetText", CSS.getStylesheetText);

    /**
     * Page Domain.
     */
    var Page = {
        /**
         * Reload the current page optionally ignoring cache.
         * @param {Object} msg
         */
        reload: function (msg) {
            // just reload the page
            window.location.reload(msg.params.ignoreCache);
        }
    };

    // subscribe handler to method Page.reload
    MessageBroker.on("Page.reload", Page.reload);
    MessageBroker.on("ConnectionClose", Page.close);



    // By the time this executes, there must already be an active transport.
    if (!transport) {
        console.error("[Brackets LiveDev] No transport set");
        return;
    }

    var ProtocolManager = {

        _documentObserver: {},

        _protocolHandler: {},

        enable: function () {
            transport.setCallbacks(this._protocolHandler);
            transport.enable();
        },

        onConnect: function () {
            this._documentObserver.start(window.document, transport);
        },

        onClose: function () {
            var body = window.document.getElementsByTagName("body")[0],
                overlay = window.document.createElement("div"),
                background = window.document.createElement("div"),
                status = window.document.createElement("div");

            overlay.style.width = "100%";
            overlay.style.height = "100%";
            overlay.style.zIndex = 2227;
            overlay.style.position = "fixed";
            overlay.style.top = 0;
            overlay.style.left = 0;

            background.style.backgroundColor = "#fff";
            background.style.opacity = 0.5;
            background.style.width = "100%";
            background.style.height = "100%";
            background.style.position = "fixed";
            background.style.top = 0;
            background.style.left = 0;

            status.textContent = "Live Development Session has Ended";
            status.style.width = "100%";
            status.style.color = "#fff";
            status.style.backgroundColor = "#666";
            status.style.position = "fixed";
            status.style.top = 0;
            status.style.left = 0;
            status.style.padding = "0.2em";
            status.style.verticalAlign = "top";
            status.style.textAlign = "center";
            overlay.appendChild(background);
            overlay.appendChild(status);
            body.appendChild(overlay);

            // change the title as well
            window.document.title = "(Brackets Live Preview: closed) " + window.document.title;
        },

        setDocumentObserver: function (documentOberver) {
            if (!documentOberver) {
                return;
            }
            this._documentObserver = documentOberver;
        },

        setProtocolHandler: function (protocolHandler) {
            if (!protocolHandler) {
                return;
            }
            this._protocolHandler = protocolHandler;
        }
    };

    // exposing ProtocolManager
    global._Brackets_LiveDev_ProtocolManager = ProtocolManager;

    /**
     * The remote handler for the protocol.
     */
    var ProtocolHandler = {
        /**
         * Handles a message from the transport. Parses it as JSON and delegates
         * to MessageBroker who is in charge of routing them to handlers.
         * @param {string} msgStr The protocol message as stringified JSON.
         */
        message: function (msgStr) {
            var msg;
            try {
                msg = JSON.parse(msgStr);
            } catch (e) {
                console.error("[Brackets LiveDev] Malformed message received: ", msgStr);
                return;
            }
            // delegates handling/routing to MessageBroker.
            MessageBroker.trigger(msg);
        },

        close: function (evt) {
            ProtocolManager.onClose();
        },

        connect: function (evt) {
            ProtocolManager.onConnect();
        }
    };

    ProtocolManager.setProtocolHandler(ProtocolHandler);

    window.addEventListener('load', function () {
        ProtocolManager.enable();
    });

    /**
    * Sends the message containing tagID which is being clicked
    * to the editor in order to change the cursor position to
    * the HTML tag corresponding to the clicked element.
    */
    function onDocumentClick(event) {
        var element = event.target;
        if (element && element.hasAttribute('data-brackets-id')) {
            MessageBroker.send({"tagId": element.getAttribute('data-brackets-id'),
                "clicked": true});
        }
    }
    window.document.addEventListener("click", onDocumentClick);

}(this));
