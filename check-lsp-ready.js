#!/usr/bin/env node
/**
 * Quick check script to verify TypeScript LSP is ready
 * Run: node check-lsp-ready.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║  TypeScript LSP Integration - Readiness Check              ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

let allGood = true;

// Check 1: LSP Infrastructure Enabled
console.log('1. LSP Infrastructure');
const clientLoaderPath = './src/languageTools/ClientLoader.js';
const clientLoaderContent = fs.readFileSync(clientLoaderPath, 'utf8');
const lspEnabled = clientLoaderContent.includes('initDomainAndHandleNodeCrash();') &&
                    !clientLoaderContent.includes('//initDomainAndHandleNodeCrash();');
console.log('   Status:', lspEnabled ? '✓ Enabled' : '✗ Disabled');
if (!lspEnabled) allGood = false;

// Check 2: Extension Registered
console.log('\n2. TypeScriptLanguageServer Extension');
const extensionsPath = './src/extensions/default/DefaultExtensions.json';
const extensionsContent = fs.readFileSync(extensionsPath, 'utf8');
const registered = extensionsContent.includes('"TypeScriptLanguageServer"');
console.log('   Registered:', registered ? '✓ Yes' : '✗ No');
if (!registered) allGood = false;

// Check 3: Extension Files
console.log('\n3. Extension Files');
const mainJs = './src/extensions/default/TypeScriptLanguageServer/main.js';
const clientJs = './src/extensions/default/TypeScriptLanguageServer/client.js';
console.log('   main.js:', fs.existsSync(mainJs) ? '✓ Exists' : '✗ Missing');
console.log('   client.js:', fs.existsSync(clientJs) ? '✓ Exists' : '✗ Missing');
if (!fs.existsSync(mainJs) || !fs.existsSync(clientJs)) allGood = false;

// Check 4: TypeScript Language Server
console.log('\n4. TypeScript Language Server');
const serverPath = './node_modules/.bin/typescript-language-server';
const serverExists = fs.existsSync(serverPath);
console.log('   Installed:', serverExists ? '✓ Yes' : '✗ No');

if (serverExists) {
    try {
        const version = execSync(serverPath + ' --version', { encoding: 'utf8' }).trim();
        console.log('   Version:', version);
    } catch (err) {
        console.log('   Version: ✗ Cannot execute');
        allGood = false;
    }
} else {
    allGood = false;
}

// Check 5: Client Path Resolution
console.log('\n5. Path Resolution in client.js');
const clientContent = fs.readFileSync(clientJs, 'utf8');
const hasCorrectPath = clientContent.includes('../../../../node_modules/.bin/typescript-language-server');
console.log('   Path:', hasCorrectPath ? '✓ Correct (4 levels up)' : '✗ Wrong');
if (!hasCorrectPath) allGood = false;

// Check 6: Simulate Path Resolution
console.log('\n6. Path Resolution Test');
const clientDir = path.dirname(path.resolve(clientJs));
const resolvedPath = path.resolve(clientDir, '../../../../node_modules/.bin/typescript-language-server');
const pathCorrect = fs.existsSync(resolvedPath);
console.log('   From:', clientDir);
console.log('   To:', resolvedPath);
console.log('   Valid:', pathCorrect ? '✓ Yes' : '✗ No');
if (!pathCorrect) allGood = false;

// Summary
console.log('\n' + '═'.repeat(60));
if (allGood) {
    console.log('✓✓✓ ALL CHECKS PASSED ✓✓✓');
    console.log('\nTypeScript LSP is ready! To test:');
    console.log('  1. npm run serve');
    console.log('  2. Open http://localhost:8000/src in browser');
    console.log('  3. Check browser console for initialization messages');
    console.log('  4. Open a .js file and test code completion');
} else {
    console.log('✗✗✗ SOME CHECKS FAILED ✗✗✗');
    console.log('\nPlease fix the issues above before testing.');
}
console.log('═'.repeat(60));

process.exit(allGood ? 0 : 1);
