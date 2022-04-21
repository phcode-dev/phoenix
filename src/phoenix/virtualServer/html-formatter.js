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

/* global ContentType, importScripts, icons*/

importScripts('phoenix/virtualServer/content-type.js');
importScripts('phoenix/virtualServer/icons.js');

if(!self.HtmlFormatter){
// 20-Apr-2004 17:14
    const formatDate = d => {
        const day = d.getDate();
        const month = d.toLocaleString('en-us', {month: 'short'});
        const year = d.getFullYear();
        const hours = d.getHours();
        const mins = d.getMinutes();
        return `${day}-${month}-${year} ${hours}:${mins}`;
    };

    const formatSize = s => {
        const units = ['', 'K', 'M'];
        if (!s) {
            return '-';
        }
        const i = Math.floor(Math.log(s) / Math.log(1024));
        return Math.round(s / Math.pow(1024, i), 2) + units[i];
    };

    const formatRow = (
        icon,
        alt = '[   ]',
        href,
        name,
        modified,
        size
    ) => `<tr><td valign='top'><img src='${icon || icons.unknown}' alt='${alt}'></td><td>
      <a href='${href}'>${name}</a></td>
      <td align='right'>${formatDate(new Date(modified))}</td>
      <td align='right'>${formatSize(size)}</td><td>&nbsp;</td></tr>`;

    const footerClose = '<address>nohost (Web Browser Server)</address></body></html>';

    /**
     * Send an Apache-style 404
     */
    function format404(url) {
        const body = `
    <!DOCTYPE html>
    <html><head>
    <title>404 Not Found</title>
    </head><body>
    <h1>Not Found</h1>
    <p>The requested URL ${url} was not found on this server.</p>
    <hr>${footerClose}`;

        return {
            body,
            config: {
                status: 404,
                statusText: 'Not Found',
                headers: {'Content-Type': 'text/html'}
            }
        };
    }

    /**
     * Send an Apache-style 500
     */
    function format500(path, err) {
        const body = `
    <!DOCTYPE html>
    <html><head>
    <title>500 Internal Server Error</title>
    </head><body>
    <h1>Internal Server Error</h1>
    <p>The server encountered an internal error while attempting to access ${path}.</p>
    <p>The error was: ${err.message}.</p>
    <hr>${footerClose}`;

        return {
            body,
            config: {
                status: 500,
                statusText: 'Internal Error',
                headers: {'Content-Type': 'text/html'}
            }
        };
    }

    /**
     * Send an Apache-style directory listing
     */
    function formatDir(route, dirPath, entries) {
        const parent = self.path.dirname(dirPath) || '/';
        // Maintain path sep, but deal with things like spaces in filenames
        const url = encodeURI(route + parent);
        const header = `
    <!DOCTYPE html>
    <html><head><title>Index of ${dirPath}</title></head>
    <body><h1>Index of ${dirPath}</h1>
    <table><tr><th><img src='${icons.blank}' alt='[ICO]'></th>
    <th><b>Name</b></th><th><b>Last modified</b></th>
    <th><b>Size</b></th><th><b>Description</b></th></tr>
    <tr><th colspan='5'><hr></th></tr>
    <tr><td valign='top'><img src='${icons.back}' alt='[DIR]'></td>
    <td><a href='${url}'>Parent Directory</a></td><td>&nbsp;</td>
    <td align='right'>  - </td><td>&nbsp;</td></tr>`;
        const footer = `<tr><th colspan='5'><hr></th></tr></table>${footerClose}`;

        const rows = entries.map(entry => {
            let entryName = entry.name || entry;
            const ext = self.path.extname(entryName);
            // Maintain path sep, but deal with things like spaces in filenames
            const href = encodeURI(`${route}${self.path.join(dirPath, entryName)}`);
            let icon;
            let alt;

            // TODO: switch this to entry.isDirectory() if possible
            if (ContentType.isImage(ext)) {
                icon = icons.image2;
                alt = '[IMG]';
            } else if (ContentType.isMedia(ext)) {
                icon = icons.movie;
                alt = '[MOV]';
            } else if (!ext) {
                icon = icons.folder;
                alt = '[DIR]';
            } else {
                icon = icons.text;
                alt = '[TXT]';
            }

            return formatRow(icon, alt, href, entryName, entry.mtime, entry.size);
        }).join('\n');

        return {
            body: header + rows + footer,
            config: {
                status: 200,
                statusText: 'OK',
                headers: {'Content-Type': 'text/html'}
            }
        };
    }

    function formatFile(path, content) {
        return {
            body: content,
            config: {
                status: 200,
                statusText: 'OK',
                headers: {'Content-Type': ContentType.getMimeType(path)}
            }
        };
    }

    self.HtmlFormatter = {
        format404,
        format500,
        formatDir,
        formatFile
    };
}
