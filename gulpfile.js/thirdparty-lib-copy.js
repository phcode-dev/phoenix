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

// removed require('merge-stream') node module. it gives wired glob behavior and some files goes missing
const rename = require("gulp-rename");


// individual third party copy
function copyLicence(path, name) {
    console.log(`Copying licence file ${name}.markdown`);
    return src(path)
        .pipe(rename(`${name}.markdown`))
        .pipe(dest('src/thirdparty/licences/'));
}

function renameFile(path, newName, destPath) {
    console.log(`Renaming file ${path} to ${newName}`);
    return src(path)
        .pipe(rename(newName))
        .pipe(dest(destPath));
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
    // lessjs
    copyFiles.bind(copyFiles, ['node_modules/less/dist/less.min.js', 'node_modules/less/dist/less.min.js.map'],
        'src/thirdparty'),
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
    // jsHint
    copyFiles.bind(copyFiles, ['node_modules/jshint/dist/jshint.js'], 'src/thirdparty'),
    copyLicence.bind(copyLicence, 'node_modules/jshint/LICENSE', 'jshint'),
    // underscore
    copyFiles.bind(copyFiles, ['node_modules/underscore/underscore-min.js'], 'src/thirdparty'),
    copyLicence.bind(copyLicence, 'node_modules/underscore/LICENSE', 'underscore'),
    // bootstrap
    copyFiles.bind(copyFiles, ['node_modules/bootstrap/dist/js/bootstrap.min.js',
        'node_modules/bootstrap/dist/js/bootstrap.min.js.map',
        'node_modules/bootstrap/dist/css/bootstrap.min.css',
        'node_modules/bootstrap/dist/css/bootstrap.min.css.map'], 'src/thirdparty/bootstrap'),
    copyLicence.bind(copyLicence, 'node_modules/bootstrap/LICENSE', 'bootstrap'),
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
    copyFiles.bind(copyFiles, ['node_modules/prettier/*.js'],
        'src/extensions/default/Phoenix-prettier/thirdParty'),
    copyLicence.bind(copyLicence, 'node_modules/prettier/LICENSE', 'prettier'),
    // font-awesome
    copyFiles.bind(copyFiles, ['node_modules/@fortawesome/fontawesome-free/css/*'],
        'src/thirdparty/fontawesome/css'),
    copyFiles.bind(copyFiles, ['node_modules/@fortawesome/fontawesome-free/js/*'],
        'src/thirdparty/fontawesome/js'),
    copyFiles.bind(copyFiles, ['node_modules/@fortawesome/fontawesome-free/webfonts/*'],
        'src/thirdparty/fontawesome/webfonts'),
    copyFiles.bind(copyFiles, ['node_modules/@fortawesome/fontawesome-free/svgs/brands/*'],
        'src/thirdparty/fontawesome/svgs/brands'),
    copyFiles.bind(copyFiles, ['node_modules/@fortawesome/fontawesome-free/svgs/regular/*'],
        'src/thirdparty/fontawesome/svgs/regular'),
    copyFiles.bind(copyFiles, ['node_modules/@fortawesome/fontawesome-free/svgs/solid/*'],
        'src/thirdparty/fontawesome/svgs/solid'),
    copyLicence.bind(copyLicence, 'node_modules/@fortawesome/fontawesome-free/LICENSE.txt', 'fontawesome'),
    // devicons https://devicon.dev/
    copyFiles.bind(copyFiles, ['node_modules/devicon/devicon.min.css'],
        'src/thirdparty/devicon/'),
    copyFiles.bind(copyFiles, ['node_modules/devicon/fonts/*.*'],
        'src/thirdparty/devicon/fonts/'),
    copyLicence.bind(copyLicence, 'node_modules/devicon/LICENSE', 'devicon'),
    // mime-db
    _copyMimeDB,
    copyLicence.bind(copyLicence, 'node_modules/mime-db/LICENSE', 'mime-db'),
    // marked.js markdown rendering
    copyFiles.bind(copyFiles, ['node_modules/marked/marked.min.js'],
        'src/extensions/default/Phoenix-live-preview/thirdparty'),
    copyLicence.bind(copyLicence, 'node_modules/marked/LICENSE.md', 'marked'),
    // @floating-ui for notification ui widget  floating-ui.dom.umd.min.js
    copyFiles.bind(copyFiles, ['node_modules/@floating-ui/core/dist/floating-ui.core.umd.min.js'],
        'src/thirdparty'),
    copyFiles.bind(copyFiles, ['node_modules/@floating-ui/dom/dist/floating-ui.dom.umd.min.js'],
        'src/thirdparty'),
    copyLicence.bind(copyLicence, 'node_modules/@floating-ui/core/LICENSE', 'floating-ui'),
    // documentation
    copyLicence.bind(copyLicence, 'node_modules/documentation/LICENSE', 'documentation'),
    // jasmine
    copyFiles.bind(copyFiles, ['node_modules/jasmine-core/lib/jasmine-core/**/*'],
        'test/thirdparty/jasmine-core/'),
    copyLicence.bind(copyLicence, 'node_modules/jasmine-core/MIT.LICENSE', 'jasmine'),
    // jasmine-reporters
    copyFiles.bind(copyFiles, ['node_modules/jasmine-reporters/src/**/*'],
        'test/thirdparty/jasmine-reporters/'),
    copyLicence.bind(copyLicence, 'node_modules/jasmine-reporters/LICENSE', 'jasmine-reporters')

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
