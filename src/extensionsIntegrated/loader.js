/*
 * Copyright (c) 2019 - present Adobe. All rights reserved.
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

/**
 *  Integrated extensions are special core extensions directly loaded through this file.
 *  While this can be also put into `extensions/default` folder with minimal effort,
 *  To increase boot speed, we merge all essential phcode extensions in this folder so that
 *  the build tooling can inline these into a single js file for prod builds.
 *
 *  All core extensions that gets loaded for the 80% userbase must prefer this loading
 *  instead of default extensions folder.
 */
define(function (require, exports, module) {
    require("./icons/main");
    require("./RemoteFileAdapter/main");
    require("./Phoenix/main");
    require("./InAppNotifications/main");
    require("./NoDistractions/main");
    require("./Phoenix-live-preview/main");
});
