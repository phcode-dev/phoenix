/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

/**
 * Utilities for creating and managing standard modal dialogs.
 */
define(function (require, exports, module) {


    require("utils/Global");

    let KeyBindingManager = require("command/KeyBindingManager"),
        KeyEvent          = require("utils/KeyEvent"),
        EditorManager     = require("editor/EditorManager"),
        Strings           = require("strings"),
        DialogTemplate    = require("text!htmlContent/dialog-template.html"),
        WorkspaceManager  = require("view/WorkspaceManager"),
        AppInit           = require("utils/AppInit"),
        DefaultDialogs    = require("widgets/DefaultDialogs"),
        Mustache          = require("thirdparty/mustache/mustache");

    /**
     * Dialog Buttons IDs
     * @const {string}
     */
    let DIALOG_BTN_CANCEL           = "cancel",
        DIALOG_BTN_OK               = "ok",
        DIALOG_BTN_DONTSAVE         = "dontsave",
        DIALOG_BTN_SAVE_AS          = "save_as",
        DIALOG_CANCELED             = "_canceled",
        DIALOG_BTN_DOWNLOAD         = "download";

    /**
     * Dialog Buttons Class Names
     * @const {string}
     */
    let DIALOG_BTN_CLASS_PRIMARY    = "primary",
        DIALOG_BTN_CLASS_NORMAL     = "",
        DIALOG_BTN_CLASS_LEFT       = "left";

    /**
     * The z-index used for the dialogs. Each new dialog increase this number by 2
     * @type {number}
     */
    let zIndex = 1050;

    function _isAnyDialogShown() {
        let dialogueShown = false;
        $(".modal" + ".instance").each(function () {
            if ($(this).is(":visible")) {   // Bootstrap breaks if try to hide dialog that's already hidden
                dialogueShown = true;
            }
        });
        return dialogueShown;
    }

    /**
     * @private
     * Dismises a modal dialog
     * @param {$.Element} $dlg
     * @param {string} buttonId
     */
    function _dismissDialog($dlg, buttonId) {
        $dlg.data("buttonId", buttonId);
        $dlg.modal("hide");

        if(!_isAnyDialogShown() && EditorManager.getActiveEditor()){
            EditorManager.getActiveEditor().focus();
        }
    }

    /**
     * @private
     * If autoDismiss is true, then dismisses the dialog. Otherwise just raises an event that the
     * given button was clicked.
     * @param {$.Element} $dlg The dialog element to be dismissed.
     * @param {string} buttonId The ID of the button that was clicked.
     * @param {boolean} autoDismiss Whether to autodismiss the dialog on a button click.
     */
    function _processButton($dlg, buttonId, autoDismiss) {
        if (autoDismiss) {
            _dismissDialog($dlg, buttonId);
        } else {
            $dlg.triggerHandler("buttonClick", buttonId);
        }
    }

    /**
     * @private
     * Returns true if the modal dialog has a button with the given ID
     * @param {$.Element} $dlg
     * @param {string} buttonId
     * @return {boolean}
     */
    function _hasButton($dlg, buttonId) {
        return ($dlg.find("[data-button-id='" + buttonId + "']").length > 0);
    }


    /**
     * @private
     * Handles the use of Tab so that it stays inside the Dialog
     * @param {$.Event} event
     * @param {$.Element} $dlg
     */
    function _handleTab(event, $dlg) {
        let $inputs = $(":input:enabled, a", $dlg).filter(":visible");

        function stopEvent() {
            event.stopPropagation();
            event.preventDefault();
        }

        if ($(event.target).closest($dlg).length) {
            // If it's the first or last tabbable element, focus the last/first element
            if ((!event.shiftKey && event.target === $inputs[$inputs.length - 1]) ||
                    (event.shiftKey && event.target === $inputs[0])) {
                $inputs.filter(event.shiftKey ? ":last" : ":first").focus();
                stopEvent();

            // If there is no element to focus, don't let it focus outside of the dialog
            } else if (!$inputs.length) {
                stopEvent();
            }

        // If the focus left the dialog, focus the first element in the dialog
        } else {
            $inputs.first().focus();
            stopEvent();
        }
    }


    /**
     * Handles the keyDown event for the dialogs
     * @param {$.Event} e
     * @param {boolean} autoDismiss
     * @return {boolean}
     */
    let _keydownHook = function (e, autoDismiss) {
        let $primaryBtn     = this.find(".primary"),
            buttonId        = null,
            which           = String.fromCharCode(e.which),
            $focusedElement = this.find(".dialog-button:focus, a:focus");

        function stopEvent() {
            e.preventDefault();
            e.stopPropagation();
        }

        // There might be a textfield in the dialog's UI; don't want to mistake normal typing for dialog dismissal
        let inTextArea    = (e.target.tagName === "TEXTAREA"),
            inTypingField = inTextArea || ($(e.target).filter(":text, :password").length > 0);

        if (e.which === KeyEvent.DOM_VK_TAB) {
            // We don't want to stopEvent() in this case since we might want the default behavior.
            // _handleTab takes care of stopping/preventing default as necessary.
            _handleTab(e, this);
        } else if (e.which === KeyEvent.DOM_VK_ESCAPE) {
            buttonId = DIALOG_BTN_CANCEL;
        } else if (e.which === KeyEvent.DOM_VK_RETURN && (!inTextArea || e.ctrlKey)) {
            // Enter key in single-line text input always dismisses; in text area, only Ctrl+Enter dismisses
            // Click primary
            stopEvent();
            if (e.target.tagName === "BUTTON") {
                this.find(e.target).click();
            } else if (e.target.tagName !== "INPUT") {
                // If the target element is not BUTTON or INPUT, click the primary button
                // We're making an exception for INPUT element because of this issue: GH-11416
                $primaryBtn.click();
            }
        } else if (e.which === KeyEvent.DOM_VK_SPACE) {
            if ($focusedElement.length) {
                // Space bar on focused button or link
                stopEvent();
                $focusedElement.click();
            }
        } else if (brackets.platform === "mac") {
            // CMD+Backspace Don't Save
            if (e.metaKey && (e.which === KeyEvent.DOM_VK_BACK_SPACE)) {
                if (_hasButton(this, DIALOG_BTN_DONTSAVE)) {
                    buttonId = DIALOG_BTN_DONTSAVE;
                }
            // FIXME (issue #418) CMD+. Cancel swallowed by native shell
            } else if (e.metaKey && (e.which === KeyEvent.DOM_VK_PERIOD)) {
                buttonId = DIALOG_BTN_CANCEL;
            }
        } else { // if (brackets.platform === "win") {
            // 'N' Don't Save
            if (which === "N" && !inTypingField) {
                if (_hasButton(this, DIALOG_BTN_DONTSAVE)) {
                    buttonId = DIALOG_BTN_DONTSAVE;
                }
            }
        }

        if (buttonId) {
            stopEvent();
            _processButton(this, buttonId, autoDismiss);
        }

        // Stop any other global hooks from processing the event (but
        // allow it to continue bubbling if we haven't otherwise stopped it).
        return true;
    };



    /**
     * @constructor
     * @private
     *
     * @param {$.Element} $dlg The dialog jQuery element
     * @param {$.Promise} promise A promise that will be resolved with the ID of the clicked button when the dialog
     *     is dismissed. Never rejected.
     */
    function Dialog($dlg, promise) {
        this._$dlg    = $dlg;
        this._promise = promise;
    }

    /**
     * The dialog jQuery element
     * @type {$.Element}
     */
    Dialog.prototype.getElement = function () {
        return this._$dlg;
    };

    /**
     * Determines whether the dialog is currently shown. Note that even if other dialogs occlude this dialog when
     * multiple dialogs are shown, this will still return true.
     *
     * @returns {boolean} true if the dialog is visible, false otherwise.
     */
    Dialog.prototype.isVisible = function () {
        return this._$dlg.is(":visible");
    };

    /**
     * The dialog promise
     * @type {$.Promise}
     */
    Dialog.prototype.getPromise = function () {
        return this._promise;
    };

    /**
     * Closes the dialog if is visible
     */
    Dialog.prototype.close = function () {
        if (this._$dlg.is(":visible")) {   // Bootstrap breaks if try to hide dialog that's already hidden
            _dismissDialog(this._$dlg, DIALOG_CANCELED);
        }
    };

    /**
     * Adds a done callback to the dialog promise
     */
    Dialog.prototype.done = function (callback) {
        this._promise.done(callback);
    };


    /**
     * Don't allow dialog to exceed viewport size
     */
    function setDialogMaxSize() {
        let maxWidth, maxHeight,
            $dlgs = $(".modal-inner-wrapper > .instance");

        // Verify 1 or more modal dialogs are showing
        if ($dlgs.length > 0) {
            maxWidth  = $("body").width();
            maxHeight = $("body").height();

            $dlgs.css({
                "max-width": maxWidth,
                "max-height": maxHeight,
                "overflow": "auto"
            });
        }
    }

    /**
     * Creates a new modal dialog from a given template.
     * The template can either be a string or a jQuery object representing a DOM node that is *not* in the current DOM.
     *
     * @param {string} template A string template or jQuery object to use as the dialog HTML.
     * @param {boolean=} autoDismiss Whether to automatically dismiss the dialog when one of the buttons
     *      is clicked. Default true. If false, you'll need to manually handle button clicks and the Esc
     *      key, and dismiss the dialog yourself when ready by calling `close()` on the returned dialog.
     * @return {Dialog}
     */
    function showModalDialogUsingTemplate(template, autoDismiss) {
        if (autoDismiss === undefined) {
            autoDismiss = true;
        }

        $("body").append("<div class='modal-wrapper'><div class='modal-inner-wrapper'></div></div>");

        let result  = new $.Deferred(),
            promise = result.promise(),
            $dlg    = $(template)
                .addClass("instance")
                .appendTo(".modal-inner-wrapper:last");

        // Don't allow dialog to exceed viewport size
        setDialogMaxSize();

        // Save the dialog promise for unit tests
        $dlg.data("promise", promise);

        let keydownHook = function (e) {
            return _keydownHook.call($dlg, e, autoDismiss);
        };

        // Store current focus
        let lastFocus = window.document.activeElement;

        // Pipe dialog-closing notification back to client code
        $dlg.one("hidden", function () {
            let buttonId = $dlg.data("buttonId");
            if (!buttonId) {    // buttonId will be undefined if closed via Bootstrap's "x" button
                buttonId = DIALOG_BTN_CANCEL;
            }

            // Let call stack return before notifying that dialog has closed; this avoids issue #191
            // if the handler we're triggering might show another dialog (as long as there's no
            // fade-out animation)
            window.setTimeout(function () {
                result.resolve(buttonId);
            }, 0);

            // Remove the dialog instance from the DOM.
            $dlg.remove();

            // Remove our global keydown handler.
            KeyBindingManager.removeGlobalKeydownHook(keydownHook);

            // Restore previous focus
            if (lastFocus) {
                lastFocus.focus();
            }

            //Remove wrapper
            $(".modal-wrapper:last").remove();
        }).one("shown", function () {
            let $defaultOption   = $dlg.find(".default-option"),
                $primaryBtn = $dlg.find(".primary:enabled"),
                $otherBtn   = $dlg.find(".modal-footer .dialog-button:enabled:eq(0)");

            // Set focus to the primary button, to any other button, or to the dialog depending
            // if there are buttons
            if ($defaultOption.length) {
                $defaultOption.focus();
            } else if ($primaryBtn.length) {
                $primaryBtn.focus();
            } else if ($otherBtn.length) {
                $otherBtn.focus();
            } else {
                window.document.activeElement.blur();
            }

            // Push our global keydown handler onto the global stack of handlers.
            KeyBindingManager.addGlobalKeydownHook(keydownHook);
        });

        // Click handler for buttons
        $dlg.one("click", ".dialog-button", function (e) {
            _processButton($dlg, $(this).attr("data-button-id"), autoDismiss);
        });

        // Run the dialog
        $dlg
            .modal({
                backdrop: "static",
                show: true,
                selector: ".modal-inner-wrapper:last",
                keyboard: false // handle the ESC key ourselves so we can deal with nested dialogs
            })
            // Updates the z-index of the modal dialog and the backdrop
            .css("z-index", zIndex + 1)
            .next()
            .css("z-index", zIndex);

        zIndex += 2;

        return (new Dialog($dlg, promise));
    }


    /**
     * Creates a new general purpose modal dialog using the default template and the template variables given
     * as parameters as described.
     *
     * @param {string} dlgClass A class name identifier for the dialog. Typically one of DefaultDialogs.*
     * @param {string=} title The title of the dialog. Can contain HTML markup. Defaults to "".
     * @param {string=} message The message to display in the dialog. Can contain HTML markup. Defaults to "".
     * @param {Array.<{className: string, id: string, text: string, tooltip:string}>=} buttons An array of buttons where each button
     *      has a class, id tooltip, and text property. The id is used in "data-button-id". Defaults to a single Ok button.
     *      Typically className is one of DIALOG_BTN_CLASS_*, id is one of DIALOG_BTN_*
     * @param {boolean=} autoDismiss Whether to automatically dismiss the dialog when one of the buttons
     *      is clicked. Default true. If false, you'll need to manually handle button clicks and the Esc
     *      key, and dismiss the dialog yourself when ready by calling `close()` on the returned dialog.
     * @return {Dialog}
     */
    function showModalDialog(dlgClass, title, message, buttons, autoDismiss) {
        let templateVars = {
            dlgClass: dlgClass,
            title: title   || "",
            message: message || "",
            buttons: buttons || [{ className: DIALOG_BTN_CLASS_PRIMARY, id: DIALOG_BTN_OK, text: Strings.OK }]
        };
        let template = Mustache.render(DialogTemplate, templateVars);

        return showModalDialogUsingTemplate(template, autoDismiss);
    }

    function showConfirmDialog(title, message, autoDismiss) {
        const buttons = [
            { className: DIALOG_BTN_CLASS_NORMAL, id: DIALOG_BTN_CANCEL, text: Strings.CANCEL },
            { className: DIALOG_BTN_CLASS_PRIMARY, id: DIALOG_BTN_OK, text: Strings.OK }
        ];

        return showModalDialog(DefaultDialogs.DIALOG_ID_INFO, title, message, buttons, autoDismiss);
    }

    function showInfoDialog(title, message, autoDismiss) {
        return showModalDialog(DefaultDialogs.DIALOG_ID_INFO, title, message, null, autoDismiss);
    }

    function showErrorDialog(title, message, autoDismiss) {
        return showModalDialog(DefaultDialogs.DIALOG_ID_ERROR, title, message, null, autoDismiss);
    }

    /**
     * Immediately closes any dialog instances with the given class. The dialog callback for each instance will
     * be called with the special buttonId DIALOG_CANCELED (note: callback is run asynchronously).
     * @param {string} dlgClass The class name identifier for the dialog.
     * @param {string=} buttonId The button id to use when closing the dialog. Defaults to DIALOG_CANCELED
     */
    function cancelModalDialogIfOpen(dlgClass, buttonId) {
        $("." + dlgClass + ".instance").each(function () {
            if ($(this).is(":visible")) {   // Bootstrap breaks if try to hide dialog that's already hidden
                _dismissDialog($(this), buttonId || DIALOG_CANCELED);
            }
        });
    }

    function _dontToggleWorkspacePanel() {
        return _isAnyDialogShown();
    }

    AppInit.htmlReady(function () {
        WorkspaceManager.addEscapeKeyEventHandler("ModalDialog", _dontToggleWorkspacePanel);
    });

    /**
     * Ensures that all <a> tags with a URL have a tooltip showing the same URL
     * @param {!jQueryObject|Dialog} elementOrDialog  Dialog intance, or root of other DOM tree to add tooltips to
     */
    function addLinkTooltips(elementOrDialog) {
        let $element;
        if (elementOrDialog.getElement) {
            $element = elementOrDialog.getElement().find(".dialog-message");
        } else {
            $element = elementOrDialog;
        }
        $element.find("a").each(function (index, elem) {
            let $elem = $(elem);
            let url = $elem.attr("href");
            if (url && url !== "#" && !$elem.attr("title")) {
                $elem.attr("title", url);
            }
        });
    }

    window.addEventListener("resize", setDialogMaxSize);

    exports.DIALOG_BTN_CANCEL            = DIALOG_BTN_CANCEL;
    exports.DIALOG_BTN_OK                = DIALOG_BTN_OK;
    exports.DIALOG_BTN_DONTSAVE          = DIALOG_BTN_DONTSAVE;
    exports.DIALOG_BTN_SAVE_AS           = DIALOG_BTN_SAVE_AS;
    exports.DIALOG_CANCELED              = DIALOG_CANCELED;
    exports.DIALOG_BTN_DOWNLOAD          = DIALOG_BTN_DOWNLOAD;

    exports.DIALOG_BTN_CLASS_PRIMARY     = DIALOG_BTN_CLASS_PRIMARY;
    exports.DIALOG_BTN_CLASS_NORMAL      = DIALOG_BTN_CLASS_NORMAL;
    exports.DIALOG_BTN_CLASS_LEFT        = DIALOG_BTN_CLASS_LEFT;

    exports.showModalDialog              = showModalDialog;
    exports.showConfirmDialog            = showConfirmDialog;
    exports.showInfoDialog               = showInfoDialog;
    exports.showErrorDialog              = showErrorDialog;
    exports.showModalDialogUsingTemplate = showModalDialogUsingTemplate;
    exports.cancelModalDialogIfOpen      = cancelModalDialogIfOpen;
    exports.addLinkTooltips              = addLinkTooltips;
});
