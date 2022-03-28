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
 * Defines a ChangedDocumentTracker class to monitor changes to files in the current project.
 */
define(function (require, exports, module) {


    var DocumentManager = require("document/DocumentManager"),
        ProjectManager  = require("project/ProjectManager");

    /**
     * Tracks "change" events on opened Documents. Used to monitor changes
     * to documents in-memory and update caches. Assumes all documents have
     * changed when the Brackets window loses and regains focus. Does not
     * read timestamps of files on disk. Clients may optionally track file
     * timestamps on disk independently.
     * @constructor
     */
    function ChangedDocumentTracker() {
        var self = this;

        this._changedPaths = {};
        this._windowFocus = true;
        this._addListener = this._addListener.bind(this);
        this._removeListener = this._removeListener.bind(this);
        this._onChange = this._onChange.bind(this);
        this._onWindowFocus = this._onWindowFocus.bind(this);

        DocumentManager.on("afterDocumentCreate", function (event, doc) {
            // Only track documents in the current project
            if (ProjectManager.isWithinProject(doc.file.fullPath)) {
                self._addListener(doc);
            }
        });

        DocumentManager.on("beforeDocumentDelete", function (event, doc) {
            // In case a document somehow remains loaded after its project
            // has been closed, unconditionally attempt to remove the listener.
            self._removeListener(doc);
        });

        $(window).focus(this._onWindowFocus);
    }

    /**
     * @private
     * Assumes all files are changed when the window loses and regains focus.
     */
    ChangedDocumentTracker.prototype._addListener = function (doc) {
        doc.on("change", this._onChange);
    };

    /**
     * @private
     */
    ChangedDocumentTracker.prototype._removeListener = function (doc) {
        doc.off("change", this._onChange);
    };

    /**
     * @private
     * Assumes all files are changed when the window loses and regains focus.
     */
    ChangedDocumentTracker.prototype._onWindowFocus = function (event, doc) {
        this._windowFocus = true;
    };

    /**
     * @private
     * Tracks changed documents.
     */
    ChangedDocumentTracker.prototype._onChange = function (event, doc) {
        // if it was already changed, and the client hasn't reset the tracker,
        // then leave it changed.
        this._changedPaths[doc.file.fullPath] = true;
    };

    /**
     * Empty the set of dirty paths. Begin tracking new dirty documents.
     */
    ChangedDocumentTracker.prototype.reset = function () {
        this._changedPaths = {};
        this._windowFocus = false;
    };

    /**
     * Check if a file path is dirty.
     * @param {!string} file path
     * @return {!boolean} Returns true if the file was dirtied since the last reset.
     */
    ChangedDocumentTracker.prototype.isPathChanged = function (path) {
        return this._windowFocus || this._changedPaths[path];
    };

    /**
     * Get the set of changed paths since the last reset.
     * @return {Array.<string>} Changed file paths
     */
    ChangedDocumentTracker.prototype.getChangedPaths = function () {
        return $.makeArray(this._changedPaths);
    };

    module.exports = ChangedDocumentTracker;
});
