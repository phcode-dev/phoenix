/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2016 - 2021 Adobe Systems Incorporated. All rights reserved.
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

// @INCLUDE_IN_API_DOCS

define(function (require, exports, module) {


    var EditorManager       = require("editor/EditorManager"),
        QuickOpen           = require("search/QuickOpen"),
        DocumentManager     = require("document/DocumentManager"),
        StringMatch         = require("utils/StringMatch");

    /**
     * @param {string} query what the user is searching for
     * @param {boolean} returns true if this plug-in wants to provide results for this query
     */
    function match(query) {
        return (query[0] === "@");
    }

    /**
     * Scroll to the selected item in the current document (unless no query string entered yet,
     * in which case the topmost list item is irrelevant)
     * @param {?SearchResult} selectedItem
     * @param {string} query
     * @param {boolean} explicit False if this is only highlighted due to being at top of list after search()
     */
    function itemFocus(selectedItem, query, explicit) {
        if (!selectedItem || (query.length < 2 && !explicit)) {
            return;
        }
        var fileLocation = selectedItem.fileLocation;

        var from = {line: fileLocation.line, ch: fileLocation.chFrom};
        var to = {line: fileLocation.line, ch: fileLocation.chTo};
        EditorManager.getCurrentFullEditor().setSelection(from, to, true);
    }

    /**
     * Scroll to the selected item in the current document (unless no query string entered yet,
     * in which case the topmost list item is irrelevant)
     * @param {?SearchResult} selectedItem
     * @param {string} query
     */
    function itemSelect(selectedItem, query) {
        itemFocus(selectedItem, query, true);
    }

    exports.match      = match;
    exports.itemFocus  = itemFocus;
    exports.itemSelect = itemSelect;
});
