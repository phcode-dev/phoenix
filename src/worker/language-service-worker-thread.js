/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2015 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global WorkerComm, CSSLanguageService, HTMLLanguageService */

importScripts('../thirdparty/no-minify/language-worker.js');

(function () {
    function CSSGetAllSymbols({text, cssMode, filePath}) {
        const cssModeID = CSSLanguageService.CSS_MODES[cssMode];
        if(!cssModeID) {
            throw new Error("Language mode not supported "+ cssMode);
        }
        return CSSLanguageService.getAllSymbols(text, cssModeID, filePath);
    }

    function htmlGetAllLinks({text, htmlMode, filePath}) {
        const htmlModeID = HTMLLanguageService.HTML_MODES[htmlMode];
        if(!htmlModeID) {
            throw new Error("Language mode not supported "+ htmlMode);
        }
        return HTMLLanguageService.getAllDocumentLinks(text, htmlModeID, filePath);
    }

    WorkerComm.setExecHandler("css_getAllSymbols", CSSGetAllSymbols);
    WorkerComm.setExecHandler("html_getAllLinks", htmlGetAllLinks);
}());
