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

/*global path, jsPromise*/

/**
 *  Utilities functions for running macros
 */
define(function (require, exports, module) {
    const FileViewController = require("project/FileViewController"),
        ProjectManager  = require("project/ProjectManager");

    async function open(line) {
        const filePath = line.split('open ')[1].trim();
        if(filePath.startsWith('/')) {
            await jsPromise(FileViewController.openFileAndAddToWorkingSet(filePath));
        } else {
            const projectFilePath = path.join(ProjectManager.getProjectRoot().fullPath, filePath);
            await jsPromise(FileViewController.openFileAndAddToWorkingSet(projectFilePath));
        }
    }

    async function runMacro(macroText) {
        let errors = [], lineNo = 0;
        for (const line of macroText.split('\n')) {
            lineNo++;
            try{
                const command = line.split(' ')[0].toLowerCase().trim();
                if(!command.trim()){
                    continue;
                }
                switch (command) {
                case "open": await open(line); break;
                default: errors.push({
                    lineNo, line, command,
                    errorCode: `Unknown Macro`,
                    errorText: `at ${lineNo}: Unknown Macro ${command} - "${line}"`
                });
                }
            } catch (e) {
                console.error("Error executing line: "+line, e);
                errors.push({
                    lineNo, line,
                    errorCode: `ERROR_EXEC_LINE`,
                    errorText: `at ${lineNo}: ${line} ; error: ${e}`
                });
            }
        }
        return errors;
    }

    exports.runMacro = runMacro;
});
