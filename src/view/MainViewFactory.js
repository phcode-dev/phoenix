/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2014 - 2021 Adobe Systems Incorporated. All rights reserved.
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
 * MainViewFactory is a singleton for managing view factories.
 *
 * Registering a view factory:
 *
 *      registerViewFactory({
 *           canOpenFile: function (fullPath) {
 *               return (fullPath.slice(-4) === ".ico");
 *           },
 *           openFile: function(file, pane) {
 *               return createIconView(file, pane);
 *           }
 *      });
 *
 *  The openFile method is used to open the file and construct
 *  a view of it.  Implementation should add the view to the pane
 *
 *      function createIconView(file, pane) {
 *          // IconView will construct its DOM and append
 *          //  it to pane.$el
 *          var view = new IconView(file, pane.$el);
 *          // Then tell the pane to add it to
 *          //  its view map and show it
 *          pane.addView(view, true);
 *          return new $.Deferred().resolve().promise();
 *      }
 *
 *  Factories should only create 1 view of a file per pane.  Brackets currently only supports 1 view of
 *  a file open at a given time but that may change to allow the same file open in more than 1 pane. Therefore
 *  Factories can do a simple check to see if a view already exists and show it before creating a new one:
 *
 *      var view = pane.getViewForPath(file.fullPath);
 *      if (view) {
 *          pane.showView(view);
 *      } else {
 *          return createIconView(file, pane);
 *      }
 *
 */
define(function (require, exports, module) {


    var _ = require("thirdparty/lodash");


    /**
     * @typedef {canOpenFile:function(path:string):boolean, openFile:function(path:string, pane:Pane)} Factory
     */

    /**
     * The view registration Database
     * @private
     * @type {Array.<Factory>}
     */
    var _factories = [];

    /**
     * Registers a view factory
     * @param {!Factory} factory - the view factory to register
     */
    function registerViewFactory(factory) {
        _factories.push(factory);
    }

    /**
     * Finds a factory that can open the specified file
     * @param {!string} fullPath - the file to open
     * @return {?Factory} A factory that can create a view for the path or undefined if there isn't one.
     */
    function findSuitableFactoryForPath(fullPath) {
        return _.find(_factories, function (factory) {
            // This could get more complex in the future by searching in this order
            //  1) a factory that can open the file by fullPath
            //  2) a factory that can open the file by name
            //  3) a factory that can open the file by filetype
            return factory.canOpenFile(fullPath);
        });
    }

    /*
     * Public API
     */
    exports.registerViewFactory         = registerViewFactory;
    exports.findSuitableFactoryForPath  = findSuitableFactoryForPath;
});
