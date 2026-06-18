// Plain JavaScript (no jsconfig/tsconfig, no @ts-check). The untyped parameter would be an
// "implicit any" under type-checking, but a pure-JS project must NOT be nagged about it.
export function identity(value) {
    return value;
}
