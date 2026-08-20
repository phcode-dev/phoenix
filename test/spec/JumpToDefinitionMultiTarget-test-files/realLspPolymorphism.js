// Real-LSP repro fixture (see #3093) - used only by the native-app "real vtsls" spec in
// JumpToDefinitionMultiTarget-integ-test.js, deliberately kept separate from the mocked-provider
// fixtures (polymorphism.js / aliceClass.js) used by the rest of that file's tests.
//
// AliceClass lives in realLspAliceClass.js (imported below) rather than here, same split as the
// mocked fixtures - so the picker's cross-file candidate (a different filename shown/opened) is
// exercised against a real server-provided URI too, not just the hand-built mock ones.
const { AliceClass } = require("./realLspAliceClass");

class MyBaseClass {
  sayHello() {
    throw new Error("Method not implemented");
  }
}

class JohnClass extends MyBaseClass {
  sayHello() {
    console.log("Hello, John!");
  }
}

class JaneClass extends MyBaseClass {
  sayHello() {
    console.log("Hello, Jane!");
  }
}

const myArray = [
  new JohnClass(),
  new JaneClass(),
  new AliceClass()
];

for (const obj of myArray) {
  obj.sayHello();
}

module.exports = { MyBaseClass, JohnClass, JaneClass };
