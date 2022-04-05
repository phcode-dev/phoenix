/* eslint-env node */

const del = require('del');
const webserver = require('gulp-webserver');
const { src, dest, series } = require('gulp');
// This plugin concatenates any number of CSS and JavaScript files into a single file
const useref = require('gulp-useref');
// Requires the gulp-uglify plugin for minifying js files
const uglify = require('gulp-uglify');
const gulpIf = require('gulp-if');
// Requires the gulp-cssnano plugin for minifying css files
const cssnano = require('gulp-cssnano');
const mergeStream =   require('merge-stream');
const zip = require('gulp-zip');
const rename = require("gulp-rename");

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
function release() {
    return src('src/*.html')
        .pipe(useref())
        // Minifies only if it's a JavaScript file
        .pipe(gulpIf('*.js', uglify()))
        // Minifies only if it's a CSS file
        .pipe(gulpIf('*.css', cssnano()))
        .pipe(dest('dist'));
}

/**
 * Add thirdparty libs copied to gitignore except the licence file.
 * @returns {Promise<PassThrough>}
 */
async function copyThirdPartyLibs(){
    return mergeStream(
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

exports.build = series(copyThirdPartyLibs, zipDefaultProjectFiles);
exports.clean = series(cleanDist);
exports.reset = series(cleanAll);
exports.release = series(cleanDist, exports.build, release);
exports.serve = series(exports.build, serve);
exports.test = series(zipTestFiles);
exports.serveExternal = series(exports.build, serveExternal);
exports.default = series(exports.build);
