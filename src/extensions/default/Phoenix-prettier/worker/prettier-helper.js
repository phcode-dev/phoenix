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

/*global Phoenix, WorkerComm, prettier, prettierPlugins, FastDiff, Diff*/

importScripts(`${Phoenix.baseURL}thirdparty/prettier/standalone.js`);
importScripts(`${Phoenix.baseURL}thirdparty/prettier/plugins/babel.js`);
importScripts(`${Phoenix.baseURL}thirdparty/prettier/plugins/estree.js`);
importScripts(`${Phoenix.baseURL}thirdparty/prettier/plugins/html.js`);
importScripts(`${Phoenix.baseURL}thirdparty/prettier/plugins/postcss.js`);

(function () {
    // see https://prettier.io/docs/en/options.html#parser for more parsers available
    function _identifyChangedRange(oldText, newText, start, end) {
        let charsToEndIndex = oldText.length - end;
        let newRangeStart = start,
            newRangeEnd = newText.length - charsToEndIndex,
            rangeEndInOldText = oldText.length - charsToEndIndex;
        return {
            text: newText,
            changedText: newText.substring(newRangeStart, newRangeEnd),
            rangeStart: newRangeStart,
            rangeEnd: newRangeEnd,
            rangeEndInOldText: rangeEndInOldText
        };
    }

    async function prettify(params) {
        let options = params.options || {};
        options.plugins= prettierPlugins;
        // options.cursorOffset this option doesnt work well and prettier.formatWithCursor is buggy causing hangs
        // unpredictably in worker thread. Hangs noted in large html, js and json files. test thoroughly before
        // trying to implement again. https://github.com/prettier/prettier/issues/13387
        let isFullFileBeautify = !options.rangeStart || !options.rangeEnd;
        options.rangeStart = options.rangeStart || 0;
        options.rangeEnd = options.rangeEnd || params.text.length;
        let { formatted, cursorOffset} = await prettier.formatWithCursor(params.text, options);
        if(isFullFileBeautify){
            return {
                text: formatted,
                cursorOffset: cursorOffset
            };
        }
        return _identifyChangedRange(params.text, formatted, options.rangeStart, options.rangeEnd);
    }

    let pluginURLS = {
        php: `${Phoenix.baseURL}thirdparty/prettier/php/standalone.js`,
        yaml: `${Phoenix.baseURL}thirdparty/prettier/plugins/yaml.js`,
        markdown: `${Phoenix.baseURL}thirdparty/prettier/plugins/markdown.js`,
        typescript: `${Phoenix.baseURL}thirdparty/prettier/plugins/typescript.js`
    };
    let builtinPlugins = ["babel", "json-stringify", "html", "css", "less", "scss"];
    function _loadPlugin(pluginName) {
        if(pluginURLS[pluginName]){
            importScripts(pluginURLS[pluginName]);
            return;
        }
        if(!builtinPlugins.includes(pluginName)){
            console.log("no plugin loaded for", pluginName);
        }
    }

    WorkerComm.setExecHandler("prettify", prettify);
    WorkerComm.setExecHandler("loadPrettierPlugin", _loadPlugin);
}());
