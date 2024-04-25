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
let projectLocation = null, projectName = null;

function _computeProjectPath() {
    if($(projectNameInput).is(":visible")){
        let suggestedName = projectNameInput.value;
        if(suggestedName && projectLocation){
            return projectLocation+suggestedName;
        }
        return null;
    }
    return projectLocation;
}

async function _validateProjectLocation() {
    if($(locationInput).is(":visible")){
        // this is desktop or browsers with fs access api
        let isLocationValid = projectLocation &&
            await newProjectExtension.alreadyExists(projectLocation);
        if(isLocationValid){
            $(locationInput).removeClass("error-border");
            return true;
        }
        $(locationInput).addClass("error-border");
        return false;
    }
    // location input is hidden only in browsers with no fs access API. If its hidden,
    // we dont need to validate location, as _validateSuggestedName will be in effect
    return true;
}

async function _validateSuggestedName() {
    if($(projectNameInput).is(":visible")){
        // the project name input is only visible in desktop and browsers with no fs access api.
        let suggestedName = projectNameInput.value;
        if(!suggestedName || !projectLocation ||
            await newProjectExtension.alreadyExists(projectLocation+suggestedName)){
            $(projectNameInput).addClass("error-border");
            return false;
        }
        $(projectNameInput).removeClass("error-border");
    }
    return true;
}

async function _validateAll() {
    const locIsValid = await _validateProjectLocation();
    const nameIsValid = await _validateSuggestedName();
    document.getElementById('createProjectBtn').disabled = !(locIsValid && nameIsValid);
    document.getElementById('createProjectWithNameBtn').disabled = !(locIsValid && nameIsValid);
    return locIsValid && nameIsValid;
}

function _selectFolder() {
    newProjectExtension.showFolderSelect()
        .then(file =>{
            projectLocation = file;
            if(!projectLocation.endsWith("/")){
                projectLocation = projectLocation + "/";
            }
            locationInput.value = window.parent.Phoenix.app.getDisplayPath(file);
            _validateAll();
        });
}

async function _createProjectClicked() {
    const projectPath = _computeProjectPath();
    if(!projectPath){
        newProjectExtension.showErrorDialogue(
            Strings.MISSING_FIELDS,
            Strings.PLEASE_FILL_ALL_REQUIRED);
        return;
    }
    await window.parent.Phoenix.VFS.ensureExistsDirAsync(projectPath);
    newProjectExtension.downloadAndOpenProject(
        PARAM_SUGGESTED_URL,
        projectPath, PARAM_SUGGESTED_NAME, FLATTEN_ZIP_FIRST_LEVEL_DIR)
        .then(()=>{
            Metrics.countEvent(Metrics.EVENT_TYPE.NEW_PROJECT, "createProject.Click", "create.success");
            newProjectExtension.closeDialogue();
        });
    Metrics.countEvent(Metrics.EVENT_TYPE.NEW_PROJECT, "createProject.Click", "create");
}

function _showLicensingInfo() {
    if(LICENSE || LICENSE_URL || CREDITS || CREDITS_URL){
        $(document.getElementById("License")).removeClass("forced-hidden");
    }
    if(LICENSE || LICENSE_URL){
        let el = document.getElementById("licenseLink");
        el.textContent = LICENSE || LICENSE_URL;
        if(LICENSE_URL){
            $(el).click((evt)=>{
                window.parent.brackets.app.openURLInDefaultBrowser(LICENSE_URL);
                evt.preventDefault();
                evt.stopPropagation();
            });
        }
    }
    if(CREDITS || CREDITS_URL){
        let el = document.getElementById("creditsLink");
        el.textContent = CREDITS || CREDITS_URL;
        if(CREDITS_URL){
            $(el).click((evt)=>{
                window.parent.brackets.app.openURLInDefaultBrowser(CREDITS_URL);
                evt.preventDefault();
                evt.stopPropagation();
            });
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
        document.getElementById("backButton").href = BACK_URL;
    }
}

function initNewProjectFromURL() {
    _setupNavigation();
    if(window.parent.Phoenix.isNativeApp){ // desktop builds
        projectLocation = newProjectExtension.getLocalProjectsPath();
        projectName = PARAM_SUGGESTED_NAME;
        $(document.getElementById("createProjectBtn")).addClass("forced-inVisible");
    } else if(window.showDirectoryPicker){ // fs access apis- chrome/opera etc..
        $(document.getElementById("projectName")).addClass("forced-hidden");
    } else {
        projectName = PARAM_SUGGESTED_NAME;
        projectLocation = newProjectExtension.getLocalProjectsPath();
        $(document.getElementById("projectLocation")).addClass("forced-hidden");
    }
    document.getElementById("titleNewProject").textContent = PARAM_SUGGESTED_TITLE;
    projectNameInput = document.getElementById("projectNameInput");
    locationInput = document.getElementById("locationInput");
    createProjectBtn = document.getElementById("createProjectBtn");
    createProjectWithNameBtn = document.getElementById("createProjectWithNameBtn");
    createProjectBtn.onclick = _createProjectClicked;
    createProjectWithNameBtn.onclick = _createProjectClicked;
    $(projectNameInput).keyup(_validateAll);
    locationInput.value = Strings.PLEASE_SELECT_A_FOLDER;
    projectNameInput.value = projectName;
    locationInput.onclick = _selectFolder;
    if(projectLocation){
        locationInput.value = window.parent.Phoenix.app.getDisplayPath(projectLocation);
    }
    _showLicensingInfo();
    _showPreview();
    _validateAll();
}
