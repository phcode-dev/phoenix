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

let newProjectExtension;
window.parent.ExtensionInterface.waitAndGetExtensionInterface(NEW_PROJECT_EXTENSION_INTERFACE)
    .then(interfaceObj => {
        newProjectExtension = interfaceObj;
    });

function closeDialogue() {
    newProjectExtension.closeDialogue();
}

function init() {
    document.getElementById("closeDialogueButton").onclick = function() {
        closeDialogue();
    };
}
