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

/*global getPhoenixAbsURL, Strings, Metrics, getNewProjectFromURL*/
/*eslint no-console: 0*/
/*eslint strict: ["error", "global"]*/
/* jshint ignore:start */

let $sampleProjectsList;

function _getIconURL(iconURL) {
    if(iconURL === 'bootstrap'){
        return 'images/Bootstrap_logo.svg';
    } else if(iconURL && (iconURL.startsWith("https://") || iconURL.startsWith("http://"))){
        return iconURL;
    }
    return 'images/tab-img2.png'; // HTML icon
}

function _addProjectEntries($projectList, sampleProjectsList, sectionTag) {
    let projects = sampleProjectsList.sections[sectionTag];
    for(let project of Object.keys(projects)){
        let projectDetails = sampleProjectsList.sections[sectionTag][project];
        let licenseDetails = sampleProjectsList.LICENCES[projectDetails.LICENCES];
        let translatedTitle = Strings[projectDetails.title] || projectDetails.title || project;
        let previewURL = getPhoenixAbsURL(projectDetails.previewURL);
        let zipURL = getPhoenixAbsURL(projectDetails.zipURL);
        let url = getNewProjectFromURL(zipURL, translatedTitle, translatedTitle,
            {
                license: licenseDetails.license,
                licenseURL: licenseDetails.licenseURL,
                credits: licenseDetails.credits,
                creditsURL:licenseDetails.creditsURL,
                backURL: "new-project-more.html",
                previewURL: previewURL
            });
        $projectList.append(`<li>
                        <a class="tabable" tabindex="1" href="${url}">
                            <img alt="image" src="${_getIconURL(projectDetails.iconURL)}">
                            <span>${translatedTitle}</span>
                        </a>
                    </li>`);
    }
}

function _createProjectEntries(sampleProjectsList) {
    for(let sectionTag of Object.keys(sampleProjectsList.sections)){
        let translatedSectionHeading = Strings[sectionTag] || sectionTag;
        let projectListID = `${sectionTag}-list`;
        $sampleProjectsList.append(`<div class="project-head d-flex align-items-center justify-content-between">
                    <h4 class="tab-title mb-0 localize">${translatedSectionHeading}</h4></div>
                    <ul id="${projectListID}" class="project-type-list d-flex flex-wrap text-center"></ul>`);
        let $projectList = $(`#${projectListID}`);
        _addProjectEntries($projectList, sampleProjectsList, sectionTag);
    }
}

function initMoreProjects() {
    $sampleProjectsList = $("#sampleProjectsList");
    let sampleProjectsListURL = getPhoenixAbsURL("assets/sample-projects/new-project-list.json");
    fetch(sampleProjectsListURL)
        .then(response => response.json())
        .then(data => _createProjectEntries(data));
}
