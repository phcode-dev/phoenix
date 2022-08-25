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

/*global Phoenix, WorkerComm, prettier, prettierPlugins*/

importScripts(`${Phoenix.baseURL}thirdparty/prettier/standalone.js`);
importScripts(`${Phoenix.baseURL}thirdparty/prettier/parser-babel.js`);
importScripts(`${Phoenix.baseURL}thirdparty/prettier/parser-html.js`);
importScripts(`${Phoenix.baseURL}thirdparty/prettier/parser-postcss.js`);
importScripts(`${Phoenix.baseURL}thirdparty/prettier/parser-markdown.js`);
importScripts(`${Phoenix.baseURL}thirdparty/prettier/parser-yaml.js`);

(function () {
    // see https://prettier.io/docs/en/options.html#parser for more parsers available
    const parsersForLanguage = {
        javascript: "babel",
        json: "json-stringify",
        html: "html",
        css: "css",
        less: "less",
        scss: "scss",
        markdown: "markdown",
        yaml: "yaml"
    };

    function prettify(params) {
        console.log(params);
    }

    WorkerComm.setExecHandler("prettify", prettify);

    // parser json-stringify for json, babel for js via babel
    console.log(prettier.format("function s(){console.log('hello world');}", {
        parser: "babel",
        plugins: prettierPlugins
    }));

// support parser css, scss, less via postcss
    console.log(prettier.format('# hello\n- world', {
        parser: "yaml",
        plugins: prettierPlugins
    }));

}());
