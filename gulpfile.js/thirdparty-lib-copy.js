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

const { src, dest, series } = require('gulp');
// removed require('merge-stream') node module. it gives wired glob behavior and some files goes missing
const mergeStream =   require('merge-stream');
const rename = require("gulp-rename");


// individual third party copy
function copyLicence(path, name) {
    console.log(`Copying licence file ${name}.markdown`);
    return src([path])
        .pipe(rename(`${name}.markdown`))
        .pipe(dest('src/thirdparty/licences/'));
}
function copyFiles(srcPathList, dstPath) {
    console.log(`Copying files ${dstPath}`);
    return src(srcPathList)
        .pipe(dest(dstPath));
}

let copyThirdPartyLibsAndLicences = series(
    // codemirror
    copyFiles.bind(copyFiles, ['node_modules/codemirror/addon/**/*'], 'src/thirdparty/CodeMirror/addon'),
    copyFiles.bind(copyFiles, ['node_modules/codemirror/keymap/**/*'], 'src/thirdparty/CodeMirror/keymap'),
    copyFiles.bind(copyFiles, ['node_modules/codemirror/lib/**/*'], 'src/thirdparty/CodeMirror/lib'),
    copyFiles.bind(copyFiles, ['node_modules/codemirror/mode/**/*'], 'src/thirdparty/CodeMirror/mode'),
    copyFiles.bind(copyFiles, ['node_modules/codemirror/theme/**/*'], 'src/thirdparty/CodeMirror/theme'),
    copyLicence.bind(copyLicence, 'node_modules/codemirror/LICENSE', 'codemirror')
);

/**
 * Add thirdparty libs copied to gitignore except the licence file.
 * @returns {Promise<PassThrough>}
 */
async function copyThirdPartyLibs(){
    return mergeStream(
        // @phcode/fs
        src(['node_modules/@phcode/fs/dist/virtualfs.js',
            'node_modules/@phcode/fs/dist/virtualfs.js.map'])
            .pipe(dest('src/phoenix')),
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
        // bootstrap
        src(['node_modules/bootstrap/dist/js/bootstrap.min.js', 'node_modules/bootstrap/dist/js/bootstrap.min.js.map',
            'node_modules/bootstrap/dist/css/bootstrap.min.css', 'node_modules/bootstrap/dist/css/bootstrap.min.css.map'])
            .pipe(dest('src/thirdparty/bootstrap')),
        src(['node_modules/bootstrap/LICENSE'])
            .pipe(rename("bootstrap.markdown"))
            .pipe(dest('src/thirdparty/licences/')),
        // hilightjs
        src(['node_modules/@highlightjs/cdn-assets/highlight.min.js'])
            .pipe(dest('src/thirdparty/highlight.js')),
        src(['node_modules/@highlightjs/cdn-assets/styles/*.*'])
            .pipe(dest('src/thirdparty/highlight.js/styles')),
        src(['node_modules/@highlightjs/cdn-assets/languages/*.*'])
            .pipe(dest('src/thirdparty/highlight.js/languages')),
        src(['node_modules/@highlightjs/cdn-assets/LICENSE'])
            .pipe(rename("highlight.js.markdown"))
            .pipe(dest('src/thirdparty/licences/')),
        // gfm-stylesheet
        src(['node_modules/@pixelbrackets/gfm-stylesheet/dist/gfm.min.css'])
            .pipe(dest('src/thirdparty/')), // AGPL 2.0 license addded to
        // prettier
        src(['node_modules/prettier/*.js'])
            .pipe(dest('src/extensions/default/Phoenix-prettier/thirdParty')),
        src(['node_modules/prettier/LICENSE'])
            .pipe(rename("prettier.markdown"))
            .pipe(dest('src/thirdparty/licences/')),
        // font-awesome
        src(['node_modules/@fortawesome/fontawesome-free/css/*'])
            .pipe(dest('src/thirdparty/fontawesome/css')),
        src(['node_modules/@fortawesome/fontawesome-free/js/*'])
            .pipe(dest('src/thirdparty/fontawesome/js')),
        src(['node_modules/@fortawesome/fontawesome-free/webfonts/*'])
            .pipe(dest('src/thirdparty/fontawesome/webfonts')),
        src(['node_modules/@fortawesome/fontawesome-free/svgs/brands/*'])
            .pipe(dest('src/thirdparty/fontawesome/svgs/brands')),
        src(['node_modules/@fortawesome/fontawesome-free/svgs/regular/*'])
            .pipe(dest('src/thirdparty/fontawesome/svgs/regular')),
        src(['node_modules/@fortawesome/fontawesome-free/svgs/solid/*'])
            .pipe(dest('src/thirdparty/fontawesome/svgs/solid')),
        src(['node_modules/@fortawesome/fontawesome-free/LICENSE.txt'])
            .pipe(rename("fontawesome.markdown"))
            .pipe(dest('src/thirdparty/licences/')),
        // devicons https://devicon.dev/
        src(['node_modules/devicon/devicon.min.css'])
            .pipe(dest('src/thirdparty/devicon/')),
        src(['node_modules/devicon/fonts/*.*'])
            .pipe(dest('src/thirdparty/devicon/fonts/')),
        src(['node_modules/devicon/LICENSE'])
            .pipe(rename("devicon.markdown"))
            .pipe(dest('src/thirdparty/licences/')),
        // mime-db
        src(['node_modules/mime-db/db.json'])
            .pipe(rename("mime-db.json"))
            .pipe(dest('src/thirdparty')),
        src(['node_modules/mime-db/LICENSE'])
            .pipe(rename("mime-db.markdown"))
            .pipe(dest('src/thirdparty/licences/')),
        // marked.js markdown rendering
        src(['node_modules/marked/marked.min.js'])
            .pipe(dest('src/extensions/default/Phoenix-live-preview/thirdparty')),
        src(['node_modules/marked/LICENSE.md'])
            .pipe(rename("marked.markdown"))
            .pipe(dest('src/thirdparty/licences/')),
        // @floating-ui for notification ui widget  floating-ui.dom.umd.min.js
        src(['node_modules/@floating-ui/core/dist/floating-ui.core.umd.min.js'])
            .pipe(dest('src/thirdparty')),
        src(['node_modules/@floating-ui/dom/dist/floating-ui.dom.umd.min.js'])
            .pipe(dest('src/thirdparty')),
        src(['node_modules/@floating-ui/core/LICENSE'])
            .pipe(rename("floating-ui.markdown"))
            .pipe(dest('src/thirdparty/licences/')),
        // documentation
        src(['node_modules/documentation/LICENSE'])
            .pipe(rename("documentation.markdown"))
            .pipe(dest('src/thirdparty/licences/'))
);
}

exports.copyAll = series(copyThirdPartyLibs, copyThirdPartyLibsAndLicences);
