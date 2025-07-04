/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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
    /**
     * this function creates a filter string for a snippet containing all the searchable fields
     * the priority order: abbreviation > description > template text > file extension
     *
     * @private
     * @param {object} snippetItem
     * @returns {string} - all the searchable fields (in lowercase)
     */
    function _createFilterString(snippetItem) {
        const fields = [
            snippetItem.abbreviation || "",
            snippetItem.description || "",
            snippetItem.templateText || "",
            snippetItem.fileExtension || ""
        ];
        return fields.join(" ").toLowerCase();
    }

    /**
     * This function calculates a priority score for search matches
     * the higher scores means better match and is shown before lower score matches
     * priority order: abbreviation > description > template text > file extension
     *
     * @private
     * @param {object} snippet
     * @param {Array} filterTerms
     * @returns {number} - priority score
     */
    function _calculateMatchPriority(snippet, filterTerms) {
        let score = 0;
        const abbr = (snippet.abbreviation || "").toLowerCase();
        const desc = (snippet.description || "").toLowerCase();
        const template = (snippet.templateText || "").toLowerCase();
        const fileExt = (snippet.fileExtension || "").toLowerCase();

        filterTerms.forEach(function (term) {
            // abbreviation matching. this has the highest priority
            if (abbr.indexOf(term) === 0) {
                score += 1000; // exact start match in abbreviation
            } else if (abbr.indexOf(term) > -1) {
                score += 500; // partial match in abbreviation
            }

            // description matching. this has the second highest priority
            if (desc.indexOf(term) === 0) {
                score += 100;
            } else if (desc.indexOf(term) > -1) {
                score += 50;
            }

            // Template text matching. this has the third highest priority
            if (template.indexOf(term) === 0) {
                score += 20;
            } else if (template.indexOf(term) > -1) {
                score += 10;
            }

            // File extension matching, lowests priority
            if (fileExt.indexOf(term) > -1) {
                score += 5;
            }
        });

        return score;
    }

    /**
     * This function filters snippets based on the filter input value
     *
     * @param {Array} snippetList - array of snippet objects
     * @returns {Array} - filtered array of snippet objects, sorted by relevance
     */
    function filterSnippets(snippetList) {
        const $filterInput = $("#filter-snippets-input");
        const filterText = $filterInput.val().trim().toLowerCase();

        if (!filterText) {
            return snippetList; // return all snippets if no filter
        }

        const filterTerms = filterText.split(/\s+/);

        // filter snippets that match all terms
        const matchingSnippets = snippetList.filter(function (snippet) {
            const filterString = _createFilterString(snippet);

            // all terms must match (AND logic)
            return filterTerms.every(function (term) {
                return filterString.indexOf(term) > -1;
            });
        });

        // sort by relevance (higher priority scores first)
        return matchingSnippets.sort(function (a, b) {
            const scoreA = _calculateMatchPriority(a, filterTerms);
            const scoreB = _calculateMatchPriority(b, filterTerms);
            return scoreB - scoreA; // in descending order (highest score will be at first)
        });
    }

    exports.filterSnippets = filterSnippets;
});
