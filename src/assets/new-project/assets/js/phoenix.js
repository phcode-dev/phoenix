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

/*global Metrics*/
/*eslint no-console: 0*/
/*eslint strict: ["error", "global"]*/
/* jshint ignore:start */

const NEW_PROJECT_EXTENSION_INTERFACE = "Extn.Phoenix.newProject";
const RECENT_PROJECTS_INTERFACE = "Extn.Phoenix.recentProjects";
const selfFileName = location.href.split('?')[0].split('/').pop();
window.Strings = window.parent.Strings;
window.path = window.parent.path;
window.parent.ExtensionInterface.waitAndGetExtensionInterface(NEW_PROJECT_EXTENSION_INTERFACE)
    .then(interfaceObj => {
        window.newProjectExtension = interfaceObj;
        window.Metrics = window.newProjectExtension.Metrics;
        Metrics.countEvent(Metrics.EVENT_TYPE.NEW_PROJECT, `${selfFileName}`, "shown");
    });
window.parent.ExtensionInterface.waitAndGetExtensionInterface(RECENT_PROJECTS_INTERFACE)
    .then(interfaceObj => {
        window.recentProjectExtension = interfaceObj;
    });

// string of the form `hello {{world}}`
function _getTranslatedString(templateStr) {
    return templateStr.replace(
        /{{(\w*)}}/g,
        function( match, key ){
            return window.Strings[key] ? window.Strings[key] : key;
        }
    );
}

function _localiseWithBracketsStrings() {
    let allLocElements = document.getElementsByClassName("localize");
    for(let el of allLocElements){
        let stringToTranslate = el.textContent.trim();
        el.textContent = _getTranslatedString(stringToTranslate);
    }
}

function newProjectFromURLScreen(url, suggestedProjectName, title,
    {license, licenseURL, credits, creditsURL, previewURL}) {
    let href = `new-project-from-url.html?url=${url}&suggestedName=${suggestedProjectName}&title=${title}`;
    if(license){
        href=`${href}&license=${license}`;
    }
    if(licenseURL){
        href=`${href}&licenseURL=${licenseURL}`;
    }
    if(credits){
        href=`${href}&credits=${credits}`;
    }
    if(creditsURL){
        href=`${href}&creditsURL=${creditsURL}`;
    }
    if(previewURL){
        href=`${href}&previewURL=${previewURL}`;
    }
    window.location.href = href;
}

function getPhoenixAbsURL(relativePath) {
    return `${window.parent.Phoenix.baseURL}${relativePath}`;
}

function init() {
    _localiseWithBracketsStrings();
    document.getElementById("closeDialogueButton").onclick = function() {
        window.newProjectExtension.closeDialogue();
        Metrics.countEvent(Metrics.EVENT_TYPE.NEW_PROJECT, `Click.${selfFileName}`, "closeDlg");
    };
    document.getElementById("top").onkeydown = function(e) {
        let acceptedCode = false;
        if(e.code === 'Escape'){
            window.newProjectExtension.closeDialogue();
            acceptedCode = true;
        } else if(e.code === 'ArrowRight' && e.target.tagName !== 'INPUT') {
            $.tabNext();
            acceptedCode = true;
        } else if(e.code === 'ArrowLeft'&& e.target.tagName !== 'INPUT') {
            $.tabPrev();
            acceptedCode = true;
        } else if(e.code === 'Tab'&& e.target.tagName !== 'INPUT') {
            acceptedCode = true; // will be handled by focus handler below
        }
        if(acceptedCode){
            Metrics.countEvent(Metrics.EVENT_TYPE.NEW_PROJECT, `Click.${selfFileName}`, e.code);
        }
    };
    // Accessibility and keyboard navigation with Tab and Esc, Enter keys.
    $('.tabable').focus(function(el) {
        $(el.target).addClass('active');
    }).blur(function(el) {
        $(el.target).removeClass('active');
    });

    $('#focusguard-2').on('focus', function() {
        // "last" focus guard got focus: set focus to the first field
        $('#firstInputTabIndex').focus();
    });
    // Accessibility and keyboard navigation with Tab and Esc, Enter keys end.
}
