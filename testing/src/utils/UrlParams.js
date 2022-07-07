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


    var _ = require("thirdparty/lodash");

    /**
     * Convert between URL querystring and name/value pairs. Decodes and encodes URL parameters.
     */
    function UrlParams() {
        this._store = {};
    }

    /**
     * Parse the window location by default. Optionally specify a URL to parse.
     * @param {string} url
     */
    UrlParams.prototype.parse = function (url) {
        var queryString = "",
            urlParams,
            p,
            self = this;

        self._store = {};

        if (!url) {
            queryString = window.document.location.search.substring(1);
        } else if (url.indexOf("?") !== -1) {
            queryString = url.substring(url.indexOf("?") + 1);
        }

        queryString = queryString.trimRight();

        if (queryString) {
            urlParams = queryString.split("&");

            urlParams.forEach(function (param) {
                p = param.split("=");
                p[1] = p[1] || "";
                self._store[decodeURIComponent(p[0])] = decodeURIComponent(p[1]);
            });
        }
    };

    /**
     * Store a name/value string pair
     * @param {!string} name
     * @param {!string} value
     */
    UrlParams.prototype.put = function (name, value) {
        this._store[name] = value;
    };

    /**
     * Retrieve a value by name
     * @param {!string} name
     * @return {string}
     */
    UrlParams.prototype.get = function (name) {
        return this._store[name];
    };

    /**
     * Remove a name/value string pair
     * @param {!string} name
     */
    UrlParams.prototype.remove = function (name) {
        delete this._store[name];
    };

    /**
     * Returns true if the parameter list is empty, else returns false.
     * @return {boolean}
     */
    UrlParams.prototype.isEmpty = function (name) {
        return _.isEmpty(this._store);
    };

    /**
     * Encode name/value pairs as URI components.
     * @return {string}
     */
    UrlParams.prototype.toString = function () {
        var strs = [],
            self = this;

        _.forEach(self._store, function (value, key) {
            strs.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
        });

        return strs.join("&");
    };

    // Define public API
    exports.UrlParams = UrlParams;
});
