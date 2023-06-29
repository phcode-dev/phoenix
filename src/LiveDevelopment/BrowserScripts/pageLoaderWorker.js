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
 * We need to set this up in a worker as if the user is debugging a live preview page, the heartbeat messages will
 * be blocked in main thread, but fine in isolated worker thread.
 * @private
 */


function _setupBroadcastChannel(broadcastChannel, clientID) {
    if(!broadcastChannel){
        return;
    }
    const _livePreviewNavigationChannel=new BroadcastChannel(broadcastChannel);
    _livePreviewNavigationChannel.onmessage = (event) => {
        const type = event.data.type;
        switch (type) {
        case 'REDIRECT_PAGE': postMessage({type, URL: event.data.URL}); break;
        case 'TAB_ONLINE': break; // do nothing. This is a loopback message from another live preview tab
        }
    };
    function _sendOnlineHeartbeat() {
        _livePreviewNavigationChannel.postMessage({
            type: 'TAB_ONLINE',
            clientID,
            URL: location.href
        });
    }
    _sendOnlineHeartbeat();
    setInterval(()=>{
        _sendOnlineHeartbeat();
    }, 1000);
}

onmessage = (event) => {
    const type = event.data.type;
    switch (type) {
    case 'setupBroadcast': _setupBroadcastChannel(event.data.broadcastChannel, event.data.clientID); break;
    default: console.error("Live Preview page worker: received unknown event:", event);
    }
};
