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


/**
 *  Integrated extensions are special core extensions directly loaded through this file.
 *  While this can be also put into `extensions/default` folder with minimal effort,
 *  To increase boot speed, we merge all essential phcode extensions in this folder so that
 *  the build tooling can inline these into a single js file for prod builds.
 *
 *  All core extensions that gets loaded for the 80% userbase must prefer this loading
 *  instead of default extensions folder.
 */
define(function (require, exports, module) {
    require("./icons/main");
    require("./RemoteFileAdapter/main");
    require("./QuickOpen/main");
    require("./Phoenix/main");
    require("./InAppNotifications/main");
    require("./NoDistractions/main");
    require("./Phoenix-live-preview/main");
    require("./NavigationAndHistory/main");
    require("./RecentProjects/main");
    require("./DisplayShortcuts/main");
    require("./appUpdater/main");
    require("./htmlTagSyncEdit/main");
});
