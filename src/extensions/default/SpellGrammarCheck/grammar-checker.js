define(function (require, exports, module) {
    const CodeInspection = brackets.getModule("language/CodeInspection");

    const GRAMMAR_CHECKER_NAME = "GrammarChecker";
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

    const GRAMMAR_ERRORS = [
        { pattern: /\bthere\s+house\b/gi, suggestion: "their house", message: "Did you mean 'their house'?" },
        { pattern: /\bits\s+self\b/gi, suggestion: "itself", message: "Did you mean 'itself'?" },
        { pattern: /\byour\s+welcome\b/gi, suggestion: "you're welcome", message: "Did you mean 'you're welcome'?" },
        { pattern: /\bto\s+many\b/gi, suggestion: "too many", message: "Did you mean 'too many'?" },
        { pattern: /\bwould\s+of\b/gi, suggestion: "would have", message: "Did you mean 'would have'?" },
        { pattern: /\bcould\s+of\b/gi, suggestion: "could have", message: "Did you mean 'could have'?" },
        { pattern: /\bshould\s+of\b/gi, suggestion: "should have", message: "Did you mean 'should have'?" },
        { pattern: /\balot\b/gi, suggestion: "a lot", message: "Did you mean 'a lot'?" }
    ];

    /**
     * Check for grammar errors in the text
     *
     * @param {string} text - the text to check
     * @param {number} lineNumber - the line number (0-based)
     * @returns {Array} Array of spell error objects
     */
    function checkGrammar(text, lineNumber) {
        const errors = [];

        GRAMMAR_ERRORS.forEach(function (rule) {
            let match;
            while ((match = rule.pattern.exec(text)) !== null) {
                errors.push({
                    pos: { line: lineNumber, ch: match.index },
                    endPos: { line: lineNumber, ch: match.index + match[0].length },
                    message: rule.message,
                    type: CodeInspection.Type.META // META type for blue underline
                });
            }
        });

        return errors;
    }

    /**
     * This function is responsible to run grammar check on the given text
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
            const grammarErrors = checkGrammar(line, lineIndex);
            allErrors.push(...grammarErrors);
        });

        if (allErrors.length > 0) {
            return { errors: allErrors };
        }

        return null;
    }

    /**
     * Initialize the grammar checker
     * this function is called inside main.js
     */
    function init() {
        CodeInspection.register("text", {
            name: GRAMMAR_CHECKER_NAME,
            scanFile: lintOneFile
        });

        supportedExtensions.forEach(function (languageId) {
            CodeInspection.register(languageId, {
                name: GRAMMAR_CHECKER_NAME,
                scanFile: lintOneFile
            });
        });
    }

    exports.init = init;
});
