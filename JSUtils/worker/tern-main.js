/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2017 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*eslint-env worker */
/*global Phoenix, WorkerComm, tern*/

// import acorn lib
importScripts(`${Phoenix.baseURL}thirdparty/acorn/dist/acorn.js`);
importScripts(`${Phoenix.baseURL}thirdparty/acorn/dist/acorn_loose.js`);
importScripts(`${Phoenix.baseURL}thirdparty/acorn/dist/walk.js`);
// import tern lib
importScripts(`${Phoenix.baseURL}thirdparty/tern/lib/signal.js`);
importScripts(`${Phoenix.baseURL}thirdparty/tern/lib/tern.js`);
importScripts(`${Phoenix.baseURL}thirdparty/tern/lib/comment.js`);
importScripts(`${Phoenix.baseURL}thirdparty/tern/lib/def.js`);
importScripts(`${Phoenix.baseURL}thirdparty/tern/lib/infer.js`);
const Tern = tern;
// import tern plugins
importScripts(`${Phoenix.baseURL}thirdparty/tern/plugin/modules.js`);
importScripts(`${Phoenix.baseURL}thirdparty/tern/plugin/requirejs.js`);
importScripts(`${Phoenix.baseURL}thirdparty/tern/plugin/es_modules.js`);
importScripts(`${Phoenix.baseURL}thirdparty/tern/plugin/doc_comment.js`);
importScripts(`${Phoenix.baseURL}thirdparty/tern/plugin/node.js`);
importScripts(`${Phoenix.baseURL}thirdparty/tern/plugin/node_resolve.js`);
importScripts(`${Phoenix.baseURL}thirdparty/tern/plugin/complete_strings.js`);
importScripts(`${Phoenix.baseURL}thirdparty/tern/plugin/commonjs.js`);
importScripts(`${Phoenix.baseURL}thirdparty/tern/plugin/angular.js`);

importScripts(`${Phoenix.baseURL}JSUtils/worker/testTern.js`);

const detailedDebugLogs = false; // set this to false before checkin

function debugLog(...args) {
    if(!detailedDebugLogs) {
        return;
    }
    console.log("tern: " + args[0], ...args.splice(1));
}

function _postTernData(data) {
    WorkerComm.triggerPeer("tern-data", data);
}

let MessageIds,
    ternOptions,
    config = {};

fetch(`${Phoenix.baseURL}JSUtils/MessageIds.json`)
    .then(async contents =>{
        MessageIds = await contents.json();
    })
    .catch(e =>{
        console.error("failed to init MessageIds ", e);
    });

let ternServer  = null,
    isUntitledDoc = false,
    inferenceTimeout;

// Save the tern callbacks for when we get the contents of the file
let fileCallBacks = {};

let _dirtyFilesCache = {};

/**
 * Clears the cache for dirty file paths
 */
function clearDirtyFilesCache() {
    _dirtyFilesCache = {};
}

/**
 * Updates the files cache with fullpath when dirty flag changes for a document
 * If the doc is being marked as dirty then an entry is created in the cache
 * If the doc is being marked as clean then the corresponsing entry gets cleared from cache
 *
 * @param {String} name - fullpath of the document
 * @param {boolean} action - whether the document is dirty
 */
function updateDirtyFilesCache(name, action) {
    if (action) {
        _dirtyFilesCache[name] = true;
    } else {
        if (_dirtyFilesCache[name]) {
            delete _dirtyFilesCache[name];
        }
    }
}

/**
 * Report exception
 * @private
 * @param {Error} e - the error object
 */
function _reportError(e, file) {
    if (e instanceof Tern.TimedOut) {
        // Post a message back to the main thread with timedout info
        _postTernData({
            type: MessageIds.TERN_INFERENCE_TIMEDOUT,
            file: file
        });
    } else {
        console.error("Error thrown in tern worker:" + e.message + " : file: " + file , e.stack);
    }
}

/**
 * Handle a response from the main thread providing the contents of a file
 * @param {string} file - the name of the file
 * @param {string} text - the contents of the file
 */
function handleGetFile(file, text) {
    debugLog(`tern Got file ${file}`, text);
    let contentCallback = fileCallBacks[file];
    if (contentCallback) {
        try {
            contentCallback(null, text);
        } catch (e) {
            _reportError(e, file);
        }
    }
    delete fileCallBacks[file];
}

function _getNormalizedFilename(fileName) {
    if (!isUntitledDoc && ternServer.projectDir && fileName.indexOf(ternServer.projectDir) === -1) {
        fileName = ternServer.projectDir + fileName;
    }
    return fileName;
}

function _getDenormalizedFilename(fileName) {
    if (!isUntitledDoc && ternServer.projectDir && fileName.indexOf(ternServer.projectDir) === 0) {
        fileName = fileName.slice(ternServer.projectDir.length);
    }
    return fileName;
}

/**
 * Callback handle to request contents of a file from the main thread
 * @param {string} file - the name of the file
 */
function _requestFileContent(name) {
    debugLog("_requestFileContent: ", name);
    _postTernData({
        type: MessageIds.TERN_GET_FILE_MSG,
        file: name
    });
}

/**
 * Provide the contents of the requested file to tern
 * @param {string} name - the name of the file
 * @param {Function} contentCb - the function to call with the text of the file
 *  once it has been read in.
 */
function getFile(name, contentCb) {
    // save the callback
    fileCallBacks[name] = contentCb;

    try {
        _requestFileContent(name);
    } catch (error) {
        console.log(error);
    }
}

/**
 * Create a new tern server.
 *
 * @param {Object} env - an Object with the environment, as read in from
 *  the json files in thirdparty/tern/defs
 * @param {Array.<string>} files - a list of filenames tern should be aware of
 */
function initTernServer(env, files) {
    console.log("init tern server with files: ", files);
    ternOptions = {
        defs: env,
        async: true,
        getFile: getFile,
        plugins: {
            commonjs: true,
            requirejs: {},
            angular: true,
            complete_strings: true,
            doc_comment: true,
            doc_comments: true,
            es_modules: true,
            node: true,
            node_resolve: true
        }
    };

    // If a server is already created just reset the analysis data before marking it for GC
    if (ternServer) {
        ternServer.reset();
        Tern.resetGuessing();
    }

    ternServer = new Tern.Server(ternOptions);

    files.forEach(function (file) {
        ternServer.addFile(file);
    });

}

/**
 * Resets an existing tern server.
 */
function resetTernServer() {
    // If a server is already created just reset the analysis data
    if (ternServer) {
        ternServer.reset();
        Tern.resetGuessing();
        // tell the main thread we're ready to start processing again
        _postTernData({type: MessageIds.TERN_WORKER_READY});
    }
}

/**
 * Create a "empty" update object.
 *
 * @param {string} path - full path of the file.
 * @return {{type: string, name: string, offsetLines: number, text: string}} -
 * "empty" update.

 */
function createEmptyUpdate(path) {
    return {type: MessageIds.TERN_FILE_INFO_TYPE_EMPTY,
        name: path,
        offsetLines: 0,
        text: ""};
}

/**
 * Build an object that can be used as a request to tern.
 *
 * @param {{type: string, name: string, offsetLines: number, text: string}} fileInfo
 * - type of update, name of file, and the text of the update.
 * For "full" updates, the whole text of the file is present. For "part" updates,
 * the changed portion of the text. For "empty" updates, the file has not been modified
 * and the text is empty.
 * @param {string} query - the type of request being made
 * @param {{line: number, ch: number}} offset -
 */
function buildRequest(fileInfo, query, offset) {
    query = {type: query};
    query.start = offset;
    query.end = offset;
    query.file = (fileInfo.type === MessageIds.TERN_FILE_INFO_TYPE_PART) ? "#0" : fileInfo.name;
    query.filter = false;
    query.sort = false;
    query.depths = true;
    query.guess = true;
    query.origins = true;
    query.types = true;
    query.expandWordForward = false;
    query.lineCharPositions = true;
    query.docs = true;
    query.urls = true;

    let request = {query: query, files: [], offset: offset, timeout: inferenceTimeout};
    if (fileInfo.type !== MessageIds.TERN_FILE_INFO_TYPE_EMPTY) {
        // Create a copy to mutate ahead
        let fileInfoCopy = JSON.parse(JSON.stringify(fileInfo));
        request.files.push(fileInfoCopy);
    }

    return request;
}


/**
 * Get all References location
 * @param {{type: string, name: string, offsetLines: number, text: string}} fileInfo
 * - type of update, name of file, and the text of the update.
 * For "full" updates, the whole text of the file is present. For "part" updates,
 * the changed portion of the text. For "empty" updates, the file has not been modified
 * and the text is empty.
 * @param {{line: number, ch: number}} offset - the offset into the
 * file for cursor
 */
function getRefs(fileInfo, offset) {
    let request = buildRequest(fileInfo, "refs", offset);
    try {
        ternServer.request(request, function (error, data) {
            if (error) {
                console.error("Error returned from Tern 'refs' request: " + error);
                let response = {
                    type: MessageIds.TERN_REFS,
                    error: error.message
                };
                _postTernData(response);
                return;
            }
            let response = {
                type: MessageIds.TERN_REFS,
                file: fileInfo.name,
                offset: offset,
                references: data
            };
            // Post a message back to the main thread with the results
            _postTernData(response);
        });
    } catch (e) {
        _reportError(e, fileInfo.name);
    }
}

/**
 * Get scope at the offset in the file
 * @param {{type: string, name: string, offsetLines: number, text: string}} fileInfo
 * - type of update, name of file, and the text of the update.
 * For "full" updates, the whole text of the file is present. For "part" updates,
 * the changed portion of the text. For "empty" updates, the file has not been modified
 * and the text is empty.
 * @param {{line: number, ch: number}} offset - the offset into the
 * file for cursor
 */
function getScopeData(fileInfo, offset) {
    // Create a new tern Server
    // Existing tern server resolves all the required modules which might take time
    // We only need to analyze single file for getting the scope
    ternOptions.plugins = {};
    let ternServer = new Tern.Server(ternOptions);
    ternServer.addFile(fileInfo.name, fileInfo.text);

    let error;
    let request = buildRequest(fileInfo, "completions", offset); // for primepump

    try {
        // primepump
        ternServer.request(request, function (ternError, data) {
            if (ternError) {
                console.error("Error for Tern request: \n" + JSON.stringify(request) + "\n" + ternError);
                error = ternError.toString();
            } else {
                let file = ternServer.findFile(fileInfo.name);
                let scope = Tern.scopeAt(file.ast, Tern.resolvePos(file, offset), file.scope);

                if (scope) {
                    // Remove unwanted properties to remove cycles in the object
                    scope = JSON.parse(JSON.stringify(scope, function(key, value) {
                        if (["proto", "propertyOf", "onNewProp", "sourceFile", "maybeProps"].includes(key)) {
                            return undefined;
                        }                        else if (key === "fnType") {
                            return value.name || "FunctionExpression";
                        }                        else if (key === "props") {
                            for (let key in value) {
                                value[key] = value[key].propertyName;
                            }
                            return value;
                        } else if (key === "originNode") {
                            return value && {
                                start: value.start,
                                end: value.end,
                                type: value.type,
                                body: {
                                    start: value.body.start,
                                    end: value.body.end
                                }
                            };
                        }

                        return value;
                    }));
                }

                _postTernData({
                    type: MessageIds.TERN_SCOPEDATA_MSG,
                    file: _getNormalizedFilename(fileInfo.name),
                    offset: offset,
                    scope: scope
                });
            }
        });
    } catch (e) {
        _reportError(e, fileInfo.name);
    } finally {
        ternServer.reset();
        Tern.resetGuessing();
    }
}


/**
 * Get definition location
 * @param {{type: string, name: string, offsetLines: number, text: string}} fileInfo
 * - type of update, name of file, and the text of the update.
 * For "full" updates, the whole text of the file is present. For "part" updates,
 * the changed portion of the text. For "empty" updates, the file has not been modified
 * and the text is empty.
 * @param {{line: number, ch: number}} offset - the offset into the
 * file for cursor
 */
function getJumptoDef(fileInfo, offset) {
    let request = buildRequest(fileInfo, "definition", offset);
    // request.query.typeOnly = true;       // FIXME: tern doesn't work exactly right yet.

    try {
        ternServer.request(request, function (error, data) {
            if (error) {
                console.error("Error returned from Tern 'definition' request: " + error);
                _postTernData({type: MessageIds.TERN_JUMPTODEF_MSG, file: fileInfo.name, offset: offset});
                return;
            }
            let response = {
                type: MessageIds.TERN_JUMPTODEF_MSG,
                file: _getNormalizedFilename(fileInfo.name),
                resultFile: data.file,
                offset: offset,
                start: data.start,
                end: data.end
            };

            request = buildRequest(fileInfo, "definition", offset);

            ternServer.request(request, function (error, data) {
                // Post a message back to the main thread with the definition
                _postTernData(response);
            });

        });
    } catch (e) {
        _reportError(e, fileInfo.name);
    }
}

/**
 * Get all the known properties for guessing.
 *
 * @param {{type: string, name: string, offsetLines: number, text: string}} fileInfo
 * - type of update, name of file, and the text of the update.
 * For "full" updates, the whole text of the file is present. For "part" updates,
 * the changed portion of the text. For "empty" updates, the file has not been modified
 * and the text is empty.
 * @param {{line: number, ch: number}} offset -
 * the offset into the file where we want completions for
 * @param {string} type     - the type of the message to reply with.
 */
function getTernProperties(fileInfo, offset, type) {

    let request = buildRequest(fileInfo, "properties", offset),
        i;
    //console.error("tern properties: request " + request.type + dir + " " + file);
    try {
        ternServer.request(request, function (error, data) {
            let properties = [];
            if (error) {
                console.error("Error returned from Tern 'properties' request: " + error);
            } else {
                //console.error("tern properties: completions = " + data.completions.length);
                properties = data.completions.map(function (completion) {
                    return {value: completion, type: completion.type, guess: true};
                });
            }
            // Post a message back to the main thread with the completions
            _postTernData({type: type,
                file: _getNormalizedFilename(fileInfo.name),
                offset: offset,
                properties: properties
            });
        });
    } catch (e) {
        _reportError(e, fileInfo.name);
    }
}

/**
 * Get the completions for the given offset
 *
 * @param {{type: string, name: string, offsetLines: number, text: string}} fileInfo
 * - type of update, name of file, and the text of the update.
 * For "full" updates, the whole text of the file is present. For "part" updates,
 * the changed portion of the text. For "empty" updates, the file has not been modified
 * and the text is empty.
 * @param {{line: number, ch: number}} offset -
 * the offset into the file where we want completions for
 * @param {boolean} isProperty - true if getting a property hint,
 * otherwise getting an identifier hint.
 */
function getTernHints(fileInfo, offset, isProperty) {
    let request = buildRequest(fileInfo, "completions", offset),
        i;
    //console.error("request " + dir + " " + file + " " + offset /*+ " " + text */);
    try {
        ternServer.request(request, function (error, data) {
            let completions = [];
            if (error) {
                console.error("Error returned from Tern 'completions' request: " + error);
            } else {
                //console.error("found " + data.completions + " for " + file + "@" + offset);
                completions = data.completions.map(function (completion) {
                    return {value: completion.name, type: completion.type, depth: completion.depth,
                        guess: completion.guess, origin: completion.origin, doc: completion.doc, url: completion.url};
                });
            }

            if (completions.length > 0 || !isProperty) {
                // Post a message back to the main thread with the completions
                _postTernData({type: MessageIds.TERN_COMPLETIONS_MSG,
                    file: _getNormalizedFilename(fileInfo.name),
                    offset: offset,
                    completions: completions
                });
            } else {
                // if there are no completions, then get all the properties
                getTernProperties(fileInfo, offset, MessageIds.TERN_COMPLETIONS_MSG);
            }
        });
    } catch (e) {
        _reportError(e, fileInfo.name);
    }
}

/**
 *  Given a Tern type object, convert it to an array of Objects, where each object describes
 *  a parameter.
 *
 * @param {!Tern.Fn} inferFnType - type to convert.
 * @return {Array<{name: string, type: string, isOptional: boolean}>} where each entry in the array is a parameter.
 */
function getParameters(inferFnType) {

    // work around define functions before use warning.
    let recordTypeToString, inferTypeToString, processInferFnTypeParameters, inferFnTypeToString;

    /**
     *  Convert an infer array type to a string.
     *
     *  Formatted using google closure style. For example:
     *
     *  "Array.<string, number>"
     *
     * @param {Tern.Arr} inferArrType
     *
     * @return {string} - array formatted in google closure style.
     *
     */
    function inferArrTypeToString(inferArrType) {
        let result = "Array.<";

        result += inferArrType.props["<i>"].types.map(inferTypeToString).join(", ");

        // workaround case where types is zero length
        if (inferArrType.props["<i>"].types.length === 0) {
            result += "Object";
        }
        result += ">";

        return result;
    }

    /**
     * Convert properties to a record type annotation.
     *
     * @param {Object} props
     * @return {string} - record type annotation
     */
    recordTypeToString = function (props) {
        let result = "{",
            first = true,
            prop;

        result += Object.keys(props).map(function (key) {
            return key + ": " + inferTypeToString(props[key]);
        }).join(", ");

        result += "}";

        return result;
    };

    /**
     *  Convert an infer type to a string.
     *
     * @param {*} inferType - one of the Infer's types; Tern.Prim, Tern.Arr, Tern.ANull. Tern.Fn functions are
     * not handled here.
     *
     * @return {string}
     *
     */
    inferTypeToString = function (inferType) {
        let result;

        if (inferType instanceof Tern.AVal) {
            inferType = inferType.types[0];
        }

        if (inferType instanceof Tern.Prim) {
            result = inferType.toString();
            if (result === "string") {
                result = "String";
            } else if (result === "number") {
                result = "Number";
            } else if (result === "boolean") {
                result = "Boolean";
            }
        } else if (inferType instanceof Tern.Arr) {
            result = inferArrTypeToString(inferType);
        } else if (inferType instanceof Tern.Fn) {
            result = inferFnTypeToString(inferType);
        } else if (inferType instanceof Tern.Obj) {
            if (inferType.name === undefined) {
                result = recordTypeToString(inferType.props);
            } else {
                result = inferType.name;
            }
        } else {
            result = "Object";
        }

        return result;
    };

    /**
     * Format the given parameter array. Handles separators between
     * parameters, syntax for optional parameters, and the order of the
     * parameter type and parameter name.
     *
     * @param {!Array.<{name: string, type: string, isOptional: boolean}>} params -
     * array of parameter descriptors
     * @param {function(string)=} appendSeparators - callback function to append separators.
     * The separator is passed to the callback.
     * @param {function(string, number)=} appendParameter - callback function to append parameter.
     * The formatted parameter type and name is passed to the callback along with the
     * current index of the parameter.
     * @param {boolean=} typesOnly - only show parameter types. The
     * default behavior is to include both parameter names and types.
     * @return {string} - formatted parameter hint
     */
    function formatParameterHint(params, appendSeparators, appendParameter, typesOnly) {
        let result = "",
            pendingOptional = false;

        params.forEach(function (value, i) {
            let param = value.type,
                separators = "";

            if (value.isOptional) {
                // if an optional param is following by an optional parameter, then
                // terminate the bracket. Otherwise enclose a required parameter
                // in the same bracket.
                if (pendingOptional) {
                    separators += "]";
                }

                pendingOptional = true;
            }

            if (i > 0) {
                separators += ", ";
            }

            if (value.isOptional) {
                separators += "[";
            }

            if (appendSeparators) {
                appendSeparators(separators);
            }

            result += separators;

            if (!typesOnly) {
                param += " " + value.name;
            }

            if (appendParameter) {
                appendParameter(param, i);
            }

            result += param;

        });

        if (pendingOptional) {
            if (appendSeparators) {
                appendSeparators("]");
            }

            result += "]";
        }

        return result;
    }

    /**
     * Convert an infer function type to a Google closure type string.
     *
     * @param {Tern.Fn} inferType - type to convert.
     * @return {string} - function type as a string.
     */
    inferFnTypeToString = function (inferType) {
        let result = "function(",
            params = processInferFnTypeParameters(inferType);

        result += /*HintUtils2.*/formatParameterHint(params, null, null, true);
        if (inferType.retval) {
            result += "):";
            result += inferTypeToString(inferType.retval);
        }

        return result;
    };

    /**
     * Convert an infer function type to string.
     *
     * @param {*} inferType - one of the Infer's types; Tern.Fn, Tern.Prim, Tern.Arr, Tern.ANull
     * @return {Array<{name: string, type: string, isOptional: boolean}>} where each entry in the array is a parameter.
     */
    processInferFnTypeParameters = function (inferType) {
        let params = [],
            i;

        for (i = 0; i < inferType.args.length; i++) {
            let param = {},
                name = inferType.argNames[i],
                type = inferType.args[i];

            if (!name) {
                name = "param" + (i + 1);
            }

            if (name[name.length - 1] === "?") {
                name = name.substring(0, name.length - 1);
                param.isOptional = true;
            }

            param.name = name;
            param.type = inferTypeToString(type);
            params.push(param);
        }

        return params;
    };

    return processInferFnTypeParameters(inferFnType);
}

/**
 * Get the function type for the given offset
 *
 * @param {{type: string, name: string, offsetLines: number, text: string}} fileInfo
 * - type of update, name of file, and the text of the update.
 * For "full" updates, the whole text of the file is present. For "part" updates,
 * the changed portion of the text. For "empty" updates, the file has not been modified
 * and the text is empty.
 * @param {{line: number, ch: number}} offset -
 * the offset into the file where we want completions for
 */
function handleFunctionType(fileInfo, offset) {
    let request = buildRequest(fileInfo, "type", offset),
        error;

    request.query.preferFunction = true;

    let fnType = "";
    try {
        ternServer.request(request, function (ternError, data) {

            if (ternError) {
                console.error("Error for Tern request: \n" + JSON.stringify(request) + "\n" + ternError);
                error = ternError.toString();
            } else {
                let file = ternServer.findFile(fileInfo.name);

                // convert query from partial to full offsets
                let newOffset = offset;
                if (fileInfo.type === MessageIds.TERN_FILE_INFO_TYPE_PART) {
                    newOffset = {line: offset.line + fileInfo.offsetLines, ch: offset.ch};
                }

                request = buildRequest(createEmptyUpdate(fileInfo.name), "type", newOffset);

                let expr = Tern.findQueryExpr(file, request.query);
                Tern.resetGuessing();
                let type = Tern.expressionType(expr);
                type = type.getFunctionType() || type.getType();

                if (type) {
                    fnType = getParameters(type);
                } else {
                    ternError = "No parameter type found";
                    console.error(ternError);
                }
            }
        });
    } catch (e) {
        _reportError(e, fileInfo.name);
    }

    // Post a message back to the main thread with the completions
    _postTernData({type: MessageIds.TERN_CALLED_FUNC_TYPE_MSG,
        file: _getNormalizedFilename(fileInfo.name),
        offset: offset,
        fnType: fnType,
        error: error
    });
}

/**
 *  Add an array of files to tern.
 *
 * @param {Array.<string>} files - each string in the array is the full
 * path of a file.
 */
function handleAddFiles(files) {
    debugLog("handleAddFiles: ", files);
    files.forEach(function (file) {
        ternServer.addFile(file);
    });
}

/**
 *  Update the context of a file in tern.
 *
 * @param {string} path - full path of file.
 * @param {string} text - content of the file.
 */
function handleUpdateFile(path, text) {
    debugLog(`handleUpdateFile: ${path} `, text);
    ternServer.addFile(path, text);

    _postTernData({type: MessageIds.TERN_UPDATE_FILE_MSG,
        path: path
    });

    // reset to get the best hints with the updated file.
    ternServer.reset();
    Tern.resetGuessing();
}

/**
 *  Make a completions request to tern to force tern to resolve files
 *  and create a fast first lookup for the user.
 * @param {string} path     - the path of the file
 */
function handlePrimePump(path) {
    let fileName = _getDenormalizedFilename(path);
    let fileInfo = createEmptyUpdate(fileName),
        request = buildRequest(fileInfo, "completions", {line: 0, ch: 0});

    try {
        ternServer.request(request, function (error, data) {
            // Post a message back to the main thread
            _postTernData({type: MessageIds.TERN_PRIME_PUMP_MSG,
                path: _getNormalizedFilename(path)
            });
        });
    } catch (e) {
        _reportError(e, path);
    }
}

/**
 * Updates the configuration, typically for debugging purposes.
 *
 * @param {Object} configUpdate new configuration
 */
function setConfig(configUpdate) {
    config = configUpdate;
}

function _requestTernServer(commandConfig) {
    let file, text, offset,
        request = commandConfig,
        type = request.type;

    console.log("Tern worker received Message of type: " + type);

    if (type === MessageIds.TERN_INIT_MSG) {
        let env     = request.env,
            files   = request.files;
        inferenceTimeout = request.timeout;
        initTernServer(env, files);
    } else if (type === MessageIds.TERN_COMPLETIONS_MSG) {
        offset  = request.offset;
        getTernHints(request.fileInfo, offset, request.isProperty);
    } else if (type === MessageIds.TERN_GET_FILE_MSG) {
        file = request.file;
        text = request.text;
        handleGetFile(file, text);
    } else if (type === MessageIds.TERN_CALLED_FUNC_TYPE_MSG) {
        offset  = request.offset;
        handleFunctionType(request.fileInfo, offset);
    } else if (type === MessageIds.TERN_JUMPTODEF_MSG) {
        offset  = request.offset;
        getJumptoDef(request.fileInfo, offset);
    } else if (type === MessageIds.TERN_SCOPEDATA_MSG) {
        offset  = request.offset;
        getScopeData(request.fileInfo, offset);
    } else if (type === MessageIds.TERN_REFS) {
        offset  = request.offset;
        getRefs(request.fileInfo, offset);
    } else if (type === MessageIds.TERN_ADD_FILES_MSG) {
        handleAddFiles(request.files);
    } else if (type === MessageIds.TERN_PRIME_PUMP_MSG) {
        isUntitledDoc = request.isUntitledDoc;
        handlePrimePump(request.path);
    } else if (type === MessageIds.TERN_GET_GUESSES_MSG) {
        offset  = request.offset;
        getTernProperties(request.fileInfo, offset, MessageIds.TERN_GET_GUESSES_MSG);
    } else if (type === MessageIds.TERN_UPDATE_FILE_MSG) {
        handleUpdateFile(request.path, request.text);
    } else if (type === MessageIds.SET_CONFIG) {
        setConfig(request.config);
    } else if (type === MessageIds.TERN_UPDATE_DIRTY_FILE) {
        updateDirtyFilesCache(request.name, request.action);
    } else if (type === MessageIds.TERN_CLEAR_DIRTY_FILES_LIST) {
        clearDirtyFilesCache();
    } else {
        console.error("Unknown message: " + JSON.stringify(request));
    }
}

function invokeTernCommand(commandConfig) {
    try {
        _requestTernServer(commandConfig);
    } catch (error) {
        console.warn(error);
    }
}

WorkerComm.setExecHandler("invokeTernCommand", invokeTernCommand);
WorkerComm.setExecHandler("resetTernServer", resetTernServer);
