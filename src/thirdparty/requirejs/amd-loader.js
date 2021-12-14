/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * based on amd-loader require-js plugin
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

define(function() {
    var loader = function(pluginId, ext, allowExts, compile) {
        if (arguments.length == 3) {
            compile = allowExts;
            allowExts = undefined;
        }
        else if (arguments.length == 2) {
            compile = ext;
            ext = allowExts = undefined;
        }

        return {
            buildCache: {},
            load: function(name, req, load, config) {
                var path = req.toUrl(name);
                var queryString = '';
                if (path.indexOf('?') != -1) {
                    queryString = path.substr(path.indexOf('?'));
                    path = path.substr(0, path.length - queryString.length);
                }

                // precompiled -> load from .ext.js extension
                if (config.precompiled instanceof Array) {
                    for (let i = 0; i < config.precompiled.length; i++)
                        if (path.substr(0, config.precompiled[i].length) == config.precompiled[i])
                            return require([path + '.' + pluginId + '.js' + queryString], load, load.error);
                }
                else if (config.precompiled === true)
                    return require([path + '.' + pluginId + '.js' + queryString], load, load.error);

                // only add extension if a moduleID not a path
                if (ext && name.substr(0, 1) != '/' && !name.match(/:\/\//)) {
                    var validExt = false;
                    if (allowExts) {
                        for (let i = 0; i < allowExts.length; i++) {
                            if (name.substr(name.length - allowExts[i].length - 1) == '.' + allowExts[i])
                                validExt = true;
                        }
                    }
                    if (!validExt)
                        path += '.' + ext + queryString;
                    else
                        path += queryString;
                }
                else {
                    path += queryString;
                }


                var self = this;

                loader.fetch(path, function(source) {
                    compile(name, source, req, function(compiled) {
                        if (typeof compiled == 'string') {
                            if (config.isBuild)
                                self.buildCache[name] = compiled;
                            load.fromText(compiled);
                        }
                        else
                            load(compiled);
                    }, load.error, config);
                }, load.error);
            },
            write: function(pluginName, moduleName, write) {
                var compiled = this.buildCache[moduleName];
                if (compiled)
                    write.asModule(pluginName + '!' + moduleName, compiled);
            },
            writeFile: function(pluginName, name, req, write) {
                write.asModule(pluginName + '!' + name, req.toUrl(name + '.' + pluginId + '.js'), this.buildCache[name]);
            }
        };
    }

    loader.fetch = function(path, callback) {
        fs.readFile(path, 'utf8', function (_err, _data) {
            if (_err) {
                callback(_err);
            } else {
                // add sourcemap
                _data = _data + `\n//# sourceURL=${new URL(path, window.location.href)}`;
                callback(_data);
            }
        });
    }

    return loader;
});
