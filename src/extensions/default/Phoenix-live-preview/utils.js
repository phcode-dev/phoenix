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
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, brackets, fs, Phoenix, path */
//jshint-ignore:no-start

define(function (require, exports, module) {
    const ProjectManager          = brackets.getModule("project/ProjectManager"),
        DocumentManager     = brackets.getModule("document/DocumentManager"),
        FileSystem         = brackets.getModule("filesystem/FileSystem");

    function _isPreviewableFile(filePath) {
        let pathSplit = filePath.split('.');
        let extension = pathSplit && pathSplit.length>1 ? pathSplit[pathSplit.length-1] : null;
        if(['html', 'htm', 'jpg', 'jpeg', 'png', 'svg', 'pdf'].includes(extension.toLowerCase())){
            return true;
        }
        return false;
    }

    function _getNoPreviewURL(){
        return `${window.location.href}assets/phoenix-splash/no-preview.html`;
    }

    async function _getDefaultPreviewDetails() {
        return new Promise(async (resolve)=>{
            let projectRoot = ProjectManager.getProjectRoot().fullPath;
            const projectRootUrl = `${window.fsServerUrl}${projectRoot}`;
            let indexFiles = ['index.html', "index.htm"];
            for(let indexFile of indexFiles){
                let file = FileSystem.getFileForPath(`${projectRoot}${indexFile}`);
                if(await file.existsAsync()){
                    const relativePath = path.relative(projectRoot, file.fullPath);
                    resolve({
                        URL: `${projectRootUrl}${relativePath}`,
                        filePath: relativePath
                    });
                    return;
                }
            }
            resolve({URL: _getNoPreviewURL()});
        });
    }

    /**
     * Finds out a {URL,filePath} to live preview from the project. Will return and empty object if the current
     * file is not previewable.
     * @return {Promise<*>}
     */
    async function getPreviewDetails() {
        return new Promise(async (resolve)=>{
            const projectRoot = ProjectManager.getProjectRoot().fullPath;
            const projectRootUrl = `${window.fsServerUrl}${projectRoot}`;
            const currentDocument = DocumentManager.getCurrentDocument();
            const currentFile = currentDocument? currentDocument.file : ProjectManager.getSelectedItem();
            if(currentFile){
                let fullPath = currentFile.fullPath;
                if(_isPreviewableFile(fullPath)){
                    const relativePath = path.relative(projectRoot, fullPath);
                    resolve({
                        URL: `${projectRootUrl}${relativePath}`,
                        filePath: relativePath
                    });
                } else {
                    resolve({}); // not a previewable file
                }
            }
            resolve(await _getDefaultPreviewDetails());
        });
    }

    exports.getPreviewDetails = getPreviewDetails;
});


