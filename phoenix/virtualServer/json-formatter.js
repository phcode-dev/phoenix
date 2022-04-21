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

if(!self.JSONFormatter){
    function format404(url) {
        return {
            body: `The requested URL ${url} was not found on this server.`,
            config: {
                status: 404,
                statusText: 'Not Found',
                headers: {'Content-Type': 'application/json'}
            }
        };
    }

    function format500(path, err) {
        return {
            body: `Internal Server Error accessing ${path}: ${err.message}`,
            config: {
                status: 500,
                statusText: 'Not Found',
                headers: {'Content-Type': 'application/json'}
            }
        };
    }

    function formatDir(route, path, entries) {
        return {
            body: JSON.stringify(entries),
            config: {
                status: 200,
                statusText: 'OK',
                headers: {'Content-Type': 'application/json'}
            }
        };
    }

    function formatFile(path, contents, stats) {
        return {
            body: JSON.stringify(stats),
            config: {
                status: 200,
                statusText: 'OK',
                headers: {'Content-Type': 'application/json'}
            }
        };
    }

    self.JSONFormatter = {
        format404,
        format500,
        formatDir,
        formatFile
    };

}
