/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
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

define(function (require, exports, module) {


    var EditorManager       = brackets.getModule("editor/EditorManager"),
        QuickOpen           = brackets.getModule("search/QuickOpen"),
        QuickOpenHelper     = brackets.getModule("search/QuickOpenHelper"),
        JSUtils             = brackets.getModule("language/JSUtils"),
        DocumentManager     = brackets.getModule("document/DocumentManager"),
        StringMatch         = brackets.getModule("utils/StringMatch");


   /**
    * FileLocation class
    * @constructor
    * @param {string} fullPath
    * @param {number} line
    * @param {number} chFrom column start position
    * @param {number} chTo column end position
    * @param {string} functionName
    */
    function FileLocation(fullPath, line, chFrom, chTo, functionName) {
        this.fullPath = fullPath;
        this.line = line;
        this.chFrom = chFrom;
        this.chTo = chTo;
        this.functionName = functionName;
    }

    /**
     * Contains a list of information about functions for a single document.
     *
     * @return {?Array.<FileLocation>}
     */
    function createFunctionList() {
        var doc = DocumentManager.getCurrentDocument();
        if (!doc) {
            return;
        }

        var functionList = [];
        var docText = doc.getText();
        var lines = docText.split("\n");
        var functions = JSUtils.findAllMatchingFunctionsInText(docText, "*");
        functions.forEach(function (funcEntry) {
            functionList.push(new FileLocation(null, funcEntry.nameLineStart, funcEntry.columnStart, funcEntry.columnEnd, funcEntry.label || funcEntry.name));
        });
        return functionList;
    }



    /**
     * @param {string} query what the user is searching for
     * @param {StringMatch.StringMatcher} matcher object that caches search-in-progress data
     * @return {Array.<SearchResult>} sorted and filtered results that match the query
     */
    function search(query, matcher) {
        var functionList = matcher.functionList;
        if (!functionList) {
            functionList = createFunctionList();
            matcher.functionList = functionList;
        }
        query = query.slice(query.indexOf("@") + 1, query.length);

        // Filter and rank how good each match is
        var filteredList = $.map(functionList, function (fileLocation) {
            var searchResult = matcher.match(fileLocation.functionName, query);
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
            name: "JavaScript functions",
            languageIds: ["javascript"],
            search: search,
            match: QuickOpenHelper.match,
            itemFocus: QuickOpenHelper.itemFocus,
            itemSelect: QuickOpenHelper.itemSelect
        }
    );

});
