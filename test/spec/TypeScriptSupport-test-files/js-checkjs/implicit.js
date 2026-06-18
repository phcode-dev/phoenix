// Same untyped parameter as js-plain, but this project opts into type-checking via jsconfig
// (checkJs + noImplicitAny), so the LSP SHOULD report the implicit "any".
export function identity(value) {
    return value;
}
