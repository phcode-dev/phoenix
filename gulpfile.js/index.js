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
const mergeStream =   require('merge-stream');
const zip = require('gulp-zip');
const rename = require("gulp-rename");
const through2 = require('through2');
const jsDocGenerate = require('./jsDocGenerate');
const configFile = require("../src/config.json");

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
function makeDist() {
    return src('src/**/*')
        .pipe(dest('dist'));
}

/**
 * Add thirdparty libs copied to gitignore except the licence file.
 * @returns {Promise<PassThrough>}
 */
async function copyThirdPartyLibs(){
    return mergeStream(
        // @phcode/fs
        src(['node_modules/@phcode/fs/dist/virtualfs.js',
            'node_modules/@phcode/fs/dist/virtualfs.js.map'])
            .pipe(dest('src/phoenix')),
        // jszip
        src(['node_modules/jszip/dist/jszip.js'])
            .pipe(dest('src/thirdparty')),
        src(['node_modules/jszip/LICENSE.markdown'])
            .pipe(rename("jsZip.markdown"))
            .pipe(dest('src/thirdparty/licences/')),
        // underscore
        src(['node_modules/underscore/underscore-min.js'])
            .pipe(dest('src/thirdparty')),
        src(['node_modules/underscore/LICENSE'])
            .pipe(rename("underscore.markdown"))
            .pipe(dest('src/thirdparty/licences/')),
        // prettier
        src(['node_modules/prettier/*.js'])
            .pipe(dest('src/extensions/default/Phoenix-prettier/thirdParty')),
        src(['node_modules/prettier/LICENSE'])
            .pipe(rename("prettier.markdown"))
            .pipe(dest('src/thirdparty/licences/')),
        // mime-db
        src(['node_modules/mime-db/db.json'])
            .pipe(rename("mime-db.json"))
            .pipe(dest('src/thirdparty')),
        src(['node_modules/mime-db/LICENSE'])
            .pipe(rename("mime-db.markdown"))
            .pipe(dest('src/thirdparty/licences/')),
        // marked.js markdown rendering
        src(['node_modules/marked/marked.min.js'])
            .pipe(dest('src/extensions/default/Phoenix-live-preview/thirdparty')),
        src(['node_modules/marked/LICENSE.md'])
            .pipe(rename("marked.markdown"))
            .pipe(dest('src/thirdparty/licences/')),
        // documentation
        src(['node_modules/documentation/LICENSE'])
            .pipe(rename("documentation.markdown"))
            .pipe(dest('src/thirdparty/licences/'))
    );
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
    return new Promise(async (resolve)=>{
        await jsDocGenerate.generateDocIndex('docs/generatedApiDocs');
        resolve();
    });
}

exports.build = series(copyThirdPartyLibs, zipDefaultProjectFiles);
exports.clean = series(cleanDist);
exports.reset = series(cleanAll);
exports.releaseDev = series(cleanDist, exports.build, makeDist);
exports.releaseStaging = series(cleanDist, exports.build, makeDist, releaseStaging);
exports.releaseProd = series(cleanDist, exports.build, makeDist, releaseProd);
exports.serve = series(exports.build, serve);
exports.test = series(zipTestFiles);
exports.serveExternal = series(exports.build, serveExternal);
exports.createJSDocs = series(cleanDocs, createJSDocs, generateDocIndex);
exports.default = series(exports.build);
