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
// @INCLUDE_IN_API_DOCS

/**
 * The global NotificationUI can be used to create popup notifications over dom elements or generics app notifications.
 *
 * A global `window.EventManager` object is made available in phoenix that can be called anytime after AppStart.
 * This global can be triggered from anywhere without using require context.
 *
 * ## Usage
 * ### Simple example
 * For Eg. Let's say we have to create a popup notification over the HTML element with ID `showInfileTree`.
 * We can do this with the following
 * ```js
 * const NotificationUI = brackets.getModule("widgets/NotificationUI");
 * // or use window.NotificationUI global object has the same effect.
 * let notification = NotificationUI.createFromTemplate("Click me to locate the file in file tree", "showInfileTree",{});
 * notification.done(()=>{
 *     console.log("notification is closed in ui.");
 * })
 * ```
 * ### Advanced example
 * Another advanced example where you can specify html and interactive components in the notification
 * ```js
 * // note that you can even provide an HTML Element node with
 * // custom event handlers directly here instead of HTML text.
 * let notification1 = NotificationUI.createFromTemplate(
 *   "<div>Click me to </br>locate the file in file tree</div>", "showInfileTree",{
 *       allowedPlacements: ['top', 'bottom'],
 *       dismissOnClick: false,
 *       autoCloseTimeS: 300 // auto close the popup after 5 minutes
 *   });
 * // do stuff
 * notification1.done((closeReason)=>{
 *     console.log("notification is closed in ui reason:", closeReason);
 * })
 * ```
 * The [createFromTemplate]() API can be configured with numerous options. See API options below.
 * @module widgets/NotificationUI
 */

define(function (require, exports, module) {


    const WorkspaceManager  = require("view/WorkspaceManager"),
        Mustache = require("thirdparty/mustache/mustache"),
        ToastPopupHtml  = require("text!widgets/html/toast-popup.html"),
        Dialogs = require("widgets/Dialogs"),
        MainViewManager = require("view/MainViewManager");

    const NOTIFICATION_TYPE_ARROW = "arrow",
        NOTIFICATION_TYPE_TOAST = "toast";

    const CLOSE_REASON ={
        TIMEOUT: 'closeTimeout',
        CLICK_DISMISS: 'clickDismiss',
        CLOSE_BTN_CLICK: 'closeBtnClick'
    };

    /**
     * This section outlines the properties and methods available in this module
     * @name API
     */

    /**
     * This is an instance of the notification returned by the `createFromTemplate` call. The object can be used to
     * control the created notification. See Notification docs below.
     * @type {Object}
     * @name Notification
     */

    /**
     * @constructor
     * @private
     */
    function Notification($notification, type) {
        this.$notification    = $notification;
        this.type = type;
        this._result  = new $.Deferred();
        this._promise = this._result.promise();
    }

    function _closeToastNotification($NotificationPopup, endCB) {
        // Animate out
        function cleanup() {
            $NotificationPopup.removeClass("animateClose");
            $NotificationPopup.remove();
            endCB && endCB();
        }
        $NotificationPopup.removeClass("animateOpen");
        $NotificationPopup
            .addClass("animateClose")
            .one("transitionend", cleanup)
            .one("transitioncancel", cleanup);
    }

    function _closeArrowNotification($NotificationPopup, endCB) {
        function cleanup() {
            // wait for the animation to complete before removal
            $NotificationPopup.remove();
            WorkspaceManager.off(WorkspaceManager.EVENT_WORKSPACE_UPDATE_LAYOUT, $NotificationPopup[0].update);
            endCB && endCB();
        }
        $NotificationPopup.removeClass('notification-ui-visible')
            .addClass('notification-ui-hidden')
            .one("transitionend", cleanup)
            .one("transitioncancel", cleanup);
    }

    /**
     * Closes the Notification if is visible and destroys then dom nodes
     * @param {string} closeType - an optional reason as to why the notification is closed.
     * @type {function}
     * @name Notification.close
     */
    Notification.prototype.close = function (closeType) {
        let self = this,
            $notification = this.$notification;
        if(!$notification){
            return this; // if already closed
        }
        this.$notification = null;
        function doneCB() {
            self._result.resolve(closeType);
        }
        this.type === NOTIFICATION_TYPE_TOAST ?
            _closeToastNotification($notification, doneCB) :
            _closeArrowNotification($notification, doneCB);
        return this;
    };

    /**
     * Adds a done callback to the Notification promise. The promise will be resolved
     * when the Notification is dismissed. Never rejected.
     * @example <caption>Print the close reason on console when the notification closes</caption>
     * notificationInstance.done((closeReason)=>{
     *     console.log(closeReason)
     * })
     * @type {function}
     * @name Notification.done
     */
    Notification.prototype.done = function (callback) {
        this._promise.done(callback);
    };

    /**
     * Creates a new notification popup from given template.
     * The template can either be a string or a jQuery object representing a DOM node that is *not* in the current DOM.
     *
     * @example <caption>Creating a notification popup</caption>
     * // note that you can even provide an HTML Element node with
     * // custom event handlers directly here instead of HTML text.
     * let notification1 = NotificationUI.createFromTemplate(
     *   "<div>Click me to </br>locate the file in file tree</div>", "showInfileTree",{
     *       allowedPlacements: ['top', 'bottom'],
     *       dismissOnClick: false,
     *       autoCloseTimeS: 300 // auto close the popup after 5 minutes
     *   });
     *
     * @param {string|Element} template A string template or HTML Element to use as the dialog HTML.
     * @param {String} [elementID] optional id string if provided will show the notification pointing to the element.
     *   If no element is specified, it will be managed as a generic notification.
     * @param {Object} [options] optional, supported
     *   * options are:
     *   * `allowedPlacements` - Optional String array with values restricting where the notification will be shown.
     *       Values can be a mix of `['top', 'bottom', 'left', 'right']`
     *   * `autoCloseTimeS` - Time in seconds after which the notification should be auto closed. Default is never.
     *   * `dismissOnClick` - when clicked, the notification is closed. Default is true(dismiss).
     * @return {Notification} Object with a done handler that resolves when the notification closes.
     * @type {function}
     */
    function createFromTemplate(template, elementID, options= {}) {
        // https://floating-ui.com/docs/tutorial
        options.allowedPlacements = options.allowedPlacements || ['top', 'bottom', 'left', 'right'];
        options.dismissOnClick = options.dismissOnClick === undefined ? true : options.dismissOnClick;
        if(!elementID){
            elementID = 'notificationUIDefaultAnchor';
        }
        const tooltip = _createDomElementWithArrowElement(template, elementID, options);
        tooltip.addClass('notification-ui-visible');
        let notification = (new Notification(tooltip, NOTIFICATION_TYPE_ARROW));

        if(options.autoCloseTimeS){
            setTimeout(()=>{
                notification.close(CLOSE_REASON.TIMEOUT);
            }, options.autoCloseTimeS * 1000);
        }

        if(options.dismissOnClick){
            tooltip.click(()=>{
                notification.close(CLOSE_REASON.CLICK_DISMISS);
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
        WorkspaceManager.on(WorkspaceManager.EVENT_WORKSPACE_UPDATE_LAYOUT, tooltip.update);
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

    /**
     * Creates a new toast notification popup from given title and html message.
     * The message can either be a string or a jQuery object representing a DOM node that is *not* in the current DOM.
     *
     * @example <caption>Creating a toast notification popup</caption>
     * // note that you can even provide an HTML Element node with
     * // custom event handlers directly here instead of HTML text.
     * let notification1 = NotificationUI.createToastFromTemplate( "Title here",
     *   "<div>Click me to </br>locate the file in file tree</div>", {
     *       dismissOnClick: false,
     *       autoCloseTimeS: 300 // auto close the popup after 5 minutes
     *   });
     *
     * @param {string} title The title for the notification.
     * @param {string|Element} template A string template or HTML Element to use as the dialog HTML.
     * @param {{dismissOnClick, autoCloseTimeS}} [options] optional, supported
     *   * options are:
     *   * `autoCloseTimeS` - Time in seconds after which the notification should be auto closed. Default is never.
     *   * `dismissOnClick` - when clicked, the notification is closed. Default is true(dismiss).
     * @return {Notification} Object with a done handler that resolves when the notification closes.
     * @type {function}
     */
    function createToastFromTemplate(title, template, options = {}) {
        options.dismissOnClick = options.dismissOnClick === undefined ? true : options.dismissOnClick;
        notificationWidgetCount++;
        const widgetID = `notification-toast-${notificationWidgetCount}`,
            $NotificationPopup = $(Mustache.render(ToastPopupHtml,
                {id: widgetID, title: title}));
        $NotificationPopup.find(".notification-dialog-content")
            .append($(template));

        Dialogs.addLinkTooltips($NotificationPopup);
        let notification = (new Notification($NotificationPopup, NOTIFICATION_TYPE_TOAST));

        $NotificationPopup.appendTo("#toast-notification-container").hide()
            .find(".notification-popup-close-button").click(function () {
                notification.close(CLOSE_REASON.CLOSE_BTN_CLICK);
                MainViewManager.focusActivePane();
            });
        $NotificationPopup.show();

        // Animate in
        // Must wait a cycle for the "display: none" to drop out before CSS transitions will work
        setTimeout(function () {
            $NotificationPopup.addClass("animateOpen");
        }, 0);

        if(options.autoCloseTimeS){
            setTimeout(()=>{
                notification.close(CLOSE_REASON.TIMEOUT);
            }, options.autoCloseTimeS * 1000);
        }

        if(options.dismissOnClick){
            $NotificationPopup.click(()=>{
                notification.close(CLOSE_REASON.CLICK_DISMISS);
            });
        }
        return notification;
    }

    exports.createFromTemplate = createFromTemplate;
    exports.createToastFromTemplate = createToastFromTemplate;
    exports.CLOSE_REASON = CLOSE_REASON;
});
