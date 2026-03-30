/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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
 * ImageUploadManager provides a service provider interface for image uploads.
 * Extensions (e.g. phoenix-pro) register an upload provider; core code (e.g.
 * the paste handler in EditorCommandHandlers) calls the provider to upload images.
 *
 * Provider interface:
 *   {
 *     uploadImage(blob, fileName) → Promise<{embedURL}|{error, errorCode, errorLoc}>
 *   }
 */
define(function (require, exports, module) {

    let _provider = null;

    /**
     * Register an image upload provider. Only one provider is supported at a time.
     * @param {Object} provider - must have an `uploadImage(blob, fileName)` method
     */
    function registerImageUploadProvider(provider) {
        if (!provider || typeof provider.uploadImage !== "function") {
            throw new Error("ImageUploadManager: provider must implement uploadImage(blob, fileName)");
        }
        _provider = provider;
    }

    /**
     * @return {Object|null} The registered provider, or null if none registered.
     */
    function getImageUploadProvider() {
        return _provider;
    }

    /**
     * @return {boolean} True if an upload provider is registered.
     */
    function isImageUploadAvailable() {
        return _provider !== null;
    }

    exports.registerImageUploadProvider = registerImageUploadProvider;
    exports.getImageUploadProvider = getImageUploadProvider;
    exports.isImageUploadAvailable = isImageUploadAvailable;
});
