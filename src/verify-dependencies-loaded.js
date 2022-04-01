/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/**
 * Check for missing dependencies
 */
window.setTimeout(function () {


    var key, missingDeps = "";
    var deps = { "jQuery": window.$, "RequireJS": window.require };

    for (key in deps) {
        if (deps.hasOwnProperty(key) && !deps[key]) {
            missingDeps += "<li>" + key + "</li>";
        }
    }

    if (missingDeps.length > 0) {
        var str = "<h1>Missing libraries</h1>" +
                  "<p>Oops! One or more required libraries could not be found.</p>" +
                  "<ul>" + missingDeps + "</ul>" +
                  "<p>If you're running from a local copy of the Brackets source, please make sure submodules are updated by running:</p>" +
                  "<pre>git submodule update --init</pre>" +
                  "<p>If you're still having problems, please contact us via one of the channels mentioned at the bottom of the <a target=\"blank\" href=\"../README.md\">README</a>.</p>" +
                  "<p><a href=\"#\" onclick=\"window.location.reload()\">Reload Brackets</a></p>";

        window.document.write(str);
    }
}, 1000);
