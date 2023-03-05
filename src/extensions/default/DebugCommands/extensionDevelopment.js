/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*globals path, logger*/

define(function (require, exports, module) {
    const ProjectManager         = brackets.getModule("project/ProjectManager"),
        Commands                 = brackets.getModule("command/Commands"),
        CommandManager           = brackets.getModule("command/CommandManager"),
        Strings                  = brackets.getModule("strings"),
        StringUtils              = brackets.getModule("utils/StringUtils"),
        DocumentManager          = brackets.getModule("document/DocumentManager"),
        DefaultDialogs           = brackets.getModule("widgets/DefaultDialogs"),
        Dialogs                  = brackets.getModule("widgets/Dialogs"),
        UrlParams                = brackets.getModule("utils/UrlParams").UrlParams,
        FileSystem               = brackets.getModule("filesystem/FileSystem");

    function _showError(message, title = Strings.ERROR_LOADING_EXTENSION) {
        Dialogs.showModalDialog(
            DefaultDialogs.DIALOG_ID_ERROR,
            title, message
        );
    }

    function _validatePackageJson(docText) {
        try {
            let packageJson = JSON.parse(docText);
            let requiredFields = ["name", "title", "description", "homepage", "version", "author", "license",
                "engines"];
            let missingFields = [];
            for(let requiredField of requiredFields){
                if(!packageJson[requiredField]){
                    missingFields.push(requiredField);
                }
            }
            if(packageJson.engines && !packageJson.engines.brackets){
                missingFields.push(`engines:{"brackets": ">=2.0.0"}`);
            }
            if(missingFields.length){
                _showError(StringUtils.format(Strings.ERROR_INVALID_EXTENSION_PACKAGE_FIELDS, missingFields));
                return false;
            }
            return true;
        } catch (e) {
            console.log("Cannot load extension", Strings.ERROR_INVALID_EXTENSION_PACKAGE);
            _showError(Strings.ERROR_INVALID_EXTENSION_PACKAGE);
            return false;
        }
    }

    function loadCurrentExtension() {
        const projectRoot = ProjectManager.getProjectRoot().fullPath;
        const file = FileSystem.getFileForPath(projectRoot + "package.json");
        DocumentManager.getDocumentText(file).done(function (docText) {
            console.log(docText);
            if(!_validatePackageJson(docText)){
                return;
            }
            CommandManager.execute(Commands.APP_RELOAD, false, projectRoot);
        }).fail((err)=>{
            console.log("No extension package.json in ", file.fullPath, err);
            Dialogs.showModalDialog(
                DefaultDialogs.DIALOG_ID_ERROR,
                Strings.ERROR_LOADING_EXTENSION,
                Strings.ERROR_NO_EXTENSION_PACKAGE
            );
        });
    }

    function unloadCurrentExtension() {
        CommandManager.execute(Commands.APP_RELOAD, false, []);
    }

    function isProjectLoadedAsExtension() {
        const params  = new UrlParams();

        // Make sure the Reload Without User Extensions parameter is removed
        params.parse();
        return !!params.get("loadDevExtensionPath");
    }

    exports.loadCurrentExtension = loadCurrentExtension;
    exports.unloadCurrentExtension = unloadCurrentExtension;
    exports.isProjectLoadedAsExtension = isProjectLoadedAsExtension;
});
