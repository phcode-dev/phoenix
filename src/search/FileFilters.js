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

// @INCLUDE_IN_API_DOCS

/**
 * Utilities for managing file-set filters, as used in Find in Files.
 * Includes both UI for selecting/editing filters, as well as the actual file-filtering implementation.
 */
define(function (require, exports, module) {


    const DropdownButton = require("widgets/DropdownButton").DropdownButton,
        Strings = require("strings"),
        PreferencesManager = require("preferences/PreferencesManager"),
        ProjectManager = require("project/ProjectManager"),
        WorkspaceManager = require("view/WorkspaceManager"),
        FindUtils = require("search/FindUtils");

    const PREFS_CURRENT_FILTER_STRING = "FIND_IN_FILES_CURRENT_FILTER_STRING";

    const FILTER_TYPE_EXCLUDE = "excludeFilter",
        FILTER_TYPE_INCLUDE = "includeFilter",
        FILTER_TYPE_NO_FILTER = "noFilter";

    let currentFilter = null,
        currentFilterType = FILTER_TYPE_NO_FILTER;

    /**
     * @type {DropdownButton}
     */
    let _picker = null;
    /**
     * @type { jQuery }
     */
    let $filterContainer = null;

    /**
     * `*.js,*\,*.css` to ['*.js', '**.css']
     * @param {string} str
     * @private
     */
    function _filterStringToPatternArray(str) {
        const randomDigits = Math.floor(1000000000 + Math.random() * 9000000000).toString();
        str = str.replaceAll("\\,", randomDigits);
        let patterns = str.split(",");
        let finalPatterns = [];
        for (let i = 0; i < patterns.length; i++) {
            patterns[i] = patterns[i].replaceAll(randomDigits, ",");
            patterns[i] = patterns[i].toLowerCase();
            if (patterns[i]) {
                finalPatterns.push(patterns[i]);
            }
        }
        return finalPatterns;
    }

    /**
     * A search filter is an array of one or more glob strings. The filter must be 'compiled' via compile()
     * before passing to filterPath()/filterFileList().
     * @return {{pattern:string, isActive: function, ignores: function}} a globeFilter filter that can be passed to filterPath()/filterFileList().
     */
    function getActiveFilter() {
        if (currentFilter) {
            return currentFilter;
        }
        if (currentFilterType === FILTER_TYPE_NO_FILTER) {
            return {
                isActive: () => false,
                pattern: "",
                ignores: () => false
            };
        }
        const pattern = PreferencesManager.getViewState(PREFS_CURRENT_FILTER_STRING) || "";
        currentFilter = compile(pattern);
        return currentFilter;
    }

    /**
     * Sets and save the index of the active filter. Automatically set when editFilter() is completed.
     * If no filter is passed in, then clear the last active filter index by setting it to -1.
     *
     * @param {{pattern:string, isActive: function, ignores: function}|string} filter a globeFilter filter that can be passed to filterPath()/filterFileList().
     * @param {string} [filterType] - optional, one of FileFilters.FILTER_TYPE_*.
     */
    function setActiveFilter(filter, filterType) {
        if (typeof filter === 'string') {
            filter = compile(filter);
        }
        currentFilter = filter;
        PreferencesManager.setViewState(PREFS_CURRENT_FILTER_STRING, filter.pattern);
        if (filterType) {
            currentFilterType = filterType;
            _updatePicker();
        }
        FindUtils.notifyFileFiltersChanged();
    }


    /**
     * Converts a user-specified filter object (as chosen in picker or retrieved from getFilters()) to a 'compiled' form
     * that can be used with filterPath()/filterFileList().
     * @param {string} userFilterString
     * @return {{pattern:string, isActive: function, ignores: function}} a globeFilter filter that can be passed to filterPath()/filterFileList().
     */
    function compile(userFilterString) {
        // Automatically apply transforms make writing simple filters more intuitive
        const userFilter = _filterStringToPatternArray(userFilterString); // this wil lower case too
        const subStringFilter = [];
        const wrappedGlobs = [];
        for (let glob of userFilter) {
            // ./ will only match in present project root, this is as an escape for the above transform we apply
            if (glob.startsWith("./")) {
                wrappedGlobs.push(glob.slice(2)); // ./*.txt to *.txt
                continue;
            }
            // *.js -> **/*.js; *.config.js -> **/*.config.js; ?.js -> **/?.js;
            if (glob.startsWith("*.") || glob.startsWith("?.")) {
                wrappedGlobs.push(`**/${glob}`); // **/*.txt
                continue;
            }

            // if it's a glob string, add to the glob list
            if (glob.includes("?") || glob.includes("*") ||
                glob.includes("[") || glob.includes("]") ||
                glob.includes("\\") || glob.includes("!")) {
                if (!glob.startsWith("**/")) {
                    // make it eazier to search as the user may not know the exact file name and only a part,
                    // in which case we dont want him to type **/ every time to start
                    glob = `**/${glob}`;
                }
                wrappedGlobs.push(glob);
            } else {
                // if not a glob string, we should do a string.includes search to match any substring.
                subStringFilter.push(glob);
            }
        }

        const isMatch = window.fs.utils.picomatch(wrappedGlobs, {
            dot: true
        });
        function ignores(relativeOrFullPath) {
            // path search is not case-sensitive
            relativeOrFullPath = relativeOrFullPath.toLowerCase();
            if (!userFilter.length) {
                // no filter, ignore nothing.
                return false;
            }
            for (let subStr of subStringFilter) {
                if (relativeOrFullPath.includes(subStr)) {
                    return true;
                }
            }
            return isMatch(relativeOrFullPath);
        }
        return {
            pattern: userFilterString,
            isActive: function () {
                return !!userFilter.length;
            },
            ignores: ignores
        };
    }


    /**
     * Returns false if the given path matches any of the exclusion globs in the given filter. Returns true
     * if the path does not match any of the globs. If filtering many paths at once, use filterFileList()
     * for much better performance.
     *
     * @param {object} compiledFilter  'Compiled' filter object as returned by compile(), or null to no-op
     * @param {!string} fullPath
     * @return {boolean}
     */
    function filterPath(compiledFilter, fullPath) {
        if (!compiledFilter) {
            return true;
        }

        if (!ProjectManager.isWithinProject(fullPath)) {
            return false;
        }
        const relativePath = ProjectManager.makeProjectRelativeIfPossible(fullPath);
        switch (currentFilterType) {
            case FILTER_TYPE_INCLUDE:
                if (compiledFilter.isActive()) {
                    return compiledFilter.ignores(relativePath);
                }
                return true;
            case FILTER_TYPE_EXCLUDE:
                if (compiledFilter.isActive()) {
                    return !compiledFilter.ignores(relativePath);
                }
                return true;
            default: return true; // no files excluded
        }
    }

    /**
     * Returns a copy of 'files' filtered to just those that don't match any of the exclusion globs in the filter.
     *
     * @param {object} compiledFilter  'Compiled' filter object as returned by compile(), or null to no-op
     * @param {!Array.<File>} files
     * @return {!Array.<File>}
     */
    function filterFileList(compiledFilter, files) {
        if (!compiledFilter) {
            return files;
        }

        return files.filter(function (f) {
            if (!ProjectManager.isWithinProject(f.fullPath)) {
                return false;
            }
            const relativePath = ProjectManager.makeProjectRelativeIfPossible(f.fullPath);
            switch (currentFilterType) {
                case FILTER_TYPE_INCLUDE:
                    if (compiledFilter.isActive()) {
                        return compiledFilter.ignores(relativePath);
                    }
                    return true;
                case FILTER_TYPE_EXCLUDE:
                    if (compiledFilter.isActive()) {
                        return !compiledFilter.ignores(relativePath);
                    }
                    return true;
                default: return true; // no files excluded
            }
        });
    }

    /**
     * Returns a copy of 'file path' strings that match any of the exclusion globs in the filter.
     *
     * @param {object} compiledFilter  'Compiled' filter object as returned by compile(), or null to no-op
     * @param {!Array.<string>} An array with a list of full file paths that matches atleast one of the filter.
     * @return {!Array.<string>}
     */
    function getPathsMatchingFilter(compiledFilter, filePaths) {
        if (!compiledFilter) {
            return filePaths;
        }

        return filePaths.filter(function (fullPath) {
            if (!ProjectManager.isWithinProject(fullPath)) {
                return false;
            }
            const relativePath = ProjectManager.makeProjectRelativeIfPossible(fullPath);
            switch (currentFilterType) {
                case FILTER_TYPE_INCLUDE:
                    if (compiledFilter.isActive()) {
                        return compiledFilter.ignores(relativePath);
                    }
                    return true;
                case FILTER_TYPE_EXCLUDE:
                    if (compiledFilter.isActive()) {
                        return !compiledFilter.ignores(relativePath);
                    }
                    return true;
                default: return true; // no files excluded
            }
        });
    }

    function _updatePicker() {
        if (!_picker) {
            console.error("No file filter picker ui to update");
            return;
        }
        switch (currentFilterType) {
            case FILTER_TYPE_NO_FILTER:
                _picker.setButtonLabel(Strings.NO_FILE_FILTER);
                $filterContainer && $filterContainer.addClass("forced-hidden");
                break;
            case FILTER_TYPE_INCLUDE:
                _picker.setButtonLabel(Strings.INCLUDE_FILE_FILTER);
                $filterContainer && $filterContainer.removeClass("forced-hidden");
                break;
            case FILTER_TYPE_EXCLUDE:
                _picker.setButtonLabel(Strings.EXCLUDE_FILE_FILTER);
                $filterContainer && $filterContainer.removeClass("forced-hidden");
                break;
        }
        if (!$filterContainer) {
            return;
        }
        $filterContainer.find(".error-filter").hide();
        WorkspaceManager.recomputeLayout();
    }

    /**
     * Creates a UI element for selecting a filter. The picker is populated with a list of recently used filters,
     * an option to edit the selected filter, and another option to create a new filter. The client should call
     * `commitDropdown()` when the UI containing the filter picker is confirmed, which updates the Most Recently 
     * Used (MRU) order, and then use the returned filter object as needed.
     *
     * @return {jQueryObject} The Picker UI as a jQuery object.
     */
    function createFilterPicker() {
        _picker = new DropdownButton("", [
            Strings.CLEAR_FILE_FILTER,
            Strings.INCLUDE_FILE_FILTER,
            Strings.EXCLUDE_FILE_FILTER
        ], undefined, {
            cssClasses: "file-filter-picker no-focus"
        });
        $filterContainer = $(`<div class="filter-container">
        <input autocomplete="off" spellcheck="false" type="text" id="fif-filter-input"
         placeholder="${Strings.FILTER_PLACEHOLDER}"/>
        <div class="filter-dropdown-icon"
         title="${brackets.platform === "mac" ? Strings.FILTER_HISTORY_TOOLTIP_MAC : Strings.FILTER_HISTORY_TOOLTIP}">
            </div><div class="error-filter"></div><span id="filter-counter"></span>
        </div>`);
        const $inputElem = $filterContainer.find("#fif-filter-input");
        if (currentFilter) {
            $inputElem.val(currentFilter.pattern);
        }
        $filterContainer.find("#fif-filter-input").on('input', function () {
            setActiveFilter($inputElem.val());
        });

        _updatePicker();

        _picker.on("select", function (event, item, itemIndex) {
            if (item === Strings.CLEAR_FILE_FILTER) {
                currentFilterType = FILTER_TYPE_NO_FILTER;
                setActiveFilter($inputElem.val());
                _updatePicker();
                $("#find-what").focus();
            } else if (item === Strings.INCLUDE_FILE_FILTER) {
                currentFilterType = FILTER_TYPE_INCLUDE;
                setActiveFilter($inputElem.val());
                _updatePicker();
                $filterContainer.find("#fif-filter-input").focus();
            } else if (item === Strings.EXCLUDE_FILE_FILTER) {
                currentFilterType = FILTER_TYPE_EXCLUDE;
                setActiveFilter($inputElem.val());
                _updatePicker();
                $filterContainer.find("#fif-filter-input").focus();
            }
        });

        return [_picker.$button, $filterContainer];
    }

    /**
     * Allows unit tests to open the file filter dropdown list.
     */
    function showDropdown() {
        if (_picker) {
            _picker.showDropdown();
        }
    }

    /**
     * Allows unit tests to close the file filter dropdown list.
     */
    function closeDropdown() {
        if (_picker) {
            _picker.closeDropdown();
        }
    }

    // For unit tests only
    exports.showDropdown = showDropdown;
    exports.closeDropdown = closeDropdown;

    exports.createFilterPicker = createFilterPicker;
    exports.getActiveFilter = getActiveFilter;
    exports.setActiveFilter = setActiveFilter;
    exports.compile = compile;
    exports.filterPath = filterPath;
    exports.filterFileList = filterFileList;
    exports.getPathsMatchingFilter = getPathsMatchingFilter;

    // filter types
    exports.FILTER_TYPE_EXCLUDE = FILTER_TYPE_EXCLUDE;
    exports.FILTER_TYPE_INCLUDE = FILTER_TYPE_INCLUDE;
    exports.FILTER_TYPE_NO_FILTER = FILTER_TYPE_NO_FILTER;
});
