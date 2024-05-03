/*global define, brackets, $ */

define(function (require, exports, module) {
    "use strict";

    // Brackets modules
    const NodeConnector = brackets.getModule("NodeConnector");
    const AppInit = brackets.getModule("utils/AppInit");

    // Initialize extension once shell is finished initializing.
    AppInit.appReady(function () {
        console.log("hello world");
        window.extensionLoaderTestExtensionLoaded = true;
        if(Phoenix.isNativeApp) {
            const nodeConnector = NodeConnector.createNodeConnector("extension_connector_1", exports);
            window._testNodeExt = function () {
                return nodeConnector.execPeer("echoTest", "yo!");
            };
        }
    });

});

