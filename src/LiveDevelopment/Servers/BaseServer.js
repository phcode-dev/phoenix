/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*jslint regexp: true */

define(function (require, exports, module) {


    /**
     * Base class for live preview servers
     *
     * Configuration parameters for this server:
     * - pathResolver - Function to covert absolute native paths to project relative paths
     * - root         - Native path to the project root (and base URL)
     *
     * @constructor
     * @param {!{root: string, pathResolver: function(string): string}} config
     */
    function BaseServer(config) {
        this._root          = config.root;          // ProjectManager.getProjectRoot().fullPath
        this._pathResolver  = config.pathResolver;  // ProjectManager.makeProjectRelativeIfPossible(doc.file.fullPath)
        this._liveDocuments = {};
        this._virtualServingDocuments = {};
    }

    /**
     * Get path of the current project this server serves
     * @returns {string} Path of the current project this server serves
     */
    BaseServer.prototype.getProjectRoot = function () {
        return this._root;
    };

    /**
     * @private
     * Augments the given Brackets document with information that's useful for live development
     * @param {Object} liveDocument
     */
    BaseServer.prototype._setDocInfo = function (liveDocument) {
        var parentUrl,
            matches,
            doc = liveDocument.doc;

        // FUTURE: some of these things should just be moved into core Document; others should
        // be in a LiveDevelopment-specific object attached to the doc.
        matches = /^(.*\/)(.+\.([^.]+))$/.exec(doc.file.fullPath);
        if (!matches) {
            return;
        }

        doc.extension = matches[3];

        parentUrl = this.pathToUrl(matches[1]);
        doc.url = parentUrl + encodeURI(matches[2]);

        // the root represents the document that should be displayed in the browser
        // for live development (the file for HTML files)
        // TODO: Issue #2033 Improve how default page is determined
        doc.root = { url: doc.url };

        // TODO: Better workflow of liveDocument.doc.url assignment
        // Force sync the browser after a URL is assigned
        if (doc.isDirty && liveDocument._updateBrowser) {
            liveDocument._updateBrowser();
        }
    };

    /**
     * Called by LiveDevelopment before to prepare the server before navigating
     * to the project's base URL. The provider returns a jQuery promise.
     * The Live Development launch process waits until the promise
     * is resolved or rejected. If the promise is rejected, an error window
     * is shown and Live Development does not start..
     *
     * @return {jQuery.Promise} Promise that may be asynchronously resolved
     *  when the server is ready to handle HTTP requests.
     */
    BaseServer.prototype.readyToServe = function () {
        // Base implementation always resolves
        return $.Deferred().resolve().promise();
    };

    /**
     * Determines if this server can serve local file. LiveDevServerManager
     * calls this method when determining if a server can serve a file.
     * @param {string} localPath A local path to file being served.
     * @return {boolean} true When the file can be served, otherwise false.
     */
    BaseServer.prototype.canServe = function (localPath) {
        return true;
    };

    BaseServer.prototype._documentKey = function (absolutePath) {
        return "/" + encodeURI(this._pathResolver(absolutePath));
    };

    /**
     * Adds a live document to server
     * @param {Object} liveDocument
     */
    BaseServer.prototype.add = function (liveDocument) {
        if (!liveDocument) {
            return;
        }

        // use the project relative path as a key to lookup requests
        var key = this._documentKey(liveDocument.doc.file.fullPath);

        this._setDocInfo(liveDocument);
        this._liveDocuments[key] = liveDocument;
    };

    /**
     * This will add the given text to be served when the path is hit in server. You can use this to either
     * serve a file that doesn't exist in project, or to override a given path to the contents you give.
     */
    BaseServer.prototype.addVirtualContentAtPath = function (fullPath, docText) {
        let key = this._documentKey(fullPath);
        this._virtualServingDocuments[key] = docText;
    };

    /**
     * Removes a live document from the server
     * @param {Object} liveDocument
     */
    BaseServer.prototype.remove = function (liveDocument) {
        if (!liveDocument) {
            return;
        }

        var key = this._liveDocuments[this._documentKey(liveDocument.doc.file.fullPath)];

        if (key) {
            delete this._liveDocuments[key];
        }
    };

    /**
     * removes path added by addVirtualContentAtPath()
     */
    BaseServer.prototype.removeVirtualContentAtPath = function (fullPath) {
        let key = this._documentKey(fullPath);
        if(this._virtualServingDocuments[key]) {
            delete this._virtualServingDocuments[key];
        }
    };

    /**
     * Lookup a live document using it's full path key
     * @param {string} path Absolute path to covert to a URL
     * @param {?Object} liveDocument Returns a live document or undefined if a
     *     document does not exist for the path.
     */
    BaseServer.prototype.get = function (path) {
        return this._liveDocuments[this._documentKey(path)];
    };

    /**
     * Clears all live documents currently attached to the server
     */
    BaseServer.prototype.clear = function () {
        this._liveDocuments = {};
        this._virtualServingDocuments = {};
    };

    /**
     * Start the server
     */
    BaseServer.prototype.start = function () {
        // do nothing
    };

    BaseServer.prototype.isActive = function () {
        return false;
    };

    /**
     * Stop the server
     */
    BaseServer.prototype.stop = function () {
        // do nothing
    };

    exports.BaseServer = BaseServer;
});
