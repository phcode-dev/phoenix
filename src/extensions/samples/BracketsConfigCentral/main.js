/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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


    // Brackets modules
    var FileUtils                   = brackets.getModule("file/FileUtils"),
        ExtensionUtils              = brackets.getModule("utils/ExtensionUtils"),
        DocumentManager             = brackets.getModule("document/DocumentManager"),
        MainViewFactory             = brackets.getModule("view/MainViewFactory"),
        Mustache                    = brackets.getModule("thirdparty/mustache/mustache"),
        ConfigViewContent           = require("text!htmlContent/Config.html");

    /* our module object */
    var _module = module;

    /* @type {Object.<string, ConfigView>} List of open views */
    function ConfigView(doc, $container) {
        this.$container = $container;
        this.doc = doc;
        this.json = JSON.parse(this.doc.getText());
        this.$view = $(Mustache.render(ConfigViewContent, this.json));
        this.$view.css({
            "background-image": "url(file://" + FileUtils.getNativeModuleDirectoryPath(_module) + "/htmlContent/logo-sm.png)",
            "background-position": "bottom right",
            "background-repeat": "no-repeat"
        });
        $container.append(this.$view);
    }

    /*
     * Retrieves the file object for this view
     * return {!File} the file object for this view
     */
    ConfigView.prototype.getFile = function () {
        return this.doc.file;
    };

    /*
     * Updates the layout of the view
     */
    ConfigView.prototype.updateLayout = function () {
    };

    /*
     * Destroys the view
     */
    ConfigView.prototype.destroy = function () {
        this.$view.remove();
    };

    /*
     * Creates a view of a file (.phcode.json)
     * @param {!File} file - the file to create a view for
     * @param {!Pane} pane - the pane where to create the view
     * @private
     */
    function _createConfigViewOf(file, pane) {
        var result = new $.Deferred(),
            view = pane.findViewOfFile(file.fullPath);

        if (view) {
            // existing view, then just show it
            pane.showView(view);
            result.resolve(view.getFile());
        } else {
            DocumentManager.getDocumentForPath(file.fullPath)
                .done(function (doc) {
                    var view = new ConfigView(doc, pane.$el);
                    pane.addView(view, true);
                    result.resolve(doc.file);
                })
                .fail(function (fileError) {
                    result.reject(fileError);
                });
        }
        return result.promise();
    }

    /*
     *  Create a view factory that can create views for the file
     *  `.phcode.json` in a project's root folder.
     */
    var configViewFactory = {
        canOpenFile: function (fullPath) {
            var filename = fullPath.substr(fullPath.lastIndexOf("/") + 1);
            return (filename.toLowerCase() === ".phcode.json");
        },
        openFile: function (file, pane) {
            return _createConfigViewOf(file, pane);
        }
    };

    /* load styles used by our template */
    ExtensionUtils.loadStyleSheet(module, "styles/styles.css");
    MainViewFactory.registerViewFactory(configViewFactory);
});
