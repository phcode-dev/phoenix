/*global define, brackets, $ */

define(function (require, exports, module) {
    "use strict";

    // Brackets modules
    var AppInit = brackets.getModule("utils/AppInit");

    // Initialize extension once shell is finished initializing.
    AppInit.appReady(function () {
        console.log("hello world");
        window.extensionLoaderTestExtensionLoaded = true;
    });

});

