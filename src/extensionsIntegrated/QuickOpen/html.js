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

/*jslint regexp: true */

define(function (require, exports, module) {


    const QuickOpen           = require("search/QuickOpen"),
        QuickOpenHelper     = require("search/QuickOpenHelper"),
        DocumentManager     = require("document/DocumentManager"),
        StringMatch         = require("utils/StringMatch");


   /**
    * FileLocation class
    * @constructor
    * @param {string} fullPath
    * @param {number} line
    * @param {number} chFrom column start position
    * @param {number} chTo column end position
    * @param {string} id
    */
    function FileLocation(fullPath, line, chFrom, chTo, id) {
        this.fullPath = fullPath;
        this.line = line;
        this.chFrom = chFrom;
        this.chTo = chTo;
        this.id = id;
    }

    /**
     * Returns a list of information about ID's for a single document. This array is populated
     * by createIDList()
     * @type {?Array.<FileLocation>}
     */
    function createIDList() {
        var doc = DocumentManager.getCurrentDocument();
        if (!doc) {
            return;
        }

        var idList = [];
        var docText = doc.getText();
        var lines = docText.split("\n");

        var regex = new RegExp(/\s+id\s*?=\s*?["'](.*?)["']/gi);
        var id, chFrom, chTo, i, line;
        for (i = 0; i < lines.length; i++) {
            line = lines[i];
            var info;
            while ((info = regex.exec(line)) !== null) {
                id = info[1];
                // TODO: this doesn't handle id's that share the
                // same portion of a name on the same line or when
                // the id and value are on different lines
                chFrom = line.indexOf(id);
                chTo = chFrom + id.length;
                idList.push(new FileLocation(null, i, chFrom, chTo, id));
            }
        }
        return idList;
    }


    /**
     * @param {string} query what the user is searching for
     * @return {Array.<SearchResult>} sorted and filtered results that match the query
     */
    function search(query, matcher) {
        var idList = matcher.idList;
        if (!idList) {
            idList = createIDList();
            matcher.idList = idList;
        }
        query = query.slice(query.indexOf("@") + 1, query.length);

        // Filter and rank how good each match is
        var filteredList = $.map(idList, function (fileLocation) {
            var searchResult = matcher.match(fileLocation.id, query);
            if (searchResult) {
                searchResult.fileLocation = fileLocation;
            }
            return searchResult;
        });

        // Sort based on ranking & basic alphabetical order
        StringMatch.basicMatchSort(filteredList);

        return filteredList;
    }

    QuickOpen.addQuickOpenPlugin(
        {
            name: "html ids",
            languageIds: ["html"],
            search: search,
            match: QuickOpenHelper.match,
            itemFocus: QuickOpenHelper.itemFocus,
            itemSelect: QuickOpenHelper.itemSelect
        }
    );

});
