/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2015 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global virtualfs, fs, WorkerComm */

const urlParams = new URLSearchParams(location.search);
const debugMode = (urlParams.get('debug') === 'true');
importScripts('../phoenix/virtualfs.js');
importScripts('../utils/EventDispatcher.js');
importScripts('./WorkerComm.js');
importScripts('../search/worker/search.js');

virtualfs.debugMode = debugMode;

console.log("File indexing worker loaded in debug mode: ", debugMode);

if(!debugMode){
    console.log = console.info = function () {
        // swallow logs
    };
}

let projectCache = [],
    files,
    MAX_FILE_SIZE_TO_INDEX = 16777216;

let currentCrawlIndex = 0,
    crawlComplete = false,
    crawlEventSent = false,
    cacheStartTime = Date.now(),
    cacheSize = 0;

/**
 * Clears the cached file contents of the project
 */
function clearProjectCache() {
    projectCache = [];
}

function _statAsync(path) {
    return new Promise((resolve, reject)=>{
        fs.stat(path, function (err, stats) {
            if (err) {
                reject(err);
            } else {
                resolve(stats);
            }
        });
    });
}

function _readFileAsync(path) {
    return new Promise((resolve, reject)=>{
        fs.readFile(path, 'utf8', function (err, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}


/**
 * Gets the file size in bytes.
 * @param   {string} fileName The name of the file to get the size
 * @returns {Number} the file size in bytes
 */
async function getFilesizeInBytes(fileName) {
    try {
        let stats = await _statAsync(fileName);
        return stats.size || 0;
    } catch (ex) {
        console.log(ex);
        return 0;
    }
}

/**
 * Get the contents of a file from cache given the path. Also adds the file contents to cache from disk if not cached.
 * Will not read/cache files greater than MAX_FILE_SIZE_TO_INDEX in size.
 * @param   {string} filePath full file path
 * @return {string} contents or null if no contents
 */
async function getFileContentsForFile(filePath) {
    if (projectCache[filePath] || projectCache[filePath] === "") {
        return projectCache[filePath];
    }
    try {
        let fileSize = await getFilesizeInBytes(filePath);
        if ( fileSize <= MAX_FILE_SIZE_TO_INDEX) {
            projectCache[filePath] = await _readFileAsync(filePath);
        } else {
            projectCache[filePath] = "";
        }
    } catch (ex) {
        console.log(ex);
        projectCache[filePath] = "";
    }
    return projectCache[filePath];
}

/**
 * Crawls through the files in the project ans stores them in cache. Since that could take a while
 * we do it in batches so that node wont be blocked.
 */
async function fileCrawler() {
    if (!files || (files && files.length === 0)) {
        setTimeout(fileCrawler, 1000);
        return;
    }
    const parallelRead = 5;
    let readPromises = [];
    for (let i = 0; i < parallelRead && currentCrawlIndex < files.length; i++) {
        readPromises.push(getFileContentsForFile(files[currentCrawlIndex]));
        currentCrawlIndex++;
    }
    let contents = await Promise.all(readPromises) || [];
    for(let content of contents){
        if(content && content.length){
            cacheSize += content.length;
        }
    }
    if (currentCrawlIndex < files.length) {
        crawlComplete = false;
        setTimeout(fileCrawler);
    } else {
        crawlComplete = true;
        if (!crawlEventSent) {
            crawlEventSent = true;
            let crawlTime =  Date.now() - cacheStartTime;
            WorkerComm.triggerPeer("crawlComplete", [files.length, cacheSize, crawlTime]);
        }
        setTimeout(fileCrawler, 1000);
    }
}

function _crawlProgressMessenger() {
    if(!crawlComplete && files){
        WorkerComm.triggerPeer("crawlProgress", {
            processed: currentCrawlIndex,
            total: files.length
        });
    }
}

setInterval(_crawlProgressMessenger, 1000);

/**
 * Init for project, resets the old project cache, and sets the crawler function to
 * restart the file crawl
 * @param   {array} fileList an array of files
 */
function initCache(fileList) {
    console.log("file indexer: InitCache with num files: ", fileList.length);
    files = fileList;
    currentCrawlIndex = 0;
    cacheSize = 0;
    clearProjectCache();
    crawlEventSent = false;
    cacheStartTime = Date.now();
}

/**
 * Remove the list of given files from the project cache
 * @param   {Object}   updateObject
 */
function removeFilesFromCache(updateObject) {
    console.log("file Indexer Document removed", updateObject);
    let fileList = updateObject.fileList || [],
        filesInSearchScope = updateObject.filesInSearchScope || [],
        i = 0;
    for (i = 0; i < fileList.length; i++) {
        delete projectCache[fileList[i]];
    }
    function isNotInRemovedFilesList(path) {
        return (filesInSearchScope.indexOf(path) === -1) ? true : false;
    }
    files = files ? files.filter(isNotInRemovedFilesList) : files;
}

/**
 * Adds the list of given files to the project cache. However the files will not be
 * read at this time. We just delete the project cache entry which will trigger a fetch on search.
 * @param   {Object}   updateObject
 */
function addFilesToCache(updateObject) {
    console.log("file Indexer Document add", updateObject);
    let fileList = updateObject.fileList || [],
        filesInSearchScope = updateObject.filesInSearchScope || [],
        i = 0,
        changedFilesAlreadyInList = [],
        newFiles = [];
    for (i = 0; i < fileList.length; i++) {
        // We just add a null entry indicating the precense of the file in the project list.
        // The file will be later read when required.
        projectCache[fileList[i]] = null;
    }

    //Now update the search scope
    function isInChangedFileList(path) {
        return (filesInSearchScope.indexOf(path) !== -1) ? true : false;
    }
    changedFilesAlreadyInList = files ? files.filter(isInChangedFileList) : [];
    function isNotAlreadyInList(path) {
        return (changedFilesAlreadyInList.indexOf(path) === -1) ? true : false;
    }
    newFiles = changedFilesAlreadyInList.filter(isNotAlreadyInList);
    files.push.apply(files, newFiles);
}

/**
 * Notification function on document changed, we update the cache with the contents
 * @param {Object} updateObject
 */
function documentChanged(updateObject) {
    console.log("documetn changed", updateObject);
    projectCache[updateObject.filePath] = updateObject.docContents;
}

WorkerComm.setExecHandler("initCache", initCache);
WorkerComm.setExecHandler("filesChanged", addFilesToCache);
WorkerComm.setExecHandler("documentChanged", documentChanged);
WorkerComm.setExecHandler("filesRemoved", removeFilesFromCache);

setTimeout(fileCrawler, 3000);
