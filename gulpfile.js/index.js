/* eslint-env node */

const del = require('del');
const { src, dest, series } = require('gulp');

// The `clean` function is not exported so it can be considered a private task.
// It can still be used within the `series()` composition.
function cleanAll() {
    return del(['node_modules', 'dist']);
}

// The `build` function is exported so it is public and can be run with the `gulp` command.
// It can also be used within the `series()` composition.
function build(cb) {
    // body omitted
    cb();
}

exports.build = build;
exports.clean = series(cleanAll);
exports.default = series(build);
