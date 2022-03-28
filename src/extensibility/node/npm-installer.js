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

/* eslint-env node */



var fs    = require("fs-extra"),
    path  = require("path"),
    spawn = require("child_process").spawn;

var Errors = {
    NPM_INSTALL_FAILED: "NPM_INSTALL_FAILED"
};

/**
 * Private function to run "npm install --production" command in the extension directory.
 *
 * @param {string} installDirectory Directory to remove
 * @param {array} npmOptions can contain additional options like `--production` or `--proxy http://127.0.0.1:8888`
 * @param {function} callback NodeJS style callback to call after finish
 */
function _performNpmInstall(installDirectory, npmOptions, callback) {
    var npmPath = path.resolve(path.dirname(require.resolve("npm")), "..", "bin", "npm-cli.js");
    var args = [npmPath, "install"].concat(npmOptions);

    console.log("running npm " + args.slice(1).join(" ") + " in " + installDirectory);

    var child = spawn(process.execPath, args, { cwd: installDirectory });

    child.on("error", function (err) {
        return callback(err);
    });

    var stdout = [];
    child.stdout.addListener("data", function (buffer) {
        stdout.push(buffer);
    });

    var stderr = [];
    child.stderr.addListener("data", function (buffer) {
        stderr.push(buffer);
    });

    var exitCode = 0;
    child.addListener("exit", function (code) {
        exitCode = code;
    });

    child.addListener("close", function () {
        stderr = Buffer.concat(stderr).toString();
        stdout = Buffer.concat(stdout).toString();
        if (exitCode > 0) {
            console.error("npm-stderr: " + stderr);
            return callback(new Error(stderr));
        }
        if (stderr) {
            console.warn("npm-stderr: " + stderr);
        }
        console.log("npm-stdout: " + stdout);
        return callback();
    });

    child.stdin.end();
}

/**
 * Checks package.json of the extracted extension for npm dependencies
 * and runs npm install when required.
 * @param {Object} validationResult return value of the validation procedure
 * @param {Function} callback function to be called after the end of validation procedure
 */
function performNpmInstallIfRequired(npmOptions, validationResult, callback) {

    function finish() {
        callback(null, validationResult);
    }

    var installDirectory = path.join(validationResult.extractDir, validationResult.commonPrefix);
    var packageJson;

    try {
        packageJson = fs.readJsonSync(path.join(installDirectory, "package.json"));
    } catch (e) {
        packageJson = null;
    }

    if (!packageJson || !packageJson.dependencies || !Object.keys(packageJson.dependencies).length) {
        return finish();
    }

    _performNpmInstall(installDirectory, npmOptions, function (err) {
        if (err) {
            validationResult.errors.push([Errors.NPM_INSTALL_FAILED, err.toString()]);
        }
        finish();
    });
}

exports.performNpmInstallIfRequired = performNpmInstallIfRequired;
