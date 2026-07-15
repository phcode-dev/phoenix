define(function (require, exports) {

    var _                       = brackets.getModule("thirdparty/lodash"),
        CommandManager          = brackets.getModule("command/CommandManager"),
        Dialogs                 = brackets.getModule("widgets/Dialogs"),
        EditorManager           = brackets.getModule("editor/EditorManager"),
        FileSyncManager         = brackets.getModule("project/FileSyncManager"),
        FileSystem              = brackets.getModule("filesystem/FileSystem"),
        Menus                   = brackets.getModule("command/Menus"),
        Mustache                = brackets.getModule("thirdparty/mustache/mustache"),
        PopUpManager            = brackets.getModule("widgets/PopUpManager"),
        StringUtils             = brackets.getModule("utils/StringUtils"),
        DocumentManager         = brackets.getModule("document/DocumentManager"),
        Strings                 = brackets.getModule("strings"),
        Metrics                 = brackets.getModule("utils/Metrics"),
        MainViewManager         = brackets.getModule("view/MainViewManager");

    var Git                     = require("src/git/Git"),
        Events                  = require("src/Events"),
        EventEmitter            = require("src/EventEmitter"),
        ErrorHandler            = require("src/ErrorHandler"),
        Panel                   = require("src/Panel"),
        Setup                   = require("src/utils/Setup"),
        Preferences             = require("src/Preferences"),
        ProgressDialog          = require("src/dialogs/Progress"),
        Utils                   = require("src/Utils"),
        branchesMenuTemplate    = require("text!templates/git-branches-menu.html"),
        newBranchTemplate       = require("text!templates/branch-new-dialog.html"),
        mergeBranchTemplate     = require("text!templates/branch-merge-dialog.html");

    var $gitBranchName          = $(null),
        currentEditor,
        $dropdown;

    let lastRenderedBranchName = null;
    let $dropdownAnchor = null;

    function renderList(branches) {
        branches = branches.map(function (name) {
            return {
                name: name,
                currentBranch: name.indexOf("* ") === 0,
                canDelete: name !== "master"
            };
        });
        var templateVars  = {
            branchList: _.filter(branches, function (o) { return !o.currentBranch; }),
            Strings:    Strings
        };
        return Mustache.render(branchesMenuTemplate, templateVars);
    }

    function closeDropdown() {
        if ($dropdown) {
            PopUpManager.removePopUp($dropdown);
        }
        detachCloseEvents();
    }

    function doMerge(fromBranch) {
        Git.getBranches().then(function (branches) {

            var compiledTemplate = Mustache.render(mergeBranchTemplate, {
                fromBranch: fromBranch,
                branches: branches,
                Strings: Strings
            });

            var dialog  = Dialogs.showModalDialogUsingTemplate(compiledTemplate);
            var $dialog = dialog.getElement();
            $dialog.find("input").focus();

            var $toBranch = $dialog.find("[name='branch-target']");
            var $useRebase = $dialog.find("[name='use-rebase']");
            var $useNoff = $dialog.find("[name='use-noff']");

            if (fromBranch === "master") {
                $useRebase.prop("checked", true);
            }
            if ($toBranch.val() === "master") {
                $useRebase.prop("checked", false).prop("disabled", true);
            }

            // fill merge message if possible
            var $mergeMessage = $dialog.find("[name='merge-message']");
            $mergeMessage.attr("placeholder", "Merge branch '" + fromBranch + "'");
            $dialog.find(".fill-pr").on("click", function () {
                var prMsg = "Merge pull request #??? from " + fromBranch;
                $mergeMessage.val(prMsg);
                $mergeMessage[0].setSelectionRange(prMsg.indexOf("???"), prMsg.indexOf("???") + 3);
            });

            // can't use rebase and no-ff together so have a change handler for this
            $useRebase.on("change", function () {
                var useRebase = $useRebase.prop("checked");
                $useNoff.prop("disabled", useRebase);
                if (useRebase) { $useNoff.prop("checked", false); }
            }).trigger("change");

            dialog.done(function (buttonId) {
                // right now only merge to current branch without any configuration
                // later delete merge branch and so ...
                var useRebase = $useRebase.prop("checked");
                var useNoff = $useNoff.prop("checked");
                var mergeMsg = $mergeMessage.val();

                if (buttonId === "ok") {

                    if (useRebase) {

                        Git.rebaseInit(fromBranch).catch(function (err) {
                            Metrics.countEvent(Metrics.EVENT_TYPE.GIT, 'rebase', "fail");
                            throw ErrorHandler.showError(err, Strings.ERROR_REBASE_FAILED);
                        }).then(function (stdout) {
                            Metrics.countEvent(Metrics.EVENT_TYPE.GIT, 'rebase', "success");
                            Utils.showOutput(stdout || Strings.GIT_REBASE_SUCCESS, Strings.REBASE_RESULT).finally(function () {
                                EventEmitter.emit(Events.REFRESH_ALL);
                            });
                        }).catch(console.error);
                    } else {

                        Git.mergeBranch(fromBranch, mergeMsg, useNoff).catch(function (err) {
                            Metrics.countEvent(Metrics.EVENT_TYPE.GIT, 'merge', "fail");
                            throw ErrorHandler.showError(err, Strings.ERROR_MERGE_FAILED);
                        }).then(function (stdout) {
                            Metrics.countEvent(Metrics.EVENT_TYPE.GIT, 'merge', "success");
                            Utils.showOutput(stdout || Strings.GIT_MERGE_SUCCESS, Strings.MERGE_RESULT).finally(function () {
                                EventEmitter.emit(Events.REFRESH_ALL);
                            });
                        }).catch(console.error);
                    }
                }
            });
        }).catch(err => {
            console.error("Error Getting branches", err);
            // we need to strip all user entered info from git thrown exception for get branches which shouldn't fail,
            // so we throw a blank error for bugsnag
            throw new Error("Failed to get getBranches while doMerge");
        });
    }

    function _reloadBranchSelect($el, branches) {
        var template = "{{#branches}}<option value='{{name}}' remote='{{remote}}' " +
            "{{#currentBranch}}selected{{/currentBranch}}>{{name}}</option>{{/branches}}";
        var html = Mustache.render(template, { branches: branches });
        $el.html(html);
    }

    function closeNotExistingFiles(oldBranchName, newBranchName) {
        return Git.getDeletedFiles(oldBranchName, newBranchName).then(function (deletedFiles) {

            var gitRoot     = Preferences.get("currentGitRoot"),
                openedFiles = MainViewManager.getWorkingSet(MainViewManager.ALL_PANES);

            // Close files that does not exists anymore in the new selected branch
            deletedFiles.forEach(function (dFile) {
                var oFile = _.find(openedFiles, function (oFile) {
                    return oFile.fullPath === gitRoot + dFile;
                });
                if (oFile) {
                    DocumentManager.closeFullEditor(oFile);
                }
            });

            EventEmitter.emit(Events.REFRESH_ALL);

        }).catch(function (err) {
            ErrorHandler.showError(err, Strings.ERROR_GETTING_DELETED_FILES);
        });
    }

    function handleEvents() {
        $dropdown.on("click", "a.git-branch-new", function (e) {
            e.stopPropagation();
            closeDropdown();

            Git.getAllBranches().catch(function (err) {
                ErrorHandler.showError(err);
            }).then(function (branches = []) {

                var compiledTemplate = Mustache.render(newBranchTemplate, {
                    branches: branches,
                    Strings: Strings
                });

                var dialog  = Dialogs.showModalDialogUsingTemplate(compiledTemplate);

                var $input  = dialog.getElement().find("[name='branch-name']"),
                    $select = dialog.getElement().find(".branchSelect");

                $select.on("change", function () {
                    if (!$input.val()) {
                        var $opt = $select.find(":selected"),
                            remote = $opt.attr("remote"),
                            newVal = $opt.val();
                        if (remote) {
                            newVal = newVal.substring(remote.length + 1);
                            if (remote !== "origin") {
                                newVal = remote + "#" + newVal;
                            }
                        }
                        $input.val(newVal);
                    }
                });

                _reloadBranchSelect($select, branches);
                dialog.getElement().find(".fetchBranches").on("click", function () {
                    var $this = $(this);
                    const tracker = ProgressDialog.newProgressTracker();
                    ProgressDialog.show(Git.fetchAllRemotes(tracker), tracker)
                        .then(function () {
                            return Git.getAllBranches().then(function (branches) {
                                $this.prop("disabled", true).attr("title", "Already fetched");
                                _reloadBranchSelect($select, branches);
                            });
                        }).catch(function (err) {
                            throw ErrorHandler.showError(err, Strings.ERROR_FETCH_REMOTE_INFO);
                        });
                });

                dialog.getElement().find("input").focus();
                dialog.done(function (buttonId) {
                    if (buttonId === "ok") {

                        var $dialog     = dialog.getElement(),
                            branchName  = $dialog.find("input[name='branch-name']").val().trim(),
                            $option     = $dialog.find("select[name='branch-origin']").children("option:selected"),
                            originName  = $option.val(),
                            isRemote    = $option.attr("remote"),
                            track       = !!isRemote;

                        Git.createBranch(branchName, originName, track).catch(function (err) {
                            Metrics.countEvent(Metrics.EVENT_TYPE.GIT, 'branch', "createFail");
                            throw ErrorHandler.showError(err, Strings.ERROR_CREATE_BRANCH);
                        }).then(function () {
                            Metrics.countEvent(Metrics.EVENT_TYPE.GIT, 'branch', "create");
                            EventEmitter.emit(Events.REFRESH_ALL);
                        });
                    }
                });
            });

        }).on("mouseenter", "a", function () {
            $(this).addClass("selected");
        }).on("mouseleave", "a", function () {
            $(this).removeClass("selected");
        }).on("click", "a.git-branch-link .trash-icon", function (e) {
            e.stopPropagation();
            closeDropdown();
            var branchName = $(this).parent().data("branch");
            Utils.askQuestion(Strings.DELETE_LOCAL_BRANCH,
                              StringUtils.format(Strings.DELETE_LOCAL_BRANCH_NAME, branchName),
                              { booleanResponse: true })
                .then(function (response) {
                    if (response === true) {
                        return Git.branchDelete(branchName).catch(function (err) {

                            return Utils.showOutput(err, "Branch deletion failed", {
                                question: "Do you wish to force branch deletion?"
                            }).then(function (response) {
                                if (response === true) {
                                    return Git.forceBranchDelete(branchName).then(function (output) {
                                        Metrics.countEvent(Metrics.EVENT_TYPE.GIT, 'branch', "delete");
                                        return Utils.showOutput(output || Strings.GIT_BRANCH_DELETE_SUCCESS);
                                    }).catch(function (err) {
                                        Metrics.countEvent(Metrics.EVENT_TYPE.GIT, 'branch', "deleteFail");
                                        ErrorHandler.showError(err, Strings.ERROR_BRANCH_DELETE_FORCED);
                                    });
                                }
                            });

                        });
                    }
                })
                .catch(function (err) {
                    ErrorHandler.showError(err);
                });

        }).on("click", ".merge-branch", function (e) {
            e.stopPropagation();
            closeDropdown();
            var fromBranch = $(this).parent().data("branch");
            doMerge(fromBranch);
        }).on("click", "a.git-branch-link", function (e) {

            e.stopPropagation();
            closeDropdown();
            var newBranchName = $(this).data("branch");

            Git.getCurrentBranchName().then(function (oldBranchName) {
                Git.checkout(newBranchName).then(function () {
                    Metrics.countEvent(Metrics.EVENT_TYPE.GIT, 'branch', "switch");
                    return closeNotExistingFiles(oldBranchName, newBranchName);
                }).catch(function (err) {
                    Metrics.countEvent(Metrics.EVENT_TYPE.GIT, 'branch', "switchFail");
                    ErrorHandler.showError(err, Strings.ERROR_SWITCHING_BRANCHES);
                });
            }).catch(function (err) {
                Metrics.countEvent(Metrics.EVENT_TYPE.GIT, 'branch', "switchFail");
                ErrorHandler.showError(err, Strings.ERROR_GETTING_CURRENT_BRANCH);
            });

        });
    }

    function attachCloseEvents() {
        $("html").on("click", closeDropdown);
        $("#project-files-container").on("scroll", closeDropdown);
        $("#git-panel .table-container").on("scroll", closeDropdown);
        $("#titlebar .nav").on("click", closeDropdown);
        $("#git-panel .git-remotes").on("click", closeDropdown);

        currentEditor = EditorManager.getCurrentFullEditor();
        if (currentEditor) {
            currentEditor._codeMirror.on("focus", closeDropdown);
        }

        // $(window).on("keydown", keydownHook);
    }

    function detachCloseEvents() {
        $("html").off("click", closeDropdown);
        $("#project-files-container").off("scroll", closeDropdown);
        $("#git-panel .table-container").off("scroll", closeDropdown);
        $("#titlebar .nav").off("click", closeDropdown);
        $("#git-panel .git-remotes").off("click", closeDropdown);

        if (currentEditor) {
            currentEditor._codeMirror.off("focus", closeDropdown);
        }

        // $(window).off("keydown", keydownHook);

        $dropdown = null;
        $dropdownAnchor = null;
    }

    function _positionDropdownBelow($toggle) {
        // two margins to account for the preceding project dropdown as well
        const marginLeft = (parseInt($toggle.css("margin-left"), 10) * 2) || 0;

        const toggleOffset = $toggle.offset();

        $dropdown
            .css({
                left: toggleOffset.left - marginLeft + 3,
                top: toggleOffset.top + $toggle.outerHeight() - 3
            })
            .appendTo($("body"));

        // fix so it doesn't overflow the screen
        const maxHeight = $dropdown.parent().height(),
            height = $dropdown.height(),
            topOffset = $dropdown.position().top;
        if (height + topOffset >= maxHeight - 10) {
            $dropdown.css("bottom", "10px");
        }
    }

    function _positionDropdownAbove($anchor) {
        const anchorOffset = $anchor.offset();

        $dropdown
            .css({
                left: anchorOffset.left,
                // #git-branch-dropdown carries a negative margin-left meant for the
                // sidebar toggle alignment, neutralize it so left matches the anchor
                "margin-left": 0,
                // the .dropdown-menu class positions with "top: 100%", it has to be
                // explicitly overridden or the bottom positioning below is over-constrained
                top: "auto",
                bottom: $(window).height() - anchorOffset.top + 3,
                // grow upwards from the anchor instead of the default top-left origin
                "transform-origin": "0 100%"
            })
            .appendTo($("body"));

        // fix so it doesn't overflow the screen
        if ($dropdown.height() >= anchorOffset.top - 10) {
            $dropdown.css("top", "10px");
        }

        const rightOverflow = $dropdown.offset().left + $dropdown.outerWidth() - ($(window).width() - 10);
        if (rightOverflow > 0) {
            $dropdown.css("left", anchorOffset.left - rightOverflow);
        }
    }

    function toggleDropdown(e) {
        e.stopPropagation();
        $("#git-panel .btn-group.open").removeClass("open");
        // currentTarget is only valid while the event is being dispatched,
        // so it has to be captured before the async branch listing below
        const $anchor = $(e.currentTarget);

        // clicking the anchor that opened the dropdown closes it, clicking the
        // other anchor moves the dropdown there
        if ($dropdown) {
            const sameAnchor = $dropdownAnchor && $dropdownAnchor[0] === $anchor[0];
            closeDropdown();
            if (sameAnchor) {
                return;
            }
        }

        Menus.closeAll();

        Git.getBranches().catch(function (err) {
            ErrorHandler.showError(err, Strings.ERROR_GETTING_BRANCH_LIST);
        }).then(function (branches = []) {
            if ($dropdown) {
                return;
            }
            branches = branches.reduce(function (arr, branch) {
                if (!branch.currentBranch && !branch.remote) {
                    arr.push(branch.name);
                }
                return arr;
            }, []);

            $dropdown = $(renderList(branches));
            $dropdownAnchor = $anchor;
            if ($anchor.closest("#git-panel").length) {
                // the git panel sits at the bottom of the screen, open upwards from there
                _positionDropdownAbove($anchor);
            } else {
                _positionDropdownBelow($("#git-branch-dropdown-toggle"));
            }

            PopUpManager.addPopUp($dropdown, detachCloseEvents, true, {closeCurrentPopups: true});
            PopUpManager.handleSelectionEvents($dropdown, {enableSearchFilter: true});
            attachCloseEvents();
            handleEvents();
        });
    }

    function _getHeadFilePath() {
        return Preferences.get("currentGitRoot") + ".git/HEAD";
    }

    function addHeadToTheFileIndex() {
        FileSystem.resolve(_getHeadFilePath(), function (err) {
            if (err) {
                ErrorHandler.logError(err, "Resolving .git/HEAD file failed");
                return;
            }
        });
    }

    function checkBranch() {
        FileSystem.getFileForPath(_getHeadFilePath()).read(function (err, contents) {
            if (err) {
                ErrorHandler.showError(err, Strings.ERROR_READING_GIT_HEAD);
                return;
            }

            contents = contents.trim();

            var m = contents.match(/^ref:\s+refs\/heads\/(\S+)/);

            // alternately try to parse the hash
            if (!m) { m = contents.match(/^([a-f0-9]{40})$/); }

            if (!m) {
                ErrorHandler.showError(new Error(StringUtils.format(Strings.ERROR_PARSING_BRANCH_NAME, contents)));
                return;
            }

            const branchInHead = m[1];

            if (branchInHead !== lastRenderedBranchName) {
                refresh();
            }
        });
    }

    function refresh() {
        if ($gitBranchName.length === 0) { return; }

        const projectRoot = Utils.getProjectRoot();
        function isStale() {
            return Utils.getProjectRoot() !== projectRoot;
        }

        // show info that branch is refreshing currently
        $gitBranchName
            .text("\u2026")
            .parent()
                .show();
        Panel.setBranchName("\u2026", "");

        return Git.getGitRoot().then(function (gitRoot) {
            if (isStale()) { return; }
            var isRepositoryRootOrChild = gitRoot && projectRoot.indexOf(gitRoot) === 0;

            $gitBranchName.parent().toggle(isRepositoryRootOrChild);

            if (!isRepositoryRootOrChild) {
                Preferences.set("currentGitRoot", projectRoot);
                Preferences.set("currentGitSubfolder", "");

                lastRenderedBranchName = null;
                $gitBranchName
                    .off("click")
                    .text(Strings.GIT_NOT_A_REPO);
                Panel.setBranchName(Strings.GIT_NOT_A_REPO, "");
                $("#git-panel .git-panel-branch").removeClass("clickable").off("click");
                Panel.disable("not-repo");

                return;
            }

            Preferences.set("currentGitRoot", gitRoot);
            Preferences.set("currentGitSubfolder", projectRoot.substring(gitRoot.length));

            // we are in a .git repo so read the head
            addHeadToTheFileIndex();

            return Git.getCurrentBranchName().then(function (branchName) {

                Git.getMergeInfo().then(function (mergeInfo) {
                    if (isStale()) { return; }

                    if (mergeInfo.mergeMode) {
                        branchName += "|MERGING";
                    }

                    if (mergeInfo.rebaseMode) {
                        if (mergeInfo.rebaseHead) {
                            branchName = mergeInfo.rebaseHead;
                        }
                        branchName += "|REBASE";
                        if (mergeInfo.rebaseNext && mergeInfo.rebaseLast) {
                            branchName += "(" + mergeInfo.rebaseNext + "/" + mergeInfo.rebaseLast + ")";
                        }
                    }

                    EventEmitter.emit(Events.REBASE_MERGE_MODE, mergeInfo.rebaseMode, mergeInfo.mergeMode);

                    const MAX_LEN = 18;

                    lastRenderedBranchName = branchName;
                    const tooltip = StringUtils.format(Strings.ON_BRANCH, branchName);
                    const displayName = branchName.length > MAX_LEN
                        ? branchName.substring(0, MAX_LEN) + "\u2026"
                        : branchName;
                    // branch names may contain characters like "<", so set them
                    // as text and never as html
                    $gitBranchName
                        .text(" " + displayName)
                        .prepend('<i class="fas fa-code-branch"></i>')
                        .attr("title", tooltip)
                        .off("click")
                        .on("click", toggleDropdown);
                    Panel.setBranchName(displayName, tooltip);
                    $("#git-panel .git-panel-branch")
                        .addClass("clickable")
                        .off("click")
                        .on("click", toggleDropdown);
                    Panel.enable();

                }).catch(function (err) {
                    ErrorHandler.showError(err, Strings.ERROR_READING_GIT_STATE);
                });

            }).catch(function (ex) {
                if (isStale()) { return; }
                if (ErrorHandler.contains(ex, "unknown revision")) {
                    lastRenderedBranchName = null;
                    $gitBranchName
                        .off("click")
                        .text(Strings.GIT_NO_BRANCH);
                    Panel.setBranchName(Strings.GIT_NO_BRANCH, "");
                    $("#git-panel .git-panel-branch").removeClass("clickable").off("click");
                    Panel.enable();
                } else {
                    throw ex;
                }
            });
        }).catch(function (err) {
            ErrorHandler.showError(err);
        });
    }

    function init() {
        // Add branch name to project tree
        const $html = $(`<div id='git-branch-dropdown-toggle' class='btn-alt-quiet'>
            <span id='git-branch'>
                <i class="fas fa-code-branch"></i>
            </span>
            <span class="dropdown-arrow"></span>
            </div>`);
        $html.appendTo($("#project-files-header"));
        $gitBranchName = $("#git-branch");
        $html.on("click", function () {
            $gitBranchName.click();
            return false;
        });
        if(Setup.isExtensionActivated()){
            refresh();
            return;
        }
        $("#git-branch-dropdown-toggle").addClass("forced-inVisible");
    }

    EventEmitter.on(Events.BRACKETS_FILE_CHANGED, function (file) {
        if (file.fullPath === _getHeadFilePath()) {
            checkBranch();
        }
    });

    EventEmitter.on(Events.REFRESH_ALL, function () {
        FileSyncManager.syncOpenDocuments();
        CommandManager.execute("file.refresh");
        refresh();
    });

    EventEmitter.on(Events.BRACKETS_PROJECT_CHANGE, function () {
        refresh();
    });

    EventEmitter.on(Events.BRACKETS_PROJECT_REFRESH, function () {
        refresh();
    });

    EventEmitter.on(Events.GIT_ENABLED, function () {
        $("#git-branch-dropdown-toggle").removeClass("forced-inVisible");
    });
    EventEmitter.on(Events.GIT_DISABLED, function () {
        $("#git-branch-dropdown-toggle").addClass("forced-inVisible");
    });

    exports.init    = init;
    exports.refresh = refresh;

});
