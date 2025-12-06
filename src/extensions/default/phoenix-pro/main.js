/*
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Proprietary code, all rights reserved.
 */

define(function (require, exports, module) {
    const AppInit = brackets.getModule("utils/AppInit"),
        Strings = brackets.getModule("strings");

    const sampleFnText = require("text!./browser-context/sample-remore-fn.js");
    const LiveDevProtocol = brackets.getModule("LiveDevelopment/MultiBrowserImpl/protocol/LiveDevProtocol");
    LiveDevProtocol.addRemoteFunctionScript("sampleFn", sampleFnText);

    AppInit.appReady(function () {

    });
});
