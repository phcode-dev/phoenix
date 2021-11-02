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

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50, node: true */
/*global */

(function () {
    "use strict";

    /**
     * @private
     * @type {DomainManager}
     * The DomainManager passed in at init.
     */
    var _domainManager = null;


    /**
     * @private
     * @type {Buffer}
     */
    var _buffer = new Buffer(18);

    // write some bytes into the buffer with varied alignments
    _buffer.writeUInt8(1, 0);
    _buffer.writeUInt32LE(Math.pow(2, 32) - 1, 1);
    _buffer.writeFloatBE(3.141592, 5);
    _buffer.writeDoubleLE(Number.MAX_VALUE, 9);
    _buffer.writeInt8(-128, 17);

    /**
     * @private
     * @return {Buffer}
     */
    function _getBufferSync() {
        return _buffer;
    }

    /**
     * @private
     * @param {function(?string, Buffer=)} callback
     */
    function _getBufferAsync(callback) {
        process.nextTick(function () {
            callback(null, _buffer);
        });
    }

    /**
     * @param {DomainManager} DomainManager The DomainManager for the server
     */
    function init(DomainManager) {
        _domainManager = DomainManager;
        if (!_domainManager.hasDomain("test")) {
            _domainManager.registerDomain("test", {major: 0, minor: 1});
        }
        _domainManager.registerCommand(
            "binaryTest",
            "getBufferSync",
            _getBufferSync,
            false,
            "Get a byte array synchronously",
            [],
            {name: "bytes", type: "Buffer"}
        );
        _domainManager.registerCommand(
            "binaryTest",
            "getBufferAsync",
            _getBufferAsync,
            true,
            "Get a byte array asynchronously",
            [],
            {name: "bytes", type: "Buffer"}
        );
    }

    exports.init = init;

}());
