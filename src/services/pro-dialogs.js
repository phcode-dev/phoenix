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
    const proTitle = `<span class="phoenix-pro-title">
                    <span class="pro-plan-name">Phoenix Pro</span>
                    <i class="fa-solid fa-feather orange-gold" style="margin-left: 3px;"></i>
                </span>`,
        proTitlePlain = `<span class="pro-plan-name">Phoenix Pro</span>
                    <i class="fa-solid fa-feather" style="margin-left: 2px;"></i>`;
    require("./setup-login-service"); // this adds loginService to KernalModeTrust
    const Dialogs = require("widgets/Dialogs"),
        Mustache = require("thirdparty/mustache/mustache"),
        Strings = require("strings"),
        StringUtils = require("utils/StringUtils"),
        ThemeManager = require("view/ThemeManager"),
        proUpgradeHTML = require("text!./html/pro-upgrade.html"),
        proEndedHTML = require("text!./html/promo-ended.html");

    function showProUpgradeDialog(trialDays) {
        const title = StringUtils.format(Strings.PROMO_UPGRADE_TITLE, proTitle);
        const message = StringUtils.format(Strings.PROMO_UPGRADE_MESSAGE, trialDays);
        const $template = $(Mustache.render(proUpgradeHTML, {title, message, Strings}));
        Dialogs.showModalDialogUsingTemplate($template).done(function (id) {
            console.log("Dialog closed with id: " + id);
            if(id === 'learn_more') {
                // todo add metrics
                Phoenix.app.openURLInDefaultBrowser(brackets.config.purchase_url);
            }
        });
    }

    function showProEndedDialog(currentVersion) {
        currentVersion = currentVersion || window.AppConfig.apiVersion;
        const buttonGetPro = StringUtils.format(Strings.PROMO_GET_APP_UPSELL_BUTTON, proTitlePlain);
        const title = StringUtils.format(Strings.PROMO_PRO_ENDED_TITLE, proTitle);
        const currentTheme = ThemeManager.getCurrentTheme();
        const theme = currentTheme && currentTheme.dark ? "dark" : "light";
        const promoURL = `${brackets.config.promotions_url}app/upsell_after_trial.html?lang=${brackets.getLocale()}&theme=${theme}&version=${currentVersion}`;
        const $template = $(Mustache.render(proEndedHTML, {Strings, title, buttonGetPro, promoURL}));
        Dialogs.showModalDialogUsingTemplate($template).done(function (id) {
            console.log("Dialog closed with id: " + id);
            if(id === 'get_pro') {
                // todo add metrics
                Phoenix.app.openURLInDefaultBrowser(brackets.config.purchase_url);
            }
        });
    }

    exports.showProUpgradeDialog = showProUpgradeDialog;
    exports.showProEndedDialog = showProEndedDialog;
});
