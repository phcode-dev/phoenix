/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2026 - present core.ai. All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
 * General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 */

/*! DONT_STRIP_MINIFY: CodeMirror 5-derived mode metadata compatibility.
 * See thirdparty/licences/codemirror5-derived.markdown.
 */

/**
 * Installs the public API and exact metadata shipped by CodeMirror 5.65.16's
 * mode/meta.js module without loading the CodeMirror 5 runtime.
 */
define(function (require, exports, module) {

    function _createModeInfo() {
        return [
            {name: "APL", mime: "text/apl", mode: "apl", ext: ["dyalog", "apl"]},
            {name: "PGP", mimes: ["application/pgp", "application/pgp-encrypted", "application/pgp-keys", "application/pgp-signature"], mode: "asciiarmor", ext: ["asc", "pgp", "sig"]},
            {name: "ASN.1", mime: "text/x-ttcn-asn", mode: "asn.1", ext: ["asn", "asn1"]},
            {name: "Asterisk", mime: "text/x-asterisk", mode: "asterisk", file: /^extensions\.conf$/i},
            {name: "Brainfuck", mime: "text/x-brainfuck", mode: "brainfuck", ext: ["b", "bf"]},
            {name: "C", mime: "text/x-csrc", mode: "clike", ext: ["c", "h", "ino"]},
            {name: "C++", mime: "text/x-c++src", mode: "clike", ext: ["cpp", "c++", "cc", "cxx", "hpp", "h++", "hh", "hxx"], alias: ["cpp"]},
            {name: "Cobol", mime: "text/x-cobol", mode: "cobol", ext: ["cob", "cpy", "cbl"]},
            {name: "C#", mime: "text/x-csharp", mode: "clike", ext: ["cs"], alias: ["csharp", "cs"]},
            {name: "Clojure", mime: "text/x-clojure", mode: "clojure", ext: ["clj", "cljc", "cljx"]},
            {name: "ClojureScript", mime: "text/x-clojurescript", mode: "clojure", ext: ["cljs"]},
            {name: "Closure Stylesheets (GSS)", mime: "text/x-gss", mode: "css", ext: ["gss"]},
            {name: "CMake", mime: "text/x-cmake", mode: "cmake", ext: ["cmake", "cmake.in"], file: /^CMakeLists\.txt$/},
            {name: "CoffeeScript", mimes: ["application/vnd.coffeescript", "text/coffeescript", "text/x-coffeescript"], mode: "coffeescript", ext: ["coffee"], alias: ["coffee", "coffee-script"]},
            {name: "Common Lisp", mime: "text/x-common-lisp", mode: "commonlisp", ext: ["cl", "lisp", "el"], alias: ["lisp"]},
            {name: "Cypher", mime: "application/x-cypher-query", mode: "cypher", ext: ["cyp", "cypher"]},
            {name: "Cython", mime: "text/x-cython", mode: "python", ext: ["pyx", "pxd", "pxi"]},
            {name: "Crystal", mime: "text/x-crystal", mode: "crystal", ext: ["cr"]},
            {name: "CSS", mime: "text/css", mode: "css", ext: ["css"]},
            {name: "CQL", mime: "text/x-cassandra", mode: "sql", ext: ["cql"]},
            {name: "D", mime: "text/x-d", mode: "d", ext: ["d"]},
            {name: "Dart", mimes: ["application/dart", "text/x-dart"], mode: "dart", ext: ["dart"]},
            {name: "diff", mime: "text/x-diff", mode: "diff", ext: ["diff", "patch"]},
            {name: "Django", mime: "text/x-django", mode: "django"},
            {name: "Dockerfile", mime: "text/x-dockerfile", mode: "dockerfile", file: /^Dockerfile$/},
            {name: "DTD", mime: "application/xml-dtd", mode: "dtd", ext: ["dtd"]},
            {name: "Dylan", mime: "text/x-dylan", mode: "dylan", ext: ["dylan", "dyl", "intr"]},
            {name: "EBNF", mime: "text/x-ebnf", mode: "ebnf"},
            {name: "ECL", mime: "text/x-ecl", mode: "ecl", ext: ["ecl"]},
            {name: "edn", mime: "application/edn", mode: "clojure", ext: ["edn"]},
            {name: "Eiffel", mime: "text/x-eiffel", mode: "eiffel", ext: ["e"]},
            {name: "Elm", mime: "text/x-elm", mode: "elm", ext: ["elm"]},
            {name: "Embedded JavaScript", mime: "application/x-ejs", mode: "htmlembedded", ext: ["ejs"]},
            {name: "Embedded Ruby", mime: "application/x-erb", mode: "htmlembedded", ext: ["erb"]},
            {name: "Erlang", mime: "text/x-erlang", mode: "erlang", ext: ["erl"]},
            {name: "Esper", mime: "text/x-esper", mode: "sql"},
            {name: "Factor", mime: "text/x-factor", mode: "factor", ext: ["factor"]},
            {name: "FCL", mime: "text/x-fcl", mode: "fcl"},
            {name: "Forth", mime: "text/x-forth", mode: "forth", ext: ["forth", "fth", "4th"]},
            {name: "Fortran", mime: "text/x-fortran", mode: "fortran", ext: ["f", "for", "f77", "f90", "f95"]},
            {name: "F#", mime: "text/x-fsharp", mode: "mllike", ext: ["fs"], alias: ["fsharp"]},
            {name: "Gas", mime: "text/x-gas", mode: "gas", ext: ["s"]},
            {name: "Gherkin", mime: "text/x-feature", mode: "gherkin", ext: ["feature"]},
            {name: "GitHub Flavored Markdown", mime: "text/x-gfm", mode: "gfm", file: /^(readme|contributing|history)\.md$/i},
            {name: "Go", mime: "text/x-go", mode: "go", ext: ["go"]},
            {name: "Groovy", mime: "text/x-groovy", mode: "groovy", ext: ["groovy", "gradle"], file: /^Jenkinsfile$/},
            {name: "HAML", mime: "text/x-haml", mode: "haml", ext: ["haml"]},
            {name: "Haskell", mime: "text/x-haskell", mode: "haskell", ext: ["hs"]},
            {name: "Haskell (Literate)", mime: "text/x-literate-haskell", mode: "haskell-literate", ext: ["lhs"]},
            {name: "Haxe", mime: "text/x-haxe", mode: "haxe", ext: ["hx"]},
            {name: "HXML", mime: "text/x-hxml", mode: "haxe", ext: ["hxml"]},
            {name: "ASP.NET", mime: "application/x-aspx", mode: "htmlembedded", ext: ["aspx"], alias: ["asp", "aspx"]},
            {name: "HTML", mime: "text/html", mode: "htmlmixed", ext: ["html", "htm", "handlebars", "hbs"], alias: ["xhtml"]},
            {name: "HTTP", mime: "message/http", mode: "http"},
            {name: "IDL", mime: "text/x-idl", mode: "idl", ext: ["pro"]},
            {name: "Pug", mime: "text/x-pug", mode: "pug", ext: ["jade", "pug"], alias: ["jade"]},
            {name: "Java", mime: "text/x-java", mode: "clike", ext: ["java"]},
            {name: "Java Server Pages", mime: "application/x-jsp", mode: "htmlembedded", ext: ["jsp"], alias: ["jsp"]},
            {name: "JavaScript", mimes: ["text/javascript", "text/ecmascript", "application/javascript", "application/x-javascript", "application/ecmascript"], mode: "javascript", ext: ["js"], alias: ["ecmascript", "js", "node"]},
            {name: "JSON", mimes: ["application/json", "application/x-json"], mode: "javascript", ext: ["json", "map"], alias: ["json5"]},
            {name: "JSON-LD", mime: "application/ld+json", mode: "javascript", ext: ["jsonld"], alias: ["jsonld"]},
            {name: "JSX", mime: "text/jsx", mode: "jsx", ext: ["jsx"]},
            {name: "Jinja2", mime: "text/jinja2", mode: "jinja2", ext: ["j2", "jinja", "jinja2"]},
            {name: "Julia", mime: "text/x-julia", mode: "julia", ext: ["jl"], alias: ["jl"]},
            {name: "Kotlin", mime: "text/x-kotlin", mode: "clike", ext: ["kt"]},
            {name: "LESS", mime: "text/x-less", mode: "css", ext: ["less"]},
            {name: "LiveScript", mime: "text/x-livescript", mode: "livescript", ext: ["ls"], alias: ["ls"]},
            {name: "Lua", mime: "text/x-lua", mode: "lua", ext: ["lua"]},
            {name: "Markdown", mime: "text/x-markdown", mode: "markdown", ext: ["markdown", "md", "mkd"]},
            {name: "mIRC", mime: "text/mirc", mode: "mirc"},
            {name: "MariaDB SQL", mime: "text/x-mariadb", mode: "sql"},
            {name: "Mathematica", mime: "text/x-mathematica", mode: "mathematica", ext: ["m", "nb", "wl", "wls"]},
            {name: "Modelica", mime: "text/x-modelica", mode: "modelica", ext: ["mo"]},
            {name: "MUMPS", mime: "text/x-mumps", mode: "mumps", ext: ["mps"]},
            {name: "MS SQL", mime: "text/x-mssql", mode: "sql"},
            {name: "mbox", mime: "application/mbox", mode: "mbox", ext: ["mbox"]},
            {name: "MySQL", mime: "text/x-mysql", mode: "sql"},
            {name: "Nginx", mime: "text/x-nginx-conf", mode: "nginx", file: /nginx.*\.conf$/i},
            {name: "NSIS", mime: "text/x-nsis", mode: "nsis", ext: ["nsh", "nsi"]},
            {name: "NTriples", mimes: ["application/n-triples", "application/n-quads", "text/n-triples"], mode: "ntriples", ext: ["nt", "nq"]},
            {name: "Objective-C", mime: "text/x-objectivec", mode: "clike", ext: ["m"], alias: ["objective-c", "objc"]},
            {name: "Objective-C++", mime: "text/x-objectivec++", mode: "clike", ext: ["mm"], alias: ["objective-c++", "objc++"]},
            {name: "OCaml", mime: "text/x-ocaml", mode: "mllike", ext: ["ml", "mli", "mll", "mly"]},
            {name: "Octave", mime: "text/x-octave", mode: "octave", ext: ["m"]},
            {name: "Oz", mime: "text/x-oz", mode: "oz", ext: ["oz"]},
            {name: "Pascal", mime: "text/x-pascal", mode: "pascal", ext: ["p", "pas"]},
            {name: "PEG.js", mime: "null", mode: "pegjs", ext: ["jsonld"]},
            {name: "Perl", mime: "text/x-perl", mode: "perl", ext: ["pl", "pm"]},
            {name: "PHP", mimes: ["text/x-php", "application/x-httpd-php", "application/x-httpd-php-open"], mode: "php", ext: ["php", "php3", "php4", "php5", "php7", "phtml"]},
            {name: "Pig", mime: "text/x-pig", mode: "pig", ext: ["pig"]},
            {name: "Plain Text", mime: "text/plain", mode: "null", ext: ["txt", "text", "conf", "def", "list", "log"]},
            {name: "PLSQL", mime: "text/x-plsql", mode: "sql", ext: ["pls"]},
            {name: "PostgreSQL", mime: "text/x-pgsql", mode: "sql"},
            {name: "PowerShell", mime: "application/x-powershell", mode: "powershell", ext: ["ps1", "psd1", "psm1"]},
            {name: "Properties files", mime: "text/x-properties", mode: "properties", ext: ["properties", "ini", "in"], alias: ["ini", "properties"]},
            {name: "ProtoBuf", mime: "text/x-protobuf", mode: "protobuf", ext: ["proto"]},
            {name: "Python", mime: "text/x-python", mode: "python", ext: ["BUILD", "bzl", "py", "pyw"], file: /^(BUCK|BUILD)$/},
            {name: "Puppet", mime: "text/x-puppet", mode: "puppet", ext: ["pp"]},
            {name: "Q", mime: "text/x-q", mode: "q", ext: ["q"]},
            {name: "R", mime: "text/x-rsrc", mode: "r", ext: ["r", "R"], alias: ["rscript"]},
            {name: "reStructuredText", mime: "text/x-rst", mode: "rst", ext: ["rst"], alias: ["rst"]},
            {name: "RPM Changes", mime: "text/x-rpm-changes", mode: "rpm"},
            {name: "RPM Spec", mime: "text/x-rpm-spec", mode: "rpm", ext: ["spec"]},
            {name: "Ruby", mime: "text/x-ruby", mode: "ruby", ext: ["rb"], alias: ["jruby", "macruby", "rake", "rb", "rbx"]},
            {name: "Rust", mime: "text/x-rustsrc", mode: "rust", ext: ["rs"]},
            {name: "SAS", mime: "text/x-sas", mode: "sas", ext: ["sas"]},
            {name: "Sass", mime: "text/x-sass", mode: "sass", ext: ["sass"]},
            {name: "Scala", mime: "text/x-scala", mode: "clike", ext: ["scala"]},
            {name: "Scheme", mime: "text/x-scheme", mode: "scheme", ext: ["scm", "ss"]},
            {name: "SCSS", mime: "text/x-scss", mode: "css", ext: ["scss"]},
            {name: "Shell", mimes: ["text/x-sh", "application/x-sh"], mode: "shell", ext: ["sh", "ksh", "bash"], alias: ["bash", "sh", "zsh"], file: /^PKGBUILD$/},
            {name: "Sieve", mime: "application/sieve", mode: "sieve", ext: ["siv", "sieve"]},
            {name: "Slim", mimes: ["text/x-slim", "application/x-slim"], mode: "slim", ext: ["slim"]},
            {name: "Smalltalk", mime: "text/x-stsrc", mode: "smalltalk", ext: ["st"]},
            {name: "Smarty", mime: "text/x-smarty", mode: "smarty", ext: ["tpl"]},
            {name: "Solr", mime: "text/x-solr", mode: "solr"},
            {name: "SML", mime: "text/x-sml", mode: "mllike", ext: ["sml", "sig", "fun", "smackspec"]},
            {name: "Soy", mime: "text/x-soy", mode: "soy", ext: ["soy"], alias: ["closure template"]},
            {name: "SPARQL", mime: "application/sparql-query", mode: "sparql", ext: ["rq", "sparql"], alias: ["sparul"]},
            {name: "Spreadsheet", mime: "text/x-spreadsheet", mode: "spreadsheet", alias: ["excel", "formula"]},
            {name: "SQL", mime: "text/x-sql", mode: "sql", ext: ["sql"]},
            {name: "SQLite", mime: "text/x-sqlite", mode: "sql"},
            {name: "Squirrel", mime: "text/x-squirrel", mode: "clike", ext: ["nut"]},
            {name: "Stylus", mime: "text/x-styl", mode: "stylus", ext: ["styl"]},
            {name: "Swift", mime: "text/x-swift", mode: "swift", ext: ["swift"]},
            {name: "sTeX", mime: "text/x-stex", mode: "stex"},
            {name: "LaTeX", mime: "text/x-latex", mode: "stex", ext: ["text", "ltx", "tex"], alias: ["tex"]},
            {name: "SystemVerilog", mime: "text/x-systemverilog", mode: "verilog", ext: ["v", "sv", "svh"]},
            {name: "Tcl", mime: "text/x-tcl", mode: "tcl", ext: ["tcl"]},
            {name: "Textile", mime: "text/x-textile", mode: "textile", ext: ["textile"]},
            {name: "TiddlyWiki", mime: "text/x-tiddlywiki", mode: "tiddlywiki"},
            {name: "Tiki wiki", mime: "text/tiki", mode: "tiki"},
            {name: "TOML", mime: "text/x-toml", mode: "toml", ext: ["toml"]},
            {name: "Tornado", mime: "text/x-tornado", mode: "tornado"},
            {name: "troff", mime: "text/troff", mode: "troff", ext: ["1", "2", "3", "4", "5", "6", "7", "8", "9"]},
            {name: "TTCN", mime: "text/x-ttcn", mode: "ttcn", ext: ["ttcn", "ttcn3", "ttcnpp"]},
            {name: "TTCN_CFG", mime: "text/x-ttcn-cfg", mode: "ttcn-cfg", ext: ["cfg"]},
            {name: "Turtle", mime: "text/turtle", mode: "turtle", ext: ["ttl"]},
            {name: "TypeScript", mime: "application/typescript", mode: "javascript", ext: ["ts"], alias: ["ts"]},
            {name: "TypeScript-JSX", mime: "text/typescript-jsx", mode: "jsx", ext: ["tsx"], alias: ["tsx"]},
            {name: "Twig", mime: "text/x-twig", mode: "twig"},
            {name: "Web IDL", mime: "text/x-webidl", mode: "webidl", ext: ["webidl"]},
            {name: "VB.NET", mime: "text/x-vb", mode: "vb", ext: ["vb"]},
            {name: "VBScript", mime: "text/vbscript", mode: "vbscript", ext: ["vbs"]},
            {name: "Velocity", mime: "text/velocity", mode: "velocity", ext: ["vtl"]},
            {name: "Verilog", mime: "text/x-verilog", mode: "verilog", ext: ["v"]},
            {name: "VHDL", mime: "text/x-vhdl", mode: "vhdl", ext: ["vhd", "vhdl"]},
            {name: "Vue.js Component", mimes: ["script/x-vue", "text/x-vue"], mode: "vue", ext: ["vue"]},
            {name: "XML", mimes: ["application/xml", "text/xml"], mode: "xml", ext: ["xml", "xsl", "xsd", "svg"], alias: ["rss", "wsdl", "xsd"]},
            {name: "XQuery", mime: "application/xquery", mode: "xquery", ext: ["xy", "xquery"]},
            {name: "Yacas", mime: "text/x-yacas", mode: "yacas", ext: ["ys"]},
            {name: "YAML", mimes: ["text/x-yaml", "text/yaml"], mode: "yaml", ext: ["yaml", "yml"], alias: ["yml"]},
            {name: "Z80", mime: "text/x-z80", mode: "z80", ext: ["z80"]},
            {name: "mscgen", mime: "text/x-mscgen", mode: "mscgen", ext: ["mscgen", "mscin", "msc"]},
            {name: "xu", mime: "text/x-xu", mode: "mscgen", ext: ["xu"]},
            {name: "msgenny", mime: "text/x-msgenny", mode: "mscgen", ext: ["msgenny"]},
            {name: "WebAssembly", mime: "text/webassembly", mode: "wast", ext: ["wat", "wast"]}
        ];
    }

    function install(CodeMirror) {
        CodeMirror.modeInfo = _createModeInfo();

        // Ensure all modes have a mime property for backwards compatibility.
        for (let i = 0; i < CodeMirror.modeInfo.length; i++) {
            const info = CodeMirror.modeInfo[i];
            if (info.mimes) {
                info.mime = info.mimes[0];
            }
        }

        CodeMirror.findModeByMIME = function (mime) {
            const normalizedMIME = mime.toLowerCase();
            for (let i = 0; i < CodeMirror.modeInfo.length; i++) {
                const info = CodeMirror.modeInfo[i];
                if (info.mime == normalizedMIME) { // eslint-disable-line eqeqeq
                    return info;
                }
                if (info.mimes) {
                    for (let j = 0; j < info.mimes.length; j++) {
                        if (info.mimes[j] == normalizedMIME) { // eslint-disable-line eqeqeq
                            return info;
                        }
                    }
                }
            }
            if (/\+xml$/.test(normalizedMIME)) {
                return CodeMirror.findModeByMIME("application/xml");
            }
            if (/\+json$/.test(normalizedMIME)) {
                return CodeMirror.findModeByMIME("application/json");
            }
        };

        CodeMirror.findModeByExtension = function (extension) {
            const normalizedExtension = extension.toLowerCase();
            for (let i = 0; i < CodeMirror.modeInfo.length; i++) {
                const info = CodeMirror.modeInfo[i];
                if (info.ext) {
                    for (let j = 0; j < info.ext.length; j++) {
                        if (info.ext[j] == normalizedExtension) { // eslint-disable-line eqeqeq
                            return info;
                        }
                    }
                }
            }
        };

        CodeMirror.findModeByFileName = function (filename) {
            for (let i = 0; i < CodeMirror.modeInfo.length; i++) {
                const info = CodeMirror.modeInfo[i];
                if (info.file && info.file.test(filename)) {
                    return info;
                }
            }
            const dot = filename.lastIndexOf(".");
            const extension = dot > -1 &&
                filename.substring(dot + 1, filename.length);
            if (extension) {
                return CodeMirror.findModeByExtension(extension);
            }
        };

        CodeMirror.findModeByName = function (name) {
            const normalizedName = name.toLowerCase();
            for (let i = 0; i < CodeMirror.modeInfo.length; i++) {
                const info = CodeMirror.modeInfo[i];
                if (info.name.toLowerCase() == normalizedName) { // eslint-disable-line eqeqeq
                    return info;
                }
                if (info.alias) {
                    for (let j = 0; j < info.alias.length; j++) {
                        if (info.alias[j].toLowerCase() == normalizedName) { // eslint-disable-line eqeqeq
                            return info;
                        }
                    }
                }
            }
        };

        return CodeMirror;
    }

    exports.install = install;
});
