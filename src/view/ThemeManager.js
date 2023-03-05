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

/*jslint regexp: true */
/*global less, path, Phoenix */

define(function (require, exports, module) {


    const _                  = require("thirdparty/lodash"),
        EventDispatcher    = require("utils/EventDispatcher"),
        FileSystem         = require("filesystem/FileSystem"),
        FileUtils          = require("file/FileUtils"),
        EditorManager      = require("editor/EditorManager"),
        DocumentManager    = require("document/DocumentManager"),
        ExtensionUtils     = require("utils/ExtensionUtils"),
        ThemeSettings      = require("view/ThemeSettings"),
        ThemeView          = require("view/ThemeView"),
        PreferencesManager = require("preferences/PreferencesManager"),
        UrlParams          = require("utils/UrlParams").UrlParams,
        prefs              = PreferencesManager.getExtensionPrefs("themes");

    let loadedThemes    = {},
        currentTheme    = null,
        styleNode       = $(ExtensionUtils.addEmbeddedStyleSheet("")),
        commentRegex    = /\/\*([\s\S]*?)\*\//mg,
        scrollbarsRegex = /((?:[^}|,]*)::-webkit-scrollbar(?:[^{]*)[{](?:[^}]*?)[}])/mgi,
        stylesPath      = FileUtils.getNativeBracketsDirectoryPath() + "/styles/";

    const EVENT_THEME_CHANGE = "themeChange";

    /**
     * @private
     * Takes all dashes and converts them to white spaces. Then takes all first letters
     * and capitalizes them.
     *
     * @param {string} name is what needs to be procseed to generate a display name
     * @return {string} theme name properly formatted for display
     */
    function toDisplayName(name) {
        var extIndex = name.lastIndexOf('.');
        name = name.substring(0, extIndex !== -1 ? extIndex : undefined).replace(/-/g, ' ');

        return name.split(" ").map(function (part) {
            return part[0].toUpperCase() + part.substring(1);
        }).join(" ");
    }


    /**
     * @constructor
     * Theme contains all the essential bit to load a theme from disk, display a theme in the settings
     * dialog, and to properly add a theme into CodeMirror along with the rest of brackets.
     *
     * @param {File} file for the theme
     * @param {{name: string, title: string}} options to configure different
     *   properties in the theme
     */
    function Theme(file, options) {
        options = options || {};
        var fileName = file.name;

        // If no options.name is provided, then we derive the name of the theme from whichever we find
        // first, the options.title or the filename.
        if (!options.name) {
            if (options.title) {
                options.name = options.title;
            } else {
                // Remove the file extension when the filename is used as the theme name. This is to
                // follow CodeMirror conventions where themes are just a CSS file and the filename
                // (without the extension) is used to build CSS rules.  Also handle removing .min
                // in case the ".min" is part of the file name.
                options.name = FileUtils.getFilenameWithoutExtension(fileName).replace(/\.min$/, "");
            }

            // We do a bit of string treatment here to make sure we generate theme names that can be
            // used as a CSS class name by CodeMirror.
            options.name = options.name.toLocaleLowerCase().replace(/[\W]/g, '-');
        }

        this.file           = file;
        this.name           = options.name;
        this.displayName    = options.title || toDisplayName(fileName);
        this.dark           = options.theme !== undefined && options.theme.dark === true;
        this.addModeClass   = options.theme !== undefined && options.theme.addModeClass === true;
    }


    /**
     * @private
     * Extracts the scrollbar text from the css/less content so that it can be treated
     * as a separate styling component that can be anabled/disabled independently from
     * the theme.
     *
     * @param {string} content is the css/less input string to be processed
     * @return {{content: string, scrollbar: Array.<string>}} content is the new css/less content
     *   with the scrollbar rules extracted out and put in scrollbar
     */
    function extractScrollbars(content) {
        var scrollbar = [];

        // Go through and extract out scrollbar customizations so that we can
        // enable/disable via settings.
        content = content
            .replace(scrollbarsRegex, function (match) {
                scrollbar.push(match);
                return "";
            });

        return {
            content: content,
            scrollbar: scrollbar
        };
    }


    /**
     * @private
     * Function will process a string and figure out if it looks like window path with a
     * a drive.  If that's the case, then we lower case everything.
     * --- NOTE: There is a bug in less that only checks for lowercase in order to handle
     * the rootPath configuration...  Hopefully a PR will be coming their way soon.
     *
     * @param {string} path is a string to search for drive letters that need to be converted
     *   to lower case.
     *
     * @return {string} Windows Drive letter in lowercase.
     */
    function fixPath(path) {
        return path.replace(/^([A-Z]+:)?\//, function (match) {
            return match.toLocaleLowerCase();
        });
    }


    /**
     * @private
     * Takes the content of a file and feeds it through the less processor in order
     * to provide support for less files.
     *
     * @param {string} content is the css/less string to be processed
     * @param {Theme} theme is the object the css/less corresponds to
     * @return {$.Promise} promise with the processed css/less as the resolved value
     */
    function lessifyTheme(content, theme) {
        var deferred = new $.Deferred();

        less.render("#Phoenix-Main {" + content + "\n}", {
            rootpath: fixPath(stylesPath),
            filename: fixPath(theme.file._path)
        }, function (err, tree) {
            if (err) {
                deferred.reject(err);
            } else {
                deferred.resolve(tree.css);
            }
        });

        return deferred.promise();
    }

    /**
     * @private
     * Will search all loaded themes for one the matches the file passed in
     *
     * @param {File} file is the search criteria
     * @return {Theme} theme that matches the file
     */
    function getThemeByFile(file) {
        var path = file._path;
        return _.find(loadedThemes, function (item) {
            return item.file._path === path;
        });
    }


    let currentTrackingDoc;
    function _trackLivePreviewDevThemeFile(themeFilePath, devTheme) {
        DocumentManager.getDocumentForPath(themeFilePath).done(doc =>{
            if(currentTrackingDoc){
                currentTrackingDoc.off("change.ThemeManager");
            }
            currentTrackingDoc = doc;
            doc.on("change.ThemeManager", ()=>{
                _applyThemeCSS(doc.getText(), devTheme);
            });
        }).fail(console.error);
    }

    /**
     * Extension developers can load their custom themes using debug menu> load project as extension. in this case
     * a query strin param will ge specified with the dev extension path. we will always load that theme as default
     * as th user intent would be to develop the theme in that case.
     * @return {null|*}
     * @private
     */
    function _getCurrentlyLoadedDevTheme() {
        const params  = new UrlParams();
        params.parse();
        let devThemePaths = params.get("loadDevExtensionPath");
        if(!devThemePaths){
            return null;
        }
        devThemePaths = devThemePaths.split(","); // paths are a comma seperated list
        for(let themeID of Object.keys(loadedThemes)){
            let themeFilePath = loadedThemes[themeID].file.fullPath;
            for(let devThemePath of devThemePaths){
                if(themeFilePath.startsWith(devThemePath)){
                    return loadedThemes[themeID];
                }
            }
        }
        return null;
    }

    /**
     * Get current theme object that is loaded in the editor.
     *
     * @return {Theme} the current theme instance
     */
    function getCurrentTheme() {
        let defaultTheme = isOSInDarkTheme() ?
            ThemeSettings.DEFAULTS.darkTheme:
            ThemeSettings.DEFAULTS.lightTheme;
        // check if a dev theme is loaded via query string parameter. If so that will be the current theme.
        let devTheme = _getCurrentlyLoadedDevTheme();
        if(devTheme){
            currentTheme = devTheme;
        } else if (!currentTheme) {
            currentTheme = loadedThemes[prefs.get("theme")] || loadedThemes[defaultTheme];
        }

        if(currentTheme){
            _trackLivePreviewDevThemeFile(currentTheme.file.fullPath, currentTheme);
            EditorManager.off(EditorManager.EVENT_ACTIVE_EDITOR_CHANGED + ".ThemeManager");
            EditorManager.on(EditorManager.EVENT_ACTIVE_EDITOR_CHANGED + ".ThemeManager", ()=>{
                _trackLivePreviewDevThemeFile(currentTheme.file.fullPath, currentTheme);
            });
        }
        return currentTheme;
    }


    /**
     * Gets all available themes
     * @return {Array.<Theme>} collection of all available themes
     */
    function getAllThemes() {
        return _.map(loadedThemes, function (theme) {
            return theme;
        });
    }


    async function _applyThemeCSS(lessContent, theme) {
        const content =  await window.jsPromise(lessifyTheme(lessContent.replace(commentRegex, ""), theme));
        const result = extractScrollbars(content);
        theme.scrollbar = result.scrollbar;
        const cssContent = result.content;
        $("body").toggleClass("dark", theme.dark);
        styleNode.text(cssContent);
    }

    /**
     * @private
     * Process and load the current theme into the editor
     *
     * @return {$.Promise} promise object resolved with the theme object and all
     *    corresponding new css/less and scrollbar information
     */
    function loadCurrentTheme() {
        var theme = getCurrentTheme();

        var pending = theme && FileUtils.readAsText(theme.file)
            .then(function (lessContent) {
                const deferred = new $.Deferred();
                _applyThemeCSS(lessContent, theme)
                    .then(deferred.resolve)
                    .catch(deferred.reject);
            });

        return $.when(pending);
    }


    /**
     * Refresh current theme in the editor
     *
     * @param {boolean} force Forces a reload of the current theme.  It reloads the theme file.
     */
    function refresh(force) {
        if (force) {
            currentTheme = null;
        }

        $.when(force && loadCurrentTheme()).done(function () {
            var editor = EditorManager.getActiveEditor();
            if (!editor || !editor._codeMirror) {
                return;
            }

            var cm = editor._codeMirror;
            ThemeView.updateThemes(cm);

            // currentTheme can be undefined, so watch out
            cm.setOption("addModeClass", !!(currentTheme && currentTheme.addModeClass));
        });
    }

    /**
     *
     * @param file FileSystem.getFileForPath object
     * @param options
     * @private
     */
    function _loadThemeFromFile(file, options) {
        let theme = new Theme(file, options);
        loadedThemes[theme.name] = theme;
        ThemeSettings._setThemes(loadedThemes);

        if (getCurrentTheme() && getCurrentTheme().name === theme.name) {
            refresh(true);
        }
        return theme;
    }

    function _copyPackageJson(packageURL, destPackageFilePath) {
        return new Promise((resolve, reject)=>{
            const file = FileSystem.getFileForPath(destPackageFilePath);
            file.exists(function (err, exists) {
                if(err){
                    reject();
                    return;
                }
                if (!exists) {
                    $.get(packageURL).done(function (packageContent) {
                        FileUtils.writeText(file, JSON.stringify(packageContent), true).done(function () {
                            resolve();
                        }).fail(function (err) {
                            reject(err);
                        });
                    }).fail(function (err) {
                        reject(err);
                    });
                    return;
                }
                resolve();
            });
        });
    }

    /**
     * Loads a theme from a url.
     *
     * @param {string} url is the full http/https url of the theme file
     * @param {Object} options is an optional parameter to specify metadata
     *    for the theme.
     * @return {$.Promise} promise object resolved with the theme to be loaded from fileName
     */
    function _loadFileFromURL(url, options) {
        let deferred         = new $.Deferred();

        const themeName = options.name || options.theme.title,
            fileName = options.theme.file || (typeof(options.theme) === 'string'? options.theme: `theme.css`),
            themeFolder = brackets.app.getApplicationSupportDirectory() + `/extensions/user/${themeName}/`,
            packageURL = url.substring(0, url.lastIndexOf("/")) + '/package.json',
            packagePath = path.normalize(themeFolder + 'package.json'),
            themePath = path.normalize(themeFolder + fileName),
            file = FileSystem.getFileForPath(themePath),
            folder = FileSystem.getDirectoryForPath(themeFolder);

        $.get(url).done(function (themeContent) {
            // Write theme to file
            folder.create((err)=>{
                if(err){
                    console.error(err);
                    deferred.reject();
                    return;
                }
                FileUtils.writeText(file, themeContent, true).done(function () {
                    _copyPackageJson(packageURL, packagePath)
                        .catch(error=>{
                            console.error("Error copying package.json for theme " + themePath, error);
                        })
                        .finally(()=>{
                            let theme = _loadThemeFromFile(file, options);
                            deferred.resolve(theme);
                        });
                }).fail(function (error) {
                    console.error("Error writing " + themePath, error);
                    deferred.reject();
                });
            });
        }).fail(function () {
            // if offline, try to see if we have the previously saved theme available
            file.exists(function (err, exists) {
                if(err){
                    deferred.reject(err);
                    return;
                }
                if (exists) {
                    let theme = _loadThemeFromFile(file, options);
                    deferred.resolve(theme);
                    return;
                }
            });
        });

        return deferred.promise();
    }

    /**
     * Loads a theme from a file.
     *
     * @param {string} fileName is the full path to the file to be opened
     * @param {Object} options is an optional parameter to specify metadata
     *    for the theme.
     * @return {$.Promise} promise object resolved with the theme to be loaded from fileName
     */
    function loadFile(fileName, options) {
        if(fileName.startsWith("http://") || fileName.startsWith("https://")) {
            if(Phoenix.VFS.getPathForVirtualServingURL(fileName)){
                fileName = Phoenix.VFS.getPathForVirtualServingURL(fileName);
            } else {
                return _loadFileFromURL(fileName, options);
            }
        }

        var deferred         = new $.Deferred(),
            file             = FileSystem.getFileForPath(fileName);

        file.exists(function (err, exists) {
            var theme;

            if (exists) {
                theme = new Theme(file, options);
                loadedThemes[theme.name] = theme;
                ThemeSettings._setThemes(loadedThemes);

                // For themes that are loaded after ThemeManager has been loaded,
                // we should check if it's the current theme.  If it is, then we just
                // load it.
                if (currentTheme && currentTheme.name === theme.name) {
                    refresh(true);
                }

                deferred.resolve(theme);
            } else if (err || !exists) {
                deferred.reject(err);
            }
        });

        return deferred.promise();
    }


    /**
     * Loads a theme from an extension package.
     *
     * @param {Object} themePackage is a package from the extension manager for the theme to be loaded.
     * @return {$.Promise} promise object resolved with the theme to be loaded from the pacakge
     */
    function loadPackage(themePackage) {
        var fileName = themePackage.path + "/" + themePackage.metadata.theme.file;
        return loadFile(fileName, themePackage.metadata);
    }

    /**
     * Detects if the os settings is set to dark theme or not
     */
    function isOSInDarkTheme() {
        if(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches){
            return true;
        }
    }

    window.matchMedia('(prefers-color-scheme: dark)').addListener(function (e) {
        // listen to system dark/light theme changes
        console.log(`System theme changed to ${e.matches ? "dark" : "light"} mode`);
        refresh(true);

        // Report os preference change also as a theme change
        exports.trigger(EVENT_THEME_CHANGE, getCurrentTheme());
    });

    prefs.on("change", "theme", function () {
        // Make sure we don't reprocess a theme that's already loaded
        if (currentTheme && currentTheme.name === prefs.get("theme")) {
            return;
        }

        // Refresh editor with the new theme
        refresh(true);

        // Process the scrollbars for the editor
        ThemeView.updateScrollbars(getCurrentTheme());

        // Expose event for theme changes
        exports.trigger(EVENT_THEME_CHANGE, getCurrentTheme());
    });

    prefs.on("change", "themeScrollbars", function () {
        refresh();
        ThemeView.updateScrollbars(getCurrentTheme());
    });

    // Monitor file changes.  If the file that has changed is actually the currently loaded
    // theme, then we just reload the theme.  This allows to live edit the theme
    FileSystem.on("change", function (evt, file) {
        if (!file || file.isDirectory) {
            return;
        }

        if (getThemeByFile(file)) {
            refresh(true);
        }
    });

    EditorManager.on("activeEditorChange", function () {
        refresh();
    });

    /**
     * Sets the current theme for the given theme id if present.
     * @param {string} themeID
     * @return {boolean} true if the theme was applied, else false
     */
    function setCurrentTheme(themeID) {
        let themeIDs = [];
        for(let theme of getAllThemes()){
            themeIDs.push(theme.name);
        }
        if(themeIDs.includes(themeID)){
            prefs.set("theme", themeID);
            return true;
        }
        console.error("Cannot set theme that doesnt exist: ", themeID);
        return false;
    }


    EventDispatcher.makeEventDispatcher(exports);

    exports.refresh         = refresh;
    exports.loadFile        = loadFile;
    exports.loadPackage     = loadPackage;
    exports.getCurrentTheme = getCurrentTheme;
    exports.getAllThemes    = getAllThemes;
    exports.isOSInDarkTheme = isOSInDarkTheme;
    exports.setCurrentTheme = setCurrentTheme;
    exports.EVENT_THEME_CHANGE = EVENT_THEME_CHANGE;

    // Exposed for testing purposes
    exports._toDisplayName     = toDisplayName;
    exports._extractScrollbars = extractScrollbars;
});
