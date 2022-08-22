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
    const ColorUtils          = brackets.getModule("utils/ColorUtils"),
        CSSUtils            = brackets.getModule("language/CSSUtils"),
        TokenUtils          = brackets.getModule("utils/TokenUtils");

    let styleLanguages = ["css", "text/x-less", "sass", "text/x-scss", "stylus"];

    function colorAndGradientPreviewProvider($previewContainer, editor, pos, token, line) {

        // Check for gradient. -webkit-gradient() can have parens in parameters
        // nested 2 levels. Other gradients can only nest 1 level.
        let gradientRegEx = /-webkit-gradient\((?:[^\(]*?(?:\((?:[^\(]*?(?:\([^\)]*?\))*?)*?\))*?)*?\)|(?:(?:-moz-|-ms-|-o-|-webkit-|:|\s)((repeating-)?linear-gradient)|(?:-moz-|-ms-|-o-|-webkit-|:|\s)((repeating-)?radial-gradient))(\((?:[^\)]*?(?:\([^\)]*?\))*?)*?\))/gi,
            colorRegEx    = new RegExp(ColorUtils.COLOR_REGEX),
            mode          = TokenUtils.getModeAt(editor._codeMirror, pos, false),
            isStyleSheet  = (styleLanguages.indexOf(mode) !== -1);

        function areParensBalanced(str) {
            let i,
                nestLevel = 0,
                len;

            if (isStyleSheet) {
                // Remove comments & strings from style sheets
                str = CSSUtils.reduceStyleSheetForRegExParsing(str);
            }
            len = str.length;

            for (i = 0; i < len; i++) {
                switch (str[i]) {
                    case "(":
                        nestLevel++;
                        break;
                    case ")":
                        nestLevel--;
                        break;
                    case "\\":
                        i++;    // next char is escaped, so skip it
                        break;
                }
            }

            // if parens are balanced, nest level will be 0
            return (nestLevel === 0);
        }

        function execGradientMatch(line, parensBalanced) {
            // Unbalanced parens cause infinite loop (see issue #4650)
            let gradientMatch = (parensBalanced ? gradientRegEx.exec(line) : null),
                prefix = "",
                colorValue;

            if (gradientMatch) {
                if (gradientMatch[0].indexOf("@") !== -1) {
                    // If the gradient match has "@" in it, it is most likely a less or
                    // sass letiable. Ignore it since it won't be displayed correctly.
                    gradientMatch = null;

                } else {
                    // If it was a linear-gradient or radial-gradient letiant with a vendor prefix
                    // add "-webkit-" so it shows up correctly in Brackets.
                    if (gradientMatch[0].match(/-o-|-moz-|-ms-|-webkit-/i)) {
                        prefix = "-webkit-";
                    }

                    // For prefixed gradients, use the non-prefixed value as the color value.
                    // "-webkit-" will be added before this value later
                    if (gradientMatch[1]) {
                        colorValue = gradientMatch[1] + gradientMatch[5];    // linear gradiant
                    } else if (gradientMatch[3]) {
                        colorValue = gradientMatch[3] + gradientMatch[5];    // radial gradiant
                    } else if (gradientMatch[0]) {
                        colorValue = gradientMatch[0];                       // -webkit-gradient
                        prefix = "";                                         // do not prefix
                    }
                }
            }

            return {
                match: gradientMatch,
                prefix: prefix,
                colorValue: colorValue
            };
        }

        function execColorMatch(editor, line, pos) {
            let colorMatch,
                ignoreNamedColors;

            function hyphenOnMatchBoundary(match, line) {
                let beforeIndex, afterIndex;
                if (match) {
                    beforeIndex = match.index - 1;
                    if (beforeIndex >= 0 && line[beforeIndex] === "-") {
                        return true;
                    }
                    afterIndex = match.index + match[0].length;
                    if (afterIndex < line.length && line[afterIndex] === "-") {
                        return true;
                    }

                }

                return false;
            }
            function isNamedColor(match) {
                if (match && match[0] && /^[a-z]+$/i.test(match[0])) { // only for color names, not for hex-/rgb-values
                    return true;
                }
            }

            // Hyphens do not count as a regex word boundary (\b), so check for those here
            do {
                colorMatch = colorRegEx.exec(line);
                if (!colorMatch) {
                    break;
                }
                if (ignoreNamedColors === undefined) {
                    let mode = TokenUtils.getModeAt(editor._codeMirror, pos, false).name;
                    ignoreNamedColors = styleLanguages.indexOf(mode) === -1;
                }
            } while (hyphenOnMatchBoundary(colorMatch, line) ||
            (ignoreNamedColors && isNamedColor(colorMatch)));

            return colorMatch;
        }

        // simple css property splitter (used to find color stop arguments in gradients)
        function splitStyleProperty(property) {
            let token = /((?:[^"']|".*?"|'.*?')*?)([(,)]|$)/g;
            let recurse = function () {
                let array = [];
                for (;;) {
                    let result = token.exec(property);
                    if (result[2] === "(") {
                        let str = result[1].trim() + "(" + recurse().join(",") + ")";
                        result = token.exec(property);
                        str += result[1];
                        array.push(str);
                    } else {
                        array.push(result[1].trim());
                    }
                    if (result[2] !== ",") {
                        return array;
                    }
                }
            };
            return (recurse());
        }

        // color stop helpers
        function isGradientColorStop(args) {
            return (args.length > 0 && args[0].match(colorRegEx) !== null);
        }

        function hasLengthInPixels(args) {
            return (args.length > 1 && args[1].indexOf("px") > 0);
        }

        // Ensures that input is in usable hex format
        function ensureHexFormat(str) {
            return (/^0x/).test(str) ? str.replace("0x", "#") : str;
        }

        // Normalizes px color stops to %
        function normalizeGradientExpressionForQuickview(expression) {
            if (expression.indexOf("px") > 0) {
                let paramStart = expression.indexOf("(") + 1,
                    paramEnd = expression.lastIndexOf(")"),
                    parameters = expression.substring(paramStart, paramEnd),
                    params = splitStyleProperty(parameters),
                    lowerBound = 0,
                    upperBound = $previewContainer.width(),
                    args,
                    thisSize,
                    i;

                // find lower bound
                for (i = 0; i < params.length; i++) {
                    args = params[i].split(" ");

                    if (hasLengthInPixels(args)) {
                        thisSize = parseFloat(args[1]);

                        upperBound = Math.max(upperBound, thisSize);
                        // we really only care about converting negative
                        //  pixel values -- so take the smallest negative pixel
                        //  value and use that as baseline for display purposes
                        if (thisSize < 0) {
                            lowerBound = Math.min(lowerBound, thisSize);
                        }
                    }
                }

                // convert negative lower bound to positive and adjust all pixel values
                //  so that -20px is now 0px and 100px is now 120px
                lowerBound = Math.abs(lowerBound);

                // Offset the upperbound by the lowerBound to give us a corrected context
                upperBound += lowerBound;

                // convert to %
                for (i = 0; i < params.length; i++) {
                    args = params[i].split(" ");
                    if (isGradientColorStop(args) && hasLengthInPixels(args)) {
                        if (upperBound === 0) {
                            thisSize = 0;
                        } else {
                            thisSize = ((parseFloat(args[1]) + lowerBound) / upperBound) * 100;
                        }
                        args[1] = thisSize + "%";
                    }
                    params[i] = args.join(" ");
                }

                // put it back together.
                expression = expression.substring(0, paramStart) + params.join(", ") + expression.substring(paramEnd);
            }
            return expression;
        }

        let parensBalanced = areParensBalanced(line),
            gradientMatch = execGradientMatch(line, parensBalanced),
            match = gradientMatch.match || execColorMatch(editor, line, pos);

        while (match) {
            if (pos.ch < match.index) {
                // Gradients are matched first, then colors, so...
                if (gradientMatch.match) {
                    // ... gradient match is past cursor -- stop looking for gradients, start searching for colors
                    gradientMatch = { match: null, prefix: "", colorValue: null };
                } else {
                    // ... color match is past cursor -- stop looping
                    break;
                }
            } else if (pos.ch <= match.index + match[0].length) {
                // build the css for previewing the gradient from the regex result
                let previewCSS = gradientMatch.prefix + (gradientMatch.colorValue || match[0]);

                // normalize the arguments to something that we can display to the user
                // NOTE: we need both the div and the popover's _previewCSS member
                //          (used by unit tests) to match so normalize the css for both
                previewCSS = normalizeGradientExpressionForQuickview(ensureHexFormat(previewCSS));

                let preview = "<div class='color-swatch' style='background:" + previewCSS + "'>" + "</div>";
                let startPos = {line: pos.line, ch: match.index},
                    endPos = {line: pos.line, ch: match.index + match[0].length};

                return {
                    start: startPos,
                    end: endPos,
                    content: preview,
                    _previewCSS: previewCSS
                };
            }

            // Get next match
            if (gradientMatch.match) {
                gradientMatch = execGradientMatch(line, parensBalanced);
            }
            match = gradientMatch.match || execColorMatch(editor, line, pos);
        }

        return null;
    }

    exports.colorAndGradientPreviewProvider = colorAndGradientPreviewProvider;
});
