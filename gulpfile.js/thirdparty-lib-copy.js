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

const { src, dest, series } = require('gulp');
const fs = require("fs");
const path = require('path');

// removed require('merge-stream') node module. it gives wired glob behavior and some files goes missing
const rename = require("gulp-rename");


// individual third party copy
function copyLicence(filePath, name) {
    console.log(`Copying licence file ${name}.markdown`);
    return src(filePath)
        .pipe(rename(`${name}.markdown`))
        .pipe(dest('src/thirdparty/licences/'));
}

function renameFile(filePath, newName, destPath) {
    console.log(`Renaming file ${filePath} to ${newName}`);
    return src(filePath)
        .pipe(rename(newName))
        .pipe(dest(destPath));
}

function ensureDirectoryExists(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function downloadFile(url, outputPath) {
    console.log(`Downloading file ${url} to ${outputPath}`);
    ensureDirectoryExists(outputPath);
    return fetch(url)
        .then(x => {
            if(x.status !== 200){
                throw new Error("Failed to download "+ url);
            }
            return x.arrayBuffer();
        })
        .then(x => fs.writeFileSync(outputPath, Buffer.from(x)));
}

function copyFiles(srcPathList, dstPath) {
    console.log(`Copying files ${dstPath}`);
    return src(srcPathList)
        .pipe(dest(dstPath));
}

function _copyMimeDB() {
    // mime-db
    return src(['node_modules/mime-db/db.json'])
        .pipe(rename("mime-db.json"))
        .pipe(dest('src/thirdparty'));
}

// just lists the files in a directory at given path as a json file
function _createListDirJson(dirPath, jsonFileName) {
    let filenames = fs.readdirSync(dirPath);
    if(filenames.includes(jsonFileName)){
        // we dont want to add the index file itself to the dir listing.
        filenames.splice(filenames.indexOf(jsonFileName), 1);
    }
    fs.writeFileSync(`${dirPath}/${jsonFileName}`, JSON.stringify(filenames));
}

function _getConfigJSON() {
    let configPath = "src/config.json";
    console.log("Reading phoenix Config :", configPath);
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

/**
 * Add thirdparty libs copied to gitignore except the licence file.
 */
let copyThirdPartyLibs = series(
    // codemirror
    copyFiles.bind(copyFiles, ['node_modules/codemirror/addon/**/*'], 'src/thirdparty/CodeMirror/addon'),
    copyFiles.bind(copyFiles, ['node_modules/codemirror/keymap/**/*'], 'src/thirdparty/CodeMirror/keymap'),
    copyFiles.bind(copyFiles, ['node_modules/codemirror/lib/**/*'], 'src/thirdparty/CodeMirror/lib'),
    copyFiles.bind(copyFiles, ['node_modules/codemirror/mode/**/*'], 'src/thirdparty/CodeMirror/mode'),
    copyFiles.bind(copyFiles, ['node_modules/codemirror/theme/**/*'], 'src/thirdparty/CodeMirror/theme'),
    copyLicence.bind(copyLicence, 'node_modules/codemirror/LICENSE', 'codemirror'),
    // @phcode/fs
    copyFiles.bind(copyFiles, ['node_modules/@phcode/fs/dist/virtualfs.js',
        'node_modules/@phcode/fs/dist/virtualfs.js.map'], 'src/phoenix'),
    // @phcode/language-support  . // replace below with language-worker-debug.js if you wanna debug
    copyFiles.bind(copyFiles, [
        'node_modules/@phcode/language-support/dist/language-worker.js',
        'node_modules/@phcode/language-support/dist/language-worker.js.map'], 'src/thirdparty/no-minify/'),
    copyLicence.bind(copyLicence, 'node_modules/@phcode/language-support/LICENSE-thirdParty', 'language-services'),
    // lessjs
    copyFiles.bind(copyFiles, ['node_modules/less/dist/less.min.js', 'node_modules/less/dist/less.min.js.map'],
        'src/thirdparty'),
    // emmet
    copyFiles.bind(copyFiles, ['node_modules/emmet/dist/emmet.es.js'],
        'src/thirdparty'),
    copyLicence.bind(copyLicence, 'node_modules/emmet/LICENSE', 'emmet'),
    // bugsnag
    copyFiles.bind(copyFiles, ['node_modules/@bugsnag/browser/dist/bugsnag.min.js',
        'node_modules/@bugsnag/browser/dist/bugsnag.min.js.map'], 'src/thirdparty'),
    copyLicence.bind(copyLicence, 'node_modules/@bugsnag/browser/LICENSE.txt', 'bugsnag'),
    downloadFile.bind(downloadFile, 'https://d2wy8f7a9ursnm.cloudfront.net/v2/bugsnag-performance.min.js',
        'src/thirdparty/bugsnag-performance.min.js'),
    downloadFile.bind(downloadFile, 'https://d2wy8f7a9ursnm.cloudfront.net/v2/bugsnag-performance.min.js.map',
        'src/thirdparty/bugsnag-performance.min.js.map'),
    // phoenix extension registry cache for first time load
    downloadFile.bind(downloadFile, _getConfigJSON().config.extension_registry,
        'src/extensions/registry/registry.json'),
    downloadFile.bind(downloadFile, _getConfigJSON().config.extension_registry_version,
        'src/extensions/registry/registry_version.json'),
    downloadFile.bind(downloadFile, _getConfigJSON().config.extension_registry_popularity,
        'src/extensions/registry/popularity.json'),
    // tern js
    copyFiles.bind(copyFiles, ['node_modules/tern/defs/**/*'], 'src/thirdparty/tern/defs'),
    copyFiles.bind(copyFiles, ['node_modules/tern/lib/**/*'], 'src/thirdparty/tern/lib'),
    copyFiles.bind(copyFiles, ['node_modules/tern/plugin/**/*'], 'src/thirdparty/tern/plugin'),
    copyLicence.bind(copyLicence, 'node_modules/tern/LICENSE', 'tern'),
    // acorn js
    copyFiles.bind(copyFiles, ['node_modules/acorn/dist/acorn.js*'], 'src/thirdparty/acorn/dist'),
    renameFile.bind(renameFile, 'node_modules/acorn-loose/dist/acorn-loose.js', 'acorn_loose.js', 'src/thirdparty/acorn/dist'),
    renameFile.bind(renameFile, 'node_modules/acorn-loose/dist/acorn-loose.js.map', 'acorn_loose.js.map', 'src/thirdparty/acorn/dist'),
    copyFiles.bind(copyFiles, ['node_modules/acorn-walk/dist/walk.js*'], 'src/thirdparty/acorn/dist'),
    copyLicence.bind(copyLicence, 'node_modules/acorn/LICENSE', 'acorn'),
    // jszip
    copyFiles.bind(copyFiles, ['node_modules/jszip/dist/jszip.js'], 'src/thirdparty'),
    copyLicence.bind(copyLicence, 'node_modules/jszip/LICENSE.markdown', 'jsZip'),
    // filesaver
    copyFiles.bind(copyFiles, ['node_modules/file-saver/dist/FileSaver.min.js', 'node_modules/file-saver/dist/FileSaver.min.js.map'], 'src/thirdparty/fileSaver'),
    copyLicence.bind(copyLicence, 'node_modules/file-saver/LICENSE.md', 'fileSaver'),
    // jsHint
    copyFiles.bind(copyFiles, ['node_modules/jshint/dist/jshint.js'], 'src/thirdparty'),
    copyLicence.bind(copyLicence, 'node_modules/jshint/LICENSE', 'jshint'),
    // underscore
    copyFiles.bind(copyFiles, ['node_modules/underscore/underscore-min.js'], 'src/thirdparty'),
    copyLicence.bind(copyLicence, 'node_modules/underscore/LICENSE', 'underscore'),
    // idb-keyval
    renameFile.bind(renameFile, 'node_modules/idb-keyval/dist/index.js', 'idb-keyval.js', 'src/thirdparty/'),
    copyLicence.bind(copyLicence, 'node_modules/idb-keyval/LICENCE', 'idb-keyval'),
    // lru-cache
    renameFile.bind(renameFile, 'node_modules/lru-cache/dist/esm/index.js', 'lru-cache.js', 'src/thirdparty/no-minify/'),
    renameFile.bind(renameFile, 'node_modules/lru-cache/dist/esm/index.js.map', 'lru-cache.js.map', 'src/thirdparty/no-minify/'),
    copyLicence.bind(copyLicence, 'node_modules/lru-cache/LICENSE', 'lru-cache'),
    // bootstrap
    copyFiles.bind(copyFiles, ['node_modules/bootstrap/dist/js/bootstrap.min.js',
        'node_modules/bootstrap/dist/js/bootstrap.min.js.map',
        'node_modules/bootstrap/dist/css/bootstrap.min.css',
        'node_modules/bootstrap/dist/css/bootstrap.min.css.map',
        'node_modules/bootstrap/dist/css/bootstrap-grid.min.css',
        'node_modules/bootstrap/dist/css/bootstrap-grid.min.css.map'], 'src/thirdparty/bootstrap'),
    copyLicence.bind(copyLicence, 'node_modules/bootstrap/LICENSE', 'bootstrap'),
    // tinycolor.js
    copyFiles.bind(copyFiles, ['node_modules/tinycolor2/tinycolor.js'], 'src/thirdparty'),
    copyLicence.bind(copyLicence, 'node_modules/tinycolor2/LICENSE', 'tinycolor2'),
    // mustache.js
    copyFiles.bind(copyFiles, ['node_modules/mustache/mustache.js'], 'src/thirdparty/mustache'),
    copyLicence.bind(copyLicence, 'node_modules/mustache/LICENSE', 'mustache'),
    // hilightjs
    copyFiles.bind(copyFiles, ['node_modules/@highlightjs/cdn-assets/highlight.min.js'],
        'src/thirdparty/highlight.js'),
    copyFiles.bind(copyFiles, ['node_modules/@highlightjs/cdn-assets/styles/*.*'],
        'src/thirdparty/highlight.js/styles'),
    copyFiles.bind(copyFiles, ['node_modules/@highlightjs/cdn-assets/languages/*.*'],
        'src/thirdparty/highlight.js/languages'),
    copyLicence.bind(copyLicence, 'node_modules/@highlightjs/cdn-assets/LICENSE', 'highlight.js'),
    // gfm-stylesheet
    copyFiles.bind(copyFiles, ['node_modules/@pixelbrackets/gfm-stylesheet/dist/gfm.min.css'],
        'src/thirdparty/'), // AGPL 2.0 license added to licence md
    // prettier
    copyFiles.bind(copyFiles, ['node_modules/prettier/standalone.js'],
        'src/thirdparty/prettier'),
    copyFiles.bind(copyFiles, ['node_modules/prettier/plugins/*.js'],
        'src/thirdparty/prettier/plugins'),
    copyLicence.bind(copyLicence, 'node_modules/prettier/LICENSE', 'prettier'),
    copyFiles.bind(copyFiles, ['node_modules/@prettier/plugin-php/*.js'],
        'src/thirdparty/prettier/php'),
    copyLicence.bind(copyLicence, 'node_modules/@prettier/plugin-php/LICENSE', 'prettier-php'),
    // font-awesome
    copyFiles.bind(copyFiles, ['node_modules/@fortawesome/fontawesome-free/css/all.min.css'],
        'src/thirdparty/fontawesome/css'),
    copyFiles.bind(copyFiles, ['node_modules/@fortawesome/fontawesome-free/webfonts/*'],
        'src/thirdparty/fontawesome/webfonts'),
    copyLicence.bind(copyLicence, 'node_modules/@fortawesome/fontawesome-free/LICENSE.txt', 'fontawesome'),
    // devicons https://devicon.dev/
    copyFiles.bind(copyFiles, ['node_modules/devicon/devicon.min.css'],
        'src/thirdparty/devicon/'),
    copyFiles.bind(copyFiles, ['node_modules/devicon/fonts/*.*'],
        'src/thirdparty/devicon/fonts/'),
    copyFiles.bind(copyFiles, ['node_modules/devicon/icons/chrome/chrome-original.svg'],
        'src/thirdparty/devicon/icons/chrome/'),
    copyFiles.bind(copyFiles, ['node_modules/devicon/icons/safari/safari-original.svg'],
        'src/thirdparty/devicon/icons/safari/'),
    copyFiles.bind(copyFiles, ['node_modules/devicon/icons/firefox/firefox-original.svg'],
        'src/thirdparty/devicon/icons/firefox/'),
    copyLicence.bind(copyLicence, 'node_modules/devicon/LICENSE', 'devicon'),
    // file-icons https://www.npmjs.com/package/@uiw/file-icons - MIT License
    copyFiles.bind(copyFiles, ['node_modules/@uiw/file-icons/fonts/ffont.css'],
        'src/thirdparty/file-icons/'),
    copyFiles.bind(copyFiles, ['node_modules/@uiw/file-icons/fonts/ffont.ttf'],
        'src/thirdparty/file-icons/'),
    copyFiles.bind(copyFiles, ['node_modules/@uiw/file-icons/fonts/ffont.woff2'],
        'src/thirdparty/file-icons/'),
    // mime-db
    _copyMimeDB,
    copyLicence.bind(copyLicence, 'node_modules/mime-db/LICENSE', 'mime-db'),
    // marked.js markdown rendering
    copyFiles.bind(copyFiles, ['node_modules/marked/marked.min.js'],
        'src/thirdparty'),
    copyLicence.bind(copyLicence, 'node_modules/marked/LICENSE.md', 'marked'),
    // @floating-ui for notification ui widget  floating-ui.dom.umd.min.js
    copyFiles.bind(copyFiles, ['node_modules/@floating-ui/core/dist/floating-ui.core.umd.min.js'],
        'src/thirdparty'),
    copyFiles.bind(copyFiles, ['node_modules/@floating-ui/dom/dist/floating-ui.dom.umd.min.js'],
        'src/thirdparty'),
    copyLicence.bind(copyLicence, 'node_modules/@floating-ui/core/LICENSE', 'floating-ui'),
    // jasmine
    copyFiles.bind(copyFiles, ['node_modules/jasmine-core/lib/jasmine-core/**/*'],
        'test/thirdparty/jasmine-core/'),
    copyLicence.bind(copyLicence, 'node_modules/jasmine-core/MIT.LICENSE', 'jasmine'),
    // jasmine-reporters
    copyFiles.bind(copyFiles, ['node_modules/jasmine-reporters/src/**/*'],
        'test/thirdparty/jasmine-reporters/'),
    copyLicence.bind(copyLicence, 'node_modules/jasmine-reporters/LICENSE', 'jasmine-reporters'),
    // lmdb
    copyLicence.bind(copyLicence, 'node_modules/lmdb/LICENSE', 'lmdb')

);

/**
 * Add thirdparty libs copied to gitignore except the licence file.
 */
let copyThirdPartyDebugLibs = series(
    // @phcode/fs
    renameFile.bind(renameFile, 'node_modules/@phcode/fs/dist/virtualfs-debug.js', 'virtualfs.js', 'src/phoenix'),
    renameFile.bind(renameFile, 'node_modules/@phcode/fs/dist/virtualfs-debug.js.map', 'virtualfs.js.map', 'src/phoenix')
);

function _patchAcornLib() {
    return new Promise(async (resolve)=>{ // eslint-disable-line
        let fpath = "src/thirdparty/acorn/dist/acorn_loose.js";
        console.log("patching acorn require path for :", fpath);
        let content = fs.readFileSync(fpath, "utf8");
        content = content.replaceAll("'acorn'", "'./acorn'");
        fs.writeFileSync(fpath, content, "utf8");
        resolve();
    });
}

function _patchTernLib() {
    return new Promise(async (resolve)=>{ // eslint-disable-line
        let ternDefsDir = "src/thirdparty/tern/defs",
            ternPluginDir = "src/thirdparty/tern/plugin";
        console.log("patching tern definitions at :", ternDefsDir);
        _createListDirJson(ternDefsDir, "defs.json");
        console.log("patching tern plugins at :", ternPluginDir);
        _createListDirJson(ternPluginDir, "plugin.json");
        resolve();
    });
}

exports.copyAll = series(copyThirdPartyLibs, _patchAcornLib, _patchTernLib);
exports.copyAllDebug = series(copyThirdPartyLibs, copyThirdPartyDebugLibs, _patchAcornLib, _patchTernLib);
