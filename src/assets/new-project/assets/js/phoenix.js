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

const NEW_PROJECT_EXTENSION_INTERFACE = "Extn.Phoenix.newProject";
const RECENT_PROJECTS_INTERFACE = "Extn.Phoenix.recentProjects";
window.Strings = window.parent.Strings;
window.path = window.parent.path;

window.parent.ExtensionInterface.waitAndGetExtensionInterface(NEW_PROJECT_EXTENSION_INTERFACE)
    .then(interfaceObj => {
        window.newProjectExtension = interfaceObj;
    });
window.parent.ExtensionInterface.waitAndGetExtensionInterface(RECENT_PROJECTS_INTERFACE)
    .then(interfaceObj => {
        window.recentProjectExtension = interfaceObj;
    });

function _localiseWithBracketsStrings() {
    let allLocElements = document.getElementsByClassName("localize");
    for(let el of allLocElements){
        let key = el.textContent.trim();
        let translation = window.Strings[key] || key;
        el.textContent = translation;
    }
}

function init() {
    _localiseWithBracketsStrings();
    document.getElementById("closeDialogueButton").onclick = function() {
        window.newProjectExtension.closeDialogue();
    };
    document.getElementById("top").onkeydown = function(e) {
        if(e.code === 'Escape'){
            window.newProjectExtension.closeDialogue();
        } else if(e.code === 'ArrowRight' && e.target.tagName !== 'INPUT') {
            $.tabNext();
        } else if(e.code === 'ArrowLeft'&& e.target.tagName !== 'INPUT') {
            $.tabPrev();
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
