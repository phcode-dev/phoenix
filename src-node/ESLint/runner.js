const readline = require('readline');
const path = require('path');
const fsPromises = require('fs').promises;
const {ESLINT_ERROR_LINT_FAILED, ESLINT_ERROR_MODULE_LOAD_FAILED, ESLINT_ERROR_MODULE_NOT_FOUND,
    OPERATION_LINT_TEXT, OPERATION_QUIT, OPERATION_RESPONSE}
    = require("./constants");

if (!process.argv[2]) {
    console.error('Error: ESLintModulePath first argument is not set when running ESLint/runner.js');
    process.exit(1);
}
if (!process.argv[3]) {
    console.error('Error: projectRootPath second argument is not set when running ESLint/runner.js');
    process.exit(1);
}

// Get ESLint full path from the environment variable
const ESLintModulePath = path.resolve(process.argv[2]);
const projectRootPath = path.resolve(process.argv[3]);
const lintFilePath = process.argv[4] ? path.resolve(process.argv[4]) : null; // this is just for testing with console
const fs = require('fs');

function sendToPHNode(jsObj) {
    console.log(JSON.stringify(jsObj));
}

async function checkExists(directoryPath, isDir = true) {
    try {
        const stats = await fsPromises.stat(directoryPath);
        return isDir ? stats.isDirectory() : stats.isFile();
    } catch (error) {
        return false;
    }
}

// Dynamically require the ESLint module
let ESLintModule;
// if the user changed his eslint version while we were caching an old eslint version, we need to update.
// Function to observe version changes in ESLint
async function observeVersionChanges() {
    try {
        const packageJsonPath = path.join(ESLintModulePath, 'package.json');
        const packageJson = await fsPromises.readFile(packageJsonPath, 'utf8');
        const packageData = JSON.parse(packageJson);
        const currentEsLintModuleVersion = packageData.version;

        if (ESLintModule && currentEsLintModuleVersion && ESLintModule.version !== currentEsLintModuleVersion) {
            console.error('ESLint runner: ESLint version has changed. Requesting restart with new version...');
            process.exit(0);
        }
    } catch (error) {
        console.error('ESLint runner: Error reading ESLint version:', error.message);
    }
}

async function getESLintModule() {
    if(ESLintModule){
        observeVersionChanges();
        return ESLintModule;
    }
    try{
        const directoryExists = await checkExists(ESLintModulePath);
        if(!directoryExists){
            return null;
        }
        const {ESLint} = require(ESLintModulePath);
        ESLintModule = ESLint;
        return ESLint;
    } catch (e) {
        console.error("ESLint runner: failed to load ESLintModule");
    }
    return null;
}

async function getESLinter() {
    const ESLint = await getESLintModule();
    if(!ESLint){
        return null;
    }
    return new ESLint({ cwd: projectRootPath });
    // consider caching this if performance is not adequate.
    // when caching, make sure that a new eslint object is created when any of the eslint config file changes!!!.
}

async function lintTextWithPath(text, fullFilePath) {
    // Create an ESLint instance
    const eslinter = await getESLinter();
    if(!eslinter){
        const directoryExists = await checkExists(ESLintModulePath);
        return {
            isError: true,
            errorCode: directoryExists ? ESLINT_ERROR_MODULE_LOAD_FAILED : ESLINT_ERROR_MODULE_NOT_FOUND
        };
    }

    const isPathIgnored = await eslinter.isPathIgnored(fullFilePath);
    if(isPathIgnored) {
        return {
            isPathIgnored
        };
    }

    // Lint the project directory
    const result = (await eslinter.lintText(text, {
        filePath: fullFilePath
    }))[0];

    // Return the results as an array
    delete result.source;
    return {
        result
    };
}

if(lintFilePath) {
    const text = fs.readFileSync(lintFilePath, { encoding: 'utf8' });
    lintTextWithPath(text, lintFilePath)
        .then(console.log);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// each event is a json object
rl.on('line', (input) => {
    try {
        if(!input.trim()){
            return; // empty line
        }
        // {operation, text, fullFilePath, requestID}
        const eslintRequest = JSON.parse(input);
        if(eslintRequest.operation === OPERATION_LINT_TEXT) {
            lintTextWithPath(eslintRequest.text, eslintRequest.fullFilePath)
                .then(result=>{
                    result.requestID = eslintRequest.requestID;
                    result.operation = OPERATION_RESPONSE;
                    sendToPHNode(result);
                }).catch(err=>{
                    console.error("ESlint Runner error:", err);
                    sendToPHNode({
                        operation: OPERATION_RESPONSE,
                        requestID: eslintRequest.requestID,
                        isError: true,
                        errorMessage: err.message,
                        errorCode: ESLINT_ERROR_LINT_FAILED
                    });
                });
        } else if(eslintRequest.operation === OPERATION_QUIT) {
            process.exit(0);
        } else {
            console.error("ESLint runner: Unknown operation: ", eslintRequest);
        }
    } catch (error) {
        console.error('ESLint runner:: Error while processing message:', error.message);
    }
});
