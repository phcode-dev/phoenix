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

/*
 * UI for the Find/Replace and Find in Files modal bar.
 */
define(function (require, exports, module) {


    const _ = require("thirdparty/lodash"),
        Mustache = require("thirdparty/mustache/mustache"),
        EventDispatcher = require("utils/EventDispatcher"),
        Commands = require("command/Commands"),
        KeyBindingManager = require("command/KeyBindingManager"),
        KeyEvent = require("utils/KeyEvent"),
        ModalBar = require("widgets/ModalBar").ModalBar,
        PreferencesManager = require("preferences/PreferencesManager"),
        MainViewManager = require("view/MainViewManager"),
        Strings = require("strings"),
        ViewUtils = require("utils/ViewUtils"),
        FindUtils = require("search/FindUtils"),
        FileUtils = require("file/FileUtils"),
        QuickSearchField = require("search/QuickSearchField").QuickSearchField,
        Metrics = require("utils/Metrics");

    /**
     * @private
     * The template we use for all Find bars.
     * @type {string}
     */
    const _searchBarTemplate = require("text!htmlContent/findreplace-bar.html");

    let intervalId = 0,
        lastQueriedText = "",
        lastTypedText = "",
        lastTypedTextWasRegexp = false,
        lastClosedQuery = null;
    const MAX_HISTORY_RESULTS = 25;
    const PREF_MAX_HISTORY = "maxSearchHistory";

    const INSTANT_SEARCH_INTERVAL_MS = 50;

    /**
     *
     * Find Bar UI component, used for both single- and multi-file find/replace. This doesn't actually
     * create and add the FindBar to the DOM - for that, call open().
     *
     * Dispatches these events:
     *
     * - queryChange - when the user types in the input field or sets a query option. Use getQueryInfo()
     *      to get the current query state.
     * - doFind - when the user chooses to do a Find Previous or Find Next.
     *      Parameters are:
     *          shiftKey - boolean, false for Find Next, true for Find Previous
     * - doReplace - when the user chooses to do a single replace. Use getReplaceText() to get the current replacement text.
     * - doReplaceBatch - when the user chooses to initiate a Replace All. Use getReplaceText() to get the current replacement text.
     * - doReplaceAll - when the user chooses to perform a Replace All. Use getReplaceText() to get the current replacement text.
     * - close - when the find bar is closed
     *
     * @constructor
     *
     * @param {boolean=} options.multifile - true if this is a Find/Replace in Files (changes the behavior of Enter in
     *      the fields, hides the navigator controls, shows the scope/filter controls, and if in replace mode, hides the
     *      Replace button (so there's only Replace All)
     * @param {boolean=} options.replace - true to show the Replace controls - default false
     * @param {string=}  options.queryPlaceholder - label to show in the Find field - default empty string
     * @param {string=}  options.initialQuery - query to populate in the Find field on open - default empty string
     * @param {string=}  scopeLabel - HTML label to show for the scope of the search, expected to be already escaped - default empty string
     */
    function FindBar(options) {
        var defaults = {
            multifile: false,
            replace: false,
            queryPlaceholder: "",
            initialQuery: "",
            initialReplaceText: "",
            scopeLabel: ""
        };
        this._options = _.extend(defaults, options);
        this._closed = false;
        this._enabled = true;
    }
    EventDispatcher.makeEventDispatcher(FindBar.prototype);

    /*
     * Global FindBar functions for making sure only one is open at a time.
     */

    // TODO: this is temporary - we should do this at the ModalBar level, but can't do that until
    // we land the simplified Quick Open UI (#7227) that eliminates some asynchronicity in closing
    // its ModalBar.

    /**
     * @private
     * Register a find bar so we can close it later if another one tries to open.
     * Note that this is a global function, not an instance function.
     * @param {!FindBar} findBar The find bar to register.
     */
    FindBar._addFindBar = function (findBar) {
        FindBar._bars = FindBar._bars || [];
        FindBar._bars.push(findBar);
    };

    /**
     * @private
     * Remove a find bar from the list.
     * Note that this is a global function, not an instance function.
     * @param {FindBar} findBar The bar to remove.
     */
    FindBar._removeFindBar = function (findBar) {
        if (FindBar._bars) {
            _.pull(FindBar._bars, findBar);
        }
    };

    /**
     * @private
     * Close all existing find bars. In theory there should be only one, but since there can be
     * timing issues due to animation we maintain a list.
     * Note that this is a global function, not an instance function.
     */
    FindBar._closeFindBars = function () {
        var bars = FindBar._bars;
        if (bars) {
            bars.forEach(function (bar) {
                bar.close(true, false);
            });
            bars = [];
        }
    };

    /*
     * Instance properties/functions
     */

    /**
     * @private
     * Options passed into the FindBar.
     * @type {!{multifile: boolean, replace: boolean, queryPlaceholder: string, initialQuery: string, scopeLabel: string}}
     */
    FindBar.prototype._options = null;

    /**
     * @private
     * Whether the FindBar has been closed.
     * @type {boolean}
     */
    FindBar.prototype._closed = false;

    /**
     * @private
     * Whether the FindBar is currently enabled.
     * @type {boolean}
     */
    FindBar.prototype._enabled = true;

    /**
     * @private
     * @type {?ModalBar} Modal bar containing this find bar's UI
     */
    FindBar.prototype._modalBar = null;

    /**
     * @private
     * Returns the jQuery object for an element in this Find bar.
     * @param {string} selector The selector for the element.
     * @return {jQueryObject} The jQuery object for the element, or an empty object if the Find bar isn't yet
     *      in the DOM or the element doesn't exist.
     */
    FindBar.prototype.$ = function (selector) {
        if (this._modalBar) {
            return $(selector, this._modalBar.getRoot());
        }
        return $();

    };

    // TODO: change IDs to classes

    /**
     * @private
     * Set the state of the toggles in the Find bar to the saved prefs state.
     */
    FindBar.prototype._updateSearchBarFromPrefs = function () {
        // Have to make sure we explicitly cast the second parameter to a boolean, because
        // toggleClass expects literal true/false.
        this.$("#find-case-sensitive").toggleClass("active", !!PreferencesManager.getViewState("caseSensitive"));
        this.$("#find-regexp").toggleClass("active", !!PreferencesManager.getViewState("regexp"));
    };

    /**
     * @private
     * Save the prefs state based on the state of the toggles.
     */
    FindBar.prototype._updatePrefsFromSearchBar = function () {
        var isRegexp = this.$("#find-regexp").is(".active");
        PreferencesManager.setViewState("caseSensitive", this.$("#find-case-sensitive").is(".active"));
        PreferencesManager.setViewState("regexp", isRegexp);
        lastTypedTextWasRegexp = isRegexp;
    };

    /**
     * @private
     * Shows the keyboard shortcut for the given command in the element's tooltip.
     * @param {jQueryObject} $elem The element to add the shortcut to.
     * @param {string} commandId The ID for the command whose keyboard shortcut to show.
     */
    FindBar.prototype._addShortcutToTooltip = function ($elem, commandId) {
        const replaceShortcut = KeyBindingManager.getKeyBindingsDisplay(commandId);
        if (replaceShortcut) {
            var oldTitle = $elem.attr("title");
            oldTitle = (oldTitle ? oldTitle + " " : "");
            $elem.attr("title", oldTitle + "(" + replaceShortcut + ")");
        }
    };

    function _updateHistory(whichHistory, searchVal) {
        if (searchVal) {
            let searchHistory = PreferencesManager.getViewState(whichHistory);
            const maxCount = PreferencesManager.get(PREF_MAX_HISTORY);
            const searchQueryIndex = searchHistory.indexOf(searchVal);
            if (searchQueryIndex !== -1) {
                searchHistory.splice(searchQueryIndex, 1);
            } else {
                if (searchHistory.length === maxCount) {
                    searchHistory.pop();
                }
            }
            searchHistory.unshift(searchVal);
            PreferencesManager.setViewState(whichHistory, searchHistory);
        }
    }

    /**
     * @private
     * Adds element to the search history queue.
     * @param {string} searchVal string that needs to be added to search history.
     * @param {string} filterVal string that needs to be added to filter  history.
     */
    FindBar.prototype._addElementToSearchHistory = function (searchVal, filterVal) {
        _updateHistory("searchHistory", searchVal);
        _updateHistory("filterHistory", filterVal);
    };

    /**
     * Opens the Find bar, closing any other existing Find bars.
     */
    FindBar.prototype.open = function () {
        var self = this;

        // Normally, creating a new Find bar will simply cause the old one to close
        // automatically. This can cause timing issues because the focus change might
        // cause the new one to think it should close, too. So we simply explicitly
        // close the old Find bar (with no animation) before creating a new one.
        // TODO: see note above - this will move to ModalBar eventually.
        FindBar._closeFindBars();
        let metricType = "findBar";
        if (this._options.multifile) {
            metricType = "findInFiles.bar";
        }
        Metrics.countEvent(Metrics.EVENT_TYPE.SEARCH, metricType, "opened");

        var templateVars = _.clone(this._options);
        templateVars.Strings = Strings;
        templateVars.replaceBatchLabel = (templateVars.multifile ? Strings.BUTTON_REPLACE_ALL_IN_FILES : Strings.BUTTON_REPLACE_BATCH);
        templateVars.replaceAllLabel = Strings.BUTTON_REPLACE_ALL;

        self._addElementToSearchHistory(this._options.initialQuery);

        this._modalBar = new ModalBar(
            Mustache.render(_searchBarTemplate, templateVars),
            !!PreferencesManager.get('autoHideSearch')		// 2nd arg = auto-close on Esc/blur
        );

        // Done this way because ModalBar.js seems to react unreliably when
        // modifying it to handle the escape key - the findbar wasn't getting
        // closed as it should, instead persisting in the background
        function _handleKeydown(e) {
            if (e.keyCode === KeyEvent.DOM_VK_ESCAPE) {
                e.stopPropagation();
                e.preventDefault();
                self.close();
            }
        }
        window.document.body.addEventListener("keydown", _handleKeydown, true);

        function _keydownHookForCtrlSpace(event) {
            const ctrlSpaceEvent = (event.ctrlKey === true || event.metaKey === true) &&
                (event.keyCode === KeyEvent.DOM_VK_SPACE);
            if (!ctrlSpaceEvent) {
                return;
            }
            if ($("#find-what").is(":focus")) {
                self.showSearchHints();
                event.stopPropagation();
                event.preventDefault();
                return true;
            }
            if ($("#fif-filter-input").is(":focus")) {
                self.showFilterHints();
                event.stopPropagation();
                event.preventDefault();
                return true;
            }
            return false;
        }

        KeyBindingManager.addGlobalKeydownHook(_keydownHookForCtrlSpace);

        // When the ModalBar closes, clean ourselves up.
        this._modalBar.on("close", function (event) {
            KeyBindingManager.removeGlobalKeydownHook(_keydownHookForCtrlSpace);
            window.document.body.removeEventListener("keydown", _handleKeydown, true);

            // Hide error popup, since it hangs down low enough to make the slide-out look awkward
            self.showError(null);
            self._modalBar = null;
            self._closed = true;
            window.clearInterval(intervalId);
            intervalId = 0;
            FindBar._removeFindBar(self);
            MainViewManager.focusActivePane();
            self.trigger("close");
            if (self.searchField) {
                self.searchField.destroy();
            }
            if (self.filterField) {
                self.filterField.destroy();
            }
        });

        FindBar._addFindBar(this);

        let executeSearchIfNeeded = function () {
            // We only do instant search via worker.
            if (FindUtils.isInstantSearchDisabled()) {
                return;
            }
            if (self._closed) {
                return;
            }
            if (self.getQueryInfo().query !== lastQueriedText && !FindUtils.isWorkerSearchInProgress()) {
                // init Search
                if (self._options.multifile) {
                    self.trigger("doFind");
                    lastQueriedText = self.getQueryInfo().query;
                }
            }
        };
        if (intervalId === 0) {
            // we do this so that is the search query changes by any means - by keypress, or programmatically
            // we do an instant search if the search term changes.
            intervalId = window.setInterval(executeSearchIfNeeded, INSTANT_SEARCH_INTERVAL_MS);
        }

        var $root = this._modalBar.getRoot();
        var historyIndex = 0;
        $root
            .on("input", "#find-what", function () {
                self.trigger("queryChange");
                var queryInfo = self.getQueryInfo();
                lastTypedText = queryInfo.query;
                lastTypedTextWasRegexp = queryInfo.isRegexp;
            })
            .on("click", "#find-case-sensitive, #find-regexp", function (e) {
                $(e.currentTarget).toggleClass("active");
                self._updatePrefsFromSearchBar();
                self.trigger("queryChange");
                if (self._options.multifile) {  //instant search
                    self.trigger("doFind");
                }
            })
            .on("click", "#find-counter", function (e) {
                $("#find-what").focus();
            })
            .on("focusin", "#find-what", function (e) {
                $(".find-what-wrapper").addClass("find-what-wrapper-focused");
            })
            .on("focusout", "#find-what", function (e) {
                $(".find-what-wrapper").removeClass("find-what-wrapper-focused");
                setTimeout(() => {
                    if (self.searchField && !$("#find-what").is(":focus")) {
                        self.searchField.destroy();
                        self.searchField = null;
                    }
                }, 250); // on clicking the item in history popup, commit is called after focusout which
                // means that if we destroy it here, the commit will never be called. so the delay timer.
            })
            .on("focusout", "#fif-filter-input", function (e) {
                setTimeout(() => {
                    if (self.filterField && !$("#fif-filter-input").is(":focus")) {
                        self.filterField.destroy();
                        self.filterField = null;
                    }
                }, 250); // on clicking the item in history popup, commit is called after focusout which
                // means that if we destroy it here, the commit will never be called. so the delay timer.
            })
            .on("click", ".search-input-container .dropdown-icon", function (e) {
                if (self.searchField) {
                    self.searchField.destroy();
                    self.searchField = null;
                } else {
                    self.showSearchHints(true);
                }
                self.$("#find-what").focus();
            })
            .on("click", ".filter-container .filter-dropdown-icon", function (e) {
                if (self.filterField) {
                    self.filterField.destroy();
                    self.filterField = null;
                } else {
                    self.showFilterHints(true);
                }
                self.$("#fif-filter-input").focus();
            })
            .on("keydown", "#find-what, #replace-with, #fif-filter-input", function (e) {
                if (e.keyCode === KeyEvent.DOM_VK_RETURN) {
                    if (self._options.multifile && e.shiftKey) {
                        // In multi file search, if we press shift+return key, we enter the multi line ssearch mode and
                        // the text input will receive the enter key to create a new line in text field.
                        return;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    self._addElementToSearchHistory(
                        self.$("#find-what").val(), self.$("#fif-filter-input").val());
                    if (self._options.multifile) {
                        if ($(e.target).is("#find-what")) {
                            if (self._options.replace) {
                                // Just set focus to the Replace field.
                                self.focusReplace();
                            } else {
                                Metrics.countEvent(Metrics.EVENT_TYPE.SEARCH, "findInFiles.bar",
                                    "returnKey");
                                // Trigger a Find (which really means "Find All" in this context).
                                self.trigger("openSelectedFile");
                            }
                        } else {
                            Metrics.countEvent(Metrics.EVENT_TYPE.SEARCH, "replaceBatchInFiles.bar",
                                "returnKey");
                            self.trigger("doReplaceBatch");
                        }
                    } else {
                        // In the single file case, we just want to trigger a Find Next (or Find Previous
                        // if Shift is held down).
                        self.trigger("doFind", e.shiftKey);
                    }
                    historyIndex = 0;
                } else if (e.keyCode === KeyEvent.DOM_VK_DOWN) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (self._options.multifile) {
                        self.trigger("selectNextResult");
                        return;
                    }
                    self.trigger("doFind", false);
                } else if (e.keyCode === KeyEvent.DOM_VK_UP) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (self._options.multifile) {
                        self.trigger("selectPrevResult");
                        return;
                    }
                    self.trigger("doFind", true);
                } else if (e.keyCode === KeyEvent.DOM_VK_PAGE_DOWN) {
                    e.preventDefault();
                    e.stopPropagation();
                    self.trigger("selectNextPage");
                } else if (e.keyCode === KeyEvent.DOM_VK_PAGE_UP) {
                    e.preventDefault();
                    e.stopPropagation();
                    self.trigger("selectPrevPage");
                }
            })
            .on("click", ".close", function () {
                self.close();
            });

        if (!this._options.multifile) {
            this._addShortcutToTooltip($("#find-next"), Commands.CMD_FIND_NEXT);
            this._addShortcutToTooltip($("#find-prev"), Commands.CMD_FIND_PREVIOUS);
            $root
                .on("click", "#find-next", function (e) {
                    self.trigger("doFind", false);
                })
                .on("click", "#find-prev", function (e) {
                    self.trigger("doFind", true);
                });
        }

        if (this._options.replace) {
            this._addShortcutToTooltip($("#replace-yes"), Commands.CMD_REPLACE);
            $root
                .on("click", "#replace-yes", function (e) {
                    self.trigger("doReplace");
                })
                .on("click", "#replace-batch", function (e) {
                    self.trigger("doReplaceBatch");
                })
                .on("click", "#replace-all", function (e) {
                    self.trigger("doReplaceAll");
                })
                // One-off hack to make Find/Replace fields a self-contained tab cycle
                // TODO: remove once https://trello.com/c/lTSJgOS2 implemented
                .on("keydown", function (e) {
                    if (e.keyCode === KeyEvent.DOM_VK_TAB && !e.ctrlKey && !e.metaKey && !e.altKey) {
                        if (e.target.id === "replace-with" && !e.shiftKey) {
                            self.$("#find-what").focus();
                            e.preventDefault();
                        } else if (e.target.id === "find-what" && e.shiftKey) {
                            self.$("#replace-with").focus();
                            e.preventDefault();
                        }
                    }
                });
        }

        if (this._options.multifile && FindUtils.isIndexingInProgress()) {
            this.showIndexingSpinner();
        }

        // Set up the initial UI state.
        this._updateSearchBarFromPrefs();
        this.focusQuery();
    };

    FindBar.prototype._showHintsInternal = function (positionElement, inputElemId, stateVarName, fieldName, dontFilterHistory) {
        const self = this;
        self._dontFilterHistory = dontFilterHistory;
        let inputField = self.$(inputElemId);
        const maxCount = PreferencesManager.get(PREF_MAX_HISTORY);
        this[fieldName] = new QuickSearchField(inputField, {
            verticalAdjust: inputField.offset().top > 0 ? 0 : this._modalBar.getRoot().outerHeight(),
            maxResults: maxCount,
            firstHighlightIndex: null,
            $positionEl: positionElement ? self.$(positionElement) : null,
            resultProvider: function (query) {
                query = query || "";
                const asyncResult = new $.Deferred();
                let history = PreferencesManager.getViewState(stateVarName) || [];
                if (!self._dontFilterHistory) {
                    history = history.filter(historyItem => {
                        return ((typeof historyItem === 'string') &&
                            historyItem.toLowerCase().includes(query.toLowerCase()));
                    });
                }
                self._dontFilterHistory = false;
                asyncResult.resolve(history);
                return asyncResult.promise();
            },
            formatter: function (item, query) {
                const $li = $("<li></li>");
                $li.text(item);
                return $li;
            },
            onCommit: function (selectedItem, query, itemIndex) {
                if (selectedItem) {
                    self.$(inputElemId).val(selectedItem);
                    self.$(inputElemId).val(selectedItem).trigger('input');
                } else if (query.length) {
                    self[fieldName].setText(query);
                }
                self.$(inputElemId).focus();
                self[fieldName].destroy();
                self[fieldName] = null;
                // now move the committed item to top of history as its most recent
                if (itemIndex) {
                    let history = PreferencesManager.getViewState(stateVarName) || [];
                    let deletedItem = history.splice(itemIndex, 1);
                    history.unshift(deletedItem[0]);
                    PreferencesManager.setViewState(stateVarName, history);
                }
            },
            onDismiss: function () {
                if (self[fieldName]) {
                    self[fieldName].destroy();
                    self[fieldName] = null;
                }
            },
            onDelete: function (deletedIndex) {
                let history = PreferencesManager.getViewState(stateVarName) || [];
                history.splice(deletedIndex, 1);
                PreferencesManager.setViewState(stateVarName, history);
            },
            onHighlight: function (selectedItem, query, explicit) { },
            highlightZeroResults: false,
            focusLastActiveElementOnClose: true
        });
        this[fieldName].setText(inputField.val());
    };

    /**
     * @private
     * Shows the search History in dropdown.
     */
    FindBar.prototype.showSearchHints = function (dontFilterHistory) {
        return this._showHintsInternal(".find-what-wrapper", "#find-what", "searchHistory", "searchField", dontFilterHistory);
    };

    /**
     * @private
     * Shows the filter History in dropdown.
     */
    FindBar.prototype.showFilterHints = function (dontFilterHistory) {
        return this._showHintsInternal(null, "#fif-filter-input", "filterHistory", "filterField", dontFilterHistory);
    };

    /**
     * Closes this Find bar. If already closed, does nothing.
     * @param {boolean} suppressAnimation If true, don't do the standard closing animation. Default false.
     */
    FindBar.prototype.close = function (suppressAnimation) {
        lastQueriedText = "";
        if (this._modalBar) {
            lastClosedQuery = {
                query: this.$("#find-what").val() || "",
                replaceText: this.getReplaceText(),
                isCaseSensitive: this.$("#find-case-sensitive").is(".active"),
                isRegexp: this.$("#find-regexp").is(".active")
            };
            this._addElementToSearchHistory($("#find-what").val(), $("#fif-filter-input").val());
            // 1st arg = restore scroll pos; 2nd arg = no animation, since getting replaced immediately
            this._modalBar.close(true, !suppressAnimation);
        }
    };

    /**
     * @return {boolean} true if this FindBar has been closed.
     */
    FindBar.prototype.isClosed = function () {
        return this._closed;
    };

    /**
     * @return {Object} The options passed into the FindBar.
     */
    FindBar.prototype.getOptions = function () {
        return this._options;
    };

    /**
     * Returns the current query and parameters.
     * @return {{query: string, caseSensitive: boolean, isRegexp: boolean}}
     */
    FindBar.prototype.getQueryInfo = function (usePlatformLineEndings = true) {
        const $findWhat = this.$("#find-what");
        const findTextArea = $findWhat[0];
        let query = $findWhat.val() || "";
        const lineEndings = FileUtils.sniffLineEndings(query);
        if (usePlatformLineEndings && lineEndings === FileUtils.LINE_ENDINGS_LF && brackets.platform === "win") {
            query = query.replace(/\n/g, "\r\n");
        }
        return {
            query: query,
            isCaseSensitive: this.$("#find-case-sensitive").is(".active"),
            isRegexp: this.$("#find-regexp").is(".active"),
            isQueryTextSelected: findTextArea.selectionStart !== findTextArea.selectionEnd
        };
    };

    /**
     * Show or clear an error message related to the query.
     * @param {?string} error The error message to show, or null to hide the error display.
     * @param {boolean=} isHTML Whether the error message is HTML that should remain unescaped.
     * @param {boolean=} isFilterError Whether the error related to file filters
     */
    FindBar.prototype.showError = function (error, isHTML, isFilterError) {
        const $findError = this.$(".error"),
            $filterError = this.$(".error-filter");
        const $error = isFilterError ? $filterError : $findError;
        $findError.hide();
        $filterError.hide();
        if (error) {
            if (isHTML) {
                $error.html(error);
            } else {
                $error.text(error);
            }
            $error.show();
        }
    };

    /**
     * Set the find count.
     * @param {string} count The find count message to show. Can be the empty string to hide it.
     */
    FindBar.prototype.showFindCount = function (count) {
        this.$("#find-counter")
            .text(count)
            .attr('title', count);
    };

    /**
     * Show or hide the no-results indicator and optional message. This is also used to
     * indicate regular expression errors.
     * @param {boolean} showIndicator
     * @param {boolean} showMessage
     */
    FindBar.prototype.showNoResults = function (showIndicator, showMessage) {
        const $filterInput = this.$("#fif-filter-input");
        const $findWhat = this.$(".find-what-wrapper");
        $filterInput.removeClass("no-results");
        $findWhat.removeClass("no-results");
        let $borderEl = $findWhat;
        if ($filterInput.is(":focus")) {
            $borderEl = $filterInput;
        }
        ViewUtils.toggleClass($borderEl, "no-results", showIndicator);

        const noResultsMessage = showMessage ? Strings.FIND_NO_RESULTS : "";
        this.showFindCount(noResultsMessage);
    };

    /**
     * Returns the current replace text.
     * @return {string}
     */
    FindBar.prototype.getReplaceText = function () {
        return this.$("#replace-with").val() || "";
    };

    /**
     * Enables or disables the controls in the Find bar. Note that if enable is true, *all* controls will be
     * re-enabled, even if some were previously disabled using enableNavigation() or enableReplace(), so you
     * will need to refresh their enable state after calling this.
     * @param {boolean} enable Whether to enable or disable the controls.
     */
    FindBar.prototype.enable = function (enable) {
        this.$("#find-what, #replace-with, #find-prev, #find-next, #find-case-sensitive, #find-regexp").prop("disabled", !enable);
        this._enabled = enable;
    };

    FindBar.prototype.focus = function (enable) {
        if (!this.$("#fif-filter-input").is(':focus')) {
            // the filter find bar text input already has focus
            this.$("#find-what").focus();
        }
    };

    /**
     * @return {boolean} true if the FindBar is enabled.
     */
    FindBar.prototype.isEnabled = function () {
        return this._enabled;
    };

    /**
     * @return {boolean} true if the Replace button is enabled.
     */
    FindBar.prototype.isReplaceEnabled = function () {
        return this.$("#replace-yes").is(":enabled");
    };

    /**
     * Enable or disable the navigation controls if present. Note that if the Find bar is currently disabled
     * (i.e. isEnabled() returns false), this will have no effect.
     * @param {boolean} enable Whether to enable the controls.
     */
    FindBar.prototype.enableNavigation = function (enable) {
        if (this.isEnabled()) {
            this.$("#find-prev, #find-next").prop("disabled", !enable);
        }
    };

    /**
     * Enable or disable the replace controls if present. Note that if the Find bar is currently disabled
     * (i.e. isEnabled() returns false), this will have no effect.
     * @param {boolean} enable Whether to enable the controls.
     */
    FindBar.prototype.enableReplace = function (enable) {
        if (this.isEnabled) {
            this.$("#replace-yes, #replace-batch, #replace-all").prop("disabled", !enable);
        }
    };

    /**
     * @private
     * Focus and select the contents of the given field.
     * @param {string} selector The selector for the field.
     */
    FindBar.prototype._focus = function (selector) {
        this.$(selector)
            .focus()
            .get(0).select();
    };

    /**
     * Sets focus to the query field and selects its text.
     */
    FindBar.prototype.focusQuery = function () {
        this._focus("#find-what");
    };

    /**
     * Sets focus to the replace field and selects its text.
     */
    FindBar.prototype.focusReplace = function () {
        this._focus("#replace-with");
    };

    /**
     * The indexing spinner is usually shown when node is indexing files
     */
    FindBar.prototype.showIndexingSpinner = function () {
        this.$("#indexing-spinner").removeClass("forced-hidden");
        this.setIndexingMessage(Strings.FIND_IN_FILES_INDEXING);
    };

    FindBar.prototype.setIndexingMessage = function (message) {
        this.$("#indexing-spinner-message").text(message);
    };

    FindBar.prototype.hideIndexingSpinner = function () {
        this.$("#indexing-spinner").addClass("forced-hidden");
    };

    /**
     * Force a search again
     */
    FindBar.prototype.redoInstantSearch = function () {
        this.trigger("doFind");
    };

    /**
     * Returns the string used to prepopulate the find bar
     * @private
     * @param {!Editor} editor
     * @return {string} first line of primary selection to populate the find bar
     */
    FindBar._getInitialQueryFromSelection = function (editor) {
        const selectionText = editor.document.getSelectedText(true);
        if (selectionText) {
            return selectionText
                .replace(/^\n*/, ""); // Trim possible newlines at the very beginning of the selection
        }
        return "";
    };

    /**
     * Retrieves the appropriate query and replacement text to prepopulate the Find Bar.
     * @private
     * @static
     * @param {?FindBar} currentFindBar - The currently open Find Bar, if any.
     * @param {?Editor} editor - The active editor, if any.
     * @return {{query: string, replaceText: string}} An object containing the query and replacement text
     *     to prepopulate the Find Bar.
     */
    FindBar.getInitialQuery = function (currentFindBar, editor) {
        var query,
            selection = editor ? FindBar._getInitialQueryFromSelection(editor) : "",
            replaceText = "";

        if (currentFindBar && !currentFindBar.isClosed()) {
            // The modalBar was already up. When creating the new modalBar, copy the
            // current query instead of using the passed-in selected text.
            var queryInfo = currentFindBar.getQueryInfo();
            query = (!queryInfo.isRegexp && selection) || queryInfo.query;
            replaceText = currentFindBar.getReplaceText();
        } else {
            var openedFindBar = FindBar._bars && _.find(FindBar._bars,
                function (bar) {
                    return !bar.isClosed();
                }
            );
            // this happens when the find in files bar is opened and we are trying to open single file search or
            // vice versa. we need to detect the other findbar and determine what is the search term to use

            //debugger
            const currentQueryInfo = openedFindBar && openedFindBar.getQueryInfo();
            if(!openedFindBar && selection){
                // when no findbar is open, the selected text always takes precedence in both single and multi file
                query = selection;
            } else if(openedFindBar && selection && currentQueryInfo && !currentQueryInfo.isRegexp && currentQueryInfo.isQueryTextSelected) {
                // we are switching between single<>multi file search without the user editing the search text in between
                // while there is an active selection, the selection takes precedence.
                query = selection;
                replaceText = openedFindBar.getReplaceText();
            } else if (openedFindBar) {
                // there is no selection and we are switching between single<>multi file search, copy the
                // current query from the open findbar as is
                query = openedFindBar.getQueryInfo().query;
                replaceText = openedFindBar.getReplaceText();
            }  else if (lastClosedQuery) {
                // these is no open find bar currently and there is no selection, but there is a last saved query, so
                // load the last query. this happenes on all freash search cases apart from the very first time
                query = lastClosedQuery.query;
                replaceText = lastClosedQuery.replaceText;
            } else if (editor) {
                // the very first query after app start, nothing to restore.
                query = (!lastTypedTextWasRegexp && selection) || lastQueriedText || lastTypedText;
            }
        }

        return { query: query, replaceText: replaceText };
    };

    PreferencesManager.stateManager.definePreference("caseSensitive", "boolean", false);
    PreferencesManager.stateManager.definePreference("regexp", "boolean", false);
    PreferencesManager.stateManager.definePreference("searchHistory", "array", []);
    PreferencesManager.stateManager.definePreference("filterHistory", "array", []);
    PreferencesManager.definePreference(PREF_MAX_HISTORY, "number", MAX_HISTORY_RESULTS, {
        description: Strings.FIND_HISTORY_MAX_COUNT
    });

    exports.FindBar = FindBar;
});
