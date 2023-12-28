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

/*global path, newProjectExtension, recentProjectExtension, Strings, Metrics,newProjectFromURLScreen
,getPhoenixAbsURL, createNotificationFromTemplate*/
/*eslint no-console: 0*/
/*eslint strict: ["error", "global"]*/
/* jshint ignore:start */

function _createRecentProjectCard(fullPath, displayLocation, nodeId, tabIndex) {
    let removeBtnDisableStyle = "";
    if(path.normalize(fullPath) === path.normalize(newProjectExtension.getWelcomeProjectPath())){
        removeBtnDisableStyle = "display: none;";
    }
    let recentProjectListWidth = document.getElementById('recentProjectList').clientWidth;
    const fontWidth = 6;
    const charsToFillFontWidth = recentProjectListWidth/fontWidth;
    // show title only if the path is longer than the inline display location.
    const title = displayLocation.length < charsToFillFontWidth ? "" : displayLocation;
    return $(`<li onclick="openProject('${fullPath}');_recentProjectMetric('open');" style="overflow: hidden" title="${title}">
        <a id="${nodeId}" href="#" 
        class="d-flex align-items-center justify-content-between tabable"
        tabindex="${tabIndex}">
            <div class="project-name">
                ${newProjectExtension.path.basename(fullPath)}
            </div>
            <button class="remove-btn" onclick="removeProject('${fullPath}');_recentProjectMetric('remove');"
            style="${removeBtnDisableStyle}">
                <svg width="16" height="16" viewBox="0 0 14 14" fill="none"
                     xmlns="http://www.w3.org/2000/svg">
                    <path d="M1.75 3.5H2.91667H12.25" stroke="#D0D0D0" stroke-linecap="round"
                          stroke-linejoin="round"/>
                    <path d="M4.6665 3.50008V2.33341C4.6665 2.024 4.78942 1.72725 5.00821 1.50846C5.22701 1.28966 5.52375 1.16675 5.83317 1.16675H8.1665C8.47592 1.16675 8.77267 1.28966 8.99146 1.50846C9.21026 1.72725 9.33317 2.024 9.33317 2.33341V3.50008M11.0832 3.50008V11.6667C11.0832 11.9762 10.9603 12.2729 10.7415 12.4917C10.5227 12.7105 10.2259 12.8334 9.91651 12.8334H4.08317C3.77375 12.8334 3.47701 12.7105 3.25821 12.4917C3.03942 12.2729 2.9165 11.9762 2.9165 11.6667V3.50008H11.0832Z"
                          stroke="#D0D0D0" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M5.8335 6.41675V9.91675" stroke="#D0D0D0" stroke-linecap="round"
                          stroke-linejoin="round"/>
                    <path d="M8.1665 6.41675V9.91675" stroke="#D0D0D0" stroke-linecap="round"
                          stroke-linejoin="round"/>
                </svg>
            </button>
        </a>
        <div style="overflow: hidden;">
            <p class="recent-project-metadata">${displayLocation}</p>
        </div>
    </li>`);
}

function _recentProjectMetric(type) {
    Metrics.countEvent(Metrics.EVENT_TYPE.NEW_PROJECT, "recentProject.btnClick", type);
}

function getDisplayLocation(projectPath) {
    const tauriDir = newProjectExtension.getTauriDir();
    if (projectPath.startsWith(tauriDir)) {
        return newProjectExtension.getTauriPlatformPath(projectPath);
    }
    if (projectPath.startsWith(newProjectExtension.getMountDir())) {
        return ""; // we don't show anything if it's stored on user's hard drive for better ui.
    }
    return Strings.PROJECT_FROM_BROWSER;
}

function _updateProjectCards() {
    let recentProjectList = $(document.getElementById('recentProjectList'));
    recentProjectList.empty();
    let recentProjects = recentProjectExtension.getRecentProjects();
    let tabIndex = 1;
    let defaultProjects = [newProjectExtension.getWelcomeProjectPath(), newProjectExtension.getExploreProjectPath()],
        omitProjectsInListing = [newProjectExtension.getExploreProjectPath()],
        showRecentProjects = false;
    for(let recentProject of recentProjects){
        if(!defaultProjects.includes(recentProject)){
            showRecentProjects = true;
        }
        if(!omitProjectsInListing.includes(recentProject)){
            recentProjectList.append(_createRecentProjectCard(recentProject, getDisplayLocation(recentProject),
                `recent-prj-list-${tabIndex}`, tabIndex++));
        }
    }
    if(!showRecentProjects){
        $("#recentProjectsContainer").addClass("forced-hidden");
        $("#noProjectContainer").removeClass("forced-hidden");
        let videoHtml = `<iframe id="noProjectIframe" style="align-items: center" src="https://www.youtube.com/embed/vtks0cus0hA" title="YouTube video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen></iframe>`;
        document.getElementById("YTVideoFrame").innerHTML = videoHtml;
    }
}

function openProject(fullPath) {
    recentProjectExtension.openProjectWithPath(fullPath)
        .then(()=>{
            newProjectExtension.closeDialogue();
        })
        .catch(()=>{
            _updateProjectCards();
        });
}

function removeProject(fullPath) {
    recentProjectExtension.removeFromRecentProject(fullPath);
    _updateProjectCards();
    event.stopPropagation();
}

function _showFirstTimeExperience() {
    let shownBefore = PhStore.getItem('notification.defaultProject.Shown');
    if(!shownBefore){
        createNotificationFromTemplate(Strings.DEFAULT_PROJECT_NOTIFICATION,
            "defaultProjectButton", {
                allowedPlacements: ["left", "right"],
                autoCloseTimeS: 15,
                dismissOnClick: true
            });
        PhStore.setItem('notification.defaultProject.Shown', 'true');
    }
}

function _updateDropdown() {
    let shouldShowWelcome = PhStore.getItem("new-project.showWelcomeScreen") || 'Y';
    if(shouldShowWelcome === 'Y') {
        document.getElementById("showWelcomeIndicator").style = "visibility: visible";
    } else {
        document.getElementById("showWelcomeIndicator").style = "visibility: hidden";
    }
}

function _attachSettingBtnEventListeners() {
    document.querySelector('.dropdown').addEventListener('click', function() {
        let content = this.querySelector('.dropdown-content');
        let dropbtn = this.querySelector('.dropbtn');
        _updateDropdown();
        if (content.style.display === 'block') {
            content.style.display = 'none';
            dropbtn.classList.remove('dropbtnActive');
        } else {
            content.style.display = 'block';
            dropbtn.classList.add('dropbtnActive');
        }
    });

    document.getElementById("showWelcome").addEventListener('click', (event)=>{
        let shouldShowWelcome = PhStore.getItem("new-project.showWelcomeScreen") || 'Y';
        shouldShowWelcome = shouldShowWelcome === 'Y'? 'N' : 'Y';
        PhStore.setItem("new-project.showWelcomeScreen", shouldShowWelcome);
    });

    document.getElementById("showAbout").addEventListener('click', (event)=>{
        newProjectExtension.showAboutBox();
    });

    // Event to close dropdown if clicked outside
    document.addEventListener('click', function(event) {
        let dropdown = document.querySelector('.dropdown');
        let content = dropdown.querySelector('.dropdown-content');
        let dropbtn = dropdown.querySelector('.dropbtn');

        // If the target of the click isn't the dropdown or a descendant of the dropdown
        if (!dropdown.contains(event.target)) {
            content.style.display = 'none';
            dropbtn.classList.remove('dropbtnActive');
        }
    });
}

function _openURLInTauri(url) {
    // in tauri, the <a> tag will not open a browser window. So we have to use phcode apis to do it.
    // else, the browser itself will open the url. so we dont have to do this in normal browsers.
    if(window.top.__TAURI__) {
        window.top.Phoenix.app.openURLInDefaultBrowser(url);
    }
}

function initCodeEditor() {
    document.getElementById("openFolderBtn").onclick = function() {
        Metrics.countEvent(Metrics.EVENT_TYPE.NEW_PROJECT, "main.Click", "open-folder");
        newProjectExtension.openFolder();
    };
    document.getElementById("viewMore").onclick = function() {
        Metrics.countEvent(Metrics.EVENT_TYPE.NEW_PROJECT, "main.Click", "viewMore");
        window.location.href = 'new-project-more.html';
    };
    document.getElementById("githubStarsButton").onclick = function() {
        Metrics.countEvent(Metrics.EVENT_TYPE.NEW_PROJECT, "main.Click", "githubStars");
        _openURLInTauri("https://github.com/phcode-dev/phoenix");
    };
    const icons = ['githubIcon', 'twitterIcon', 'youtubeIcon'];
    for(let iconID of icons) {
        document.getElementById(iconID).onclick = function() {
            Metrics.countEvent(Metrics.EVENT_TYPE.NEW_PROJECT, "main.Click", iconID);
            _openURLInTauri(document.getElementById(iconID).getAttribute('href'));
        };
    }
    document.getElementById("newGitHubProject").onclick = function() {
        Metrics.countEvent(Metrics.EVENT_TYPE.NEW_PROJECT, "main.Click", "github-project");
        window.location.href = 'new-project-github.html';
    };
    document.getElementById("exploreBtn").onclick = function() {
        Metrics.countEvent(Metrics.EVENT_TYPE.NEW_PROJECT, "main.Click", "games");
        openProject(newProjectExtension.getExploreProjectPath());
    };
    document.getElementById("defaultProjectButton").onclick = function() {
        Metrics.countEvent(Metrics.EVENT_TYPE.NEW_PROJECT, "main.Click", "default-project");
        openProject(newProjectExtension.getWelcomeProjectPath());
    };
    document.getElementById("newHTMLBtn").onclick = function() {
        Metrics.countEvent(Metrics.EVENT_TYPE.NEW_PROJECT, "main.Click", "html5");
        newProjectFromURLScreen(getPhoenixAbsURL("assets/sample-projects/HTML5.zip"),
            "html project", Strings.NEW_HTML, {
            previewURL: `${getPhoenixAbsURL("assets/sample-projects/HTML5/index.html")}`});
    };
    _updateProjectCards();
    _showFirstTimeExperience();
    $("body").append($(`<script async defer src="https://buttons.github.io/buttons.js"></script>`));
    _attachSettingBtnEventListeners();
}
