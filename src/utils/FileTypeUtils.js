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
 * File-type classification helpers shared by live preview, Quick Open in
 * design mode, and anywhere else that needs a quick "is this an HTML /
 * markdown / previewable / server-rendered file?" check based on extension.
 */
define(function (require, exports, module) {

    function getExtension(filePath) {
        filePath = filePath || '';
        let pathSplit = filePath.split('.');
        return pathSplit && pathSplit.length > 1 ? pathSplit[pathSplit.length - 1] : '';
    }

    function isPDF(filePath) {
        return getExtension(filePath).toLowerCase() === "pdf";
    }

    function isSVG(filePath) {
        return getExtension(filePath).toLowerCase() === "svg";
    }

    function isImage(filePath) {
        const extension = getExtension(filePath).toLowerCase();
        return ["jpg", "jpeg", "png", "gif", "svg", "webp", "bmp", "ico", "avif"].includes(extension);
    }

    function isMarkdownFile(filePath) {
        return ['md', 'markdown', 'mdx'].includes(getExtension(filePath).toLowerCase());
    }

    function isHTMLFile(filePath) {
        return ['html', 'htm', 'xhtml'].includes(getExtension(filePath).toLowerCase());
    }

    /**
     * True for file types that can be rendered directly in the live preview
     * panel (HTML, SVG, PDF, Markdown).
     * @param {string} filePath
     * @return {boolean}
     */
    function isPreviewableFile(filePath) {
        // Only SVG images are previewable via this path; other images go to
        // the image previewer. Markdown / HTML / PDF also render.
        return isSVG(filePath) || isMarkdownFile(filePath) || isHTMLFile(filePath) || isPDF(filePath);
    }

    /**
     * True for source files typically processed by a server-side runtime
     * (PHP, ASP, JSP, Ruby/ERB, Python, ColdFusion, etc.).
     * @param {string} filePath
     * @return {boolean}
     */
    function isServerRenderedFile(filePath) {
        const extension = getExtension(filePath).toLowerCase();
        return [
            "shtml",
            "asp",
            "aspx",
            "php",
            "jsp",
            "jspx",
            "cfm",
            "cfc", // ColdFusion Component
            "rb",  // Ruby file, used in Ruby on Rails for views with ERB
            "erb", // Embedded Ruby, used in Ruby on Rails views
            "py"   // Python file, used in web frameworks like Django or Flask for views
        ].includes(extension);
    }

    exports.getExtension         = getExtension;
    exports.isPDF                = isPDF;
    exports.isSVG                = isSVG;
    exports.isImage              = isImage;
    exports.isHTMLFile           = isHTMLFile;
    exports.isMarkdownFile       = isMarkdownFile;
    exports.isPreviewableFile    = isPreviewableFile;
    exports.isServerRenderedFile = isServerRenderedFile;
});
