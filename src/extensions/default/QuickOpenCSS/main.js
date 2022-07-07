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

define(function (require, exports, module) {


    var EditorManager       = brackets.getModule("editor/EditorManager"),
        QuickOpen           = brackets.getModule("search/QuickOpen"),
        QuickOpenHelper     = brackets.getModule("search/QuickOpenHelper"),
        CSSUtils            = brackets.getModule("language/CSSUtils"),
        DocumentManager     = brackets.getModule("document/DocumentManager"),
        StringMatch         = brackets.getModule("utils/StringMatch");


    /**
     * Returns a list of information about selectors for a single document. This array is populated
     * by createSelectorList()
     * @return {?Array.<FileLocation>}
     */
    function createSelectorList() {
        var doc = DocumentManager.getCurrentDocument();
        if (!doc) {
            return;
        }

        var docText = doc.getText();
        return CSSUtils.extractAllSelectors(docText, doc.getLanguage().getMode());
    }


    /**
     * @param {string} query what the user is searching for
     * @return {Array.<SearchResult>} sorted and filtered results that match the query
     */
    function search(query, matcher) {
        var selectorList = matcher.selectorList;
        if (!selectorList) {
            selectorList = createSelectorList();
            matcher.selectorList = selectorList;
        }
        query = query.slice(query.indexOf("@") + 1, query.length);

        // Filter and rank how good each match is
        var filteredList = $.map(selectorList, function (itemInfo) {
            var searchResult = matcher.match(CSSUtils.getCompleteSelectors(itemInfo), query);
            if (searchResult) {
                searchResult.selectorInfo = itemInfo;
            }
            return searchResult;
        });

        // Sort based on ranking & basic alphabetical order
        StringMatch.basicMatchSort(filteredList);

        return filteredList;
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
        var selectorInfo = selectedItem.selectorInfo;

        var from = {line: selectorInfo.selectorStartLine, ch: selectorInfo.selectorStartChar};
        var to = {line: selectorInfo.selectorStartLine, ch: selectorInfo.selectorEndChar};
        EditorManager.getCurrentFullEditor().setSelection(from, to, true);
    }

    function itemSelect(selectedItem, query) {
        itemFocus(selectedItem, query, true);
    }



    QuickOpen.addQuickOpenPlugin(
        {
            name: "CSS Selectors",
            languageIds: ["css", "less", "scss"],
            search: search,
            match: QuickOpenHelper.match,
            itemFocus: itemFocus,
            itemSelect: itemSelect
        }
    );


});
