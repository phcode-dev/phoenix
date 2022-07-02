define(["require", "exports", './preset-dictionary', './user-dictionary'], function (require, exports, preset_dictionary_1, user_dictionary_1) {
    var IconDictionary = (function () {
        function IconDictionary(settings) {
            if (settings === void 0) {
                settings = {};
            }
            this.color = 0;
            this.iconSet = 1;
            this.secondary = true;
            this.user = new user_dictionary_1.UserDictionary(settings);
        }

        IconDictionary.prototype.toIcon = function (preset) {
            if (preset === undefined) {
                return undefined;
            }
            var iconData = preset[this.iconSet];
            var colorData = preset[this.color];
            if (iconData === undefined || colorData === undefined) {
                return undefined;
            }
            return {
                icon: iconData[0],
                size: iconData[1],
                color: colorData[0]
            };
        };
        IconDictionary.prototype.findExtension = function (extension) {
            var match = this.user.findExtension(extension);
            if (match !== undefined) {
                return match;
            }
            return this.toIcon(preset_dictionary_1.presets.findExtension(extension));
        };
        IconDictionary.prototype.findExtensionPrefix = function (extension) {
            var match = this.user.findExtensionPrefix(extension);
            if (match !== undefined) {
                return match;
            }
            return this.toIcon(preset_dictionary_1.presets.findExtensionPrefix(extension));
        };
        IconDictionary.prototype.findFullFileName = function (fileName) {
            var match = this.user.findFullFileName(fileName);
            if (match !== undefined) {
                return match;
            }
            return this.toIcon(preset_dictionary_1.presets.findFullFileName(fileName));
        };
        IconDictionary.prototype.findFileName = function (fileName, extension) {
            var match = this.user.findFileName(fileName, extension);
            if (match !== undefined) {
                return match;
            }
            return this.toIcon(preset_dictionary_1.presets.findFileName(fileName, extension));
        };
        IconDictionary.prototype.getEmptyItem = function (fileName) {
            var preset = preset_dictionary_1.presets.getEmptyItem(fileName);
            var color;
            var icon = preset[this.iconSet][0];
            var size = preset[this.iconSet][1];
            var dotIndex = fileName.lastIndexOf('.');
            if (dotIndex === -1) {
                return {
                    icon: icon,
                    size: size,
                    color: '#fff'
                };
            }
            var extension = fileName.substring(dotIndex + 1);
            var hue = 0;
            var saturnation = 90;
            var lightness = 50;
            for (var i = 0; i < extension.length; ++i) {
                hue += extension.charCodeAt(i) * 42 * (i + 2);
                hue %= 256;
                saturnation = (saturnation + (extension.charCodeAt(i) % 30) + 70) / 2;
                lightness = (lightness + (extension.charCodeAt(i) * 3 % 40) + 30) / 2;
            }
            return {
                color: 'hsl(' + Math.round(hue) + ', ' + Math.round(saturnation) + '%, ' + Math.round(lightness) + '%)',
                icon: icon,
                size: size
            };
        };
        return IconDictionary;
    }());
    exports.IconDictionary = IconDictionary;
});
