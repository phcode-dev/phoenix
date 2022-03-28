/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2018 - 2021 Adobe Systems Incorporated. All rights reserved.
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


    var AppInit         = brackets.getModule("utils/AppInit"),
        QuickOpen       = brackets.getModule("search/QuickOpen"),
        PathUtils       = brackets.getModule("thirdparty/path-utils/path-utils"),
        CommandManager  = brackets.getModule("command/CommandManager"),
        Commands        = brackets.getModule("command/Commands"),
        ExtensionUtils = brackets.getModule("utils/ExtensionUtils"),
        WorkingSetView = brackets.getModule("project/WorkingSetView"),
        MainViewManager = brackets.getModule("view/MainViewManager"),
        Menus           = brackets.getModule("command/Menus");

    var HTTP_PROTOCOL = "http:",
        HTTPS_PROTOCOL = "https:";

    ExtensionUtils.loadStyleSheet(module, "styles.css");

    function protocolClassProvider(data) {
        if (data.fullPath.startsWith("http://")) {
            return "http";
        }

        if (data.fullPath.startsWith("https://")) {
            return "https";
        }

        return "";
    }

    /**
     * Disable context menus which are not useful for remote file
     */
    function _setMenuItemsVisible() {
        var file = MainViewManager.getCurrentlyViewedFile(MainViewManager.ACTIVE_PANE),
            cMenuItems = [Commands.FILE_SAVE, Commands.FILE_RENAME, Commands.NAVIGATE_SHOW_IN_FILE_TREE, Commands.NAVIGATE_SHOW_IN_OS],
            // Enable menu options when no file is present in active pane
            enable = !file || (file.constructor.name !== "RemoteFile");

            // Enable or disable commands based on whether the file is a remoteFile or not.
        cMenuItems.forEach(function (item) {
            CommandManager.get(item).setEnabled(enable);
        });
    }

    function _getGitHubRawURL(urlObject) {
        let pathVector = urlObject.pathname.split("/");
        let BLOB_STRING_LOCATION = 3;
        if(pathVector.length>BLOB_STRING_LOCATION+1 && pathVector[BLOB_STRING_LOCATION] === "blob"){
            // Github blob URL of the form https://github.com/brackets-cont/brackets/blob/master/.gitignore
            // transform to https://raw.githubusercontent.com/brackets-cont/brackets/master/.gitignore
            pathVector.splice(BLOB_STRING_LOCATION,1);
            let newPath = pathVector.join("/");
            return `https://raw.githubusercontent.com${newPath}`;
        }

        return urlObject.href;
    }

    function _getGitLabRawURL(urlObject) {
        // Gitlab does not specify CORS, so this wont work in phoenix, but will work in brackets for now
        let pathVector = urlObject.pathname.split("/");
        let BLOB_STRING_LOCATION = 4;
        if(pathVector.length>BLOB_STRING_LOCATION+1 && pathVector[BLOB_STRING_LOCATION] === "blob"){
            // GitLab blob URL of the form https://gitlab.com/gitlab-org/gitlab-foss/-/blob/master/.codeclimate.yml
            // transform to https://gitlab.com/gitlab-org/gitlab-foss/-/raw/master/.codeclimate.yml
            pathVector[BLOB_STRING_LOCATION] = "raw";
            let newPath = pathVector.join("/");
            return `https://gitlab.com${newPath}`;
        }

        return urlObject.href;
    }

    /**
     * Checks the URL to see if it is from known code URL sites(Eg. Github) and transforms
     * it into URLs to fetch raw code.
     * @param url
     * @private
     * @return code URL if transformed, else returns the arg URL as is
     */
    function _getRawURL(url) {
        let urlObject = new URL(url);
        switch (urlObject.hostname) {
        case "github.com": return _getGitHubRawURL(urlObject);
        case "gitlab.com": return _getGitLabRawURL(urlObject);
        default: return url;
        }
    }

    AppInit.htmlReady(function () {

        Menus.getContextMenu(Menus.ContextMenuIds.WORKING_SET_CONTEXT_MENU).on("beforeContextMenuOpen", _setMenuItemsVisible);
        MainViewManager.on("currentFileChange", _setMenuItemsVisible);

        // Register as quick open plugin for file URI's having HTTP:|HTTPS: protocol
        QuickOpen.addQuickOpenPlugin(
            {
                name: "Remote file URI input",
                languageIds: [], // for all language modes
                search: function () {
                    return $.Deferred().resolve([arguments[0]]);
                },
                match: function (query) {
                    var protocol = PathUtils.parseUrl(query).protocol;
                    return [HTTP_PROTOCOL, HTTPS_PROTOCOL].indexOf(protocol) !== -1;
                },
                itemFocus: function (query) {
                    // no op
                },
                itemSelect: function () {
                    CommandManager.execute(Commands.FILE_OPEN, {fullPath: _getRawURL(arguments[0])});
                }
            }
        );

        WorkingSetView.addClassProvider(protocolClassProvider);
    });

});
