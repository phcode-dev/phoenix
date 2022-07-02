define(["require", "exports", './presets'], function (require, exports, presets_1) {
    var PresetDictionary = (function () {
        function PresetDictionary() {
            this.extensions = {};
            this.prefixes = {};
            this.fullFileNames = {};
            this.fileNames = {};
            this.fillMap(this.extensions, presets_1.setExtensions);
            this.fillMap(this.prefixes, presets_1.setPrefixes);
            this.fillMap(this.fullFileNames, presets_1.setFullFileNames);
            this.fillMap2D(this.fileNames, presets_1.setFileNames);
            this.emptyItem = presets_1.getDefault();
            this.makeStrict(this.emptyItem);
        }

        PresetDictionary.prototype.findExtension = function (extension) {
            return this.extensions[extension];
        };
        PresetDictionary.prototype.findExtensionPrefix = function (extension) {
            return this.prefixes[extension];
        };
        PresetDictionary.prototype.findFullFileName = function (fileName) {
            return this.fullFileNames[fileName];
        };
        PresetDictionary.prototype.findFileName = function (fileName, extension) {
            var map = this.fileNames[fileName];
            if (map === undefined) {
                return undefined;
            }
            if (map[extension] !== undefined) {
                return map[extension];
            }
            return map[''];
        };
        PresetDictionary.prototype.getEmptyItem = function (fileName) {
            return this.emptyItem;
        };
        PresetDictionary.prototype.makeStrict = function (icon) {
            for (var _i = 0, _a = Object.keys(icon); _i < _a.length; _i++) {
                var key = _a[_i];
                if (typeof icon[key] === 'string') {
                    icon[key] = [icon[key]];
                }
            }
        };
        PresetDictionary.prototype.fillMap = function (map, fill) {
            var _this = this;
            fill(function (keys, icon) {
                _this.makeStrict(icon);
                if (typeof keys === 'string') {
                    map[keys] = icon;
                } else {
                    for (var _i = 0; _i < keys.length; _i++) {
                        var key = keys[_i];
                        map[key] = icon;
                    }
                }
            });
        };
        PresetDictionary.prototype.fillMap2D = function (map, fill) {
            var _this = this;

            function set(key, extensions, icon) {
                var item = map[key];
                if (item === undefined) {
                    item = map[key] = {};
                }
                if (extensions === undefined) {
                    item[''] = icon;
                } else {
                    for (var _i = 0; _i < extensions.length; _i++) {
                        var ext = extensions[_i];
                        item[ext] = icon;
                    }
                }
            }

            fill(function (keys, extensions, icon) {
                _this.makeStrict(icon);
                if (typeof keys === 'string') {
                    set(keys, extensions, icon);
                } else {
                    for (var _i = 0; _i < keys.length; _i++) {
                        var key = keys[_i];
                        set(key, extensions, icon);
                    }
                }
            });
        };
        return PresetDictionary;
    }());
    exports.PresetDictionary = PresetDictionary;
    exports.presets = new PresetDictionary();
});
