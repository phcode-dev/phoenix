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

/*global setInterval, clearInterval */

(function (global) {


    var ProtocolManager = global._Brackets_LiveDev_ProtocolManager;

    var _document = null;
    var _transport;

    function inIframe () {
        try {
            return window.self !== window.top;
        } catch (e) {
            return true;
        }
    }

    if(inIframe()) {
        // inside iframes, we disable ctrl-s browser save page workflow as it may be inside the phoenix window
        // It will confuse the use seeing the browser save dialog inside phoenix.
        document.savePageCtrlSDisabledByPhoenix = true;
        document.addEventListener("keydown", function(e) {
            if (e.key === 's' && (navigator.platform.match("Mac") ? e.metaKey : e.ctrlKey)) {
                e.preventDefault();
            }
        }, false);
    }

    window.addEventListener('scroll', function () {
        // save scroll position
        sessionStorage.setItem("markdown-scroll-" + location.href, JSON.stringify({
            scrollX: window.scrollX,
            scrollY: window.scrollY
        }));
    });
    function scrollToLastPosition() {
        let saved = JSON.parse(sessionStorage.getItem("markdown-scroll-" + location.href));
        if(saved){
            window.scrollTo({
                left: saved.scrollX,
                top: saved.scrollY,
                behavior: "instant"
            });
        }
    }
    window.addEventListener("load", scrollToLastPosition);

    /**
     * Retrieves related documents (external CSS and JS files)
     *
     * @return {{scripts: object, stylesheets: object}} Related scripts and stylesheets
     */
    function related() {

        var rel = {
            scripts: {},
            stylesheets: {}
        };
        var i;
        // iterate on document scripts (HTMLCollection doesn't provide forEach iterator).
        for (i = 0; i < _document.scripts.length; i++) {
            // add only external scripts
            if (_document.scripts[i].src) {
                rel.scripts[_document.scripts[i].src] = true;
            }
        }

        var s, j;
        //traverse @import rules
        var traverseRules = function _traverseRules(sheet, base) {
            var i,
                href = sheet.href,
                cssRules;

            // Deal with Firefox's SecurityError when accessing sheets
            // from other domains. Chrome will safely return `undefined`.
            try {
                cssRules = sheet.cssRules;
            } catch (e) {
                if (e.name !== "SecurityError") {
                    throw e;
                }
            }

            if (href && cssRules) {
                if (rel.stylesheets[href] === undefined) {
                    rel.stylesheets[href] = [];
                }
                rel.stylesheets[href].push(base);

                for (i = 0; i < cssRules.length; i++) {
                    if (cssRules[i].href) {
                        traverseRules(cssRules[i].styleSheet, base);
                    }
                }
            }
        };
        //iterate on document.stylesheets (StyleSheetList doesn't provide forEach iterator).
        for (j = 0; j < window.document.styleSheets.length; j++) {
            s = window.document.styleSheets[j];
            traverseRules(s, s.href);
        }
        return rel;
    }

    /**
     * Common functions.
     */
    var Utils = {

        isExternalStylesheet: function (node) {
            return (node.nodeName.toUpperCase() === "LINK" && node.rel === "stylesheet" && node.href);
        },
        isExternalScript: function (node) {
            return (node.nodeName.toUpperCase() === "SCRIPT" && node.src);
        }
    };

    /**
     * CSS related commands and notifications
     */
    var CSS = {

        /**
        * Maintains a map of stylesheets loaded thorugh @import rules and their parents.
        * Populated by extractImports, consumed by notifyImportsAdded / notifyImportsRemoved.
        * @type {
        */
        stylesheets: {},
        loadTimers: {},

        /**
         * Check the stylesheet that was just added be really loaded
         * to be able to extract potential import-ed stylesheets.
         * It invokes notifyStylesheetAdded once the sheet is loaded.
         * @param  {string} href Absolute URL of the stylesheet.
         */
        checkForStylesheetLoaded : function (href) {
            const self = this;
            if(!href){
                return;
            }
            if(self.loadTimers[href]){
                clearInterval(self.loadTimers[href]); // we dont want two timers on the same thing
                delete self.loadTimers[href];
            }

            // Inspect CSSRules for @imports:
            // styleSheet obejct is required to scan CSSImportRules but
            // browsers differ on the implementation of MutationObserver interface.
            // Webkit triggers notifications before stylesheets are loaded,
            // Firefox does it after loading.
            // There are also differences on when 'load' event is triggered for
            // the 'link' nodes. Webkit triggers it before stylesheet is loaded.
            // Some references to check:
            //      http://www.phpied.com/when-is-a-stylesheet-really-loaded/
            //      http://stackoverflow.com/questions/17747616/webkit-dynamically-created-stylesheet-when-does-it-really-load
            //        http://stackoverflow.com/questions/11425209/are-dom-mutation-observers-slower-than-dom-mutation-events
            //
            // TODO: This is just a temporary 'cross-browser' solution, it needs optimization.
            let currentPollTime = 0, maxPollTime = 20000, pollInterval = 50;
            self.loadTimers[href] = setInterval(function () {
                let i;
                if(currentPollTime > maxPollTime) {
                    clearInterval(self.loadTimers[href]);
                    delete self.loadTimers[href];
                    return;
                }
                for (i = 0; i < window.document.styleSheets.length; i++) {
                    if (window.document.styleSheets[i].href === href) {
                        //clear interval
                        clearInterval(self.loadTimers[href]);
                        delete self.loadTimers[href];
                        // notify stylesheets added
                        self.notifyStylesheetAdded();
                        break;
                    }
                }
                currentPollTime = currentPollTime + pollInterval;
            }, pollInterval);
        },

        onStylesheetRemoved : function (url) {
            // get style node created when setting new text for stylesheet.
            var s = window.document.getElementById(url);
            // remove
            if (s && s.parentNode && s.parentNode.removeChild) {
                s.parentNode.removeChild(s);
            }
        },

        /**
         * Send a notification for the stylesheet added and
         * its import-ed styleshets based on document.stylesheets diff
         * from previous status. It also updates stylesheets status.
         */
        notifyStylesheetAdded : function () {
            var added = {},
                current,
                newStatus;

            current = this.stylesheets;
            newStatus = related().stylesheets;

            Object.keys(newStatus).forEach(function (v, i) {
                if (!current[v]) {
                    added[v] = newStatus[v];
                }
            });

            Object.keys(added).forEach(function (v, i) {
                _transport.send(JSON.stringify({
                    method: "StylesheetAdded",
                    href: v,
                    roots: [added[v]]
                }));
            });

            self.stylesheets = newStatus;
        },

        /**
         * Send a notification for the removed stylesheet and
         * its import-ed styleshets based on document.stylesheets diff
         * from previous status. It also updates stylesheets status.
         */
        notifyStylesheetRemoved : function (_dontUpdateStylesheets) {

            var self = this;
            var removed = {},
                newStatus,
                current;

            current = self.stylesheets;
            newStatus = related().stylesheets;

            Object.keys(current).forEach(function (v, i) {
                if (!newStatus[v]) {
                    removed[v] = current[v];
                    // remove node created by setStylesheetText if any
                    self.onStylesheetRemoved(current[v]);
                }
            });

            Object.keys(removed).forEach(function (v, i) {
                _transport.send(JSON.stringify({
                    method: "StylesheetRemoved",
                    href: v,
                    roots: [removed[v]]
                }));
            });

            if(!_dontUpdateStylesheets){
                self.stylesheets = newStatus;
            }
        }
    };


    /* process related docs added */
    function _onNodesAdded(nodes) {
        var i;
        for (i = 0; i < nodes.length; i++) {
            //check for Javascript files
            if (Utils.isExternalScript(nodes[i])) {
                _transport.send(JSON.stringify({
                    method: 'ScriptAdded',
                    src: nodes[i].src
                }));
            }
            //check for stylesheets
            if (Utils.isExternalStylesheet(nodes[i])) {
                CSS.checkForStylesheetLoaded(nodes[i].href);
            }
        }
    }
    /* process related docs removed */
    function _onNodesRemoved(nodes) {
        var i;
        //iterate on removed nodes
        for (i = 0; i < nodes.length; i++) {

            // check for external JS files
            if (Utils.isExternalScript(nodes[i])) {
                _transport.send(JSON.stringify({
                    method: 'ScriptRemoved',
                    src: nodes[i].src
                }));
            }
            //check for external StyleSheets
            if (Utils.isExternalStylesheet(nodes[i])) {
                CSS.notifyStylesheetRemoved();
            }
        }
    }

    function _enableListeners() {
        // enable MutationOberver if it's supported
        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
        if (MutationObserver) {
            var observer = new MutationObserver(function (mutations) {
                mutations.forEach(function (mutation) {
                    if (mutation.addedNodes.length > 0) {
                        _onNodesAdded(mutation.addedNodes);
                    }
                    if (mutation.removedNodes.length > 0) {
                        _onNodesRemoved(mutation.removedNodes);
                    }
                });
            });
            observer.observe(_document, {
                childList: true,
                subtree: true
            });
        } else {
            // use MutationEvents as fallback
            window.document.addEventListener('DOMNodeInserted', function niLstnr(e) {
                _onNodesAdded([e.target]);
            });
            window.document.addEventListener('DOMNodeRemoved', function nrLstnr(e) {
                _onNodesRemoved([e.target]);
            });
        }
    }


    /**
     * Start listening for events and send initial related documents message.
     *
     * @param {HTMLDocument} document
     * @param {object} transport Live development transport connection
     */
    function start(document, transport) {
        _transport = transport;
        _document = document;
        // start listening to node changes
        _enableListeners();

        var rel = related();

        // send the current status of related docs.
        _transport.send(JSON.stringify({
            method: "DocumentRelated",
            related: rel
        }));
        // initialize stylesheets with current status for further notifications.
        CSS.stylesheets = rel.stylesheets;
    }

    /**
     * Stop listening.
     * TODO currently a no-op.
     */
    function stop() {

    }

    var DocumentObserver = {
        start: start,
        stop: stop,
        related: related
    };

    ProtocolManager.setDocumentObserver(DocumentObserver);

}(this));
