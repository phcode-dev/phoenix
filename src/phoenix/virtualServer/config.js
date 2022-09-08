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

if(!self.Config){
    /**
     * Various features of the server can be configured by passing options on
     * the query string when registering the nohost-sw.js service worker file.
     *
     * `route`: `String` value with the route name to use when listening for filesystem
     * path requests. Defaults to `fs`, such that `/fs/path/to/file` would give
     * `/path/to/file`. If the `route` includes multiple levels, pass them on the
     * URL encoded (i.e., `'first%2Fsecond'` for `'/first/second'`).
     *
     * `disableIndexes`: if present (i.e., `Boolean`), directory indexes will not be shown.
     * Users will have to know the filename they wish to get back from the server.  Defaults
     * to `true` (i.e. directory indexes are shown).
     *
     * `debug`: if present (i.e., `Boolean`), enable workbox debug logging
     */
    const url = new URL(location);

    /**
     * Given a route string, make sure it follows the pattern we expect:
     *  - no escaped characters
     *  - begins with a `/`
     *  - ends with a no trailing `/`
     *
     * If we were passed `'fs'`, we would normalize to `/fs` and
     * if we were passed `'first%2Fsecond'`, `'/first/second'`
     *
     * @param {String} route
     */
    function getNormalizeRoute() {
        let route = url.searchParams.get('route') || 'fs';

        // Only a single / at the front of the route
        route = route.replace(/^\/*/, '');
        // Only a single / at the end of the route
        route = route.replace(/\/*$/, '');

        return route;
    }

    self.Config = {
        route: getNormalizeRoute(),
        disableIndexes: url.searchParams.get('disableIndexes') !== null,
        debug: url.searchParams.get('debug') === 'true'
    };
}
