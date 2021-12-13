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
 * You should have received a copy of the GNU Affero General Public License along
 * with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

define(['./amd-loader'], function(amdLoader) {
    var cjsRequireRegExp = /\s*require\s*\(\s*["']([^'"\s]+)["']\s*\)/g;

    return amdLoader('extension-loader', 'js', function(name, source, req, callback, errback, config) {
        var globalRequire = getPluginGlobalRequire(config);

        // Replace sub-dependencies require's using this plugin, except if they are listed in require.config.cjs2config.globalRequire.
        source = source.replace(cjsRequireRegExp, function (match, dep) {
            return ' require("' + (globalRequire.includes(dep) ? '' : 'extension-loader!') + dep + '")';
        });
        callback(source);
    });

    function getPluginGlobalRequire(config) {
        return getPluginConfig(config).globalRequire || [];
    }

    function getPluginConfig(config) {
        return config.cjs2config || {};
    }
});
