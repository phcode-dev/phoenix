/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

/*global Phoenix, fs*/

if(Phoenix.browser.isTauri) {
    window.nodeSetupDonePromise = new Promise((resolve, reject) =>{
        const NODE_COMMANDS = {
            TERMINATE: "terminate",
            PING: "ping",
            SET_DEBUG_MODE: "setDebugMode",
            HEART_BEAT: "heartBeat",
            GET_ENDPOINTS: "getEndpoints"
        };
        const COMMAND_RESPONSE_PREFIX = 'phnodeResp:';
        let command, child;
        let resolved = false;
        let commandID = 0, pendingCommands = {};
        const PHNODE_PREFERENCES_KEY = "PhNode.Prefs";
        function setInspectEnabled(enabled) {
            const prefs = JSON.parse(localStorage.getItem(PHNODE_PREFERENCES_KEY) || "{}");
            prefs.inspectEnabled = enabled;
            localStorage.setItem(PHNODE_PREFERENCES_KEY, JSON.stringify(prefs));
        }
        function isInspectEnabled() {
            const prefs = JSON.parse(localStorage.getItem(PHNODE_PREFERENCES_KEY) || "{}");
            return !!prefs.inspectEnabled;
        }

        function getRandomNumber(min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }

        window.__TAURI__.path.resolveResource("src-node/index.js")
            .then(async nodeSrcPath=>{
                const inspectPort = Phoenix.isTestWindow ? getRandomNumber(5000, 50000) : 9229;
                const argsArray = isInspectEnabled() ? [`--inspect=${inspectPort}`, nodeSrcPath] : [nodeSrcPath, ''];
                command = window.__TAURI__.shell.Command.sidecar('phnode', argsArray);
                command.on('close', data => {
                    window.isNodeTerminated = true;
                    console.log(`PhNode: command finished with code ${data.code} and signal ${data.signal}`);
                    if(!resolved) {
                        reject("PhNode: closed - Terminated.");
                    }
                });
                command.on('error', error => console.error(`PhNode: command error: "${error}"`));
                command.stdout.on('data', line => {
                    if(line){
                        if(line.startsWith(COMMAND_RESPONSE_PREFIX)){
                        // its a js response object
                            line = line.replace(COMMAND_RESPONSE_PREFIX, "");
                            const jsonMsg = JSON.parse(line);
                            pendingCommands[jsonMsg.commandID].resolve(jsonMsg.message);
                            delete pendingCommands[jsonMsg.commandID];
                        } else {
                            console.log(`PhNode: ${line}`);
                        }
                    }
                });
                command.stderr.on('data', line => console.error(`PhNode: ${line}`));
                child = await command.spawn();

                const execNode = function (commandCode, commandData) {
                    if(window.isNodeTerminated){
                        return Promise.reject("Node is terminated! Cannot execute: " + commandCode);
                    }
                    const newCommandID = commandID ++;
                    child.write(JSON.stringify({
                        commandCode: commandCode, commandID: newCommandID, commandData
                    }) + "\n");
                    let resolveP, rejectP;
                    const promise = new Promise((resolve, reject) => { resolveP = resolve; rejectP=reject; });
                    pendingCommands[newCommandID]= {resolve: resolveP, reject: rejectP};
                    return promise;
                };

                window.PhNodeEngine = {
                    setInspectEnabled,
                    isInspectEnabled,
                    terminateNode: function () {
                        if(!window.isNodeTerminated) {
                            execNode(NODE_COMMANDS.TERMINATE);
                        }
                    },
                    getInspectPort: function () {
                        return inspectPort;
                    }
                };

                execNode(NODE_COMMANDS.GET_ENDPOINTS)
                    .then(message=>{
                        fs.setNodeWSEndpoint(message.phoenixFSURL);
                        fs.forceUseNodeWSEndpoint(true);
                        resolve(message);
                    });
                execNode(NODE_COMMANDS.SET_DEBUG_MODE, window.debugMode);
                setInterval(()=>{
                    if(!window.isNodeTerminated) {
                        execNode(NODE_COMMANDS.HEART_BEAT);
                    }
                }, 10000);
            });
    });
}
