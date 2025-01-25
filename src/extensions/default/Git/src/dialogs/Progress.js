define(function (require, exports) {
    const EventDispatcher = brackets.getModule("utils/EventDispatcher");
    // Brackets modules
    const Dialogs = brackets.getModule("widgets/Dialogs"),
        Strings             = brackets.getModule("strings"),
        Mustache = brackets.getModule("thirdparty/mustache/mustache");

    // Local modules
    const Events        = require("src/Events");

    // Templates
    var template = require("text!src/dialogs/templates/progress-dialog.html");

    // Module variables
    var lines,
        $textarea;

    const maxLines = 5000;
    // some git commit may have pre commit/push hooks which
    // may run tests suits that print large amount of data on the console, so we need to
    // debounce and truncate the git output we get in progress window.
    function addLine(str) {
        if (lines.length >= maxLines) {
            lines.shift(); // Remove the oldest line
        }
        lines.push(str);
    }
    let updateTimeout = null;
    function updateTextarea() {
        if(updateTimeout){
            // an update is scheduled, debounce, we dont need to print now
            return;
        }
        updateTimeout = setTimeout(() => {
            updateTimeout = null;
            if(!$textarea || !lines.length){
                return;
            }
            $textarea.val(lines.join("\n"));
            $textarea.scrollTop($textarea[0].scrollHeight - $textarea.height());
        }, 100);
    }

    function onProgress(str) {
        if (typeof str === "string") {
            addLine(str);
        }
        updateTextarea();
    }

    function show(promise, progressTracker, showOpts = {}) {
        if (!promise || !promise.finally) {
            throw new Error("Invalid promise argument for progress dialog!");
        }
        if(!progressTracker) {
            throw new Error("Invalid progressTracker argument for progress dialog!");
        }

        const title = showOpts.title;
        const options = showOpts.options || {};

        return new Promise(function (resolve, reject) {

            lines = showOpts.initialMessage ? [showOpts.initialMessage] : [];
            $textarea = null;

            var dialog,
                finished = false;

            function showDialog() {
                if (finished) {
                    return;
                }

                var templateArgs = {
                    title: title || Strings.OPERATION_IN_PROGRESS_TITLE,
                    Strings: Strings
                };

                var compiledTemplate = Mustache.render(template, templateArgs);
                dialog = Dialogs.showModalDialogUsingTemplate(compiledTemplate);

                $textarea = dialog.getElement().find("textarea");
                $textarea.val(Strings.PLEASE_WAIT);
                onProgress();
            }

            let finalValue, finalError;
            function finish() {
                finished = true;
                if (dialog) {
                    dialog.close();
                }
                if(finalError){
                    reject(finalError);
                } else {
                    resolve(finalValue);
                }
            }

            if (!options.preDelay) {
                showDialog();
            } else {
                setTimeout(function () {
                    showDialog();
                }, options.preDelay * 1000);
            }

            progressTracker.off(`${Events.GIT_PROGRESS_EVENT}.progressDlg`);
            progressTracker.on(`${Events.GIT_PROGRESS_EVENT}.progressDlg`, (_evt, data)=>{
                onProgress(data);
            });
            promise
                .then(val => {
                    finalValue = val;
                })
                .catch(err => {
                    finalError = err;
                })
                .finally(function () {
                    progressTracker.off(`${Events.GIT_PROGRESS_EVENT}.progressDlg`);
                    onProgress("Finished!");
                    if (!options.postDelay || !dialog) {
                        finish();
                    } else {
                        setTimeout(function () {
                            finish();
                        }, options.postDelay * 1000);
                    }
                });

        });
    }

    function waitForClose() {
        return new Promise(function (resolve) {
            function check() {
                var visible = $("#git-progress-dialog").is(":visible");
                if (!visible) {
                    resolve();
                } else {
                    setTimeout(check, 20);
                }
            }
            setTimeout(check, 20);
        });
    }

    function newProgressTracker() {
        const tracker = {};
        EventDispatcher.makeEventDispatcher(tracker);
        return tracker;
    }

    exports.show = show;
    exports.newProgressTracker = newProgressTracker;
    exports.waitForClose = waitForClose;

});
