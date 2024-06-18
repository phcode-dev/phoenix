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

/*global WorkerComm, HTMLLanguageService*/

(function () {
    let htmlValidator = HTMLLanguageService.createHTMLValidator({
        extends: ["html-validate:standard"]
    });
    WorkerComm.triggerPeer("html_lint_extension_Loaded", {});

    let isUsingCustomConfig = false, currentConfigID;

    function setupValidator(config, configID) {
        try{
            if(!config && isUsingCustomConfig) {
                // reset the config
                htmlValidator = HTMLLanguageService.createHTMLValidator({
                    extends: ["html-validate:standard"]
                });
                isUsingCustomConfig = false;
                currentConfigID = null;
            } else if(config && currentConfigID !== configID) {
                htmlValidator = HTMLLanguageService.createHTMLValidator(config);
                isUsingCustomConfig = true;
                currentConfigID = configID;
            }
            return null;
        } catch (e) {
            return e.message;
        }
    }

    async function htmlLint(params) {
        let errorMessage = setupValidator(params.config, params.configID);
        if(errorMessage) {
            return [{
                start: 0,
                end: 0,
                severity: 2, // 1 warning and 2 is error
                message: "Invalid config file `.htmlvalidate.json`"+ errorMessage,
                ruleId: "INVALID_CONFIG"
            }];
        }
        const validatorResult = await htmlValidator.validateString(params.text, params.filePath);
        if(!validatorResult || !validatorResult.results || !validatorResult.results.length){
            return [];
        }
        const errors = [];
        for(let result of validatorResult.results){
            if(result.messages && result.messages.length) {
                for(let message of result.messages){
                    errors.push({
                        start: message.offset,
                        end: message.offset + (message.size || 1) - 1,
                        severity: message.severity,
                        message: message.message,
                        ruleId: message.ruleId,
                        ruleUrl: message.ruleUrl // this is a doc link for the ruleId config, not good to show
                        // to a user who doesnt know about html validator config is.
                    });
                }
            }
        }
        return errors;
    }

    async function updateHTMLLintConfig(params) {
        if(params.config){
            console.error("HTML Lint worker updateHTMLLintConfig received null config", params);
            return;
        }
        htmlValidator = HTMLLanguageService.createHTMLValidator(params.config);
    }

    WorkerComm.setExecHandler("htmlLint", htmlLint);
    WorkerComm.setExecHandler("updateHTMLLintConfig", updateHTMLLintConfig);
}());
