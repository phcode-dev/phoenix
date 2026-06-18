// Fixture for the LSP hover quick-action tests: a symbol with a definition (line 0) and usages.
export function greetUser(userName: string): string {
    return "Hi " + userName;
}

greetUser("alpha");
greetUser("bravo");
