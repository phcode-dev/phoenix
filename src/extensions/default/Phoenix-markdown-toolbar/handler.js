/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, brackets */

define(function (require, exports, module) {


    var EditorManager   = brackets.getModule("editor/EditorManager");

    var Lines = require("lines"),
        Paragraphs = require("paragraphs"),
        Selections = require("selections"),
        Dialogs = require("dialogs");

    /**
     * Regular expressions do most of the heavy lifting, here
     * and everywhere.
     *
     * Note that the heading items allow for the possibility
     * that the heading is preceded by a bullet. This seems
     * odd but it also works, at least in Markdown Preview,
     * and it is a plausible edge case.
     *
     * Numbering in front of a heading just displays a bullet,
     * so it didn't seem worth preserving.
     *
     * Also note that there is a limit on white space before
     * a heading, as four lines equals raw monospace text.
     * But there isn't a similar limitation on bullets, because
     * it would interfere with bullets at level 3+.
     */
    var MATCH_H1 = /^(\s{0,3}|\s*\*\s*)(#\s)/;
    var MATCH_H2 = /^(\s{0,3}|\s*\*\s*)(##\s)/;
    var MATCH_H3 = /^(\s{0,3}|\s*\*\s*)(###\s)/;
    var MATCH_H4 = /^(\s{0,3}|\s*\*\s*)(####\s)/;
    var MATCH_H5 = /^(\s{0,3}|\s*\*\s*)(#####\s)/;
    var MATCH_H6 = /^(\s{0,3}|\s*\*\s*)(######\s)/;
    var MATCH_HD = /^(\s{0,3}|\s*\*\s*)(#+\s)/;
    var MATCH_BULLET = /^\s*\*\s/;
    var MATCH_NUMBERED = /^\s*\d\.\s/;
    var MATCH_QUOTE = /^\s*>\s/;
    var MATCH_LIST = /^\s*(\*|>|\d\.)\s/;

    /**
     *  Check initial conditions for any buttons. Make sure
     *  we have an editor, are in a Markdown document, and
     *  have a cursor.
     */
    function check(editor) {
        if (!editor) {
            return false;
        }

        var mode = editor._getModeFromDocument();
        if (mode !== "gfm" && mode !== "markdown") {
            return false;
        }

        var cursor = editor.getCursorPos(false, "to");
        if (!cursor.line) {
            return false;
        }

        return true;
    }

    /**
     * Generic function to handle line-based tasks (headings and
     * lists). For simple cases, this is a toggle. However, if
     * multiple lines are selected, and the toggle is on for only
     * some lines, it is turned on for all lines where it is off.
     *
     * This seems like the most intuitive behavior as it allows
     * things like selecting across a bunch of lines, some already
     * bulleted, and making them all bulleted. Even in that case,
     * one extra click will then remove all the bullets.
     */
    function handleLineButton(regexp, replace, after, insert) {
        var editor = EditorManager.getActiveEditor();
        if (!check(editor)) {
            return;
        }

        if (!Lines.allLinesOn(editor, regexp)) {
            Lines.turnLinesOn(editor, regexp, replace, after, insert);
        } else {
            Lines.turnLinesOff(editor, regexp, after);
        }
    }

    /**
     * Generic function to handle selection-based tasks (bold,
     * italic, strikethrough). Behaves similarly to line behavior
     * above.
     */
    function handleSelectionButton(match, badMatch) {
        var editor = EditorManager.getActiveEditor();
        if (!check(editor)) {
            return;
        }
        if (!Selections.allSelectionsOn(editor, match, badMatch)) {
            Selections.turnSelectionsOn(editor, match, badMatch);
        } else {
            Selections.turnSelectionsOff(editor, match, badMatch);
        }
    }

    // Define the exports; these are the functions that get wired
    // into toolbar buttons when the toolbar is created.

    exports.h1 = function () {
        handleLineButton(MATCH_H1, MATCH_HD, MATCH_BULLET, "# ");
    };

    exports.h2 = function () {
        handleLineButton(MATCH_H2, MATCH_HD, MATCH_BULLET, "## ");
    };

    exports.h3 = function () {
        handleLineButton(MATCH_H3, MATCH_HD, MATCH_BULLET, "### ");
    };

    exports.h4 = function () {
        handleLineButton(MATCH_H4, MATCH_HD, MATCH_BULLET, "#### ");
    };

    exports.h5 = function () {
        handleLineButton(MATCH_H5, MATCH_HD, MATCH_BULLET, "##### ");
    };

    exports.h6 = function () {
        handleLineButton(MATCH_H6, MATCH_HD, MATCH_BULLET, "###### ");
    };

    exports.bold = function () {
        handleSelectionButton("**", "");
    };

    exports.italic = function () {
        handleSelectionButton("*", "**");
    };

    exports.strikethrough = function () {
        handleSelectionButton("~~", "");
    };

    exports.code = function () {
        handleSelectionButton("`", "");
    };
  
    exports.image = function () {
        var editor = EditorManager.getActiveEditor();
        if (!check(editor)) {
            return;
        }
        Dialogs.image(editor);
    };
    
    exports.link = function () {
        var editor = EditorManager.getActiveEditor();
        if (!check(editor)) {
            return;
        }
        Dialogs.link(editor);
    };

    exports.bullet = function () {
        handleLineButton(MATCH_BULLET, MATCH_LIST, null, "* ");
    };

    exports.numbered = function () {
        handleLineButton(MATCH_NUMBERED, MATCH_LIST, null, "1. ");
    };

    exports.quote = function () {
        handleLineButton(MATCH_QUOTE, MATCH_LIST, null, "> ");
    };
    
    exports.codeblock = function () {
        var editor = EditorManager.getActiveEditor();
        if (!check(editor)) {
            return;
        }
        Paragraphs.codeblock(editor);
    };

    exports.paragraph = function () {
        var editor = EditorManager.getActiveEditor();
        if (!check(editor)) {
            return;
        }
        Paragraphs.paragraph(editor);
    };
    
    exports.reflow = function () {
        var editor = EditorManager.getActiveEditor();
        if (!check(editor)) {
            return;
        }
        Paragraphs.reflow(editor);
    };
});
