define(function (require, exports) {

    const Dialogs                    = brackets.getModule("widgets/Dialogs"),
        Mustache                   = brackets.getModule("thirdparty/mustache/mustache"),
        Metrics                    = brackets.getModule("utils/Metrics"),
        Strings                    = brackets.getModule("strings"),
        NotificationUI             = brackets.getModule("widgets/NotificationUI"),
        Utils                      = require("src/Utils"),
        errorDialogTemplate        = require("text!templates/git-error-dialog.html");

    function errorToString(err) {
        return Utils.encodeSensitiveInformation(err.toString());
    }

    exports.isTimeout = function (err) {
        return err instanceof Error && (
            err.message.indexOf("cmd-execute-timeout") === 0 ||
            err.message.indexOf("cmd-spawn-timeout") === 0
        );
    };

    exports.equals = function (err, what) {
        return err.toString().toLowerCase() === what.toLowerCase();
    };

    exports.contains = function (err, what) {
        return err.toString().toLowerCase().indexOf(what.toLowerCase()) !== -1;
    };

    exports.matches = function (err, regExp) {
        return err.toString().match(regExp);
    };

    exports.logError = function (err) {
        const msg = err && err.stack ? err.stack : err;
        Utils.consoleError("[brackets-git] " + msg);
        return err;
    };

    /**
     *
     * @param err
     * @param title
     * @param {dontStripError: boolean, errorMetric: string, useNotification: boolean} options
     */
    exports.showError = function (err, title, options = {}) {
        const dontStripError = options.dontStripError;
        const errorMetric = options.errorMetric;
        if (err.__shown) { return err; }

        exports.logError(err);

        let errorBody,
            errorStack;

        if (typeof err === "string") {
            errorBody = err;
        } else if (err instanceof Error) {
            errorBody = dontStripError ? err.toString() : errorToString(err);
            errorStack = err.stack || "";
        }

        if (!errorBody || errorBody === "[object Object]") {
            try {
                errorBody = JSON.stringify(err, null, 4);
            } catch (e) {
                errorBody = "Error can't be stringified by JSON.stringify";
            }
        }
        errorBody = window.debugMode ? `${errorBody}\n${errorStack}` : errorBody;

        if(options.useNotification){
            Metrics.countEvent(Metrics.EVENT_TYPE.GIT, 'notifyErr', errorMetric || "Show");
            NotificationUI.createToastFromTemplate(title,
                `<textarea readonly style="width: 200px; height: 200px; cursor: text; resize: none;">${errorBody}</textarea>`, {
                    toastStyle: NotificationUI.NOTIFICATION_STYLES_CSS_CLASS.ERROR,
                    dismissOnClick: false,
                    instantOpen: true
                });
        } else {
            Metrics.countEvent(Metrics.EVENT_TYPE.GIT, 'dialogErr', errorMetric || "Show");
            const compiledTemplate = Mustache.render(errorDialogTemplate, {
                title: title,
                body: errorBody,
                Strings: Strings
            });

            Dialogs.showModalDialogUsingTemplate(compiledTemplate);
        }

        if (typeof err === "string") { err = new Error(err); }
        err.__shown = true;
        return err;
    };

    exports.toError = function (arg) {
        // FUTURE: use this everywhere and have a custom error class for this extension
        if (arg instanceof Error) { return arg; }
        var err = new Error(arg);
        // TODO: new class for this?
        err.match = function () {
            return arg.match.apply(arg, arguments);
        };
        return err;
    };

});
