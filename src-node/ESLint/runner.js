const readline = require('readline');
const path = require('path');
const { fileURLToPath } = require('url');
const fsPromises = require('fs').promises;
const {ESLINT_ERROR_LINT_FAILED, ESLINT_ERROR_MODULE_LOAD_FAILED, ESLINT_ERROR_MODULE_NOT_FOUND,
    OPERATION_LINT_TEXT, OPERATION_QUIT, OPERATION_RESPONSE, OPERATION_GET_LOADED_VERSION
}
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
let ESLintCached, configFileError;

async function getESLintModule() {
    if(ESLintCached){
        return ESLintCached;
    }
    try{
        const directoryExists = await checkExists(ESLintModulePath);
        if(!directoryExists){
            return null;
        }
        const ESLintModule = require(ESLintModulePath);
        ESLintCached = ESLintModule.ESLint;
        configFileError = null;
        return ESLintCached;
    } catch (e) {
        console.error("ESLint runner: failed to load ESLintModule", e);
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

async function _getConfigDetails(eslinter, filePath) {
    try{
        const config = await eslinter.calculateConfigForFile(filePath);
        return JSON.parse(JSON.stringify(config)); // ensure that this is stringify able
    } catch (e) {
        console.error("Failed to compute config", e);
        return null;
    }
}

async function lintTextWithPath(text, fullFilePath) {
    // Create an ESLint instance
    const eslinter = await getESLinter();
    if(!eslinter){
        const directoryExists = await checkExists(ESLintModulePath);
        return {
            isError: true,
            errorCode: directoryExists ? ESLINT_ERROR_MODULE_LOAD_FAILED : ESLINT_ERROR_MODULE_NOT_FOUND,
            configFileError
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
        result,
        config: await _getConfigDetails(eslinter, fullFilePath)
    };
}

const ESLINT_CONFIG_JS_FILE_NAMES = [
    // eslint 9
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
    // legacy
    ".eslintrc.js",
    ".eslintrc.cjs"
];

function getTopmostStackFileName(error, nameOnly) {
    let fileName = null;
    try{
        if (error.stack) {
            const stackLines = error.stack.split('\n');
            for (let i=0; i<stackLines.length; i++) {
                const topmostStackLine = stackLines[i];

                // Extract the file name using a regular expression
                const match = topmostStackLine.match(/\((.*):\d+:\d+\)/);
                if (match) {
                    fileName = match[1];
                    break;
                } else {
                    // In case the format is different, try another pattern
                    const alternativeMatch = topmostStackLine.match(/at (.*):\d+:\d+/);
                    if (alternativeMatch) {
                        fileName = alternativeMatch[1];
                        break;
                    }
                }
            }
        }
        if(fileName && fileName.startsWith("file://")) {
            fileName = fileURLToPath(fileName);
        }
        // now convert the full path to name
        if(nameOnly){
            fileName = path.basename(fileName);
        }
    } catch (e) {
        console.error("Error getting topmost stack file", e);
    }

    return fileName;
}

if(lintFilePath) {
    const text = fs.readFileSync(lintFilePath, { encoding: 'utf8' });
    lintTextWithPath(text, lintFilePath)
        .then(console.log)
        .catch(err=>{
            console.error(err);
            const topmostFileName = getTopmostStackFileName(err);
            console.log('Topmost stack file name:', topmostFileName);
        });
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
                    const errorCausedFile = getTopmostStackFileName(err, true);
                    let errorMessage = err.message || "";
                    if(errorCausedFile && ESLINT_CONFIG_JS_FILE_NAMES.includes(errorCausedFile)){
                        errorMessage = `${getTopmostStackFileName(err)}: ${errorMessage}`;
                    }
                    sendToPHNode({
                        operation: OPERATION_RESPONSE,
                        requestID: eslintRequest.requestID,
                        isError: true,
                        errorMessage: errorMessage,
                        errorCode: ESLINT_ERROR_LINT_FAILED
                    });
                });
        } else if(eslintRequest.operation === OPERATION_QUIT) {
            process.exit(0);
        } else if(eslintRequest.operation === OPERATION_GET_LOADED_VERSION) {
            sendToPHNode({
                operation: OPERATION_RESPONSE,
                requestID: eslintRequest.requestID,
                esLintVersion: ESLintCached && ESLintCached.version
            });
        } else {
            console.error("ESLint runner: Unknown operation: ", eslintRequest);
        }
    } catch (error) {
        console.error('ESLint runner:: Error while processing message:', error.message);
    }
});
