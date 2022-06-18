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

let createProjectBtn, locationInput, projectNameInput, createProjectWithNameBtn;

const urlSearchParams = new URLSearchParams(window.location.search);
const params = Object.fromEntries(urlSearchParams.entries());
const PARAM_SUGGESTED_NAME = params.suggestedName || "project";
const PARAM_SUGGESTED_TITLE = params.title || Strings.CMD_PROJECT_NEW;
const PARAM_SUGGESTED_URL = params.url;
const FLATTEN_ZIP_FIRST_LEVEL_DIR = (params.flattenZipFirstLevel ==='true');
const LICENSE = params.license;
const LICENSE_URL = params.licenseURL;
const CREDITS = params.credits;
const CREDITS_URL = params.creditsURL;
const PREVIEW_URL = params.previewURL;
const BACK_URL = params.backURL;

function _validateProjectLocation() {
    if(!window.showDirectoryPicker){ // fs access apis not present
        $(document.getElementById("projectLocation")).addClass("forced-hidden");
        return true;
    }
    let location = locationInput.value;
    if( location === Strings.PLEASE_SELECT_A_FOLDER){
        $(locationInput).addClass("error-border");
        return false;
    }
    $(locationInput).removeClass("error-border");
    return true;
}

async function _validateSuggestedName() {
    let suggestedName = projectNameInput.value;
    if(await newProjectExtension.alreadyExists(suggestedName)){
        $(projectNameInput).addClass("error-border");
        return;
    }
    $(projectNameInput).removeClass("error-border");
}

function _selectFolder() {
    newProjectExtension.showFolderSelect()
        .then(file =>{
            locationInput.fullPath = file;
            locationInput.value = file.replace(newProjectExtension.getMountDir(), "");
            _validateProjectLocation();
        });
}

function _createProjectClicked() {
    if(_validateProjectLocation()){
        newProjectExtension.downloadAndOpenProject(
            PARAM_SUGGESTED_URL,
            locationInput.fullPath, PARAM_SUGGESTED_NAME, FLATTEN_ZIP_FIRST_LEVEL_DIR)
            .then(()=>{
                Metrics.countEvent(Metrics.EVENT_TYPE.NEW_PROJECT, "fromURL.Click", "create.success");
                newProjectExtension.closeDialogue();
            });
    } else {
        newProjectExtension.showErrorDialogue(
            Strings.MISSING_FIELDS,
            Strings.PLEASE_FILL_ALL_REQUIRED);
    }
    Metrics.countEvent(Metrics.EVENT_TYPE.NEW_PROJECT, "fromURL.btnClick", "create");
}

function _showLicensingInfo() {
    if(LICENSE || LICENSE_URL){
        $(document.getElementById("License")).removeClass("forced-hidden");
        let el = document.getElementById("licenseLink");
        el.textContent = LICENSE || LICENSE_URL;
        let licenseURL = LICENSE_URL || '#';
        el.href = licenseURL;
        if(licenseURL === '#'){
            $(el).attr('target', '');
        }
    }
    if(CREDITS || CREDITS_URL){
        $(document.getElementById("Credits")).removeClass("forced-hidden");
        let el = document.getElementById("creditsLink");
        el.textContent = CREDITS || CREDITS_URL;
        let creditsURL = CREDITS_URL || '#';
        el.href = creditsURL;
        if(creditsURL === '#'){
            $(el).attr('target', '');
        }
    }
}

function _showPreview() {
    if(!PREVIEW_URL){
        return;
    }
    $(document.getElementById("previewBox")).removeClass("forced-hidden");
    document.getElementById("bigFrame").src = PREVIEW_URL;
    document.getElementById("littleFrame").src = PREVIEW_URL;
}

function _setupNavigation() {
    if(BACK_URL){
        document.getElementById("backButton").src = BACK_URL;
    }
}

function initNewProjectFromURL() {
    _setupNavigation();
    if(!window.showDirectoryPicker){ // fs access apis not present
        $(document.getElementById("projectLocation")).addClass("forced-hidden");
    } else {
        $(document.getElementById("projectName")).addClass("forced-hidden");
    }
    document.getElementById("titleNewProject").textContent = PARAM_SUGGESTED_TITLE;
    projectNameInput = document.getElementById("projectNameInput");
    locationInput = document.getElementById("locationInput");
    createProjectBtn = document.getElementById("createProjectBtn");
    createProjectWithNameBtn = document.getElementById("createProjectWithNameBtn");
    createProjectBtn.onclick = _createProjectClicked;
    createProjectWithNameBtn.onclick = _createProjectClicked;
    $(projectNameInput).keyup(_validateSuggestedName);
    locationInput.value = Strings.PLEASE_SELECT_A_FOLDER;
    projectNameInput.value = PARAM_SUGGESTED_NAME;
    locationInput.onclick = _selectFolder;
    _showLicensingInfo();
    _showPreview();
    _validateProjectLocation();
    _validateSuggestedName();
}
