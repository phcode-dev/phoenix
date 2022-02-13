/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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

    const TIME_TO_WAIT_BEFORE_SURVEY_SHOW_SEC = 30;
    let AppInit                 = brackets.getModule("utils/AppInit");


    function _showSurvey() {
        let surveyMonkey = function(t,e,s,o){
            // script as given by surevey monkey
            var n,a,c;
            t.SMCX=t.SMCX||[],e.getElementById(o)||(n=e.getElementsByTagName(s),a=n[n.length-1],c=e.createElement(s),c.type="text/javascript",c.async=!0,c.id=o,c.src="https://widget.surveymonkey.com/collect/website/js/tRaiETqnLgj758hTBazgdwFlTpaQhrYTJNQLdbwJd7pfIpdamVfSxCdC_2Bcj5ebY9.js",a.parentNode.insertBefore(c,a)); //NOSONAR
        };
        surveyMonkey(window, document, "script", "smcx-sdk");
    }

    AppInit.appReady(function () {
        setTimeout(_showSurvey, TIME_TO_WAIT_BEFORE_SURVEY_SHOW_SEC * 1000);
    });
});
