// A deliberate TypeScript type error for the LSP integration test.
const aNumber: number = "this is a string";

export function getValue(): number {
    return aNumber;
}
