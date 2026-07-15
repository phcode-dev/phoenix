define(function (require) {

    // Brackets modules
    var _ = brackets.getModule("thirdparty/lodash"),
        DocumentManager = brackets.getModule("document/DocumentManager"),
        FileUtils = brackets.getModule("file/FileUtils"),
        LocalizationUtils = brackets.getModule("utils/LocalizationUtils"),
        Strings = brackets.getModule("strings"),
        Metrics = brackets.getModule("utils/Metrics"),
        NotificationUI = brackets.getModule("widgets/NotificationUI"),
        Mustache = brackets.getModule("thirdparty/mustache/mustache");

    // Local modules
    const ErrorHandler = require("src/ErrorHandler"),
        Events = require("src/Events"),
        EventEmitter = require("src/EventEmitter"),
        Git = require("src/git/Git"),
        HistoryViewer = require("src/HistoryViewer"),
        Preferences = require("src/Preferences");

    // Templates
    var gitPanelHistoryTemplate = require("text!templates/git-panel-history.html"),
        gitPanelHistoryCommitsTemplate = require("text!templates/git-panel-history-commits.html");

    // Module variables
    let $gitPanel         = $(null),
        $tableContainer   = $(null),
        $historyList      = $(null),
        commitCache       = [],
        lastDocumentSeen  = null;

    // must match the page size git log is invoked with in GitCli.getHistory
    const HISTORY_PAGE_SIZE = 100;

    // guards against an older async render/load overwriting a newer one
    let historyRenderId = 0,
        loadingMoreHistory = false;

    // Implementation

    function initVariables() {
        $gitPanel = $("#git-panel");
        $tableContainer = $gitPanel.find(".table-container");
        attachHandlers();
    }

    function attachHandlers() {
        $tableContainer
            .off(".history")
            .on("scroll.history", function () {
                loadMoreHistory();
            })
            .on("click.history", ".history-commit", function () {
                const $tr = $(this);
                var hash = $tr.attr("x-hash");
                var commit = _.find(commitCache, function (commit) { return commit.hash === hash; });
                const historyShown = HistoryViewer.toggle(commit, getCurrentDocument(), {
                    isInitial: $(this).attr("x-initial-commit") === "true"
                });
                $tr.parent().find("tr.selected").removeClass("selected");
                if(historyShown){
                    $tr.addClass("selected");
                }
            });
    }

    var generateCssAvatar = _.memoize(function (author, email) {

        // Original source: http://indiegamr.com/generate-repeatable-random-numbers-in-js/
        var seededRandom = function (max, min, seed) {
            max = max || 1;
            min = min || 0;

            seed = (seed * 9301 + 49297) % 233280;
            var rnd = seed / 233280.0;

            return min + rnd * (max - min);
        };

        // Use `seededRandom()` to generate a pseudo-random number [0-16] to pick a color from the list
        var seedBase = parseInt(author.charCodeAt(3).toString(), email.length),
            seed = parseInt(email.charCodeAt(seedBase.toString().substring(1, 2)).toString(), 16),
            colors = [
                "#ffb13b", "#dd5f7a", "#8dd43a", "#2f7e2f", "#4141b9", "#3dafea", "#7e3e3e", "#f2f26b",
                "#864ba3", "#ac8aef", "#f2f2ce", "#379d9d", "#ff6750", "#8691a2", "#d2fd8d", "#88eadf"
            ],
            texts = [
                "#FEFEFE", "#FEFEFE", "#FEFEFE", "#FEFEFE", "#FEFEFE", "#FEFEFE", "#FEFEFE", "#333333",
                "#FEFEFE", "#FEFEFE", "#333333", "#FEFEFE", "#FEFEFE", "#FEFEFE", "#333333", "#333333"
            ],
            picked = Math.floor(seededRandom(0, 16, seed));

        return "background-color: " + colors[picked] + "; color: " + texts[picked];

    }, function (author, email) {
        // calculate hash for memoize - both are strings so we don't need to convert
        return author + email;
    });

    function _renderHistoryTable(commits, file) {
        // calculate some missing stuff like avatars
        commits = addAdditionalCommitInfo(commits);
        commitCache = commitCache.concat(commits);

        const templateData = {
            commits: commits,
            emptyMessage: file ? Strings.GIT_FILE_HISTORY_NOTHING_TO_SHOW : Strings.GIT_HISTORY_NOTHING_TO_SHOW,
            Strings: Strings
        };

        $tableContainer.find("#git-history-list").remove();
        $tableContainer.append(Mustache.render(gitPanelHistoryTemplate, templateData, {
            commits: gitPanelHistoryCommitsTemplate
        }));

        $historyList = $tableContainer.find("#git-history-list")
            .data("file", file ? file.absolute : null)
            .data("file-relative", file ? file.relative : null);

        if (commits.length < HISTORY_PAGE_SIZE) {
            // the full history is already here, so the last commit is the initial
            // one. with more pages the initial commit is marked by loadMoreHistory.
            $historyList.attr("x-finished", "true");
            $historyList
                .find("tr.history-commit:last-child")
                .attr("x-initial-commit", "true");
        }
    }

    // Render history list the first time. resolves to false when rendering failed.
    function renderHistory(file) {
        const renderId = ++historyRenderId;

        // clear cache
        commitCache = [];

        return Git.getCurrentBranchName().then(function (branchName) {
            // Get the history commits of the current branch
            var p = file ? Git.getFileHistory(file.relative, branchName) : Git.getHistory(branchName);
            return p.then(function (commits) {
                if (renderId === historyRenderId) {
                    _renderHistoryTable(commits, file);
                }
                return true;
            });
        }).catch(function (err) {
            if (renderId !== historyRenderId) {
                return true;
            }
            // "bad revision"/"unknown revision" mean the branch has no commit
            // yet (freshly initialized repository), so there is just no history
            // to show and that is not an error
            if (ErrorHandler.contains(err, "bad revision") || ErrorHandler.contains(err, "unknown revision")) {
                _renderHistoryTable([], file);
                return true;
            }
            ErrorHandler.showError(err, Strings.ERROR_GET_HISTORY);
            return false;
        });
    }

    // Load more rows in the history list on scroll
    function loadMoreHistory() {
        if ($historyList.is(":visible")) {
            // 2px tolerance as scroll positions can be fractional on scaled displays
            if (($tableContainer.prop("scrollHeight") - $tableContainer.scrollTop()) <= $tableContainer.height() + 2) {
                if (loadingMoreHistory || $historyList.attr("x-finished") === "true") {
                    return;
                }
                loadingMoreHistory = true;
                const renderId = historyRenderId;
                return Git.getCurrentBranchName().then(function (branchName) {
                    var p,
                        file = $historyList.data("file-relative"),
                        skipCount = $tableContainer.find("tr.history-commit").length;
                    if (file) {
                        p = Git.getFileHistory(file, branchName, skipCount);
                    } else {
                        p = Git.getHistory(branchName, skipCount);
                    }
                    return p.then(function (commits) {
                        if (renderId !== historyRenderId) {
                            // the list was re-rendered while this page was loading
                            return;
                        }
                        if (commits.length === 0) {
                            $historyList.attr("x-finished", "true");
                            // marks initial commit as first
                            $historyList
                                .find("tr.history-commit:last-child")
                                .attr("x-initial-commit", "true");
                            return;
                        }

                        commits = addAdditionalCommitInfo(commits);
                        commitCache = commitCache.concat(commits);

                        var templateData = {
                            commits: commits,
                            Strings: Strings
                        };
                        var commitsHtml = Mustache.render(gitPanelHistoryCommitsTemplate, templateData);
                        $historyList.children("tbody").append(commitsHtml);
                    })
                    .catch(function (err) {
                        ErrorHandler.showError(err, Strings.ERROR_GET_MORE_HISTORY);
                    });
                })
                .catch(function (err) {
                    ErrorHandler.showError(err, Strings.ERROR_GET_CURRENT_BRANCH);
                })
                .finally(function () {
                    loadingMoreHistory = false;
                });
            }
        }
    }

    function addAdditionalCommitInfo(commits) {
        _.forEach(commits, function (commit) {

            commit.cssAvatar = generateCssAvatar(commit.author, commit.email);
            commit.avatarLetter = commit.author.substring(0, 1);

            const dateTime = new Date(commit.date);
            if (isNaN(dateTime.getTime())) {
                // we got invalid date, use the original date itself
                commit.date = {
                    title: commit.date,
                    shown: commit.date
                };
            } else {
                commit.date = {
                    title: LocalizationUtils.getFormattedDateTime(dateTime),
                    shown: LocalizationUtils.dateTimeFromNowFriendly(dateTime)
                };
            }
            commit.hasTag = !!commit.tags;
        });

        return commits;
    }

    function getCurrentDocument() {
        if (HistoryViewer.isVisible()) {
            return lastDocumentSeen;
        }
        var doc = DocumentManager.getCurrentDocument();
        if (doc) {
            lastDocumentSeen = doc;
        }
        // no fallback to lastDocumentSeen here: when no document is open, file
        // history must not stick to a file the user has already closed
        return doc;
    }

    function _showFileHistoryToast(message) {
        NotificationUI.createToastFromTemplate(Strings.GIT_SHOW_FILE_HISTORY,
            "<div>" + _.escape(message) + "</div>", {
                toastStyle: NotificationUI.NOTIFICATION_STYLES_CSS_CLASS.INFO,
                autoCloseTimeS: 15,
                instantOpen: true
            });
    }

    function handleFileChange() {
        var currentDocument = getCurrentDocument();

        if ($historyList.is(":visible") && $historyList.data("file")) {
            handleToggleHistory("FILE", currentDocument);
        }
        $gitPanel.find(".git-file-history").prop("disabled", !currentDocument);
    }

    // Show or hide the history list on click of .history button
    // newHistoryMode can be "FILE", "GLOBAL" or "REFRESH"
    function handleToggleHistory(newHistoryMode, newDocument) {
        // this is here to check that $historyList is still attached to the DOM
        $historyList = $tableContainer.find("#git-history-list");

        let historyEnabled = $historyList.is(":visible"),
            currentFile = $historyList.data("file") || null,
            currentHistoryMode = historyEnabled ? (currentFile ? "FILE" : "GLOBAL") : "DISABLED",
            doc = newDocument ? newDocument : getCurrentDocument(),
            file;

        // Variables to store scroll positions (only used for REFRESH case)
        let savedScrollTop, savedScrollLeft, selectedCommitHash;
        let isRefresh = false;
        if(newHistoryMode === "REFRESH"){
            newHistoryMode = currentHistoryMode;
            isRefresh = true;
            historyEnabled = true;
            // Save current scroll positions before removing the list
            if ($historyList.length > 0) {
                savedScrollTop = $historyList.parent().scrollTop();
                savedScrollLeft = $historyList.parent().scrollLeft();
                selectedCommitHash = $historyList.find(".selected").attr("x-hash");
            }
        } else if (currentHistoryMode !== newHistoryMode) {
            // we are switching the modes so enable
            historyEnabled = true;
        } else if (!newDocument) {
            // we are not changing the mode and we are not switching to a new document
            historyEnabled = !historyEnabled;
        }

        if (historyEnabled && newHistoryMode === "FILE") {
            if (doc && doc.file) {
                file = {};
                file.absolute = doc.file.fullPath;
                file.relative = FileUtils.getRelativeFilename(Preferences.get("currentGitRoot"), file.absolute);
                if (!file.relative) {
                    // the file is not inside the repository, so it has no history
                    historyEnabled = false;
                    file = null;
                }
            } else {
                // we want a file history but no file was found
                historyEnabled = false;
            }
        }

        // Render #git-history-list if is not already generated or if the viewed file for file history has changed
        var isEmpty = $historyList.find("tr").length === 0,
            fileChanged = currentFile !== (file ? file.absolute : null);
        if (historyEnabled && (isEmpty || fileChanged || isRefresh)) {
            if ($historyList.length > 0) {
                $historyList.remove();
            }
            var $spinner = $("<div class='spinner spin large'></div>").appendTo($gitPanel);
            renderHistory(file).then(function (rendered) {
                $spinner.remove();
                if (!rendered) {
                    // rendering failed, go back to the changes view instead of
                    // leaving an empty table container behind
                    $tableContainer.find(".git-edited-list").show();
                    $gitPanel.find(".git-history-toggle").removeClass("active")
                        .attr("title", Strings.TOOLTIP_SHOW_HISTORY);
                    $gitPanel.find(".git-file-history").removeClass("active")
                        .attr("title", Strings.TOOLTIP_SHOW_FILE_HISTORY);
                    Git.status();
                    return;
                }
                if (isRefresh) {
                    // After rendering, we need to fetch the newly created #git-history-list
                    let $newHistoryList = $tableContainer.find("#git-history-list");
                    // Restore the scroll position
                    $newHistoryList.parent().scrollTop(savedScrollTop || 0);
                    $newHistoryList.parent().scrollLeft(savedScrollLeft || 0);
                    $historyList.find(`[x-hash="${selectedCommitHash}"]`).addClass("selected");
                }
            });
        }

        // disable commit button when viewing history
        // refresh status when history is closed and commit button will correct its disabled state if required
        if (historyEnabled) {
            $gitPanel.find(".git-commit, .check-all").prop("disabled", true);
        } else {
            Git.status();
        }

        // Toggle visibility of .git-edited-list and #git-history-list
        $tableContainer.find(".git-edited-list").toggle(!historyEnabled);
        $historyList.toggle(historyEnabled);

        if (!historyEnabled) { HistoryViewer.hide(); }

        // Toggle history button
        var globalButtonActive  = historyEnabled && newHistoryMode === "GLOBAL",
            fileButtonActive    = historyEnabled && newHistoryMode === "FILE";
        $gitPanel.find(".git-history-toggle").toggleClass("active", globalButtonActive)
            .attr("title", globalButtonActive ? Strings.TOOLTIP_HIDE_HISTORY : Strings.TOOLTIP_SHOW_HISTORY);
        $gitPanel.find(".git-file-history").toggleClass("active", fileButtonActive)
            .attr("title", fileButtonActive ? Strings.TOOLTIP_HIDE_FILE_HISTORY : Strings.TOOLTIP_SHOW_FILE_HISTORY);
    }

    // Event listeners
    EventEmitter.on(Events.GIT_ENABLED, function () {
        initVariables();
    });
    EventEmitter.on(Events.GIT_DISABLED, function () {
        // invalidate any render still in flight so it can't repopulate the panel
        historyRenderId++;
        lastDocumentSeen = null;
        $historyList.remove();
        $historyList = $();
    });
    EventEmitter.on(Events.HISTORY_SHOW_FILE, function () {
        Metrics.countEvent(Metrics.EVENT_TYPE.GIT, 'panel', "fileHistory");
        const doc = getCurrentDocument();
        if (!doc || !doc.file) {
            _showFileHistoryToast(Strings.GIT_FILE_HISTORY_OPEN_A_FILE);
            return;
        }
        if (!FileUtils.getRelativeFilename(Preferences.get("currentGitRoot"), doc.file.fullPath)) {
            _showFileHistoryToast(Strings.GIT_FILE_HISTORY_NOT_IN_REPO);
            return;
        }
        handleToggleHistory("FILE");
    });
    EventEmitter.on(Events.HISTORY_SHOW_GLOBAL, function () {
        handleToggleHistory("GLOBAL");
        Metrics.countEvent(Metrics.EVENT_TYPE.GIT, 'panel', "history");
    });
    EventEmitter.on(Events.REFRESH_HISTORY, function () {
        handleToggleHistory("REFRESH");
    });
    EventEmitter.on(Events.BRACKETS_CURRENT_DOCUMENT_CHANGE, function () {
        handleFileChange();
    });

});
