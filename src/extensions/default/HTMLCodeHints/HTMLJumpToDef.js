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

/*global path */

define(function (require, exports, module) {

    const AppInit = brackets.getModule("utils/AppInit"),
        JumpToDefManager = brackets.getModule("features/JumpToDefManager"),
        CommandManager     = brackets.getModule("command/CommandManager"),
        Commands           = brackets.getModule("command/Commands"),
        FileViewController = brackets.getModule("project/FileViewController");

    function HTMLJumpToDefProvider() {
    }

    /**
     * Check to see if the html token under token os of the form href="file" or src="file"
     * @param editor
     * @param token
     * @private
     */
    function _isSrcOrHrefString(editor, token) {
        if(token.type !== "string"){
            return false;
        }
        const equalsToken = editor.getPreviousToken({line: token.line, ch: token.start+1}); // possble = token
        const hrefOrSrcToken = editor.getPreviousToken({line: equalsToken.line, ch: equalsToken.start+1});
        return (equalsToken.string === "=" && ["href", "src"].includes(hrefOrSrcToken.string));
    }

    const jumpTokenTypes = ["tag", "string"];

    HTMLJumpToDefProvider.prototype.canJumpToDef = function (editor, optionalPosition) {
        let pos = optionalPosition || editor.getCursorPos();
        let token = editor.getToken(pos);
        if(token && token.type && jumpTokenTypes.includes(token.type)){
            return true;
        }
        return false;
    };

    function _openFile(fileRelativePath, mainDocPath) {
        if(fileRelativePath.startsWith("http://") || fileRelativePath.startsWith("https://")
            || fileRelativePath.startsWith("phtauri://") || fileRelativePath.startsWith("asset://")){
            return FileViewController.openAndSelectDocument(fileRelativePath, FileViewController.PROJECT_MANAGER);
        }
        const targetPath = path.resolve(mainDocPath, fileRelativePath);
        return FileViewController.openAndSelectDocument(targetPath, FileViewController.PROJECT_MANAGER);
    }

    /**
     * Method to handle jump to definition feature.
     */
    HTMLJumpToDefProvider.prototype.doJumpToDef = function (editor) {
        if(!this.canJumpToDef(editor)){
            return new $.Deferred().reject().promise();
        }
        const token = editor.getToken();
        if(_isSrcOrHrefString(editor, token)) {
            return _openFile(token.string.replace(/['"]+/g, ''), editor.document.file.parentPath);
        }
        return CommandManager.execute(Commands.TOGGLE_QUICK_EDIT);
    };

    AppInit.appReady(function () {
        var jdProvider = new HTMLJumpToDefProvider();
        JumpToDefManager.registerJumpToDefProvider(jdProvider, ["html"], 0);
    });

});
