/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

/*global logger*/

/**
 * Phoenix pro pre and post promo dialogs
 * shows dialog where we give Phoenix pro to all users on app install
 * and dialogs on pro trial ends.
 *
 */

define(function (require, exports, module) {
    const KernalModeTrust = window.KernalModeTrust;
    if(!KernalModeTrust){
        // integrated extensions will have access to kernal mode, but not external extensions
        throw new Error("pro-dialogs.js should have access to KernalModeTrust. Cannot boot without trust ring");
    }

    const proTitle = `<span class="phoenix-pro-title">
                    <span class="pro-plan-name">${brackets.config.main_pro_plan}</span>
                    <i class="fa-solid fa-feather orange-gold" style="margin-left: 3px;"></i>
                </span>`,
        proTitlePlain = `<span class="pro-plan-name">${brackets.config.main_pro_plan}</span>
                    <i class="fa-solid fa-feather" style="margin-left: 2px;"></i>`;
    require("./setup-login-service"); // this adds loginService to KernalModeTrust
    const Dialogs = require("widgets/Dialogs"),
        Mustache = require("thirdparty/mustache/mustache"),
        Strings = require("strings"),
        StringUtils = require("utils/StringUtils"),
        ThemeManager = require("view/ThemeManager"),
        Metrics = require("utils/Metrics"),
        proUpgradeHTML = require("text!./html/pro-upgrade.html"),
        proEndedHTML = require("text!./html/promo-ended.html");

    // save a copy of window.fetch so that extensions wont tamper with it.
    let fetchFn = window.fetch;

    const UPSELL_TYPE_LIVE_EDIT = "live_edit";
    const UPSELL_TYPE_PRO_TRIAL_ENDED = "pro_trial_ended";
    const UPSELL_TYPE_GET_PRO = "get_pro";

    function showProTrialStartDialog(trialDays) {
        const title = StringUtils.format(Strings.PROMO_UPGRADE_TITLE, proTitle);
        const message = StringUtils.format(Strings.PROMO_UPGRADE_MESSAGE, trialDays);
        const $template = $(Mustache.render(proUpgradeHTML, {
            title, message, Strings,
            secondaryButton: Strings.PROMO_LEARN_MORE,
            primaryButton: Strings.OK
        }));
        Dialogs.showModalDialogUsingTemplate($template).done(function (id) {
            console.log("Dialog closed with id: " + id);
            Metrics.countEvent(Metrics.EVENT_TYPE.PRO, "dlgShow", "promo");
            if(id === 'secondaryButton') {
                Metrics.countEvent(Metrics.EVENT_TYPE.PRO, "dlgAct", "promoLearn");
                Phoenix.app.openURLInDefaultBrowser(brackets.config.purchase_url);
            } else {
                Metrics.countEvent(Metrics.EVENT_TYPE.PRO, "dlgAct", "promoCancel");
            }
        });
    }

    function _getUpsellDialogText(upsellType) {
        // our pro dialog has 2 flavors. Local which is shipped with the release for showing if user is offline
        // and remote which is fetched from the server if we have a remote offer to show. This fn will be called
        // by both of these flavors and we need to return the appropriate text for each.
        const buttonGetProText = StringUtils.format(Strings.PROMO_GET_APP_UPSELL_BUTTON, proTitlePlain);
        switch (upsellType) {
        case UPSELL_TYPE_PRO_TRIAL_ENDED: return {
            title: StringUtils.format(Strings.PROMO_PRO_ENDED_TITLE, proTitle),
            localDialogMessage: Strings.PROMO_ENDED_MESSAGE, // this will be shown in the local dialog
            buttonGetProText
        };
        case UPSELL_TYPE_LIVE_EDIT: return {
            title: StringUtils.format(Strings.PROMO_PRO_UNLOCK_LIVE_EDIT_TITLE, proTitle),
            localDialogMessage: Strings.PROMO_PRO_UNLOCK_MESSAGE,
            buttonGetProText
        };
        case UPSELL_TYPE_GET_PRO:
        default: return {
            title: StringUtils.format(Strings.PROMO_PRO_UNLOCK_PRO_TITLE, proTitle),
            localDialogMessage: Strings.PROMO_PRO_UNLOCK_MESSAGE,
            buttonGetProText
        };
        }
    }

    function _showLocalProEndedDialog(upsellType) {
        const dlgText = _getUpsellDialogText(upsellType);
        const title = dlgText.title;
        const buttonGetPro = dlgText.buttonGetProText;
        const $template = $(Mustache.render(proUpgradeHTML, {
            title, Strings,
            message: dlgText.localDialogMessage,
            secondaryButton: Strings.CANCEL,
            primaryButton: buttonGetPro
        }));
        Dialogs.showModalDialogUsingTemplate($template).done(function (id) {
            console.log("Dialog closed with id: " + id);
            Metrics.countEvent(Metrics.EVENT_TYPE.PRO, "dlgShow", "localUpgrade");
            if(id === 'ok') {
                Metrics.countEvent(Metrics.EVENT_TYPE.PRO, "dlgAct", "localGetPro");
                Phoenix.app.openURLInDefaultBrowser(brackets.config.purchase_url);
            } else {
                Metrics.countEvent(Metrics.EVENT_TYPE.PRO, "dlgAct", "localCancel");
            }
        });
    }

    function _showRemoteProEndedDialog(upsellType, currentVersion, promoHtmlURL, upsellPurchaseURL) {
        const dlgText = _getUpsellDialogText(upsellType);
        const title = dlgText.title;
        const buttonGetPro = dlgText.buttonGetProText;
        const currentTheme = ThemeManager.getCurrentTheme();
        const theme = currentTheme && currentTheme.dark ? "dark" : "light";
        const promoURL = `${promoHtmlURL}?lang=${
            brackets.getLocale()}&theme=${theme}&version=${currentVersion}&upsellType=${upsellType}`;
        const $template = $(Mustache.render(proEndedHTML, {Strings, title, buttonGetPro, promoURL}));
        Dialogs.showModalDialogUsingTemplate($template).done(function (id) {
            console.log("Dialog closed with id: " + id);
            Metrics.countEvent(Metrics.EVENT_TYPE.PRO, "dlgShow", "remoteUpgrade");
            if(id === 'get_pro') {
                Metrics.countEvent(Metrics.EVENT_TYPE.PRO, "dlgAct", "remoteGetPro");
                Phoenix.app.openURLInDefaultBrowser(upsellPurchaseURL || brackets.config.purchase_url);
            } else {
                Metrics.countEvent(Metrics.EVENT_TYPE.PRO, "dlgAct", "remoteCancel");
            }
        });
    }

    async function showProUpsellDialog(upsellType) {
        const currentVersion = window.AppConfig.apiVersion;

        if (!navigator.onLine) {
            _showLocalProEndedDialog(upsellType);
            return;
        }

        try {
            const configURL = `${brackets.config.promotions_url}app/config.json`;
            const response = await fetchFn(configURL);
            if (!response.ok) {
                _showLocalProEndedDialog(upsellType);
                return;
            }

            const config = await response.json();
            if (config.upsell_after_trial_url) {
                _showRemoteProEndedDialog(upsellType, currentVersion,
                    config.upsell_after_trial_url, config.upsell_purchase_url);
            } else {
                _showLocalProEndedDialog(upsellType);
            }
        } catch (error) {
            _showLocalProEndedDialog(upsellType);
        }
    }

    function showAIUpsellDialog(getAIEntitlementResponse) {
        // Only show dialog if upsellDialog field is present
        if (!getAIEntitlementResponse || !getAIEntitlementResponse.upsellDialog) {
            return;
        }

        const upsellDialog = getAIEntitlementResponse.upsellDialog;
        const title = upsellDialog.title;
        const message = upsellDialog.message;
        const buyURL = upsellDialog.buyURL;
        const needsLogin = getAIEntitlementResponse.needsLogin;

        let buttons;
        if (needsLogin || buyURL) {
            // Show primary action button and Cancel
            const primaryButtonText = needsLogin ? Strings.PROFILE_SIGN_IN : Strings.AI_LOGIN_DIALOG_BUTTON;
            buttons = [
                { className: Dialogs.DIALOG_BTN_CLASS_NORMAL, id: Dialogs.DIALOG_BTN_CANCEL, text: Strings.CANCEL },
                { className: Dialogs.DIALOG_BTN_CLASS_PRIMARY, id: "mainAction", text: primaryButtonText }
            ];
        } else {
            // Show only OK button (for disabled AI messages)
            buttons = [
                { className: Dialogs.DIALOG_BTN_CLASS_PRIMARY, id: Dialogs.DIALOG_BTN_OK, text: Strings.OK }
            ];
        }

        Dialogs.showModalDialog(Dialogs.DIALOG_ID_INFO, title, message, buttons).done(function (id) {
            Metrics.countEvent(Metrics.EVENT_TYPE.AI, "dlgUpsell", "show");
            if(id === 'mainAction') {
                if (needsLogin) {
                    Metrics.countEvent(Metrics.EVENT_TYPE.AI, "dlgUpsell", "signIn");
                    KernalModeTrust.EntitlementsManager.loginToAccount();
                } else {
                    Metrics.countEvent(Metrics.EVENT_TYPE.AI, "dlgUpsell", "buyClick");
                    Phoenix.app.openURLInDefaultBrowser(buyURL);
                }
            } else {
                Metrics.countEvent(Metrics.EVENT_TYPE.AI, "dlgUpsell", id);
            }
        });
    }

    if (Phoenix.isTestWindow) {
        window._test_pro_dlg_login_exports = {
            setFetchFn: function _setDdateNowFn(fn) {
                fetchFn = fn;
            }
        };
    }

    exports.showProTrialStartDialog = showProTrialStartDialog;
    exports.showProUpsellDialog = showProUpsellDialog;
    exports.showAIUpsellDialog = showAIUpsellDialog;
    exports.UPSELL_TYPE_PRO_TRIAL_ENDED = UPSELL_TYPE_PRO_TRIAL_ENDED;
    exports.UPSELL_TYPE_GET_PRO = UPSELL_TYPE_GET_PRO;
    exports.UPSELL_TYPE_LIVE_EDIT = UPSELL_TYPE_LIVE_EDIT;
});
