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
const sourcemaps = require('gulp-sourcemaps');

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

exports.build = series(copyThirdPartyLibs.copyAll, zipDefaultProjectFiles, zipSampleProjectFiles);
exports.clean = series(cleanDist);
exports.reset = series(cleanAll);
exports.releaseDev = series(cleanDist, exports.build, makeDistAll);
exports.releaseStaging = series(cleanDist, exports.build, makeDistNonJS, makeJSDist, releaseStaging);
exports.releaseProd = series(cleanDist, exports.build, makeDistNonJS, makeJSDist, releaseProd);
exports.serve = series(exports.build, serve);
exports.test = series(zipTestFiles);
exports.serveExternal = series(exports.build, serveExternal);
exports.createJSDocs = series(cleanDocs, createJSDocs, generateDocIndex);
exports.translateStrings = series(translateStrings);
exports.default = series(exports.build);
