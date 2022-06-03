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

/**
 *  Utilities functions related to Health Data logging
 */
/*global Map*/
define(function (require, exports, module) {


    var PreferencesManager          = require("preferences/PreferencesManager"),
        LanguageManager             = require("language/LanguageManager"),
        FileUtils                   = require("file/FileUtils"),
        PerfUtils                   = require("utils/PerfUtils"),
        StringUtils                 = require("utils/StringUtils"),
        Metrics                     = require("utils/Metrics"),

        HEALTH_DATA_STATE_KEY       = "HealthData.Logs",
        logHealthData               = true,
        analyticsEventMap           = new Map();

    var commonStrings = {
        USAGE: "usage",
        FILE_OPEN: "fileOpen",
        FILE_ADD_TO_WORKING_SET: "fileAddToWorkingSet",
        FILE_NEW: "newfile",
        FILE_SAVE: "fileSave",
        FILE_CLOSE: "fileClose",
        LANGUAGE_CHANGE: "languageChange",
        LANGUAGE_SERVER_PROTOCOL: "languageServerProtocol",
        CODE_HINTS: "codeHints",
        PARAM_HINTS: "parameterHints",
        JUMP_TO_DEF: "jumpToDefinition"
    };

    /**
     * Init: creates the health log preference keys in the state.json file
     */
    function init() {
        PreferencesManager.stateManager.definePreference(HEALTH_DATA_STATE_KEY, "object", {});
    }

    /**
     * All the logging functions should be disabled if this returns false
     * @return {boolean} true if health data can be logged
     */
    function shouldLogHealthData() {
        return logHealthData;
    }

    /**
     * Return all health data logged till now stored in the state prefs
     * @return {Object} Health Data aggregated till now
     */
    function getStoredHealthData() {
        var storedData = PreferencesManager.getViewState(HEALTH_DATA_STATE_KEY) || {};
        return storedData;
    }

    /**
     * Return the aggregate of all health data logged till now from all sources
     * @return {Object} Health Data aggregated till now
     */
    function getAggregatedHealthData() {
        var healthData = getStoredHealthData();
        $.extend(healthData, PerfUtils.getHealthReport());
        return healthData;
    }

    /**
     * Sets the health data
     * @param {Object} dataObject The object to be stored as health data
     */
    function setHealthData(dataObject) {
        if (!shouldLogHealthData()) {
            return;
        }
        PreferencesManager.setViewState(HEALTH_DATA_STATE_KEY, dataObject);
    }

    /**
     * Returns health data logged for the given key
     * @return {Object} Health Data object for the key or undefined if no health data stored
     */
    function getHealthDataLog(key) {
        var healthData = getStoredHealthData();
        return healthData[key];
    }

    /**
     * Sets the health data for the given key
     * @param {Object} dataObject The object to be stored as health data for the key
     */
    function setHealthDataLog(key, dataObject) {
        var healthData = getStoredHealthData();
        healthData[key] = dataObject;
        setHealthData(healthData);
    }

    /**
     * Clears all the health data recorded till now
     */
    function clearHealthData() {
        PreferencesManager.setViewState(HEALTH_DATA_STATE_KEY, {});
        //clear the performance related health data also
        PerfUtils.clear();
    }

    /**
     * Enable or disable health data logs
     * @param {boolean} enabled true to enable health logs
     */
    function setHealthLogsEnabled(enabled) {
        logHealthData = enabled;
        if (!enabled) {
            clearHealthData();
        }
    }

    /**
     * Whenever a file is opened call this function. The function will record the number of times
     * the standard file types have been opened. We only log the standard filetypes
     * @param {String} filePath          The path of the file to be registered
     * @param {boolean} addedToWorkingSet set to true if extensions of files added to the
     *                                    working set needs to be logged
     */
    function fileOpened(filePath, addedToWorkingSet, encoding) {
        if (!shouldLogHealthData()) {
            return;
        }
        var fileExtension = FileUtils.getFileExtension(filePath),
            language = LanguageManager.getLanguageForPath(filePath),
            healthData = getStoredHealthData(),
            fileExtCountMap = [];
        healthData.fileStats = healthData.fileStats || {
            openedFileExt: {},
            workingSetFileExt: {},
            openedFileEncoding: {}
        };
        if (language.getId() !== "unknown") {
            fileExtCountMap = addedToWorkingSet ? healthData.fileStats.workingSetFileExt : healthData.fileStats.openedFileExt;
            if (!fileExtCountMap[fileExtension]) {
                fileExtCountMap[fileExtension] = 0;
            }
            fileExtCountMap[fileExtension]++;
            setHealthData(healthData);
        }
        if (encoding) {
            var fileEncCountMap = healthData.fileStats.openedFileEncoding;
            if (!fileEncCountMap) {
                healthData.fileStats.openedFileEncoding = {};
                fileEncCountMap = healthData.fileStats.openedFileEncoding;
            }
            if (!fileEncCountMap[encoding]) {
                fileEncCountMap[encoding] = 0;
            }
            fileEncCountMap[encoding]++;
            setHealthData(healthData);
        }

        if(addedToWorkingSet){
            Metrics.countEvent(Metrics.EVENT_TYPE.EDITOR, commonStrings.FILE_ADD_TO_WORKING_SET,
                language._name.toLowerCase(), 1);
        } else {
            Metrics.countEvent(Metrics.EVENT_TYPE.EDITOR, commonStrings.FILE_OPEN, language._name.toLowerCase(), 1);
        }
    }

    /**
     * Whenever a file is saved call this function.
     * The function will send the analytics Data
     * We only log the standard filetypes and fileSize
     * @param {String} filePath The path of the file to be registered
     */
    function fileSaved(docToSave) {
        if (!docToSave) {
            return;
        }
        let fileType = docToSave.language ? docToSave.language._name : "";
        Metrics.countEvent(Metrics.EVENT_TYPE.EDITOR, commonStrings.FILE_SAVE, fileType, 1);
    }

    /**
     * Whenever a file is closed call this function.
     * The function will send the analytics Data.
     * We only log the standard filetypes and fileSize
     * @param {String} filePath The path of the file to be registered
     */
    function fileClosed(file) {
        if (!file) {
            return;
        }
        var language = LanguageManager.getLanguageForPath(file._path),
            size = -1;

        function _sendData(fileSizeInKB) {
            let subType = "",
                fileSizeInMB = fileSizeInKB/1024;

            if(fileSizeInMB <= 1) {
                // We don't log exact file sizes for privacy.
                if(fileSizeInKB < 0) {
                    subType = "";
                }
                if(fileSizeInKB <= 10) {
                    subType = "0_to_10KB";
                } else if (fileSizeInKB <= 50) {
                    subType = "10_to_50KB";
                } else if (fileSizeInKB <= 100) {
                    subType = "50_to_100KB";
                } else if (fileSizeInKB <= 500) {
                    subType = "100_to_500KB";
                } else {
                    subType = "500KB_to_1MB";
                }

            } else {
                if(fileSizeInMB <= 2) {
                    subType = "1_to_2MB";
                } else if(fileSizeInMB <= 5) {
                    subType = "2_to_5MB";
                } else if(fileSizeInMB <= 10) {
                    subType = "5_to_10MB";
                } else {
                    subType = "Above_10MB";
                }
            }

            Metrics.countEvent(Metrics.EVENT_TYPE.EDITOR, commonStrings.FILE_CLOSE,
                `${language._name.toLowerCase()}.${subType}`, 1);
        }

        file.stat(function(err, fileStat) {
            if(!err) {
                size = fileStat.size.valueOf()/1024;
            }
            _sendData(size);
        });
    }

    /**
     * Sets the project details(a probably unique prjID, number of files in the project and the node cache size) in the health log
     * The name of the project is never saved into the health data log, only the hash(name) is for privacy requirements.
     * @param {string} projectName The name of the project
     * @param {number} numFiles    The number of file in the project
     * @param {number} cacheSize   The node file cache memory consumed by the project
     */
    function setProjectDetail(projectName, numFiles, cacheSize) {
        var projectNameHash = StringUtils.hashCode(projectName),
            FIFLog = getHealthDataLog("ProjectDetails");
        if (!FIFLog) {
            FIFLog = {};
        }
        FIFLog["prj" + projectNameHash] = {
            numFiles: numFiles,
            cacheSize: cacheSize
        };
        setHealthDataLog("ProjectDetails", FIFLog);
    }

    // Define public API
    exports.getHealthDataLog          = getHealthDataLog;
    exports.setHealthDataLog          = setHealthDataLog;
    exports.getAggregatedHealthData   = getAggregatedHealthData;
    exports.clearHealthData           = clearHealthData;
    exports.fileOpened                = fileOpened;
    exports.fileSaved                 = fileSaved;
    exports.fileClosed                = fileClosed;
    exports.setProjectDetail          = setProjectDetail;
    exports.setHealthLogsEnabled      = setHealthLogsEnabled;
    exports.shouldLogHealthData       = shouldLogHealthData;
    exports.init                      = init;

    // constants
    // searchType for searchDone()
    exports.SEARCH_INSTANT            = "searchInstant";
    exports.SEARCH_ON_RETURN_KEY      = "searchOnReturnKey";
    exports.SEARCH_REPLACE_ALL        = "searchReplaceAll";
    exports.SEARCH_NEXT_PAGE          = "searchNextPage";
    exports.SEARCH_PREV_PAGE          = "searchPrevPage";
    exports.SEARCH_LAST_PAGE          = "searchLastPage";
    exports.SEARCH_FIRST_PAGE         = "searchFirstPage";
    exports.SEARCH_REGEXP             = "searchRegExp";
    exports.SEARCH_CASE_SENSITIVE     = "searchCaseSensitive";
    // A new search context on search bar up-Gives an idea of number of times user did a discrete search
    exports.SEARCH_NEW                = "searchNew";
    exports.commonStrings = commonStrings;
    exports.analyticsEventMap = analyticsEventMap;
});
