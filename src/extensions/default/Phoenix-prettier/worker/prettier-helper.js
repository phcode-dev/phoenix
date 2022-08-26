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
    function _identifyChangedRange(oldText, newText, start, end) {
        let charsToEndIndex = oldText.length - end;
        let newRangeStart = start,
            newRangeEnd = newText.length - charsToEndIndex,
            rangeEndInOldText = oldText.length - charsToEndIndex;
        // diff from start to see if there is any changes before newRangeStart
        for (let i = 0; i < oldText.length && i < newText.length && i <= newRangeStart; i++) {
            if(oldText[i] !== newText[i]){
                newRangeStart = i;
                break;
            }
        }
        for (let i = 0; i < oldText.length && i < newText.length && i < charsToEndIndex; i++) {
            if(oldText[oldText.length - i - 1] !== newText[newText.length - i -1]){
                newRangeEnd = newText.length - i;
                rangeEndInOldText = oldText.length - i;
                break;
            }
        }
        return {
            text: newText,
            changedText: newText.substring(newRangeStart, newRangeEnd),
            rangeStart: newRangeStart,
            rangeEnd: newRangeEnd,
            rangeEndInOldText: rangeEndInOldText
        };
    }

    function prettify(params) {
        console.log(params);
        let options = params.options || {};
        console.log(options.rangeStart, options.rangeEnd, params.text.length);
        options.rangeStart = options.rangeStart || 0;
        options.rangeEnd = options.rangeEnd || params.text.length;
        options.plugins= prettierPlugins;
        let prettyText = prettier.format(params.text, params.options);
        return _identifyChangedRange(params.text, prettyText, options.rangeStart, options.rangeEnd);
    }

    WorkerComm.setExecHandler("prettify", prettify);
}());
