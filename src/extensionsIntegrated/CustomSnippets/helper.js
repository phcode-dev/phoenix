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

define(function (require, exports, module) {
    const StringMatch = require("utils/StringMatch");
    const Global = require("./global");
    const UIHelper = require("./UIHelper");
    const Strings = require("strings");

    // list of all the navigation and function keys that are allowed inside the input fields
    const ALLOWED_NAVIGATION_KEYS = [
        "Backspace",
        "Delete",
        "Tab",
        "Escape",
        "Enter",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
        "PageUp",
        "PageDown",
        "F1",
        "F2",
        "F3",
        "F4",
        "F5",
        "F6",
        "F7",
        "F8",
        "F9",
        "F10",
        "F11",
        "F12"
    ];

    // Optimized data structures for fast snippet lookups
    let snippetsByLanguage = new Map();
    let snippetsByAbbreviation = new Map();
    let allSnippetsOptimized = [];

    /**
     * Preprocesses a snippet to add optimized lookup properties
     * @param {Object} snippet - The original snippet object
     * @returns {Object} - The snippet with added optimization properties
     */
    function preprocessSnippet(snippet) {
        const optimizedSnippet = { ...snippet };

        // pre-compute lowercase abbreviation for faster matching
        optimizedSnippet.abbreviationLower = snippet.abbreviation.toLowerCase();

        // parse and create a Set of supported extensions for O(1) lookup
        if (snippet.fileExtension.toLowerCase() === "all") {
            optimizedSnippet.supportedLangSet = new Set(["all"]);
            optimizedSnippet.supportsAllLanguages = true;
        } else {
            const extensions = snippet.fileExtension
                .toLowerCase()
                .split(",")
                .map(ext => ext.trim())
                .filter(ext => ext);
            optimizedSnippet.supportedLangSet = new Set(extensions);
            optimizedSnippet.supportsAllLanguages = false;
        }

        return optimizedSnippet;
    }

    /**
     * Rebuilds optimized data structures from the current snippet list
     * we call this function whenever snippets are loaded, added, modified, or deleted
     * i.e. whenever the snippetList is updated
     */
    function rebuildOptimizedStructures() {
        // clear existing structures
        snippetsByLanguage.clear();
        snippetsByAbbreviation.clear();
        allSnippetsOptimized.length = 0;

        // Process each snippet
        Global.SnippetHintsList.forEach(snippet => {
            const optimizedSnippet = preprocessSnippet(snippet);
            allSnippetsOptimized.push(optimizedSnippet);

            // Index by abbreviation (lowercase) for exact matches
            snippetsByAbbreviation.set(optimizedSnippet.abbreviationLower, optimizedSnippet);

            // Index by supported languages/extensions
            if (optimizedSnippet.supportsAllLanguages) {
                // Add to a special "all" key for universal snippets
                if (!snippetsByLanguage.has("all")) {
                    snippetsByLanguage.set("all", new Set());
                }
                snippetsByLanguage.get("all").add(optimizedSnippet);
            } else {
                // Add to each supported extension
                optimizedSnippet.supportedLangSet.forEach(ext => {
                    if (!snippetsByLanguage.has(ext)) {
                        snippetsByLanguage.set(ext, new Set());
                    }
                    snippetsByLanguage.get(ext).add(optimizedSnippet);
                });
            }
        });
    }

    /**
     * map the language IDs to their file extensions for snippet matching
     * this is needed because we expect the user to enter file extensions and not the file type inside the input field
     *
     * @param {string} languageId - The language ID from Phoenix
     * @returns {string} - The equivalent file extension for snippet matching
     */
    function mapLanguageToExtension(languageId) {
        const languageMap = {
            javascript: ".js",
            css: ".css",
            html: ".html",
            php: ".php",
            python: ".py",
            java: ".java",
            c: ".c",
            cpp: ".cpp",
            csharp: ".cs",
            typescript: ".ts",
            json: ".json",
            xml: ".xml",
            sql: ".sql",
            sass: ".sass",
            scss: ".scss",
            less: ".less",
            stylus: ".styl",
            coffeescript: ".coffee",
            markdown: ".md",
            yaml: ".yml",
            ruby: ".rb",
            go: ".go",
            rust: ".rs",
            swift: ".swift",
            kotlin: ".kt",
            dart: ".dart",
            vue: ".vue",
            jsx: ".jsx",
            tsx: ".tsx"
        };

        return languageMap[languageId] || languageId;
    }

    /**
     * This function is to make sure file extensions are properly formatted with leading dots
     * because user may provide values in not very consistent manner, we need to handle all those cases
     * For ex: what we expect: `.js, .html, .css`
     * what user may provide: `js, html, css` or: `js html css` etc
     *
     * This function processes file extensions in various formats and ensures they:
     * - Have a leading dot (if not empty or "all")
     * - Are properly separated with commas and spaces
     * - Don't contain empty or standalone dots
     * - No consecutive commas
     *
     * @param {string} extension - The file extension(s) to process
     * @returns {string} - The properly formatted file extension(s)
     */
    function processFileExtensionInput(extension) {
        if (!extension || extension === "all") {
            return extension;
        }

        // Step 1: normalize the input by converting spaces to commas if no commas exist
        if (extension.includes(" ")) {
            extension = extension.replace(/\s+/g, ",");
        }

        let result = "";

        // Step 2: process comma-separated extensions FIRST (before dot-separated)
        // this prevents issues with inputs like ".js,.html,." or ".js,,.html"
        if (extension.includes(",")) {
            result = extension
                .split(",")
                .map((ext) => {
                    ext = ext.trim();
                    // skip all the standalone dots or empty entries
                    if (ext === "." || ext === "") {
                        return "";
                    }
                    // Add leading dot if missing
                    return ext.startsWith(".") ? ext : "." + ext;
                })
                .filter((ext) => ext !== "") // Remove empty entries
                .join(", ");
        } else {
            // Step 3: Handle single extension
            if (extension === ".") {
                result = ""; // remove standalone dot
            } else {
                // Add leading dot if missing
                result = extension.startsWith(".") ? extension : "." + extension;
            }
        }

        // this is just the final safeguard to remove any consecutive commas and clean up spacing
        result = result.replace(/,\s*,+/g, ",").replace(/,\s*$/, "").replace(/^\s*,/, "").trim();
        // remove trailing dots (like .css. -> .css)
        result = result.endsWith('.') ? result.slice(0, -1) : result;

        return result;
    }

    /**
     * This function is responsible to get the snippet data from all the required input fields
     * it is called when the save button is clicked
     * @private
     * @returns {object} - a snippet object
     */
    function getSnippetData() {
        // get the values from all the input fields
        const abbreviation = $("#abbr-box").val().trim();
        const description = $("#desc-box").val().trim();
        const templateText = $("#template-text-box").val().trim();
        const fileExtension = $("#file-extn-box").val().trim();

        // process the file extension so that we can get the value in the required format
        const processedFileExtension = processFileExtensionInput(fileExtension);

        return {
            abbreviation: abbreviation,
            description: description || "", // allow empty description
            templateText: templateText,
            fileExtension: processedFileExtension || "all" // default to "all" if empty
        };
    }

    /**
     * This function is responsible to enable/disable the save button
     * when all the required input fields are not filled up as required then we need to disable the save button
     * otherwise we enable it
     * this is called inside the '_registerHandlers' function in the main.js file
     */
    function toggleSaveButtonDisability() {
        // abbreviation and template text are required fields
        // they both should have some value only then save button will be enabled
        const $abbrInput = $("#abbr-box");
        const $templateInput = $("#template-text-box");

        const $saveBtn = $("#save-custom-snippet-btn");

        // make sure that the required fields has some value
        const hasAbbr = $abbrInput.val().trim().length > 0;
        const hasTemplate = $templateInput.val().trim().length > 0;
        $saveBtn.prop("disabled", !(hasAbbr && hasTemplate));
    }

    /**
     * this function is responsible to get the current language context,
     * from the editor at cursor position
     *
     * @param {Editor} editor - The editor instance
     * @returns {string|null} - The language ID or null if not available
     */
    function getCurrentLanguageContext(editor) {
        const language = editor.getLanguageForPosition();
        const languageId = language ? language.getId() : null;
        return languageId;
    }

    /**
     * Gets the current file extension from the editor
     * @param {Editor} editor - The editor instance
     * @returns {string|null} - The file extension or null if not available
     */
    function getCurrentFileExtension(editor) {
        const filePath = editor && editor.document && editor.document.file ? editor.document.file.fullPath : undefined;
        if (filePath) {
            return filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
        }
        return null;
    }

    /**
     * Checks if a snippet is supported in the given language context
     * Falls back to file extension matching if language mapping isn't available
     *
     * @param {Object} snippet - The snippet object (optimized or regular)
     * @param {string|null} languageContext - The current language context
     * @param {Editor} editor - The editor instance for fallback
     * @returns {boolean} - True if the snippet is supported
     */
    function isSnippetSupportedInLanguageContext(snippet, languageContext, editor) {
        // Check for "all" languages support (both optimized and non-optimized)
        if (
            snippet.supportsAllLanguages === true ||
            (snippet.fileExtension && snippet.fileExtension.toLowerCase() === "all")
        ) {
            return true;
        }

        // Try language context matching if available
        if (languageContext) {
            const effectiveExtension = mapLanguageToExtension(languageContext);

            // if we have a proper mapping (starts with .), use language context matching
            if (effectiveExtension.startsWith(".")) {
                // Use optimized path if available
                if (snippet.supportedLangSet) {
                    return snippet.supportedLangSet.has(effectiveExtension);
                }
                // Fallback for non-optimized snippets
                const supportedExtensions = snippet.fileExtension
                    .toLowerCase()
                    .split(",")
                    .map((ext) => ext.trim());
                return supportedExtensions.some((ext) => ext === effectiveExtension);
            }
        }

        // final fallback for file extension matching if language context matching failed
        if (editor) {
            const fileExtension = getCurrentFileExtension(editor);
            return isSnippetSupportedInFile(snippet, fileExtension);
        }

        return false;
    }

    /**
     * Checks if a snippet is supported in the given file extension
     * @param {Object} snippet - The snippet object
     * @param {string|null} fileExtension - The current file extension
     * @returns {boolean} - True if the snippet is supported
     */
    function isSnippetSupportedInFile(snippet, fileExtension) {
        if (snippet.fileExtension.toLowerCase() === "all") {
            return true;
        }

        if (fileExtension) {
            const supportedExtensions = snippet.fileExtension
                .toLowerCase()
                .split(",")
                .map((ext) => ext.trim());
            return supportedExtensions.some((ext) => ext === fileExtension);
        }

        return false;
    }

    /**
     * Checks if there's at least one exact match for the query
     * @param {string} query - The search query
     * @param {Editor} editor - The editor instance
     * @returns {boolean} - True if there's an exact match
     */
    function hasExactMatchingSnippet(query, editor) {
        const queryLower = query.toLowerCase();
        const languageContext = getCurrentLanguageContext(editor);

        const snippet = snippetsByAbbreviation.get(queryLower);
        if (snippet) {
            return isSnippetSupportedInLanguageContext(snippet, languageContext, editor);
        }

        return false;
    }

    /**
     * Gets all snippets that match the query (prefix matches)
     * @param {string} query - The search query
     * @param {Editor} editor - The editor instance
     * @returns {Array} - an array of matching snippets, sorted with exact matches first
     */
    function getMatchingSnippets(query, editor) {
        const queryLower = query.toLowerCase();
        const languageContext = getCurrentLanguageContext(editor);

        // Get the candidate snippets for the current language/extension
        let candidateSnippets = new Set();

        // Add universal snippets (support "all" languages)
        const universalSnippets = snippetsByLanguage.get("all");
        if (universalSnippets) {
            universalSnippets.forEach(snippet => candidateSnippets.add(snippet));
        }

        // Add language-specific snippets
        if (languageContext) {
            const effectiveExtension = mapLanguageToExtension(languageContext);
            if (effectiveExtension.startsWith(".")) {
                const languageSnippets = snippetsByLanguage.get(effectiveExtension);
                if (languageSnippets) {
                    languageSnippets.forEach(snippet => candidateSnippets.add(snippet));
                }
            }
        }

        // Fallback: if we can't determine language, check all snippets
        if (candidateSnippets.size === 0) {
            candidateSnippets = new Set(allSnippetsOptimized);
        }

        // Filter candidates by prefix match using pre-computed lowercase abbreviations
        const matchingSnippets = Array.from(candidateSnippets).filter((snippet) => {
            return snippet.abbreviationLower.startsWith(queryLower);
        });

        // sort snippets so that the exact matches will appear over the partial matches
        return matchingSnippets.sort((a, b) => {
            // check if either is an exact match
            const aExact = a.abbreviationLower === queryLower;
            const bExact = b.abbreviationLower === queryLower;

            // because exact matches appear first
            if (aExact && !bExact) {
                return -1;
            }
            if (bExact && !aExact) {
                return 1;
            }

            return a.abbreviationLower.localeCompare(b.abbreviationLower);
        });
    }

    /**
     * this function is responsible to create a hint item
     * this is needed because along with the abbr in the code hint, we also want to show an icon saying 'Snippet',
     * to give users an idea that this hint is coming from snippets
     * this function is called inside the 'getHints' method in the codeHints.js file
     * @param   {String} abbr - the abbreviation text that is to be displayed in the code hint
     * @param   {String} query - the query string typed by the user for highlighting matching characters
     * @param   {String} description - the description of the snippet to be displayed
     * @returns {JQuery} - the jquery item that has the abbr text and the Snippet icon
     */
    function createHintItem(abbr, query, description) {
        var $hint = $("<span>")
            .addClass("brackets-css-hints brackets-hints custom-snippets-hint")
            .attr("data-val", abbr)
            .attr("data-isCustomSnippet", true);

        // add the tooltip for the description shown when the hint is hovered
        if (description && description.trim() !== "") {
            $hint.attr("title", description.trim());
        }

        // create highlighting for matching characters like other hint providers
        if (query && query.length > 0) {
            // use the StringMatch to get proper highlighting ranges
            const matchResult = StringMatch.stringMatch(abbr, query, { preferPrefixMatches: true });
            if (matchResult && matchResult.stringRanges) {
                matchResult.stringRanges.forEach(function (item) {
                    if (item.matched) {
                        $hint.append($("<span>").text(item.text).addClass("matched-hint"));
                    } else {
                        $hint.append(item.text);
                    }
                });
            } else {
                $hint.text(abbr);
            }
        } else {
            $hint.text(abbr);
        }

        // the codehints related style is written in brackets_patterns_override.less file
        let $icon = $(`<a href="#" class="custom-snippet-code-hint" style="text-decoration: none">${Strings.CUSTOM_SNIPPETS_HINT_LABEL}</a>`);
        $hint.append($icon);

        if (description && description.trim() !== "") {
            const fullDescription = description.trim();
            // truncate description if longer than 80 characters
            const displayDescription =
                fullDescription.length > 80 ? fullDescription.substring(0, 80) + "..." : fullDescription;

            const $desc = $(`<span class="snippet-description">${displayDescription}</span>`);
            $hint.append($desc);
        }

        return $hint;
    }

    /**
     * This function is responsible to clear all the input fields.
     * when the save button is clicked we get the data from the input fields and then clear all of them
     */
    function clearAllInputFields() {
        $("#abbr-box").val("");
        $("#desc-box").val("");
        $("#template-text-box").val("");
        $("#file-extn-box").val("");
    }

    /**
     * This function populates the edit form with snippet data
     * @param {Object} snippetData - The snippet object to edit
     */
    function populateEditForm(snippetData) {
        $("#edit-abbr-box").val(snippetData.abbreviation);
        $("#edit-desc-box").val(snippetData.description || "");
        $("#edit-template-text-box").val(snippetData.templateText);
        $("#edit-file-extn-box").val(snippetData.fileExtension === "all" ? "" : snippetData.fileExtension);
    }

    /**
     * This function is responsible to get the snippet data from all the edit form input fields
     * @returns {object} - a snippet object
     */
    function getEditSnippetData() {
        // get the values from all the edit input fields
        const abbreviation = $("#edit-abbr-box").val().trim();
        const description = $("#edit-desc-box").val().trim();
        const templateText = $("#edit-template-text-box").val().trim();
        const fileExtension = $("#edit-file-extn-box").val().trim();

        // process the file extension so that we can get the value in the required format
        const processedFileExtension = processFileExtensionInput(fileExtension);

        return {
            abbreviation: abbreviation,
            description: description || "", // allow empty description
            templateText: templateText,
            fileExtension: processedFileExtension || "all" // default to "all" if empty
        };
    }

    /**
     * This function is responsible to enable/disable the save button in edit mode
     */
    function toggleEditSaveButtonDisability() {
        // abbreviation and template text are required fields
        const $abbrInput = $("#edit-abbr-box");
        const $templateInput = $("#edit-template-text-box");

        const $saveBtn = $("#save-edit-snippet-btn");

        // make sure that the required fields has some value
        const hasAbbr = $abbrInput.val().trim().length > 0;
        const hasTemplate = $templateInput.val().trim().length > 0;
        $saveBtn.prop("disabled", !(hasAbbr && hasTemplate));
    }

    /**
     * This function clears all the edit form input fields
     */
    function clearEditInputFields() {
        $("#edit-abbr-box").val("");
        $("#edit-desc-box").val("");
        $("#edit-template-text-box").val("");
        $("#edit-file-extn-box").val("");
    }

    /**
     * validates and sanitizes file extension input
     *
     * @param {string} value - The input value to sanitize
     * @returns {string} - The sanitized value
     */
    function sanitizeFileExtensionInput(value) {
        value = value.replace(/[^a-zA-Z,.\s]/g, ""); // we only allow a-z, A-Z, comma, dot, space
        value = value.replace(/\.{2,}/g, "."); // don't allow 2 consecutive dots
        value = value.replace(/(\.)\1+/g, "$1"); // prevent two dots next to each other
        return value;
    }

    /**
     * handles file extension input event with validation
     *
     * @param {jQuery} $input - The input element
     */
    function handleFileExtensionInput($input) {
        let value = $input.val();
        const sanitizedValue = sanitizeFileExtensionInput(value);
        $input.val(sanitizedValue);

        // determine which save button to toggle based on input field
        if ($input.attr("id") === "edit-file-extn-box") {
            toggleEditSaveButtonDisability();
        } else {
            toggleSaveButtonDisability();
        }
    }

    /**
     * Handles file extension keypress event validation
     *
     * @param {Event} e - The keypress event
     * @param {HTMLElement} input - The input element
     * @returns {boolean} - Whether to allow the keypress
     */
    function handleFileExtensionKeypress(e, input) {
        const char = String.fromCharCode(e.which);
        const allowed = /^[a-zA-Z,.\s]$/;

        // prevent two consecutive dots
        if (char === "." && input.value.slice(-1) === ".") {
            e.preventDefault();
            return false;
        }

        if (!allowed.test(char)) {
            e.preventDefault();
            return false;
        }

        return true;
    }

    /**
     * Handles file extension paste event with validation
     *
     * @param {Event} e - The paste event
     * @param {jQuery} $input - The input element
     */
    function handleFileExtensionPaste(e, $input) {
        e.preventDefault();

        const clipboardData = (e.originalEvent || e).clipboardData.getData("text");
        let sanitized = sanitizeFileExtensionInput(clipboardData);

        // insert sanitized value at current cursor position
        const input = $input[0];
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const currentValue = input.value;

        input.value = currentValue.substring(0, start) + sanitized + currentValue.substring(end);

        // move the cursor to the end of the inserted text
        const newPos = start + sanitized.length;
        input.setSelectionRange(newPos, newPos);

        // determine which save button to toggle based on input field
        if ($input.attr("id") === "edit-file-extn-box") {
            toggleEditSaveButtonDisability();
        } else {
            toggleSaveButtonDisability();
        }
    }

    /**
     * this function is responsible to handle tab key press in textarea to insert tab character instead of moving focus
     *
     * @param {Event} e - The keydown event
     * @param {HTMLElement} textarea - The textarea element
     */
    function handleTextareaTabKey(e, textarea) {
        // check if the key that is pressed is a tab key
        if (e.keyCode === 9 || e.which === 9) {
            e.preventDefault(); // to prevent focus change

            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const value = textarea.value;

            // to insert the tab character
            textarea.value = value.substring(0, start) + "\t" + value.substring(end);
            textarea.selectionStart = textarea.selectionEnd = start + 1;
            $(textarea).trigger("input");
        }
    }

    function validateAbbrInput(e, abbrBox) {
        // Allow keyboard shortcuts and navigation keys
        if (e.ctrlKey || e.metaKey || e.altKey) {
            return;
        }

        // Allow navigation and function keys
        if (ALLOWED_NAVIGATION_KEYS.includes(e.key)) {
            return;
        }

        // Prevent space character
        if (e.key === " ") {
            e.preventDefault();

            // Determine if this is the edit form or new form
            const isEditForm = abbrBox.id === "edit-abbr-box";
            const inputId = isEditForm ? "edit-abbr-box" : "abbr-box";
            const wrapperId = isEditForm ? "edit-abbr-box-wrapper" : "abbr-box-wrapper";
            const errorId = isEditForm ? "edit-abbreviation-space-error" : "abbreviation-space-error";

            UIHelper.showError(inputId, wrapperId, Strings.CUSTOM_SNIPPETS_SPACE_ERROR, errorId);
            return;
        }

        // Check for character limit (30 characters) - only for printable characters
        if (
            abbrBox.value.length >= 30 &&
            e.key.length === 1 &&
            e.key.match(/[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/)
        ) {
            e.preventDefault();

            // Determine if this is the edit form or new form
            const isEditForm = abbrBox.id === "edit-abbr-box";
            const inputId = isEditForm ? "edit-abbr-box" : "abbr-box";
            const wrapperId = isEditForm ? "edit-abbr-box-wrapper" : "abbr-box-wrapper";
            const errorId = isEditForm ? "edit-abbreviation-length-error" : "abbreviation-length-error";

            UIHelper.showError(inputId, wrapperId, Strings.CUSTOM_SNIPPETS_ABBR_LENGTH_ERROR, errorId);
        }
    }

    function validateDescInput(e, descBox) {
        // Allow keyboard shortcuts and navigation keys
        if (e.ctrlKey || e.metaKey || e.altKey) {
            return;
        }

        // Allow navigation and function keys
        if (ALLOWED_NAVIGATION_KEYS.includes(e.key)) {
            return;
        }

        // Check for character limit (80 characters) - only for printable characters (spaces allowed)
        if (
            descBox.value.length >= 80 &&
            e.key.length === 1 &&
            e.key.match(/[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?\ ]/)
        ) {
            e.preventDefault();

            // Determine if this is the edit form or new form
            const isEditForm = descBox.id === "edit-desc-box";
            const inputId = isEditForm ? "edit-desc-box" : "desc-box";
            const wrapperId = isEditForm ? "edit-desc-box-wrapper" : "desc-box-wrapper";
            const errorId = isEditForm ? "edit-description-length-error" : "description-length-error";

            UIHelper.showError(inputId, wrapperId, Strings.CUSTOM_SNIPPETS_DESC_LENGTH_ERROR, errorId);
        }
    }

    /**
     * Handles abbreviation paste event with validation
     * @param {Event} e - The paste event
     * @param {jQuery} $input - The input element
     */
    function handleAbbrPaste(e, $input) {
        e.preventDefault();

        const clipboardData = (e.originalEvent || e).clipboardData.getData("text");

        // Remove spaces and limit to 30 characters
        let sanitized = clipboardData.replace(/\s/g, ""); // Remove all spaces
        let wasTruncated = false;
        let hadSpaces = clipboardData !== sanitized;

        if (sanitized.length > 30) {
            sanitized = sanitized.substring(0, 30);
            wasTruncated = true;
        }

        // Insert sanitized value at current cursor position
        const input = $input[0];
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const currentValue = input.value;

        // Check if the final result would exceed 30 characters
        const beforeCursor = currentValue.substring(0, start);
        const afterCursor = currentValue.substring(end);
        const finalValue = beforeCursor + sanitized + afterCursor;

        if (finalValue.length > 30) {
            // Trim the sanitized content to fit within the limit
            const availableSpace = 30 - (beforeCursor.length + afterCursor.length);
            if (availableSpace > 0) {
                sanitized = sanitized.substring(0, availableSpace);
                wasTruncated = true;
            } else {
                sanitized = ""; // No space available
                wasTruncated = true;
            }
        }

        // Insert the final sanitized value
        input.value = beforeCursor + sanitized + afterCursor;

        // Move the cursor to the end of the inserted text
        const newPos = start + sanitized.length;
        input.setSelectionRange(newPos, newPos);

        // Show appropriate error message
        if (wasTruncated || hadSpaces) {
            const isEditForm = $input.attr("id") === "edit-abbr-box";
            const inputId = isEditForm ? "edit-abbr-box" : "abbr-box";
            const wrapperId = isEditForm ? "edit-abbr-box-wrapper" : "abbr-box-wrapper";

            // Prioritize length error over space error if both occurred
            if (wasTruncated) {
                const errorId = isEditForm ? "edit-abbreviation-paste-length-error" : "abbreviation-paste-length-error";
                UIHelper.showError(inputId, wrapperId, Strings.CUSTOM_SNIPPETS_ABBR_LENGTH_ERROR, errorId);
            } else if (hadSpaces) {
                const errorId = isEditForm ? "edit-abbreviation-paste-space-error" : "abbreviation-paste-space-error";
                UIHelper.showError(inputId, wrapperId, Strings.CUSTOM_SNIPPETS_SPACE_ERROR, errorId);
            }
        }

        // Determine which save button to toggle based on input field
        if ($input.attr("id") === "edit-abbr-box") {
            toggleEditSaveButtonDisability();
        } else {
            toggleSaveButtonDisability();
        }
    }

    /**
     * Handles description paste event with validation
     * @param {Event} e - The paste event
     * @param {jQuery} $input - The input element
     */
    function handleDescPaste(e, $input) {
        e.preventDefault();

        const clipboardData = (e.originalEvent || e).clipboardData.getData("text");

        // Keep spaces but limit to 80 characters
        let sanitized = clipboardData;
        let wasTruncated = false;

        if (sanitized.length > 80) {
            sanitized = sanitized.substring(0, 80);
            wasTruncated = true;
        }

        // Insert sanitized value at current cursor position
        const input = $input[0];
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const currentValue = input.value;

        // Check if the final result would exceed 80 characters
        const beforeCursor = currentValue.substring(0, start);
        const afterCursor = currentValue.substring(end);
        const finalValue = beforeCursor + sanitized + afterCursor;

        if (finalValue.length > 80) {
            // Trim the sanitized content to fit within the limit
            const availableSpace = 80 - (beforeCursor.length + afterCursor.length);
            if (availableSpace > 0) {
                sanitized = sanitized.substring(0, availableSpace);
                wasTruncated = true;
            } else {
                sanitized = ""; // No space available
                wasTruncated = true;
            }
        }

        // Insert the final sanitized value
        input.value = beforeCursor + sanitized + afterCursor;

        // Move the cursor to the end of the inserted text
        const newPos = start + sanitized.length;
        input.setSelectionRange(newPos, newPos);

        // Show error message if content was truncated
        if (wasTruncated) {
            const isEditForm = $input.attr("id") === "edit-desc-box";
            const inputId = isEditForm ? "edit-desc-box" : "desc-box";
            const wrapperId = isEditForm ? "edit-desc-box-wrapper" : "desc-box-wrapper";
            const errorId = isEditForm ? "edit-description-paste-length-error" : "description-paste-length-error";

            UIHelper.showError(inputId, wrapperId, Strings.CUSTOM_SNIPPETS_DESC_LENGTH_ERROR, errorId);
        }

        // Determine which save button to toggle based on input field
        if ($input.attr("id") === "edit-desc-box") {
            toggleEditSaveButtonDisability();
        } else {
            toggleSaveButtonDisability();
        }
    }

    /**
     * Categorize file extension for metrics tracking
     * @param {string} fileExtension - The file extension from snippet
     * @returns {string} - "all" if snippet is enabled for all files, otherwise "file"
     */
    function categorizeFileExtensionForMetrics(fileExtension) {
        if (!fileExtension || fileExtension === "all") {
            return "all";
        }

        // if not enabled for "all", we just return "file"
        return "file";
    }

    exports.toggleSaveButtonDisability = toggleSaveButtonDisability;
    exports.createHintItem = createHintItem;
    exports.clearAllInputFields = clearAllInputFields;
    exports.getSnippetData = getSnippetData;
    exports.getCurrentLanguageContext = getCurrentLanguageContext;
    exports.getCurrentFileExtension = getCurrentFileExtension;
    exports.mapLanguageToExtension = mapLanguageToExtension;
    exports.rebuildOptimizedStructures = rebuildOptimizedStructures;
    exports.isSnippetSupportedInLanguageContext = isSnippetSupportedInLanguageContext;
    exports.isSnippetSupportedInFile = isSnippetSupportedInFile;
    exports.hasExactMatchingSnippet = hasExactMatchingSnippet;
    exports.getMatchingSnippets = getMatchingSnippets;
    exports.sanitizeFileExtensionInput = sanitizeFileExtensionInput;
    exports.handleFileExtensionInput = handleFileExtensionInput;
    exports.handleFileExtensionKeypress = handleFileExtensionKeypress;
    exports.handleFileExtensionPaste = handleFileExtensionPaste;
    exports.populateEditForm = populateEditForm;
    exports.getEditSnippetData = getEditSnippetData;
    exports.toggleEditSaveButtonDisability = toggleEditSaveButtonDisability;
    exports.categorizeFileExtensionForMetrics = categorizeFileExtensionForMetrics;
    exports.clearEditInputFields = clearEditInputFields;
    exports.handleTextareaTabKey = handleTextareaTabKey;
    exports.validateAbbrInput = validateAbbrInput;
    exports.validateDescInput = validateDescInput;
    exports.handleAbbrPaste = handleAbbrPaste;
    exports.handleDescPaste = handleDescPaste;
});
