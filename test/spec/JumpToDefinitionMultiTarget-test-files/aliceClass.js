// A third override living in its own file, used to exercise the "jump target is in a
// different document" branch of doJumpToDef's picker (see JumpToDefinitionMultiTarget-integ-test.js).
const { MyBaseClass } = require("./polymorphism");

class AliceClass extends MyBaseClass {
    sayHello() {
        console.log("Hello from AliceClass");
    }
}

module.exports = { AliceClass };
