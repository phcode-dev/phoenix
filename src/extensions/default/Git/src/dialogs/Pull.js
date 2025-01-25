define(function (require, exports) {

    // Brackets modules
    const Dialogs = brackets.getModule("widgets/Dialogs"),
        Mustache = brackets.getModule("thirdparty/mustache/mustache");

    // Local modules
    const Preferences     = require("src/Preferences"),
        RemoteCommon    = require("src/dialogs/RemoteCommon"),
        Strings         = brackets.getModule("strings");

    // Templates
    const template            = require("text!src/dialogs/templates/pull-dialog.html"),
        remotesTemplate     = require("text!src/dialogs/templates/remotes-template.html");

    // Implementation
    function _attachEvents($dialog, pullConfig) {
        RemoteCommon.attachCommonEvents(pullConfig, $dialog);

        // load last used
        $dialog
            .find("input[name='strategy']")
            .filter("[value='" + (Preferences.get("pull.strategy") || "DEFAULT") + "']")
            .prop("checked", true);
    }

    function _show(pullConfig, resolve, reject) {
        const templateArgs = {
            config: pullConfig,
            mode: "PULL_FROM",
            modeLabel: Strings.PULL_FROM,
            Strings: Strings
        };

        const compiledTemplate = Mustache.render(template, templateArgs, {
                remotes: remotesTemplate
            }),
            dialog = Dialogs.showModalDialogUsingTemplate(compiledTemplate),
            $dialog = dialog.getElement();

        _attachEvents($dialog, pullConfig);

        dialog.done(function (buttonId) {
            if (buttonId === "ok") {
                RemoteCommon.collectValues(pullConfig, $dialog);
                Preferences.set("pull.strategy", pullConfig.strategy);
                resolve(pullConfig);
            } else {
                reject();
            }
        });
    }

    function show(pullConfig) {
        return new Promise((resolve, reject) => {
            pullConfig.pull = true;
            // collectInfo never rejects
            RemoteCommon.collectInfo(pullConfig).then(()=>{
                _show(pullConfig, resolve, reject);
            });
        });
    }

    exports.show = show;

});
