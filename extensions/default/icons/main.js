/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, $, brackets, window */

define(function (require, exports, module) {

    let extensionUtils = brackets.getModule('utils/ExtensionUtils'),
        fileUtils = brackets.getModule('file/FileUtils'),
        WorkingSetView = brackets.getModule('project/WorkingSetView'),
        FileTreeView = brackets.getModule('project/FileTreeView');

    extensionUtils.loadStyleSheet(module, 'css/main.css');

    // use this cheetsheet for fontawesome icons https://fontawesome.com/v5/cheatsheet/free/brands
    // or https://fontawesome.com/v5/cheatsheet/free/solid or https://fontawesome.com/v5/cheatsheet/free/regular
    var exts = {
        css: "devicon-css3-plain",
        htm: "devicon-html5-plain",
        html: "devicon-html5-plain",
        js: "devicon-javascript-plain",
        ts: "devicon-typescript-plain",
        map: "fa-map-signs fa-solid",
        'js.map': "fa-map-signs fa-solid",
        'css.map': "fa-map-signs fa-solid",
        xml: 'fa-code fa-solid',
        jsx: 'fa-react fa-brands',
        hbs: "devicon-handlebars-plain",
        eot: "fa-font fa-solid",
        woff: "fa-font fa-solid",
        ttf: "fa-font fa-solid",
        txt: "fa-file-alt fa-solid",

        json: "fa-cogs fa-solid",
        yml: "fa-cogs fa-solid",
        yaml: "fa-cogs fa-solid",
        conf: "fa-cogs fa-solid",
        config: "fa-cogs fa-solid",
        plist: "fa-cogs fa-solid",
        htaccess: "fa-cogs fa-solid",
        htpasswd: "fa-cogs fa-solid",
        project: "fa-cogs fa-solid",
        org: "fa-cogs fa-solid",

        markdown: "devicon-markdown-original nocolor",
        md: "devicon-markdown-original nocolor",

        py: "devicon-python-plain",
        pyc: "devicon-python-plain",
        pyd: "devicon-python-plain",
        pyo: "devicon-python-plain",

        php: "devicon-php-plain",
        phtml: "devicon-php-plain",
        php3: "devicon-php-plain",
        php4: "devicon-php-plain",
        php5: "devicon-php-plain",
        phps: "devicon-php-plain",

        gitignore: "devicon-git-plain",
        gitattributes: "devicon-git-plain",
        gitmodules: "devicon-git-plain",

        sass: "devicon-sass-original",
        scss: "devicon-sass-original",
        less: 'fa-less fa-brands',

        c: "devicon-c-plain nocolor",
        cpp: "devicon-cplusplus-plain nocolor",

        bat: "fa-file-code fa-solid",
        sh: "fa-file-code fa-solid",
        command: "fa-file-code fa-solid",

        sql: "fa-file-code fa-solid",

        java: "fa-java fa-brands",
        jar: "fa-archive fa-solid",

        rb: "devicon-ruby-plain",
        erb: "devicon-ruby-plain",
        rbw: "devicon-ruby-plain",
        rdoc: "devicon-ruby-plain",
        haml: "devicon-rails-plain",

        coffee: "devicon-coffeescript-original nocolor",

        styl: "devicon-stylus-original nocolor",

        npmignore: "fa-npm fa-brands",

        scala: "devicon-scala-plain",
        sc: "devicon-scala-plain",

        go: "devicon-go-plain",

        swift: 'devicon-swift-plain',

        sln: 'devicon-visualstudio-plain',

        pl: 'devicon-perl-plain nocolor',
        pm: 'devicon-perl-plain nocolor',

        hs: 'devicon-haskell-plain nocolor',
        lhs: 'devicon-haskell-plain nocolor',

        psd: 'devicon-photoshop-plain',
        ai: 'devicon-illustrator-plain',
        png: 'fa-image fa-solid',
        ico: 'fa-image fa-solid',
        jpg: 'fa-image fa-solid',
        jpeg: 'fa-image fa-solid',
        tiff: 'fa-image fa-solid',
        gif: 'fa-photo-video fa-solid',
        svg: 'fa-code fa-solid',

        mp3: 'fa-music fa-solid',
        wav: 'fa-music fa-solid',

        avi: 'fa-film fa-solid',
        mp4: 'fa-film fa-solid',
        wmv: 'fa-film fa-solid',
        mkv: 'fa-film fa-solid',
        ogg: 'fa-film fa-solid',
        webm: 'fa-film fa-solid',

        gz: "fa-archive fa-solid",
        '7z': "fa-archive fa-solid",
        bzip: "fa-archive fa-solid",
        zip: "fa-archive fa-solid",
        rar: "fa-archive fa-solid",
        tar: "fa-archive fa-solid",
        tgz: "fa-archive fa-solid"
    };

    var files = {
        'gruntfile.js': 'devicon-grunt-plain',
        'gulpfile.js': 'devicon-gulp-plain',
        'package.json': 'fa-npm fa-brands',
        '.eslintignore': 'devicon-eslint-original',
        '.eslintrc.js': 'devicon-eslint-original'
    };

    function getExtension(filePath) {
        filePath = filePath || '';
        let pathSplit = filePath.split('.');
        return pathSplit && pathSplit.length>1 ? pathSplit[pathSplit.length-1] : '';
    }

    var iconProvider = function (entry) {
        let color = true;
        if (!entry.isFile) {
            return;
        }

        let ext = getExtension(entry.fullPath) || entry.name.substr(1);
        let filename = fileUtils.getBaseName(entry.fullPath).toLowerCase();

        let span = $('<span>');
        span.addClass('bd-icon');
        let el = $('<i>');
        span.append(el);
        el.addClass('fa-solid fa-file');

        if (files[filename]) {
            el.removeClass('fa-solid fa-file');
            el.addClass(files[filename]);
            if(!files[filename].includes('nocolor') && color){
                el.addClass('colored');
            }
        } else if (exts[ext]) {
            el.removeClass('fa-solid fa-file');
            el.addClass(exts[ext]);
            if(!exts[ext].includes('nocolor') && color){
                el.addClass('colored');
            }
        }

        return span;
    };

    WorkingSetView.addIconProvider(iconProvider, -1);
    FileTreeView.addIconProvider(iconProvider, -1);
});
