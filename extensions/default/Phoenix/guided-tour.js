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

/*globals Phoenix, JSZip, Filer*/

define(function (require, exports, module) {
    const NotificationUI = brackets.getModule("widgets/NotificationUI"),
        Strings = brackets.getModule("strings");

    function _showLivePreviewTour() {
        NotificationUI.createFromTemplate(Strings.GUIDED_FILES_SIDEBAR,
            "sidebar", {
                allowedPlacements: ['right'],
                autoCloseTimeS: 15,
                dismissOnClick: true}
        ).done(()=>{
            NotificationUI.createFromTemplate(Strings.GUIDED_LIVE_PREVIEW,
                "main-toolbar", {
                    allowedPlacements: ['left'],
                    autoCloseTimeS: 15,
                    dismissOnClick: true}
            ).done(()=>{
                NotificationUI.createFromTemplate(Strings.NEW_PROJECT_NOTIFICATION,
                    "newProject", {
                        allowedPlacements: ['top', 'bottom'],
                        autoCloseTimeS: 15,
                        dismissOnClick: true}
                );
            });
        });
    }

    exports.startTour = async function () {
        _showLivePreviewTour();
    };
});
