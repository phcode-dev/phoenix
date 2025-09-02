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
                </span>`;
    require("./setup-login-service"); // this adds loginService to KernalModeTrust
    const Dialogs = require("widgets/Dialogs"),
        Mustache = require("thirdparty/mustache/mustache"),
        Strings = require("strings"),
        StringUtils = require("utils/StringUtils"),
        proUpgradeHTML = require("text!./html/pro-upgrade.html");

    function showProUpgradeDialog(trialDays) {
        const title = StringUtils.format(Strings.PROMO_UPGRADE_TITLE, proTitle);
        const message = StringUtils.format(Strings.PROMO_UPGRADE_MESSAGE, trialDays);
        const $template = $(Mustache.render(proUpgradeHTML, {title, message, Strings}));
        Dialogs.showModalDialogUsingTemplate($template).done(function (id) {
            console.log("Dialog closed with id: " + id);
            if(id === 'learn_more') {
                Phoenix.app.openURLInDefaultBrowser(brackets.config.homepage_url);
            }
        });
    }

    exports.showProUpgradeDialog = showProUpgradeDialog;
});
