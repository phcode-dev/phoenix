/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*jslint regexp: true */

define(function (require, exports, module) {


    // Brackets modules
    let FileUtils           = brackets.getModule("file/FileUtils"),
        FileSystem          = brackets.getModule("filesystem/FileSystem"),
        PreferencesManager  = brackets.getModule("preferences/PreferencesManager"),
        LanguageManager     = brackets.getModule("language/LanguageManager"),
        Strings             = brackets.getModule("strings"),
        PathUtils           = brackets.getModule("thirdparty/path-utils/path-utils");

    let enabled,                             // Only show preview if true
        prefs                      = null,   // Preferences
        extensionlessImagePreview;           // Whether to try and preview extensionless URLs

    // List of protocols which we will support for image preview urls
    let validProtocols = ["data:", "http:", "https:", "ftp:", "file:"];

    prefs = PreferencesManager.getExtensionPrefs("quickview");

    // Whether or not to try and show image previews for URLs missing extensions
    // (e.g., https://avatars2.githubusercontent.com/u/476009?v=3&s=200)
    prefs.definePreference("extensionlessImagePreview", "boolean", true, {
        description: Strings.DESCRIPTION_EXTENSION_LESS_IMAGE_PREVIEW
    });


    // Image preview provider -------------------------------------------------

    function imagePreviewProvider($previewContainer, editor, pos, token, line) {
        const $previewContent = $previewContainer.find(".preview-content");
        let cm = editor._codeMirror;

        // Check for image name
        let urlRegEx = /url\(([^\)]*)\)/gi,
            tokenString,
            urlMatch;

        if (token.type === "string") {
            tokenString = token.string;
        } else {
            urlMatch = urlRegEx.exec(line);
            while (urlMatch) {
                if (pos.ch < urlMatch.index) {
                    // match is past cursor, so stop looping
                    break;
                } else if (pos.ch <= urlMatch.index + urlMatch[0].length) {
                    tokenString = urlMatch[1];
                    break;
                }
                urlMatch = urlRegEx.exec(line);
            }
        }

        if (!tokenString) {
            return null;
        }

        // Strip leading/trailing quotes, if present
        tokenString = tokenString.replace(/(^['"])|(['"]$)/g, "");

        let sPos, ePos;
        let docPath = editor.document.file.fullPath;
        let imgPath;

        // Determine whether or not this URL/path is likely to be an image.
        let parsed = PathUtils.parseUrl(tokenString);
        // If the URL has a protocol, check if it's one of the supported protocols
        let hasProtocol = parsed.protocol !== "" && validProtocols.indexOf(parsed.protocol.trim().toLowerCase()) !== -1;
        let ext = parsed.filenameExtension.replace(/^\./, '');
        let language = LanguageManager.getLanguageForExtension(ext);
        let id = language && language.getId();
        let isImage = id === "image" || id === "svg";
        let loadFromDisk = null;

        // Use this URL if this is an absolute URL and either points to a
        // filename with a known image extension, or lacks an extension (e.g.,
        // a web service that returns an image). Honour the extensionlessImagePreview
        // preference as well in the latter case.
        if (hasProtocol && (isImage || (!ext && extensionlessImagePreview))) {
            imgPath = tokenString;
        }
        // Use this filename if this is a path with a known image extension.
        else if (!hasProtocol && isImage) {
            imgPath = '';
            loadFromDisk = window.path.normalize(FileUtils.getDirectoryPath(docPath) + tokenString);
        }

        if (!loadFromDisk && !imgPath) {
            return null;
        }

        if (urlMatch) {
            sPos = {line: pos.line, ch: urlMatch.index};
            ePos = {line: pos.line, ch: urlMatch.index + urlMatch[0].length};
        } else {
            sPos = {line: pos.line, ch: token.start};
            ePos = {line: pos.line, ch: token.end};
        }

        let imgPreview = "<div class='image-preview'>"          +
            "    <img src=\"" + imgPath + "\">"    +
            "</div>";

        function showHandlerWithImageURL(imageURL) {
            return new Promise((resolve, reject)=>{
                // Hide the preview container until the image is loaded.
                $previewContainer.hide();
                let img = $previewContainer.find(".image-preview > img");
                if(imageURL){
                    img[0].src = imageURL;
                }

                img.on("load", function () {
                    $previewContent
                        .append("<div class='img-size'>" +
                            this.naturalWidth + " &times; " + this.naturalHeight + " " + Strings.UNIT_PIXELS +
                            "</div>"
                        );
                    resolve();
                }).on("error", function (e) {
                    e.preventDefault();
                    reject();
                });
            });
        };

        function _imageToDataURI(file, cb) {
            let contentType = "data:image;base64,";
            if(file.name.endsWith('.svg')){
                contentType = "data:image/svg+xml;base64,";
            }
            file.read({encoding: window.fs.BYTE_ARRAY_ENCODING}, function (err, content, encoding, stat) {
                let base64 = window.btoa(
                    new Uint8Array(content)
                        .reduce((data, byte) => data + String.fromCharCode(byte), '')
                );
                let dataURL= contentType + base64;
                cb(null, dataURL);
            });
        }

        let showHandler = function () {
            return new Promise((resolve, reject)=>{
                if(loadFromDisk){
                    let imageFile = FileSystem.getFileForPath(loadFromDisk);
                    _imageToDataURI(imageFile, function (err, dataURL){
                        showHandlerWithImageURL(dataURL).then(resolve).catch(reject);
                    });
                } else {
                    showHandlerWithImageURL().then(resolve).catch(reject);
                }
            });
        };

        return {
            start: sPos,
            end: ePos,
            content: imgPreview,
            onShow: showHandler,
            _imgPath: imgPath || loadFromDisk
        };
    }

    function setExtensionlessImagePreview(_extensionlessImagePreview, doNotSave) {
        if (extensionlessImagePreview !== _extensionlessImagePreview) {
            extensionlessImagePreview = _extensionlessImagePreview;
            if (!doNotSave) {
                prefs.set("extensionlessImagePreview", enabled);
                prefs.save();
            }
        }
    }

    setExtensionlessImagePreview(prefs.get("extensionlessImagePreview"), true);

    prefs.on("change", "extensionlessImagePreview", function () {
        setExtensionlessImagePreview(prefs.get("extensionlessImagePreview"));
    });

    exports.imagePreviewProvider = imagePreviewProvider;

});
