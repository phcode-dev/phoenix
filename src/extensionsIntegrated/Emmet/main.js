define(function (require, exports, module) {
    const AppInit = require("utils/AppInit");
    // const EditorManager = require("editor/EditorManager");
    const PreferencesManager = require("preferences/PreferencesManager");
    const Strings = require("strings");
    const CodeHintManager = require("editor/CodeHintManager");

    const EXPAND_ABBR = Phoenix.libs.Emmet.expand;
    // const EMMET = Phoenix.libs.Emmet.module;

    /**
     * Object with all the markup snippets that can be expanded into something different than like normal tags
     */
    var markupSnippets = {
        "a": "a[href]",
        "a:blank": "a[href='http://${0}' target='_blank' rel='noopener noreferrer']",
        "a:link": "a[href='http://${0}']",
        "a:mail": "a[href='mailto:${0}']",
        "a:tel": "a[href='tel:+${0}']",
        "abbr": "abbr[title]",
        "acr|acronym": "acronym[title]",
        "base": "base[href]/",
        "basefont": "basefont/",
        "br": "br/",
        "frame": "frame/",
        "hr": "hr/",
        "bdo": "bdo[dir]",
        "bdo:r": "bdo[dir=rtl]",
        "bdo:l": "bdo[dir=ltr]",
        "col": "col/",
        "link": "link[rel=stylesheet href]/",
        "link:css": "link[href='${1:style}.css']",
        "link:print": "link[href='${1:print}.css' media=print]",
        "link:favicon": "link[rel='shortcut icon' type=image/x-icon href='${1:favicon.ico}']",
        "link:mf|link:manifest": "link[rel='manifest' href='${1:manifest.json}']",
        "link:touch": "link[rel=apple-touch-icon href='${1:favicon.png}']",
        "link:rss": "link[rel=alternate type=application/rss+xml title=RSS href='${1:rss.xml}']",
        "link:atom": "link[rel=alternate type=application/atom+xml title=Atom href='${1:atom.xml}']",
        "link:im|link:import": "link[rel=import href='${1:component}.html']",
        "meta": "meta/",
        "meta:utf": "meta[http-equiv=Content-Type content='text/html;charset=UTF-8']",
        "meta:vp": "meta[name=viewport content='width=${1:device-width}, initial-scale=${2:1.0}']",
        "meta:compat": "meta[http-equiv=X-UA-Compatible content='${1:IE=7}']",
        "meta:edge": "meta:compat[content='${1:ie=edge}']",
        "meta:redirect": "meta[http-equiv=refresh content='0; url=${1:http://example.com}']",
        "meta:refresh": "meta[http-equiv=refresh content='${1:5}']",
        "meta:kw": "meta[name=keywords content]",
        "meta:desc": "meta[name=description content]",
        "style": "style",
        "script": "script",
        "script:src": "script[src]",
        "script:module": "script[type=module src]",
        "img": "img[src alt]/",
        "img:s|img:srcset": "img[srcset src alt]",
        "img:z|img:sizes": "img[sizes srcset src alt]",
        "picture": "picture",
        "src|source": "source/",
        "src:sc|source:src": "source[src type]",
        "src:s|source:srcset": "source[srcset]",
        "src:t|source:type": "source[srcset type='${1:image/}']",
        "src:z|source:sizes": "source[sizes srcset]",
        "src:m|source:media": "source[media='(${1:min-width: })' srcset]",
        "src:mt|source:media:type": "source:media[type='${2:image/}']",
        "src:mz|source:media:sizes": "source:media[sizes srcset]",
        "src:zt|source:sizes:type": "source[sizes srcset type='${1:image/}']",
        "iframe": "iframe[src frameborder=0]",
        "embed": "embed[src type]/",
        "object": "object[data type]",
        "param": "param[name value]/",
        "map": "map[name]",
        "area": "area[shape coords href alt]/",
        "area:d": "area[shape=default]",
        "area:c": "area[shape=circle]",
        "area:r": "area[shape=rect]",
        "area:p": "area[shape=poly]",
        "form": "form[action]",
        "form:get": "form[method=get]",
        "form:post": "form[method=post]",
        "label": "label[for]",
        "input": "input[type=${1:text}]/",
        "inp": "input[name=${1} id=${1}]",
        "input:h|input:hidden": "input[type=hidden name]",
        "input:t|input:text": "inp[type=text]",
        "input:search": "inp[type=search]",
        "input:email": "inp[type=email]",
        "input:url": "inp[type=url]",
        "input:p|input:password": "inp[type=password]",
        "input:datetime": "inp[type=datetime]",
        "input:date": "inp[type=date]",
        "input:datetime-local": "inp[type=datetime-local]",
        "input:month": "inp[type=month]",
        "input:week": "inp[type=week]",
        "input:time": "inp[type=time]",
        "input:tel": "inp[type=tel]",
        "input:number": "inp[type=number]",
        "input:color": "inp[type=color]",
        "input:c|input:checkbox": "inp[type=checkbox]",
        "input:r|input:radio": "inp[type=radio]",
        "input:range": "inp[type=range]",
        "input:f|input:file": "inp[type=file]",
        "input:s|input:submit": "input[type=submit value]",
        "input:i|input:image": "input[type=image src alt]",
        "input:b|input:btn|input:button": "input[type=button value]",
        "input:reset": "input:button[type=reset]",
        "isindex": "isindex/",
        "select": "select[name=${1} id=${1}]",
        "select:d|select:disabled": "select[disabled.]",
        "opt|option": "option[value]",
        "textarea": "textarea[name=${1} id=${1}]",
        "tarea:c|textarea:cols": "textarea[name=${1} id=${1} cols=${2:30}]",
        "tarea:r|textarea:rows": "textarea[name=${1} id=${1} rows=${3:10}]",
        "tarea:cr|textarea:cols:rows": "textarea[name=${1} id=${1} cols=${2:30} rows=${3:10}]",
        "marquee": "marquee[behavior direction]",
        "menu:c|menu:context": "menu[type=context]",
        "menu:t|menu:toolbar": "menu[type=toolbar]",
        "video": "video[src]",
        "audio": "audio[src]",
        "html:xml": "html[xmlns=http://www.w3.org/1999/xhtml]",
        "keygen": "keygen/",
        "command": "command/",
        "btn:s|button:s|button:submit": "button[type=submit]",
        "btn:r|button:r|button:reset": "button[type=reset]",
        "btn:b|button:b|button:button": "button[type=button]",
        "btn:d|button:d|button:disabled": "button[disabled.]",
        "fst:d|fset:d|fieldset:d|fieldset:disabled": "fieldset[disabled.]",

        "bq": "blockquote",
        "fig": "figure",
        "figc": "figcaption",
        "pic": "picture",
        "ifr": "iframe",
        "emb": "embed",
        "obj": "object",
        "cap": "caption",
        "colg": "colgroup",
        "fst": "fieldset",
        "btn": "button",
        "optg": "optgroup",
        "tarea": "textarea",
        "leg": "legend",
        "sect": "section",
        "art": "article",
        "hdr": "header",
        "ftr": "footer",
        "adr": "address",
        "dlg": "dialog",
        "str": "strong",
        "prog": "progress",
        "mn": "main",
        "tem": "template",
        "fset": "fieldset",
        "datal": "datalist",
        "kg": "keygen",
        "out": "output",
        "det": "details",
        "sum": "summary",
        "cmd": "command",
        "data": "data[value]",
        "meter": "meter[value]",
        "time": "time[datetime]",

        "ri:d|ri:dpr": "img:s",
        "ri:v|ri:viewport": "img:z",
        "ri:a|ri:art": "pic>src:m+img",
        "ri:t|ri:type": "pic>src:t+img",

        "!!!": "{<!DOCTYPE html>}",
        "doc": "html[lang=${lang}]>(head>meta[charset=${charset}]+meta:vp+title{${1:Document}})+body",
        "!|html:5": "!!!+doc",

        "c": "{<!-- ${0} -->}",
        "cc:ie": "{<!--[if IE]>${0}<![endif]-->}",
        "cc:noie": "{<!--[if !IE]><!-->${0}<!--<![endif]-->}"
    };

    /**
     * A list of all the markup snippets that can be expanded.
     * For ex: 'link:css', 'iframe'
     * They expand differently as compared to normal tags.
     */
    const markupSnippetsList = Object.keys(markupSnippets);

    /**
     * A list of all the HTML tags that expand like normal tags
     */
    const htmlTags = [
        "a", "abbr", "address", "area", "article", "aside", "audio", "b", "base",
        "bdi", "bdo", "blockquote", "body", "br", "button", "canvas", "caption",
        "cite", "code", "col", "colgroup", "data", "datalist", "dd", "del",
        "details", "dfn", "dialog", "div", "dl", "dt", "em", "embed", "fieldset",
        "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5",
        "h6", "head", "header", "hgroup", "hr", "html", "i", "iframe", "img",
        "input", "ins", "kbd", "label", "legend", "li", "link", "main", "map",
        "mark", "meta", "meter", "nav", "noscript", "object", "ol", "optgroup",
        "option", "output", "p", "param", "picture", "pre", "progress", "q",
        "rp", "rt", "ruby", "s", "samp", "script", "section", "select", "small",
        "source", "span", "strong", "style", "sub", "summary", "sup", "table",
        "tbody", "td", "template", "textarea", "tfoot", "th", "thead", "time",
        "title", "tr", "track", "u", "ul", "var", "video", "wbr"
    ];

    /**
 * A list of all those symbols which if present in a word, that word can be expanded
 */
    const positiveSymbols = [
        '.',  // classes
        '#',  // ids
        '!',  // document generator
        '>',  // Child Selector
        '+',  // Adjacent Sibling Selector
        '^',  // Parent Selector
        '*',  // Multiplication (Repeat Element)
        '[',
        ']', // Attributes
        '{',
        '}', // Text Content
        '(',
        ')', // Group
        '&'   // Current Element Reference
    ];

    /**
     * A list of all those symbols which if present in a word, that word cannot be expanded
     */
    const negativeSymbols = [
        '</'   // closing tag
    ];


    // For preferences settings, to toggle this feature on/off
    const PREFERENCES_EMMET = "emmet";
    let enabled = true; // by default:- on

    PreferencesManager.definePreference(PREFERENCES_EMMET, "boolean", enabled, {
        description: Strings.DESCRIPTION_EMMET
    });


    /**
     * @constructor
     */
    function EmmetMarkupHints() {
    }

    EmmetMarkupHints.prototype.hasHints = function (editor, implicitChar) {

        this.editor = editor;

        const wordObj = getWordBeforeCursor(editor);
        const config = createConfig(editor);
        if (config && config.syntax === "html") {

            // make sure we donot have empty spaces
            if (wordObj.word.trim()) {

                const expandedAbbr = isExpandable(editor, wordObj.word, config);
                if (expandedAbbr) {
                    return true;
                }
            }
        }

        return false;
    };


    EmmetMarkupHints.prototype.getHints = function (implicitChar) {
        const wordObj = getWordBeforeCursor(this.editor);
        const config = createConfig(this.editor);

        const expandedAbbr = isExpandable(this.editor, wordObj.word, config);
        if (!expandedAbbr) {
            return null;
        }

        const result = [wordObj.word];

        return {
            hints: result,
            match: null,
            selectInitial: true,
            defaultDescriptionWidth: true,
            handleWideResults: false
        };
    };

    EmmetMarkupHints.prototype.insertHint = function (completion) {
        const wordObj = getWordBeforeCursor(this.editor);
        const config = createConfig(this.editor);
        const expandedAbbr = isExpandable(this.editor, wordObj.word, config);
        updateAbbrInEditor(this.editor, wordObj, expandedAbbr);
        return false;
    };


    /**
     * Responsible to create the configuration based on the file type
     * Config is an object with two properties, type & snytax
     * This is required by the Emmet API to distinguish between HTML & Stylesheets
     *
     * @param {Editor} editor - The editor instance
     * @returns {Object | False} Object with two properties 'syntax' and 'type'
     */
    function createConfig(editor) {
        const fileType = editor.document.getLanguage().getId();

        if (fileType === "html") {
            return { syntax: "html", type: "markup" };
        }

        if (fileType === "css" || fileType === "scss" || fileType === "less") {
            return { syntax: "css", type: "stylesheet" };
        }

        return false;
    }

    /**
     * Determines whether a given character is allowed as part of an Emmet abbreviation
     *
     * @param {String} char - The character to test
     * @param {Boolean} insideBraces - Flag indicating if we are inside braces (e.g. {} or [])
     * @returns True if the character is valid for an abbreviation
     */
    function isEmmetChar(char, insideBraces) {
        // Valid abbreviation characters: letters, digits, and some punctuation
        // Adjust this regex or the list as needed for your implementation
        const validPattern = /[a-zA-Z0-9:+*<>()/!$\-@#}{]/;
        const specialChars = new Set(['.', '#', '[', ']', '"', '=', ':', ',', '-']);
        return validPattern.test(char) || specialChars.has(char) || (insideBraces && char === ' ');
    }


    /**
     * Scans backwards from the given cursor position on a line to locate the start of the Emmet abbreviation
     *
     * @param {String} line - The full text of the current line
     * @param {Number} cursorCh - The cursor's character (column) position on that line
     * @returns The index (column) where the abbreviation starts
     */
    function findAbbreviationStart(line, cursorCh) {
        let start = cursorCh;
        let insideBraces = false;

        // If the cursor is right before a closing brace, adjust it to be "inside" the braces
        if (line.charAt(start) === '}' || line.charAt(start) === ']') {
            start--;
            insideBraces = true;
        }

        // Walk backwards from the cursor to find the boundary of the abbreviation
        while (start > 0) {
            const char = line.charAt(start - 1);

            // Update our "inside braces" state based on the character
            if (char === '}' || char === ']') {
                insideBraces = true;
            } else if (char === '{' || char === '[') {
                insideBraces = false;
            }

            // If the character is valid as part of an Emmet abbreviation, continue scanning backwards
            if (isEmmetChar(char, insideBraces)) {
                start--;
            } else {
                break;
            }
        }
        return start;
    }


    /**
     * Retrieves the Emmet abbreviation (i.e. the word before the cursor) from the current editor state
     *
     * @param {Editor} editor - The editor instance
     * @returns An object with the abbreviation and its start/end positions
     *
     * Format:
     * {
     *   word: string,             // the extracted abbreviation
     *   start: { line: number, ch: number },
     *   end: { line: number, ch: number }
     * }
     */
    function getWordBeforeCursor(editor) {
        const pos = editor.getCursorPos();
        const lineText = editor.document.getLine(pos.line);

        // to determine where the abbreviation starts on the line
        const abbreviationStart = findAbbreviationStart(lineText, pos.ch);

        // Optionally, adjust the end position if the cursor is immediately before a closing brace.
        let abbreviationEnd = pos.ch;
        if (lineText.charAt(abbreviationEnd) === '}' || lineText.charAt(abbreviationEnd) === ']') {
            abbreviationEnd++;
        }

        const word = lineText.substring(abbreviationStart, abbreviationEnd);

        return {
            word: word,
            start: { line: pos.line, ch: abbreviationStart },
            end: { line: pos.line, ch: abbreviationEnd }
        };
    }


    /**
     * Calculate the indentation level for the current line
     *
     * @param {Editor} editor - the editor instance
     * @param {Object} position - position object with line number
     * @returns {String} - the indentation string
     */
    function getLineIndentation(editor, position) {
        const line = editor.document.getLine(position.line);
        const match = line.match(/^\s*/);
        return match ? match[0] : '';
    }


    /**
     * Adds proper indentation to multiline Emmet expansion
     *
     * @param {String} expandedText - the expanded Emmet abbreviation
     * @param {String} baseIndent - the base indentation string
     * @returns {String} - properly indented text
     */
    function addIndentation(expandedText, baseIndent) {
        // Split into lines, preserve empty lines
        const lines = expandedText.split(/(\r\n|\n)/g);

        // Process each line
        let result = '';
        let isFirstLine = true;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // If it's a newline character, just add it
            if (line === '\n' || line === '\r\n') {
                result += line;
                continue;
            }

            // Skip indenting empty lines
            if (line.trim() === '') {
                result += line;
                continue;
            }

            // Don't indent the first line as it inherits the current indent
            if (isFirstLine) {
                result += line;
                isFirstLine = false;
            } else {
                // Add base indent plus the existing indent in the expanded text
                result += baseIndent + line;
            }
        }

        return result;
    }



    /**
     * Find the position where cursor should be placed after expansion
     * Looks for patterns like '><', '""', ''
     *
     * @param {Editor} editor - The editor instance
     * @param {String} indentedAbbr - the indented abbreviation
     * @param {Object} startPos - Starting position {line, ch} of the expansion
     * @returns {Object | false} - Cursor position {line, ch} or false if no pattern found
     */
    function findCursorPosition(editor, indentedAbbr, startPos) {
        const totalLines = startPos.line + indentedAbbr.split('\n').length;

        for (let i = startPos.line; i < totalLines; i++) {
            const line = editor.document.getLine(i);

            for (let j = 0; j < line.length - 1; j++) {
                const pair = line[j] + line[j + 1];

                if (pair === '""' || pair === "''") {
                    return { line: i, ch: j + 1 };
                }
            }
            for (let j = 0; j < line.length - 1; j++) {
                const pair = line[j] + line[j + 1];

                if (pair === '><') {
                    return { line: i, ch: j + 1 };
                }
            }
        }

        // Look for opening and closing tag pairs with empty line in between
        // <body>
        //      |
        // </body>
        // here in such scenarios, we want the cursor to be placed in between
        // Look for opening and closing tag pairs with empty line in between
        for (let i = startPos.line; i < totalLines; i++) {
            const line = editor.document.getLine(i).trim();
            if (line.endsWith('>') && line.includes('<') && !line.includes('</')) {
                if (editor.document.getLine(i + 1) && !editor.document.getLine(i + 1).trim()) {
                    const tempLine = editor.document.getLine(i + 2);
                    if (tempLine) {
                        const trimmedTempLine = tempLine.trim();
                        if (trimmedTempLine.includes('</') && trimmedTempLine.startsWith('<')) {
                            // Get the current line's indentation by counting spaces/tabs
                            const openingTagLine = editor.document.getLine(i);
                            const indentMatch = openingTagLine.match(/^[\s\t]*/)[0];
                            // Add 4 more spaces (or equivalent tab) for inner content
                            const extraIndent = '    ';  // 4 spaces for additional indentation

                            return {
                                line: i + 1,
                                ch: indentMatch.length + extraIndent.length
                            };
                        }
                    }
                }
            }
        }

        return false;
    }



    /**
     * This function is responsible to replace the abbreviation in the editor,
     * with its expanded version
     *
     * @param {Editor} editor - the editor instance
     * @param {Object} wordObj -  an object in the format :
     * {
     *      word: "",   // the word before the cursor
     *      start: {line: Number, ch: Number},
     *      end: {line: Number, ch: Number}
     * }
     * @param {String} expandedAbbr - the expanded version of abbr that will replace the abbr
     */
    function updateAbbrInEditor(editor, wordObj, expandedAbbr) {
        // Get the current line's indentation
        const baseIndent = getLineIndentation(editor, wordObj.start);

        // Add proper indentation to the expanded abbreviation
        const indentedAbbr = addIndentation(expandedAbbr, baseIndent);

        // Handle the special case for braces
        // this check is added because in some situations such as
        // `ul>li{Hello}` and the cursor is before the closing braces right after 'o',
        // then when this is expanded it results in an extra closing braces at the end.
        // so we remove the extra closing brace from the end
        if (wordObj.word.includes('{') || wordObj.word.includes('[')) {
            const pos = editor.getCursorPos();
            const line = editor.document.getLine(pos.line);
            const char = line.charAt(wordObj.end.ch);
            const charsNext = line.charAt(wordObj.end.ch + 1);

            if (char === '}' || char === ']') {
                wordObj.end.ch += 1;
            }

            // sometimes at the end we get `"]` as extra with some abbreviations.
            if (char === '"' && charsNext && charsNext === ']') {
                wordObj.end.ch += 2;
            }

        }

        // Replace the abbreviation
        editor.document.replaceRange(
            indentedAbbr,
            wordObj.start,
            wordObj.end
        );

        // Calculate and set the new cursor position
        const cursorPos = findCursorPosition(editor, indentedAbbr, wordObj.start);
        if (cursorPos) {
            editor.setCursorPos(cursorPos.line, cursorPos.ch);
        }
    }


    /**
     * This function checks whether the abbreviation can be expanded or not.
     * There are a lot of cases to check:
     * There should not be any negative symbols
     * The abbr should be either in htmlTags or in markupSnippetsList
     * For other cases such as 'ul>li', we will check if there is any,
     * positive word. This is done to handle complex abbreviations such as,
     * 'ul>li' or 'li*3{Hello}'. So we check if the word includes any positive symbols.
     *
     * @param {Editor} editor - the editor instance
     * @param {String} word - the abbr
     * @param {Object} config - the config object, to make sure it is a valid file type,
     * refer to createConfig function for more info about config object.
     * @returns {String | false} - returns the expanded abbr, and if cannot be expanded, returns false
     */
    function isExpandable(editor, word, config) {

        // make sure that word doesn't contain any negativeSymbols
        if (negativeSymbols.some(symbol => word.includes(symbol))) {
            return false;
        }

        // the word must be either in markupSnippetsList, htmlList or it must have a positive symbol
        if (markupSnippetsList.includes(word) ||
            htmlTags.includes(word) ||
            positiveSymbols.some(symbol => word.includes(symbol))) {

            try {
                const expanded = EXPAND_ABBR(word, config);
                return expanded;
            } catch (error) {

                // emmet api throws an error when abbr contains unclosed quotes, handling that case
                const pos = editor.getCursorPos();
                const line = editor.document.getLine(pos.line);
                const nextChar = line.charAt(pos.ch);

                if (nextChar) {
                    // If the next character is a quote, add quote to abbr
                    if (nextChar === '"' || nextChar === "'") {
                        const modifiedWord = word + nextChar;

                        try {
                            const expandedModified = EXPAND_ABBR(modifiedWord, config);
                            return expandedModified;
                        } catch (innerError) {
                            // If it still fails, return false
                            return false;
                        }
                    }
                }

                // If no quote is found or expansion fails, return false
                return false;
            }
        }

        return false;
    }


    /**
     * Checks for preference changes, to enable/disable the feature
     */
    function preferenceChanged() {
        const value = PreferencesManager.get(PREFERENCES_EMMET);
        enabled = value;
    }

    AppInit.appReady(function () {
        // Set up preferences
        PreferencesManager.on("change", PREFERENCES_EMMET, preferenceChanged);
        preferenceChanged();

        var emmetMarkupHints = new EmmetMarkupHints();
        CodeHintManager.registerHintProvider(emmetMarkupHints, ["html"], 2);

    });
});





