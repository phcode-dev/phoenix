define(["require", "exports"], function (require, exports) {
    function setExtensions(set) {
        // XML
        set('xml', (_a = {},
        _a[0 /* ColorLight */] = '#ff6600',
        _a[1 /* IconIon */] = 'ion-code',
        _a[2 /* IconDev */] = 'devicons devicons-code',
        _a
        ));
        set(['html', 'htm'], (_b = {},
        _b[0 /* ColorLight */] = '#e34c26',
        _b[1 /* IconIon */] = ['ion-code', 12],
        _b[2 /* IconDev */] = 'devicons devicons-html5',
        _b
        ));
        set('haml', (_c = {},
        _c[0 /* ColorLight */] = '#0270b9',
        _c[1 /* IconIon */] = 'ion-code',
        _c[2 /* IconDev */] = 'devicons devicons-code',
        _c
        ));
        set('hbs', (_d = {},
        _d[0 /* ColorLight */] = '#f38709',
        _d[1 /* IconIon */] = 'ion-code',
        _d[2 /* IconDev */] = 'devicons devicons-code',
        _d
        ));
        // Stylesheets
        set('css', (_e = {},
        _e[0 /* ColorLight */] = '#0270b9',
        _e[1 /* IconIon */] = ['ion-pound', 12],
        _e[2 /* IconDev */] = 'devicons devicons-css3_full',
        _e
        ));
        set(['scss', 'sass'], (_f = {},
        _f[0 /* ColorLight */] = '#cb6899',
        _f[1 /* IconIon */] = ['ion-pound', 12],
        _f[2 /* IconDev */] = 'devicons devicons-sass',
        _f
        ));
        set('less', (_g = {},
        _g[0 /* ColorLight */] = '#2b5086',
        _g[1 /* IconIon */] = ['ion-pound', 12],
        _g[2 /* IconDev */] = 'devicons devicons-less',
        _g
        ));
        set('styl', (_h = {},
        _h[0 /* ColorLight */] = '#b3d107',
        _h[1 /* IconIon */] = ['ion-pound', 12],
        _h[2 /* IconDev */] = 'devicons devicons-stylus',
        _h
        ));
        // JavaScript
        set('js', (_j = {},
        _j[0 /* ColorLight */] = '#e5a228',
        _j[1 /* IconIon */] = ['file-icon-c', 12],
        _j[2 /* IconDev */] = 'devicons devicons-javascript',
        _j
        ));
        set('jsx', (_k = {},
        _k[0 /* ColorLight */] = '#f8c63d',
        _k[1 /* IconIon */] = ['file-icon-c', 13],
        _k[2 /* IconDev */] = 'devicons devicons-javascript',
        _k
        ));
        set('es6', (_l = {},
        _l[0 /* ColorLight */] = '#4321a9',
        _l[1 /* IconIon */] = ['file-icon-c', 13],
        _l[2 /* IconDev */] = 'devicons devicons-javascript',
        _l
        ));
        set('babel.js', (_m = {},
        _m[0 /* ColorLight */] = '#f5da55',
        _m[1 /* IconIon */] = ['file-icon-c', 13],
        _m[2 /* IconDev */] = 'devicons devicons-javascript',
        _m
        ));
        set('ts', (_o = {},
        _o[0 /* ColorLight */] = '#0074c1',
        _o[1 /* IconIon */] = ['file-icon-c', 13],
        _o[2 /* IconDev */] = 'devicons devicons-javascript',
        _o
        ));
        set('d.ts', (_p = {},
        _p[0 /* ColorLight */] = '#0b8f9e',
        _p[1 /* IconIon */] = ['file-icon-c', 13],
        _p[2 /* IconDev */] = 'devicons devicons-javascript',
        _p
        ));
        set('coffee', (_q = {},
        _q[0 /* ColorLight */] = '#425d99',
        _q[1 /* IconIon */] = 'ion-coffee',
        _q[2 /* IconDev */] = 'devicons devicons-coffeescript',
        _q
        ));
        set('json', (_r = {},
        _r[0 /* ColorLight */] = '#e5a228',
        _r[1 /* IconIon */] = 'ion-ios-gear',
        _r[2 /* IconDev */] = 'devicons devicons-aptana',
        _r
        ));
        set('ls', (_s = {},
        _s[0 /* ColorLight */] = '#369bd7',
        _s[1 /* IconIon */] = 'ion-beaker',
        _s[2 /* IconDev */] = 'devicons devicons-javascript',
        _s
        ));
        // Server side
        set('php', (_t = {},
        _t[0 /* ColorLight */] = '#6976c3',
        _t[1 /* IconIon */] = 'ion-code-working',
        _t[2 /* IconDev */] = 'devicons devicons-php',
        _t
        ));
        set('ctp', (_u = {},
        _u[0 /* ColorLight */] = '#417282',
        _u[1 /* IconIon */] = 'ion-code-working',
        _u[2 /* IconDev */] = 'devicons devicons-php',
        _u
        ));
        set('sql', (_v = {},
        _v[0 /* ColorLight */] = '#c67f07',
        _v[1 /* IconIon */] = 'ion-soup-can-outline',
        _v[2 /* IconDev */] = 'devicons devicons-database',
        _v
        ));
        // Java
        set(['java', 'class'], (_w = {},
        _w[0 /* ColorLight */] = '#5382a1',
        _w[1 /* IconIon */] = 'ion-coffee',
        _w[2 /* IconDev */] = 'devicons devicons-java',
        _w
        ));
        set('scala', (_x = {},
        _x[0 /* ColorLight */] = '#72d0eb',
        _x[1 /* IconIon */] = 'ion-navicon-round file-icon-rotated',
        _x[2 /* IconDev */] = 'devicons devicons-scala',
        _x
        ));
        set('groovy', (_y = {},
        _y[0 /* ColorLight */] = '#4298b8',
        _y[1 /* IconIon */] = 'ion-ios-star',
        _y[2 /* IconDev */] = ['devicons devicons-groovy', 18],
        _y
        ));
        set('mf', (_z = {},
        _z[0 /* ColorLight */] = '#2f5796',
        _z[1 /* IconIon */] = 'ion-ios-gear',
        _z[2 /* IconDev */] = 'devicons devicons-aptana',
        _z
        ));
        // Lua
        set('lua', (_0 = {},
        _0[0 /* ColorLight */] = '#00207d',
        _0[1 /* IconIon */] = ['ion-record', 14],
        _0
        ));
        // Clojure
        set('clj', (_1 = {},
        _1[0 /* ColorLight */] = '#63b132',
        _1[1 /* IconIon */] = 'ion-aperture',
        _1[2 /* IconDev */] = 'devicons devicons-clojure',
        _1
        ));
        // Visual Basic
        set('vb', (_2 = {},
        _2[0 /* ColorLight */] = '#486dae',
        _2[1 /* IconIon */] = 'ion-ios-infinite',
        _2[2 /* IconDev */] = 'devicons devicons-visualstudio',
        _2
        ));
        set('vbs', (_3 = {},
        _3[0 /* ColorLight */] = '#3d047e',
        _3[1 /* IconIon */] = 'ion-ios-infinite',
        _3[2 /* IconDev */] = 'devicons devicons-visualstudio',
        _3
        ));
        // C-family
        set('hx', (_4 = {},
        _4[0 /* ColorLight */] = '#ea8220',
        _4[1 /* IconIon */] = ['file-icon-c', 13],
        _4
        ));
        set('pl', (_5 = {},
        _5[0 /* ColorLight */] = '#a4c5eb',
        _5[1 /* IconIon */] = ['file-icon-c', 13],
        _5
        ));
        set('c', (_6 = {},
        _6[0 /* ColorLight */] = '#a8b9cc',
        _6[1 /* IconIon */] = ['file-icon-c', 13],
        _6
        ));
        set('cpp', (_7 = {},
        _7[0 /* ColorLight */] = '#ffd232',
        _7[1 /* IconIon */] = ['file-icon-c', 13],
        _7
        ));
        set('cs', (_8 = {},
        _8[0 /* ColorLight */] = '#5bb552',
        _8[1 /* IconIon */] = ['file-icon-c', 13],
        _8[2 /* IconDev */] = 'devicons devicons-visualstudio',
        _8
        ));
        set('swift', (_9 = {},
        _9[0 /* ColorLight */] = '#f16830',
        _9[1 /* IconIon */] = ['file-icon-c', 13],
        _9[2 /* IconDev */] = 'devicons devicons-swift',
        _9
        ));
        set('dart', (_10 = {},
        _10[0 /* ColorLight */] = '#36bfb6',
        _10[1 /* IconIon */] = ['file-icon-c', 13],
        _10[2 /* IconDev */] = 'devicons devicons-dart',
        _10
        ));
        // Ruby
        set(['rb', 'erb', 'rdoc'], (_11 = {},
        _11[0 /* ColorLight */] = '#9b111e',
        _11[1 /* IconIon */] = 'ion-heart',
        _11[2 /* IconDev */] = ['devicons devicons-ruby', 14],
        _11
        ));
        set('feature', (_12 = {},
        _12[0 /* ColorLight */] = '#4e8b39',
        _12[1 /* IconIon */] = 'ion-chatbox-working',
        _12[2 /* IconDev */] = ['devicons devicons-ruby', 14],
        _12
        ));
        // Python
        set(['py', 'pyw'], (_13 = {},
        _13[0 /* ColorLight */] = '#f8c63d',
        _13[1 /* IconIon */] = 'ion-social-python',
        _13[2 /* IconDev */] = 'devicons devicons-python',
        _13
        ));
        // Haskell
        set('hs', (_14 = {},
        _14[0 /* ColorLight */] = '#c4451d',
        _14[1 /* IconIon */] = 'ion-android-share-alt file-icon-rotate-90',
        _14[2 /* IconDev */] = 'devicons devicons-haskell',
        _14
        ));
        // Qt Quick
        set('qml', (_15 = {},
        _15[0 /* ColorLight */] = '#42ed0e',
        _15[1 /* IconIon */] = 'ion-code',
        _15[2 /* IconDev */] = 'devicons devicons-code',
        _15
        ));
        // Shell and friends
        set('sh', (_16 = {},
        _16[0 /* ColorLight */] = '#008d00',
        _16[1 /* IconIon */] = 'ion-android-list',
        _16[2 /* IconDev */] = 'devicons devicons-terminal',
        _16
        ));
        set('bat', (_17 = {},
        _17[0 /* ColorLight */] = '#60c910',
        _17[1 /* IconIon */] = 'ion-android-list',
        _17[2 /* IconDev */] = 'devicons devicons-terminal',
        _17
        ));
        // Applications
        set('exe', (_18 = {},
        _18[0 /* ColorLight */] = '#57a084',
        _18[1 /* IconIon */] = 'ion-social-windows',
        _18[2 /* IconDev */] = 'devicons devicons-windows',
        _18
        ));
        set('dll', (_19 = {},
        _19[0 /* ColorLight */] = '#709ead',
        _19[1 /* IconIon */] = 'ion-social-windows',
        _19[2 /* IconDev */] = 'devicons devicons-windows',
        _19
        ));
        // Templating
        set(['pug', 'jade'], (_20 = {},
        _20[0 /* ColorLight */] = '#00a57a',
        _20[1 /* IconIon */] = 'ion-egg',
        _20
        ));
        // Images
        set('png', (_21 = {},
        _21[0 /* ColorLight */] = '#dbb1a9',
        _21[1 /* IconIon */] = 'ion-image',
        _21[2 /* IconDev */] = 'devicons devicons-html5_multimedia',
        _21
        ));
        set(['jpeg', 'jpg'], (_22 = {},
        _22[0 /* ColorLight */] = '#dedfa3',
        _22[1 /* IconIon */] = 'ion-image',
        _22[2 /* IconDev */] = 'devicons devicons-html5_multimedia',
        _22
        ));
        set('tiff', (_23 = {},
        _23[0 /* ColorLight */] = '#ff4000',
        _23[1 /* IconIon */] = 'ion-image',
        _23[2 /* IconDev */] = 'devicons devicons-html5_multimedia',
        _23
        ));
        set('ico', (_24 = {},
        _24[0 /* ColorLight */] = '#b6d2d1',
        _24[1 /* IconIon */] = 'ion-image',
        _24[2 /* IconDev */] = 'devicons devicons-html5_multimedia',
        _24
        ));
        set('svg', (_25 = {},
        _25[0 /* ColorLight */] = '#c0c5eb',
        _25[1 /* IconIon */] = 'ion-image',
        _25[2 /* IconDev */] = 'devicons devicons-html5_multimedia',
        _25
        ));
        set('gif', (_26 = {},
        _26[0 /* ColorLight */] = '#aaecc0',
        _26[1 /* IconIon */] = 'ion-images',
        _26[2 /* IconDev */] = 'devicons devicons-html5_multimedia',
        _26
        ));
        // Videos
        set(['mp4', 'webm', 'ogg'], (_27 = {},
        _27[0 /* ColorLight */] = '#008d00',
        _27[1 /* IconIon */] = 'ion-ios-videocam',
        _27[2 /* IconDev */] = 'devicons devicons-html5_multimedia',
        _27
        ));
        // Audio
        set(['mp3', 'wav'], (_28 = {},
        _28[0 /* ColorLight */] = '#921100',
        _28[1 /* IconIon */] = 'ion-volume-medium',
        _28[2 /* IconDev */] = 'devicons devicons-html5_multimedia',
        _28
        ));
        // Fonts
        set('ttf', (_29 = {},
        _29[0 /* ColorLight */] = '#b42950',
        _29[1 /* IconIon */] = 'ion-social-tumblr',
        _29
        ));
        set('eot', (_30 = {},
        _30[0 /* ColorLight */] = '#b36908',
        _30[1 /* IconIon */] = 'ion-social-tumblr',
        _30
        ));
        set(['woff', 'woff2'], (_31 = {},
        _31[0 /* ColorLight */] = '#7f4bb2',
        _31[1 /* IconIon */] = 'ion-social-tumblr',
        _31
        ));
        set('otf', (_32 = {},
        _32[0 /* ColorLight */] = '#7f4bb2',
        _32[1 /* IconIon */] = 'ion-social-tumblr',
        _32
        ));
        // Readme
        set(['md', 'markdown'], (_33 = {},
        _33[0 /* ColorLight */] = '#b94700',
        _33[1 /* IconIon */] = ['ion-social-markdown', 12],
        _33[2 /* IconDev */] = 'devicons devicons-markdown',
        _33
        ));
        // Git
        set('gitignore', (_34 = {},
        _34[0 /* ColorLight */] = '#cd5439',
        _34[1 /* IconIon */] = ['ion-minus-circled', 14],
        _34[2 /* IconDev */] = 'devicons devicons-git_commit',
        _34
        ));
        set('gitmodules', (_35 = {},
        _35[0 /* ColorLight */] = '#f64d27',
        _35[1 /* IconIon */] = ['ion-fork-repo', 17],
        _35[2 /* IconDev */] = 'devicons devicons-git_branch',
        _35
        ));
        // Webservers
        set('htaccess', (_36 = {},
        _36[0 /* ColorLight */] = '#93a8be',
        _36[1 /* IconIon */] = ['ion-ios-unlocked', 18],
        _36
        ));
        set('htpasswd', (_37 = {},
        _37[0 /* ColorLight */] = '#6c369c',
        _37[1 /* IconIon */] = ['ion-ios-locked', 18],
        _37
        ));
        set('conf', (_38 = {},
        _38[0 /* ColorLight */] = '#009900',
        _38[1 /* IconIon */] = 'ion-ios-gear',
        _38[2 /* IconDev */] = 'devicons devicons-aptana',
        _38
        ));
        // Archive
        set('zip', (_39 = {},
        _39[0 /* ColorLight */] = '#008858',
        _39[1 /* IconIon */] = 'ion-briefcase',
        _39[2 /* IconDev */] = ['devicons devicons-netbeans', 17],
        _39
        ));
        set('rar', (_40 = {},
        _40[0 /* ColorLight */] = '#005888',
        _40[1 /* IconIon */] = 'ion-briefcase',
        _40[2 /* IconDev */] = ['devicons devicons-netbeans', 17],
        _40
        ));
        set('7z', (_41 = {},
        _41[0 /* ColorLight */] = '#880058',
        _41[1 /* IconIon */] = 'ion-briefcase',
        _41[2 /* IconDev */] = ['devicons devicons-netbeans', 17],
        _41
        ));
        set('tgz', (_42 = {},
        _42[0 /* ColorLight */] = '#7900bc',
        _42[1 /* IconIon */] = 'ion-briefcase',
        _42[2 /* IconDev */] = ['devicons devicons-netbeans', 17],
        _42
        ));
        set('tar', (_43 = {},
        _43[0 /* ColorLight */] = '#885800',
        _43[1 /* IconIon */] = 'ion-briefcase',
        _43[2 /* IconDev */] = ['devicons devicons-netbeans', 17],
        _43
        ));
        set('gz', (_44 = {},
        _44[0 /* ColorLight */] = '#588800',
        _44[1 /* IconIon */] = 'ion-briefcase',
        _44[2 /* IconDev */] = ['devicons devicons-netbeans', 17],
        _44
        ));
        set('bzip', (_45 = {},
        _45[0 /* ColorLight */] = '#884300',
        _45[1 /* IconIon */] = 'ion-briefcase',
        _45[2 /* IconDev */] = ['devicons devicons-netbeans', 17],
        _45
        ));
        set('msi', (_46 = {},
        _46[0 /* ColorLight */] = '#6f8696',
        _46[1 /* IconIon */] = 'ion-briefcase',
        _46[2 /* IconDev */] = ['devicons devicons-netbeans', 17],
        _46
        ));
        set('dmg', (_47 = {},
        _47[0 /* ColorLight */] = '#6f8696',
        _47[1 /* IconIon */] = 'ion-briefcase',
        _47[2 /* IconDev */] = ['devicons devicons-netbeans', 17],
        _47
        ));
        set('xpi', (_48 = {},
        _48[0 /* ColorLight */] = '#5bac0d',
        _48[1 /* IconIon */] = 'ion-briefcase',
        _48[2 /* IconDev */] = ['devicons devicons-netbeans', 17],
        _48
        ));
        // Settings
        set([
            'project',
            'jscsrc',
            'jshintrc',
            'csslintrc',
            'htmlhintrc',
            'xmlhintrc',
            'todo',
            'classpath',
            'properties',
            'bowerrc',
            'gruntrc',
            'jsrc',
            'pro',
            'editorconfig',
            'iml'
        ], (_49 = {},
        _49[0 /* ColorLight */] = '#777777',
        _49[1 /* IconIon */] = 'ion-ios-gear',
        _49[2 /* IconDev */] = 'devicons devicons-aptana',
        _49
        ));
        set('csproj', (_50 = {},
        _50[0 /* ColorLight */] = '#5bb552',
        _50[1 /* IconIon */] = ['ion-ios-paper-outline', 18],
        _50[2 /* IconDev */] = 'devicons devicons-aptana',
        _50
        ));
        set('vbproj', (_51 = {},
        _51[0 /* ColorLight */] = '#486dae',
        _51[1 /* IconIon */] = ['ion-ios-paper-outline', 18],
        _51[2 /* IconDev */] = 'devicons devicons-aptana',
        _51
        ));
        set('sln', (_52 = {},
        _52[0 /* ColorLight */] = '#87c5de',
        _52[1 /* IconIon */] = ['ion-ios-paper-outline', 18],
        _52[2 /* IconDev */] = 'devicons devicons-aptana',
        _52
        ));
        set([
            'eslintrc',
            'eslintrc.js',
            'eslintrc.yaml',
            'eslintrc.yml',
            'eslintrc.json'
        ], (_53 = {},
        _53[0 /* ColorLight */] = '#3a33d1',
        _53[1 /* IconIon */] = 'ion-ios-gear',
        _53[2 /* IconDev */] = 'devicons devicons-aptana',
        _53
        ));
        // Other text files
        set('txt', (_54 = {},
        _54[0 /* ColorLight */] = '#4192c1',
        _54[1 /* IconIon */] = 'ion-document-text',
        _54
        ));
        set('log', (_55 = {},
        _55[0 /* ColorLight */] = '#225dc9',
        _55[1 /* IconIon */] = 'ion-clipboard',
        _55
        ));
        set('npmignore', (_56 = {},
        _56[0 /* ColorLight */] = '#cb3837',
        _56[1 /* IconIon */] = ['ion-minus-circled', 14],
        _56[2 /* IconDev */] = 'devicons devicons-npm',
        _56
        ));
        set('slugignore', (_57 = {},
        _57[0 /* ColorLight */] = '#0da064',
        _57[1 /* IconIon */] = ['ion-minus-circled', 14],
        _57
        ));
        set('dockerignore', (_58 = {},
        _58[0 /* ColorLight */] = '#0296C9',
        _58[1 /* IconIon */] = ['ion-minus-circled', 14],
        _58
        ));
        set('jpmignore', (_59 = {},
        _59[0 /* ColorLight */] = '#5bac0d',
        _59[1 /* IconIon */] = ['ion-minus-circled', 14],
        _59
        ));
        set(['yml', 'yaml'], (_60 = {},
        _60[0 /* ColorLight */] = '#008000',
        _60[1 /* IconIon */] = ['ion-navicon', 14],
        _60
        ));
        set('sqf', (_61 = {},
        _61[0 /* ColorLight */] = '#b9e11f',
        _61[1 /* IconIon */] = 'ion-wand',
        _61
        ));
        set(['csv', 'tsv'], (_62 = {},
        _62[0 /* ColorLight */] = '#217346',
        _62[1 /* IconIon */] = 'ion-grid',
        _62
        ));
        // LaTeX
        set(['tex', 'bib', 'sty'], (_63 = {},
        _63[0 /* ColorLight */] = '#262686',
        _63[1 /* IconIon */] = 'ion-document-text',
        _63
        ));
        //Singular Types
        set('applescript', (_64 = {},
        _64[0 /* ColorLight */] = '#afafaf',
        _64[1 /* IconIon */] = 'ion-social-apple',
        _64[2 /* IconDev */] = 'devicons devicons-apple',
        _64
        ));
        set('textile', (_65 = {},
        _65[0 /* ColorLight */] = '#6f8696',
        _65[1 /* IconIon */] = 'ion-quote',
        _65
        ));
        set('matlab', (_66 = {},
        _66[0 /* ColorLight */] = '#014495',
        _66[1 /* IconIon */] = 'ion-clipboard',
        _66
        ));
        set('lisp', (_67 = {},
        _67[0 /* ColorLight */] = '#f8c63d',
        _67[1 /* IconIon */] = 'ion-ios-paperplane',
        _67
        ));
        set('xsl', (_68 = {},
        _68[0 /* ColorLight */] = '#68217a',
        _68[1 /* IconIon */] = 'ion-code',
        _68[2 /* IconDev */] = 'devicons devicons-code',
        _68
        ));
        set('tcl', (_69 = {},
        _69[0 /* ColorLight */] = '#c3b15f',
        _69[1 /* IconIon */] = 'ion-code',
        _69[2 /* IconDev */] = 'devicons devicons-code',
        _69
        ));
        set('rst', (_70 = {},
        _70[0 /* ColorLight */] = '#6f8696',
        _70[1 /* IconIon */] = 'ion-ios-paper',
        _70[2 /* IconDev */] = ['devicons devicons-rust', 18],
        _70
        ));
        set('d', (_71 = {},
        _71[0 /* ColorLight */] = '#960000',
        _71[1 /* IconIon */] = 'ion-contrast',
        _71[2 /* IconDev */] = 'devicons devicons-dlang',
        _71
        ));
        set('r', (_72 = {},
        _72[0 /* ColorLight */] = '#8495C0',
        _72[1 /* IconIon */] = 'ion-ios-analytics',
        _72
        ));
        set('map', (_73 = {},
        _73[0 /* ColorLight */] = '#e0591f',
        _73[1 /* IconIon */] = 'ion-ios-photos-outline',
        _73
        ));
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2,
            _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18, _19, _20, _21, _22, _23, _24, _25,
            _26, _27, _28, _29, _30, _31, _32, _33, _34, _35, _36, _37, _38, _39, _40, _41, _42, _43, _44, _45, _46,
            _47, _48, _49, _50, _51, _52, _53, _54, _55, _56, _57, _58, _59, _60, _61, _62, _63, _64, _65, _66, _67,
            _68, _69, _70, _71, _72, _73;
    }

    exports.setExtensions = setExtensions;

    function setPrefixes(set) {
        set(['spec', 'test'], (_a = {},
        _a[0 /* ColorLight */] = '#146ae3',
        _a[1 /* IconIon */] = 'ion-android-radio-button-on',
        _a
        ));
        set('min', (_b = {},
        _b[0 /* ColorLight */] = '#f28b1d',
        _b[1 /* IconIon */] = ['ion-minus-circled', 14],
        _b
        ));
        var _a, _b;
    }

    exports.setPrefixes = setPrefixes;

    function setFullFileNames(set) {
        set('Dockerfile', (_a = {},
        _a[0 /* ColorLight */] = '#0296C9',
        _a[1 /* IconIon */] = ['ion-navicon', 14],
        _a[2 /* IconDev */] = ['devicons devicons-docker', 18],
        _a
        ));
        var _a;
    }

    exports.setFullFileNames = setFullFileNames;

    function setFileNames(set) {
        set('package', ['json'], (_a = {},
        _a[0 /* ColorLight */] = '#cb3837',
        _a[1 /* IconIon */] = 'ion-briefcase',
        _a[2 /* IconDev */] = 'devicons devicons-npm',
        _a
        ));
        set(['.brackets', 'brackets'], ['json'], (_b = {},
        _b[0 /* ColorLight */] = '#0083e8',
        _b[2 /* IconDev */] = 'devicons devicons-brackets',
        _b
        ));
        set('gulpfile', ['js', 'ts', 'coffee', 'babel.js'], (_c = {},
        _c[0 /* ColorLight */] = '#eb4a4b',
        _c[1 /* IconIon */] = 'ion-hammer',
        _c[2 /* IconDev */] = 'devicons devicons-gulp',
        _c
        ));
        set('gruntfile', ['js', 'coffee'], (_d = {},
        _d[0 /* ColorLight */] = '#fba919',
        _d[1 /* IconIon */] = 'ion-hammer',
        _d[2 /* IconDev */] = 'devicons devicons-grunt',
        _d
        ));
        var _a, _b, _c, _d;
    }

    exports.setFileNames = setFileNames;

    function getDefault() {
        return (_a = {},
        _a[1 /* IconIon */] = 'ion-document',
        _a[2 /* IconDev */] = 'devicons devicons-code_badge',
        _a
        );
        var _a;
    }

    exports.getDefault = getDefault;
});
