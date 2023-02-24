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
        Strings                   = brackets.getModule("strings"),
        DocumentManager     = brackets.getModule("document/DocumentManager");

    function getExtension(filePath) {
        filePath = filePath || '';
        let pathSplit = filePath.split('.');
        return pathSplit && pathSplit.length>1 ? pathSplit[pathSplit.length-1] : '';
    }

    function isPreviewableFile(filePath) {
        let extension = getExtension(filePath);
        return ['html', 'xhtml', 'htm', 'jpg', 'jpeg', 'png', 'svg',
            'pdf', 'md', 'markdown'].includes(extension.toLowerCase());
    }

    function _isMarkdownFile(filePath) {
        let extension = getExtension(filePath);
        return ['md', 'markdown'].includes(extension.toLowerCase());
    }

    function _isHTMLFile(filePath) {
        let extension = getExtension(filePath);
        return ['html', 'htm', 'xhtml'].includes(extension.toLowerCase());
    }

    function getNoPreviewURL(){
        return `${window.Phoenix.baseURL}assets/phoenix-splash/no-preview.html?jsonInput=`+
            encodeURIComponent(`{"heading":"${Strings.DESCRIPTION_LIVEDEV_NO_PREVIEW}",`
                +`"details":"${Strings.DESCRIPTION_LIVEDEV_NO_PREVIEW_DETAILS}"}`);
    }

    /**
     * Finds out a {URL,filePath} to live preview from the project. Will return and empty object if the current
     * file is not previewable.
     * @return {Promise<*>}
     */
    async function getPreviewDetails() {
        return new Promise(async (resolve, reject)=>{ // eslint-disable-line
            // async is explicitly caught
            try {
                const projectRoot = ProjectManager.getProjectRoot().fullPath;
                const projectRootUrl = `${window.fsServerUrl}PHOENIX_LIVE_PREVIEW_${Phoenix.PHOENIX_INSTANCE_ID}${projectRoot}`;
                const currentDocument = DocumentManager.getCurrentDocument();
                const currentFile = currentDocument? currentDocument.file : ProjectManager.getSelectedItem();
                if(currentFile){
                    let fullPath = currentFile.fullPath;
                    let httpFilePath = null;
                    if(fullPath.startsWith("http://") || fullPath.startsWith("https://")){
                        httpFilePath = fullPath;
                    }
                    if(isPreviewableFile(fullPath)){
                        const filePath = httpFilePath || path.relative(projectRoot, fullPath);
                        let URL = httpFilePath || `${projectRootUrl}${filePath}`;
                        resolve({
                            URL,
                            filePath: filePath,
                            fullPath: fullPath,
                            isMarkdownFile: _isMarkdownFile(fullPath),
                            isHTMLFile: _isHTMLFile(fullPath)
                        });
                        return;
                    }
                }
                resolve({
                    URL: getNoPreviewURL(),
                    isNoPreview: true
                });
            }catch (e) {
                reject(e);
            }
        });
    }

    exports.getPreviewDetails = getPreviewDetails;
    exports.getNoPreviewURL = getNoPreviewURL;
    exports.getExtension = getExtension;
    exports.isPreviewableFile = isPreviewableFile;
});


