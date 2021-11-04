/* eslint-env node */

const del = require('del');
const webserver = require('gulp-webserver');
const uglify = require('gulp-uglify');
const pipeline = require('readable-stream').pipeline;
const { src, dest, series } = require('gulp');
const concat = require('gulp-concat');

function cleanDist() {
    return del(['dist']);
}

function cleanAll() {
    return del(['node_modules', 'dist']);
}

function release() {
    return pipeline(
        src(['src/**/*.js', '!src/extensions/**', '!src/thirdparty/**'],  { sourcemaps: true })
            .pipe(concat('all.js')),
        uglify(),
        dest('dist/',  { sourcemaps: true })
    );
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
