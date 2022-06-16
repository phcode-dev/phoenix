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
console.log("loaded root strings: ", rootStrings);

function _processLang(lang) {
    require(`../src/nls/${lang}/strings`);
    let ignore =['ABOUT_TEXT_LINE1','ABOUT_TEXT_BUILD_TIMESTAMP', 'ABOUT_TEXT_LINE3', 'ABOUT_TEXT_LINE4',
        'ABOUT_TEXT_LINE5', 'ABOUT_TEXT_LINE6'];
    let langJson = definedStrings;
    let langMap ={};
    for(let rootKey of Object.keys(rootStrings)){
        let englishString = rootStrings[rootKey];
        if(langJson[rootKey] && !ignore.includes(rootKey)){
            let foreignString = langJson[rootKey];
            langMap[englishString] = foreignString;
        }
    }
    fs.writeFileSync(`src/nls/${lang}/expertTranslations.json`, JSON.stringify(langMap, null, 2));
}

let langs = _getAllNLSFolders();
console.log(langs);
for(let lang of langs){
    _processLang(lang);
}

async function translate() {
    return new Promise(async (resolve, reject)=>{
        let translation = await _translateStringWithAWS("Replace with\u2026", "en", "pt");
        console.log(translation);
        resolve();
    });
}

exports.translate = translate;
