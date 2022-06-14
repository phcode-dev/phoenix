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
/**
 * Utilities for showing notifications.
 */

define(function (require, exports, module) {


    let WorkspaceManager  = require("view/WorkspaceManager");

    /**
     * @constructor
     * @private
     *
     * @param {$.Promise} promise A promise that will be resolved when the Notification is dismissed. Never rejected.
     */
    function Notification(tooltip, promise) {
        this.tooltip    = tooltip;
        this._result  = new $.Deferred();
        this._promise = this._result.promise();
    }

    /**
     * Closes the Notification if is visible and destroys then dom nodes
     */
    Notification.prototype.close = function () {
        $(this.tooltip)
            .removeClass('notification-ui-visible')
            .addClass('notification-ui-hidden');
        // remove from body
        this._result.resolve();
    };

    /**
     * Adds a done callback to the Notification promise. The promise will be resolved
     * when the Notification is dismissed. Never rejected.
     */
    Notification.prototype.done = function (callback) {
        this._promise.done(callback);
    };

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

    function _updatePositions(tooltip, onElement, arrowElement, allowedPlacements) {
        console.log(onElement, tooltip, arrowElement);
        let middleWare=  [
            FloatingUIDOM.offset(6),
            FloatingUIDOM.autoPlacement({
                // 'right' and 'left' won't be chosen
                allowedPlacements: allowedPlacements
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
        WorkspaceManager.on(WorkspaceManager.EVENT_WORKSPACE_UPDATE_LAYOUT, tooltip.update);
    }

    function _createDomElementWithArrowElement(domTemplate, elementID, allowedPlacements) {
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
        _updatePositions(floatingDom[0], onElement, arrowElement[0], allowedPlacements);
        return floatingDom[0];
    }

    /**
     * Creates a new notification popup from given template.
     * The template can either be a string or a jQuery object representing a DOM node that is *not* in the current DOM.
     *
     * @param {string|dom element} template A string template or jQuery object to use as the dialog HTML.
     * @param {String} [elementID] optional id string if provided will show the notification pointing to the element
     * @param {Array[String]} [allowedPlacements=['top', 'bottom', 'left', 'right']] array with values restricting
     * where the notification will be shown. ['top', 'bottom', 'left', 'right']
     * @return {Notification}
     */
    function createFromTemplate(template, elementID, allowedPlacements = ['top', 'bottom', 'left', 'right']) {
        // https://floating-ui.com/docs/tutorial
        if(!elementID){
            elementID = 'notificationUIDefaultAnchor';
        }
        const tooltip = _createDomElementWithArrowElement(template, elementID, allowedPlacements);
        $(tooltip).addClass('notification-ui-visible');
        return (new Notification(tooltip));
    }

    exports.createFromTemplate = createFromTemplate;
});
