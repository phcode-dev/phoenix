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

const del = require('del');
const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const webserver = require('gulp-webserver');
const { src, dest, series } = require('gulp');
// removed require('merge-stream') node module. it gives wired glob behavior and some files goes missing
const zip = require('gulp-zip');
const Translate = require("./translateStrings");
const copyThirdPartyLibs = require("./thirdparty-lib-copy");
const minify = require('gulp-minify');
const glob = require("glob");
const sourcemaps = require('gulp-sourcemaps');
const crypto = require("crypto");
const rename = require("gulp-rename");
const execSync = require('child_process').execSync;

function cleanDist() {
    return del(['dist', 'dist-test']);
}

const RELEASE_BUILD_ARTEFACTS = [
    'src/brackets-min.js',
    'src/styles/brackets-all.css',
    'src/styles/brackets-all.css.map'
];
function _cleanReleaseBuildArtefactsInSrc() {
    return del(RELEASE_BUILD_ARTEFACTS);
}

function cleanAll() {
    return del([
        'node_modules',
        'dist',
        // Test artifacts
        'dist-test',
        'test/spec/test_folders.zip',
        ...RELEASE_BUILD_ARTEFACTS
    ]);
}

function cleanUnwantedFilesInDist() {
    return del([
        'dist/nls/*/expertTranslations.json',
        'dist/nls/*/lastTranslated.json',
        'dist/nls/*/*.js.map',
        'dist/extensions/default/*/unittests.js.map'
    ]);
}

/**
 * TODO: Release scripts to merge and min src js/css/html resources into dist.
 * Links that might help:
 * for less compilation:
 * https://stackoverflow.com/questions/27627936/compiling-less-using-gulp-useref-and-gulp-less
 * https://www.npmjs.com/package/gulp-less
 * Minify multiple files into 1:
 * https://stackoverflow.com/questions/26719884/gulp-minify-multiple-js-files-to-one
 * https://stackoverflow.com/questions/53353266/minify-and-combine-all-js-files-from-an-html-file
 * @returns {*}
 */
function makeDistAll() {
    return src(['src/**/*', 'src/.*/*.*'])
        .pipe(dest('dist'));
}

function makeJSDist() {
    return src(['src/**/*.js', '!src/**/unittest-files/**/*', "!src/thirdparty/prettier/**/*",
        "!src/thirdparty/no-minify/**/*"])
        .pipe(sourcemaps.init())
        .pipe(minify({
            ext:{
                min:'.js'
            },
            noSource: true,
            mangle: false,
            compress: {
                unused: false
            }
        }))
        .pipe(sourcemaps.write('./'))
        .pipe(dest('dist'));
}

// we had to do this as prettier is non minifiable
function makeJSPrettierDist() {
    return src(["src/thirdparty/prettier/**/*"])
        .pipe(sourcemaps.init())
        .pipe(dest('dist/thirdparty/prettier'));
}

function makeNonMinifyDist() {
    return src(["src/thirdparty/no-minify/**/*"])
        .pipe(sourcemaps.init())
        .pipe(dest('dist/thirdparty/no-minify'));
}

function makeDistNonJS() {
    return src(['src/**/*', 'src/.*/*.*', '!src/**/*.js'])
        .pipe(dest('dist'));
}

function makeDistWebCache() {
    return new Promise((resolve)=> {
        fs.rmSync("./dist/web-cache", {recursive: true, force: true});
        fs.rmSync("./dist-web-cache", {recursive: true, force: true});
        fs.cpSync("./dist", "./dist-web-cache", {
            recursive: true,
            force: true
        });
        let config = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
        fs.mkdirSync("./dist/web-cache");
        fs.renameSync("./dist-web-cache", `./dist/web-cache/${config.apiVersion}`);
        resolve();
    });
}

function serve() {
    return src('.')
        .pipe(webserver({
            livereload: false,
            directoryListing: true,
            open: true
        }));
}

function serveExternal() {
    return src('.')
        .pipe(webserver({
            host: '0.0.0.0',
            livereload: false,
            directoryListing: true,
            open: true
        }));
}

function zipTestFiles() {
    return src([
        'test/**',
        'test/**/.*',
        '!test/thirdparty/**',
        '!test/test_folders.zip'])
        .pipe(zip('test_folders.zip'))
        .pipe(dest('test/'));
}

function zipDefaultProjectFiles() {
    return src(['src/assets/default-project/en/**'])
        .pipe(zip('en.zip'))
        .pipe(dest('src/assets/default-project/'));
}

// sample projects
function zipSampleProjectBootstrapBlog() {
    return src(['src/assets/sample-projects/bootstrap-blog/**'])
        .pipe(zip('bootstrap-blog.zip'))
        .pipe(dest('src/assets/sample-projects/'));
}
function zipSampleProjectExplore() {
    return src(['src/assets/sample-projects/explore/**'])
        .pipe(zip('explore.zip'))
        .pipe(dest('src/assets/sample-projects/'));
}
function zipSampleProjectHTML5() {
    return src(['src/assets/sample-projects/HTML5/**'])
        .pipe(zip('HTML5.zip'))
        .pipe(dest('src/assets/sample-projects/'));
}
function zipSampleProjectDashboard() {
    return src(['src/assets/sample-projects/dashboard/**'])
        .pipe(zip('dashboard.zip'))
        .pipe(dest('src/assets/sample-projects/'));
}
function zipSampleProjectHomePages() {
    return src(['src/assets/sample-projects/home-pages/**'])
        .pipe(zip('home-pages.zip'))
        .pipe(dest('src/assets/sample-projects/'));
}
let zipSampleProjectFiles = series(zipSampleProjectBootstrapBlog, zipSampleProjectExplore, zipSampleProjectHTML5,
    zipSampleProjectDashboard, zipSampleProjectHomePages);

function _patchBumpConfigFile(fileName) {
    let config = JSON.parse(fs.readFileSync(fileName, 'utf8'));
    let version = config.apiVersion .split("."); // ["3","0","0"]
    version[2] = "" + (parseInt(version[2]) + 1); // ["3","0","1"]
    config.apiVersion = version.join("."); // 3.0.1
    config.version = `${config.apiVersion}-0`; // 3.0.1-0 . The final build number is always "-0" as the build number
    // is generated by release scripts only and never checked in source.
    fs.writeFileSync(fileName, JSON.stringify(config, null, 4));
}

function _minorBumpConfigFile(fileName) {
    let config = JSON.parse(fs.readFileSync(fileName, 'utf8'));
    let version = config.apiVersion .split("."); // ["3","0","5"]
    version[1] = "" + (parseInt(version[1]) + 1); // ["3","1","5"]
    version[2] = "0"; // ["3","1","0"]
    config.apiVersion = version.join("."); // 3.1.0
    config.version = `${config.apiVersion}-0`; // 3.1.0-0 . The final build number is always "-0" as the build number
    // is generated by release scripts only and never checked in source.
    fs.writeFileSync(fileName, JSON.stringify(config, null, 4));
}

function _majorVersionBumpConfigFile(fileName) {
    let config = JSON.parse(fs.readFileSync(fileName, 'utf8'));
    let version = config.apiVersion .split("."); // ["3","0","0"]
    const newMajorVersion = "" + (parseInt(version[0]) + 1); // "4"
    config.apiVersion = `${newMajorVersion}.0.0`; // 4.0.0
    config.version = `${config.apiVersion}-0`; // 4.0.0-0 . The final build number is always "-0" as the build number
    // is generated by release scripts only and never checked in source.
    fs.writeFileSync(fileName, JSON.stringify(config, null, 4));
}

// This regular expression matches the pattern
// It looks for the specific script tag and version number format
// \d+ matches one or more digits
// \. matches the dot literally
// (\.\d+)* matches zero or more occurrences of ".[digits]"
// Test the string against the regex
const PHOENIX_CACHE_VERSION_REGEX = /<script>window\.PHOENIX_APP_CACHE_VERSION="(\d+(\.\d+)*)";<\/script>/;
function containsPhoenixAppCacheVersion(str) {
    return PHOENIX_CACHE_VERSION_REGEX.test(str);
}

function _patchIndexHTML() {
    let indexHtmlPath = './src/index.html';
    let config = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
    let indexHTML = fs.readFileSync(indexHtmlPath, 'utf8');
    let version = config.apiVersion;
    const replaceStr = '<script>window.PHOENIX_APP_CACHE_VERSION="<version>";</script>';
    if(!containsPhoenixAppCacheVersion(indexHTML)){
        throw new Error("Expected index.html to include "+ replaceStr);
    }
    indexHTML = indexHTML.replace(PHOENIX_CACHE_VERSION_REGEX,
        `<script>window.PHOENIX_APP_CACHE_VERSION="${version}";</script>`);
    fs.writeFileSync(indexHtmlPath, indexHTML);
}

function patchVersionBump() {
    // adding anything here should be added to patch-version-bump.yml and yearly-major-version-bump.yml
    return new Promise((resolve)=> {
        _patchBumpConfigFile('./package.json');
        _patchBumpConfigFile('./src-node/package.json');
        _patchBumpConfigFile('./src/config.json');
        _patchIndexHTML();
        resolve();
    });
}

function minorVersionBump() {
    // adding anything here should be added to patch-version-bump.yml and yearly-major-version-bump.yml
    return new Promise((resolve)=> {
        _minorBumpConfigFile('./package.json');
        _minorBumpConfigFile('./src-node/package.json');
        _minorBumpConfigFile('./src/config.json');
        _patchIndexHTML();
        resolve();
    });
}

function majorVersionBump() {
    // adding anything here should be added to patch-version-bump.yml and yearly-major-version-bump.yml
    return new Promise((resolve)=> {
        _majorVersionBumpConfigFile('./package.json');
        _majorVersionBumpConfigFile('./src-node/package.json');
        _majorVersionBumpConfigFile('./src/config.json');
        _patchIndexHTML();
        resolve();
    });
}

function _getBuildNumber() {
    // we count the number of commits in branch. which should give a incrementing
    // build number counter if there are any changes. Provided no one does a force push deleting commits.
    return execSync('git rev-list --count HEAD').toString().trim();
}

function _compileLessSrc() {
    return new Promise((resolve)=> {
        execSync('npm run _compileLessSrc');
        resolve();
    });
}

function _getAppConfigJS(configJsonStr) {
    return "// Autogenerated by gulp scripts. Do not edit\n"+
        `window.AppConfig = ${configJsonStr};\n`;
}

function _updateConfigFile(config) {
    delete config.scripts;
    delete config.devDependencies;
    delete config.dependencies;
    delete config.dependencies;

    config.config.build_timestamp = new Date();
    let newVersionStr = config.version.split("-")[0]; // 3.0.0-0 to 3.0.0
    config.version = `${newVersionStr}-${_getBuildNumber()}`;

    console.log("using config: ", config);
    const configJsonStr = JSON.stringify(config, null, 4);
    fs.writeFileSync('dist/config.json', configJsonStr);
    fs.writeFileSync('dist/appConfig.js', _getAppConfigJS(configJsonStr));

}

function releaseDev() {
    return new Promise((resolve)=>{
        const configFile = require('../src/config.json');
        _updateConfigFile(configFile);

        resolve();
    });
}

function releaseStaging() {
    return new Promise((resolve)=>{
        const configFile = require('../src/config.json');
        const stageConfigFile = {
            config: require('../src/brackets.config.staging.json')
        };
        _updateConfigFile(_.merge(configFile, stageConfigFile));

        resolve();
    });
}

function releaseProd() {
    return new Promise((resolve)=>{
        const configFile = require('../src/config.json');
        const prodConfigFile = {
            config: require('../src/brackets.config.dist.json')
        };
        _updateConfigFile(_.merge(configFile, prodConfigFile));

        resolve();
    });
}

function translateStrings() {
    return new Promise(async (resolve)=>{ // eslint-disable-line
        await Translate.translate();
        resolve();
    });
}

function _listFilesInDir(dir) {
    return new Promise((resolve, reject)=>{
        glob(dir + '/**/*', {
            nodir: true
        }, (err, res)=>{
            if(err){
                reject(err);
                return;
            }
            resolve(res);
        });
    });
}

const ALLOWED_EXTENSIONS_TO_CACHE = ["js", "html", "htm", "xml", "xhtml", "mjs",
    "css", "less", "scss", "ttf", "woff", "woff2", "eot",
    "txt", "otf",
    "json", "config",
    "zip",
    "png", "svg", "jpg", "jpeg", "gif", "ico", "webp",
    "mustache", "md", "markdown"];
const DISALLOWED_EXTENSIONS_TO_CACHE = ["map", "nuspec", "partial", "pre", "post",
    "webmanifest", "rb", "ts"];

const EXCLUDE_PATTERNS_FROM_CACHE = [
    /src\/nls\/.*expertTranslations\.json$/,
    /src\/nls\/.*lastTranslated\.json$/,
    /extensions\/registry\/registry\.json$/
];

function _isCacheableFile(path) {
    if(path.indexOf(".") === -1){
        // no extension. dont cache
        return false;
    }
    for (const pattern of EXCLUDE_PATTERNS_FROM_CACHE) {
        if (pattern.test(path)) {
            // If the path matches any excluded pattern, do not cache
            return false;
        }
    }

    let ext = path.split(".");
    ext = ext[ext.length - 1];
    if(ALLOWED_EXTENSIONS_TO_CACHE.includes(ext.toLocaleString())){
        return true;
    }
    if(!DISALLOWED_EXTENSIONS_TO_CACHE.includes(ext.toLocaleString())){
        // please add newly found extensions either in ALLOWED_EXTENSIONS_TO_CACHE or DISALLOWED_EXTENSIONS_TO_CACHE
        // if you wound this Warning. These extensions determine which file extensions ends up in
        // browser cache for progressive web app (PWA). Be mindful that only cache what is absolutely necessary
        // as we expect to see cache size to be under 100MB MAX.
        console.warn("WARNING: Please update disallowed extensions. New extension type found: ", ext, path);
        throw new Error("WARNING: Please update file types for PWA cache in build script. New extension type found");
    }
    return false;
}

function _fixAndFilterPaths(basePath, entries) {
    let filtered = [];
    for(let entry of entries){
        if(_isCacheableFile(entry)){
            filtered.push(entry.replace(`${basePath}/`, ""));
        }
    }
    return filtered;
}

function _getFileDetails(path) {
    const data = fs.readFileSync(path,
        {encoding: null});
    return {
        sizeBytes: data.length,
        hash: crypto.createHash("sha256").update(data).digest("hex")
    };
}

function _computeCacheManifest(baseDir, filePaths) {
    let manifest = {}, fileDetails, totalSize = 0;
    let fileSizes = [];
    for(let filePath of filePaths){
        fileDetails = _getFileDetails(baseDir + "/" + filePath);
        manifest[filePath] = fileDetails.hash;
        totalSize += fileDetails.sizeBytes;
        fileSizes.push({ path: filePath, sizeBytes: fileDetails.sizeBytes });
    }

    // Sort files by size in descending order
    fileSizes.sort((a, b) => b.sizeBytes - a.sizeBytes);

    // Log file sizes in descending order. uncomment to debug large cache size
    // console.log("Files sorted by size (in bytes):");
    // for (let file of fileSizes) {
    //     console.log(`${file.path}: ${file.sizeBytes} bytes`);
    // }

    totalSize = Math.round(totalSize/1024); // KB
    console.log("Total size of cache in KB: ", totalSize);
    if(totalSize > 75000){
        throw new Error("The total size of the src or dist folder core assets exceeds 75MB." +
            "\nPlease review and trim storage. This significantly impacts the distribution size." +
            "\nEither trim down the size or increase the limit after careful review.");
    }
    return manifest;
}

function listAllJsFilesRecursively(dirPath) {
    const allFiles = [];

    // Read the contents of the directory.
    const files = fs.readdirSync(dirPath);

    // Iterate over the files.
    files.forEach(file => {
        // Get the full path to the file.
        const filePath = path.join(dirPath, file);

        // Check if the file is a directory.
        if (fs.statSync(filePath).isDirectory()) {
            // Recursively list all JS files in the directory.
            const nestedFiles = listAllJsFilesRecursively(filePath);
            allFiles.push(...nestedFiles);
        } else if (file.endsWith('.js')) {
            // Add the JS file to the array.
            allFiles.push(filePath);
        }
    });

    // Return the array of all JS files.
    return allFiles;
}

function extractRequireTextFragments(fileContent) {
    // Regular expression to match "require('text!...')" patterns with optional spaces
    const regex = /require\s*\(\s*"text!([^"]+)"\s*\)/g;

    const result = [];
    let match;

    // Loop through all matches in the fileContent
    while ((match = regex.exec(fileContent)) !== null) {
        // Add the captured fragment to the fragments array
        result.push({
            requirePath: match[1],
            requireStatement: match[0]
        });
    }

    return result;
}

function containsRegExpExcludingEmpty(str) {
    // This pattern attempts to match a RegExp literal, starting and ending with slashes,
    // containing at least one character that's not a slash or a space in between,
    // and possibly followed by RegExp flags. This excludes simple "//".
    let lines = str.split(("\n"));
    const regExpPatternEq = /=\s*\/(?!\/\^)(?:[^\/\s]|\\\/)+\/[gimuy]*/; // matched x=/reg/i
    const regExpPatternProp = /:\s*\/(?!\/\^)(?:[^\/\s]|\\\/)+\/[gimuy]*/; // matched x: /reg/i
    const regExpPatternCond = /\(\s*\/(?!\/\^)(?:[^\/\s]|\\\/)+\/[gimuy]*/; // matched if(/reg/i

    for(let line of lines) {
        if(regExpPatternEq.test(line) || regExpPatternProp.test(line) || regExpPatternCond.test(line)) {
            console.error("detected regular expression in line: ", line);
            return line;
        }
    }
    return false;
}


const textContentMap = {};
function inlineTextRequire(file, content, srcDir) {
    if(content.includes(`'text!`) || content.includes("`text!")) {
        throw new Error(`in file ${file} require("text!...") should always use a double quote "text! instead of " or \``);
    }
    if(content.includes(`"text!`)) {
        const requireFragments = extractRequireTextFragments(content);
        for (const {requirePath, requireStatement} of requireFragments) {
            let textContent = textContentMap[requirePath];
            if(!textContent){
                let filePath = srcDir + requirePath;
                if(requirePath.startsWith("./")) {
                    filePath = path.join(path.dirname(file), requirePath);
                }
                console.log("reading file at path: ", filePath);
                const fileContent = fs.readFileSync(filePath, "utf8");
                textContentMap[requirePath] = fileContent;
                textContent = fileContent;
            }
            if(textContent.includes("`")) {
                console.log("Not inlining file as it contains a backquote(`) :", requirePath);
            } else if(requirePath.endsWith(".js") || requirePath.endsWith(".json")) {
                console.log("Not inlining JS/JSON file:", requirePath);
            } else {
                console.log("Inlining", requireStatement);
                if((requireStatement.includes(".html") || requireStatement.includes(".js"))
                    && containsRegExpExcludingEmpty(textContent)){
                    console.log(textContent);
                    const detectedRegEx = containsRegExpExcludingEmpty(textContent);
                    throw `Error inlining ${requireStatement} in ${file}: Regex: ${detectedRegEx}`+
                    "\nRegular expression of the form /*/ is not allowed for minification please use RegEx constructor";
                }
                content = content.replaceAll(requireStatement, "`"+textContent+"`");
            }
        }

    }
    return content;
}

function makeBracketsConcatJS() {
    return new Promise((resolve)=>{
        const srcDir = "src/";
        const DO_NOT_CONCATENATE = [
            `${srcDir}preferences/PreferencesImpl.js` // tests does require magic on prefs, so exclude
        ];
        const pathsToMerge = [];
        const PathsToIgnore = ["assets", "thirdparty", "extensions"];
        for(let dir of fs.readdirSync(srcDir, {withFileTypes: true})){
            if(dir.isDirectory() && !PathsToIgnore.includes(dir.name)){
                pathsToMerge.push(dir.name);
            }
        }
        console.log("Processing the following dirs for brackets-min.js", pathsToMerge);
        let concatenatedFile = fs.readFileSync(`${srcDir}brackets.js`, "utf8");
        let mergeCount = 0;
        const notConcatenatedJS = [];
        for(let mergePath of pathsToMerge){
            let files = listAllJsFilesRecursively(`${srcDir}${mergePath}`);
            for(let file of files){
                file = file.replaceAll("\\", "/"); // windows style paths to webby paths
                let requirePath = file.replace(srcDir, "").replace(".js", "");
                let content = fs.readFileSync(file, "utf8");
                const count = content.split("define(").length - 1;
                if(count === 0 || DO_NOT_CONCATENATE.includes(file)) {
                    notConcatenatedJS.push(file);
                    continue;
                }
                if(count !== 1){
                    throw new Error("multiple define statements detected in file!!!" + file);
                }
                console.log("Merging: ", requirePath);
                mergeCount ++;
                content = content.replace("define(", `define("${requirePath}", `);
                content = inlineTextRequire(file, content, srcDir);
                concatenatedFile = concatenatedFile + "\n" + content;
            }
        }
        console.log("Not concatenated: ", notConcatenatedJS);
        console.log(`Merged ${mergeCount} files into ${srcDir}brackets-min.js`);
        fs.writeFileSync(`${srcDir}brackets-min.js`, concatenatedFile);
        resolve();
    });
}

function _renameBracketsConcatAsBracketsJSInDist() {
    return new Promise((resolve)=>{
        fs.unlinkSync("dist/brackets.js");
        fs.copyFileSync("dist/brackets-min.js", "dist/brackets.js");
        fs.copyFileSync("dist/brackets-min.js.map", "dist/brackets.js.map");
        // cleanup minifed files
        fs.unlinkSync("dist/brackets-min.js");
        fs.unlinkSync("dist/brackets-min.js.map");
        resolve();
    });
}

/**
 * This function concatenates all JS files inside a single extension folder,
 * rewriting its define() calls to include the correct AMD module name,
 * and inlining `require("text!...")` contents where possible.
 *
 * @param {string} extensionName - e.g. 'ext_name' for src/extensions/default/ext_name
 * @returns {Promise<void>}
 */
function makeExtensionConcatJS(extensionName) {
    return new Promise((resolve, reject) => {
        try {
            const srcDir = 'src/extensions/default/';
            const extensionDir = `src/extensions/default/${extensionName}/`;
            const extensionMinFile = path.join(extensionDir, 'extension-min.js');
            console.log("Concatenating extension: ", extensionDir);

            if (fs.existsSync(extensionMinFile)) {
                fs.unlinkSync(extensionMinFile);
            }
            // For example, we can store the final concatenated content here:
            // We start by reading the "main.js" for the extension.
            // You could also do something else if you want an empty string or an existing extension "entry" file.
            let concatenatedFile = fs.readFileSync(
                path.join(extensionDir, 'main.js'),
                'utf8'
            );

            // Let's gather all .js files
            // (We are reusing your existing listAllJsFilesRecursively logic).
            const files = listAllJsFilesRecursively(extensionDir);

            let mergeCount = 0;

            // Optional: track any files you don't want to merge
            const DO_NOT_CONCATENATE = [
                // put full paths here if you have any special exceptions
            ];
            const notConcatenatedJS = [];

            for (let file of files) {
                file = file.replaceAll('\\', '/'); // Windows path fix to web-like
                console.log("the replace: ", file, extensionDir, srcDir);
                const relPath = file.replace(extensionDir, ''); // e.g. ext_name/someFile.js

                // Skip the extension’s main.js because we already loaded it at the top
                if (file.endsWith('main.js') || file.endsWith("unittests.js")) {
                    continue;
                }

                if (DO_NOT_CONCATENATE.includes(file)) {
                    notConcatenatedJS.push(file);
                    continue;
                }

                let content = fs.readFileSync(file, 'utf8');

                // Check for the number of `define(` calls.
                const defineCount = content.split('define(').length - 1;
                // If no define calls, we choose to skip for AMD concatenation
                if (defineCount === 0) {
                    notConcatenatedJS.push(file);
                    continue;
                }
                if (defineCount !== 1) {
                    throw new Error(
                        `Multiple define statements detected in extension file: ${file}`
                    );
                }

                // Insert the AMD module name: define("ext_name/someFile", [deps], function(...){...});
                // remove .js extension for the define ID
                const defineId = relPath.replace('.js', '');
                // Replace first occurrence of define( with define("<the-id>",
                content = content.replace(
                    'define(',
                    `define("${defineId}", `
                );

                // inline text requires
                content = inlineTextRequire(file, content, extensionDir);

                concatenatedFile += '\n' + content;
                mergeCount++;
            }

            console.log(
                `Concatenated ${mergeCount} files into extension-min.js for extension: ${extensionName}`
            );
            console.log('Skipped these JS files:', notConcatenatedJS);

            // Finally, write to src/extensions/ext_name/extension-min.js
            fs.writeFileSync(extensionMinFile, concatenatedFile);

            resolve();
        } catch (err) {
            console.error(err);
            reject(err);
        }
    });
}

/**
 * Similar to _renameBracketsConcatAsBracketsJSInDist,
 * but this one handles each extension’s final output in dist.
 *
 * @param {string} extensionName - e.g. 'ext_name'
 * @returns {Promise<void>}
 */
function _renameExtensionConcatAsExtensionJSInDist(extensionName) {
    return new Promise((resolve, reject) => {
        try {
            const srcExtensionDir = `src/extensions/default/${extensionName}/`;
            const srcExtensionConcatFile = path.join(srcExtensionDir, 'extension-min.js');
            const distExtensionDir = path.join('dist/extensions/default', extensionName);
            const extMinFile = path.join(distExtensionDir, 'main.js');
            const extMinFileMap = path.join(distExtensionDir, 'main.js.map');
            const extSrcFile = path.join(distExtensionDir, 'extension-min.js');
            const extSrcFileMap = path.join(distExtensionDir, 'extension-min.js.map');

            // Make sure extension-min.js exists in dist.
            if (!fs.existsSync(extSrcFile)) {
                return reject(
                    new Error(
                        `No extension-min.js found for ${extensionName} in ${extSrcFile}.`
                    )
                );
            }

            if (fs.existsSync(srcExtensionConcatFile)) {
                fs.unlinkSync(srcExtensionConcatFile);
            }
            if (fs.existsSync(extMinFile)) {
                fs.unlinkSync(extMinFile);
            }
            fs.copyFileSync(extSrcFile, extMinFile);

            if (fs.existsSync(extMinFileMap)) {
                fs.unlinkSync(extMinFileMap);
            }
            if (fs.existsSync(extSrcFileMap)) {
                fs.copyFileSync(extSrcFileMap, extMinFileMap);
            }

            fs.unlinkSync(extSrcFile);
            if (fs.existsSync(extSrcFileMap)) {
                fs.unlinkSync(extSrcFileMap);
            }

            resolve();
        } catch (err) {
            reject(err);
        }
    });
}

const minifyableExtensions = ["CloseOthers", "CodeFolding", "DebugCommands", "Git",
    "HealthData", "JavaScriptCodeHints", "JavaScriptRefactoring", "QuickView"];
// extensions that nned not be minified either coz they are single file extensions or some other reason.
const nonMinifyExtensions = ["ClaudeCodeBridge", "CSSAtRuleCodeHints", "CSSCodeHints",
    "CSSPseudoSelectorHints", "DarkTheme", "HandlebarsSupport", "HTMLCodeHints", "HtmlEntityCodeHints",
    "InlineColorEditor", "InlineTimingFunctionEditor", "JavaScriptQuickEdit", "JSLint",
    "LightTheme", "MDNDocs", "Phoenix-prettier", "PrefsCodeHints", "SVGCodeHints", "UrlCodeHints"
];
async function makeConcatExtensions() {
    let content = JSON.parse(fs.readFileSync(`src/extensions/default/DefaultExtensions.json`,
        "utf8"));
    const allExtensions = [...content.defaultExtensionsList, ...content.desktopOnly];

    // 3) Validate no unknown extensions are present
    const knownExtensions = [
        ...minifyableExtensions,
        ...nonMinifyExtensions
    ];

    const unknownExtensions = allExtensions.filter(
        (ext) => !knownExtensions.includes(ext)
    );

    if (unknownExtensions.length > 0) {
        throw new Error(
            `New extension(s) detected: ${unknownExtensions.join(", ")}. ` +
            `Please add them to either minifyableExtensions or ` +
            `nonMinifyExtensions array.`
        );
    }

    // 4) Run concatenation for all concat-enabled extensions
    for (const extension of minifyableExtensions) {
        await makeExtensionConcatJS(extension);
    }

    console.log("All extensions concatenated and minified!");
}

async function _renameConcatExtensionsinDist() {
    for (const extension of minifyableExtensions) {
        await _renameExtensionConcatAsExtensionJSInDist(extension);
    }
}

function createCacheManifest(srcFolder) {
    return new Promise((resolve, reject)=>{
        _listFilesInDir(srcFolder).then((files)=>{
            files = _fixAndFilterPaths(srcFolder, files);
            console.log("Files in cache: ", files.length);
            let cache = _computeCacheManifest(srcFolder, files);
            fs.writeFileSync(srcFolder + "/cacheManifest.json", JSON.stringify(cache, null, 2));
            resolve();
        }).catch(reject);
    });
}

function createSrcCacheManifest() {
    return createCacheManifest("src");
}

function createDistCacheManifest() {
    return createCacheManifest("dist");
}

function copyDistToDistTestFolder() {
    return src('dist/**/*')
        .pipe(dest('dist-test/src'));
}

function copyTestToDistTestFolder() {
    return src('test/**/*')
        .pipe(dest('dist-test/test'));
}

function copyIndexToDistTestFolder() {
    return src('test/index-dist-test.html')
        .pipe(rename("index.html"))
        .pipe(dest('dist-test'));
}

function makeLoggerConfig() {
    return new Promise((resolve)=>{
        const configJsonStr = JSON.stringify(require('../src/config.json'), null, 4);
        fs.writeFileSync('src/appConfig.js', _getAppConfigJS(configJsonStr));
        resolve();
    });
}

function validatePackageVersions() {
    return new Promise((resolve, reject)=>{
        const mainPackageJson = require("../package.json", "utf8");
        const nodePackageJson = require("../src-node/package.json", "utf8");
        if(nodePackageJson.devDependencies){
            reject("Node package json file(src-node/package.json) should not have any dev dependencies!");
            return;
        }
        const mainDevDeps = mainPackageJson.devDependencies,
            mainDeps = mainPackageJson.dependencies,
            nodeDeps = nodePackageJson.dependencies;

        // Create a merged list of all package names
        const allPackages = new Set([
            ...Object.keys(mainDevDeps || {}),
            ...Object.keys(mainDeps || {}),
            ...Object.keys(nodeDeps || {})
        ]);

        let hasMismatch = false;
        for (let packageName of allPackages) {
            const mainDevVersion = mainDevDeps && mainDevDeps[packageName];
            const mainVersion = mainDeps && mainDeps[packageName];
            const nodeVersion = nodeDeps && nodeDeps[packageName];

            if (mainDevVersion && mainVersion && mainDevVersion !== mainVersion) {
                console.error(`Version mismatch for package ${packageName}: ${mainDevVersion} (package.json devDependencies) vs ${mainVersion} (package.json dependencies)`);
                hasMismatch = true;
            }

            if (mainDevVersion && nodeVersion && mainDevVersion !== nodeVersion) {
                console.error(`Version mismatch for package ${packageName}: ${mainDevVersion} (package.json devDependencies) vs ${nodeVersion} (src-node/package.json dependencies)`);
                hasMismatch = true;
            }

            if (mainVersion && nodeVersion && mainVersion !== nodeVersion) {
                console.error(`Version mismatch for package ${packageName}: ${mainVersion} (package.json dependencies) vs ${nodeVersion} (src-node/package.json dependencies)`);
                hasMismatch = true;
            }
        }

        if (hasMismatch) {
            reject("Package version mismatch detected. Check the errors above.");
        } else {
            resolve();
        }
    });
}

function _patchMinifiedCSSInDistIndex() {
    return new Promise((resolve)=>{
        let content = fs.readFileSync("dist/index.html", "utf8");
        if(!content.includes(`<link rel="stylesheet/less" type="text/css" href="styles/brackets.less">`)){
            throw new Error(`Could not locate string <link rel="stylesheet/less" type="text/css" href="styles/brackets.less"> in file dist/index.html`)
        }
        content = content.replace(
            `<link rel="stylesheet/less" type="text/css" href="styles/brackets.less">`,
            `<link rel="stylesheet" type="text/css" href="styles/brackets-all.css">`);
        fs.writeFileSync("dist/index.html", content, "utf8");
        resolve();
    });
}

const createDistTest = series(copyDistToDistTestFolder, copyTestToDistTestFolder, copyIndexToDistTestFolder);

exports.build = series(copyThirdPartyLibs.copyAll, makeLoggerConfig, zipDefaultProjectFiles, zipSampleProjectFiles,
    makeBracketsConcatJS, _compileLessSrc, _cleanReleaseBuildArtefactsInSrc, // these are here only as sanity check so as to catch release build minify fails not too late
    createSrcCacheManifest, validatePackageVersions);
exports.buildDebug = series(copyThirdPartyLibs.copyAllDebug, makeLoggerConfig, zipDefaultProjectFiles,
    makeBracketsConcatJS, _compileLessSrc, _cleanReleaseBuildArtefactsInSrc, // these are here only as sanity check so as to catch release build minify fails not too late
    zipSampleProjectFiles, createSrcCacheManifest);
exports.clean = series(cleanDist);
exports.reset = series(cleanAll);

exports.releaseDev = series(cleanDist, exports.buildDebug, makeBracketsConcatJS, makeConcatExtensions, _compileLessSrc,
    makeDistAll, cleanUnwantedFilesInDist, releaseDev, _renameConcatExtensionsinDist,
    createDistCacheManifest, createDistTest, _cleanReleaseBuildArtefactsInSrc);
exports.releaseStaging = series(cleanDist, exports.build, makeBracketsConcatJS, makeConcatExtensions, _compileLessSrc,
    makeDistNonJS, makeJSDist, makeJSPrettierDist, makeNonMinifyDist, cleanUnwantedFilesInDist,
    _renameBracketsConcatAsBracketsJSInDist, _renameConcatExtensionsinDist, _patchMinifiedCSSInDistIndex, releaseStaging,
    createDistCacheManifest, createDistTest, _cleanReleaseBuildArtefactsInSrc);
exports.releaseProd = series(cleanDist, exports.build, makeBracketsConcatJS, makeConcatExtensions, _compileLessSrc,
    makeDistNonJS, makeJSDist, makeJSPrettierDist, makeNonMinifyDist, cleanUnwantedFilesInDist,
    _renameBracketsConcatAsBracketsJSInDist, _renameConcatExtensionsinDist, _patchMinifiedCSSInDistIndex, releaseProd,
    createDistCacheManifest, createDistTest, _cleanReleaseBuildArtefactsInSrc);
exports.releaseWebCache = series(makeDistWebCache);
exports.serve = series(exports.build, serve);
exports.zipTestFiles = series(zipTestFiles);
exports.serveExternal = series(exports.build, serveExternal);
exports.serveExternal = series(exports.build, serveExternal);
exports.translateStrings = series(translateStrings);
exports.default = series(exports.build);
exports.patchVersionBump = series(patchVersionBump);
exports.minorVersionBump = series(minorVersionBump);
exports.majorVersionBump = series(majorVersionBump);
