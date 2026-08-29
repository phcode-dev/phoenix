/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2026 - present core.ai . All rights reserved.
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

// This file is bundled into one named AMD module for Phoenix's RequireJS
// runtime. Keeping all CodeMirror 6 imports behind this boundary guarantees
// that the browser receives exactly one copy of @codemirror/state.

export { initVim } from "@replit/codemirror-vim-core";

export {
    Annotation,
    Compartment,
    EditorSelection,
    EditorState,
    RangeSet,
    StateEffect,
    StateField,
    Transaction,
    countColumn
} from "@codemirror/state";

export {
    Decoration,
    EditorView,
    GutterMarker,
    ViewPlugin,
    WidgetType,
    crosshairCursor,
    drawSelection,
    dropCursor,
    gutter,
    gutterLineClass,
    gutters,
    highlightActiveLine,
    highlightActiveLineGutter,
    highlightSpecialChars,
    keymap,
    lineNumberMarkers,
    lineNumbers,
    placeholder,
    rectangularSelection,
    scrollPastEnd
} from "@codemirror/view";

export {
    autocompletion,
    closeBrackets,
    closeBracketsKeymap,
    completionKeymap,
    deleteBracketPair,
    insertBracket
} from "@codemirror/autocomplete";

export {
    cursorCharLeft,
    cursorCharRight,
    cursorDocEnd,
    cursorDocStart,
    cursorGroupLeft,
    cursorGroupRight,
    cursorLineDown,
    cursorLineEnd,
    cursorLineStart,
    cursorLineUp,
    cursorPageDown,
    cursorPageUp,
    defaultKeymap,
    deleteCharBackward,
    deleteCharForward,
    deleteGroupBackward,
    deleteGroupForward,
    deleteLine,
    deleteLineBoundaryBackward,
    deleteLineBoundaryForward,
    deleteToLineEnd,
    history,
    historyKeymap,
    indentLess,
    indentMore,
    indentSelection,
    indentWithTab,
    insertNewlineAndIndent,
    insertTab,
    redo,
    redoSelection,
    selectAll,
    selectCharLeft,
    selectCharRight,
    selectDocEnd,
    selectDocStart,
    selectGroupLeft,
    selectGroupRight,
    selectLineDown,
    selectLineEnd,
    selectLineStart,
    selectLineUp,
    selectPageDown,
    selectPageUp,
    simplifySelection,
    splitLine,
    toggleComment,
    transposeChars,
    undo,
    undoSelection
} from "@codemirror/commands";

export {
    HighlightStyle,
    StreamLanguage,
    StringStream,
    bracketMatching,
    defaultHighlightStyle,
    foldAll,
    foldCode,
    foldEffect,
    foldGutter,
    foldKeymap,
    foldState,
    foldable,
    foldedRanges,
    indentOnInput,
    indentUnit,
    syntaxHighlighting,
    syntaxTree,
    unfoldAll,
    unfoldCode,
    unfoldEffect
} from "@codemirror/language";

export {
    lintGutter,
    lintKeymap,
    linter,
    setDiagnostics
} from "@codemirror/lint";

export {
    highlightSelectionMatches,
    searchKeymap
} from "@codemirror/search";
export { tags } from "@lezer/highlight";
export {
    legacyModeMIMEs,
    legacyModeModules,
    legacyModeParsers
} from "./codemirror6-legacy-modes.js";

export { css } from "@codemirror/lang-css";
export { html } from "@codemirror/lang-html";
export { javascript } from "@codemirror/lang-javascript";
export { json } from "@codemirror/lang-json";
export {
    markdown,
    markdownLanguage
} from "@codemirror/lang-markdown";
export { php } from "@codemirror/lang-php";
export { xml } from "@codemirror/lang-xml";

export {
    c,
    clike as makeLegacyCLike,
    cpp,
    csharp,
    dart,
    java,
    kotlin,
    objectiveC,
    scala
} from "@codemirror/legacy-modes/mode/clike";
export { clojure } from "@codemirror/legacy-modes/mode/clojure";
export { coffeeScript } from "@codemirror/legacy-modes/mode/coffeescript";
export { diff } from "@codemirror/legacy-modes/mode/diff";
export { go } from "@codemirror/legacy-modes/mode/go";
export { groovy } from "@codemirror/legacy-modes/mode/groovy";
export { haskell } from "@codemirror/legacy-modes/mode/haskell";
export { haxe } from "@codemirror/legacy-modes/mode/haxe";
export { lua } from "@codemirror/legacy-modes/mode/lua";
export { perl } from "@codemirror/legacy-modes/mode/perl";
export { pascal } from "@codemirror/legacy-modes/mode/pascal";
export { properties } from "@codemirror/legacy-modes/mode/properties";
export { pug } from "@codemirror/legacy-modes/mode/pug";
export { python } from "@codemirror/legacy-modes/mode/python";
export { ruby } from "@codemirror/legacy-modes/mode/ruby";
export { rust } from "@codemirror/legacy-modes/mode/rust";
export { sass } from "@codemirror/legacy-modes/mode/sass";
export { scheme } from "@codemirror/legacy-modes/mode/scheme";
export { shell } from "@codemirror/legacy-modes/mode/shell";
export { mySQL, standardSQL } from "@codemirror/legacy-modes/mode/sql";
export { stex } from "@codemirror/legacy-modes/mode/stex";
export { stylus } from "@codemirror/legacy-modes/mode/stylus";
export { swift } from "@codemirror/legacy-modes/mode/swift";
export { toml } from "@codemirror/legacy-modes/mode/toml";
export { turtle } from "@codemirror/legacy-modes/mode/turtle";
export { vb } from "@codemirror/legacy-modes/mode/vb";
export { vbScript } from "@codemirror/legacy-modes/mode/vbscript";
export { yaml } from "@codemirror/legacy-modes/mode/yaml";
export { erlang } from "@codemirror/legacy-modes/mode/erlang";

// Stream parsers used by Phoenix's legacy editor compatibility facade. These
// aliases avoid collisions with the native CM6 language-support factories
// exported above.
export {
    css as legacyCSS,
    less as legacyLess,
    mkCSS as makeLegacyCSS,
    sCSS as legacySCSS
} from "@codemirror/legacy-modes/mode/css";
export {
    javascript as legacyJavaScript,
    json as legacyJSON,
    jsonld as legacyJSONLD,
    typescript as legacyTypeScript
} from "@codemirror/legacy-modes/mode/javascript";
export {
    html as legacyHTML,
    mkXML as makeLegacyXML,
    xml as legacyXML
} from "@codemirror/legacy-modes/mode/xml";
