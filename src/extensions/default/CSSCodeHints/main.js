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


    var AppInit             = brackets.getModule("utils/AppInit"),
        CodeHintManager     = brackets.getModule("editor/CodeHintManager"),
        CSSUtils            = brackets.getModule("language/CSSUtils"),
        PreferencesManager  = brackets.getModule("preferences/PreferencesManager"),
        TokenUtils          = brackets.getModule("utils/TokenUtils"),
        StringMatch         = brackets.getModule("utils/StringMatch"),
        ColorUtils          = brackets.getModule("utils/ColorUtils"),
        Strings             = brackets.getModule("strings"),
        KeyEvent            = brackets.getModule("utils/KeyEvent"),
        LiveDevelopment     = brackets.getModule("LiveDevelopment/main"),
        Metrics             = brackets.getModule("utils/Metrics"),
        CSSProperties       = require("text!CSSProperties.json"),
        properties          = JSON.parse(CSSProperties);

    require("./css-lint");

    const BOOSTED_PROPERTIES = [
        "display", "position", "margin", "padding", "width", "height",
        "background", "background-color", "color",
        "font-size", "font-family",
        "text-align",
        "line-height",
        "border", "border-radius", "box-shadow",
        "transition", "animation", "transform",
        "overflow",
        "cursor",
        "z-index",
        "flex", "grid"
    ];
    const MAX_CSS_HINTS = 250;
    const cssWideKeywords = ['initial', 'inherit', 'unset', 'var()', 'calc()'];
    let computedProperties, computedPropertyKeys, compiledPropertyKeys;

    PreferencesManager.definePreference("codehint.CssPropHints", "boolean", true, {
        description: Strings.DESCRIPTION_CSS_PROP_HINTS
    });

    // Context of the last request for hints: either CSSUtils.PROP_NAME,
    // CSSUtils.PROP_VALUE or null.
    var lastContext;

    /**
     * @constructor
     */
    function CssPropHints() {
        this.primaryTriggerKeys = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-()";
        this.secondaryTriggerKeys = ":";
        this.exclusion = null;
    }

    /**
     * Check whether the exclusion is still the same as text after the cursor.
     * If not, reset it to null.
     *
     * @param {boolean} propNameOnly
     * true to indicate that we update the exclusion only if the cursor is inside property name context.
     * Otherwise, we also update exclusion for property value context.
     */
    CssPropHints.prototype.updateExclusion = function (propNameOnly) {
        var textAfterCursor;
        if (this.exclusion && this.info) {
            if (this.info.context === CSSUtils.PROP_NAME) {
                textAfterCursor = this.info.name.substr(this.info.offset);
            } else if (!propNameOnly && this.info.context === CSSUtils.PROP_VALUE) {
                textAfterCursor = this.info.value.substr(this.info.offset);
            }
            if (!CodeHintManager.hasValidExclusion(this.exclusion, textAfterCursor)) {
                this.exclusion = null;
            }
        }
    };

    /**
     * Determines whether CSS propertyname or -name hints are available in the current editor
     * context.
     *
     * @param {Editor} editor
     * A non-null editor object for the active window.
     *
     * @param {String} implicitChar
     * Either null, if the hinting request was explicit, or a single character
     * that represents the last insertion and that indicates an implicit
     * hinting request.
     *
     * @return {Boolean}
     * Determines whether the current provider is able to provide hints for
     * the given editor context and, in case implicitChar is non- null,
     * whether it is appropriate to do so.
     */
    CssPropHints.prototype.hasHints = function (editor, implicitChar) {
        this.editor = editor;
        var cursor = this.editor.getCursorPos();

        lastContext = null;
        this.info = CSSUtils.getInfoAtPos(editor, cursor);

        if (this.info.context !== CSSUtils.PROP_NAME && this.info.context !== CSSUtils.PROP_VALUE) {
            return false;
        }

        if (implicitChar) {
            this.updateExclusion(false);
            if (this.info.context === CSSUtils.PROP_NAME) {
                // Check if implicitChar is the first character typed before an existing property name.
                if (!this.exclusion && this.info.offset === 1 && implicitChar === this.info.name[0]) {
                    this.exclusion = this.info.name.substr(this.info.offset);
                }
            }

            return (this.primaryTriggerKeys.indexOf(implicitChar) !== -1) ||
                   (this.secondaryTriggerKeys.indexOf(implicitChar) !== -1);
        } else if (this.info.context === CSSUtils.PROP_NAME) {
            if (this.info.offset === 0) {
                this.exclusion = this.info.name;
            } else {
                this.updateExclusion(true);
            }
        }

        return true;
    };

    function vendorPrefixesAndGenericToEnd(hints) {
        // Two arrays to hold strings: one for non-dash strings, one for dash-starting strings
        const nonDashHints = [];
        const dashHints = [];

        // Iterate through the array and partition the strings into the two arrays based on the starting character
        hints.forEach(hint => {
            if (hint.label.startsWith('-') || cssWideKeywords.includes(hint.label)) {
                dashHints.push(hint);
            } else {
                nonDashHints.push(hint);
            }
        });

        // Concatenate the non-dash array with the dash array to form the final sorted array
        return nonDashHints.concat(dashHints);
    }


    /**
     * Returns a sorted and formatted list of hints with the query substring
     * highlighted.
     *
     * @param {Array.<Object>} hints - the list of hints to format
     * @param isColorSwatch
     * @return {Array.jQuery} sorted Array of jQuery DOM elements to insert
     */
    function formatHints(hints, isColorSwatch) {
        hints = vendorPrefixesAndGenericToEnd(hints);
        if(hints.length > MAX_CSS_HINTS) {
            hints = hints.splice(0, MAX_CSS_HINTS);
        }
        return hints.map(function (token) {
            var $hintObj = $(`<span data-val='${token.label || token.value}'></span>`).addClass("brackets-css-hints brackets-hints");

            // highlight the matched portion of each hint
            if (token.stringRanges) {
                token.stringRanges.forEach(function (item) {
                    if (item.matched) {
                        $hintObj.append($(`<span>`)
                            .text(item.text)
                            .addClass("matched-hint"));
                    } else {
                        $hintObj.append(item.text);
                    }
                });
            } else {
                $hintObj.text(token.label || token.value);
            }

            if (isColorSwatch) {
                $hintObj = ColorUtils.formatColorHint($hintObj, token.label || token.value);
            }
            if(token.MDN_URL) {
                const $mdn = $(`<a class="css-code-hint-info" style="text-decoration: none;"
                href="${token.MDN_URL}" title="${Strings.DOCS_MORE_LINK_MDN_TITLE}">
                <i class="fa-solid fa-circle-info"></i></a>`);
                $hintObj = $(`<span data-val='${token.label || token.value}'></span>`).append($hintObj).append($mdn);
            }

            $hintObj.attr("data-val", token.value);

            return $hintObj;
        });
    }

    function uniqueMerge(arr1, arr2) {
        arr2.forEach(item => {
            if (!arr1.includes(item)) {
                arr1.push(item);
            }
        });
        return arr1;
    }

    function _computeProperties() {
        const blacklistedValues = {
            none: true,
            auto: true
        };
        computedProperties = {};
        for(let propertyKey of Object.keys(properties)) {
            const property = properties[propertyKey];
            if(property.type === "color" || !property.values || !property.values.length
                || propertyKey === "font-family") {
                computedProperties[propertyKey] = propertyKey;
                continue;
            }
            computedProperties[propertyKey] = propertyKey;
            for(let value of property.values) {
                if(!blacklistedValues[value]){
                    computedProperties[`${propertyKey}: ${value};`] = propertyKey;
                }
            }
        }
        computedPropertyKeys = Object.keys(computedProperties);
        compiledPropertyKeys = StringMatch.compileForRankMatcher(computedPropertyKeys, BOOSTED_PROPERTIES);
    }

    /**
     * Returns a list of availble CSS propertyname or -value hints if possible for the current
     * editor context.
     *
     * @param {Editor} implicitChar
     * Either null, if the hinting request was explicit, or a single character
     * that represents the last insertion and that indicates an implicit
     * hinting request.
     *
     * @return {jQuery.Deferred|{
     *              hints: Array.<string|jQueryObject>,
     *              match: string,
     *              selectInitial: boolean,
     *              handleWideResults: boolean}}
     * Null if the provider wishes to end the hinting session. Otherwise, a
     * response object that provides:
     * 1. a sorted array hints that consists of strings
     * 2. a string match that is used by the manager to emphasize matching
     *    substrings when rendering the hint list
     * 3. a boolean that indicates whether the first result, if one exists,
     *    should be selected by default in the hint list window.
     * 4. handleWideResults, a boolean (or undefined) that indicates whether
     *    to allow result string to stretch width of display.
     */
    CssPropHints.prototype.getHints = function (implicitChar) {
        this.cursor = this.editor.getCursorPos();
        this.info = CSSUtils.getInfoAtPos(this.editor, this.cursor);

        let needle = this.info.name,
            valueNeedle = "",
            context = this.info.context,
            valueArray,
            type,
            result,
            selectInitial = false;

        // Clear the exclusion if the user moves the cursor with left/right arrow key.
        this.updateExclusion(true);

        if (context === CSSUtils.PROP_VALUE) {

            // Always select initial value
            selectInitial = true;

            // We need to end the session and begin a new session if the ( char is typed to
            // get arguments into the list when typing too fast
            if (implicitChar === "(") {
                return true;
            }

            // When switching from a NAME to a VALUE context, restart the session
            // to give other more specialized providers a chance to intervene.
            if (lastContext === CSSUtils.PROP_NAME) {
                return true;
            }
            lastContext = CSSUtils.PROP_VALUE;


            if (!properties[needle]) {
                return null;
            }

            // Cursor is in an existing property value or partially typed value
            if (!this.info.isNewItem && this.info.index !== -1) {
                valueNeedle = this.info.values[this.info.index].trim();
                valueNeedle = valueNeedle.substr(0, this.info.offset);
            }

            if(!properties[needle].injectedCSSDefaults){
                uniqueMerge(properties[needle].values, cssWideKeywords);
                properties[needle].injectedCSSDefaults = true;
            }
            valueArray = properties[needle].values;
            type = properties[needle].type;
            let isColorSwatch = false;
            if (type === "color") {
                isColorSwatch = true;
                valueArray = valueArray.concat(ColorUtils.COLOR_NAMES.map(function (color) {
                    return { text: color, color: color };
                }));
                valueArray.push("transparent", "currentColor");
            }

            valueArray = $.map(valueArray, function (pvalue) {
                return pvalue.text || pvalue;
            });
            result = StringMatch.rankMatchingStrings(valueNeedle, valueArray, {
                scorer: StringMatch.RANK_MATCH_SCORER.CODE_HINTS,
                limit: MAX_CSS_HINTS
            });

            return {
                hints: formatHints(result, isColorSwatch),
                match: null, // the CodeHintManager should not format the results
                selectInitial: selectInitial
            };
        } else if (context === CSSUtils.PROP_NAME) {

            // Select initial property if anything has been typed
            if (this.primaryTriggerKeys.indexOf(implicitChar) !== -1 || needle !== "") {
                selectInitial = true;
            }

            if (lastContext === CSSUtils.PROP_VALUE) {
                // close the session if we're coming from a property value
                // see https://github.com/adobe/brackets/issues/9496
                return null;
            }

            lastContext = CSSUtils.PROP_NAME;
            needle = needle.substr(0, this.info.offset);
            if(!computedProperties){
                _computeProperties();
            }

            result = StringMatch.rankMatchingStrings(needle, compiledPropertyKeys, {
                scorer: StringMatch.RANK_MATCH_SCORER.CODE_HINTS,
                limit: MAX_CSS_HINTS
            });

            for(let resultItem of result) {
                const propertyKey = computedPropertyKeys[resultItem.sourceIndex];
                if(properties[propertyKey] && properties[propertyKey].MDN_URL){
                    resultItem.MDN_URL = properties[propertyKey].MDN_URL;
                }
            }

            return {
                hints: formatHints(result),
                match: null, // the CodeHintManager should not format the results
                selectInitial: selectInitial,
                handleWideResults: false
            };
        }
        return null;
    };

    let hintSessionId = 0, isInLiveHighlightSession = false;

    CssPropHints.prototype.onClose = function () {
        if(isInLiveHighlightSession) {
            this.editor.restoreHistoryPoint(`Live_hint_${hintSessionId}`);
            isInLiveHighlightSession = false;
        }
        hintSessionId++;
    };

    CssPropHints.prototype.onHighlight = function ($highlightedEl, _$descriptionElem, reason) {
        if(!reason){
            console.error("OnHighlight called without reason, should never happen!");
            hintSessionId++;
            return;
        }
        const currentLivePreviewDetails = LiveDevelopment.getLivePreviewDetails();
        if(!(currentLivePreviewDetails && currentLivePreviewDetails.liveDocument)) {
            // css live hints only for live previewed page and related files
            return;
        }
        const currentlyEditedFile = this.editor.document.file.fullPath;
        const livePreviewedFile = currentLivePreviewDetails.liveDocument.doc.file.fullPath;
        if(currentlyEditedFile !== livePreviewedFile) {
            const isRelatedFile = currentLivePreviewDetails.liveDocument.isRelated &&
                currentLivePreviewDetails.liveDocument.isRelated(currentlyEditedFile);
            if(!isRelatedFile) {
                // file is neither current html file being live previewed, or any of its
                // related file. we dont show hints in the case
                return;
            }
        }
        if(reason.source === CodeHintManager.SELECTION_REASON.SESSION_START){
            hintSessionId++;
            this.editor.createHistoryRestorePoint(`Live_hint_${hintSessionId}`);
            return;
        }
        if(reason.source !== CodeHintManager.SELECTION_REASON.KEYBOARD_NAV){
            return;
        }
        const event = reason.event;
        if(!(event.keyCode === KeyEvent.DOM_VK_UP ||
            event.keyCode === KeyEvent.DOM_VK_DOWN ||
            event.keyCode === KeyEvent.DOM_VK_PAGE_UP ||
            event.keyCode === KeyEvent.DOM_VK_PAGE_DOWN)){
            return;
        }
        Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "cssHint", "preview");
        const $hintItem = $highlightedEl.find(".brackets-css-hints");
        const highligtedValue = $highlightedEl.find(".brackets-css-hints").data("val");
        if(!highligtedValue || !$hintItem.is(":visible")){
            return;
        }
        isInLiveHighlightSession = true;
        this.editor.restoreHistoryPoint(`Live_hint_${hintSessionId}`);
        this.insertHint($highlightedEl.find(".brackets-css-hints"), true);
    };

    /**
     * Inserts a given CSS protertyname or -value hint into the current editor context.
     *
     * @param {String} hint
     * The hint to be inserted into the editor context.
     *
     * @return {Boolean}
     * Indicates whether the manager should follow hint insertion with an
     * additional explicit hint request.
     */
    CssPropHints.prototype.insertHint = function (hint, isLiveHighlight) {
        var offset = this.info.offset,
            cursor = this.editor.getCursorPos(),
            start = {line: -1, ch: -1},
            end = {line: -1, ch: -1},
            keepHints = false,
            adjustCursor = false,
            newCursor,
            ctx;

        if (hint.jquery) {
            hint = hint.data("val") + ""; // font-weight: 400, 400 is returned as number so,
        }

        if (this.info.context !== CSSUtils.PROP_NAME && this.info.context !== CSSUtils.PROP_VALUE) {
            return false;
        }

        start.line = end.line = cursor.line;
        start.ch = cursor.ch - offset;

        if (this.info.context === CSSUtils.PROP_NAME) {
            keepHints = true;
            var textAfterCursor = this.info.name.substr(this.info.offset);
            if (this.info.name.length === 0 || CodeHintManager.hasValidExclusion(this.exclusion, textAfterCursor)) {
                // It's a new insertion, so append a colon and set keepHints
                // to show property value hints.
                hint += ": ";
                end.ch = start.ch;
                end.ch += offset;

                if (this.exclusion) {
                    // Append a space to the end of hint to insert and then adjust
                    // the cursor before that space.
                    hint += " ";
                    adjustCursor = true;
                    newCursor = { line: cursor.line,
                        ch: start.ch + hint.length - 1 };
                    this.exclusion = null;
                }
            } else {
                // It's a replacement of an existing one or just typed in property.
                // So we need to check whether there is an existing colon following
                // the current property name. If a colon already exists, then we also
                // adjust the cursor position and show code hints for property values.
                end.ch = start.ch + this.info.name.length;
                ctx = TokenUtils.getInitialContext(this.editor._codeMirror, cursor);
                if (ctx.token.string.length > 0 && !/\S/.test(ctx.token.string)) {
                    // We're at the very beginning of a property name. So skip it
                    // before we locate the colon following it.
                    TokenUtils.moveNextToken(ctx);
                }
                if (TokenUtils.moveSkippingWhitespace(TokenUtils.moveNextToken, ctx) && ctx.token.string === ":") {
                    adjustCursor = true;
                    newCursor = { line: cursor.line,
                        ch: cursor.ch + (hint.length - this.info.name.length) };
                    // Adjust cursor to the position after any whitespace that follows the colon, if there is any.
                    if (TokenUtils.moveNextToken(ctx) && ctx.token.string.length > 0 && !/\S/.test(ctx.token.string)) {
                        newCursor.ch += ctx.token.string.length;
                    }
                } else if(!hint.endsWith(";")){
                    hint += ": ";
                }
            }
        } else {
            if (!this.info.isNewItem && this.info.index !== -1) {
                // Replacing an existing property value or partially typed value
                end.ch = start.ch + this.info.values[this.info.index].length;
            } else {
                // Inserting a new property value
                end.ch = start.ch;
            }

            var parenMatch = hint.match(/\(.*?\)/);
            if (parenMatch) {
                // value has (...), so place cursor inside opening paren
                // and keep hints open
                adjustCursor = true;
                newCursor = { line: cursor.line,
                    ch: start.ch + parenMatch.index + 1 };
                keepHints = true;
            }
        }

        if(isLiveHighlight) {
            // this is via user press up and down arrows when code hints is visible
            if(this.info.context !== CSSUtils.PROP_VALUE && !hint.endsWith(";")) {
                // we only do live hints for css property values. else UX is jarring.
                // property full statements hints like "display: flex;" will be live previewed tho
                return keepHints;
            }
            if(!this.editor.hasSelection()){
                this.editor.setSelection(start, end);
            }
            this.editor.replaceSelection(hint, 'around', "liveHints");
            return keepHints;
        }

        // this is commit flow
        if(isInLiveHighlightSession) {
            // end previous highlight session.
            isInLiveHighlightSession = false;
            hintSessionId++;
        }

        if(this.editor.hasSelection()){
            // this is when user commits
            this.editor.replaceSelection(hint, 'end');
            return keepHints;
        }

        // HACK (tracking adobe/brackets#1688): We talk to the private CodeMirror instance
        // directly to replace the range instead of using the Document, as we should. The
        // reason is due to a flaw in our current document synchronization architecture when
        // inline editors are open.
        this.editor._codeMirror.replaceRange(hint, start, end);

        if (adjustCursor) {
            this.editor.setCursorPos(newCursor);
        }

        return keepHints;
    };

    AppInit.appReady(function () {
        var cssPropHints = new CssPropHints();
        CodeHintManager.registerHintProvider(cssPropHints, ["css", "scss", "less"], 1);

        // For unit testing
        exports.cssPropHintProvider = cssPropHints;
    });
});
