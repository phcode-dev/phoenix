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

/**
 * If there are any manual translations done in `<locale>/strings.js`, pass it on as existingTranslations.
 * Users can explicitly provide translations like these: https://github.com/phcode-dev/phoenix/pull/588 .
 * @param lang
 * @param existingTranslations
 * @private
 */
function _updateExpertTranslationsDict(lang, existingTranslations, lastTranslated) {
    let expertTranslations = _getJson(`src/nls/${lang}/expertTranslations.json`, 'utf8');
    let lastTranslatedLocale = _getJson(`src/nls/${lang}/lastTranslatedLocale.json`, 'utf8');
    let expertTranslationsUpdated = false;
    for(let rootKey of Object.keys(existingTranslations)){
        if(existingTranslations[rootKey] !== lastTranslatedLocale[rootKey]){
            let englishString = lastTranslated[rootKey];
            let userProvidedExpertTranslation = existingTranslations[rootKey];
            expertTranslations[englishString] = userProvidedExpertTranslation;
            expertTranslationsUpdated = true;
        }
    }
    if(expertTranslationsUpdated){
        fs.writeFileSync(
            `src/nls/${lang}/expertTranslations.json`, JSON.stringify(expertTranslations, null, 2));
    }
    return expertTranslations;
}

/**
 * Auto translations scans the following files to determine which strings have changed and needs to be translated:
 * 1. nls/<lang>/lastTranslated.json holds the last root english strings that was automatically translated. This will be
 * used to compare with the current `root/strings.js`. We can determine which strings have changed from the last locale
 * translation done and translate only those changed strings.
 * 2. nls/<lang>/lastTranslatedLocale.json same as `lastTranslated.json` but holds the locale translations instead of
 * english. Holds the last locale strings that was automatically translated.
 * 3. `expertTranslations.json` is a dictionary from english string to locale string that can be used to provide manual
 * expert translations. When translating, we will check for an available translation in the expert translation json
 * before calling google/aws translate. This file is also auto updated when someone provides a translation override
 * in a specific locale.
 *
 * ## How we translate
 * First we deduce if there are any manual translations done in `<locale>/strings.js` as users can explicitly provide
 * translations like these: https://github.com/phcode-dev/phoenix/pull/588 . We check the `<lang>/strings.js` with
 * `<lang>/lastTranslatedLocale.json` to determine translation overrides and update the `expertTranslations.json`
 * dictionary with the overrides.
 *
 * Then, we figure out the changed strings that needs translation by comparing `root/strings.js` with
 * `<lang>/lastTranslated.json`. Then we translate with aws/google translate.
 *
 * Finally, we update all the autogenerated translations to disk.
 *
 * @param lang
 * @return {Promise<void>}
 * @private
 */
async function _processLang(lang) {
    if(lang === 'root'){
        return;
    }
    let lastTranslated = _getJson(`src/nls/${lang}/lastTranslated.json`, 'utf8');
    require(`../src/nls/${lang}/strings`);
    let existingTranslations = definedStrings;
    let expertTranslations = _updateExpertTranslationsDict(lang, existingTranslations, lastTranslated);
    let translations = {}, newTranslationsInRoot={};
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
        newTranslationsInRoot[rootKey] = englishStringToTranslate;
    }
    let translatedStringsJSON = JSON.stringify(translations, null, 2);
    let fileToWrite = `${FILE_HEADER}${translatedStringsJSON}${FILE_FOOTER}`;
    fs.writeFileSync(`src/nls/${lang}/strings.js`, fileToWrite);
    fs.writeFileSync(`src/nls/${lang}/lastTranslated.json`, JSON.stringify(newTranslationsInRoot, null, 2));
    fs.writeFileSync(`src/nls/${lang}/lastTranslatedLocale.json`, JSON.stringify(translations, null, 2));
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
