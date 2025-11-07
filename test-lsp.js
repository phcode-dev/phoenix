// Test file for TypeScript LSP
// Open this file in Phoenix to test LSP features

// Test 1: Code Completion
// Type the dot after 'arr' and press Ctrl+Space
// You should see array methods: map, filter, reduce, etc.
const arr = [1, 2, 3, 4, 5];
arr

// Test 2: Hover Information
// Hover your mouse over variables to see their types
const name = "Phoenix";
const count = 42;
const isActive = true;

// Test 3: Error Detection
// This should show a red squiggle (undefined variable)
// Uncomment to test:
// const result = undefinedVariable;

// Test 4: Function Parameter Hints
// Type the opening parenthesis and you should see parameter info
function greet(firstName, lastName, age) {
    return `Hello ${firstName} ${lastName}, age ${age}`;
}

// Type: greet( and you should see parameter hints
greet

// Test 5: Jump to Definition
// Right-click on 'greet' below and select "Go to Definition"
// It should jump to the function definition above
const message = greet("John", "Doe", 30);

// Test 6: Object Property Completion
// Type the dot after 'person' and press Ctrl+Space
const person = {
    name: "Alice",
    age: 25,
    email: "alice@example.com"
};
person

// Test 7: String Methods
// Type the dot after 'str' and press Ctrl+Space
const str = "Hello World";
str

// Test 8: Import Suggestions (if you have other files)
// Type: import { } from './
// You should see file suggestions

// Test 9: Type Inference
// Hover over 'numbers' - it should show: number[]
const numbers = [1, 2, 3].map(n => n * 2);

// Test 10: JSDoc Support
/**
 * Calculates the sum of two numbers
 * @param {number} a - First number
 * @param {number} b - Second number
 * @returns {number} The sum
 */
function add(a, b) {
    return a + b;
}

// Type: add( and you should see the JSDoc information
add

console.log("If you see LSP features working, the integration is successful! 🎉");
