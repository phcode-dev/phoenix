define(function (require, exports, module) {
    const StringMatch = require("utils/StringMatch");

    /**
     * This function is responsible to get the snippet data from all the required input fields
     * it is called when the save button is clicked
     * @private
     * @returns {object} - a snippet object
     */
    function getSnippetData() {
        // get the values from all the input fields
        const abbreviation = $("#abbr-box").val().trim();
        const description = $("#desc-box").val().trim() || "No Description";
        const templateText = $("#template-text-box").val().trim();
        const fileExtension = $("#file-extn-box").val().trim() || "all";

        return {
            abbreviation: abbreviation,
            description: description,
            templateText: templateText,
            fileExtension: fileExtension
        };
    }

    /**
     * This function is responsible to enable/disable the save button
     * when all the required input fields are not filled up as required then we need to disable the save button
     * otherwise we enable it
     * this is called inside the '_registerHandlers' function in the main.js file
     */
    function toggleSaveButtonDisability() {
        // these are the required fields
        const $abbrInput = $("#abbr-box");
        const $templateInput = $("#template-text-box");

        const $saveBtn = $("#save-custom-snippet-btn").find("button");

        // make sure that the required fields has some value
        const hasAbbr = $abbrInput.val().trim().length > 0;
        const hasTemplate = $templateInput.val().trim().length > 0;
        $saveBtn.prop("disabled", !(hasAbbr && hasTemplate));
    }

    /**
     * this function is responsible to create a hint item
     * this is needed because along with the abbr in the code hint, we also want to show an icon saying 'Snippet',
     * to give users an idea that this hint is coming from snippets
     * this function is called inside the 'getHints' method in the codeHints.js file
     * @param   {String} abbr - the abbreviation text that is to be displayed in the code hint
     * @param   {String} query - the query string typed by the user for highlighting matching characters
     * @returns {JQuery} - the jquery item that has the abbr text and the Snippet icon
     */
    function createHintItem(abbr, query) {
        var $hint = $("<span>")
            .addClass("brackets-css-hints brackets-hints")
            .attr("data-val", abbr)
            .attr("data-isCustomSnippet", true);

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

        // style in brackets_patterns_override.less file
        // using the same style as the emmet one
        let $icon = $(`<a href="#" class="custom-snippet-code-hint" style="text-decoration: none">Snippet</a>`);
        $hint.append($icon);

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

    exports.toggleSaveButtonDisability = toggleSaveButtonDisability;
    exports.createHintItem = createHintItem;
    exports.clearAllInputFields = clearAllInputFields;
    exports.getSnippetData = getSnippetData;
});
