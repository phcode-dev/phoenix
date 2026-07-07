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

/**
 * Beautifier - Python formatting for the Beautify command via Ruff. Deliberately standalone:
 * each format is a one-shot `ruff format --stdin-filename <name> -` call over stdin/stdout
 * (NodeUtils.execFileWithInput) - Ruff is NOT wired into the LSP framework at all. The binary
 * arrives with the Pyrefly install (see ServerInstaller); until then the provider rejects and
 * Beautify reports no formatter, same as any other unsupported language.
 *
 * Runs with the project root as cwd so a project's own ruff config (pyproject.toml/ruff.toml)
 * is discovered and respected, exactly like running ruff in a terminal there.
 *
 * @module extensions/default/PythonSupport/Beautifier
 */
define(function (require, exports, module) {


    const BeautificationManager = brackets.getModule("features/BeautificationManager"),
        ProjectManager = brackets.getModule("project/ProjectManager"),
        NodeUtils = brackets.getModule("utils/NodeUtils"),
        ServerInstaller = require("./ServerInstaller");

    const FORMAT_TIMEOUT_MS = 20000;

    async function _runRuffFormat(text, fileNameHint) {
        const state = await ServerInstaller.installedState();
        if (!state.installed) {
            throw new Error("ruff is not installed yet");
        }
        const root = ProjectManager.getProjectRoot();
        const cwd = root ? Phoenix.fs.getTauriPlatformPath(root.fullPath) : undefined;
        // the stdin filename only feeds ruff's language/config resolution - a bare name is fine
        const stdinName = (fileNameHint || "file.py").split("/").pop();
        const result = await NodeUtils.execFileWithInput(
            ServerInstaller.getRuffBinaryPlatformPath(),
            ["format", "--stdin-filename", stdinName, "-"],
            { stdinText: text, cwd: cwd, timeoutMs: FORMAT_TIMEOUT_MS });
        if (result.code !== 0) {
            // typically a syntax error in the file - surface ruff's message
            throw new Error(result.stderr || ("ruff format exited with " + result.code));
        }
        return result.stdout;
    }

    function beautifyTextProvider(textToBeautify, filePathOrFileName) {
        return _runRuffFormat(textToBeautify, filePathOrFileName).then(function (changedText) {
            return { originalText: textToBeautify, changedText: changedText };
        });
    }

    function beautifyEditorProvider(editor) {
        const text = editor.document.getText();
        return _runRuffFormat(text, editor.document.file.fullPath).then(function (changedText) {
            return { originalText: text, changedText: changedText };
        });
    }

    function init() {
        BeautificationManager.registerBeautificationProvider(exports, ["python"]);
    }

    exports.init = init;
    exports.beautifyEditorProvider = beautifyEditorProvider;
    exports.beautifyTextProvider = beautifyTextProvider;
});
