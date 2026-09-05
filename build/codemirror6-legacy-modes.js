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
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 */

import { apl } from "@codemirror/legacy-modes/mode/apl";
import { asciiArmor } from "@codemirror/legacy-modes/mode/asciiarmor";
import { asn1 } from "@codemirror/legacy-modes/mode/asn1";
import { asterisk } from "@codemirror/legacy-modes/mode/asterisk";
import { brainfuck } from "@codemirror/legacy-modes/mode/brainfuck";
import {
    c,
    ceylon,
    cpp,
    csharp,
    dart,
    java,
    kotlin,
    nesC,
    objectiveC,
    objectiveCpp,
    scala,
    shader,
    squirrel
} from "@codemirror/legacy-modes/mode/clike";
import { clojure } from "@codemirror/legacy-modes/mode/clojure";
import { cmake } from "@codemirror/legacy-modes/mode/cmake";
import { cobol } from "@codemirror/legacy-modes/mode/cobol";
import { coffeeScript } from "@codemirror/legacy-modes/mode/coffeescript";
import { commonLisp } from "@codemirror/legacy-modes/mode/commonlisp";
import { crystal } from "@codemirror/legacy-modes/mode/crystal";
import {
    css,
    gss,
    less,
    sCSS
} from "@codemirror/legacy-modes/mode/css";
import { cypher } from "@codemirror/legacy-modes/mode/cypher";
import { d } from "@codemirror/legacy-modes/mode/d";
import { diff } from "@codemirror/legacy-modes/mode/diff";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";
import { dtd } from "@codemirror/legacy-modes/mode/dtd";
import { dylan } from "@codemirror/legacy-modes/mode/dylan";
import { ebnf } from "@codemirror/legacy-modes/mode/ebnf";
import { ecl } from "@codemirror/legacy-modes/mode/ecl";
import { eiffel } from "@codemirror/legacy-modes/mode/eiffel";
import { elm } from "@codemirror/legacy-modes/mode/elm";
import { erlang } from "@codemirror/legacy-modes/mode/erlang";
import { factor } from "@codemirror/legacy-modes/mode/factor";
import { fcl } from "@codemirror/legacy-modes/mode/fcl";
import { forth } from "@codemirror/legacy-modes/mode/forth";
import { fortran } from "@codemirror/legacy-modes/mode/fortran";
import {
    gas,
    gasArm
} from "@codemirror/legacy-modes/mode/gas";
import { gherkin } from "@codemirror/legacy-modes/mode/gherkin";
import { go } from "@codemirror/legacy-modes/mode/go";
import { groovy } from "@codemirror/legacy-modes/mode/groovy";
import { haskell } from "@codemirror/legacy-modes/mode/haskell";
import {
    haxe,
    hxml
} from "@codemirror/legacy-modes/mode/haxe";
import { http } from "@codemirror/legacy-modes/mode/http";
import { idl } from "@codemirror/legacy-modes/mode/idl";
import {
    javascript,
    json,
    jsonld,
    typescript
} from "@codemirror/legacy-modes/mode/javascript";
import { jinja2 } from "@codemirror/legacy-modes/mode/jinja2";
import { julia } from "@codemirror/legacy-modes/mode/julia";
import { liveScript } from "@codemirror/legacy-modes/mode/livescript";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { mathematica } from "@codemirror/legacy-modes/mode/mathematica";
import { mbox } from "@codemirror/legacy-modes/mode/mbox";
import { mirc } from "@codemirror/legacy-modes/mode/mirc";
import {
    fSharp,
    oCaml,
    sml
} from "@codemirror/legacy-modes/mode/mllike";
import { modelica } from "@codemirror/legacy-modes/mode/modelica";
import {
    mscgen,
    msgenny,
    xu
} from "@codemirror/legacy-modes/mode/mscgen";
import { mumps } from "@codemirror/legacy-modes/mode/mumps";
import { nginx } from "@codemirror/legacy-modes/mode/nginx";
import { nsis } from "@codemirror/legacy-modes/mode/nsis";
import { ntriples } from "@codemirror/legacy-modes/mode/ntriples";
import { octave } from "@codemirror/legacy-modes/mode/octave";
import { oz } from "@codemirror/legacy-modes/mode/oz";
import { pascal } from "@codemirror/legacy-modes/mode/pascal";
import { pegjs } from "@codemirror/legacy-modes/mode/pegjs";
import { perl } from "@codemirror/legacy-modes/mode/perl";
import { pig } from "@codemirror/legacy-modes/mode/pig";
import { powerShell } from "@codemirror/legacy-modes/mode/powershell";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { protobuf } from "@codemirror/legacy-modes/mode/protobuf";
import { pug } from "@codemirror/legacy-modes/mode/pug";
import { puppet } from "@codemirror/legacy-modes/mode/puppet";
import {
    cython,
    python
} from "@codemirror/legacy-modes/mode/python";
import { q } from "@codemirror/legacy-modes/mode/q";
import { r } from "@codemirror/legacy-modes/mode/r";
import {
    rpmChanges,
    rpmSpec
} from "@codemirror/legacy-modes/mode/rpm";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import { rust } from "@codemirror/legacy-modes/mode/rust";
import { sas } from "@codemirror/legacy-modes/mode/sas";
import { sass } from "@codemirror/legacy-modes/mode/sass";
import { scheme } from "@codemirror/legacy-modes/mode/scheme";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { sieve } from "@codemirror/legacy-modes/mode/sieve";
import { smalltalk } from "@codemirror/legacy-modes/mode/smalltalk";
import { solr } from "@codemirror/legacy-modes/mode/solr";
import { sparql } from "@codemirror/legacy-modes/mode/sparql";
import { spreadsheet } from "@codemirror/legacy-modes/mode/spreadsheet";
import {
    cassandra,
    esper,
    gpSQL,
    gql,
    hive,
    mariaDB,
    msSQL,
    mySQL,
    pgSQL,
    plSQL,
    sparkSQL,
    sqlite,
    standardSQL
} from "@codemirror/legacy-modes/mode/sql";
import {
    stex,
    stexMath
} from "@codemirror/legacy-modes/mode/stex";
import { stylus } from "@codemirror/legacy-modes/mode/stylus";
import { swift } from "@codemirror/legacy-modes/mode/swift";
import { tcl } from "@codemirror/legacy-modes/mode/tcl";
import { textile } from "@codemirror/legacy-modes/mode/textile";
import { tiddlyWiki } from "@codemirror/legacy-modes/mode/tiddlywiki";
import { tiki } from "@codemirror/legacy-modes/mode/tiki";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { troff } from "@codemirror/legacy-modes/mode/troff";
import { ttcnCfg } from "@codemirror/legacy-modes/mode/ttcn-cfg";
import { ttcn } from "@codemirror/legacy-modes/mode/ttcn";
import { turtle } from "@codemirror/legacy-modes/mode/turtle";
import { vb } from "@codemirror/legacy-modes/mode/vb";
import {
    vbScript,
    vbScriptASP
} from "@codemirror/legacy-modes/mode/vbscript";
import { velocity } from "@codemirror/legacy-modes/mode/velocity";
import {
    tlv,
    verilog
} from "@codemirror/legacy-modes/mode/verilog";
import { vhdl } from "@codemirror/legacy-modes/mode/vhdl";
import { wast } from "@codemirror/legacy-modes/mode/wast";
import { webIDL } from "@codemirror/legacy-modes/mode/webidl";
import {
    html,
    xml
} from "@codemirror/legacy-modes/mode/xml";
import { xQuery } from "@codemirror/legacy-modes/mode/xquery";
import { yacas } from "@codemirror/legacy-modes/mode/yacas";
import { yaml } from "@codemirror/legacy-modes/mode/yaml";
import {
    ez80,
    z80
} from "@codemirror/legacy-modes/mode/z80";

const legacyModeParsers = {
    "apl": apl,
    "asciiarmor": asciiArmor,
    "asn.1": asn1({}),
    "asterisk": asterisk,
    "brainfuck": brainfuck,
    "c": c,
    "ceylon": ceylon,
    "cpp": cpp,
    "csharp": csharp,
    "dart": dart,
    "java": java,
    "kotlin": kotlin,
    "nesc": nesC,
    "objectivec": objectiveC,
    "objectivecpp": objectiveCpp,
    "scala": scala,
    "shader": shader,
    "squirrel": squirrel,
    "clojure": clojure,
    "cmake": cmake,
    "cobol": cobol,
    "coffeescript": coffeeScript,
    "commonlisp": commonLisp,
    "crystal": crystal,
    "css": css,
    "gss": gss,
    "less": less,
    "scss": sCSS,
    "cypher": cypher,
    "d": d,
    "diff": diff,
    "dockerfile": dockerFile,
    "dtd": dtd,
    "dylan": dylan,
    "ebnf": ebnf,
    "ecl": ecl,
    "eiffel": eiffel,
    "elm": elm,
    "erlang": erlang,
    "factor": factor,
    "fcl": fcl,
    "forth": forth,
    "fortran": fortran,
    "gas": gas,
    "gas-arm": gasArm,
    "gherkin": gherkin,
    "go": go,
    "groovy": groovy,
    "haskell": haskell,
    "haxe": haxe,
    "hxml": hxml,
    "http": http,
    "idl": idl,
    "javascript": javascript,
    "json": json,
    "jsonld": jsonld,
    "typescript": typescript,
    "jinja2": jinja2,
    "julia": julia,
    "livescript": liveScript,
    "lua": lua,
    "mathematica": mathematica,
    "mbox": mbox,
    "mirc": mirc,
    "mllike": oCaml,
    "ocaml": oCaml,
    "fsharp": fSharp,
    "sml": sml,
    "modelica": modelica,
    "mscgen": mscgen,
    "msgenny": msgenny,
    "xu": xu,
    "mumps": mumps,
    "nginx": nginx,
    "nsis": nsis,
    "ntriples": ntriples,
    "octave": octave,
    "oz": oz,
    "pascal": pascal,
    "pegjs": pegjs,
    "perl": perl,
    "pig": pig,
    "powershell": powerShell,
    "properties": properties,
    "protobuf": protobuf,
    "pug": pug,
    "puppet": puppet,
    "python": python,
    "cython": cython,
    "q": q,
    "r": r,
    "rpm": rpmSpec,
    "rpm-changes": rpmChanges,
    "rpm-spec": rpmSpec,
    "ruby": ruby,
    "rust": rust,
    "sas": sas,
    "sass": sass,
    "scheme": scheme,
    "shell": shell,
    "sieve": sieve,
    "smalltalk": smalltalk,
    "solr": solr,
    "sparql": sparql,
    "spreadsheet": spreadsheet,
    "sql": standardSQL,
    "cassandra": cassandra,
    "esper": esper,
    "gpsql": gpSQL,
    "gql": gql,
    "hive": hive,
    "mariadb": mariaDB,
    "mssql": msSQL,
    "mysql": mySQL,
    "pgsql": pgSQL,
    "plsql": plSQL,
    "sparksql": sparkSQL,
    "sqlite": sqlite,
    "stex": stex,
    "stex-math": stexMath,
    "stylus": stylus,
    "swift": swift,
    "tcl": tcl,
    "textile": textile,
    "tiddlywiki": tiddlyWiki,
    "tiki": tiki,
    "toml": toml,
    "troff": troff,
    "ttcn-cfg": ttcnCfg,
    "ttcn": ttcn,
    "turtle": turtle,
    "vb": vb,
    "vbscript": vbScript,
    "vbscript-asp": vbScriptASP,
    "velocity": velocity,
    "verilog": verilog,
    "tlv": tlv,
    "vhdl": vhdl,
    "wast": wast,
    "webidl": webIDL,
    "xml": xml,
    "html": html,
    "xquery": xQuery,
    "yacas": yacas,
    "yaml": yaml,
    "z80": z80,
    "ez80": ez80
};

const legacyModeModules = {
    "clike": [
        "clike",
        "c",
        "ceylon",
        "cpp",
        "csharp",
        "dart",
        "java",
        "kotlin",
        "nesc",
        "objectivec",
        "objectivecpp",
        "scala",
        "shader",
        "squirrel"
    ],
    "css": ["css", "gss", "less", "scss"],
    "gas": ["gas", "gas-arm"],
    "haxe": ["haxe", "hxml"],
    "javascript": ["javascript", "json", "jsonld", "typescript"],
    "mllike": ["mllike", "ocaml", "fsharp", "sml"],
    "mscgen": ["mscgen", "msgenny", "xu"],
    "python": ["python", "cython"],
    "rpm": ["rpm", "rpm-changes", "rpm-spec"],
    "sql": [
        "sql",
        "cassandra",
        "esper",
        "gpsql",
        "gql",
        "hive",
        "mariadb",
        "mssql",
        "mysql",
        "pgsql",
        "plsql",
        "sparksql",
        "sqlite"
    ],
    "stex": ["stex", "stex-math"],
    "vbscript": ["vbscript", "vbscript-asp"],
    "verilog": ["verilog", "tlv"],
    "xml": ["xml", "html"],
    "z80": ["z80", "ez80"]
};

const legacyModeMIMEs = {
    "application/ecmascript": "javascript",
    "application/edn": "clojure",
    "application/mbox": "mbox",
    "application/n-quads": "ntriples",
    "application/n-triples": "ntriples",
    "application/pgp": "asciiarmor",
    "application/pgp-encrypted": "asciiarmor",
    "application/pgp-keys": "asciiarmor",
    "application/pgp-signature": "asciiarmor",
    "application/sieve": "sieve",
    "application/sparql-query": "sparql",
    "application/vnd.coffeescript": "coffeescript",
    "application/xml-dtd": "dtd",
    "application/x-aspx": {
        name: "htmlembedded",
        scriptingModeSpec: "text/x-csharp"
    },
    "application/x-cypher-query": "cypher",
    "application/x-javascript": "javascript",
    "application/x-jsp": {
        name: "htmlembedded",
        scriptingModeSpec: "text/x-java"
    },
    "application/x-json": {
        name: "javascript",
        json: true
    },
    "application/x-powershell": "powershell",
    "application/x-sh": "shell",
    "application/x-slim": "slim",
    "application/x-troff": "troff",
    "application/xquery": "xquery",
    "message/http": "http",
    "text/apl": "apl",
    "text/coffeescript": "coffeescript",
    "text/ecmascript": "javascript",
    "text/mirc": "mirc",
    "text/n-triples": "ntriples",
    "text/rust": "rust",
    "text/tiki": "tiki",
    "text/turtle": "turtle",
    "text/troff": "troff",
    "text/velocity": "velocity",
    "text/vbscript": "vbscript",
    "text/yaml": "yaml",
    "text/webassembly": "wast",
    "text/x-asterisk": "asterisk",
    "text/x-brainfuck": "brainfuck",
    "text/x-cassandra": "cassandra",
    "text/x-ceylon": "ceylon",
    "text/x-clojure": "clojure",
    "text/x-clojurescript": "clojure",
    "text/x-cmake": "cmake",
    "text/x-cobol": "cobol",
    "text/x-coffeescript": "coffeescript",
    "text/x-common-lisp": "commonlisp",
    "text/x-crystal": "crystal",
    "text/x-cython": "cython",
    "text/x-d": "d",
    "text/x-diff": "diff",
    "text/x-django": "django",
    "text/x-dockerfile": "dockerfile",
    "text/x-dylan": "dylan",
    "text/x-ebnf": "ebnf",
    "text/x-ecl": "ecl",
    "text/x-eiffel": "eiffel",
    "text/x-elm": "elm",
    "text/x-erlang": "erlang",
    "text/x-esper": "esper",
    "text/x-factor": "factor",
    "text/x-fcl": "fcl",
    "text/x-feature": "gherkin",
    "text/x-forth": "forth",
    "text/x-fortran": "fortran",
    "text/x-fsharp": "fsharp",
    "text/x-gas": "gas",
    "text/x-gfm": "gfm",
    "text/x-go": "go",
    "text/x-gpsql": "gpsql",
    "text/x-gql": "gql",
    "text/x-groovy": "groovy",
    "text/x-gss": "gss",
    "text/x-haml": "haml",
    "text/x-haskell": "haskell",
    "text/x-haxe": "haxe",
    "text/x-hive": "hive",
    "text/x-hxml": "hxml",
    "text/x-idl": "idl",
    "text/x-ini": "properties",
    "text/x-julia": "julia",
    "text/x-jade": "pug",
    "text/x-latex": "stex",
    "text/x-literate-haskell": "haskell-literate",
    "text/x-livescript": "livescript",
    "text/x-lua": "lua",
    "text/x-mariadb": "mariadb",
    "text/x-mathematica": "mathematica",
    "text/x-modelica": "modelica",
    "text/x-mscgen": "mscgen",
    "text/x-msgenny": "msgenny",
    "text/x-mssql": "mssql",
    "text/x-mumps": "mumps",
    "text/x-nginx-conf": "nginx",
    "text/x-nsis": "nsis",
    "text/x-objectivec++": "objectivecpp",
    "text/x-ocaml": "ocaml",
    "text/x-octave": "octave",
    "text/x-oz": "oz",
    "text/x-pascal": "pascal",
    "text/x-perl": "perl",
    "text/x-pgsql": "pgsql",
    "text/x-pig": "pig",
    "text/x-plsql": "plsql",
    "text/x-protobuf": "protobuf",
    "text/x-pug": "pug",
    "text/x-puppet": "puppet",
    "text/x-python": "python",
    "text/x-q": "q",
    "text/x-rst": "rst",
    "text/x-rpm-changes": "rpm-changes",
    "text/x-rpm-spec": "rpm-spec",
    "text/x-ruby": "ruby",
    "text/x-rsrc": "r",
    "text/x-sas": "sas",
    "text/x-sass": "sass",
    "text/x-scheme": "scheme",
    "text/x-sieve": "sieve",
    "text/x-slim": "slim",
    "text/x-sml": "sml",
    "text/x-smarty": "smarty",
    "text/x-solr": "solr",
    "text/x-soy": "soy",
    "text/x-sparksql": "sparksql",
    "text/x-spreadsheet": "spreadsheet",
    "text/x-sqlite": "sqlite",
    "text/x-squirrel": "squirrel",
    "text/x-stsrc": "smalltalk",
    "text/x-swift": "swift",
    "text/x-systemverilog": "verilog",
    "text/x-tcl": "tcl",
    "text/x-textile": "textile",
    "text/x-tiddlywiki": "tiddlywiki",
    "text/x-tlv": "tlv",
    "text/x-ttcn": "ttcn",
    "text/x-ttcn-asn": "asn.1",
    "text/x-ttcn-cfg": "ttcn-cfg",
    "text/x-tornado": "tornado",
    "text/x-troff": "troff",
    "text/x-vhdl": "vhdl",
    "text/x-verilog": "verilog",
    "text/x-webidl": "webidl",
    "text/x-xu": "xu",
    "text/x-yacas": "yacas",
    "text/x-yaml": "yaml",
    "text/x-twig": "twig",
    "text/x-nesc": "nesc",
    "text/x-z80": "z80",
    "text/x-ez80": "ez80"
};

export {
    legacyModeMIMEs,
    legacyModeModules,
    legacyModeParsers
};
