define(function (require, exports) {

    // Brackets modules
    const Dialogs = brackets.getModule("widgets/Dialogs"),
        Mustache = brackets.getModule("thirdparty/mustache/mustache");

    // Local modules
    const RemoteCommon    = require("src/dialogs/RemoteCommon"),
        Strings           = brackets.getModule("strings");

    // Templates
    const template            = require("text!src/dialogs/templates/clone-dialog.html");

    // Module variables
    let $cloneInput;

    // Implementation
    function _attachEvents($dialog) {
        // Detect changes to URL, disable auth if not http
        $cloneInput.on("keyup change", function () {
            var $authInputs = $dialog.find("input[name='username'],input[name='password'],input[name='saveToUrl']");
            if ($(this).val().length > 0) {
                if (/^https?:/.test($(this).val())) {
                    $authInputs.prop("disabled", false);

                    // Update the auth fields if the URL contains auth
                    var auth = /:\/\/([^:]+):?([^@]*)@/.exec($(this).val());
                    if (auth) {
                        $("input[name=username]", $dialog).val(auth[1]);
                        $("input[name=password]", $dialog).val(auth[2]);
                    }
                } else {
                    $authInputs.prop("disabled", true);
                }
            } else {
                $authInputs.prop("disabled", false);
            }
        });
        $cloneInput.focus();
    }

    function show() {
        return new Promise((resolve, reject)=>{
            const templateArgs = {
                modeLabel: Strings.CLONE_REPOSITORY,
                Strings: Strings
            };

            var compiledTemplate = Mustache.render(template, templateArgs),
                dialog = Dialogs.showModalDialogUsingTemplate(compiledTemplate),
                $dialog = dialog.getElement();

            $cloneInput = $dialog.find("#git-clone-url");

            _attachEvents($dialog);

            dialog.done(function (buttonId) {
                if (buttonId === "ok") {
                    var cloneConfig = {};
                    cloneConfig.remote = "origin";
                    cloneConfig.remoteUrl = $cloneInput.val();
                    RemoteCommon.collectValues(cloneConfig, $dialog);
                    resolve(cloneConfig);
                } else {
                    reject();
                }
            });

        });
    }

    exports.show = show;
});
