// this is WIP
// References:
// https://stackoverflow.com/questions/14337970/minifying-requirejs-javascript-codebase-to-a-single-file
// https://github.com/requirejs/r.js
// https://github.com/requirejs/r.js/blob/master/build/example.build.js
// https://requirejs.org/docs/optimization.html
// https://github.com/brackets-cont/brackets/blob/master/Gruntfile.js



({
    // `name` and `out` is set by grunt-usemin
    baseUrl: 'src',
    optimize: 'uglify2',
    // brackets.js should not be loaded until after polyfills defined in "utils/Compatibility"
    // so explicitly include it in main.js
    include: ["utils/Compatibility", "brackets"],
    // TODO: Figure out how to make sourcemaps work with grunt-usemin
    // https://github.com/yeoman/grunt-usemin/issues/30
    generateSourceMaps: true,
    useSourceUrl: true,
    // required to support SourceMaps
    // http://requirejs.org/docs/errors.html#sourcemapcomments
    preserveLicenseComments: false,
    useStrict: true,
    // Disable closure, we want define/require to be globals
    wrap: false,
    paths: {
        "text": "thirdparty/text/text",
        "i18n": "thirdparty/i18n/i18n",
        // The file system implementation. Change this value to use different
        // implementations (e.g. cloud-based storage).
        "fileSystemImpl": "filesystem/impls/appshell/AppshellFileSystem",
        "preact-compat": "thirdparty/preact-compat/preact-compat.min",
        "thirdparty/preact": "thirdparty/preact/preact"
    },
    uglify2: {}, // https://github.com/mishoo/UglifyJS2
    waitSeconds: 60,
    out: "src/brackets-min.js"
})
