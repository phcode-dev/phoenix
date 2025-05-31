define(function (require, exports, module) {
    const CodeInspection = brackets.getModule("language/CodeInspection");

    const SPELL_CHECKER_NAME = "SpellChecker";
    const supportedExtensions = [
        "txt",
        "md",
        "markdown",
        "html",
        "htm",
        "js",
        "ts",
        "jsx",
        "tsx",
        "css",
        "less",
        "scss"
    ];

    const MISSPELLED_WORDS = ["teh", "adn", "wich", "thier"];

    /**
     * This function is responsible for giving spelling suggestions for a misspelled word
     *
     * @param {string} word - The misspelled word
     * @returns {Array} Array of suggestions
     */
    function getSuggestions(word) {
        const suggestions = {
            teh: ["the"],
            adn: ["and"],
            wich: ["which"],
            thier: ["their"]
        };

        return suggestions[word] || [word];
    }

    /**
     * Check for spelling errors in the text
     *
     * @param {string} text - the text to check
     * @param {number} lineNumber - the line number (0-based)
     * @returns {Array} Array of spell error objects
     */
    function checkSpelling(text, lineNumber) {
        const errors = [];
        const words = text.split(/\s+/);
        let currentPos = 0;

        words.forEach(function (word) {
            // remove punctuation for checking
            const cleanWord = word.replace(/[^\w]/g, "").toLowerCase();

            if (cleanWord && MISSPELLED_WORDS.includes(cleanWord)) {
                const wordStart = text.indexOf(word, currentPos);
                const wordEnd = wordStart + word.length;

                errors.push({
                    pos: { line: lineNumber, ch: wordStart },
                    endPos: { line: lineNumber, ch: wordEnd },
                    message: `
                    "${word}" may be misspelled. Did you mean one of: ${getSuggestions(cleanWord).join(", ")}?
                    `,
                    type: CodeInspection.Type.SPELL
                });
            }
            currentPos = text.indexOf(word, currentPos) + word.length;
        });

        return errors;
    }

    /**
     * This function is responsible to run spell check on the given text
     * TODO: right now we just check the whole file. later need to make it efficient
     *
     * @param {string} text - The text content to check
     * @param {string} fullPath - The full path to the file
     * @returns {Object} Results object with errors array
     */
    function lintOneFile(text, fullPath) {
        const fileExtension = fullPath.split(".").pop().toLowerCase();

        if (!supportedExtensions.includes(fileExtension)) {
            return null;
        }

        const lines = text.split("\n");
        const allErrors = [];

        lines.forEach(function (line, lineIndex) {
            const spellErrors = checkSpelling(line, lineIndex);
            allErrors.push(...spellErrors);
        });

        if (allErrors.length > 0) {
            return { errors: allErrors };
        }

        return null;
    }

    /**
     * Initialize the spell checker
     * this function is called inside main.js
     */
    function init() {
        CodeInspection.register("text", {
            name: SPELL_CHECKER_NAME,
            scanFile: lintOneFile
        });

        supportedExtensions.forEach(function (languageId) {
            CodeInspection.register(languageId, {
                name: SPELL_CHECKER_NAME,
                scanFile: lintOneFile
            });
        });
    }

    exports.init = init;
});
