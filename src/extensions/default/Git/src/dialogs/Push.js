define(function (require, exports) {

    // Brackets modules
    const Dialogs = brackets.getModule("widgets/Dialogs"),
        Mustache = brackets.getModule("thirdparty/mustache/mustache");

    // Local modules
    const RemoteCommon    = require("src/dialogs/RemoteCommon"),
        Strings           = brackets.getModule("strings");

    // Templates
    const template            = require("text!src/dialogs/templates/push-dialog.html"),
        remotesTemplate     = require("text!src/dialogs/templates/remotes-template.html");

    // Implementation
    function _attachEvents($dialog, pushConfig) {
        RemoteCommon.attachCommonEvents(pushConfig, $dialog);

        // select default - we don't want to remember forced or delete branch as default
        $dialog
            .find("input[name='strategy']")
            .filter("[value='DEFAULT']")
            .prop("checked", true);
    }

    function _show(pushConfig, resolve, reject) {
        const templateArgs = {
            config: pushConfig,
            mode: "PUSH_TO",
            modeLabel: Strings.PUSH_TO,
            Strings: Strings
        };

        const compiledTemplate = Mustache.render(template, templateArgs, {
                remotes: remotesTemplate
            }),
            dialog = Dialogs.showModalDialogUsingTemplate(compiledTemplate),
            $dialog = dialog.getElement();

        _attachEvents($dialog, pushConfig);

        dialog.done(function (buttonId) {
            if (buttonId === "ok") {
                RemoteCommon.collectValues(pushConfig, $dialog);
                resolve(pushConfig);
            } else {
                reject();
            }
        });
    }

    function show(pushConfig) {
        return new Promise((resolve, reject) => {
            pushConfig.push = true;
            // collectInfo never rejects
            RemoteCommon.collectInfo(pushConfig).then(()=>{
                _show(pushConfig, resolve, reject);
            });
        });
    }

    exports.show = show;

});
