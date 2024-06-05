const { spawn, exec } = require('child_process');
const readline = require('readline');
const path = require('path');
const {OPERATION_RESPONSE, OPERATION_QUIT, OPERATION_LINT_TEXT}
    = require("./constants");

let requestID = 1;
let queuedReq = new Map();
function newRequestCallback(resolve, reject) {
    const newRequestID = requestID++;
    queuedReq.set(newRequestID, {resolve, reject});
    return newRequestID;
}

let eslintServiceProcess, nodeBinPath, currentProjectPath;

function sendToESLintProcess(jsObj) {
    try{
        if(!eslintServiceProcess) {
            console.error('sendToESLintProcess: eslintServiceProcess not found');
            return;
        }
        eslintServiceProcess.stdin.write(JSON.stringify(jsObj) + "\n");
    } catch (e) {
        console.error('sendToESLintProcess: send error', e);
    }
}

// Function to check if Node.js is installed
function getNodeJSBinPath() {
    return new Promise((resolve) => {
        if(nodeBinPath){
            resolve(nodeBinPath);
            return;
        }
        exec('node -v', (error, stdout, stderr) => {
            if (error) {
                console.error('System Node.js is not installed, using PHNode for ESLint');
                nodeBinPath = process.argv[0]; // phnode itself
            } else {
                console.log(`Node.js is installed. Version: ${stdout.trim()}`);
                nodeBinPath = "node"; // system node
            }
            resolve(nodeBinPath);
        });
    });
}

async function createESLintService(projectFullPath) {
    const nodeJSBinPath = await getNodeJSBinPath();
    return new Promise(resolve => {
        const args = [ path.join(__dirname, "runner.js"),
            path.join(projectFullPath, "node_modules", "eslint"), projectFullPath];
        if(eslintServiceProcess) {
            sendToESLintProcess({
                operation: OPERATION_QUIT
            });
        }
        eslintServiceProcess = spawn(nodeJSBinPath, args, {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        eslintServiceProcess.on('spawn', () => {
            console.log('ESLint process started successfully');
            resolve();
        });
        const eslineServiceHandler = eslintServiceProcess;
        const rl = readline.createInterface({
            input: eslintServiceProcess.stdout,
            output: process.stdout,
            terminal: false
        });
        rl.on('line', (line) => {
            if(!line.trim()){
                return; // empty line
            }
            // {operation, text, fullFilePath, requestID}
            const eslintResponse = JSON.parse(line);
            if(eslintResponse.operation === OPERATION_RESPONSE) {
                const sentRequestID = eslintResponse.requestID;
                const promiseResoover = queuedReq.get(sentRequestID);
                if(!promiseResoover){
                    console.error("ESLint service: request ID not found to process request!!: ", eslintResponse);
                    return;
                }
                delete eslintResponse.requestID;
                delete eslintResponse.operation;
                promiseResoover.resolve(eslintResponse);
            } else {
                console.error("ESLint service: Unknown operation: ", eslintResponse);
            }
        });

        eslintServiceProcess.on('error', (error) => {
            console.error(`ESLint Runner Process Error: ${error}`);
        });

        eslintServiceProcess.on('close', (code) => {
            if(eslineServiceHandler === eslintServiceProcess) {
                eslintServiceProcess = null;
            }
            console.log(`ESLint Runner process exited with code ${code}`);
        });
    });
}

async function lintFile(text, fullFilePath, projectFullPath) {
    if(currentProjectPath !== projectFullPath) {
        // on project change, we should create a new es linter
        currentProjectPath = projectFullPath;
        if(eslintServiceProcess) {
            sendToESLintProcess({
                operation: OPERATION_QUIT
            });
            eslintServiceProcess = null;
        }
    }
    if(!eslintServiceProcess){
        await createESLintService(projectFullPath);
    }
    return new Promise((resolve, reject) => {
        sendToESLintProcess({
            requestID: newRequestCallback(resolve, reject),
            operation: OPERATION_LINT_TEXT,
            text,
            fullFilePath
        });
    });
}

exports.lintFile = lintFile;
