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

/**
 * Utilities for managing file-set filters, as used in Find in Files.
 * Includes both UI for selecting/editing filters, as well as the actual file-filtering implementation.
 */
define(function (require, exports, module) {


    var _                  = require("thirdparty/lodash"),
        Mustache           = require("thirdparty/mustache/mustache"),
        Dialogs            = require("widgets/Dialogs"),
        DropdownButton     = require("widgets/DropdownButton").DropdownButton,
        StringUtils        = require("utils/StringUtils"),
        Strings            = require("strings"),
        PreferencesManager = require("preferences/PreferencesManager"),
        ProjectManager     = require("project/ProjectManager"),
        FindUtils          = require("search/FindUtils"),
        EditFilterTemplate = require("text!htmlContent/edit-filter-dialog.html"),
        FilterNameTemplate = require("text!htmlContent/filter-name.html");

    const FILTER_TYPE_EXCLUDE = "excludeFilter",
        FILTER_TYPE_INCLUDE = "includeFilter";

    /**
     * Constant: first filter index in the filter dropdown list
     * @type {number}
     */
    var FIRST_FILTER_INDEX = 3;

    /**
     * Constant: max number of characters for the filter name
     * @type {number}
     */
    var FILTER_NAME_CHARACTER_MAX = 20;

    /**
     * Context Info on which files the filter will be applied to.
     * It will be initialized when createFilterPicker is called and if specified, editing UI will
     * indicate how many files are excluded by the filter. Label should be of the form "in ..."
     * @type {?{label:string, promise:$.Promise}}
     */
    var _context = null;

    /**
     * @type {DropdownButton}
     */
    var _picker  = null;

    /**
     * Get the condensed form of the filter set by joining the first two in the set with
     * a comma separator and appending a short message with the number of filters being clipped.
     * @param {Array.<string>} filter
     * @return {string} Condensed form of filter set if `filter` is a valid array.
     *                  Otherwise, return an empty string.
     */
    function _getCondensedForm(filter) {
        if (!_.isArray(filter)) {
            return "";
        }

        // Format filter in condensed form
        if (filter.length > 2) {
            return filter.slice(0, 2).join(", ") + " " +
                   StringUtils.format(Strings.FILE_FILTER_CLIPPED_SUFFIX, filter.length - 2);
        }
        return filter.join(", ");
    }

    /**
     * Populate the list of dropdown menu with two filter commands and
     * the list of saved filter sets.
     */
    function _doPopulate() {
        var dropdownItems = [Strings.NEW_FILE_FILTER, Strings.CLEAR_FILE_FILTER],
            filterSets = PreferencesManager.get("fileFilters") || [];

        if (filterSets.length) {
            dropdownItems.push("---");

            // Remove all the empty exclusion sets before concatenating to the dropdownItems.
            filterSets = filterSets.filter(function (filter) {
                return (_getCondensedForm(filter.patterns) !== "");
            });

            // FIRST_FILTER_INDEX needs to stay in sync with the number of static items (plus separator)
            // ie. the number of items populated so far before we concatenate with the actual filter sets.
            dropdownItems = dropdownItems.concat(filterSets);
        }
        _picker.items = dropdownItems;
    }

    /**
     * Find the index of a filter set in the list of saved filter sets.
     * @param {Array.<{name: string, patterns: Array.<string>}>} filterSets
     * @return {{name: string, patterns: Array.<string>}} filter
     */
    function _getFilterIndex(filterSets, filter) {
        var index = -1;

        if (!filter || !filterSets.length) {
            return index;
        }

        return _.findIndex(filterSets, _.partial(_.isEqual, filter));
    }

    /**
     * A search filter is an array of one or more glob strings. The filter must be 'compiled' via compile()
     * before passing to filterPath()/filterFileList().
     * @return {?{name: string, patterns: Array.<string>, type: string}}
     */
    function getActiveFilter() {
        var filterSets        = PreferencesManager.get("fileFilters") || [],
            activeFilterIndex = PreferencesManager.getViewState("activeFileFilter"),
            oldFilter         = PreferencesManager.getViewState("search.exclusions") || [],
            activeFilter      = null;

        if (activeFilterIndex === null && oldFilter.length) {
            activeFilter = { name: "", patterns: oldFilter, type: FILTER_TYPE_EXCLUDE};
            activeFilterIndex = _getFilterIndex(filterSets, activeFilter);

            // Migrate the old filter into the new filter storage
            if (activeFilterIndex === -1) {
                activeFilterIndex = filterSets.length;
                filterSets.push(activeFilter);
                PreferencesManager.set("fileFilters", filterSets);
            }
            PreferencesManager.setViewState("activeFileFilter", activeFilterIndex);
        } else if (activeFilterIndex > -1 && activeFilterIndex < filterSets.length) {
            activeFilter = filterSets[activeFilterIndex];
        }

        return activeFilter;
    }

    /**
     * Update the picker button label with the name/patterns of the selected filter or
     * No Files Excluded if no filter is selected.
     */
    function _updatePicker() {
        var filter = getActiveFilter();
        if (filter && filter.patterns.length) {
            var label = filter.name || _getCondensedForm(filter.patterns);
            const filterType = filter.type === FILTER_TYPE_INCLUDE ?
                Strings.INCLUDE_FILE_FILTER : Strings.EXCLUDE_FILE_FILTER;
            _picker.setButtonLabel(StringUtils.format(filterType, label));
        } else {
            _picker.setButtonLabel(Strings.NO_FILE_FILTER);
        }
    }

    /**
     * Sets and save the index of the active filter. Automatically set when editFilter() is completed.
     * If no filter is passed in, then clear the last active filter index by setting it to -1.
     *
     * @param {{name: string, patterns: Array.<string>}=} filter
     * @param {number=} index The index of the filter set in the list of saved filter sets or -1 if it is a new one
     */
    function setActiveFilter(filter, index) {
        var filterSets = PreferencesManager.get("fileFilters") || [];

        if (filter) {
            if (index === -1) {
                // Add a new filter set
                index = filterSets.length;
                filterSets.push(filter);
            } else if (index > -1 && index < filterSets.length) {
                // Update an existing filter set only if the filter set has some changes
                if (!_.isEqual(filterSets[index], filter)) {
                    filterSets[index] = filter;
                }
            } else {
                // Should not have been called with an invalid index to the available filter sets.
                console.log("setActiveFilter is called with an invalid index: " + index);
                return;
            }

            PreferencesManager.set("fileFilters", filterSets);
            PreferencesManager.setViewState("activeFileFilter", index);
        } else {
            // Explicitly set to -1 to remove the active file filter
            PreferencesManager.setViewState("activeFileFilter", -1);
        }
        FindUtils.notifyFileFiltersChanged();
    }


    /**
     * Converts a user-specified filter object (as chosen in picker or retrieved from getFilters()) to a 'compiled' form
     * that can be used with filterPath()/filterFileList().
     * @param {!Array.<string>} userFilter
     * @param {string} filterType - one of FILTER_TYPE_EXCLUDE or FILTER_TYPE_INCLUDE
     * @return {{filterType: string, ignores: function}} a globeFilter filter that can be passed to filterPath()/filterFileList().
     */
    function compile(userFilter, filterType) {
        // Automatically apply transforms make writing simple filters more intuitive
        const subStringFilter = [];
        const wrappedGlobs = [];
        for(let glob of userFilter){
            // *.js -> **/*.js; *.config.js -> **/*.config.js; ?.js -> **/?.js;
            if (glob.startsWith("*.") || glob.startsWith("?.")) {
                wrappedGlobs.push(`**/${glob}`); // **/*.txt
                continue;
            }
            // ./ will only match in present project root, this is as an escape for the above transform we apply
            if(glob.startsWith("./")) {
                wrappedGlobs.push(glob.slice(2)); // ./*.txt to *.txt
                continue;
            }
            // if not a glob string, we should do a string.includes search to match any substring.
            if(!(glob.includes("?") || glob.includes("*") ||
                glob.includes("[") || glob.includes("]") ||
                glob.includes("\\") || glob.includes("!"))) {
                subStringFilter.push(glob);
                continue;
            }
            wrappedGlobs.push(glob);
        }

        const isMatch = window.fs.utils.picomatch(wrappedGlobs, {
            dot: true
        });
        function ignores(relativeOrFullPath) {
            for(let subStr of subStringFilter){
                if(relativeOrFullPath.includes(subStr)){
                    return true;
                }
            }
            return isMatch(relativeOrFullPath);
        }
        return {
            ignores: ignores,
            filterType: filterType || FILTER_TYPE_EXCLUDE
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

        if (!ProjectManager.isWithinProject(fullPath)){
            return false;
        }
        const relativePath = ProjectManager.makeProjectRelativeIfPossible(fullPath);
        if(compiledFilter.filterType === FILTER_TYPE_INCLUDE){
            return compiledFilter.ignores(relativePath);
        }
        return !compiledFilter.ignores(relativePath);
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
            if (!ProjectManager.isWithinProject(f.fullPath)){
                return false;
            }
            const relativePath = ProjectManager.makeProjectRelativeIfPossible(f.fullPath);
            if(compiledFilter.filterType === FILTER_TYPE_INCLUDE){
                return compiledFilter.ignores(relativePath);
            }
            return !compiledFilter.ignores(relativePath);
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
            if (!ProjectManager.isWithinProject(fullPath)){
                return false;
            }
            const relativePath = ProjectManager.makeProjectRelativeIfPossible(fullPath);
            if(compiledFilter.filterType === FILTER_TYPE_INCLUDE){
                return compiledFilter.ignores(relativePath);
            }
            return !compiledFilter.ignores(relativePath);
        });
    }


    /**
     * Opens a dialog box to edit the given filter. When editing is finished, the value of getActiveFilter() changes to
     * reflect the edits. If the dialog was canceled, the preference is left unchanged.
     * @param {!{name: string, patterns: Array.<string>}} filter
     * @param {number} index The index of the filter set to be edited or created. The value is -1 if it is for a new one
     *          to be created.
     * @return {!$.Promise} Dialog box promise
     */
    function editFilter(filter, index) {
        let lastFocus = window.document.activeElement;
        let isExclusionFilter = (filter.type !== FILTER_TYPE_INCLUDE);
        function _getInstructionText() {
            return StringUtils.format(
                isExclusionFilter ? Strings.FILE_FILTER_INSTRUCTIONS : Strings.FILE_FILTER_INSTRUCTIONS_INCLUDE,
                "https://docs.phcode.dev/docs/find-in-files/#creating-an-exclusioninclusion-filter");
        }

        let templateVars = {
            instruction: _getInstructionText(),
            Strings: Strings
        };
        let dialog = Dialogs.showModalDialogUsingTemplate(Mustache.render(EditFilterTemplate, templateVars)),
            $nameField = dialog.getElement().find(".exclusions-name"),
            $editField = dialog.getElement().find(".exclusions-editor"),
            $excludeToggle = dialog.getElement().find(".checkbox"),
            $remainingField = dialog.getElement().find(".exclusions-name-characters-remaining");

        $nameField.val(filter.name);
        $editField.val(filter.patterns.join("\n")).focus();
        $excludeToggle.prop('checked', isExclusionFilter);
        $excludeToggle.on("click", ()=>{
            isExclusionFilter = $excludeToggle.is(':checked');
            dialog.getElement().find(".instruction-text")
                .html(_getInstructionText());
            updateFileCount();
        });

        function getValue() {
            var newFilter = $editField.val().split("\n");

            // Remove blank lines
            return newFilter.filter(function (glob) {
                return glob.trim().length;
            });
        }

        $nameField.bind('input', function () {
            var remainingCharacters = FILTER_NAME_CHARACTER_MAX - $(this).val().length;
            if (remainingCharacters < 0.25*FILTER_NAME_CHARACTER_MAX) {
                $remainingField.show();

                $remainingField.text(StringUtils.format(
                    Strings.FILTER_NAME_REMAINING,
                    remainingCharacters
                ));

                if (remainingCharacters < 0) {
                    $remainingField.addClass("exclusions-name-characters-limit-reached");
                } else {
                    $remainingField.removeClass("exclusions-name-characters-limit-reached");
                }
            }            else {
                $remainingField.hide();
            }
            updatePrimaryButton();
        });

        dialog.done(function (buttonId) {
            if (buttonId === Dialogs.DIALOG_BTN_OK) {
                let filterType = $excludeToggle.is(':checked') ? FILTER_TYPE_EXCLUDE : FILTER_TYPE_INCLUDE;
                // Update saved filter preference
                setActiveFilter({
                    name: $nameField.val(),
                    patterns: getValue(),
                    type: filterType
                }, index);
                _updatePicker();
                _doPopulate();
            }
            lastFocus.focus();  // restore focus to old pos
        });

        // Code to update the file count readout at bottom of dialog (if context provided)
        var $fileCount = dialog.getElement().find(".exclusions-filecount");

        function updateFileCount() {
            _context.promise.done(function (files) {
                var filter = getValue();
                if (filter.length) {
                    const filterType = $excludeToggle.is(':checked') ? FILTER_TYPE_EXCLUDE : FILTER_TYPE_INCLUDE;
                    const compiledFilter = compile(filter, filterType);
                    var filtered = filterFileList(compiledFilter, files);
                    $fileCount.html(StringUtils.format(Strings.FILTER_FILE_COUNT, filtered.length, files.length, _context.label));
                } else {
                    $fileCount.html(StringUtils.format(Strings.FILTER_FILE_COUNT_ALL, files.length, _context.label));
                }
            });
        }

        // Code to enable/disable the OK button at the bottom of dialog (whether filter is empty or not)
        var $primaryBtn = dialog.getElement().find(".primary");

        function updatePrimaryButton() {
            var trimmedValue = $editField.val().trim();
            var exclusionNameLength = $nameField.val().length;

            $primaryBtn.prop("disabled", !trimmedValue.length || (exclusionNameLength > FILTER_NAME_CHARACTER_MAX));
        }

        $editField.on("input", updatePrimaryButton);
        updatePrimaryButton();

        if (_context) {
            $editField.on("input", _.debounce(updateFileCount, 400));
            updateFileCount();
        } else {
            $fileCount.hide();
        }

        return dialog.getPromise();
    }


    /**
     * Marks the filter picker's currently selected item as most-recently used, and returns the corresponding
     * 'compiled' filter object ready for use with filterPath().
     * @param {!jQueryObject} picker UI returned from createFilterPicker()
     * @return {!string} 'compiled' filter that can be passed to filterPath()/filterFileList().
     */
    function commitPicker(picker) {
        var filter = getActiveFilter();
        return (filter && filter.patterns.length) ? compile(filter.patterns, filter.type) : "";
    }

    /**
     * Remove the target item from the filter dropdown list and update dropdown button
     * and dropdown list UI.
     * @param {!Event} e Mouse events
     */
    function _handleDeleteFilter(e) {
        // Remove the filter set from the preferences and
        // clear the active filter set index from view state.
        var filterSets        = PreferencesManager.get("fileFilters") || [],
            activeFilterIndex = PreferencesManager.getViewState("activeFileFilter"),
            filterIndex       = $(e.target).parent().data("index") - FIRST_FILTER_INDEX;

        // Don't let the click bubble upward.
        e.stopPropagation();

        filterSets.splice(filterIndex, 1);
        PreferencesManager.set("fileFilters", filterSets);

        if (activeFilterIndex === filterIndex) {
            // Removing the active filter, so clear the active filter
            // both in the view state.
            setActiveFilter(null);
        } else if (activeFilterIndex > filterIndex) {
            // Adjust the active filter index after the removal of a filter set before it.
            --activeFilterIndex;
            setActiveFilter(filterSets[activeFilterIndex], activeFilterIndex);
        }

        _updatePicker();
        _doPopulate();
        _picker.refresh();
    }

    /**
     * Close filter dropdwon list and launch edit filter dialog.
     * @param {!Event} e Mouse events
     */
    function _handleEditFilter(e) {
        var filterSets  = PreferencesManager.get("fileFilters") || [],
            filterIndex = $(e.target).parent().parent().data("index") - FIRST_FILTER_INDEX;

        // Don't let the click bubble upward.
        e.stopPropagation();

        // Close the dropdown first before opening the edit filter dialog
        // so that it will restore focus to the DOM element that has focus
        // prior to opening it.
        _picker.closeDropdown();

        editFilter(filterSets[filterIndex], filterIndex);
    }

    /**
     * Set up mouse click event listeners for 'Delete' and 'Edit' buttons
     * when the dropdown is open. Also set check mark on the active filter.
     * @param {!Event>} event listRendered event triggered when the dropdown is open
     * @param {!jQueryObject} $dropdown the jQuery DOM node of the dropdown list
     */
    function _handleListRendered(event, $dropdown) {
        var activeFilterIndex = PreferencesManager.getViewState("activeFileFilter"),
            checkedItemIndex = (activeFilterIndex > -1) ? (activeFilterIndex + FIRST_FILTER_INDEX + 1) : -1;
        _picker.setChecked(checkedItemIndex, true);

        $dropdown.find(".filter-trash-icon")
            .on("click", _handleDeleteFilter);

        $dropdown.find(".filter-edit-icon")
            .on("click", _handleEditFilter);
    }

    /**
     * Creates a UI element for selecting a filter, populated with a list of recently used filters, an option to
     * edit the selected filter and another option to create a new filter. The client should call commitDropdown()
     * when the UI containing the filter picker is confirmed (which updates the MRU order) and then use the
     * returned filter object as needed.
     *
     * @param {?{label:string, promise:$.Promise}} context Info on files that filter will apply to.
     *      This will be saved as _context for later use in creating a new filter or editing an
     *      existing filter in Edit Filter dialog.
     * @return {!jQueryObject} Picker UI. To retrieve the selected value, use commitPicker().
     */
    function createFilterPicker(context) {

        function itemRenderer(item, index) {
            if (index < FIRST_FILTER_INDEX) {
                // Prefix the two filter commands with 'recent-filter-name' so that
                // they also get the same margin-left as the actual filters.
                return "<span class='recent-filter-name'></span>" + _.escape(item);
            }

            const filterType = item.type === FILTER_TYPE_INCLUDE ?
                Strings.INCLUDE_FILE_FILTER_DROPDOWN : Strings.EXCLUDE_FILE_FILTER_DROPDOWN;
            var condensedPatterns = _getCondensedForm(item.patterns),
                templateVars = {
                    "filter-type": filterType,
                    "filter-name": _.escape(item.name || condensedPatterns),
                    "filter-patterns": item.name ? " - " + _.escape(condensedPatterns) : ""
                };

            return Mustache.render(FilterNameTemplate, templateVars);
        }

        _context = context;
        _picker = new DropdownButton("", [], itemRenderer);

        _updatePicker();
        _doPopulate();

        // Add 'file-filter-picker' to keep some margin space on the left of the button
        _picker.$button.addClass("file-filter-picker no-focus");

        // Set up mouse click event listeners for 'Delete' and 'Edit' buttons
        _picker.on("listRendered", _handleListRendered);

        _picker.on("select", function (event, item, itemIndex) {
            if (itemIndex === 0) {
                // Close the dropdown first before opening the edit filter dialog
                // so that it will restore focus to the DOM element that has focus
                // prior to opening it.
                _picker.closeDropdown();

                // Create a new filter set
                editFilter({ name: "", patterns: [], type: FILTER_TYPE_EXCLUDE}, -1);
            } else if (itemIndex === 1) {
                // Uncheck the prior active filter in the dropdown list.
                _picker.setChecked(itemIndex, false);

                // Clear the active filter
                setActiveFilter(null);
                _updatePicker();
            } else if (itemIndex >= FIRST_FILTER_INDEX && item) {
                setActiveFilter(item, itemIndex - FIRST_FILTER_INDEX);
                _picker.setChecked(itemIndex, true);
                _updatePicker();
            }
        });

        return _picker.$button;
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
    exports.showDropdown       = showDropdown;
    exports.closeDropdown      = closeDropdown;

    exports.createFilterPicker     = createFilterPicker;
    exports.commitPicker           = commitPicker;
    exports.getActiveFilter        = getActiveFilter;
    exports.setActiveFilter        = setActiveFilter;
    exports.editFilter             = editFilter;
    exports.compile                = compile;
    exports.filterPath             = filterPath;
    exports.filterFileList         = filterFileList;
    exports.getPathsMatchingFilter = getPathsMatchingFilter;
});
