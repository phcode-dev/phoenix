/**
 * Brackets Themes Copyright (c) 2014 Miguel Castillo.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

define(function (require, exports, module) {


    let _                   = require("thirdparty/lodash"),
        Mustache            = require("thirdparty/mustache/mustache"),
        Dialogs             = require("widgets/Dialogs"),
        Strings             = require("strings"),
        ViewCommandHandlers = require("view/ViewCommandHandlers"),
        settingsTemplate    = require("text!htmlContent/themes-settings.html"),
        PreferencesManager  = require("preferences/PreferencesManager"),
        CommandManager      = require("command/CommandManager"),
        Commands            = require("command/Commands"),
        prefs               = PreferencesManager.getExtensionPrefs("themes");

    /**
     * @type {Object}
     * Currently loaded themes that are available to choose from.
     */
    let loadedThemes = {};

    const SYSTEM_DEFAULT_THEME = "system-default";

    /**
     * Object with all default values that can be configure via the settings UI
     */
    const DEFAULTS = {
        themeScrollbars: true,
        theme: SYSTEM_DEFAULT_THEME,
        lightTheme: "light-theme",
        darkTheme: "dark-theme"
    };


    /**
     * Cached html settings jQuery object for easier processing when opening the settings dialog
     */
    var $settings = $(settingsTemplate).addClass("themeSettings");

    /**
     * @private
     * Gets all the configurable settings that need to be loaded in the settings dialog
     *
     * @return {Object} a collection with all the settings
     */
    function getValues() {
        var result = {};

        Object.keys(DEFAULTS).forEach(function (key) {
            result[key] = prefs.get(key);
        });

        result.fontFamily = ViewCommandHandlers.getFontFamily();
        result.fontSize   = ViewCommandHandlers.getFontSize();
        result.validFontSizeRegExp = ViewCommandHandlers.validFontSizeRegExp;
        return result;
    }

    /**
     * Opens the settings dialog
     */
    function showDialog() {
        const currentSettings = getValues(),
            newSettings     = {},
            themes          = _.map(loadedThemes, function (theme) { return theme; });
        // Insert system default theme
        themes.unshift({
            displayName: Strings.SYSTEM_DEFAULT,
            name: SYSTEM_DEFAULT_THEME
        });
        const template      = $("<div>").append($settings).html(),
            $template       = $(Mustache.render(template,
                {"settings": currentSettings, "themes": themes, "Strings": Strings}));

        // Select the correct theme.
        var $currentThemeOption = $template
            .find("[value='" + currentSettings.theme + "']");

        if ($currentThemeOption.length === 0) {
            $currentThemeOption = $template.find("[value='" + DEFAULTS.theme + "']");
        }
        $currentThemeOption.attr("selected", "selected");

        $template
            .find("[data-toggle=tab].default")
            .tab("show");

        $template
            .on("change", "[data-target]:checkbox", function () {
                var $target = $(this);
                var attr = $target.attr("data-target");
                newSettings[attr] = $target.is(":checked");
            })
            .on("input", "[data-target='fontSize']", function () {
                var target = this;
                var targetValue = $(this).val();
                var $btn = $("#theme-settings-done-btn")[0];

                // Make sure that the font size is expressed in terms
                // we can handle (px or em). If not, 'done' button is
                // disabled until input has been corrected.

                if (target.checkValidity() === true) {
                    $btn.disabled = false;
                    newSettings["fontSize"] = targetValue;
                } else {
                    $btn.disabled = true;
                }
            })
            .on("input", "[data-target='fontFamily']", function () {
                var targetValue = $(this).val();
                newSettings["fontFamily"] = targetValue;
            })
            .on("change", "select", function () {
                var $target = $(":selected", this);
                var attr = $target.attr("data-target");

                if (attr) {
                    prefs.set(attr, $target.val());
                }
            });

        const dialog = Dialogs.showModalDialogUsingTemplate($template);
        dialog.done(function (id) {
            var setterFn;

            if (id === "save") {
                // Go through each new setting and apply it
                Object.keys(newSettings).forEach(function (setting) {
                    if (DEFAULTS.hasOwnProperty(setting)) {
                        prefs.set(setting, newSettings[setting]);
                    } else {
                        // Figure out if the setting is in the ViewCommandHandlers, which means it is
                        // a font setting
                        setterFn = "set" + setting[0].toLocaleUpperCase() + setting.substr(1);
                        if (typeof ViewCommandHandlers[setterFn] === "function") {
                            ViewCommandHandlers[setterFn](newSettings[setting]);
                        }
                    }
                });
            } else if (id === "cancel") {
                // Make sure we revert any changes to theme selection
                prefs.set("theme", currentSettings.theme);
            }
        });
        $template
            .find(".get-more-themes")
            .click(function (event) {
                event.preventDefault();
                event.stopPropagation();
                dialog.close();
                CommandManager.execute(Commands.FILE_EXTENSION_MANAGER, "themes");
            });
    }

    /**
     * Interface to set the themes that are available to chose from in the setting dialog
     * @param {ThemeManager.Theme} themes is a collection of themes created by the ThemeManager
     */
    function setThemes(themes) {
        loadedThemes = themes;
    }

    /**
     * Restores themes to factory settings.
     */
    function restore() {
        prefs.set("theme", DEFAULTS.theme);
        prefs.set("themeScrollbars", DEFAULTS.themeScrollbars);
    }

    prefs.definePreference("theme", "string", DEFAULTS.theme, {
        description: Strings.DESCRIPTION_THEME
    });
    prefs.definePreference("themeScrollbars", "boolean", DEFAULTS.themeScrollbars, {
        description: Strings.DESCRIPTION_USE_THEME_SCROLLBARS
    });

    exports.DEFAULTS   = DEFAULTS;
    exports._setThemes = setThemes;
    exports.restore    = restore;
    exports.showDialog = showDialog;
});
