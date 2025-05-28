define(function (require, exports, module) {
    const StringMatch = require("utils/StringMatch");
    const Global = require("./global");

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

        return {
            abbreviation: abbreviation,
            description: description || "", // allow empty description
            templateText: templateText,
            fileExtension: fileExtension || "all" // default to "all" if empty
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

        const $saveBtn = $("#save-custom-snippet-btn").find("button");

        // make sure that the required fields has some value
        const hasAbbr = $abbrInput.val().trim().length > 0;
        const hasTemplate = $templateInput.val().trim().length > 0;
        $saveBtn.prop("disabled", !(hasAbbr && hasTemplate));
    }

    /**
     * Gets the current file extension from the editor
     * @param {Editor} editor - The editor instance
     * @returns {string|null} - The file extension or null if not available
     */
    function getCurrentFileExtension(editor) {
        const filePath = editor.document?.file?.fullPath;
        if (filePath) {
            return filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
        }
        return null;
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
     * @param {string|null} fileExtension - The current file extension
     * @returns {boolean} - True if there's an exact match
     */
    function hasExactMatchingSnippet(query, fileExtension) {
        const queryLower = query.toLowerCase();
        return Global.SnippetHintsList.some((snippet) => {
            if (snippet.abbreviation.toLowerCase() === queryLower) {
                return isSnippetSupportedInFile(snippet, fileExtension);
            }
            return false;
        });
    }

    /**
     * Gets all snippets that match the query (prefix matches)
     * @param {string} query - The search query
     * @param {string|null} fileExtension - The current file extension
     * @returns {Array} - Array of matching snippets
     */
    function getMatchingSnippets(query, fileExtension) {
        const queryLower = query.toLowerCase();
        return Global.SnippetHintsList.filter((snippet) => {
            if (snippet.abbreviation.toLowerCase().startsWith(queryLower)) {
                return isSnippetSupportedInFile(snippet, fileExtension);
            }
            return false;
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
            const matchResult = StringMatch.stringMatch(abbr, query, {preferPrefixMatches: true});
            if (matchResult && matchResult.stringRanges) {
                matchResult.stringRanges.forEach(function (item) {
                    if (item.matched) {
                        $hint.append($("<span>")
                            .text(item.text)
                            .addClass("matched-hint"));
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
        let $icon = $(`<a href="#" class="custom-snippet-code-hint" style="text-decoration: none">Snippet</a>`);
        $hint.append($icon);

        if (description && description.trim() !== "") {
            const fullDescription = description.trim();
            // truncate description if longer than 70 characters
            const displayDescription =
                fullDescription.length > 70 ? fullDescription.substring(0, 70) + "..." : fullDescription;

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

        return {
            abbreviation: abbreviation,
            description: description || "", // allow empty description
            templateText: templateText,
            fileExtension: fileExtension || "all" // default to "all" if empty
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
     * Updates the snippets count which is displayed in the toolbar at the left side
     * @private
     */
    function updateSnippetsCount() {
        const count = Global.SnippetHintsList.length;
        const $countSpan = $("#snippets-count");
        if (count > 0) {
            $countSpan.text(`(${count})`);
        } else {
            $countSpan.text("");
        }
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
            $(textarea).trigger('input');
        }
    }

    exports.toggleSaveButtonDisability = toggleSaveButtonDisability;
    exports.createHintItem = createHintItem;
    exports.clearAllInputFields = clearAllInputFields;
    exports.getSnippetData = getSnippetData;
    exports.getCurrentFileExtension = getCurrentFileExtension;
    exports.isSnippetSupportedInFile = isSnippetSupportedInFile;
    exports.hasExactMatchingSnippet = hasExactMatchingSnippet;
    exports.getMatchingSnippets = getMatchingSnippets;
    exports.updateSnippetsCount = updateSnippetsCount;
    exports.sanitizeFileExtensionInput = sanitizeFileExtensionInput;
    exports.handleFileExtensionInput = handleFileExtensionInput;
    exports.handleFileExtensionKeypress = handleFileExtensionKeypress;
    exports.handleFileExtensionPaste = handleFileExtensionPaste;
    exports.populateEditForm = populateEditForm;
    exports.getEditSnippetData = getEditSnippetData;
    exports.toggleEditSaveButtonDisability = toggleEditSaveButtonDisability;
    exports.clearEditInputFields = clearEditInputFields;
    exports.handleTextareaTabKey = handleTextareaTabKey;
});
