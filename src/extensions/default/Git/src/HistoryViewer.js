define(function (require, exports) {

    const _             = brackets.getModule("thirdparty/lodash"),
        LanguageManager = brackets.getModule("language/LanguageManager"),
        Mustache        = brackets.getModule("thirdparty/mustache/mustache"),
        WorkspaceManager  = brackets.getModule("view/WorkspaceManager"),
        Strings           = brackets.getModule("strings"),
        Metrics         = brackets.getModule("utils/Metrics"),
        marked          = brackets.getModule('thirdparty/marked.min').marked;

    const ErrorHandler  = require("src/ErrorHandler"),
        Git           = require("src/git/Git"),
        Preferences   = require("src/Preferences"),
        Utils         = require("src/Utils");

    var historyViewerTemplate       = require("text!templates/history-viewer.html"),
        historyViewerFilesTemplate  = require("text!templates/history-viewer-files.html");

    let useDifftool            = false,
        isShown                = false,
        commit                 = null,
        currentlyViewedCommit  = null,
        isInitial              = null,
        $viewer                = null,
        $editorHolder          = null;

    var setExpandState = _.debounce(function () {
        var allFiles = $viewer.find(".commit-files a"),
            activeFiles = allFiles.filter(".active"),
            allExpanded = allFiles.length === activeFiles.length;
        $viewer.find(".toggle-diffs").toggleClass("opened", allExpanded);
    }, 100);

    var PAGE_SIZE = 25;
    var currentPage = 0;
    var hasNextPage = false;

    function toggleDiff($a) {
        if ($a.hasClass("active")) {
            // Close the clicked diff
            $a.removeClass("active");
            setExpandState();
            return;
        }

        // Open the clicked diff
        $(".commit-files a.active").attr("scrollPos", $(".commit-diff").scrollTop());

        // If this diff was not previously loaded then load it
        if (!$a.is(".loaded")) {
            var $li = $a.closest("[x-file]"),
                relativeFilePath = $li.attr("x-file"),
                $diffContainer = $li.find(".commit-diff");

            Git.getDiffOfFileFromCommit(commit.hash, relativeFilePath, isInitial).then(function (diff) {
                $diffContainer.html(Utils.formatDiff(diff));
                $diffContainer.scrollTop($a.attr("scrollPos") || 0);

                $a.addClass("active loaded");
                setExpandState();
            }).catch(function (err) {
                ErrorHandler.showError(err, Strings.ERROR_GET_DIFF_FILE_COMMIT);
            });
        } else {
            // If this diff was previously loaded just open it
            $a.addClass("active");
            setExpandState();
        }
    }

    function showDiff($el) {
        var file = $el.closest("[x-file]").attr("x-file");
        Git.difftoolFromHash(commit.hash, file, isInitial);
    }

    function expandAll() {
        $viewer.find(".commit-files a").not(".active").trigger("click");
        Preferences.set("autoExpandDiffsInHistory", true);
    }

    function collapseAll() {
        $viewer.find(".commit-files a").filter(".active").trigger("click");
        Preferences.set("autoExpandDiffsInHistory", false);
    }

    function attachEvents() {
        $viewer
            .on("click", ".commit-files a", function () {
                toggleDiff($(this));
            })
            .on("click", ".commit-files .difftool", function (e) {
                e.stopPropagation();
                showDiff($(this));
            })
            .on("click", ".openFile", function (e) {
                e.stopPropagation();
                var file = $(this).closest("[x-file]").attr("x-file");
                Utils.openEditorForFile(file, true);
                hide();
            })
            .on("click", ".close", function () {
                // Close history viewer
                remove();
            })
            .on("click", ".git-extend-sha", function () {
                // Show complete commit SHA
                var $parent = $(this).parent(),
                    sha = $parent.data("hash");
                $parent.find("span.selectable-text").text(sha);
                $(this).remove();
            })
            .on("click", ".toggle-diffs", expandAll)
            .on("click", ".toggle-diffs.opened", collapseAll);

        // Add/Remove shadow on bottom of header
        $viewer.find(".body")
            .on("scroll", function () {
                if ($viewer.find(".body").scrollTop() > 0) {
                    $viewer.find(".header").addClass("shadow");
                } else {
                    $viewer.find(".header").removeClass("shadow");
                }
            });

        // Expand the diffs when wanted
        if (Preferences.get("autoExpandDiffsInHistory")) {
            expandAll();
        }
    }

    function renderViewerContent(files, selectedFile) {
        var bodyMarkdown = marked(commit.body, { gfm: true, breaks: true });

        $viewer.html(Mustache.render(historyViewerTemplate, {
            commit: commit,
            bodyMarkdown: bodyMarkdown,
            Strings: Strings
        }));

        renderFiles(files);

        if (selectedFile) {
            var $fileEntry = $viewer.find(".commit-files li[x-file='" + selectedFile + "'] a").first();
            if ($fileEntry.length) {
                toggleDiff($fileEntry);
                window.setTimeout(function () {
                    $viewer.find(".body").animate({ scrollTop: $fileEntry.position().top - 10 });
                }, 80);
            }
        }

        attachEvents();
    }

    function renderFiles(files) {
        $viewer.find(".filesContainer").append(Mustache.render(historyViewerFilesTemplate, {
            files: files,
            Strings: Strings,
            useDifftool: useDifftool
        }));

        // Activate/Deactivate load more button
        $viewer.find(".loadMore")
            .toggle(hasNextPage)
            .off("click")
            .on("click", function () {
                currentPage++;
                loadMoreFiles();
            });
    }

    function loadMoreFiles() {
        Git.getFilesFromCommit(commit.hash, isInitial).then(function (files) {

            hasNextPage = files.slice((currentPage + 1) * PAGE_SIZE).length > 0;
            files = files.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

            var list = files.map(function (file) {
                var fileExtension = LanguageManager.getCompoundFileExtension(file),
                    i = file.lastIndexOf("." + fileExtension),
                    fileName = file.substring(0, fileExtension && i >= 0 ? i : file.length);
                return {
                    name: fileName,
                    extension: fileExtension ? "." + fileExtension : "",
                    file: file
                };
            });

            if (currentPage === 0) {
                var file = $("#git-history-list").data("file-relative");
                return renderViewerContent(list, file);
            } else {
                return renderFiles(list);
            }
        }).catch(function (err) {
            ErrorHandler.showError(err, Strings.ERROR_GET_DIFF_FILES);
        }).finally(function () {
            $viewer.removeClass("spinner large spin");
        });
    }

    function render() {
        if ($viewer) {
            // Reset the viewer listeners
            $viewer.off("click");
            $viewer.find(".body").off("scroll");
        } else {
            // Create the viewer if it doesn't exist
            $viewer = $("<div>").addClass("git spinner large spin");
            $viewer.appendTo($editorHolder);
        }

        currentPage = 0;
        loadMoreFiles();
    }

    var initialize = _.once(function () {
        Git.getConfig("diff.tool").then(function (config) {
            useDifftool = !!config;
        });
    });

    function toggle(commitInfo, doc, options) {
        const commitHash = commitInfo.hash;
        if(isShown && commitHash === currentlyViewedCommit) {
            // the history view already showing the current commit, the user intent is to close
            remove();
            return false;
        }
        // a new history is to be shown
        show(commitInfo, doc, options);
        return true;
    }

    function show(commitInfo, doc, options) {
        Metrics.countEvent(Metrics.EVENT_TYPE.GIT, 'history', "detailView");
        initialize();

        commit    = commitInfo;
        isInitial = options.isInitial;

        $editorHolder = $("#editor-holder");
        render();
        currentlyViewedCommit = commitInfo.hash;
        isShown   = true;
        if ($("#first-pane").length) {
            const firstPaneStyle =
                $("#first-pane").prop("style") && $("#first-pane").prop("style").cssText ?
                    $("#first-pane").prop("style").cssText : "";
            $("#first-pane").prop("style", firstPaneStyle + ";display: none !important;");
        }

        if ($("#second-pane").length) {
            const secondPaneStyle =
                $("#second-pane").prop("style") && $("#second-pane").prop("style").cssText ?
                    $("#second-pane").prop("style").cssText : "";
            $("#second-pane").prop("style", secondPaneStyle + ";display: none !important;");
        }
    }

    function onRemove() {
        isShown = false;
        $viewer = null;
        currentlyViewedCommit = null;
        $("#first-pane").show();
        $("#second-pane").show();
        // we need to relayout as when the history overlay is visible over the editor, we
        // hide the editor with css, and if we resize app while history view is open, the editor wont
        // be resized. So we relayout on panel close.
        WorkspaceManager.recomputeLayout();
        // detach events that were added by this viewer to another element than one added to $editorHolder
    }

    function hide() {
        if (isShown) {
            remove();
        }
    }

    function remove() {
        $viewer.remove();
        onRemove();
    }

    function isVisible() {
        return isShown;
    }

    // Public API
    exports.toggle = toggle;
    exports.show = show;
    exports.hide = hide;
    exports.isVisible = isVisible;

});
