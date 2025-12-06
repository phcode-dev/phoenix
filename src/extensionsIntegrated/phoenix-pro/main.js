/*
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Proprietary code, all rights reserved.
 */

define(function (require, exports, module) {
    require("./LivePreviewEdit");

    const AppInit = require("utils/AppInit"),
        Strings = require("strings");

    const sampleFnText = require("text!./browser-context/sample-remore-fn.js");
    const LiveDevProtocol = require("LiveDevelopment/MultiBrowserImpl/protocol/LiveDevProtocol");
    LiveDevProtocol.addRemoteFunctionScript("sampleFn", sampleFnText);

    AppInit.appReady(function () {

    });
});
