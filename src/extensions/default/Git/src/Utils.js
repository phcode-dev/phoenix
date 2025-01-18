/*globals jsPromise, logger*/
define(function (require, exports, module) {

    // Brackets modules
    const _               = brackets.getModule("thirdparty/lodash"),
        CommandManager  = brackets.getModule("command/CommandManager"),
        Commands        = brackets.getModule("command/Commands"),
        Dialogs         = brackets.getModule("widgets/Dialogs"),
        DocumentManager = brackets.getModule("document/DocumentManager"),
        FileSystem      = brackets.getModule("filesystem/FileSystem"),
        FileUtils       = brackets.getModule("file/FileUtils"),
        LanguageManager = brackets.getModule("language/LanguageManager"),
        Mustache        = brackets.getModule("thirdparty/mustache/mustache"),
        ProjectManager  = brackets.getModule("project/ProjectManager");

    // Local modules
    const ErrorHandler    = require("src/ErrorHandler"),
        Events          = require("src/Events"),
        EventEmitter    = require("src/EventEmitter"),
        Git             = require("src/git/Git"),
        Preferences     = require("src/Preferences"),
        Setup           = require("src/utils/Setup"),
        Constants       = require("src/Constants"),
        Strings         = brackets.getModule("strings");

    const FORMAT_DIFF_TOO_LARGE = "<div>" + Strings.DIFF_TOO_LONG + "</div>";

    // Module variables
    const formatDiffTemplate      = require("text!templates/format-diff.html"),
        questionDialogTemplate  = require("text!templates/git-question-dialog.html"),
        outputDialogTemplate    = require("text!templates/git-output.html"),
        writeTestResults        = {},
        EXT_NAME                = "[brackets-git] ";

    // Implementation
    function getProjectRoot() {
        var projectRoot = ProjectManager.getProjectRoot();
        return projectRoot ? projectRoot.fullPath : null;
    }

    // returns "C:/Users/Zaggi/AppData/Roaming/Brackets/extensions/user/zaggino.brackets-git/"
    function getExtensionDirectory() {
        throw new Error("api unsupported");
        // var modulePath = ExtensionUtils.getModulePath(module);
        // return modulePath.slice(0, -1 * "src/".length);
    }

    function formatDiff(diff) {
        var DIFF_MAX_LENGTH = 2000;

        var tabReplace   = "",
            verbose      = Preferences.get("useVerboseDiff"),
            numLineOld   = 0,
            numLineNew   = 0,
            lastStatus   = 0,
            diffData     = [];

        var i = Preferences.getGlobal("tabSize");
        while (i--) {
            tabReplace += "&nbsp;";
        }

        var LINE_STATUS = {
            HEADER: 0,
            UNCHANGED: 1,
            REMOVED: 2,
            ADDED: 3,
            EOF: 4
        };

        var diffSplit = diff.split("\n");

        if (diffSplit.length > DIFF_MAX_LENGTH) {
            return "" + FORMAT_DIFF_TOO_LARGE; // create new str to return
        }

        diffSplit.forEach(function (line) {
            if (line === " ") { line = ""; }

            var lineClass   = "",
                pushLine    = true;

            if (line.indexOf("diff --git") === 0) {
                lineClass = "diffCmd";

                diffData.push({
                    name: line.split("b/")[1],
                    lines: []
                });

                if (!verbose) {
                    pushLine = false;
                }
            } else if (line.match(/index\s[A-z0-9]{7}\.\.[A-z0-9]{7}/)) {
                if (!verbose) {
                    pushLine = false;
                }
            } else if (line.substr(0, 3) === "+++" || line.substr(0, 3) === "---") {
                if (!verbose) {
                    pushLine = false;
                }
            } else if (line.indexOf("@@") === 0) {
                lineClass = "position";

                // Define the type of the line: Header
                lastStatus = LINE_STATUS.HEADER;

                // This read the start line for the diff and substract 1 for this line
                var m = line.match(/^@@ -([,0-9]+) \+([,0-9]+) @@/);
                var s1 = m[1].split(",");
                var s2 = m[2].split(",");

                numLineOld = s1[0] - 1;
                numLineNew = s2[0] - 1;
            } else if (line[0] === "+") {
                lineClass = "added";
                line = line.substring(1);

                // Define the type of the line: Added
                lastStatus = LINE_STATUS.ADDED;

                // Add 1 to the num line for new document
                numLineNew++;
            } else if (line[0] === "-") {
                lineClass = "removed";
                line = line.substring(1);

                // Define the type of the line: Removed
                lastStatus = LINE_STATUS.REMOVED;

                // Add 1 to the num line for old document
                numLineOld++;
            } else if (line[0] === " " || line === "") {
                lineClass = "unchanged";
                line = line.substring(1);

                // Define the type of the line: Unchanged
                lastStatus = LINE_STATUS.UNCHANGED;

                // Add 1 to old a new num lines
                numLineOld++;
                numLineNew++;
            } else if (line === "\\ No newline at end of file") {
                lastStatus = LINE_STATUS.EOF;
                lineClass = "end-of-file";
            } else {
                console.log("Unexpected line in diff: " + line);
            }

            if (pushLine) {
                var _numLineOld = "",
                    _numLineNew = "";

                switch (lastStatus) {
                    case LINE_STATUS.HEADER:
                    case LINE_STATUS.EOF:
                        // _numLineOld = "";
                        // _numLineNew = "";
                        break;
                    case LINE_STATUS.UNCHANGED:
                        _numLineOld = numLineOld;
                        _numLineNew = numLineNew;
                        break;
                    case LINE_STATUS.REMOVED:
                        _numLineOld = numLineOld;
                        // _numLineNew = "";
                        break;
                    // case LINE_STATUS.ADDED:
                    default:
                        // _numLineOld = "";
                        _numLineNew = numLineNew;
                }

                // removes ZERO WIDTH NO-BREAK SPACE character (BOM)
                line = line.replace(/\uFEFF/g, "");

                // exposes other potentially harmful characters
                line = line.replace(/[\u2000-\uFFFF]/g, function (x) {
                    return "<U+" + x.charCodeAt(0).toString(16).toUpperCase() + ">";
                });

                line = _.escape(line)
                    .replace(/\t/g, tabReplace)
                    .replace(/\s/g, "&nbsp;");

                line = line.replace(/(&nbsp;)+$/g, function (trailingWhitespace) {
                    return "<span class='trailingWhitespace'>" + trailingWhitespace + "</span>";
                });

                if (diffData.length > 0) {
                    _.last(diffData).lines.push({
                        "numLineOld": _numLineOld,
                        "numLineNew": _numLineNew,
                        "line": line,
                        "lineClass": lineClass
                    });
                }
            }
        });

        return Mustache.render(formatDiffTemplate, { files: diffData });
    }

    function askQuestion(title, question, options) {
        return new Promise(function (resolve, reject) {
            options = options || {};

            if (!options.noescape) {
                question = _.escape(question);
            }

            var compiledTemplate = Mustache.render(questionDialogTemplate, {
                title: title,
                question: question,
                stringInput: !options.booleanResponse && !options.password,
                passwordInput: options.password,
                defaultValue: options.defaultValue,
                customOkBtn: options.customOkBtn,
                customOkBtnClass: options.customOkBtnClass,
                Strings: Strings
            });

            var dialog  = Dialogs.showModalDialogUsingTemplate(compiledTemplate),
                $dialog = dialog.getElement();

            _.defer(function () {
                var $input = $dialog.find("input:visible");
                if ($input.length > 0) {
                    $input.focus();
                } else {
                    $dialog.find(".primary").focus();
                }
            });

            dialog.done(function (buttonId) {
                if (options.booleanResponse) {
                    return resolve(buttonId === "ok");
                }
                if (buttonId === "ok") {
                    resolve(dialog.getElement().find("input").val().trim());
                } else {
                    reject(Strings.USER_ABORTED);
                }
            });
        });
    }

    function showOutput(output, title, options) {
        return new Promise(function (resolve) {
            options = options || {};
            var compiledTemplate = Mustache.render(outputDialogTemplate, {
                title: title,
                output: output,
                Strings: Strings,
                question: options.question
            });
            var dialog = Dialogs.showModalDialogUsingTemplate(compiledTemplate);
            dialog.getElement().find("button").focus();
            dialog.done(function (buttonId) {
                resolve(buttonId === "ok");
            });
        });
    }

    function isProjectRootWritable() {
        return new Promise(function (resolve) {

            var folder = getProjectRoot();

            // if we previously tried, assume nothing has changed
            if (writeTestResults[folder]) {
                return resolve(writeTestResults[folder]);
            }

            // create entry for temporary file
            var fileEntry = FileSystem.getFileForPath(folder + ".phoenixGitTemp");

            function finish(bool) {
                // delete the temp file and resolve
                fileEntry.unlink(function () {
                    writeTestResults[folder] = bool;
                    resolve(bool);
                });
            }

            // try writing some text into the temp file
            jsPromise(FileUtils.writeText(fileEntry, ""))
                .then(function () {
                    finish(true);
                })
                .catch(function () {
                    finish(false);
                });
        });
    }

    function pathExists(path) {
        return new Promise(function (resolve) {
            FileSystem.resolve(path, function (err, entry) {
                resolve(!err && entry ? true : false);
            });
        });
    }

    function loadPathContent(path) {
        return new Promise(function (resolve) {
            FileSystem.resolve(path, function (err, entry) {
                if (err) {
                    return resolve(null);
                }
                if (entry._clearCachedData) {
                    entry._clearCachedData();
                }
                if (entry.isFile) {
                    entry.read(function (err, content) {
                        if (err) {
                            return resolve(null);
                        }
                        resolve(content);
                    });
                } else {
                    entry.getContents(function (err, contents) {
                        if (err) {
                            return resolve(null);
                        }
                        resolve(contents);
                    });
                }
            });
        });
    }

    function isLoading($btn) {
        return $btn.hasClass("btn-loading");
    }

    function setLoading($btn) {
        $btn.prop("disabled", true).addClass("btn-loading");
    }

    function unsetLoading($btn) {
        $btn.prop("disabled", false).removeClass("btn-loading");
    }

    function encodeSensitiveInformation(str) {
        // should match passwords in http/https urls
        str = str.replace(/(https?:\/\/)([^:@\s]*):([^:@]*)?@/g, function (a, protocol, user/*, pass*/) {
            return protocol + user + ":***@";
        });
        // should match user name in windows user folders
        str = str.replace(/(users)(\\|\/)([^\\\/]+)(\\|\/)/i, function (a, users, slash1, username, slash2) {
            return users + slash1 + "***" + slash2;
        });
        return str;
    }

    function consoleWarn(msg) {
        console.warn(encodeSensitiveInformation(msg));
    }

    function consoleError(msg) {
        console.error(encodeSensitiveInformation(msg));
    }

    function consoleDebug(msg) {
        if (logger.loggingOptions.logGit) {
            console.log(EXT_NAME + encodeSensitiveInformation(msg));
        }
    }

    /**
     * Reloads the Document's contents from disk, discarding any unsaved changes in the editor.
     *
     * @param {!Document} doc
     * @return {Promise} Resolved after editor has been refreshed; rejected if unable to load the
     *      file's new content. Errors are logged but no UI is shown.
     */
    function reloadDoc(doc) {
        return jsPromise(FileUtils.readAsText(doc.file))
            .then(function (text) {
                doc.refreshText(text, new Date());
            })
            .catch(function (err) {
                ErrorHandler.logError("Error reloading contents of " + doc.file.fullPath);
                ErrorHandler.logError(err);
            });
    }

    /**
     *  strips trailing whitespace from all the diffs and adds \n to the end
     */
    function stripWhitespaceFromFile(filename, clearWholeFile) {
        return new Promise(function (resolve, reject) {

            var fullPath                  = Preferences.get("currentGitRoot") + filename,
                addEndlineToTheEndOfFile  = Preferences.get("addEndlineToTheEndOfFile"),
                removeBom                 = Preferences.get("removeByteOrderMark"),
                normalizeLineEndings      = Preferences.get("normalizeLineEndings");

            var _cleanLines = function (lineNumbers) {
                // do not clean if there's nothing to clean
                if (lineNumbers && lineNumbers.length === 0) {
                    return resolve();
                }
                // clean the file
                var fileEntry = FileSystem.getFileForPath(fullPath);
                return jsPromise(FileUtils.readAsText(fileEntry))
                    .catch(function (err) {
                        ErrorHandler.logError(err + " on FileUtils.readAsText for " + fileEntry.fullPath);
                        return null;
                    })
                    .then(function (text) {
                        if (text === null) {
                            return resolve();
                        }

                        if (removeBom) {
                            // remove BOM - \uFEFF
                            text = text.replace(/\uFEFF/g, "");
                        }
                        if (normalizeLineEndings) {
                            // normalizes line endings
                            text = text.replace(/\r\n/g, "\n");
                        }
                        // process lines
                        var lines = text.split("\n");

                        if (lineNumbers) {
                            lineNumbers.forEach(function (lineNumber) {
                                if (typeof lines[lineNumber] === "string") {
                                    lines[lineNumber] = lines[lineNumber].replace(/\s+$/, "");
                                }
                            });
                        } else {
                            lines.forEach(function (ln, lineNumber) {
                                if (typeof lines[lineNumber] === "string") {
                                    lines[lineNumber] = lines[lineNumber].replace(/\s+$/, "");
                                }
                            });
                        }

                        // add empty line to the end, i've heard that git likes that for some reason
                        if (addEndlineToTheEndOfFile) {
                            var lastLineNumber = lines.length - 1;
                            if (lines[lastLineNumber].length > 0) {
                                lines[lastLineNumber] = lines[lastLineNumber].replace(/\s+$/, "");
                            }
                            if (lines[lastLineNumber].length > 0) {
                                lines.push("");
                            }
                        }

                        text = lines.join("\n");
                        return jsPromise(FileUtils.writeText(fileEntry, text))
                            .catch(function (err) {
                                ErrorHandler.logError("Wasn't able to clean whitespace from file: " + fullPath);
                                resolve();
                                throw err;
                            })
                            .then(function () {
                                // refresh the file if it's open in the background
                                DocumentManager.getAllOpenDocuments().forEach(function (doc) {
                                    if (doc.file.fullPath === fullPath) {
                                        reloadDoc(doc);
                                    }
                                });
                                // diffs were cleaned in this file
                                resolve();
                            });
                    });
            };

            if (clearWholeFile) {
                _cleanLines(null);
            } else {
                Git.diffFile(filename).then(function (diff) {
                    // if git returned an empty diff
                    if (!diff) { return resolve(); }

                    // if git detected that the file is binary
                    if (diff.match(/^binary files.*differ$/img)) { return resolve(); }

                    var modified = [],
                        changesets = diff.split("\n").filter(function (l) { return l.match(/^@@/) !== null; });
                    // collect line numbers to clean
                    changesets.forEach(function (line) {
                        var i,
                            m = line.match(/^@@ -([,0-9]+) \+([,0-9]+) @@/),
                            s = m[2].split(","),
                            from = parseInt(s[0], 10),
                            to = from - 1 + (parseInt(s[1], 10) || 1);
                        for (i = from; i <= to; i++) { modified.push(i > 0 ? i - 1 : 0); }
                    });
                    _cleanLines(modified);
                }).catch(function (ex) {
                    // This error will bubble up to preparing commit dialog so just log here
                    ErrorHandler.logError(ex);
                    reject(ex);
                });
            }
        });
    }

    function stripWhitespaceFromFiles(gitStatusResults, stageChanges, progressTracker) {
        return new Promise((resolve, reject)=>{
            const startTime = (new Date()).getTime();
            let queue = Promise.resolve();

            gitStatusResults.forEach(function (fileObj) {
                var isDeleted = fileObj.status.indexOf(Git.FILE_STATUS.DELETED) !== -1;

                // strip whitespace if the file was not deleted
                if (!isDeleted) {
                    // strip whitespace only for recognized languages so binary files won't get corrupted
                    var langId = LanguageManager.getLanguageForPath(fileObj.file).getId();
                    if (["unknown", "binary", "image", "markdown", "audio"].indexOf(langId) === -1) {

                        queue = queue.then(function () {
                            var clearWholeFile = fileObj.status.indexOf(Git.FILE_STATUS.UNTRACKED) !== -1 ||
                                fileObj.status.indexOf(Git.FILE_STATUS.RENAMED) !== -1;

                            var t = (new Date()).getTime() - startTime;
                            progressTracker.trigger(Events.GIT_PROGRESS_EVENT,
                                t + "ms - " + Strings.CLEAN_FILE_START + ": " + fileObj.file);

                            return stripWhitespaceFromFile(fileObj.file, clearWholeFile).then(function () {
                                // stage the files again to include stripWhitespace changes
                                var notifyProgress = function () {
                                    var t = (new Date()).getTime() - startTime;
                                    progressTracker.trigger(Events.GIT_PROGRESS_EVENT,
                                        t + "ms - " + Strings.CLEAN_FILE_END + ": " + fileObj.file);
                                };
                                if (stageChanges) {
                                    return Git.stage(fileObj.file).then(notifyProgress);
                                } else {
                                    notifyProgress();
                                }
                            });
                        });

                    }
                }
            });

            queue
                .then(function () {
                    resolve();
                })
                .catch(function () {
                    reject();
                });
        });
    }

    function openEditorForFile(file, relative) {
        if (relative) {
            file = getProjectRoot() + file;
        }
        CommandManager.execute(Commands.FILE_OPEN, {
            fullPath: file
        });
    }

    let clearWhitespace = Preferences.get("clearWhitespaceOnSave");
    Preferences.getExtensionPref().on("change", "clearWhitespaceOnSave", ()=>{
        clearWhitespace = Preferences.get("clearWhitespaceOnSave");
    });

    EventEmitter.on(Events.BRACKETS_DOCUMENT_SAVED, function (doc) {
        if(!clearWhitespace){
            return;
        }
        var fullPath       = doc.file.fullPath,
            currentGitRoot = Preferences.get("currentGitRoot"),
            path           = fullPath.substring(currentGitRoot.length);
        stripWhitespaceFromFile(path);
    });

    function enableCommand(commandID, enabled) {
        const command = CommandManager.get(commandID);
        if(!command){
            return;
        }
        enabled = commandID === Constants.CMD_GIT_SETTINGS_COMMAND_ID ?
            true : enabled && Setup.isExtensionActivated();
        command.setEnabled(enabled);
    }

    // Public API
    exports.FORMAT_DIFF_TOO_LARGE       = FORMAT_DIFF_TOO_LARGE;
    exports.formatDiff                  = formatDiff;
    exports.getProjectRoot              = getProjectRoot;
    exports.getExtensionDirectory       = getExtensionDirectory;
    exports.askQuestion                 = askQuestion;
    exports.showOutput                  = showOutput;
    exports.isProjectRootWritable       = isProjectRootWritable;
    exports.pathExists                  = pathExists;
    exports.loadPathContent             = loadPathContent;
    exports.setLoading                  = setLoading;
    exports.unsetLoading                = unsetLoading;
    exports.isLoading                   = isLoading;
    exports.consoleWarn                 = consoleWarn;
    exports.consoleError                = consoleError;
    exports.consoleDebug                = consoleDebug;
    exports.encodeSensitiveInformation  = encodeSensitiveInformation;
    exports.reloadDoc                   = reloadDoc;
    exports.stripWhitespaceFromFiles    = stripWhitespaceFromFiles;
    exports.openEditorForFile           = openEditorForFile;
    exports.enableCommand               = enableCommand;

});
