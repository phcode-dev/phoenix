/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
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

define(function (require, exports, module) {


    var AppInit                 = require("utils/AppInit"),
        BuildInfoUtils          = require("utils/BuildInfoUtils"),
        CommandManager          = require("command/CommandManager"),
        Commands                = require("command/Commands"),
        Dialogs                 = require("widgets/Dialogs"),
        FileUtils               = require("file/FileUtils"),
        NativeApp               = require("utils/NativeApp"),
        Strings                 = require("strings"),
        StringUtils             = require("utils/StringUtils"),
        UpdateNotification      = require("utils/UpdateNotification"),
        AboutDialogTemplate     = require("text!htmlContent/about-dialog.html"),
        ContributorsTemplate    = require("text!htmlContent/contributors-list.html"),
        Mustache                = require("thirdparty/mustache/mustache");
    // make sure the global brackets variable is loaded
    require("utils/Global");

    /**
     * This is the thirdparty API's (GitHub) maximum contributors per page limit
     * @const {number}
     */
    var CONTRIBUTORS_PER_PAGE   = 100;

    var buildInfo;


    function _handleCheckForUpdates() {
        UpdateNotification.checkForUpdate(true);
    }

    function _handleLinkMenuItem(url) {
        return function () {
            if (!url) {
                return;
            }
            NativeApp.openURLInDefaultBrowser(url);
        };
    }

    function _handleShowExtensionsFolder() {
        brackets.app.showExtensionsFolder(
            FileUtils.convertToNativePath(decodeURI(window.location.href)),
            function (err) {} /* Ignore errors */
        );
    }

    function _handleAboutDialog() {
        var templateVars = {
            ABOUT_ICON: brackets.config.about_icon,
            APP_NAME_ABOUT_BOX: brackets.config.app_name_about,
            BUILD_TIMESTAMP: brackets.config.build_timestamp,
            BUILD_INFO: buildInfo || "",
            Strings: Strings
        };

        Dialogs.showModalDialogUsingTemplate(Mustache.render(AboutDialogTemplate, templateVars));

        // Get containers
        var $dlg            = $(".about-dialog.instance"),
            $contributors   = $dlg.find(".about-contributors"),
            $spinner        = $dlg.find(".spinner"),
            contributorsUrl = brackets.config.contributors_url,
            page;

        if (contributorsUrl.indexOf("{1}") !== -1) { // pagination enabled
            page = 1;
        }

        $spinner.addClass("spin");

        function loadContributors(rawUrl, page, contributors, deferred) {
            deferred = deferred || new $.Deferred();
            contributors = contributors || [];
            var url = StringUtils.format(rawUrl, CONTRIBUTORS_PER_PAGE, page);

            $.ajax({
                url: url,
                dataType: "json",
                cache: false
            })
                .done(function (response) {
                    contributors = contributors.concat(response || []);
                    if (page && response.length === CONTRIBUTORS_PER_PAGE) {
                        loadContributors(rawUrl, page + 1, contributors, deferred);
                    } else {
                        deferred.resolve(contributors);
                    }
                })
                .fail(function () {
                    if (contributors.length) { // we weren't able to fetch this page, but previous fetches were successful
                        deferred.resolve(contributors);
                    } else {
                        deferred.reject();
                    }
                });
            return deferred.promise();
        }

        loadContributors(contributorsUrl, page) // Load the contributors
            .done(function (allContributors) {
                // Populate the contributors data
                var totalContributors = allContributors.length,
                    contributorsCount = 0;

                allContributors.forEach(function (contributor) {
                    // remove any UrlParams delivered via the GitHub API
                    contributor.avatar_url = contributor.avatar_url.split("?")[0];
                });

                $contributors.html(Mustache.render(ContributorsTemplate, allContributors));

                // This is used to create an opacity transition when each image is loaded
                $contributors.find("img").one("load", function () {
                    $(this).css("opacity", 1);

                    // Count the contributors loaded and hide the spinner once all are loaded
                    contributorsCount++;
                    if (contributorsCount >= totalContributors) {
                        $spinner.removeClass("spin");
                    }
                }).each(function () {
                    if (this.complete) {
                        $(this).trigger("load");
                    }
                });
            })
            .fail(function () {
                $spinner.removeClass("spin");
                $contributors.html(Mustache.render("<p class='dialog-message'>{{ABOUT_TEXT_LINE6}}</p>", Strings));
            });
    }

    // Read "build number" SHAs off disk immediately at APP_READY, instead
    // of later, when they may have been updated to a different version
    AppInit.appReady(function () {
        BuildInfoUtils.getBracketsSHA().done(function (branch, sha, isRepo) {
            // If we've successfully determined a "build number" via .git metadata, add it to dialog
            sha = sha ? sha.substr(0, 9) : "";
            if (branch || sha) {
                buildInfo = StringUtils.format("({0} {1})", branch, sha).trim();
            }
        });
    });

    CommandManager.register(Strings.CMD_CHECK_FOR_UPDATE,       Commands.HELP_CHECK_FOR_UPDATE,     _handleCheckForUpdates);
    CommandManager.register(Strings.CMD_HOW_TO_USE_BRACKETS,    Commands.HELP_HOW_TO_USE_BRACKETS,  _handleLinkMenuItem(brackets.config.how_to_use_url));
    CommandManager.register(Strings.CMD_SUPPORT,                Commands.HELP_SUPPORT,              _handleLinkMenuItem(brackets.config.support_url));
    CommandManager.register(Strings.CMD_SUGGEST,                Commands.HELP_SUGGEST,              _handleLinkMenuItem(brackets.config.suggest_feature_url));
    CommandManager.register(Strings.CMD_RELEASE_NOTES,          Commands.HELP_RELEASE_NOTES,        _handleLinkMenuItem(brackets.config.release_notes_url));
    CommandManager.register(Strings.CMD_GET_INVOLVED,           Commands.HELP_GET_INVOLVED,         _handleLinkMenuItem(brackets.config.get_involved_url));
    CommandManager.register(Strings.CMD_SHOW_EXTENSIONS_FOLDER, Commands.HELP_SHOW_EXT_FOLDER,      _handleShowExtensionsFolder);
    CommandManager.register(Strings.CMD_HOMEPAGE,               Commands.HELP_HOMEPAGE,             _handleLinkMenuItem(brackets.config.homepage_url));
    CommandManager.register(Strings.CMD_TWITTER,                Commands.HELP_TWITTER,              _handleLinkMenuItem(brackets.config.twitter_url));
    CommandManager.register(Strings.CMD_ABOUT,                  Commands.HELP_ABOUT,                _handleAboutDialog);
});
