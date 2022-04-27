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

const EVENT_HANDLER_NEW_PROJECT = "Extn.Phoenix.newProject",
    EVENT_OPEN_FOLDER = "openFolder",
    EVENT_CLOSE_DIALOGUE = "closeDialogue";

function messagePhoenix(event, ...params) {
    if(window.parent && window.parent.EventManager){
        window.parent.EventManager.triggerEvent(event, ...params);
    } else {
        console.error("Cannot communicate with parent phoenix window");
    }
}

function closeDialogue() {
    messagePhoenix(EVENT_HANDLER_NEW_PROJECT, EVENT_CLOSE_DIALOGUE);
}

function openProjectFolder(){
    messagePhoenix(EVENT_HANDLER_NEW_PROJECT, EVENT_OPEN_FOLDER);
}

function init() {
    document.getElementById("closeDialogueButton").onclick = function() {
        closeDialogue();
    };

    var element = document.getElementsByClassName("project-type-list d-flex mb-0 pb-0 border-bottom-0");
    var open_project = element[0].children;
    open_project[0].onclick = function (){
        openProjectFolder();
    };


}
