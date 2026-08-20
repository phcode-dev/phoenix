// Fixture modeled on the https://github.com/phcode-dev/phoenix/issues/3093 repro: a base class
// whose method is overridden by several subclasses, called polymorphically.
class MyBaseClass {
    sayHello() {
        console.log("Hello from MyBaseClass");
    }
}

class JohnClass extends MyBaseClass {
    sayHello() {
        console.log("Hello from JohnClass");
    }
}

class JaneClass extends MyBaseClass {
    sayHello() {
        console.log("Hello from JaneClass");
    }
}

function greet(person) {
    person.sayHello();
}

module.exports = { MyBaseClass, JohnClass, JaneClass, greet };
