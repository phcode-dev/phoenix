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

define(function (require, exports, module) {

    require("HTMLJumpToDef");

    // Load dependent modules
    const AppInit             = brackets.getModule("utils/AppInit"),
        CodeHintManager     = brackets.getModule("editor/CodeHintManager"),
        HTMLUtils           = brackets.getModule("language/HTMLUtils"),
        PreferencesManager  = brackets.getModule("preferences/PreferencesManager"),
        Strings             = brackets.getModule("strings"),
        NewFileContentManager = brackets.getModule("features/NewFileContentManager"),
        CSSUtils            = brackets.getModule("language/CSSUtils"),
        StringMatch         = brackets.getModule("utils/StringMatch"),
        LiveDevelopment     = brackets.getModule("LiveDevelopment/main"),
        KeyEvent            = brackets.getModule("utils/KeyEvent"),
        Metrics             = brackets.getModule("utils/Metrics"),
        HTMLTags            = require("text!HtmlTags.json"),
        HTMLAttributes      = require("text!HtmlAttributes.json"),
        HTMLTemplate        = require("text!template.html"),
        XHTMLTemplate       = require("text!template.xhtml");

    require("./html-lint");

    let tags,
        attributes;

    PreferencesManager.definePreference("codehint.TagHints", "boolean", true, {
        description: Strings.DESCRIPTION_HTML_TAG_HINTS
    });

    PreferencesManager.definePreference("codehint.AttrHints", "boolean", true, {
        description: Strings.DESCRIPTION_ATTR_HINTS
    });

    /**
     * @constructor
     */
    function TagHints() {
        this.exclusion = null;
    }

    /**
     * Check whether the exclusion is still the same as text after the cursor.
     * If not, reset it to null.
     */
    TagHints.prototype.updateExclusion = function () {
        var textAfterCursor;
        if (this.exclusion && this.tagInfo) {
            textAfterCursor = this.tagInfo.tagName.substr(this.tagInfo.position.offset);
            if (!CodeHintManager.hasValidExclusion(this.exclusion, textAfterCursor)) {
                this.exclusion = null;
            }
        }
    };

    /**
     * Determines whether HTML tag hints are available in the current editor
     * context.
     *
     * @param {Editor} editor
     * A non-null editor object for the active window.
     *
     * @param {string} implicitChar
     * Either null, if the hinting request was explicit, or a single character
     * that represents the last insertion and that indicates an implicit
     * hinting request.
     *
     * @return {boolean}
     * Determines whether the current provider is able to provide hints for
     * the given editor context and, in case implicitChar is non- null,
     * whether it is appropriate to do so.
     */
    TagHints.prototype.hasHints = function (editor, implicitChar) {
        var pos = editor.getCursorPos();

        this.tagInfo = HTMLUtils.getTagInfo(editor, pos);
        this.editor = editor;
        if (implicitChar === null) {
            if (this.tagInfo.position.tokenType === HTMLUtils.TAG_NAME) {
                if (this.tagInfo.position.offset >= 0) {
                    if (this.tagInfo.position.offset === 0) {
                        this.exclusion = this.tagInfo.tagName;
                    } else {
                        this.updateExclusion();
                    }
                    return true;
                }
            }
            return false;
        }
        if (implicitChar === "<") {
            this.exclusion = this.tagInfo.tagName;
            return true;
        }
        return false;

    };

    /**
     * Returns a list of availble HTML tag hints if possible for the current
     * editor context.
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
    TagHints.prototype.getHints = function (implicitChar) {
        var query,
            result;

        this.tagInfo = HTMLUtils.getTagInfo(this.editor, this.editor.getCursorPos());
        if (this.tagInfo.position.tokenType === HTMLUtils.TAG_NAME) {
            if (this.tagInfo.position.offset >= 0) {
                this.updateExclusion();
                query = this.tagInfo.tagName.slice(0, this.tagInfo.position.offset);
                result = $.map(tags, function (value, key) {
                    if (key.indexOf(query) === 0) {
                        return key;
                    }
                }).sort();

                return {
                    hints: result,
                    match: query,
                    selectInitial: true,
                    handleWideResults: false
                };
            }
        }

        return null;
    };

    /**
     * Inserts a given HTML tag hint into the current editor context.
     *
     * @param {string} hint
     * The hint to be inserted into the editor context.
     *
     * @return {boolean}
     * Indicates whether the manager should follow hint insertion with an
     * additional explicit hint request.
     */
    TagHints.prototype.insertHint = function (completion) {
        var start = {line: -1, ch: -1},
            end = {line: -1, ch: -1},
            cursor = this.editor.getCursorPos(),
            charCount = 0;

        if (this.tagInfo.position.tokenType === HTMLUtils.TAG_NAME) {
            var textAfterCursor = this.tagInfo.tagName.substr(this.tagInfo.position.offset);
            if (CodeHintManager.hasValidExclusion(this.exclusion, textAfterCursor)) {
                charCount = this.tagInfo.position.offset;
            } else {
                charCount = this.tagInfo.tagName.length;
            }
        }

        end.line = start.line = cursor.line;
        start.ch = cursor.ch - this.tagInfo.position.offset;
        end.ch = start.ch + charCount;

        if (this.exclusion || completion !== this.tagInfo.tagName) {
            if (start.ch !== end.ch) {
                this.editor.document.replaceRange(completion, start, end);
            } else {
                this.editor.document.replaceRange(completion, start);
            }
            this.exclusion = null;
        }

        return false;
    };

    /**
     * @constructor
     */
    function AttrHints() {
        this.globalAttributes = this.readGlobalAttrHints();
        this.cachedHints = null;
        this.exclusion = "";
    }

    /**
     * @private
     * Parse the code hints from JSON data and extract all hints from property names.
     * @return {!Array.<string>} An array of code hints read from the JSON data source.
     */
    AttrHints.prototype.readGlobalAttrHints = function () {
        return $.map(attributes, function (value, key) {
            if (value.global === "true") {
                return key;
            }
        });
    };

    const MAX_CLASS_HINTS = 250;
    function formatHints(hints) {
        StringMatch.basicMatchSort(hints);
        if(hints.length > MAX_CLASS_HINTS) {
            hints = hints.splice(0, MAX_CLASS_HINTS);
        }
        return hints.map(function (token) {
            let $hintObj = $(`<span data-val='${token.label || token.value || token.text}'></span>`).addClass("brackets-html-hints brackets-hints");

            // highlight the matched portion of each hint
            if (token.stringRanges) {
                token.stringRanges.forEach(function (item) {
                    if (item.matched) {
                        $hintObj.append($("<span>")
                            .text(item.text)
                            .addClass("matched-hint"));
                    } else {
                        $hintObj.append(item.text);
                    }
                });
            } else {
                $hintObj.text(token.label);
            }
            $hintObj.attr("data-val", token.label);
            return $hintObj;
        });
    }

    function _getAllClassHints(query) {
        let queryStr = query.queryStr;
        // "class1 class2" have multiple classes. the last part is the query to hint
        const segments = queryStr.split(" ");
        queryStr = segments[segments.length-1];
        const deferred = $.Deferred();
        CSSUtils.getAllCssSelectorsInProject({includeClasses: true, scanCurrentHtml: true}).then(hints=>{
            const result = $.map(hints, function (pvalue) {
                pvalue = pvalue.slice(1); // remove.
                if(!pvalue || pvalue.includes("#") || pvalue.includes("\\") || pvalue.includes("/")){
                    return null;
                }
                return  StringMatch.stringMatch(pvalue, queryStr, { preferPrefixMatches: true });
            });
            const validHints = formatHints(result);
            validHints.alreadyMatched = true;
            deferred.resolve(validHints);
        }).catch(console.error);
        return deferred;
    }

    /**
     * Helper function that determines the possible value hints for a given html tag/attribute name pair
     *
     * @param {{queryStr: string}} query
     * The current query
     *
     * @param {string} tagName
     * HTML tag name
     *
     * @param {string} attrName
     * HTML attribute name
     *
     * @return {!Array.<string>|$.Deferred}
     * The (possibly deferred) hints.
     */
    AttrHints.prototype._getValueHintsForAttr = function (query, tagName, attrName) {
        // We look up attribute values with tagName plus a slash and attrName first.
        // If the lookup fails, then we fall back to look up with attrName only. Most
        // of the attributes in JSON are using attribute name only as their properties,
        // but in some cases like "type" attribute, we have different properties like
        // "script/type", "link/type" and "button/type".
        var hints = [];

        if(attrName === "class") {
            return _getAllClassHints(query);
        }

        var tagPlusAttr = tagName + "/" + attrName,
            attrInfo = attributes[tagPlusAttr] || attributes[attrName];

        if (attrInfo) {
            if (attrInfo.type === "boolean") {
                hints = ["false", "true"];
            } else if (attrInfo.attribOption) {
                hints = attrInfo.attribOption;
            }
        }

        return hints;
    };

    /**
     * Check whether the exclusion is still the same as text after the cursor.
     * If not, reset it to null.
     *
     * @param {boolean} attrNameOnly
     * true to indicate that we update the exclusion only if the cursor is inside an attribute name context.
     * Otherwise, we also update exclusion for attribute value context.
     */
    AttrHints.prototype.updateExclusion = function (attrNameOnly) {
        if (this.exclusion && this.tagInfo) {
            var tokenType = this.tagInfo.position.tokenType,
                offset = this.tagInfo.position.offset,
                textAfterCursor;

            if (tokenType === HTMLUtils.ATTR_NAME) {
                textAfterCursor = this.tagInfo.attr.name.substr(offset);
            } else if (!attrNameOnly && tokenType === HTMLUtils.ATTR_VALUE) {
                textAfterCursor = this.tagInfo.attr.value.substr(offset);
            }
            if (!CodeHintManager.hasValidExclusion(this.exclusion, textAfterCursor)) {
                this.exclusion = null;
            }
        }
    };

    const HISTORY_PREFIX = "Live_hint_CSS";
    let hintSessionId = 0, isInLiveHighlightSession = false;

    AttrHints.prototype.onClose = function () {
        if(isInLiveHighlightSession) {
            this.editor.restoreHistoryPoint(`${HISTORY_PREFIX}${hintSessionId}`);
            isInLiveHighlightSession = false;
        }
        hintSessionId++;
    };

    AttrHints.prototype.onHighlight = function ($highlightedEl, _$descriptionElem, reason) {
        if(!reason){
            console.error("OnHighlight called without reason, should never happen!");
            hintSessionId++;
            return;
        }
        const tokenType = this.tagInfo.position.tokenType;
        const currentLivePreviewDetails = LiveDevelopment.getLivePreviewDetails();
        if(!(currentLivePreviewDetails && currentLivePreviewDetails.liveDocument)
            || !(tokenType === HTMLUtils.ATTR_VALUE && this.tagInfo.attr.name === "class")) {
            // live hints only for live previewed page on class attribute values
            return;
        }
        const currentlyEditedFile = this.editor.document.file.fullPath;
        const livePreviewedFile = currentLivePreviewDetails.liveDocument.doc.file.fullPath;
        if(currentlyEditedFile !== livePreviewedFile) {
            // file is not current html file being live previewed. we dont show hints in the case
            return;
        }
        if(reason.source === CodeHintManager.SELECTION_REASON.SESSION_START){
            hintSessionId++;
            this.editor.createHistoryRestorePoint(`${HISTORY_PREFIX}${hintSessionId}`);
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
        Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "htmlClassHint", "preview");
        const $hintItem = $highlightedEl.find(".brackets-html-hints");
        const highligtedValue = $highlightedEl.find(".brackets-html-hints").data("val");
        if(!highligtedValue || !$hintItem.is(":visible")){
            return;
        }
        isInLiveHighlightSession = true;
        this.editor._dontDismissPopupOnScroll();
        this.editor.restoreHistoryPoint(`${HISTORY_PREFIX}${hintSessionId}`);
        this.insertHint($highlightedEl.find(".brackets-html-hints"), true);
    };

    /**
     * Determines whether HTML attribute hints are available in the current
     * editor context.
     *
     * @param {Editor} editor
     * A non-null editor object for the active window.
     *
     * @param {string} implicitChar
     * Either null, if the hinting request was explicit, or a single character
     * that represents the last insertion and that indicates an implicit
     * hinting request.
     *
     * @return {boolean}
     * Determines whether the current provider is able to provide hints for
     * the given editor context and, in case implicitChar is non-null,
     * whether it is appropriate to do so.
     */
    AttrHints.prototype.hasHints = function (editor, implicitChar) {
        var pos = editor.getCursorPos(),
            tokenType,
            offset,
            query;

        this.editor = editor;
        this.tagInfo = HTMLUtils.getTagInfo(editor, pos);
        tokenType = this.tagInfo.position.tokenType;
        offset = this.tagInfo.position.offset;
        if (implicitChar === null) {
            query = null;

            if (tokenType === HTMLUtils.ATTR_NAME) {
                if (offset >= 0) {
                    query = this.tagInfo.attr.name.slice(0, offset);
                }
            } else if (tokenType === HTMLUtils.ATTR_VALUE) {
                if (this.tagInfo.position.offset >= 0) {
                    query = this.tagInfo.attr.value.slice(0, offset);
                } else {
                    // We get negative offset for a quoted attribute value with some leading whitespaces
                    // as in <a rel= "rtl" where the cursor is just to the right of the "=".
                    // So just set the queryStr to an empty string.
                    query = "";
                }

                // If we're at an attribute value, check if it's an attribute name that has hintable values.
                const attrName = this.tagInfo.attr.name;
                if (attrName && attrName !== "class") { // class hints are always computed later
                    let hints = this._getValueHintsForAttr({queryStr: query},
                        this.tagInfo.tagName, attrName);
                    if (hints instanceof Array) {
                        // If we got synchronous hints, check if we have something we'll actually use
                        var i, foundPrefix = false;
                        for (i = 0; i < hints.length; i++) {
                            if (hints[i].indexOf(query) === 0) {
                                foundPrefix = true;
                                break;
                            }
                        }
                        if (!foundPrefix) {
                            query = null;
                        }
                    }
                }
            }

            if (offset >= 0) {
                if (tokenType === HTMLUtils.ATTR_NAME && offset === 0) {
                    this.exclusion = this.tagInfo.attr.name;
                } else {
                    this.updateExclusion(false);
                }
            }

            return query !== null;
        }
        if (implicitChar === " " || implicitChar === "'" ||
                    implicitChar === "\"" || implicitChar === "=") {
            if (tokenType === HTMLUtils.ATTR_NAME) {
                this.exclusion = this.tagInfo.attr.name;
            }
            return true;
        }
        return false;

    };

    /**
     * Returns a list of availble HTML attribute hints if possible for the
     * current editor context.
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
    AttrHints.prototype.getHints = function (implicitChar) {
        var cursor = this.editor.getCursorPos(),
            query = {queryStr: null},
            tokenType,
            offset,
            result = [];

        this.tagInfo = HTMLUtils.getTagInfo(this.editor, cursor);
        tokenType = this.tagInfo.position.tokenType;
        offset = this.tagInfo.position.offset;
        if (tokenType === HTMLUtils.ATTR_NAME || tokenType === HTMLUtils.ATTR_VALUE) {
            query.tag = this.tagInfo.tagName;

            if (offset >= 0) {
                if (tokenType === HTMLUtils.ATTR_NAME) {
                    query.queryStr = this.tagInfo.attr.name.slice(0, offset);
                } else {
                    query.queryStr = this.tagInfo.attr.value.slice(0, offset);
                    query.attrName = this.tagInfo.attr.name;
                }
                this.updateExclusion(false);
            } else if (tokenType === HTMLUtils.ATTR_VALUE) {
                // We get negative offset for a quoted attribute value with some leading whitespaces
                // as in <a rel= "rtl" where the cursor is just to the right of the "=".
                // So just set the queryStr to an empty string.
                query.queryStr = "";
                query.attrName = this.tagInfo.attr.name;
            }

            query.usedAttr = HTMLUtils.getTagAttributes(this.editor, cursor);
        }

        if (query.tag && query.queryStr !== null) {
            var tagName = query.tag,
                attrName = query.attrName,
                filter = query.queryStr,
                unfiltered = [],
                hints;

            if (attrName) {
                hints = this._getValueHintsForAttr(query, tagName, attrName);
            } else if (tags && tags[tagName] && tags[tagName].attributes) {
                unfiltered = tags[tagName].attributes.concat(this.globalAttributes);
                hints = $.grep(unfiltered, function (attr, i) {
                    return $.inArray(attr, query.usedAttr) < 0;
                });
            }

            if (hints instanceof Array && hints.length) {
                console.assert(!result.length);
                result = $.map(hints, function (item) {
                    if (item.indexOf(filter) === 0) {
                        return item;
                    }
                }).sort();
                return {
                    hints: result,
                    match: query.queryStr,
                    selectInitial: true,
                    handleWideResults: false
                };
            } else if (hints instanceof Object && hints.hasOwnProperty("done")) { // Deferred hints
                var deferred = $.Deferred();
                hints.done(function (asyncHints) {
                    deferred.resolveWith(this, [{
                        hints: asyncHints,
                        match: asyncHints.alreadyMatched? null: query.queryStr,
                        selectInitial: true,
                        handleWideResults: false
                    }]);
                });
                return deferred;
            }
            return null;

        }


    };

    /**
     * Inserts a given HTML attribute hint into the current editor context.
     *
     * @param {string} completion
     * The hint to be inserted into the editor context.
     *
     * @return {boolean}
     * Indicates whether the manager should follow hint insertion with an
     * additional explicit hint request.
     */
    AttrHints.prototype.insertHint = function (completion, isLiveHighlight) {
        var cursor = this.editor.getCursorPos(),
            start = {line: -1, ch: -1},
            end = {line: -1, ch: -1},
            tokenType = this.tagInfo.position.tokenType,
            offset = this.tagInfo.position.offset,
            charCount = 0,
            insertedName = false,
            replaceExistingOne = this.tagInfo.attr.valueAssigned,
            endQuote = "",
            shouldReplace = true,
            positionWithinAttributeVal = false,
            textAfterCursor;

        if (tokenType === HTMLUtils.ATTR_NAME) {
            textAfterCursor = this.tagInfo.attr.name.substr(offset);
            if (CodeHintManager.hasValidExclusion(this.exclusion, textAfterCursor)) {
                charCount = offset;
                replaceExistingOne = false;
            } else {
                charCount = this.tagInfo.attr.name.length;
            }
            // Append an equal sign and two double quotes if the current attr is not an empty attr
            // and then adjust cursor location before the last quote that we just inserted.
            if (!replaceExistingOne && attributes && attributes[completion] &&
                    attributes[completion].type !== "flag") {
                completion += "=\"\"";
                insertedName = true;
            } else if (completion === this.tagInfo.attr.name) {
                shouldReplace = false;
            }
        } else if (tokenType === HTMLUtils.ATTR_VALUE) {
            textAfterCursor = this.tagInfo.attr.value.substr(offset);
            if (CodeHintManager.hasValidExclusion(this.exclusion, textAfterCursor)) {
                charCount = offset;
                // Set exclusion to null only after attribute value insertion,
                // not after attribute name insertion since we need to keep it
                // for attribute value insertion.
                this.exclusion = null;
            } else {
                charCount = this.tagInfo.attr.value.length;
            }

            if(this.tagInfo.attr.name === "class") {
                // css class hints
                completion = completion.data("val");
                // "anotherClass class<cursor>name" . completion = classics , we have to match a prefix after space
                const textBeforeCursor = this.tagInfo.attr.value.slice(0, offset);
                let lastSegment = textBeforeCursor.split(" ");
                lastSegment = lastSegment[lastSegment.length-1];
                offset = lastSegment.length;
                charCount = offset;
                positionWithinAttributeVal = true;
            }

            if (!this.tagInfo.attr.hasEndQuote) {
                endQuote = this.tagInfo.attr.quoteChar;
                if (endQuote) {
                    completion += endQuote;
                } else if (offset === 0) {
                    completion = "\"" + completion + "\"";
                }
            } else if (completion === this.tagInfo.attr.value) {
                shouldReplace = false;
            }
        }

        end.line = start.line = cursor.line;
        start.ch = cursor.ch - offset;
        end.ch = start.ch + charCount;

        if(isLiveHighlight) {
            // this is via user press up and down arrows when code hints is visible
            if(!this.editor.hasSelection()){
                const initialOffset = this.tagInfo.position.offset;
                textAfterCursor = this.tagInfo.attr.value.substr(initialOffset);
                let firstSegment = textAfterCursor.split(" ");
                firstSegment = firstSegment[0]; // "name"
                end.ch = end.ch + firstSegment.length;
                this.editor.setSelection(start, end);
            }
            this.editor.replaceSelection(completion, 'around', "liveHints");
            return true;
        }

        // this is commit flow
        if(isInLiveHighlightSession) {
            // end previous highlight session.
            isInLiveHighlightSession = false;
            hintSessionId++;
        }

        if(this.editor.hasSelection()){
            // this is when user commits in a live selection
            this.editor.replaceSelection(completion, 'end');
            return true;
        }

        if (shouldReplace) {
            if (start.ch !== end.ch) {
                this.editor.document.replaceRange(completion, start, end);
            } else {
                this.editor.document.replaceRange(completion, start);
            }
        }

        if(positionWithinAttributeVal){
            this.editor.setCursorPos(start.line, start.ch + completion.length);
            // we're now inside the double-quotes we just inserted
        } else if (insertedName) {
            this.editor.setCursorPos(start.line, start.ch + completion.length - 1);

            // Since we're now inside the double-quotes we just inserted,
            // immediately pop up the attribute value hint.
            return true;
        } else if (tokenType === HTMLUtils.ATTR_VALUE && this.tagInfo.attr.hasEndQuote) {
            // Move the cursor to the right of the existing end quote after value insertion.
            this.editor.setCursorPos(start.line, start.ch + completion.length + 1);
        }

        return false;
    };

    /**
     * @constructor
     */
    function NewDocContentProvider() {
        this.CONTENT_PROVIDER_NAME = "HTMLCodeHints";
    }

    NewDocContentProvider.prototype.getContent = function(fileName) {
        return new Promise((resolve, reject)=>{
            if(fileName.endsWith(".xhtml")){
                resolve(XHTMLTemplate);
                return;
            }
            resolve(HTMLTemplate);
        });
    };

    AppInit.appReady(function () {
        // Parse JSON files
        tags = JSON.parse(HTMLTags);
        attributes = JSON.parse(HTMLAttributes);

        // Register code hint providers
        let tagHints = new TagHints();
        let attrHints = new AttrHints();
        let newDocContentProvider = new NewDocContentProvider();
        CodeHintManager.registerHintProvider(tagHints, ["html"], 0);
        CodeHintManager.registerHintProvider(attrHints, ["html"], 0);
        NewFileContentManager.registerContentProvider(newDocContentProvider, ["html"], 0);

        // For unit testing
        exports.tagHintProvider = tagHints;
        exports.attrHintProvider = attrHints;
    });
});
