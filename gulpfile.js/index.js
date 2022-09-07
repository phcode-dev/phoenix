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
const webserver = require('gulp-webserver');
const { src, dest, series } = require('gulp');
// removed require('merge-stream') node module. it gives wired glob behavior and some files goes missing
const zip = require('gulp-zip');
const jsDocGenerate = require('./jsDocGenerate');
const Translate = require("./translateStrings");
const copyThirdPartyLibs = require("./thirdparty-lib-copy");
const minify = require('gulp-minify');
const glob = require("glob");
const sourcemaps = require('gulp-sourcemaps');
const crypto = require("crypto");

function cleanDist() {
    return del(['dist']);
}

function cleanAll() {
    return del([
        'node_modules',
        'dist',
        // Test artifacts
        'test/spec/test_folders.zip'
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
    return src('src/**/*')
        .pipe(dest('dist'));
}

function makeJSDist() {
    return src(['src/**/*.js', '!src/**/unittest-files/**/*'])
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

function makeDistNonJS() {
    return src(['src/**/*', '!src/**/*.js'])
        .pipe(dest('dist'));
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


function _updateConfigFile(config) {
    delete config.scripts;
    delete config.devDependencies;
    delete config.dependencies;
    delete config.dependencies;

    config.config.build_timestamp = new Date();

    console.log("using config: ", config);
    fs.writeFileSync('dist/config.json', JSON.stringify(config, null, 2));

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

function cleanDocs() {
    return del(['docs/generatedApiDocs']);
}

function createJSDocs() {
    return src('src/**/*.js')
        // Instead of using gulp-uglify, you can create an inline plugin
        .pipe(jsDocGenerate.generateDocs())
        .pipe(dest('docs/generatedApiDocs'));
}

function generateDocIndex() {
    return new Promise(async (resolve)=>{ // eslint-disable-line
        await jsDocGenerate.generateDocIndex('docs/generatedApiDocs');
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

const ALLOWED_EXTENSIONS_TO_CACHE = ["js", "html", "htm", "css", "less", "scss", "ttf", "woff", "woff2", "eot",
    "txt", "otf",
    "json", "config",
    "zip",
    "png", "svg", "jpg", "jpeg", "gif", "ico",
    "mustache", "md", "markdown"];
const DISALLOWED_EXTENSIONS_TO_CACHE = ["map", "nuspec", "partial", "pre", "post", "webmanifest", "rb"];

function _isCacheableFile(path) {
    if(path.indexOf(".") === -1){
        // no extension. dont cache
        return false;
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
        hash: crypto.createHash("md5").update(data).digest("hex")
    };
}

function _computeCacheManifest(baseDir, filePaths) {
    let manifest = {}, fileDetails, totalSize = 0;
    for(let filePath of filePaths){
        fileDetails = _getFileDetails(baseDir + "/" + filePath);
        manifest[filePath] = fileDetails.hash;
        totalSize += fileDetails.sizeBytes;
    }
    totalSize = Math.round(totalSize/1024); // KB
    console.log("Total size of cache in KB: ", totalSize);
    if(totalSize > 75000){
        throw new Error("The total size of the src or dist folder core assets exceeds 75MB." +
            "\nPlease review and trim storage. This significantly impacts the distribution size." +
            "\nEither trim down the size or increase the limit after careful review.");
    }
    return manifest;
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

exports.build = series(copyThirdPartyLibs.copyAll, zipDefaultProjectFiles, zipSampleProjectFiles,
    createSrcCacheManifest);
exports.clean = series(cleanDist);
exports.reset = series(cleanAll);
exports.releaseDev = series(cleanDist, exports.build, makeDistAll,
    createDistCacheManifest);
exports.releaseStaging = series(cleanDist, exports.build, makeDistNonJS, makeJSDist, releaseStaging,
    createDistCacheManifest);
exports.releaseProd = series(cleanDist, exports.build, makeDistNonJS, makeJSDist, releaseProd,
    createDistCacheManifest);
exports.serve = series(exports.build, serve);
exports.test = series(zipTestFiles);
exports.serveExternal = series(exports.build, serveExternal);
exports.createJSDocs = series(cleanDocs, createJSDocs, generateDocIndex);
exports.translateStrings = series(translateStrings);
exports.default = series(exports.build);
