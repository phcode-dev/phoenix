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
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

define(function (require, exports, module) {
    const LIVE_PREVIEW_IFRAME_ID = "panel-live-preview-frame";
    const EditorManager      = require("editor/EditorManager");
    function getExtension(filePath) {
        filePath = filePath || '';
        let pathSplit = filePath.split('.');
        return pathSplit && pathSplit.length>1 ? pathSplit[pathSplit.length-1] : '';
    }

    function isPreviewableFile(filePath) {
        // only svg images should appear in the live preview as it needs text editor.
        // All other image types should appear in the image previewer
        return isSVG(filePath) || isMarkdownFile(filePath) || isHTMLFile(filePath) || isPDF(filePath);
    }

    function isPDF(filePath) {
        let extension = getExtension(filePath);
        return extension === "pdf";
    }

    function isSVG(filePath) {
        let extension = getExtension(filePath);
        return extension === "svg";
    }

    function isImage(filePath) {
        let extension = getExtension(filePath);
        return ["jpg", "jpeg", "png", "gif", "svg", "webp", "bmp", "ico", "avif"]
            .includes(extension.toLowerCase());
    }

    function isMarkdownFile(filePath) {
        let extension = getExtension(filePath);
        return ['md', 'markdown', 'mdx'].includes(extension.toLowerCase());
    }

    function isHTMLFile(filePath) {
        let extension = getExtension(filePath);
        return ['html', 'htm', 'xhtml'].includes(extension.toLowerCase());
    }

    function isServerRenderedFile(filePath) {
        let extension = getExtension(filePath);
        return [
            "shtml",
            "asp",
            "aspx",
            "php",
            "jsp",
            "jspx",
            "cfm",
            "cfc", // ColdFusion Component
            "rb", // Ruby file, used in Ruby on Rails for views with ERB
            "erb", // Embedded Ruby, used in Ruby on Rails views
            "py" // Python file, used in web frameworks like Django or Flask for views
        ].includes(extension.toLowerCase());
    }

    function focusActiveEditorIfFocusInLivePreview() {
        const editor  = EditorManager.getActiveEditor();
        if(!editor){
            return;
        }
        if (document.activeElement === document.getElementById(LIVE_PREVIEW_IFRAME_ID)) {
            editor.focus();
        }
    }

    exports.getExtension = getExtension;
    exports.isPreviewableFile = isPreviewableFile;
    exports.isImage = isImage;
    exports.isPDF = isPDF;
    exports.isSVG = isSVG;
    exports.isHTMLFile = isHTMLFile;
    exports.isServerRenderedFile = isServerRenderedFile;
    exports.isMarkdownFile = isMarkdownFile;
    exports.focusActiveEditorIfFocusInLivePreview = focusActiveEditorIfFocusInLivePreview;
});


