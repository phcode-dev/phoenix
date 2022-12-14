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

    require("./thirdparty/jquery.knob.modified");

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
    }

    function getQuickView(editor, pos, token, line) {

        return new Promise((resolve, reject)=>{
            if(token.type !== "number" || !enabled){
                reject();
                return;
            }
            let sPos = {line: pos.line, ch: token.start},
                ePos = {line: pos.line, ch: token.end};
            let editOrigin = "+NumberQuickView_" + (lastOriginId++);
            let $content = $(`<div><input type="text" value="${token.string}" class="dial"><div>`);
            let split = _splitNumber(token.string);
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
                    split.units = changedSplit.units;
                    return changedSplit.number;
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
        QuickView.registerQuickViewProvider(exports, ["css", "html"]);
    });

    exports.getQuickView = getQuickView;
    exports.filterQuickView = filterQuickView;
    exports.QUICK_VIEW_NAME = "numberPreviewProvider";

});
