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

define(function (require, exports, module) {


    var AppInit                     = require("utils/AppInit"),
        CommandManager              = require("command/CommandManager"),
        MainViewManager             = require("view/MainViewManager"),
        LanguageManager             = require("language/LanguageManager"),
        DocumentManager             = require("document/DocumentManager"),
        Commands                    = require("command/Commands"),
        EditorManager               = require("editor/EditorManager"),
        ProjectManager              = require("project/ProjectManager"),
        ProviderRegistrationHandler = require("features/PriorityBasedRegistration").RegistrationHandler,
        SearchResultsView           = require("search/SearchResultsView").SearchResultsView,
        SearchModel                 = require("search/SearchModel").SearchModel,
        Strings                     = require("strings");

    var _providerRegistrationHandler = new ProviderRegistrationHandler(),
        registerFindReferencesProvider = _providerRegistrationHandler.registerProvider.bind(
            _providerRegistrationHandler
        ),
        removeFindReferencesProvider = _providerRegistrationHandler.removeProvider.bind(_providerRegistrationHandler);

    var searchModel = new SearchModel(),
        _resultsView;

    function _getReferences(provider, hostEditor, pos) {
        var result = new $.Deferred();

        if(!provider) {
            return result.reject();
        }

        provider.getReferences(hostEditor, pos)
            .done(function (rcvdObj) {

                searchModel.results = rcvdObj.results;
                searchModel.numFiles = rcvdObj.numFiles;
                searchModel.numMatches = rcvdObj.numMatches;
                searchModel.allResultsAvailable = true;
                searchModel.setQueryInfo({query: rcvdObj.queryInfo, caseSensitive: true, isRegExp: false});
                result.resolve();
            }).fail(function (){
                result.reject();
            });
        return result.promise();

    }

    function _openReferencesPanel() {
        var editor = EditorManager.getActiveEditor(),
            pos = editor ? editor.getCursorPos() : null,
            referencesPromise,
            result = new $.Deferred(),
            errorMsg = Strings.REFERENCES_NO_RESULTS,
            referencesProvider;

        var language = editor.getLanguageForSelection(),
            enabledProviders = _providerRegistrationHandler.getProvidersForLanguageId(language.getId());

        enabledProviders.some(function (item, index) {
            if (item.provider.hasReferences(editor)) {
                referencesProvider = item.provider;
                return true;
            }
        });

        referencesPromise = _getReferences(referencesProvider, editor, pos);

        // If one of them will provide a widget, show it inline once ready
        if (referencesPromise) {
            referencesPromise.done(function () {
                if(_resultsView) {
                    _resultsView.open();
                }
            }).fail(function () {
                if(_resultsView) {
                    _resultsView.close();
                }
                editor.displayErrorMessageAtCursor(errorMsg);
                result.reject();
            });
        } else {
            if(_resultsView) {
                _resultsView.close();
            }
            editor.displayErrorMessageAtCursor(errorMsg);
            result.reject();
        }

        return result.promise();
    }

    /**
     * @private
     * Clears any previous search information, removing update listeners and clearing the model.
     */
    function _clearSearch() {
        searchModel.clear();
    }

    /**
     * @public
     * Closes the references panel
     */
    function closeReferencesPanel() {
        if (_resultsView) {
            _resultsView.close();
        }
    }

    function setMenuItemStateForLanguage(languageId) {
        CommandManager.get(Commands.CMD_FIND_ALL_REFERENCES).setEnabled(false);
        if (!languageId) {
            var editor = EditorManager.getActiveEditor();
            if (editor) {
                languageId = LanguageManager.getLanguageForPath(editor.document.file._path).getId();
            }
        }
        var enabledProviders = _providerRegistrationHandler.getProvidersForLanguageId(languageId),
            referencesProvider;

        enabledProviders.some(function (item, index) {
            if (item.provider.hasReferences()) {
                referencesProvider = item.provider;
                return true;
            }
        });
        if (referencesProvider) {
            CommandManager.get(Commands.CMD_FIND_ALL_REFERENCES).setEnabled(true);
        }

    }

    MainViewManager.on("currentFileChange", function (event, newFile, newPaneId, oldFile, oldPaneId) {
        if (!newFile) {
            CommandManager.get(Commands.CMD_FIND_ALL_REFERENCES).setEnabled(false);
            return;
        }

        var newFilePath = newFile.fullPath,
            newLanguage = LanguageManager.getLanguageForPath(newFilePath),
            newLanguageId = newLanguage.getId();

        if (newLanguage.isBinary()) {
            CommandManager.get(Commands.CMD_FIND_ALL_REFERENCES).setEnabled(false);
            return;
        }

        setMenuItemStateForLanguage(newLanguageId);

        DocumentManager.getDocumentForPath(newFilePath)
            .done(function (newDoc) {
                newDoc.off("languageChanged.reference-in-files");
                newDoc.on("languageChanged.reference-in-files", function () {
                    var changedLanguageId = LanguageManager.getLanguageForPath(newDoc.file.fullPath).getId();
                    setMenuItemStateForLanguage(changedLanguageId);
                });
            });

        if (!oldFile) {
            return;
        }

        var oldFilePath = oldFile.fullPath;
        DocumentManager.getDocumentForPath(oldFilePath)
            .done(function (oldDoc) {
                oldDoc.off("languageChanged.reference-in-files");
            });
    });

    AppInit.htmlReady(function () {
        _resultsView = new SearchResultsView(
            searchModel,
            "reference-in-files-results",
            "reference-in-files.results",
            "reference"
        );
        if(_resultsView) {
            _resultsView
                .on("close", function () {
                    _clearSearch();
                })
                .on("getNextPage", function () {
                    if (searchModel.hasResults()) {
                        _resultsView.showNextPage();
                    }
                })
                .on("getLastPage", function () {
                    if (searchModel.hasResults()) {
                        _resultsView.showLastPage();
                    }
                });
        }
    });

    // Initialize: register listeners
    ProjectManager.on("beforeProjectClose", function () { if (_resultsView) { _resultsView.close(); } });

    CommandManager.register(Strings.FIND_ALL_REFERENCES, Commands.CMD_FIND_ALL_REFERENCES, _openReferencesPanel);
    CommandManager.get(Commands.CMD_FIND_ALL_REFERENCES).setEnabled(false);

    exports.registerFindReferencesProvider    = registerFindReferencesProvider;
    exports.removeFindReferencesProvider      = removeFindReferencesProvider;
    exports.setMenuItemStateForLanguage       = setMenuItemStateForLanguage;
    exports.closeReferencesPanel              = closeReferencesPanel;
});
