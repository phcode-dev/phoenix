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
const fs = require('fs');
const CORE_AI_TRANSLATE_API_KEY = process.env.CORE_AI_TRANSLATE_API_KEY;

// A global accumulator object initialized to zero
const globalUtilizationMetrics = {
    tokens: {
        prompt: 0,
        candidates: 0,
        cachedContent: 0,
        total: 0
    },
    characters: {
        input: 0,
        output: 0
    },
    costs: {
        input: 0,
        output: 0,
        total: 0,
        currency: "USD"// or set once, if you always expect the same currency
    }
};

/**
 * Aggregate the utilization metrics from a single object into a global accumulator.
 * @param {object} obj - An object with `utilizationMetrics` (tokens, characters, costs).
 * @returns {object} The updated global utilization metrics.
 */
function aggregateUtilizationMetrics(obj) {
    if (!obj || !obj.utilizationMetrics) {
        console.warn("Object missing 'utilizationMetrics' field, nothing to aggregate.");
        return globalUtilizationMetrics;
    }

    const { tokens, characters, costs } = obj.utilizationMetrics;

    // Safely add tokens
    if (tokens) {
        globalUtilizationMetrics.tokens.prompt += tokens.prompt || 0;
        globalUtilizationMetrics.tokens.candidates += tokens.candidates || 0;
        globalUtilizationMetrics.tokens.cachedContent += tokens.cachedContent || 0;
        globalUtilizationMetrics.tokens.total += tokens.total || 0;
    }

    // Safely add characters
    if (characters) {
        globalUtilizationMetrics.characters.input += characters.input || 0;
        globalUtilizationMetrics.characters.output += characters.output || 0;
    }

    // Safely add costs
    if (costs) {
        globalUtilizationMetrics.costs.input += costs.input || 0;
        globalUtilizationMetrics.costs.output += costs.output || 0;
        globalUtilizationMetrics.costs.total += costs.total || 0;
        // currency is assumed to remain consistent; you could also check or update it if needed
    }

    return globalUtilizationMetrics;
}

const translationContext =
`This is a bunch of strings extracted from a JavaScript file used to develop our product with is a text editor.
Some strings may have HTML or templates(mustache library used).
The brand name “Phoenix Pro” must remain in English and should never be translated. 
Please translate these strings accurately.
`;

function getTranslationrequest(stringsToTranslate, lang) {
    return {
        translationContext: translationContext,
        "source": stringsToTranslate,
        "provider": "vertex",
        "sourceContext": {
            // this is currently unused. you can provide context specific to the key in the source to give the AI
            // additional context about the key for translation.
        },
        translationTargets: [lang] // multiple langs can be given here to translate at a time, for now using only one
    };
}

/**
 * Sends translation payload to the specified API and returns the result.
 *
 * @param {object} apiInput - The translation payload object.
 * @returns {Promise<any>} The JSON-parsed response from the API.
 */
async function getTranslation(apiInput) {
    const url = "https://translate.core.ai/translate";
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "authorization": `Basic ${CORE_AI_TRANSLATE_API_KEY}`
            },
            body: JSON.stringify(apiInput)
        });

        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
        }

        // Parse and return the JSON response
        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Error translating:", error);
        throw error;
    }
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

let requireDefinedStrings;
global.define = function (jsonObj) {
    requireDefinedStrings = jsonObj;
};
require("../src/nls/root/strings");
let rootStrings = requireDefinedStrings;

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

async function coreAiTranslate(stringsToTranslate, lang) {
    if(!Object.keys(stringsToTranslate).length){
        return {};
    }
    const translationRequest = getTranslationrequest(stringsToTranslate, lang);
    const translations = await getTranslation(translationRequest);
    aggregateUtilizationMetrics(translations);
    console.log("Translation output:  ", JSON.stringify(translations, null, 4));
    console.log("Aggregate utilization metrics: ", JSON.stringify(globalUtilizationMetrics, null, 4));
    if(translations.failedLanguages.length){
        const errorStr = `Error translating ${lang}. it has failures `;
        console.error(errorStr);
        fs.writeFileSync(`src/nls/errors.txt`, errorStr);
        // this is oke to continue in case of partial translations.
    }
    let translationForLanguage = translations.translations[lang];
    if(!translationForLanguage) {
        lang = lang.replaceAll("-", "_"); // pt_br and pt-br are same. maybe check output for the same
        translationForLanguage = translations.translations[lang];
    }
    if(!translationForLanguage){
        const errorStr = `Error translating. AI response doesnt have the language ${lang} translated!`;
        console.error(errorStr);
        fs.writeFileSync(`src/nls/errors.txt`, errorStr);
        return {};
    }
    return translationForLanguage;
}

function shallowEqual(obj1, obj2) {
    // Check if both have the same number of keys:
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    if (keys1.length !== keys2.length) {
        return false;
    }

    // Check if all corresponding values match:
    for (const key of keys1) {
        if (obj1[key] !== obj2[key]) {
            return false;
        }
    }

    return true;
}

/**
 * Returns a new object whose keys are sorted in ascending order.
 *
 * @param {Object} obj - The object to sort by keys.
 * @returns {Object} sortedObj - A new object with sorted keys.
 */
function getSortedObject(obj) {
    const sortedObj = {};
    // Gather all keys, sort them, then build the new object in that order
    const sortedKeys = Object.keys(obj).sort();
    for (const key of sortedKeys) {
        sortedObj[key] = obj[key];
    }
    return sortedObj;
}

/**
 * Auto translations scans the following files to determine which strings have changed and needs to be translated:
 * 1. nls/<lang>/lastTranslated.json holds the last root english strings that was automatically translated. This will be
 * used to compare with the current `root/strings.js`. We can determine which strings have changed from the last locale
 * translation done and translate only those changed strings.
 * 2. `expertTranslations.json` is a dictionary from english string to locale string that can be used to provide manual
 * expert translations. When translating, we will check for an available translation in the expert translation json
 * before calling google/aws translate. This file is also auto updated when someone provides a translation override
 * in a specific locale.
 *
 * ## How we translate
 * First we deduce if there are any manual translations done in `<locale>/strings.js` as users can explicitly provide
 * translations like these: https://github.com/phcode-dev/phoenix/pull/588 .
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
    const expertTranslations = _getJson(`src/nls/${lang}/expertTranslations.json`, 'utf8');
    let lastTranslated = _getJson(`src/nls/${lang}/lastTranslated.json`, 'utf8');
    require(`../src/nls/${lang}/strings`);
    let localeStringsJS = requireDefinedStrings;
    let translations = {}, updatedLastTranslatedJSON={}, pendingTranslate = {};
    for(let rootKey of Object.keys(rootStrings)){
        if(!_isTranslatableKey(rootKey)){
            continue; // move on to next string
        }
        let englishStringToTranslate = rootStrings[rootKey];
        let lastTranslatedEnglishString = lastTranslated[rootKey];
        if(englishStringToTranslate === lastTranslatedEnglishString){
            // we have already translated this in the last pass.
            // Load expert translation if there is one else we don't need to translate, use existing translation as is.
            translations[rootKey] = expertTranslations[englishStringToTranslate] || localeStringsJS[rootKey];
            if(translations[rootKey]){
                updatedLastTranslatedJSON[rootKey] = englishStringToTranslate;
            } else {
                // we dont have a last local translation in locale strings.js file to use. this cannot happen
                // except in a translation reset pass where we delete all translations and restart like when we moved
                // to core.ai auto translate.
                pendingTranslate[rootKey] = englishStringToTranslate;
            }
        } else {
            // this is a new english string or there is a string change.
            if(expertTranslations[englishStringToTranslate]){
                // prefer expert translations over machine translations
                translations[rootKey] = expertTranslations[englishStringToTranslate];
                updatedLastTranslatedJSON[rootKey] = englishStringToTranslate;
            } else {
                pendingTranslate[rootKey] = englishStringToTranslate;
            }
        }
    }
    //let translatedText = await _translateString(englishStringToTranslate, lang);
    console.log(`Translating ${Object.keys(pendingTranslate).length} strings to`, lang);
    const aiTranslations = await coreAiTranslate(pendingTranslate, lang);
    const allRootKeys = new Set(Object.keys(rootStrings));
    for(let rootKey of Object.keys(pendingTranslate)){
        if(!allRootKeys.has(rootKey)){
            // AI hallucinated a root key?
            const errorStr = `AI translated for a root key that doesnt exist!!! in ${lang}: ${rootKey} \nTranslation: ${aiTranslations[rootKey]}`;
            console.error(errorStr);
            fs.writeFileSync(`src/nls/errors.txt`, errorStr);
            continue;
        }
        let englishStringToTranslate = rootStrings[rootKey];
        const translatedText = aiTranslations[rootKey];
        if(translatedText){
            translations[rootKey] = translatedText;
            updatedLastTranslatedJSON[rootKey] = englishStringToTranslate;
        }
    }
    // now detect any keys that has not yet been translated
    const allKeys = Object.keys(rootStrings).filter(_isTranslatableKey);
    const translatedKeys = Object.keys(translations);
    const notTranslated = allKeys.filter(key => !translatedKeys.includes(key));
    if(notTranslated.length){
        const errorStr = `Some strings not translated in ${lang}\n${notTranslated}`;
        console.error(errorStr);
        fs.writeFileSync(`src/nls/errors.txt`, errorStr);
    }

    let translatedStringsJSON = JSON.stringify(translations, null, 2);
    let fileToWrite = `${FILE_HEADER}${translatedStringsJSON}${FILE_FOOTER}`;
    if(!shallowEqual(translations, localeStringsJS)){
        fs.writeFileSync(`src/nls/${lang}/strings.js`, fileToWrite);
    }
    if(!shallowEqual(updatedLastTranslatedJSON, lastTranslated)){
        const sortedList = getSortedObject(updatedLastTranslatedJSON);
        fs.writeFileSync(`src/nls/${lang}/lastTranslated.json`, JSON.stringify(sortedList, null, 2));
    }
}

async function translate() {
    console.log("please make sure that core.ai lang translation service credentials are available as env vars.");
    return new Promise(async (resolve)=>{
        let langs = _getAllNLSFolders();
        console.log(langs);
        for(let lang of langs){
            await _processLang(lang);
        }
        resolve();
    });
}

exports.translate = translate;
