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

/*
 * This is a helper file for LiveDevelopment/BrowserScripts/RemoteFunctions.js
 * since that file runs in the browser context, it doesn't have access to the phoenix editor,
 * so this file stores all the data that the remoteFunctions require.
 *
 * Everything from this file will be exported. and this file is loaded by LiveDevelopment/main.js which then
 * passes everything to RemoteFunctions via the config object.
 * Read `LiveDevelopment/main.js` for more details
 *
 * NOTE: this file cannot pass anything directly to RemoteFunctions. Everything has to go through:
 * `LiveDevelopment/main.js`.
 * This file is only present so that we can keep RemoteFunctions logic clean and keep its code concise.
 */

define(function (require, exports, module) {
    const Strings = require('strings');

    // list of all the strings that are used in the remoteFunctions file
    const remoteStrings = {
        selectParent: Strings.LIVE_DEV_MORE_OPTIONS_SELECT_PARENT,
        editText: Strings.LIVE_DEV_MORE_OPTIONS_EDIT_TEXT,
        editHyperlink: Strings.LIVE_DEV_MORE_OPTIONS_EDIT_HYPERLINK,
        hyperlinkNoHref: Strings.LIVE_DEV_HYPERLINK_NO_HREF,
        duplicate: Strings.LIVE_DEV_MORE_OPTIONS_DUPLICATE,
        delete: Strings.LIVE_DEV_MORE_OPTIONS_DELETE,
        ai: Strings.LIVE_DEV_MORE_OPTIONS_AI,
        imageGallery: Strings.LIVE_DEV_MORE_OPTIONS_IMAGE_GALLERY,
        moreOptions: Strings.LIVE_DEV_MORE_OPTIONS_MORE,
        cut: Strings.LIVE_DEV_MORE_OPTIONS_CUT,
        copy: Strings.LIVE_DEV_MORE_OPTIONS_COPY,
        paste: Strings.LIVE_DEV_MORE_OPTIONS_PASTE,
        showRulerLines: Strings.LIVE_PREVIEW_SHOW_RULER_LINES,
        aiPromptPlaceholder: Strings.LIVE_DEV_AI_PROMPT_PLACEHOLDER,
        imageGalleryUseImage: Strings.LIVE_DEV_IMAGE_GALLERY_USE_IMAGE,
        imageGallerySelectDownloadFolder: Strings.LIVE_DEV_IMAGE_GALLERY_SELECT_DOWNLOAD_FOLDER,
        imageGallerySearchPlaceholder: Strings.LIVE_DEV_IMAGE_GALLERY_SEARCH_PLACEHOLDER,
        imageGallerySearchButton: Strings.LIVE_DEV_IMAGE_GALLERY_SEARCH_BUTTON,
        imageGalleryLoadingInitial: Strings.LIVE_DEV_IMAGE_GALLERY_LOADING_INITIAL,
        imageGalleryLoadingMore: Strings.LIVE_DEV_IMAGE_GALLERY_LOADING_MORE,
        imageGalleryNoImages: Strings.LIVE_DEV_IMAGE_GALLERY_NO_IMAGES,
        imageGalleryLoadError: Strings.LIVE_DEV_IMAGE_GALLERY_LOAD_ERROR,
        imageGalleryClose: Strings.LIVE_DEV_IMAGE_GALLERY_CLOSE,
        imageGallerySelectFromComputer: Strings.LIVE_DEV_IMAGE_GALLERY_SELECT_FROM_COMPUTER,
        imageGallerySelectFromComputerTooltip: Strings.LIVE_DEV_IMAGE_GALLERY_SELECT_FROM_COMPUTER_TOOLTIP,
        imageGalleryDialogOverlayMessage: Strings.LIVE_DEV_IMAGE_GALLERY_DIALOG_OVERLAY_MESSAGE,
        toastNotEditable: Strings.LIVE_DEV_TOAST_NOT_EDITABLE,
        toastCopyFirstTime: Strings.LIVE_DEV_COPY_TOAST_MESSAGE
    };

    exports.remoteStrings = remoteStrings;
});

