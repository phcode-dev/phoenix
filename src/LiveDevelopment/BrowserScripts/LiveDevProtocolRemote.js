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

    function _getAllInheritedSelectorsInOrder(element) {
        let selectorsFound= new Map();
        const selectorsList = [];
        while (element) {
            if(element.id){
                selectorsList.push(`#${element.id}`);
            }
            if (element.classList) {
                element.classList.forEach(cls => {
                    if(!selectorsFound.get(cls)){
                        selectorsFound.set(cls, true);
                        selectorsList.push(`.${cls}`);
                    }
                });
            }
            element = element.parentElement; // Move up to the next parent element
        }
        return selectorsList;
    }


    /**
    * Gets the word at the clicked position along with additional information
    * @param {Element} element - The element that was clicked
    * @param {MouseEvent} event - The click event
    * @return {Object|null} - Object containing the word and additional info, or null if not found
    */
    function getClickedWord(element, event) {

        // Try to find the clicked position within the element
        const range = document.caretRangeFromPoint(event.clientX, event.clientY);
        if (!range) {
            return null;
        }

        const textNode = range.startContainer;
        const offset = range.startOffset;

        // Check if we have a text node
        if (textNode.nodeType !== Node.TEXT_NODE) {

            // If the element itself contains text, try to extract a word from it
            if (element.textContent && element.textContent.trim()) {
                const text = element.textContent.trim();

                // Simple word extraction - get the first word
                const match = text.match(/\b(\w+)\b/);
                if (match) {
                    const word = match[1];

                    // Since we're just getting the first word, it's the first occurrence
                    return {
                        word: word,
                        occurrenceIndex: 0,
                        context: text.substring(0, Math.min(40, text.length))
                    };
                }
            }

            return null;
        }

        const nodeText = textNode.textContent;

        // Function to extract a word and its occurrence index
        function extractWordAndOccurrence(text, wordStart, wordEnd) {
            const word = text.substring(wordStart, wordEnd);

            // Calculate which occurrence of this word it is
            const textBeforeWord = text.substring(0, wordStart);
            const regex = new RegExp("\\b" + word + "\\b", "g");
            let occurrenceIndex = 0;
            let match;

            while ((match = regex.exec(textBeforeWord)) !== null) {
                occurrenceIndex++;
            }


            // Get context around the word (up to 20 chars before and after)
            const contextStart = Math.max(0, wordStart - 20);
            const contextEnd = Math.min(text.length, wordEnd + 20);
            const context = text.substring(contextStart, contextEnd);

            return {
                word: word,
                occurrenceIndex: occurrenceIndex,
                context: context
            };
        }

        // If we're at a space or the text is empty, try to find a nearby word
        if (nodeText.length === 0 || (offset < nodeText.length && /\s/.test(nodeText[offset]))) {

            // Look for the nearest word
            let leftPos = offset - 1;
            let rightPos = offset;

            // Check to the left
            while (leftPos >= 0 && /\s/.test(nodeText[leftPos])) {
                leftPos--;
            }

            // Check to the right
            while (rightPos < nodeText.length && /\s/.test(nodeText[rightPos])) {
                rightPos++;
            }

            // If we found a non-space character to the left, extract that word
            if (leftPos >= 0) {
                let wordStart = leftPos;
                while (wordStart > 0 && /\w/.test(nodeText[wordStart - 1])) {
                    wordStart--;
                }

                return extractWordAndOccurrence(nodeText, wordStart, leftPos + 1);
            }

            // If we found a non-space character to the right, extract that word
            if (rightPos < nodeText.length) {
                let wordEnd = rightPos;
                while (wordEnd < nodeText.length && /\w/.test(nodeText[wordEnd])) {
                    wordEnd++;
                }

                return extractWordAndOccurrence(nodeText, rightPos, wordEnd);
            }

            return null;
        }

        // Find word boundaries
        let startPos = offset;
        let endPos = offset;

        // Move start position to the beginning of the word
        while (startPos > 0 && /\w/.test(nodeText[startPos - 1])) {
            startPos--;
        }

        // Move end position to the end of the word
        while (endPos < nodeText.length && /\w/.test(nodeText[endPos])) {
            endPos++;
        }


        // Extract the word and its occurrence index
        if (endPos > startPos) {
            return extractWordAndOccurrence(nodeText, startPos, endPos);
        }

        return null;
    }

    /**
    * Sends the message containing tagID which is being clicked
    * to the editor in order to change the cursor position to
    * the HTML tag corresponding to the clicked element.
    */
    function onDocumentClick(event) {

        // Get the user's current selection
        const selection = window.getSelection();

        // Check if there is a selection
        if (selection.toString().length > 0) {
            // if there is any selection like text or others, we don't see it as a live selection event
            // Eg: user may selects ome text in live preview to copy, in which case we should nt treat it
            // as a live select.
            return;
        }
        var element = event.target;

        if (element && element.hasAttribute('data-brackets-id')) {

            // Get the clicked word and its information
            const clickedWordInfo = getClickedWord(element, event);

            // Prepare the message with the clicked word information
            const message = {
                "tagId": element.getAttribute('data-brackets-id'),
                "nodeID": element.id,
                "nodeClassList": element.classList,
                "nodeName": element.nodeName,
                "allSelectors": _getAllInheritedSelectorsInOrder(element),
                "contentEditable": element.contentEditable === 'true',
                "clicked": true
            };

            // Add word information if available
            if (clickedWordInfo) {
                message.clickedWord = clickedWordInfo.word;
                message.wordContext = clickedWordInfo.context;
                message.wordOccurrenceIndex = clickedWordInfo.occurrenceIndex;
            }

            MessageBroker.send(message);
        } else {
        }
    }
    window.document.addEventListener("click", onDocumentClick);

}(this));
