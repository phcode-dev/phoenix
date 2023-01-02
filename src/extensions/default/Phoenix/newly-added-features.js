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

/*globals Phoenix*/

define(function (require, exports, module) {
    const FileViewController    = brackets.getModule("project/FileViewController"),
        DocumentManager = brackets.getModule("document/DocumentManager"),
        FileSystem = brackets.getModule("filesystem/FileSystem"),
        FileUtils = brackets.getModule("file/FileUtils"),
        Dialogs = brackets.getModule("widgets/Dialogs"),
        DefaultDialogs = brackets.getModule("widgets/DefaultDialogs"),
        Strings = brackets.getModule("strings"),
        Metrics = brackets.getModule("utils/Metrics");

    function _getUpdateMarkdownURL() {
        return Phoenix.baseURL + "assets/default-project/en/Newly_added_features.md";
    }

    function _getUpdateMarkdownLocalPath() {
        return Phoenix.VFS.getDefaultProjectDir() + "Newly_added_features.md";
    }

    async function _getUpdateMarkdownText() {
        return new Promise((resolve, reject)=>{
            fetch(_getUpdateMarkdownURL())
                .then(response => response.text())
                .then(async function (text) {
                    resolve(text);
                })
                .catch(reject);
        });
    }

    function _showNewFeatureMarkdownDoc() {
        // We wait for few seconds after boot to grab user attention
        setTimeout(()=>{
            FileViewController.openFileAndAddToWorkingSet(_getUpdateMarkdownLocalPath());
            Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "newFeatMD", "shown");
        }, 3000);
    }

    function _showReloadForUpdateDialog() {
        setTimeout(()=>{
            if(window.Phoenix.updatePendingReload){
                Dialogs.showModalDialog(
                    DefaultDialogs.DIALOG_ID_INFO,
                    Strings.UPDATE_AVAILABLE_TITLE,
                    Strings.UPDATE_RELOAD_APP
                );
                Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "updateDlg",
                    window.Phoenix.updatePendingReloadReason || "shown");
            }
        }, 5000);
    }

    async function _readMarkdownTextFile() {
        try{
            let markdownFile = FileSystem.getFileForPath(_getUpdateMarkdownLocalPath());
            return await window.jsPromise(DocumentManager.getDocumentText(markdownFile));
        } catch(e){
            return "";
        }
    }

    async function _showNewUpdatesIfPresent() {
        // codemirror documents are always \n instead of \r\n line endings. so we strip here too
        let newMarkdownText = (await _getUpdateMarkdownText()).replace(/\r/g, '');
        let currentMarkdownText = (await _readMarkdownTextFile()).replace(/\r/g, '');
        if(newMarkdownText !== currentMarkdownText){
            let markdownFile = FileSystem.getFileForPath(_getUpdateMarkdownLocalPath());
            // if the user overwrites the markdown file, then the user edited content will be nuked here.
            FileUtils.writeText(markdownFile, newMarkdownText, true)
                .done(_showNewFeatureMarkdownDoc)
                .fail((e)=>{
                    console.error("Error while showing new feature markdown on update", e);
                });
        }
        _showReloadForUpdateDialog();
    }

    exports.init = function () {
        if(!Phoenix.firstBoot && !window.testEnvironment){
            _showNewUpdatesIfPresent();
        }
    };
});
