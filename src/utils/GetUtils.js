/*
 *  Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
 *  Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

//jshint ignore: start

define(function(require,exports,module){
   //write xmlhttprequest instead of $.get();
    var PreferencesManager = require("preferences/PreferencesManager");

    function getFile(file,extensionName,baseExtensionUrl) {
        const xhttp = new XMLHttpRequest();
        var json = {
            name: extensionName
        };
        xhttp.onload = function () {
            if(xhttp.readyState === 4 && xhttp.status === 200){
                json = xhttp.response;
            }
            else if(xhttp.status === 404){
                //do nothing
            }
            var disabled;
            var defaultDisabled = PreferencesManager.get("extensions.default.disabled");
            if (Array.isArray(defaultDisabled) && defaultDisabled.indexOf(extensionName) !== -1) {
                console.warn("Default extension has been disabled on startup: " + baseExtensionUrl);
                disabled = true;
            }
            json.disabled = disabled;

        }
        xhttp.open("GET", file, true);
        xhttp.send();

        return json;
    }
    exports.getFile = getFile;
});