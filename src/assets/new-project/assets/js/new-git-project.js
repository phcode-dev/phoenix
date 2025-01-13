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

/*global newProjectExtension, Strings, Metrics*/
/*eslint no-console: 0*/
/*eslint strict: ["error", "global"]*/
/* jshint ignore:start */

function desktopInit() {
    const LAST_GIT_CLONE_BASE_DIR = "PH_LAST_GIT_CLONE_BASE_DIR";
    let createProjectBtn, websiteURLInput, locationInput;

    function _validateGitURL(errors) {
        let gitURL = websiteURLInput.value;
        if(gitURL){
            $(websiteURLInput).removeClass("error-border");
            return true;
        }
        $(websiteURLInput).addClass("error-border");
        errors.push(`<span><i class="fas fa-exclamation-triangle" style="color: #f89406"></i>&nbsp;&nbsp;${Strings.ERROR_GIT_URL_INVALID}</span>`);
        return false;
    }

    function _validateProjectLocation(errors) {
        let location = locationInput.value;
        if( location === Strings.PLEASE_SELECT_A_FOLDER){
            $(locationInput).addClass("error-border");
            return false;
        }
        if(locationInput.error){
            errors.push(`<span><i class="fas fa-exclamation-triangle" style="color: #f89406"></i>&nbsp;&nbsp;${locationInput.error}</span>`);
            $(locationInput).addClass("error-border");
            return false;
        }
        $(locationInput).removeClass("error-border");
        return true;
    }

    function _validate() {
        const errors = [];
        let isValid = _validateGitURL(errors);
        isValid = _validateProjectLocation(errors) && isValid;
        $(createProjectBtn).prop('disabled', !isValid);
        const $messageDisplay = $("#messageDisplay");
        $messageDisplay.html("");
        if(!isValid) {
            $messageDisplay.html(errors.join("<br>"));
        }
        return isValid;
    }

    async function _deduceClonePath(newPath) {
        if(!newPath){
            newPath = locationInput.originalPath;
        }
        if(!newPath){
            return;
        }
        const {clonePath, error} = await newProjectExtension.getGitCloneDir(newPath, websiteURLInput.value);
        locationInput.clonePath = clonePath;
        locationInput.value = window.top.Phoenix.fs.getTauriPlatformPath(clonePath);
        locationInput.error = error;
        locationInput.originalPath = newPath;
    }

    function _selectFolder() {
        newProjectExtension.showFolderSelect(locationInput.originalPath || "")
            .then((newPath)=>{
                _deduceClonePath(newPath).then(_validate);
            }).catch((err)=>{
                console.error("user cancelled or error", err);
            });
    }

    function _createProjectClicked() {
        localStorage.setItem(LAST_GIT_CLONE_BASE_DIR, locationInput.originalPath);
        newProjectExtension.gitClone(websiteURLInput.value, locationInput.clonePath);
        Metrics.countEvent(Metrics.EVENT_TYPE.NEW_PROJECT, "git.Click", "create");
        newProjectExtension.closeDialogue();
    }

    function initGitProject() {
        $(".label-clone").text(Strings.GIT_CLONE_URL);
        createProjectBtn = document.getElementById("createProjectBtn");
        websiteURLInput = document.getElementById("websiteURLInput");
        locationInput = document.getElementById("locationInput");
        createProjectBtn.onclick = _createProjectClicked;
        $(websiteURLInput).keyup(()=>{
            _deduceClonePath().then(_validate);
        });
        locationInput.value = Strings.PLEASE_SELECT_A_FOLDER;
        locationInput.onclick = _selectFolder;
        websiteURLInput.value = "https://github.com/phcode-dev/HTML-Starter-Templates.git";
        _deduceClonePath(localStorage.getItem(LAST_GIT_CLONE_BASE_DIR)).then(_validate);
    }
    window.initGitProject = initGitProject;
}

if(window.top.Phoenix.isNativeApp){
    desktopInit();
}
