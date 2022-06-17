/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2022 - present core.ai . All rights reserved.
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

/* eslint-env node */
const AWS = require('aws-sdk');
const fs = require('fs');
AWS.config.update({region: "eu-central-1"});

let AWSTranslate = new AWS.Translate();

function _translateStringWithAWS(text, srcLang, dstLang) {
    return new Promise((resolve, reject)=>{
        let params = {
            SourceLanguageCode: srcLang,
            TargetLanguageCode: dstLang,
            Text: text
        };

        AWSTranslate.translateText(params, function (err, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data['TranslatedText']);
            }
        });

    });
}

function _getAllNLSFolders() {
    let names = fs.readdirSync('src/nls');
    let nlsFolders =[];
    for(let name of names){
        let stat = fs.statSync(`src/nls/${name}`);
        if(stat.isDirectory()){
            nlsFolders.push(name);
        }
    }
    return nlsFolders;
}

let definedStrings;
global.define = function (jsonObj) {
    definedStrings = jsonObj;
};
require("../src/nls/root/strings");
let rootStrings = definedStrings;

function _getJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        console.log(`error reading ${filePath}, defaulting to {}`);
        return {};
    }
}

const FILE_HEADER = `/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
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

define(`,
FILE_FOOTER = ');';

function _isTranslatableKey(key) {
    const doNotTranslateDirective = '_DO_NOT_TRANSLATE';
    const translationDisabledForKey = `${key}${doNotTranslateDirective}`;
    if(key.endsWith(doNotTranslateDirective) || rootStrings[translationDisabledForKey] === 'true'){
        return false;
    }
    return true;
}

async function _processLang(lang) {
    if(lang === 'root'){
        return;
    }
    let expertTranslations = _getJson(`src/nls/${lang}/expertTranslations.json`, 'utf8');
    let lastTranslated = _getJson(`src/nls/${lang}/lastTranslated.json`, 'utf8');
    require(`../src/nls/${lang}/strings`);
    let existingTranslations = definedStrings;
    let translations = {}, newTranslations={};
    for(let rootKey of Object.keys(rootStrings)){
        if(!_isTranslatableKey(rootKey)){
            continue; // move on to next string
        }
        let englishStringToTranslate = rootStrings[rootKey];
        let lastTranslatedEnglishString = lastTranslated[rootKey];
        if(englishStringToTranslate === lastTranslatedEnglishString){
            // Load expert translation if there is one else we don't need to translate, use existing translation as is.
            translations[rootKey] = expertTranslations[englishStringToTranslate] || existingTranslations[rootKey];
        } else {
            if(expertTranslations[englishStringToTranslate]){
                // prefer expert translations over machine translations
                translations[rootKey] = expertTranslations[englishStringToTranslate];
            } else {
                let awsTranslation = await _translateStringWithAWS(englishStringToTranslate, "en", lang);
                console.log(awsTranslation);
                translations[rootKey] = awsTranslation;
            }
        }
        newTranslations[rootKey] = englishStringToTranslate;
    }
    let translatedStringsJSON = JSON.stringify(translations, null, 2);
    let fileToWrite = `${FILE_HEADER}${translatedStringsJSON}${FILE_FOOTER}`;
    fs.writeFileSync(`src/nls/${lang}/strings.js`, fileToWrite);
    fs.writeFileSync(`src/nls/${lang}/lastTranslated.json`, JSON.stringify(newTranslations, null, 2));
}

let unsupportedLanguages = ['nb', 'gl'];

async function translate() {
    console.log("please make sure that AWS/Google credentials are available as env vars.");
    return new Promise(async (resolve)=>{
        let langs = _getAllNLSFolders();
        console.log(langs);
        for(let lang of langs){
            if(!unsupportedLanguages.includes(lang)){
                _processLang(lang);
            }
        }
        resolve();
    });
}

exports.translate = translate;
