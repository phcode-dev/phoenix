define(["require", "exports", 'module', './icon', './dictionary', './icon-dictionary'], function (require, exports, module, icon_1, dictionary_1, icon_dictionary_1) {
    /// <reference path="definitions.d.ts" />
    var icons = new icon_dictionary_1.IconDictionary();
    var PreferencesManager = brackets.getModule('preferences/PreferencesManager');
    var prefs = PreferencesManager.getExtensionPrefs('brackets-icons');
    prefs.definePreference('icons', 'object', {});
    prefs.definePreference('iconset', 'string', 'ionicons');
    prefs.definePreference('secondary', 'boolean', true);
    // Change iconset menu options
    var CommandManager = brackets.getModule('command/CommandManager');
    var Menus = brackets.getModule('command/Menus');
    var commandThemeSecondary = 'icons.show-secondary';
    var commandThemeIonId = 'icons.iconset-ionicons';
    var commandThemeDevId = 'icons.iconset-devicons';
    var commandSecondary = CommandManager.register('Show secondary icons', commandThemeSecondary, function () {
        prefs.set('secondary', !icons.secondary);
    });
    var commandThemeIon = CommandManager.register('Ionicons', commandThemeIonId, function () {
        prefs.set('iconset', 'ionicons');
    });
    var commandThemeDev = CommandManager.register('Devicons', commandThemeDevId, function () {
        prefs.set('iconset', 'devicons');
    });
    var menuView = Menus.getMenu(Menus.AppMenuBar.VIEW_MENU);
    menuView.addMenuDivider();
    menuView.addMenuItem(commandSecondary);
    menuView.addMenuItem(commandThemeIonId);
    menuView.addMenuItem(commandThemeDevId);

    function loadPreferences() {
        icons.user.settings = prefs.get('icons');
        icons.iconSet = icon_1.getIconSet(prefs.get('iconset'));
        icons.secondary = prefs.get('secondary');
        commandSecondary.setChecked(icons.secondary);
        commandThemeIon.setChecked(icons.iconSet === 1 /* IconIon */);
        commandThemeDev.setChecked(icons.iconSet === 2 /* IconDev */);
    }

    var ExtensionUtils = brackets.getModule('utils/ExtensionUtils');
    var FileTreeView = brackets.getModule('project/FileTreeView');
    var WorkingSetView = brackets.getModule('project/WorkingSetView');
    var ProjectManager = brackets.getModule('project/ProjectManager');
    // Before Brackets 1.1.0, icons had a hack that the margin was set to -10000px, which was corrected by the padding.
    // This was removed in Brackets 1.1.0
    var version = /([0-9]+)\.([0-9]+)\.([0-9]+)/.exec(brackets.metadata.version);
    if ((version[1] === '0') || (version[1] === '1' && version[2] === '0')) {
        $('body').addClass('icons-margin-correction');
    }
    ExtensionUtils.loadStyleSheet(module, '../styles/style.css');
    ExtensionUtils.loadStyleSheet(module, '../styles/ionicons.min.css');
    ExtensionUtils.loadStyleSheet(module, '../styles/devicons.min.css');
    loadPreferences();
    var createIcon = function (data, secondary) {
        var type = secondary ? 'secondary' : 'main';
        var size = secondary ? 0.75 : 1;
        var $icon = $('<div>');
        $icon.addClass(data.icon);
        $icon.addClass('file-icon file-tree-view-icon file-icon-' + type);
        $icon.css({
            color: data.color,
            fontSize: (data.size || 10) * size + 'px'
        });
        return $icon;
    };
    var provider = function (entry) {
        if (!entry.isFile) {
            return;
        }
        var data = dictionary_1.findInDictionary(icons, entry.name, icons.secondary, function (a, b) {
            if (a === b) {
                return true;
            }
            if (a === undefined || b === undefined) {
                return false;
            }
            return a.color === b.color && a.icon === b.icon && a.size === b.size;
        });
        var $icon = $('<ins>');
        $icon.addClass('file-icon-box');
        $icon.append(createIcon(data[0], false));
        if (data[1] !== undefined) {
            $icon.append(createIcon(data[1], true));
        }
        return $icon;
    };
    WorkingSetView.addIconProvider(provider);
    FileTreeView.addIconProvider(provider);
    prefs.on('change', function () {
        loadPreferences();
        ProjectManager.rerenderTree();
        WorkingSetView.refresh(true);
    });
});
