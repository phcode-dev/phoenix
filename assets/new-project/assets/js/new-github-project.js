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

/*global */
/*eslint no-console: 0*/
/*eslint strict: ["error", "global"]*/
/* jshint ignore:start */

let createProjectBtn, websiteURLInput, locationInput, openFolderBtn;
const FLATTEN_ZIP_FIRST_LEVEL_DIR = true;

function _isValidGitHubURL(url) {
    // strip trailing slash
    url = url.replace(/\/$/, "");
    let githubPrefix = "https://github.com/";
    let components = url.replace("https://github.com/", '').split('/');
    if(!url.startsWith(githubPrefix) || components.length !== 2){
        return false;
    }
    return true;
}

function _fixGitHubBrokenURL() {
    let githubPrefix = "https://github.com/";
    let githubURL = websiteURLInput.value;
    if(githubURL.startsWith("http:")){
        githubURL = githubURL.replace("http:", "https:");
    }
    if(!githubURL.startsWith(githubPrefix)){
        return;
    }
    // strip any query string params if present
    let queryParamTrimIndex  = githubURL.indexOf('?') >= 0 ? githubURL.indexOf('?') : githubURL.length;
    githubURL = githubURL.substring(0, queryParamTrimIndex);
    // trim everything after https://github.com/orgname/repo/... to https://github.com/orgname/repo
    let components = githubURL.replace("https://github.com/", '').split('/');
    if(components.length > 2){
        githubURL = `https://github.com/${components[0]}/${components[1]}`;
    }
    websiteURLInput.value = githubURL;
}

function _validateGitHubURL() {
    _fixGitHubBrokenURL();
    let githubURL = websiteURLInput.value;
    if(_isValidGitHubURL(githubURL)){
        $(websiteURLInput).removeClass("error-border");
        return true;
    }
    $(websiteURLInput).addClass("error-border");
    return false;
}

function _validateProjectLocation() {
    if(!window.showDirectoryPicker){ // fs access apis not present
        $(document.getElementById("projectLocation")).addClass("forced-hidden");
        return true;
    }
    let location = locationInput.value;
    if( location === window.Strings.PLEASE_SELECT_A_FOLDER){
        $(locationInput).addClass("error-border");
        return false;
    }
    $(locationInput).removeClass("error-border");
    return true;
}

function _validate() {
    return _validateGitHubURL()
        && _validateProjectLocation();
}

function _selectFolder() {
    window.newProjectExtension.showFolderSelect()
        .then(file =>{
            locationInput.fullPath = file;
            locationInput.value = file.replace("/mnt/", "");
            _validateProjectLocation();
        });
}

function _createProjectClicked() {
    if(_validate()){
        let githubURL = websiteURLInput.value;
        let components = githubURL.replace("https://github.com/", '').split('/');
        let zipURL = `https://phcode.site/getGitHubZip?org=${components[0]}&repo=${components[1]}`;
        let suggestedProjectName = `${components[0]}-${components[1]}`;
        window.newProjectExtension.downloadAndOpenProject(
            zipURL,
            locationInput.fullPath, suggestedProjectName, FLATTEN_ZIP_FIRST_LEVEL_DIR)
            .then(window.newProjectExtension.closeDialogue);
    } else {
        window.newProjectExtension.showErrorDialogue(
            window.Strings.MISSING_FIELDS,
            window.Strings.PLEASE_FILL_ALL_REQUIRED);
    }
}

function initGithubProject() {
    createProjectBtn = document.getElementById("createProjectBtn");
    websiteURLInput = document.getElementById("websiteURLInput");
    locationInput = document.getElementById("locationInput");
    openFolderBtn = document.getElementById("openFolderBtn");
    createProjectBtn.onclick = _createProjectClicked;
    $(websiteURLInput).keyup(_validate);
    locationInput.value = window.Strings.PLEASE_SELECT_A_FOLDER;
    locationInput.onclick = _selectFolder;
    openFolderBtn.onclick = _selectFolder;
    _validate();
}
