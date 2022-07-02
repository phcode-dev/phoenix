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
const jsDocGenerate = require('./jsDocGenerate');
const Translate = require("./translateStrings");

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
        // bootstrap
        src(['node_modules/bootstrap/dist/js/bootstrap.min.js', 'node_modules/bootstrap/dist/js/bootstrap.min.js.map',
            'node_modules/bootstrap/dist/css/bootstrap.min.css', 'node_modules/bootstrap/dist/css/bootstrap.min.css.map'])
            .pipe(dest('src/thirdparty/bootstrap')),
        src(['node_modules/bootstrap/LICENSE'])
            .pipe(rename("bootstrap.markdown"))
            .pipe(dest('src/thirdparty/licences/')),
        // hilightjs
        src(['node_modules/@highlightjs/cdn-assets/highlight.min.js'])
            .pipe(dest('src/thirdparty/highlight.js')),
        src(['node_modules/@highlightjs/cdn-assets/styles/*.*'])
            .pipe(dest('src/thirdparty/highlight.js/styles')),
        src(['node_modules/@highlightjs/cdn-assets/languages/*.*'])
            .pipe(dest('src/thirdparty/highlight.js/languages')),
        src(['node_modules/@highlightjs/cdn-assets/LICENSE'])
            .pipe(rename("highlight.js.markdown"))
            .pipe(dest('src/thirdparty/licences/')),
        // gfm-stylesheet
        src(['node_modules/@pixelbrackets/gfm-stylesheet/dist/gfm.min.css'])
            .pipe(dest('src/thirdparty/')), // AGPL 2.0 license addded to
        // prettier
        src(['node_modules/prettier/*.js'])
            .pipe(dest('src/extensions/default/Phoenix-prettier/thirdParty')),
        src(['node_modules/prettier/LICENSE'])
            .pipe(rename("prettier.markdown"))
            .pipe(dest('src/thirdparty/licences/')),
        // font-awesome
        src(['node_modules/@fortawesome/fontawesome-free/css/*'])
            .pipe(dest('src/thirdparty/fontawesome/css')),
        src(['node_modules/@fortawesome/fontawesome-free/js/*'])
            .pipe(dest('src/thirdparty/fontawesome/js')),
        src(['node_modules/@fortawesome/fontawesome-free/webfonts/*'])
            .pipe(dest('src/thirdparty/fontawesome/webfonts')),
        src(['node_modules/@fortawesome/fontawesome-free/svgs/brands/*'])
            .pipe(dest('src/thirdparty/fontawesome/svgs/brands')),
        src(['node_modules/@fortawesome/fontawesome-free/svgs/regular/*'])
            .pipe(dest('src/thirdparty/fontawesome/svgs/regular')),
        src(['node_modules/@fortawesome/fontawesome-free/svgs/solid/*'])
            .pipe(dest('src/thirdparty/fontawesome/svgs/solid')),
        src(['node_modules/@fortawesome/fontawesome-free/LICENSE.txt'])
            .pipe(rename("fontawesome.markdown"))
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
        // @floating-ui for notification ui widget  floating-ui.dom.umd.min.js
        src(['node_modules/@floating-ui/core/dist/floating-ui.core.umd.min.js'])
            .pipe(dest('src/thirdparty')),
        src(['node_modules/@floating-ui/dom/dist/floating-ui.dom.umd.min.js'])
            .pipe(dest('src/thirdparty')),
        src(['node_modules/@floating-ui/core/LICENSE'])
            .pipe(rename("floating-ui.markdown"))
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

function zipSampleProjectFiles() {
    return mergeStream(
        src(['src/assets/sample-projects/bootstrap-blog/**'])
            .pipe(zip('bootstrap-blog.zip'))
            .pipe(dest('src/assets/sample-projects/')),
        src(['src/assets/sample-projects/explore/**'])
            .pipe(zip('explore.zip'))
            .pipe(dest('src/assets/sample-projects/')),
        src(['src/assets/sample-projects/HTML5/**'])
            .pipe(zip('HTML5.zip'))
            .pipe(dest('src/assets/sample-projects/')),
        src(['src/assets/sample-projects/dashboard/**'])
            .pipe(zip('dashboard.zip'))
            .pipe(dest('src/assets/sample-projects/')),
        src(['src/assets/sample-projects/home-pages/**'])
            .pipe(zip('home-pages.zip'))
            .pipe(dest('src/assets/sample-projects/'))
    );
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

function translateStrings() {
    return new Promise(async (resolve)=>{
        await Translate.translate();
        resolve();
    });
}

exports.build = series(copyThirdPartyLibs, zipDefaultProjectFiles, zipSampleProjectFiles);
exports.clean = series(cleanDist);
exports.reset = series(cleanAll);
exports.releaseDev = series(cleanDist, exports.build, makeDist);
exports.releaseStaging = series(cleanDist, exports.build, makeDist, releaseStaging);
exports.releaseProd = series(cleanDist, exports.build, makeDist, releaseProd);
exports.serve = series(exports.build, serve);
exports.test = series(zipTestFiles);
exports.serveExternal = series(exports.build, serveExternal);
exports.createJSDocs = series(cleanDocs, createJSDocs, generateDocIndex);
exports.translateStrings = series(translateStrings);
exports.default = series(exports.build);
