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
    const Strings = require("strings"); // todo move to code construction logic

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

    // these are all the icons that are used in the remote functions file
    const remoteIcons = {
        ai: `
        <svg x="0px" y="0px" width="100" height="100" viewBox="0,0,256,256">
            <g fill="#fffbfb" fill-rule="nonzero" stroke="none" stroke-width="1" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="10" stroke-dasharray="" stroke-dashoffset="0" font-family="none" font-weight="none" font-size="none" text-anchor="none" style="mix-blend-mode: normal"><g transform="scale(4,4)"><path d="M30.701,41.663l-2.246,5.145c-0.864,1.978 -3.6,1.978 -4.464,0l-2.247,-5.145c-1.999,-4.579 -5.598,-8.224 -10.086,-10.216l-6.183,-2.745c-1.966,-0.873 -1.966,-3.733 0,-4.605l5.99,-2.659c4.604,-2.044 8.267,-5.824 10.232,-10.559l2.276,-5.483c0.844,-2.035 3.656,-2.035 4.5,0l2.276,5.483c1.965,4.735 5.628,8.515 10.232,10.559l5.99,2.659c1.966,0.873 1.966,3.733 0,4.605l-6.183,2.745c-4.489,1.992 -8.088,5.637 -10.087,10.216z"></path><path d="M30.701,41.663l-2.246,5.145c-0.864,1.978 -3.6,1.978 -4.464,0l-2.247,-5.145c-1.999,-4.579 -5.598,-8.224 -10.086,-10.216l-6.183,-2.745c-1.966,-0.873 -1.966,-3.733 0,-4.605l5.99,-2.659c4.604,-2.044 8.267,-5.824 10.232,-10.559l2.276,-5.483c0.844,-2.035 3.656,-2.035 4.5,0l2.276,5.483c1.965,4.735 5.628,8.515 10.232,10.559l5.99,2.659c1.966,0.873 1.966,3.733 0,4.605l-6.183,2.745c-4.489,1.992 -8.088,5.637 -10.087,10.216z"></path><g><path d="M51.578,57.887l-0.632,1.448c-0.462,1.06 -1.93,1.06 -2.393,0l-0.632,-1.448c-1.126,-2.582 -3.155,-4.637 -5.686,-5.762l-1.946,-0.865c-1.052,-0.468 -1.052,-1.998 0,-2.465l1.838,-0.816c2.596,-1.153 4.661,-3.285 5.768,-5.955l0.649,-1.565c0.452,-1.091 1.96,-1.091 2.412,0l0.649,1.565c1.107,2.669 3.172,4.801 5.768,5.955l1.837,0.816c1.053,0.468 1.053,1.998 0,2.465l-1.946,0.865c-2.531,1.125 -4.56,3.18 -5.686,5.762z"></path><path d="M51.578,57.887l-0.632,1.448c-0.462,1.06 -1.93,1.06 -2.393,0l-0.632,-1.448c-1.126,-2.582 -3.155,-4.637 -5.686,-5.762l-1.946,-0.865c-1.052,-0.468 -1.052,-1.998 0,-2.465l1.838,-0.816c2.596,-1.153 4.661,-3.285 5.768,-5.955l0.649,-1.565c0.452,-1.091 1.96,-1.091 2.412,0l0.649,1.565c1.107,2.669 3.172,4.801 5.768,5.955l1.837,0.816c1.053,0.468 1.053,1.998 0,2.465l-1.946,0.865c-2.531,1.125 -4.56,3.18 -5.686,5.762z"></path></g></g></g>
        </svg>
        `,

        arrowUp: `
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.59 5.58L20 12l-8-8-8 8z"/>
        </svg>
      `,

        edit: `
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
        </svg>
      `,

        duplicate: `
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 3H4C3.44772 3 3 3.44772 3 4V18C3 18.5523 2.55228 19 2 19C1.44772 19 1 18.5523 1 18V4C1 2.34315 2.34315 1 4 1H18C18.5523 1 19 1.44772 19 2C19 2.55228 18.5523 3 18 3Z"/>
          <path d="M13 11C13 10.4477 13.4477 10 14 10C14.5523 10 15 10.4477 15 11V13H17C17.5523 13 18 13.4477 18 14C18 14.5523 17.5523 15 17 15H15V17C15 17.5523 14.5523 18 14 18C13.4477 18 13 17.5523 13 17V15H11C10.4477 15 10 14.5523 10 14C10 13.4477 10.4477 13 11 13H13V11Z"/>
          <path fill-rule="evenodd" clip-rule="evenodd" d="M20 5C21.6569 5 23 6.34315 23 8V20C23 21.6569 21.6569 23 20 23H8C6.34315 23 5 21.6569 5 20V8C5 6.34315 6.34315 5 8 5H20ZM20 7C20.5523 7 21 7.44772 21 8V20C21 20.5523 20.5523 21 20 21H8C7.44772 21 7 20.5523 7 20V8C7 7.44772 7.44772 7 8 7H20Z"/>
        </svg>
      `,

        trash: `
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2h3v2h-2l-1.5 12.5a2 2 0 0
          1-2 1.5H8.5a2 2 0 0 1-2-1.5L5 9H3V7h3zm2 0h8V5H8v2z"/>
        </svg>
      `,

        cut: `
        <svg viewBox="0 0 640 640" fill="currentColor">
            <path d="M256 320L216.5 359.5C203.9 354.6 190.3 352 176 352C114.1 352 64 402.1 64 464C64 525.9 114.1 576 176 576C237.9 576 288 525.9 288 464C288 449.7 285.3 436.1 280.5 423.5L563.2 140.8C570.3 133.7 570.3 122.3 563.2 115.2C534.9 86.9 489.1 86.9 460.8 115.2L320 256L280.5 216.5C285.4 203.9 288 190.3 288 176C288 114.1 237.9 64 176 64C114.1 64 64 114.1 64 176C64 237.9 114.1 288 176 288C190.3 288 203.9 285.3 216.5 280.5L256 320zM353.9 417.9L460.8 524.8C489.1 553.1 534.9 553.1 563.2 524.8C570.3 517.7 570.3 506.3 563.2 499.2L417.9 353.9L353.9 417.9zM128 176C128 149.5 149.5 128 176 128C202.5 128 224 149.5 224 176C224 202.5 202.5 224 176 224C149.5 224 128 202.5 128 176zM176 416C202.5 416 224 437.5 224 464C224 490.5 202.5 512 176 512C149.5 512 128 490.5 128 464C128 437.5 149.5 416 176 416z" />
        </svg>
        `,

        copy: `
        <svg viewBox="0 0 640 640" fill="currentColor">
            <path d="M288 64C252.7 64 224 92.7 224 128L224 384C224 419.3 252.7 448 288 448L480 448C515.3 448 544 419.3 544 384L544 183.4C544 166 536.9 149.3 524.3 137.2L466.6 81.8C454.7 70.4 438.8 64 422.3 64L288 64zM160 192C124.7 192 96 220.7 96 256L96 512C96 547.3 124.7 576 160 576L352 576C387.3 576 416 547.3 416 512L416 496L352 496L352 512L160 512L160 256L176 256L176 192L160 192z" />
        </svg>
        `,

        paste: `
        <svg viewBox="0 0 640 640" fill="currentColor">
            <path d="M128 64C92.7 64 64 92.7 64 128L64 448C64 483.3 92.7 512 128 512L240 512L240 288C240 226.1 290.1 176 352 176L416 176L416 128C416 92.7 387.3 64 352 64L128 64zM312 176L168 176C154.7 176 144 165.3 144 152C144 138.7 154.7 128 168 128L312 128C325.3 128 336 138.7 336 152C336 165.3 325.3 176 312 176zM352 224C316.7 224 288 252.7 288 288L288 512C288 547.3 316.7 576 352 576L512 576C547.3 576 576 547.3 576 512L576 346.5C576 329.5 569.3 313.2 557.3 301.2L498.8 242.7C486.8 230.7 470.5 224 453.5 224L352 224z" />
        </svg>
        `,

        ruler: `
        <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 3h1.5v18H8V3zm6.5 0H16v18h-1.5V3zM3 8v1.5h18V8H3zm0 6.5V16h18v-1.5H3z"/>
        </svg>
        `,

        imageGallery: `
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
          <path d="M1 3v16h2V5h16V3H1z"/>
        </svg>
      `,

        selectImageFromComputer: `
          <svg viewBox="0 0 24 24" fill="currentColor" width="19" height="19">
            <path d="M11 5v6H5v2h6v6h2v-6h6v-2h-6V5h-2z"/>
          </svg>
        `,

        downloadImage: `
        <svg viewBox="0 0 640 640" fill="currentColor">
          <path d="M352 96C352 78.3 337.7 64 320 64C302.3 64 288 78.3 288 96L288 306.7L246.6 265.3C234.1 252.8 213.8 252.8 201.3 265.3C188.8 277.8 188.8 298.1 201.3 310.6L297.3 406.6C309.8 419.1 330.1 419.1 342.6 406.6L438.6 310.6C451.1 298.1 451.1 277.8 438.6 265.3C426.1 252.8 405.8 252.8 393.3 265.3L352 306.7L352 96zM160 384C124.7 384 96 412.7 96 448L96 480C96 515.3 124.7 544 160 544L480 544C515.3 544 544 515.3 544 480L544 448C544 412.7 515.3 384 480 384L433.1 384L376.5 440.6C345.3 471.8 294.6 471.8 263.4 440.6L206.9 384L160 384zM464 440C477.3 440 488 450.7 488 464C488 477.3 477.3 488 464 488C450.7 488 440 477.3 440 464C440 450.7 450.7 440 464 440z"/>
        </svg>
      `,

        folderSettings: `
        <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17">
          <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h8.1c.15.7.42 1.36.81 1.94l.29.41H4c-1.66 0-3-1.34-3-3V6c0-1.66 1.34-3 3-3h6l2 2h8c1.66 0 3 1.34 3 3v4.18c-.63-.11-1.28-.18-1.95-.18-.68 0-1.35.07-2 .2V8c0-1.1-.9-2-2-2h-8l-2-2zM18 13a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2c.55 0 1 .45 1 1v1h1c.55 0 1 .45 1 1s-.45 1-1 1h-1v1c0 .55-.45 1-1 1s-1-.45-1-1v-1h-1c-.55 0-1-.45-1-1s.45-1 1-1h1v-1c0-.55.45-1 1-1z"/>
        </svg>
       `,

        close: `
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
        </svg>
      `,

        paperPlane: `
        <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
        </svg>
      `,

        search: `
        <svg viewBox="0 0 20 16" fill="currentColor" width="17" height="17">
          <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
        </svg>
      `,

        verticalEllipsis: `
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
        </svg>
      `,

        link: `
        <svg viewBox="0 0 640 640" fill="currentColor">
            <path d="M451.5 160C434.9 160 418.8 164.5 404.7 172.7C388.9 156.7 370.5 143.3 350.2 133.2C378.4 109.2 414.3 96 451.5 96C537.9 96 608 166 608 252.5C608 294 591.5 333.8 562.2 363.1L491.1 434.2C461.8 463.5 422 480 380.5 480C294.1 480 224 410 224 323.5C224 322 224 320.5 224.1 319C224.6 301.3 239.3 287.4 257 287.9C274.7 288.4 288.6 303.1 288.1 320.8C288.1 321.7 288.1 322.6 288.1 323.4C288.1 374.5 329.5 415.9 380.6 415.9C405.1 415.9 428.6 406.2 446 388.8L517.1 317.7C534.4 300.4 544.2 276.8 544.2 252.3C544.2 201.2 502.8 159.8 451.7 159.8zM307.2 237.3C305.3 236.5 303.4 235.4 301.7 234.2C289.1 227.7 274.7 224 259.6 224C235.1 224 211.6 233.7 194.2 251.1L123.1 322.2C105.8 339.5 96 363.1 96 387.6C96 438.7 137.4 480.1 188.5 480.1C205 480.1 221.1 475.7 235.2 467.5C251 483.5 269.4 496.9 289.8 507C261.6 530.9 225.8 544.2 188.5 544.2C102.1 544.2 32 474.2 32 387.7C32 346.2 48.5 306.4 77.8 277.1L148.9 206C178.2 176.7 218 160.2 259.5 160.2C346.1 160.2 416 230.8 416 317.1C416 318.4 416 319.7 416 321C415.6 338.7 400.9 352.6 383.2 352.2C365.5 351.8 351.6 337.1 352 319.4C352 318.6 352 317.9 352 317.1C352 283.4 334 253.8 307.2 237.5z" />
        </svg>
      `,

        check: `
        <svg viewBox="0 0 640 640" fill="currentColor">
            <path d="M530.8 134.1C545.1 144.5 548.3 164.5 537.9 178.8L281.9 530.8C276.4 538.4 267.9 543.1 258.5 543.9C249.1 544.7 240 541.2 233.4 534.6L105.4 406.6C92.9 394.1 92.9 373.8 105.4 361.3C117.9 348.8 138.2 348.8 150.7 361.3L252.2 462.8L486.2 141.1C496.6 126.8 516.6 123.6 530.9 134z"/>
        </svg>`
    };

    const optionsBoxStyles = `
                :host {
                  all: initial !important;
                }

                .phoenix-more-options-box {
                    background-color: #4285F4 !important;
                    color: white !important;
                    border-radius: 3px !important;
                    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2) !important;
                    font-size: 12px !important;
                    font-family: Arial, sans-serif !important;
                    z-index: 2147483646 !important;
                    position: absolute !important;
                    left: -1000px;
                    top: -1000px;
                    box-sizing: border-box !important;
                }

                .node-options {
                    display: flex !important;
                    align-items: center !important;
                }

                .node-options span {
                    padding: 4px 3.9px !important;
                    cursor: pointer !important;
                    display: flex !important;
                    align-items: center !important;
                    border-radius: 0 !important;
                }

                .node-options span:first-child {
                    border-radius: 3px 0 0 3px !important;
                }

                .node-options span:last-child {
                    border-radius: 0 3px 3px 0 !important;
                }

                .node-options span:hover {
                    background-color: rgba(255, 255, 255, 0.15) !important;
                }

                .node-options span > svg {
                    width: 16px !important;
                    height: 16px !important;
                    display: block !important;
                }
            `;

    const optionsBoxImageGallerySelectedStyles = `
                .node-options span[data-action="image-gallery"] {
                  background-color: rgba(50, 50, 220, 0.5) !important;
                }

                .node-options span[data-action="image-gallery"]:hover {
                  background-color: rgba(100, 100, 230, 0.6) !important;
                }
            `;

    const optionsBoxDropdownStyles = `
                :host {
                  all: initial !important;
                }

                .phoenix-dropdown {
                    background-color: #2c2c2c !important;
                    color: #cdcdcd !important;
                    border: 1px solid #4a4a4a !important;
                    border-radius: 6px !important;
                    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25) !important;
                    font-size: 13px !important;
                    font-family: Arial, sans-serif !important;
                    z-index: 2147483647 !important;
                    position: absolute !important;
                    left: -1000px;
                    top: -1000px;
                    box-sizing: border-box !important;
                    min-width: 130px !important;
                    padding: 3px 0 !important;
                    overflow: hidden !important;
                }

                .more-options-dropdown {
                    display: flex !important;
                    flex-direction: column !important;
                }

                .dropdown-item {
                    padding: 7px 14px !important;
                    cursor: pointer !important;
                    white-space: nowrap !important;
                    user-select: none !important;
                    display: flex !important;
                    align-items: center !important;
                    gap: 6px !important;
                }

                .dropdown-item:hover {
                    background-color: #3c3f41 !important;
                }

                .item-icon {
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    width: 16px !important;
                    height: 16px !important;
                    flex-shrink: 0 !important;
                }

                .item-icon svg {
                    width: 16px !important;
                    height: 16px !important;
                    display: block !important;
                }

                .item-label {
                    flex: 1 !important;
                }

                .item-label.show-ruler-label {
                    margin-top: 1px !important;
                }

                .dropdown-separator {
                    height: 1px !important;
                    background-color: #4a4a4a !important;
                    margin: 2px 0 !important;
                }

                .item-checkmark {
                    margin-left: auto !important;
                    padding-left: 4px !important;
                    padding-bottom: 1px !important;
                    font-size: 14px !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    width: 14px !important;
                    height: 14px !important;
                }

                .item-checkmark svg {
                    width: 14px !important;
                    height: 14px !important;
                    display: block !important;
                }
            `;

    const infoBoxStyles = `
                :host {
                  all: initial !important;
                }

                .phoenix-node-info-box {
                    background-color: var(--info-box-bg-color) !important;
                    color: white !important;
                    border-radius: 3px !important;
                    padding: 5px 8px !important;
                    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2) !important;
                    font-size: 12px !important;
                    font-family: Arial, sans-serif !important;
                    z-index: 2147483646 !important;
                    position: absolute !important;
                    left: -1000px;
                    top: -1000px;
                    max-width: 300px !important;
                    box-sizing: border-box !important;
                    pointer-events: none !important;
                }

                .tag-line {
                    display: flex !important;
                    align-items: baseline !important;
                    justify-content: space-between !important;
                }

                .tag-name {
                    font-weight: bold !important;
                }

                .elem-dimensions {
                    font-size: 9px !important;
                    font-weight: 500 !important;
                    opacity: 0.9 !important;
                    margin-left: 7px !important;
                    flex-shrink: 0 !important;
                }

                .id-name,
                .class-name,
                .href-info {
                    margin-top: 3px !important;
                }

                .href-info {
                    display: flex !important;
                    align-items: center !important;
                    gap: 6px !important;
                    opacity: 0.9 !important;
                    letter-spacing: 0.6px !important;
                }

                .href-info svg {
                    width: 13px !important;
                    height: 13px !important;
                    flex-shrink: 0 !important;
                }

                .exceeded-classes {
                    opacity: 0.8 !important;
                }
            `;

    const rulerStyles = `
                :host {
                    all: initial !important;
                }

                .phoenix-ruler-line {
                    position: absolute !important;
                    pointer-events: none !important;
                    z-index: 2147483645 !important;
                }

                .phoenix-ruler-line-editable {
                    background-color: rgba(66, 133, 244, 0.4) !important;
                }

                .phoenix-ruler-line-non-editable {
                    background-color: rgba(60, 63, 65, 0.8) !important;
                }

                .phoenix-ruler-label {
                    position: absolute !important;
                    font-size: 9px !important;
                    font-family: Arial, sans-serif !important;
                    pointer-events: none !important;
                    z-index: 2147483646 !important;
                    white-space: nowrap !important;
                    background-color: transparent !important;
                }

                .phoenix-ruler-label-editable {
                    color: rgba(66, 133, 244, 1) !important;
                }

                .phoenix-ruler-label-non-editable {
                    color: rgba(60, 63, 65, 1) !important;
                }
            `;

    const toastMessageStyles = `
                :host {
                    all: initial !important;
                }

                .toast-container {
                    position: fixed !important;
                    bottom: 30px !important;
                    left: 50% !important;
                    transform: translateX(-50%) translateY(0) !important;
                    background-color: rgba(51, 51, 51, 0.95) !important;
                    color: white !important;
                    padding: 10px 14px !important;
                    border-radius: 6px !important;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
                    font-family: Arial, sans-serif !important;
                    font-size: 13px !important;
                    line-height: 1.4 !important;
                    z-index: 2147483647 !important;
                    text-align: center !important;
                    max-width: 90% !important;
                    box-sizing: border-box !important;
                    animation: slideUp 0.3s ease-out !important;
                }

                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `;

    const dialogOverlayStyles = `
                :host {
                    all: initial !important;
                }

                .phoenix-dialog-overlay {
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100% !important;
                    height: 100% !important;
                    background: rgba(0, 0, 0, 0.5) !important;
                    z-index: 2147483646 !important;
                    pointer-events: auto !important;
                }

                .phoenix-dialog-message-bar {
                    position: absolute !important;
                    top: 50% !important;
                    left: 50% !important;
                    transform: translate(-50%, -50%) !important;
                    color: #ffffff !important;
                    background-color: #333333 !important;
                    padding: 1em 1.5em !important;
                    text-align: center !important;
                    font-size: 16px !important;
                    border-radius: 3px !important;
                    font-family: "SourceSansPro", Helvetica, Arial, sans-serif !important;
                    z-index: 2147483647 !important;
                }
            `;

    const aiPromptBoxStyles = `
                :host {
                  all: initial !important;
                }

                .phoenix-ai-prompt-box {
                    position: absolute !important;
                    background: #3C3F41 !important;
                    border: 1px solid #4285F4 !important;
                    border-radius: 4px !important;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15) !important;
                    font-family: Arial, sans-serif !important;
                    z-index: 2147483647 !important;
                    width: var(--ai-box-width) !important;
                    padding: 0 !important;
                    box-sizing: border-box !important;
                }

                .phoenix-ai-prompt-input-container {
                    position: relative !important;
                }

                .phoenix-ai-prompt-textarea {
                    width: 100% !important;
                    height: var(--ai-box-height) !important;
                    border: none !important;
                    border-radius: 4px 4px 0 0 !important;
                    padding: 12px 40px 12px 16px !important;
                    font-size: 14px !important;
                    font-family: Arial, sans-serif !important;
                    resize: none !important;
                    outline: none !important;
                    box-sizing: border-box !important;
                    background: transparent !important;
                    color: #c5c5c5 !important;
                    transition: background 0.2s ease !important;
                }

                .phoenix-ai-prompt-textarea:focus {
                    background: rgba(255, 255, 255, 0.03) !important;
                }

                .phoenix-ai-prompt-textarea::placeholder {
                    color: #a0a0a0 !important;
                    opacity: 0.7 !important;
                }

                .phoenix-ai-prompt-send-button {
                    background-color: transparent !important;
                    border: 1px solid transparent !important;
                    color: #a0a0a0 !important;
                    border-radius: 4px !important;
                    cursor: pointer !important;
                    padding: 3px 6px !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    font-size: 14px !important;
                    transition: all 0.2s ease !important;
                }

                .phoenix-ai-prompt-send-button:hover:not(:disabled) {
                    border: 1px solid rgba(0, 0, 0, 0.24) !important;
                    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12) !important;
                }

                .phoenix-ai-prompt-send-button:disabled {
                    opacity: 0.5 !important;
                    cursor: not-allowed !important;
                }

                .phoenix-ai-bottom-controls {
                    border-top: 1px solid rgba(255,255,255,0.14) !important;
                    padding: 8px 16px !important;
                    background: transparent !important;
                    border-radius: 0 0 4px 4px !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: space-between !important;
                }

                .phoenix-ai-model-select {
                    padding: 4px 8px !important;
                    border: 1px solid transparent !important;
                    border-radius: 4px !important;
                    font-size: 12px !important;
                    background: transparent !important;
                    color: #a0a0a0 !important;
                    outline: none !important;
                    cursor: pointer !important;
                    transition: all 0.2s ease !important;
                }

                .phoenix-ai-model-select:hover {
                    border: 1px solid rgba(0, 0, 0, 0.24) !important;
                    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12) !important;
                }

                .phoenix-ai-model-select:focus {
                    border: 1px solid rgba(0, 0, 0, 0.24) !important;
                    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12) !important;
                }

                .phoenix-ai-model-select option {
                    background: #000 !important;
                    color: #fff !important;
                    padding: 4px 8px !important;
                }
            `;

    const imageGalleryStyles = `
                :host {
                  all: initial !important;
                }

                .phoenix-image-gallery-container {
                    position: fixed !important;
                    bottom: 0 !important;
                    left: 50% !important;
                    transform: translateX(-50%) !important;
                    width: calc(100% - 24px) !important;
                    max-width: 1160px !important;
                    background-color: #2c2c2c !important;
                    border-radius: 6px 6px 0 0 !important;
                    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial !important;
                    border: 2px solid rgba(255, 255, 255, 0.3) !important;
                    border-bottom: none !important;
                    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.3) !important;
                    z-index: 2147483647 !important;
                    overflow: hidden !important;
                }

                .phoenix-image-gallery-header {
                    display: flex !important;
                    padding: 10px 8px 6px 8px !important;
                }

                .phoenix-image-gallery-header-title {
                    display: flex !important;
                    align-items: center !important;
                    color: #a0a0a0 !important;
                    gap: 4px !important;
                    font-size: 14px !important;
                    margin-bottom: 2px !important;
                    margin-right: 10px !important;
                }

                @media (max-width: 580px) {
                    .phoenix-image-gallery-header-title {
                        display: none !important;
                    }
                }

                .phoenix-image-gallery-header-icon {
                    height: 16px !important;
                    width: 18px !important;
                }

                .phoenix-image-gallery-header-icon svg {
                    display: block !important;
                    vertical-align: middle !important;
                }

                .phoenix-image-gallery-header-text {
                    line-height: 1 !important;
                    display: flex !important;
                    align-items: center !important;
                }

                .phoenix-image-gallery-search-container {
                    display: flex !important;
                    align-items: center !important;
                }

                .search-wrapper {
                    position: relative !important;
                    margin-right: 6px !important;
                }

                .search-wrapper input {
                    padding: 5px 4px 6px 36px !important;
                    border-radius: 4px !important;
                    border: none !important;
                    background-color: #1e1e1e !important;
                    color: #e0e0e0 !important;
                }

                .search-wrapper .search-icon {
                    position: absolute !important;
                    left: 6px !important;
                    top: 55% !important;
                    transform: translateY(-50%) !important;
                    background: none !important;
                    border: none !important;
                    color: #aaa !important;
                    cursor: pointer !important;
                }

                .search-wrapper .search-icon:hover {
                    color: #e0e0e0 !important;
                }

                .search-wrapper input:focus {
                    outline: 1px solid #3a8ef6 !important;
                }

                @media (max-width: 370px) {
                    .search-wrapper input {
                        width: 100px !important;
                    }
                }

                .phoenix-image-gallery-upload-container button {
                    display: flex !important;
                    align-items: center !important;
                    gap: 2px !important;
                    background: transparent !important;
                    color: #a0a0a0 !important;
                    border: none !important;
                    border-radius: 3px !important;
                    padding: 3px 8px 3px 3px !important;
                    margin-top: 1px !important;
                    font-size: 12px !important;
                    cursor: pointer !important;
                }

                .phoenix-image-gallery-upload-container button:hover {
                    background: #3c3f41 !important;
                }

                @media (max-width: 470px) {
                    .phoenix-image-gallery-upload-container button {
                        font-size: 0 !important;
                        padding: 3px 5px 3px 6px !important;
                    }

                    .phoenix-image-gallery-upload-container button svg {
                        font-size: 16px !important;
                    }
                }

                .phoenix-image-gallery-right-buttons {
                    display: flex !important;
                    align-items: center !important;
                    gap: 3px !important;
                    margin-left: auto !important;
                    margin-bottom: 2px !important;
                }

                .phoenix-image-gallery-right-buttons button {
                    display: flex !important;
                    background: transparent !important;
                    color: #a0a0a0 !important;
                    border: none !important;
                    border-radius: 3px !important;
                    padding: 4px 8px !important;
                    cursor: pointer !important;
                }

                .phoenix-image-gallery-right-buttons button:hover {
                    background: #3c3f41 !important;
                }

                .phoenix-image-gallery-right-buttons svg {
                    width: 16px !important;
                    height: 16px !important;
                }

                .phoenix-image-gallery-strip {
                    overflow: hidden !important;
                    scroll-behavior: smooth !important;
                    padding: 6px !important;
                }

                .phoenix-image-gallery-row {
                    display: flex !important;
                    gap: 5px !important;
                }

                .phoenix-ribbon-thumb {
                    flex: 0 0 auto !important;
                    width: 112px !important;
                    height: 112px !important;
                    border-radius: 4px !important;
                    overflow: hidden !important;
                    position: relative !important;
                    cursor: pointer !important;
                    outline: 1px solid rgba(255,255,255,0.08) !important;
                    transition: transform 0.15s ease, outline-color 0.15s ease, box-shadow 0.15s ease !important;
                    background: #0b0e14 !important;
                }

                .phoenix-ribbon-thumb img {
                    width: 100% !important;
                    height: 100% !important;
                    object-fit: cover !important;
                    display: block !important;
                }

                .phoenix-ribbon-thumb:hover {
                    transform: translateY(-2px) scale(1.02) !important;
                    outline-color: rgba(255,255,255,0.25) !important;
                    box-shadow: 0 8px 18px rgba(0,0,0,0.36) !important;
                }

                .phoenix-image-gallery-nav {
                    position: absolute !important;
                    top: 50% !important;
                    border-radius: 12px !important;
                    border: 1px solid rgba(255,255,255,0.14) !important;
                    color: #eaeaf0 !important;
                    background: rgba(21,25,36,0.65) !important;
                    cursor: pointer !important;
                    font-size: 22px !important;
                    font-weight: 600 !important;
                    user-select: none !important;
                    transition: all 0.2s ease !important;
                    z-index: 2147483647 !important;
                    padding: 2.5px 11px 7px 11px !important;
                    display: none !important;
                    align-items: center !important;
                    justify-content: center !important;
                    line-height: 1 !important;
                    text-align: center !important;
                }

                .phoenix-image-gallery-nav:hover {
                    background: rgba(21,25,36,0.85) !important;
                    border-color: rgba(255,255,255,0.25) !important;
                }

                .phoenix-image-gallery-nav:active {
                    transform: scale(0.95) !important;
                }

                .phoenix-image-gallery-nav.left {
                    left: 15px !important;
                }

                .phoenix-image-gallery-nav.right {
                    right: 15px !important;
                }

                .phoenix-image-gallery-loading {
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    min-height: 112px !important;
                    color: #eaeaf0 !important;
                    font-size: 14px !important;
                }

                .phoenix-ribbon-error {
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    min-height: 112px !important;
                    color: #ff6b6b !important;
                    font-size: 14px !important;
                }

                .phoenix-loading-more {
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    min-width: 120px !important;
                    min-height: 110px !important;
                    margin-left: 2px !important;
                    background: rgba(255,255,255,0.03) !important;
                    border-radius: 8px !important;
                    color: #e8eaf0 !important;
                    font-size: 12px !important;
                    border: 1px dashed rgba(255,255,255,0.1) !important;
                }

                .phoenix-ribbon-attribution {
                    position: absolute !important;
                    bottom: 6px !important;
                    left: 6px !important;
                    background: rgba(0,0,0,0.8) !important;
                    color: white !important;
                    padding: 4px 6px !important;
                    border-radius: 5px !important;
                    font-size: 10px !important;
                    line-height: 1.2 !important;
                    max-width: calc(100% - 12px) !important;
                    text-shadow: 0 1px 2px rgba(0,0,0,0.9) !important;
                    pointer-events: auto !important;
                    opacity: 0 !important;
                    transition: all 0.2s ease !important;
                }

                .phoenix-ribbon-attribution .photographer {
                    display: block !important;
                    font-weight: 500 !important;
                    white-space: nowrap !important;
                    overflow: hidden !important;
                    text-overflow: ellipsis !important;
                    color: white !important;
                    text-decoration: none !important;
                }

                .phoenix-ribbon-attribution .photographer:hover {
                    text-decoration: underline !important;
                }

                .phoenix-ribbon-attribution .source {
                    display: block !important;
                    font-size: 9px !important;
                    opacity: 0.85 !important;
                    color: white !important;
                    text-decoration: none !important;
                }

                .phoenix-ribbon-attribution .source:hover {
                    text-decoration: underline !important;
                }

                .phoenix-download-icon {
                    position: absolute !important;
                    top: 8px !important;
                    right: 8px !important;
                    background: rgba(0,0,0,0.7) !important;
                    border: none !important;
                    color: #eee !important;
                    border-radius: 50% !important;
                    width: 18px !important;
                    height: 18px !important;
                    padding: 4px !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    cursor: pointer !important;
                    font-size: 16px !important;
                    z-index: 2147483647 !important;
                    transition: all 0.2s ease !important;
                    pointer-events: none !important;
                    opacity: 0 !important;
                }

                .phoenix-ribbon-thumb:hover .phoenix-download-icon {
                    opacity: 1 !important;
                    pointer-events: auto !important;
                }

                .phoenix-ribbon-thumb:hover .phoenix-ribbon-attribution {
                    opacity: 1 !important;
                }

                .phoenix-ribbon-attribution:hover {
                    opacity: 1 !important;
                }

                .phoenix-download-icon:hover {
                    background: rgba(0,0,0,0.9) !important;
                    transform: scale(1.1) !important;
                }

                .phoenix-ribbon-thumb.downloading {
                    opacity: 0.6 !important;
                    pointer-events: none !important;
                }

                .phoenix-download-indicator {
                    position: absolute !important;
                    top: 50% !important;
                    left: 50% !important;
                    transform: translate(-50%, -50%) !important;
                    background: rgba(0, 0, 0, 0.8) !important;
                    border-radius: 50% !important;
                    width: 40px !important;
                    height: 40px !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    z-index: 10 !important;
                }

                .phoenix-download-spinner {
                    width: 20px !important;
                    height: 20px !important;
                    border: 2px solid rgba(255, 255, 255, 0.3) !important;
                    border-top: 2px solid #fff !important;
                    border-radius: 50% !important;
                    animation: phoenix-spin 1s linear infinite !important;
                }

                @keyframes phoenix-spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;

    const hyperlinkEditorStyles = `
                :host {
                  all: initial !important;
                }

                .hyperlink-input-box {
                    position: absolute;
                    background-color: #2c2c2c !important;
                    border: 1px solid #4a4a4a !important;
                    border-radius: 6px !important;
                    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25) !important;
                    z-index: 2147483647;
                    min-width: 200px;
                    max-width: 400px;
                    box-sizing: border-box;
                    padding: 7px 14px !important;
                    display: flex !important;
                    align-items: center !important;
                    gap: 8px !important;
                }

                .link-icon {
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    flex-shrink: 0 !important;
                    width: 16px !important;
                    height: 16px !important;
                    color: #cdcdcd !important;
                }

                .link-icon svg {
                    width: 16px !important;
                    height: 16px !important;
                    display: block !important;
                }

                input {
                    flex: 1 !important;
                    border: none;
                    outline: none;
                    font-size: 14px !important;
                    font-family: Arial, sans-serif !important;
                    color: #cdcdcd !important;
                    background: transparent;
                }

                input::placeholder {
                    color: #6a6a6a !important;
                }
            `;

    const remoteStyles = {
        optionsBox: optionsBoxStyles,
        optionsBoxImageGallerySelected: optionsBoxImageGallerySelectedStyles,
        optionsBoxDropdown: optionsBoxDropdownStyles,
        infoBox: infoBoxStyles,
        toastMessage: toastMessageStyles,
        dialogOverlay: dialogOverlayStyles,
        aiPromptBox: aiPromptBoxStyles,
        imageGallery: imageGalleryStyles,
        hyperlinkEditor: hyperlinkEditorStyles,
        ruler: rulerStyles
    };

    exports.remoteStrings = remoteStrings;
    exports.remoteIcons = remoteIcons;
    exports.remoteStyles = remoteStyles;
});
