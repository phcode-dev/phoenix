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

function cleanDist() {
    return del(['dist']);
}

function cleanAll() {
    return del(['node_modules', 'dist']);
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

function build(cb) {
    cb();
}

function serve() {
    src('.')
        .pipe(webserver({
            livereload: false,
            directoryListing: true,
            open: true
        }));
}

function serveExternal() {
    src('.')
        .pipe(webserver({
            host: '0.0.0.0',
            livereload: false,
            directoryListing: true,
            open: true
        }));
}


exports.build = build;
exports.clean = series(cleanDist);
exports.reset = series(cleanAll);
exports.release = series(cleanDist, build, release);
exports.serve = series(build, serve);
exports.serveExternal = series(build, serveExternal);
exports.default = series(build);
