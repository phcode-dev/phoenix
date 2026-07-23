/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

define(function (require, exports, module) {


    const DocumentManager     = require("document/DocumentManager"),
        MediaViewTemplate   = require("text!htmlContent/media-view.html"),
        ProjectManager      = require("project/ProjectManager"),
        LanguageManager     = require("language/LanguageManager"),
        MainViewFactory     = require("view/MainViewFactory"),
        Strings             = require("strings"),
        StringUtils         = require("utils/StringUtils"),
        FileSystem          = require("filesystem/FileSystem"),
        FileSystemError     = require("filesystem/FileSystemError"),
        FileUtils           = require("file/FileUtils"),
        _                   = require("thirdparty/lodash"),
        Mustache            = require("thirdparty/mustache/mustache");

    const _viewers = {};

    // Mime types for the media extensions we can play in the embedded browser engine
    const _MIME_TYPES = {
        "mp4": "video/mp4",
        "m4v": "video/mp4",
        "webm": "video/webm",
        "mkv": "video/webm",
        "ogv": "video/ogg",
        "mov": "video/quicktime",
        "mp3": "audio/mpeg",
        "wav": "audio/wav",
        "ogg": "audio/ogg",
        "m4a": "audio/mp4",
        "flac": "audio/flac",
        "aac": "audio/aac",
        "aif": "audio/aiff",
        "aiff": "audio/aiff"
    };

    function _getMimeType(fullPath, isAudio) {
        const extension = FileUtils.getFileExtension(fullPath).toLowerCase();
        return _MIME_TYPES[extension] || (isAudio ? "audio/mpeg" : "video/mp4");
    }

    // blob: URLs are rejected by the media loader on the custom app protocol in native builds
    // ("Media load rejected by URL safety check"), so we use a data URI like ImageViewer does.
    function _mediaToDataURI(file, isAudio, cb) {
        file.read({encoding: window.fs.BYTE_ARRAY_ENCODING}, function (err, content) {
            if (err) {
                cb(err);
                return;
            }
            const bytes = new Uint8Array(content),
                chunkSize = 0x8000,
                chunks = [];
            for (let i = 0; i < bytes.length; i += chunkSize) {
                chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize)));
            }
            const dataURI = "data:" + _getMimeType(file.fullPath, isAudio) + ";base64," + window.btoa(chunks.join(""));
            cb(null, dataURI);
        });
    }

    /**
     * Format a duration in seconds as h:mm:ss / m:ss for display
     * @param {number} seconds
     * @return {string}
     * @private
     */
    function _formatDuration(seconds) {
        if (!isFinite(seconds)) {
            return "";
        }
        const totalSeconds = Math.round(seconds),
            hrs = Math.floor(totalSeconds / 3600),
            mins = Math.floor((totalSeconds % 3600) / 60),
            secs = totalSeconds % 60,
            paddedSecs = (secs < 10 ? "0" : "") + secs;
        if (hrs) {
            const paddedMins = (mins < 10 ? "0" : "") + mins;
            return hrs + ":" + paddedMins + ":" + paddedSecs;
        }
        return mins + ":" + paddedSecs;
    }

    /**
     * MediaView objects are constructed when a video or audio file is opened
     * @see {@link Pane} for more information about where MediaViews are rendered
     *
     * @constructor
     * @param {!File} file - The media file object to render
     * @param {!jQuery} $container - The container to render the media view in
     */
    function MediaView(file, $container) {
        this.file = file;
        this._isAudio = (LanguageManager.getLanguageForPath(file.fullPath).getId() === "audio");
        this.$el = $(Mustache.render(MediaViewTemplate, {isAudio: this._isAudio}));
        $container.append(this.$el);

        this._naturalWidth = 0;
        this._naturalHeight = 0;

        this.relPath = ProjectManager.getProjectRelativeOrDisplayPath(this.file.fullPath);

        this.$mediaPath = this.$el.find(".media-path");
        this.$mediaPreview = this.$el.find(".media-preview");
        this.$mediaData = this.$el.find(".media-data");
        this.$mediaError = this.$el.find(".media-error");

        this.$mediaPath.text(this.relPath).attr("title", this.relPath);
        this.$mediaPreview.on("loadedmetadata", _.bind(this._onMediaLoaded, this));
        this.$mediaPreview.on("error", _.bind(this._onMediaError, this));

        _viewers[file.fullPath] = this;

        DocumentManager.on("fileNameChange.MediaView", _.bind(this._onFilenameChange, this));

        this._loadMedia();
    }

    /**
     * Reads the media file and points the media element at its content
     * @private
     */
    MediaView.prototype._loadMedia = function () {
        const self = this;
        _mediaToDataURI(this.file, this._isAudio, function (err, dataURI) {
            if (err) {
                self._showError(err === FileSystemError.EXCEEDS_MAX_FILE_SIZE
                    ? StringUtils.format(Strings.MEDIA_VIEWER_FILE_TOO_LARGE, "16 MB")
                    : Strings.MEDIA_VIEWER_FORMAT_NOT_SUPPORTED);
                return;
            }
            self.$mediaError.hide();
            self.$mediaPreview.show();
            self.$mediaPreview[0].src = dataURI;
        });
    };

    /**
     * Shows an error message instead of the media element
     * @param {string} message
     * @private
     */
    MediaView.prototype._showError = function (message) {
        this.$mediaPreview.hide();
        this.$mediaError.text(message).show();
    };

    /**
     * DocumentManger.fileNameChange handler - when a media file is renamed, we must
     * update the view
     *
     * @param {jQuery.Event} e - event
     * @param {!string} oldPath - the name of the file that's changing changing
     * @param {!string} newPath - the name of the file that's changing changing
     * @private
     */
    MediaView.prototype._onFilenameChange = function (e, oldPath, newPath) {
        if (this.file.fullPath === newPath) {
            this.relPath = ProjectManager.getProjectRelativeOrDisplayPath(newPath);
            this.$mediaPath.text(this.relPath).attr("title", this.relPath);
        }
    };

    /**
     * <video>/<audio>.on("loadedmetadata") handler - updates content of the media view
     * with dimensions (video only), duration and file size
     * @param {Event} e - event
     * @private
     */
    MediaView.prototype._onMediaLoaded = function (e) {
        const parts = [];

        if (!this._isAudio) {
            this._naturalWidth = e.currentTarget.videoWidth;
            this._naturalHeight = e.currentTarget.videoHeight;
            parts.push(this._naturalWidth + " &times; " + this._naturalHeight + " " + Strings.UNIT_PIXELS);
        }

        const duration = _formatDuration(e.currentTarget.duration);
        if (duration) {
            parts.push(duration);
        }

        const self = this;
        this.file.stat(function (err, stat) {
            if (!err && stat.size) {
                parts.push(StringUtils.prettyPrintBytes(stat.size, 2));
            }
            const mediaInfo = parts.join(" &mdash; ");
            self.$mediaData.html(mediaInfo)
                .attr("title", mediaInfo
                    .replace(/&times;/g, "x")
                    .replace(/&mdash;/g, "-"));
        });
    };

    /**
     * <video>/<audio>.on("error") handler - shown when the browser cannot decode the media
     * @private
     */
    MediaView.prototype._onMediaError = function () {
        this._showError(Strings.MEDIA_VIEWER_FORMAT_NOT_SUPPORTED);
    };

    /**
     * View Interface functions
     */

    /*
     * Retrieves the file object for this view
     * return {!File} the file object for this view
     */
    MediaView.prototype.getFile = function () {
        return this.file;
    };

    /*
     * Updates the layout of the view
     */
    MediaView.prototype.updateLayout = function () {
        const $container = this.$el.parent();

        const pos = $container.position(),
            iWidth = $container.innerWidth(),
            iHeight = $container.innerHeight(),
            oWidth = $container.outerWidth(),
            oHeight = $container.outerHeight();

        // $view is "position:absolute" so
        //  we have to update the height, width and position
        this.$el.css({top: pos.top + ((oHeight - iHeight) / 2),
            left: pos.left + ((oWidth - iWidth) / 2),
            width: iWidth,
            height: iHeight});
    };

    /*
     * Destroys the view
     */
    MediaView.prototype.destroy = function () {
        delete _viewers[this.file.fullPath];
        DocumentManager.off(".MediaView");
        this.$mediaPreview.off("loadedmetadata error");
        this.$mediaPreview.removeAttr("src");
        this.$el.remove();
    };

    /*
     * Refreshes the media preview with what's on disk
     */
    MediaView.prototype.refresh = function () {
        this._loadMedia();
    };

    /*
     * Creates a media view object and adds it to the specified pane
     * @param {!File} file - the file to create a media view of
     * @param {!Pane} pane - the pane in which to host the view
     * @return {jQuery.Promise}
     */
    function _createMediaView(file, pane) {
        let view = pane.getViewForPath(file.fullPath);

        if (view) {
            pane.showView(view);
        } else {
            view = new MediaView(file, pane.$content);
            pane.addView(view, true);
        }
        return new $.Deferred().resolve().promise();
    }

    /**
     * Handles file system change events so we can refresh
     *  media viewers for the files that changed on disk due to external editors
     * @param {jQuery.event} event - event object
     * @param {?File} entry - file object that changed
     * @param {Array.<FileSystemEntry>=} added If entry is a Directory, contains zero or more added children
     * @param {Array.<FileSystemEntry>=} removed If entry is a Directory, contains zero or more removed children
     */
    function _handleFileSystemChange(event, entry, added, removed) {
        if (!entry || entry.isDirectory) {
            return;
        }

        const viewer = _viewers[entry.fullPath];
        if (viewer) {
            viewer.refresh();
        }
    }

    FileSystem.on("change", _handleFileSystemChange);

    /*
     * Initialization, register our view factory
     */
    MainViewFactory.registerViewFactory({
        canOpenFile: function (fullPath) {
            const langId = LanguageManager.getLanguageForPath(fullPath).getId();
            return (langId === "video" || langId === "audio");
        },
        openFile: function (file, pane) {
            return _createMediaView(file, pane);
        }
    });

    /*
     * This is for extensions that want to create a
     * view factory based on MediaViewer
     */
    exports.MediaView = MediaView;
});
