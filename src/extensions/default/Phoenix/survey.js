/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

define(function (require, exports, module) {

    const TIME_TO_WAIT_BEFORE_SURVEY_SHOW_SEC = 120,
        SHOWN_VERSION='v2'; // If you like to show the same survey again, just increase the version number to v2...
    let Dialogs     = brackets.getModule("widgets/Dialogs"),
        Mustache           = brackets.getModule("thirdparty/mustache/mustache"),
        SurveyTemplate     = require("text!survey-template.html"),
        Strings            = brackets.getModule("strings");


    function _showSurvey() {
        var templateVars = {
            Strings: Strings,
            surveyURL: "https://s.surveyplanet.com/6208d1eccd51c561fc8e59ca"
        };
        let isShown = localStorage.getItem(templateVars.surveyURL) === SHOWN_VERSION;
        if(!isShown){
            Dialogs.showModalDialogUsingTemplate(Mustache.render(SurveyTemplate, templateVars));
            localStorage.setItem(templateVars.surveyURL, SHOWN_VERSION);
        }
    }

    exports.init = function () {
        setTimeout(_showSurvey, TIME_TO_WAIT_BEFORE_SURVEY_SHOW_SEC * 1000);
    };
});
