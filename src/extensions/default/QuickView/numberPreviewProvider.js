/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*jslint regexp: true */

define(function (require, exports, module) {

    // Brackets modules
    let PreferencesManager  = brackets.getModule("preferences/PreferencesManager"),
        Strings             = brackets.getModule("strings"),
        AppInit             = brackets.getModule("utils/AppInit"),
        QuickView           = brackets.getModule("features/QuickViewManager"),
        Metrics             = brackets.getModule("utils/Metrics"),
        colorGradientProvider = require("./colorGradientProvider");

    const PREF_ENABLED_KEY = "numberEditor";

    let prefs = PreferencesManager.getExtensionPrefs("quickview");
    prefs.definePreference(PREF_ENABLED_KEY, "boolean", true, {
        description: Strings.DESCRIPTION_NUMBER_QUICK_VIEW
    });

    let enabled;                             // Only show preview if true
    let lastOriginId = 0;

    function _splitNumber(numStr) {
        // https://stackoverflow.com/questions/2868947/split1px-into-1px-1-px-in-javascript
        try{
            if(numStr.length > 15){
                // empirically, anything larger than 15 chars is not a number we can process
                return null;
            }
            let split = numStr.match(/(^-?)(\d*\.?\d*)(.*)/); // "1px" -> ["1px", "1", "px"]
            let number = split[1] + split[2] || "";
            let decimalPlaces = number.split(".")[1];
            decimalPlaces = decimalPlaces && decimalPlaces.length || 0;
            let roundTo;
            switch (decimalPlaces) {
            case 0: roundTo = 1; break;
            case 1: roundTo = 10; break;
            case 2: roundTo = 100; break;
            default: roundTo = 100; break;
            }
            return {
                number,
                units: split[3] || "",
                decimalPlaces,
                roundTo
            };
        } catch (e) {
            return null;
        }
    }

    function _getWordAfterPos(editor, pos) {
        // Find the word at the specified position
        const wordRange = editor.getWordAt(pos);
        if(wordRange.text.startsWith('%')) {
            wordRange.text = wordRange.text.slice(0, 1);
            wordRange.endPos.ch = wordRange.startPos.ch + 1;
        }
        const wordFull = editor.getTextBetween(wordRange.startPos, wordRange.endPos);

        // Calculate effective start position within the word, if startPos is within the word
        let startChInWord = 0;
        if (wordRange.startPos.line === pos.line && wordRange.startPos.ch < pos.ch) {
            startChInWord = pos.ch - wordRange.startPos.ch;
        }

        // Calculate the effective start and end positions of the trimmed word within the editor
        const effectiveStartPos = {
            line: wordRange.startPos.line,
            ch: wordRange.startPos.ch + startChInWord
        };

        const effectiveEndPos = wordRange.endPos; // The end position remains the same as the original word's end

        // Trim the word based on the effective start position
        const trimmedWord = wordFull.substring(startChInWord);

        // Return the trimmed word along with its start and end positions
        return {
            text: trimmedWord,
            startPos: effectiveStartPos,
            endPos: effectiveEndPos
        };
    }

    function _isCSSUnit(str) {
        // Regular expression pattern that matches common CSS units
        const regexPattern = /^(px|cm|mm|Q|in|pc|pt|em|ex|ch|rem|vw|vh|vmin|vmax|lh|%)$/;

        return regexPattern.test(str);
    }

    function getQuickView(editor, pos, token, line) {
        return new Promise((resolve, reject)=>{
            let startCh = token.start,
                endCh = token.end,
                numberStr = token.string;
            if(token.type === "string" && enabled) {
                // this is for inline html attributes like style="width:10px;"
                // if the user hover over the 10 or px part, we should show the preview.
                const number = editor.getNumberAt(pos);
                if(number) {
                    // user hovered over the numeric (Eg.10) part
                    numberStr = number.text;
                    startCh = number.startPos.ch;
                    endCh = number.endPos.ch;
                    // check if we can extract units
                    const nextPos = {line: number.endPos.line, ch: number.endPos.ch};
                    const nextWord = _getWordAfterPos(editor, nextPos);
                    if(_isCSSUnit(nextWord.text.trim())){
                        numberStr = editor.getTextBetween(number.startPos, nextWord.endPos);
                        endCh = nextWord.endPos.ch;
                    }
                } else {
                    // the user hovers on the unit field or this is not a numeric string.
                    // for the unit field, we could add logic to detect the numeric field, but not doing that
                    // rn due to resource crunch.
                    reject();
                    return;
                }
            } else if(token.type !== "number" || !enabled){
                reject();
                return;
            }
            let sPos = {line: pos.line, ch: startCh},
                ePos = {line: pos.line, ch: endCh};
            let editOrigin = "+NumberQuickView_" + (lastOriginId++);
            let $content = $(`<div><input type="text" value="${numberStr}" class="dial"><div>`);
            let split = _splitNumber(numberStr);
            if(!split){
                reject();
                return;
            }
            let changedMetricSent = false;
            $content.find(".dial").knob({
                stopper: false,
                step: 1/split.roundTo,
                max: 100/split.roundTo,
                width: 100,
                height: 100,
                fgColor: "#2893ef",
                fontSize: "1em",
                format: function(value){
                    return Math.round(value*split.roundTo)/split.roundTo + split.units;
                },
                getValue: function(userInput){
                    let changedSplit = _splitNumber(userInput);
                    split.units = changedSplit && changedSplit.units;
                    return changedSplit && changedSplit.number;
                },
                change: function (value) {
                    editor.document.batchOperation(function () {
                        // Replace old color in code with the picker's color, and select it
                        editor.setSelection(sPos, ePos); // workaround for #2805
                        let replaceStr = Math.round(value*split.roundTo)/split.roundTo + split.units;
                        editor.replaceRange(replaceStr, sPos, ePos, editOrigin);
                        ePos = {line: sPos.line, ch: sPos.ch + replaceStr.length};
                        editor.setSelection(sPos, ePos);
                    });
                    if(!changedMetricSent){
                        Metrics.countEvent(Metrics.EVENT_TYPE.QUICK_VIEW, "num", "changed");
                        changedMetricSent = true;
                    }
                },
                changeStart: function () {
                    QuickView.lockQuickView();
                },
                changeEnd: function () {
                    QuickView.unlockQuickView();
                }
            });
            resolve({
                start: sPos,
                end: ePos,
                content: $content,
                exclusive: true,
                editsDoc: true
            });
            Metrics.countEvent(Metrics.EVENT_TYPE.QUICK_VIEW, "num", "show");
        });
    }

    function filterQuickView(popovers){
        // rgb(10 , 100, 20), hover over these kind of numbers should open color quick view if present over number view
        let numberQuickView, colorQuickView;
        for(let popover of popovers){
            if(popover.providerInfo.provider.QUICK_VIEW_NAME === exports.QUICK_VIEW_NAME){
                numberQuickView = popover;
            } else if(popover.providerInfo.provider.QUICK_VIEW_NAME === colorGradientProvider.QUICK_VIEW_NAME){
                colorQuickView = popover;
            }
        }
        if(colorQuickView){
            return [colorQuickView];
        }

        return [numberQuickView] || popovers;
    }

    prefs.on("change", PREF_ENABLED_KEY, function () {
        enabled = prefs.get(PREF_ENABLED_KEY);
    });

    AppInit.appReady(function () {
        enabled = prefs.get(PREF_ENABLED_KEY);
        QuickView.registerQuickViewProvider(exports, ["html", "xhtml", "xml", // xml takes care of html inside tsx/jsx
            "css", "less", "scss", "sass"]);
    });

    exports.getQuickView = getQuickView;
    exports.filterQuickView = filterQuickView;
    exports.QUICK_VIEW_NAME = "numberPreviewProvider";

});
