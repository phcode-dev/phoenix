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
    const CommandManager     = brackets.getModule("command/CommandManager"),
        Commands           = brackets.getModule("command/Commands"),
        Dialogs = brackets.getModule("widgets/Dialogs"),
        DefaultDialogs = brackets.getModule("widgets/DefaultDialogs"),
        Strings = brackets.getModule("strings");

    const NEW_FEATURE_MARKDOWN_SHOWN_HASH = "Newly_added_features.md.shown.hash";

    function _getUpdateMarkdownPath() {
        return Phoenix.baseURL + "assets/default-project/en/Newly_added_features.md";
    }

    async function _digestMessage(message) {
        const msgUint8 = new TextEncoder().encode(message);                           // encode as (utf-8) Uint8Array
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);           // hash the message
        const hashArray = Array.from(new Uint8Array(hashBuffer));                     // convert buffer to byte array
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join(''); // convert bytes to hex string
        return hashHex;
    }

    async function _getUpdateMarkdownText() {
        return new Promise((resolve, reject)=>{
            fetch(_getUpdateMarkdownPath())
                .then(response => response.text())
                .then(async function (text) {
                    resolve(text);
                })
                .catch(reject);
        });
    }

    async function _setUpdateShown() {
        let markdownText = await _getUpdateMarkdownText();
        const hash = await _digestMessage(markdownText);
        localStorage.setItem(NEW_FEATURE_MARKDOWN_SHOWN_HASH, hash);
    }

    function _showNewFeatureMarkdownDoc() {
        // We wait for few seconds after boot to grab user attention
        setTimeout(()=>{
            CommandManager.execute(Commands.FILE_OPEN, {
                fullPath: _getUpdateMarkdownPath()
            });
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
            }
        }, 5000);
    }

    async function _showNewUpdatesIfPresent() {
        let markdownText = await _getUpdateMarkdownText();
        const hash = await _digestMessage(markdownText);
        const lastShownHash = localStorage.getItem(NEW_FEATURE_MARKDOWN_SHOWN_HASH);
        if(hash !== lastShownHash){
            _showNewFeatureMarkdownDoc();
            await _setUpdateShown();
        }
        _showReloadForUpdateDialog();
    }

    exports.init = function () {
        if(!Phoenix.firstBoot && !window.testEnvironment){
            _showNewUpdatesIfPresent();
            return;
        }
        _setUpdateShown();
    };
});
