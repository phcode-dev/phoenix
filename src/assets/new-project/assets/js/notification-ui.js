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

/*global FloatingUIDOM*/
// this is a custom impl of utils/notification ui for iframes

const CLOSE_TIMEOUT = 'closeTimeout';
const CLOSE_CLICK_DISMISS = 'clickDismiss';

function Notification(tooltip) {
    this.$tooltip    = tooltip;
    this._result  = new $.Deferred();
    this._promise = this._result.promise();
}

Notification.prototype.close = function (closeType) {
    let $tooltip = this.$tooltip;
    if(!$tooltip){
        return this; // if already closed
    }
    $tooltip.removeClass('notification-ui-visible')
        .addClass('notification-ui-hidden');
    setTimeout(()=>{
        // wait for the animation to complete before removal
        $tooltip.remove();
        this.$tooltip = null;
        this._result.resolve(closeType);
    }, 1000);
    return this;
};

Notification.prototype.done = function (callback) {
    this._promise.done(callback);
};

function createNotificationFromTemplate(template, elementID, options) {
    // https://floating-ui.com/docs/tutorial
    options.allowedPlacements = options.allowedPlacements || ['top', 'bottom', 'left', 'right'];
    options.dismissOnClick = options.dismissOnClick || true;
    if(!elementID){
        elementID = 'notificationUIDefaultAnchor';
    }
    const tooltip = _createDomElementWithArrowElement(template, elementID, options);
    tooltip.addClass('notification-ui-visible');
    let notification = (new Notification(tooltip));

    if(options.autoCloseTimeS){
        setTimeout(()=>{
            notification.close(CLOSE_TIMEOUT);
        }, options.autoCloseTimeS * 1000);
    }

    if(options.dismissOnClick){
        tooltip.click(()=>{
            notification.close(CLOSE_CLICK_DISMISS);
        });
    }
    return notification;
}

let notificationWidgetCount = 0;

function _computePlacementWithArrowElement(tooltip, arrowElement, {x, y, placement, middlewareData}) {
    Object.assign(tooltip.style, {
        left: `${x}px`,
        top: `${y}px`
    });
    if(arrowElement){
        const {x: arrowX, y: arrowY} = middlewareData.arrow;

        const staticSide = {
            top: 'bottom',
            right: 'left',
            bottom: 'top',
            left: 'right'
        }[placement.split('-')[0]];

        Object.assign(arrowElement.style, {
            left: arrowX != null ? `${arrowX}px` : '',
            top: arrowY != null ? `${arrowY}px` : '',
            right: '',
            bottom: '',
            [staticSide]: '-4px'
        });
    }
}

function _updatePositions(tooltip, onElement, arrowElement, options) {
    let middleWare=  [
        FloatingUIDOM.offset(6),
        FloatingUIDOM.autoPlacement({
            // 'right' and 'left' won't be chosen
            allowedPlacements: options.allowedPlacements
        }),
        FloatingUIDOM.shift({padding: 5})
    ];
    if(arrowElement){
        middleWare.push(FloatingUIDOM.arrow({element: arrowElement}));
    }
    tooltip.update = function () {
        FloatingUIDOM.computePosition(onElement, tooltip, {
            placement: 'top',
            middleware: middleWare
        }).then(({x, y, placement, middlewareData}) => {
            _computePlacementWithArrowElement(tooltip, arrowElement,
                {x, y, placement, middlewareData});
        });
    };
    tooltip.update();
}

function _createDomElementWithArrowElement(domTemplate, elementID, options) {
    notificationWidgetCount++;
    const onElement = document.getElementById(elementID);
    let arrowElement;
    let widgetID = `notification-ui-widget-${notificationWidgetCount}`;
    let arrowID = `notification-ui-arrow-${notificationWidgetCount}`;
    let textTemplate = null;
    if (typeof domTemplate === 'string' || domTemplate instanceof String){
        textTemplate = domTemplate;
    }
    let floatingDom = $(`<div id="${widgetID}" class="notification-ui-tooltip" role="tooltip">
                            ${textTemplate||''}</div>`);
    if(!textTemplate && domTemplate){
        floatingDom.append($(domTemplate));
    }
    if(onElement){
        arrowElement = $(`<div id="${arrowID}" class="notification-ui-arrow"></div>`);
        floatingDom.append(arrowElement);
    }
    $("body").append(floatingDom);
    _updatePositions(floatingDom[0], onElement, arrowElement[0], options);
    return floatingDom;
}

