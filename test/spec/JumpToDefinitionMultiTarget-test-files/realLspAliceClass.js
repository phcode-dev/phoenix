// AliceClass lives here, separate from realLspPolymorphism.js, so the real-vtsls spec in
// JumpToDefinitionMultiTarget-integ-test.js can verify the picker/excerpt correctly show and open
// a candidate in a different file (real server-provided URI, not a hand-built mock one). It has an
// extra sibling method (yellow) and a long sayHello body so the same real jump also exercises both
// excerpt collapse cases (a member between the declaration and target, and a target body too long
// to show in full) alongside John/Jane's plain adjacent-declaration case in the other file.
const { MyBaseClass } = require("./realLspPolymorphism");

class AliceClass extends MyBaseClass {
  yellow() {
    console.log("not so soon");
  }
  sayHello() {
    console.log("Hello, Alice!");
    console.log("Hello, Alice!");
    console.log("Hello, Alice!");
    console.log("Hello, Alice!");
    console.log("Hello, Alice!");
    console.log("Hello, Alice!");
    console.log("Hello, Alice!");
    console.log("Hello, Alice!");
    console.log("Hello, Alice!");
    console.log("Hello, Alice!");
    console.log("Hello, Alice!");
    console.log("Hello, Alice!");
    console.log("Hello, Alice!");
    console.log("Hello, Alice!");
    console.log("Hello, Alice!");
    console.log("Hello, Alice!");
    console.log("Hello, Alice!");
    console.log("Hello, Alice!");
    console.log("Hello, Alice!");
    console.log("Hello, Alice!");
    console.log("Hello, Alice!");
  }
}

module.exports = { AliceClass };
