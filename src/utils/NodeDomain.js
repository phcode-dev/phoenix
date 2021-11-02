/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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


    var NodeConnection = require("utils/NodeConnection"),
        EventDispatcher = require("utils/EventDispatcher");

    // Used to remove all listeners at once when the connection drops
    var EVENT_NAMESPACE = ".NodeDomainEvent";

    /**
     * Provides a simple abstraction for executing the commands of a single
     * domain loaded via a NodeConnection. Automatically handles connection
     * management and domain loading, and exposes each command in the domain as
     * a promise-returning method that can safely be called regardless of the
     * current status of the underlying connection. Example usage:
     *
     *     var myDomain = new NodeDomain("someDomain", "/path/to/SomeDomainDef.js"),
     *         $result = myDomain.exec("someCommand", arg1, arg2);
     *
     *     $result.done(function (value) {
     *         // the command succeeded!
     *     });
     *
     *     $result.fail(function (err) {
     *         // the command failed; act accordingly!
     *     });
     *
     * To handle domain events, just listen for the event on the domain:
     *
     *     myDomain.on("someEvent", someHandler);
     *
     * @constructor
     * @param {string} domainName Name of the registered Node Domain
     * @param {string} domainPath Full path of the JavaScript Node domain specification
     */
    function NodeDomain(domainName, domainPath) {
        var connection = new NodeConnection();

        this.connection = connection;
        this._domainName = domainName;
        this._domainPath = domainPath;
        this._domainLoaded = false;
        this._load = this._load.bind(this);
        this._connectionPromise = connection.connect(true)
            .then(this._load);

        connection.on("close", function (event, promise) {
            this.connection.off(EVENT_NAMESPACE);
            this._domainLoaded = false;
            this._connectionPromise = promise.then(this._load);
        }.bind(this));
    }
    EventDispatcher.makeEventDispatcher(NodeDomain.prototype);

    /**
     * The underlying Node connection object for this domain.
     *
     * @type {NodeConnection}
     */
    NodeDomain.prototype.connection = null;

    /**
     * A promise that is resolved once the NodeConnection is connected and the
     * domain has been loaded.
     *
     * @type {?jQuery.Promise}
     * @private
     */
    NodeDomain.prototype._connectionPromise = null;

    /**
     * The name of this domain.
     *
     * @type {string}
     * @private
     */
    NodeDomain.prototype._domainName = null;

    /**
     * The path at which the Node definition of this domain resides.
     *
     * @type {string}
     * @private
     */
    NodeDomain.prototype._domainPath = null;

    /**
     * Whether or not the domain has been successfully loaded.
     *
     * @type {boolean}
     * @private
     */
    NodeDomain.prototype._domainLoaded = false;

    /**
     * Loads the domain via the underlying connection object and exposes the
     * domain's commands as methods on this object. Assumes the underlying
     * connection has already been opened.
     *
     * @return {jQuery.Promise} Resolves once the domain is been loaded.
     * @private
     */
    NodeDomain.prototype._load = function () {
        var connection = this.connection;
        return connection.loadDomains(this._domainPath, true)
            .done(function () {
                this._domainLoaded = true;
                this._connectionPromise = null;

                var eventNames = Object.keys(connection.domainEvents[this._domainName]);
                eventNames.forEach(function (domainEvent) {
                    var connectionEvent = this._domainName + ":" + domainEvent + EVENT_NAMESPACE;

                    connection.on(connectionEvent, function () {
                        var params = Array.prototype.slice.call(arguments, 1);
                        EventDispatcher.triggerWithArray(this, domainEvent, params);
                    }.bind(this));
                }, this);
            }.bind(this))
            .fail(function (err) {
                console.error("[NodeDomain] Error loading domain \"" + this._domainName + "\": " + err);
            }.bind(this));
    };

    /**
     * Synchronously determine whether the domain is ready; i.e., whether the
     * connection is open and the domain is loaded.
     *
     * @return {boolean} Whether or not the domain is currently ready.
     */
    NodeDomain.prototype.ready = function () {
        return this._domainLoaded && this.connection.connected();
    };

    /**
     * Get a promise that resolves when the connection is open and the domain
     * is loaded.
     *
     * @return {jQuery.Promise}
     */
    NodeDomain.prototype.promise = function () {
        if (this._connectionPromise) {
            return this._connectionPromise;
        }
        var deferred = new $.Deferred();

        if (this.ready()) {
            deferred.resolve();
        } else {
            deferred.reject();
        }

        return deferred.promise();

    };

    /**
     * Applies the named command from the domain to a list of parameters, which
     * are passed as extra arguments to this method. If the connection is open
     * and the domain is loaded, the function is applied immediately. Otherwise
     * the function is applied as soon as the connection has been opened and the
     * domain has finished loading.
     *
     * @param {string} name The name of the domain command to execute
     * @return {jQuery.Promise} Resolves with the result of the command
     */
    NodeDomain.prototype.exec = function (name) {
        var connection = this.connection,
            params = Array.prototype.slice.call(arguments, 1),
            execConnected = function () {
                var domain  = connection.domains[this._domainName],
                    fn      = domain && domain[name],
                    execResult;

                if (fn) {
                    execResult = fn.apply(domain, params);
                } else {
                    execResult = new $.Deferred().reject().promise();
                }
                return execResult;
            }.bind(this);

        var result;
        if (this.ready()) {
            result = execConnected();
        } else if (this._connectionPromise) {
            result = this._connectionPromise.then(execConnected);
        } else {
            result = new $.Deferred.reject().promise();
        }
        return result;
    };

    module.exports = NodeDomain;
});
