/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
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

require.config({
    paths: {
        "text": "lib/text",
        "i18n": "lib/i18n"
    },
    locale: brackets.getLocale()
});

define(function (require, exports, module) {


    // Brackets modules
    var CommandManager      = brackets.getModule("command/CommandManager"),
        Menus               = brackets.getModule("command/Menus"),
        Dialogs             = brackets.getModule("widgets/Dialogs"),
        Mustache            = brackets.getModule("thirdparty/mustache/mustache");

    // Load an html fragment using the require text plugin. Mustache will later
    // be used to localize some of the text
    var browserWrapperHtml  = require("text!htmlContent/sampleHTMLFragment.html");

    // Load the string module for this plugin. Not this references to the strings.js
    // file next to the main.js fiel for this plugin. To access core brackets strings
    // you would call brackets.getModule("strings") instead of require("strings")
    var Strings             = require("strings");


    // This sample command first shows an alert passing in a localized
    // string in JavaScript then it shows a localized HTML dialog.
    function testCommand() {
        window.alert(Strings.ALERT_MESSAGE);

        // Localize the dialog using Strings as the datasource and use it as the dialog template
        var localizedTemplate = Mustache.render(browserWrapperHtml, Strings);
        Dialogs.showModalDialogUsingTemplate(localizedTemplate);
    }


    // Register the command
    // A localized command name is used by passing in Strings.COMMAND_NAME
    var myCommandID = "localizationExample.command";
    CommandManager.register(Strings.COMMAND_NAME, myCommandID, testCommand);

    var menu = Menus.getMenu(Menus.AppMenuBar.EDIT_MENU);
    menu.addMenuItem(myCommandID, null, Menus.AFTER, myCommandID);
});
