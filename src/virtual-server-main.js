/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * modified by core.ai, based on work by David Humphrey <david.humphrey@senecacolleage.ca> (@humphd)
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License along
 * with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

/* global workbox, importScripts, Serve, JSONFormatter, HtmlFormatter, Config*/
importScripts('phoenix/virtualfs.js');
importScripts('phoenix/virtualServer/mime-types.js');
importScripts('phoenix/virtualServer/config.js');
importScripts('phoenix/virtualServer/content-type.js');
importScripts('phoenix/virtualServer/webserver.js');
importScripts('phoenix/virtualServer/json-formatter.js');
importScripts('phoenix/virtualServer/html-formatter.js');

const VIRTUAL_SERVER_URLS = [];
importScripts('service-worker-core.js');

let baseURL = location.href;
if(location.href.indexOf( "?")>-1){
    baseURL = location.href.substring( 0, location.href.indexOf( "?")); // remove query string params
}
if(location.href.indexOf( "#")>-1){
    baseURL = baseURL.substring( 0, baseURL.indexOf( "#")); // remove hrefs in page
}
if(location.href.indexOf( "/")>-1){
    baseURL = baseURL.substring( 0, baseURL.lastIndexOf( "/"));
}

// Route with trailing slash (i.e., /path/into/filesystem)
const wwwRegex = new RegExp(`${Config.route}(/.*)`);
// Route minus the trailing slash
const wwwPartialRegex = new RegExp(`${Config.route}$`);

function _isVirtualServing(url) {
    for(let serverBaseURL of VIRTUAL_SERVER_URLS){
        if(url.startsWith(serverBaseURL)){
            return true;
        }
    }
    return false;
}

function _shouldServe(request) {
    return _isVirtualServing(request.url.href);
}

workbox.routing.registerRoute(
    _shouldServe,
    ({url}) => {
        // Pull the filesystem path off the url
        let path = url.pathname.match(wwwRegex)[1];
        // Deal with encoding in the filename (e.g., spaces as %20)
        path = decodeURI(path);

        // Allow passing `?json` on URL to get back JSON vs. raw response
        const formatter =
            url.searchParams.get('json') !== null
                ? JSONFormatter
                : HtmlFormatter;

        const download = false;
        // commented Allow passing `?download` or `dl` to have the file downloaded vs. displayed
        // url.searchParams.get('download') !== null ||
        // url.searchParams.get('dl') !== null;

        return Serve.serve(path, formatter, download);
    },
    'GET'
);

// Redirect if missing the / on our expected route
workbox.routing.registerRoute(
    _shouldServe,
    ({url}) => {
        url.pathname = `${Config.route}/`;
        return Promise.resolve(Response.redirect(url, 302));
    },
    'GET'
);

workbox.core.clientsClaim();
