/* eslint-env node */

const del = require('del');
var webserver = require('gulp-webserver');
const { src, dest, series } = require('gulp');

function cleanAll() {
    return del(['node_modules', 'dist']);
}

function build(cb) {
    // body omitted
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
exports.clean = series(cleanAll);
exports.serve = series(build, serve);
exports.serveExternal = series(build, serveExternal);
exports.default = series(build);
