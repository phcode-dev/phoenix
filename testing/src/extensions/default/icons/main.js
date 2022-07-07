/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, $, brackets, window */

define(function (require, exports, module) {

    let extensionUtils = brackets.getModule('utils/ExtensionUtils'),
        fileUtils = brackets.getModule('file/FileUtils'),
        ProjectManager = brackets.getModule('project/ProjectManager'),
        LanguageManager = brackets.getModule("language/LanguageManager");

    extensionUtils.loadStyleSheet(module, 'css/main.css');

    // use this cheetsheet for fontawesome icons https://fontawesome.com/v5/cheatsheet/free/brands
    // or https://fontawesome.com/v5/cheatsheet/free/solid or https://fontawesome.com/v5/cheatsheet/free/regular
    // or https://devicon.dev/
    var languages = {
        folder: "fa-folder fa-solid",

        css: "devicon-css3-plain",
        htm: "devicon-html5-plain",
        html: "devicon-html5-plain",
        javascript: "devicon-javascript-plain",
        typescript: "devicon-typescript-plain",
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
        text: "fa-file-alt fa-solid",

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
        properties: "fa-cogs fa-solid",

        markdown: "devicon-markdown-original nocolor",
        'markdown (github)': "devicon-markdown-original nocolor",

        python: "devicon-python-plain",
        pyc: "devicon-python-plain",
        pyd: "devicon-python-plain",
        pyo: "devicon-python-plain",

        php: "devicon-php-plain",

        lua: "devicon-lua-plain",

        gitignore: "devicon-git-plain",
        gitattributes: "devicon-git-plain",
        gitmodules: "devicon-git-plain",

        sass: "devicon-sass-original",
        scss: "devicon-sass-original",
        less: 'fa-less fa-brands',

        c: "devicon-c-plain nocolor",
        cpp: "devicon-cplusplus-plain nocolor",
        'objective-c': "devicon-objectivec-plain nocolor",
        kotlin: "devicon-kotlin-plain",
        'c#': "devicon-csharp-plain",

        bat: "fa-file-code fa-solid",
        sh: "fa-file-code fa-solid",
        command: "fa-file-code fa-solid",

        sql: "fa-file-code fa-solid",

        java: "fa-java fa-brands",
        jar: "fa-archive fa-solid",

        'erb_html': "devicon-ruby-plain",
        ruby: "devicon-ruby-plain",
        rbw: "devicon-ruby-plain",
        rdoc: "devicon-ruby-plain",
        haml: "devicon-rails-plain",

        coffeescript: "devicon-coffeescript-original nocolor",

        groovy: "devicon-groovy-plain",

        clojure: "devicon-clojure-plain",

        styl: "devicon-stylus-original nocolor",

        dart: "devicon-dart-plain",

        npmignore: "fa-npm fa-brands",

        scala: "devicon-scala-plain",

        go: "devicon-go-plain",

        swift: 'devicon-swift-plain',

        sln: 'devicon-visualstudio-plain',

        perl: 'devicon-perl-plain nocolor',

        hs: 'devicon-haskell-plain nocolor',
        lhs: 'devicon-haskell-plain nocolor',

        psd: 'devicon-photoshop-plain',
        ai: 'devicon-illustrator-plain',
        image: 'fa-image fa-solid',
        png: 'fa-image fa-solid',
        ico: 'fa-image fa-solid',
        jpg: 'fa-image fa-solid',
        jpeg: 'fa-image fa-solid',
        tiff: 'fa-image fa-solid',
        gif: 'fa-photo-video fa-solid',
        svg: 'fa-code fa-solid',

        audio: 'fa-music fa-solid',
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

        let span = $('<span>');
        span.addClass('bd-icon');
        let el = $('<i>');
        span.append(el);
        el.addClass('fa-solid fa-file');

        if (!entry.isFile) {
            el.removeClass('fa-solid fa-file');
            el.addClass(languages.folder);
            return span;
        }

        let ext = getExtension(entry.fullPath) || entry.name.substr(1);
        let filename = fileUtils.getBaseName(entry.fullPath).toLowerCase();

        if (files[filename]) {
            el.removeClass('fa-solid fa-file');
            el.addClass(files[filename]);
            if(!files[filename].includes('nocolor') && color){
                el.addClass('colored');
            }
        } else if (languages[ext]) {
            el.removeClass('fa-solid fa-file');
            el.addClass(languages[ext]);
            if(!languages[ext].includes('nocolor') && color){
                el.addClass('colored');
            }
        } else{
            let lang = LanguageManager.getLanguageForPath(entry.fullPath).getName().toLowerCase();
            if(!languages[lang]){
                return span;
            }
            el.removeClass('fa-solid fa-file');
            el.addClass(languages[lang]);
            if(!languages[lang].includes('nocolor') && color){
                el.addClass('colored');
            }
        }

        return span;
    };

    ProjectManager.addIconProvider(iconProvider, -1);
});
