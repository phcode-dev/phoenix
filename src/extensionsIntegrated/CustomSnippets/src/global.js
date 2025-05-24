define(function (require, exports, module) {
    /**
     * This is an array of objects. this will store the list of all the snippets
     * it is an array of objects stored in the format
     * [{
     * abbreviation: 'clg',
     * description: 'console log shortcut',
     * templateText: 'console.log()',
     * fileExtension: '.js, .css'
     * }]
     */
    const SnippetHintsList = [];

    exports.SnippetHintsList = SnippetHintsList;
});
