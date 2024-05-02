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
            <button class="remove-btn recent-project-remove" onclick="removeProject('${fullPath}');_recentProjectMetric('remove');"
            style="${removeBtnDisableStyle};" title="${Strings.REMOVE_FROM_RECENT_PROJECTS}">
                <i class="fa-solid fa-xmark"></i>
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

const imageHTML = `<img src="images/youtube_video.webp" alt="Phoenix Code on YouTube"
    title="Phoenix Code on YouTube"
    style="cursor: pointer; width: 100%; height: 100%"
    onclick="window.parent.brackets.app.openURLInDefaultBrowser('https://www.youtube.com/watch?v=vtks0cus0hA')"/>`;

function _updateProjectCards() {
    let recentProjectList = $(document.getElementById('recentProjectList'));
    recentProjectList.empty();
    let recentProjects = recentProjectExtension.getRecentProjects();
    let tabIndex = 1;
    let defaultProjects = [newProjectExtension.getWelcomeProjectPath(), newProjectExtension.getExploreProjectPath()],
        omitProjectsInListing = [newProjectExtension.getExploreProjectPath()],
        showRecentProjects = false;
    for(let recentProject of recentProjects){
        if(!recentProject.endsWith("/")){
            recentProject = `${recentProject}/`;
        }
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
        document.getElementById("YTVideoFrame").innerHTML = imageHTML;
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
    document.getElementById("sponsorIcon").title = Strings.SUPPORT_US_OPEN_COLLECTIVE;
    const icons = ['githubIcon', 'twitterIcon', 'youtubeIcon', 'sponsorIcon'];
    for(let iconID of icons) {
        document.getElementById(iconID).onclick = function() {
            Metrics.countEvent(Metrics.EVENT_TYPE.NEW_PROJECT, "main.Click", iconID);
            _openURLInTauri(document.getElementById(iconID).getAttribute('href'));
        };
    }
    if(window.top.__TAURI__) {
        // in desktop, we don't show github project option till we have git extension integrated.
        document.getElementById("newGitHubProject").classList.add("forced-hidden");
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

    const banner = document.getElementById("download-phcode-banner");
    banner.onclick = function() {
        Metrics.countEvent(Metrics.EVENT_TYPE.NEW_PROJECT, "getApp.Click", window.top.Phoenix.platform);
        window.top.Phoenix.app.openURLInDefaultBrowser("https://phcode.io");
    };
    if(!window.top.Phoenix.isNativeApp && !window.top.Phoenix.browser.isChromeOS && window.top.Phoenix.browser.isDeskTop) {
        banner.classList.remove("forced-hidden");
        document.getElementById("project-items-container").classList.add("even-layout");
        document.getElementById("download-string").textContent = Strings.DOWNLOAD_DESKTOP_APP;
        if(window.top.Phoenix.platform === "win"){
            document.getElementById("windows-logo").classList.remove("forced-hidden");
        } else if(window.top.Phoenix.platform === "mac"){
            document.getElementById("mac-logo").classList.remove("forced-hidden");
            document.getElementById("download-string").textContent = Strings.GET_DESKTOP_APP;
        } else {
            document.getElementById("linux-logo").classList.remove("forced-hidden");
        }
    }

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
