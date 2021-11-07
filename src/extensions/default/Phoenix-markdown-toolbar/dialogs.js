/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, brackets */

define(function (require, exports, module) {
    "use strict";

    var Dialogs    = brackets.getModule("widgets/Dialogs"),
        FileSystem = brackets.getModule("filesystem/FileSystem"),
        Mustache   = brackets.getModule("thirdparty/mustache/mustache");

    var Strings              = require("strings"),
        _pathDialogTemplate = require("text!templates/path-dialog.html");

    function getRelativeFilename(basePath, filename) {
        if (basePath.endsWith('/')) {
            basePath = basePath.slice(0, basePath.length - 1);
        }
        var basename = filename.slice(filename.lastIndexOf('/') + 1);
        var dirname = filename.slice(0, filename.lastIndexOf('/') + 1);
        var relapath = "";
        while (!dirname.startsWith(basePath)) {
            relapath = relapath + "../";
            basePath = basePath.slice(0, basePath.lastIndexOf('/'));
        }
        return relapath + dirname.slice(basePath.length + 1) + basename;
    }
    
    function getRelativeFile(basePath, cb) {
        FileSystem.showOpenDialog(false, false, "Select file", null, null, function (err, files) {
            if (files && files[0]) {
                cb(getRelativeFilename(basePath, files[0]));
            } else {
                cb("");
            }
        });
    }
    
    function displayPathDialog(editor, templateVars, fn) {
        var selection = editor.getSelection();
        templateVars.textInit = editor.document.getRange(selection.start, selection.end);
        templateVars.pathInit = (templateVars.textInit.includes("://")) ? templateVars.textInit : "";
        var dialog = Dialogs.showModalDialogUsingTemplate(Mustache.render(_pathDialogTemplate, templateVars));
        var textField = dialog.getElement().find(".input-text");
        var pathField = dialog.getElement().find(".input-path");
        var fileButton = dialog.getElement().find("#choose-file");
        fileButton.on("click", function () {
            getRelativeFile(editor.getFile().parentPath, function (filename) {
                pathField.val(filename);
            });
        });
        dialog.done(function (buttonId) {
            if (buttonId === Dialogs.DIALOG_BTN_OK) {
                fn(textField.val(), pathField.val());
            }
        });
    }
    
    exports.image = function (editor) {
        var templateVars = {
            Strings: Strings,
            dialogTitle: Strings.IMAGE_DIALOG,
            textTitle: Strings.IMAGE_TEXT_TITLE,
            textPlaceholder: Strings.IMAGE_TEXT_PLACEHOLDER,
            pathTitle: Strings.IMAGE_PATH_TITLE,
            pathPlaceholder: Strings.IMAGE_PATH_PLACEHOLDER
        };
        var selection = editor.getSelection();
        displayPathDialog(editor, templateVars, function (textField, pathField) {
            var imageString = "![" + textField + "](" + pathField + ")";
            editor.document.replaceRange(imageString, selection.start, selection.end, "+mdbar");
        });
    };
    
    exports.link = function (editor) {
        var templateVars = {
            Strings: Strings,
            dialogTitle: Strings.LINK_DIALOG,
            textTitle: Strings.LINK_TEXT_TITLE,
            textPlaceholder: Strings.LINK_TEXT_PLACEHOLDER,
            pathTitle: Strings.LINK_PATH_TITLE,
            pathPlaceholder: Strings.LINK_PATH_PLACEHOLDER
        };
        var selection = editor.getSelection();
        displayPathDialog(editor, templateVars, function (textField, pathField) {
            var linkString = "[" + textField + "](" + pathField + ")";
            editor.document.replaceRange(linkString, selection.start, selection.end, "+mdbar");
        });
    };
});
