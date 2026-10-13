/* GNU AGPL-3.0 License; Copyright (c) 2026 core.ai. */
define(function (require, exports, module) {
    /** Validate one-based inclusive context bounds, never claiming exact selection coordinates. */
    function validRange(range, maximum) {
        return range && Number.isInteger(range.startLine) && Number.isInteger(range.endLine) &&
            range.startLine > 0 && range.endLine >= range.startLine && range.endLine <= maximum;
    }

    /**
     * Validate preview context against the editor buffer and derive its trusted file path.
     * @param {Document} doc Current Markdown document.
     * @param {Object} data Bounded selection metadata from the trusted viewer.
     * @return {Object|null} File attachment, or null if its context no longer matches.
     */
    function capture(doc, data) {
        const lines = doc.getText().split("\n");
        if (!data || !validRange(data.context, lines.length) || !validRange(data.rendered, 10000000) ||
                typeof data.selectionId !== "string" || data.selectionId.length > 100 || !data.selectionId ||
                !Array.isArray(data.preview) || data.preview.length > 3 ||
                data.preview.some(line => typeof line !== "string" || line.length > 200) ||
                !Array.isArray(data.excerpt) || data.excerpt.length > 4 ||
                data.excerpt.some(line => !Number.isInteger(line.line) || typeof line.text !== "string" ||
                    line.text.length > 205)) {
            return null;
        }
        const source = lines.slice(data.context.startLine - 1, data.context.endLine).join("\n");
        if (data.head !== source.slice(0, 100) || data.tail !== source.slice(-100)) { return null; }
        return {fullPath: doc.file.fullPath, name: doc.file.fullPath.split(/[/\\]/).pop(),
            markdownSelection: {selectionId: data.selectionId, context: data.context, rendered: data.rendered,
                preview: data.preview.slice(), excerpt: data.excerpt, head: data.head, tail: data.tail}};
    }

    /**
     * Resolve enclosing source lines only while their bounded anchors still match.
     * @param {string} source Current Markdown source.
     * @param {Object} selection Saved attachment metadata.
     * @return {Object|null} One-based context coordinates and snapshot ID, or null if stale.
     */
    function resolve(source, selection) {
        const lines = source.split("\n");
        if (!selection || !validRange(selection.context, lines.length)) { return null; }
        const {startLine, endLine} = selection.context;
        const context = lines.slice(startLine - 1, endLine).join("\n");
        if (context.slice(0, 100) !== selection.head || context.slice(-100) !== selection.tail) { return null; }
        return {start: {line: startLine, column: 1}, end: {line: endLine, column: lines[endLine - 1].length + 1},
            selectionId: selection.selectionId};
    }

    exports.capture = capture;
    exports.resolve = resolve;
});
