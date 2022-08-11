/*global Tern*/

(function () {
    /**
     * This is a very simple tern worker that can be used to debug tern commands. This file is not really needed
     * for phoenix, but just here to save some pain with tern debugging
     */
    function ternSimpleTest() {
        function getFile(name, contentCb) {
            switch (name) {
                case 'index.js': return contentCb(null, indexjs);
                case 'list.js': return contentCb(null, listjs);
                case 'simple.js': return contentCb(null, simplejs);
                default: return '';
            }
        }

        let ternOptions = {
            defs: [],
            async: true,
            getFile: getFile,
            plugins: {
                requirejs: {},
                //angular: true,
                //node: true,
                //node_resolve: true,
                complete_strings: true,
                doc_comment: true,
                doc_comments: true,
                es_modules: true
                //commonjs: true
            }
        };

        // If a server is already created just reset the analysis data before marking it for GC

        let ternServer = new Tern.Server(ternOptions);
        ternServer.addFile("index.js");
        ternServer.addFile("list.js");
        let query = {
            "type": "definition",
            "variable": null,
            "lineCharPositions": true,
            "end": {
                "line": 6,
                "ch": 9
            },
            "file": "index.js"
        };
        let req = {query: query, files: []};
        setTimeout(()=>{
            ternServer.request(req, function(error, data) {
                console.log(error, data);
            });
        }, 1000);
    }


    let indexjs =
        `// Tern can do ECMAScript 6 (2015) too!

// Imports and exports work. You can complete module names, and
// jump to the definition of things defined in modules.

// (Press alt-. on \`List\` to jump to the class definition)
import {List} from "./list"

const l = List.of(3, 4, 5)
for (let elt of l.map(x => x * 2)) {
  // Tern knows that \`elt\` is a number!
  let output = myMath.halve(elt)
  console.log(output)
}

// Raw template string
let raw = String.raw\`\\n\`

// Default arguments
Array.of(1, 2, 3, 4).find(x => x % 3 == 0)`;

    let listjs =
        `export class List {
  constructor(head, tail) {
    this.head = head
    this.tail = tail
  }

  static of(...elements) {
    let result = null
    for (let i = elements.length - 1; i >= 0; i--)
      result = new List(elements[i], result)
    return result
  }

  map(f) {
    return new List(f(this.head), this.tail && this.tail.map(f))
  }

  *[Symbol.iterator]() {
    for (let pos = this; pos; pos = pos.tail)
      yield pos.head
  }
}`;

    let simplejs =
        `function x(){
}

x();
`;

    ternSimpleTest();
}());
