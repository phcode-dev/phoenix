/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*jslint forin: true */
/*global Node, MessageEvent */
/*theseus instrument: false */

/**
 * RemoteFunctions define the functions to be executed in the browser. This
 * modules should define a single function that returns an object of all
 * exported functions.
 */
function RemoteFunctions(config) {

    // this is responsible to make the advanced DOM features active or inactive
    // TODO: give this var a better name
    let isFlagActive = true;

    // this will store the element that was clicked previously (before the new click)
    // we need this so that we can remove click styling from the previous element when a new element is clicked
    let previouslyClickedElement = null;

    var experimental;
    if (!config) {
        experimental = false;
    } else {
        experimental = config.experimental;
    }
    var req, timeout;
    var animateHighlight = function (time) {
        if(req) {
            window.cancelAnimationFrame(req);
            window.clearTimeout(timeout);
        }
        req = window.requestAnimationFrame(redrawHighlights);

        timeout = setTimeout(function () {
            window.cancelAnimationFrame(req);
            req = null;
        }, time * 1000);
    };

    /**
     * @type {DOMEditHandler}
     */
    var _editHandler;

    var HIGHLIGHT_CLASSNAME = "__brackets-ld-highlight";

    // determine whether an event should be processed for Live Development
    function _validEvent(event) {
        if (window.navigator.platform.substr(0, 3) === "Mac") {
            // Mac
            return event.metaKey;
        } else {
            // Windows
            return event.ctrlKey;
        }
    }

    // determine the color for a type
    function _typeColor(type, highlight) {
        switch (type) {
        case "html":
            return highlight ? "#eec" : "#ffe";
        case "css":
            return highlight ? "#cee" : "#eff";
        case "js":
            return highlight ? "#ccf" : "#eef";
        default:
            return highlight ? "#ddd" : "#eee";
        }
    }

    // compute the screen offset of an element
    function _screenOffset(element) {
        var elemBounds = element.getBoundingClientRect(),
            body = window.document.body,
            offsetTop,
            offsetLeft;

        if (window.getComputedStyle(body).position === "static") {
            offsetLeft = elemBounds.left + window.pageXOffset;
            offsetTop = elemBounds.top + window.pageYOffset;
        } else {
            var bodyBounds = body.getBoundingClientRect();
            offsetLeft = elemBounds.left - bodyBounds.left;
            offsetTop = elemBounds.top - bodyBounds.top;
        }
        return { left: offsetLeft, top: offsetTop };
    }

    // set an event on a element
    function _trigger(element, name, value, autoRemove) {
        var key = "data-ld-" + name;
        if (value !== undefined && value !== null) {
            element.setAttribute(key, value);
            if (autoRemove) {
                window.setTimeout(element.removeAttribute.bind(element, key));
            }
        } else {
            element.removeAttribute(key);
        }
    }

    // Checks if the element is in Viewport in the client browser
    function isInViewport(element) {
        var rect = element.getBoundingClientRect();
        var html = window.document.documentElement;
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || html.clientHeight) &&
            rect.right <= (window.innerWidth || html.clientWidth)
        );
    }

    // returns the distance from the top of the closest relatively positioned parent element
    function getDocumentOffsetTop(element) {
        return element.offsetTop + (element.offsetParent ? getDocumentOffsetTop(element.offsetParent) : 0);
    }

    // construct the info menu
    function Menu(element) {
        this.element = element;
        _trigger(this.element, "showgoto", 1, true);
        window.setTimeout(window.remoteShowGoto);
        this.remove = this.remove.bind(this);
    }

    Menu.prototype = {
        onClick: function (url, event) {
            event.preventDefault();
            _trigger(this.element, "goto", url, true);
            this.remove();
        },

        createBody: function () {
            if (this.body) {
                return;
            }

            // compute the position on screen
            var offset = _screenOffset(this.element),
                x = offset.left,
                y = offset.top + this.element.offsetHeight;

            // create the container
            this.body = window.document.createElement("div");
            this.body.style.setProperty("z-index", 2147483647);
            this.body.style.setProperty("position", "absolute");
            this.body.style.setProperty("left", x + "px");
            this.body.style.setProperty("top", y + "px");
            this.body.style.setProperty("font-size", "11pt");

            // draw the background
            this.body.style.setProperty("background", "#fff");
            this.body.style.setProperty("border", "1px solid #888");
            this.body.style.setProperty("-webkit-box-shadow", "2px 2px 6px 0px #ccc");
            this.body.style.setProperty("border-radius", "6px");
            this.body.style.setProperty("padding", "6px");
        },

        addItem: function (target) {
            var item = window.document.createElement("div");
            item.style.setProperty("padding", "2px 6px");
            if (this.body.childNodes.length > 0) {
                item.style.setProperty("border-top", "1px solid #ccc");
            }
            item.style.setProperty("cursor", "pointer");
            item.style.setProperty("background", _typeColor(target.type));
            item.innerHTML = target.name;
            item.addEventListener("click", this.onClick.bind(this, target.url));

            if (target.file) {
                var file = window.document.createElement("i");
                file.style.setProperty("float", "right");
                file.style.setProperty("margin-left", "12px");
                file.innerHTML = " " + target.file;
                item.appendChild(file);
            }
            this.body.appendChild(item);
        },

        show: function () {
            if (!this.body) {
                this.createBody();
            }
            if (!this.body.parentNode) {
                window.document.body.appendChild(this.body);
            }
            window.document.addEventListener("click", this.remove);
        },

        remove: function () {
            if (this.body && this.body.parentNode) {
                window.document.body.removeChild(this.body);
            }
            window.document.removeEventListener("click", this.remove);
        }

    };

    /**
     * This function gets called when the delete button is clicked
     * it sends a message to the editor using postMessage to delete the element from the source code
     * @param {Event} event
     * @param {DOMElement} element - the HTML DOM element that was clicked. it is to get the data-brackets-id attribute
     */
    function _handleDeleteOptionClick(event, element) {
        const tagId = element.getAttribute("data-brackets-id");

        if (tagId && element.tagName !== "BODY" && element.tagName !== "HTML") {
            window._Brackets_MessageBroker.send({
                livePreviewEditEnabled: true,
                element: element,
                event: event,
                tagId: Number(tagId),
                delete: true
            });
        } else {
            console.error("The TagID might be unavailable or the element tag is directly body or html");
        }
    }

    /**
     * this is for duplicate button. Read '_handleDeleteOptionClick' jsdoc to understand more on how this works
     * @param {Event} event
     * @param {DOMElement} element - the HTML DOM element that was clicked. it is to get the data-brackets-id attribute
     */
    function _handleDuplicateOptionClick(event, element) {
        const tagId = element.getAttribute("data-brackets-id");

        if (tagId && element.tagName !== "BODY" && element.tagName !== "HTML") {
            window._Brackets_MessageBroker.send({
                livePreviewEditEnabled: true,
                element: element,
                event: event,
                tagId: Number(tagId),
                duplicate: true
            });
        } else {
            console.error("The TagID might be unavailable or the element tag is directly body or html");
        }
    }

    /**
     * this is for select-parent button
     * When user clicks on this option for a particular element, we get its parent element and trigger a click on it
     * @param {Event} event
     * @param {DOMElement} element - the HTML DOM element that was clicked. it is to get the data-brackets-id attribute
     */
    function _handleSelectParentOptionClick(event, element) {
        if (!element) {
            return;
        }

        const parentElement = element.parentElement;
        if (!parentElement) {
            return;
        }

        // we need to make sure that the parent element is not the body tag or the html.
        // also we expect it to have the 'data-brackets-id'
        if (
            parentElement.tagName !== "BODY" &&
            parentElement.tagName !== "HTML" &&
            parentElement.hasAttribute("data-brackets-id")
        ) {
            parentElement.click();
        } else {
            console.error("The TagID might be unavailable or the parent element tag is directly body or html");
        }
    }

    /**
     * This function will get triggered when from the multiple advance DOM buttons, one is clicked
     * this function just checks which exact button was clicked and call the required function
     * @param {Event} e
     * @param {String} action - the data-action attribute to differentiate between buttons
     * @param {DOMElement} element - the selected DOM element
     */
    function handleOptionClick(e, action, element) {
        if (action === "select-parent") {
            _handleSelectParentOptionClick(e, element);
        } else if (action === "edit-text") {
            startEditing(element);
        } else if (action === "duplicate") {
            _handleDuplicateOptionClick(e, element);
        } else if (action === "delete") {
            _handleDeleteOptionClick(e, element);
        }
    }

    function _dragStartChores(element) {
        element._originalDragOpacity = element.style.opacity;
        element.style.opacity = 0.3;
    }


    function _dragEndChores(element) {
        if (element._originalDragOpacity) {
            element.style.opacity = element._originalDragOpacity;
        } else {
            element.style.opacity = 1;
        }
        delete element._originalDragOpacity;
    }

    // CSS class name for drop markers
    let DROP_MARKER_CLASSNAME = "__brackets-drop-marker";

    /**
     * This function creates a marker to indicate a valid drop position
     * @param {DOMElement} element - The element where the drop is possible
     * @param {Boolean} showAtBottom - Whether to show the marker at the bottom of the element
     */
    function _createDropMarker(element, showAtBottom) {
        // clean any existing marker from that element
        _removeDropMarkerFromElement(element);

        // create the marker element
        let marker = window.document.createElement("div");
        marker.className = DROP_MARKER_CLASSNAME;

        // position the marker at the top or bottom of the element
        let rect = element.getBoundingClientRect();
        let scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        let scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

        // marker styling
        marker.style.position = "absolute";
        marker.style.left = (rect.left + scrollLeft) + "px";
        marker.style.width = rect.width + "px";
        marker.style.height = "2px";
        marker.style.backgroundColor = "#4285F4";
        marker.style.zIndex = "2147483646";

        // position the marker at the top or at the bottom of the element
        if (showAtBottom) {
            marker.style.top = (rect.bottom + scrollTop + 3) + "px";
        } else {
            marker.style.top = (rect.top + scrollTop - 5) + "px";
        }

        element._dropMarker = marker; // we need this in the _removeDropMarkerFromElement function
        window.document.body.appendChild(marker);
    }

    /**
     * This function removes a drop marker from a specific element
     * @param {DOMElement} element - The element to remove the marker from
     */
    function _removeDropMarkerFromElement(element) {
        if (element._dropMarker && element._dropMarker.parentNode) {
            element._dropMarker.parentNode.removeChild(element._dropMarker);
            delete element._dropMarker;
        }
    }

    /**
     * this function is to clear all the drop markers from the document
     */
    function _clearDropMarkers() {
        let markers = window.document.querySelectorAll("." + DROP_MARKER_CLASSNAME);
        for (let i = 0; i < markers.length; i++) {
            if (markers[i].parentNode) {
                markers[i].parentNode.removeChild(markers[i]);
            }
        }

        // Also clear any element references
        let elements = window.document.querySelectorAll("[data-brackets-id]");
        for (let j = 0; j < elements.length; j++) {
            delete elements[j]._dropMarker;
        }
    }

    /**
     * Handle dragover events on the document
     * Shows drop markers on valid drop targets
     * @param {Event} event - The dragover event
     */
    function onDragOver(event) {
        // we set this on dragStart
        if (!window._currentDraggedElement) {
            return;
        }

        event.preventDefault();

        // get the element under the cursor
        let target = document.elementFromPoint(event.clientX, event.clientY);
        if (!target || target === window._currentDraggedElement) {
            return;
        }

        // get the closest element with a data-brackets-id
        while (target && !target.hasAttribute("data-brackets-id")) {
            target = target.parentElement;
        }

        // skip if no valid target found or if it's the dragged element
        if (!target || target === window._currentDraggedElement) {
            return;
        }

        // Skip BODY and HTML tags
        if (target.tagName === "BODY" || target.tagName === "HTML") {
            return;
        }

        // check if the cursor is in the top half or bottom half of the target element
        const rect = target.getBoundingClientRect();
        const middleY = rect.top + (rect.height / 2);
        const showAtBottom = event.clientY > middleY;

        // before creating a drop marker, make sure that we clear all the drop markers
        _clearDropMarkers();
        _createDropMarker(target, showAtBottom);
    }

    /**
     * Handle drop events on the document
     * Processes the drop of a dragged element onto a valid target
     * @param {Event} event - The drop event
     */
    function onDrop(event) {
        if (!window._currentDraggedElement) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        // get the element under the cursor
        let target = document.elementFromPoint(event.clientX, event.clientY);

        // get the closest element with a data-brackets-id
        while (target && !target.hasAttribute("data-brackets-id")) {
            target = target.parentElement;
        }

        // skip if no valid target found or if it's the dragged element
        if (!target || target === window._currentDraggedElement) {
            return;
        }

        // Skip BODY and HTML tags
        if (target.tagName === "BODY" || target.tagName === "HTML") {
            return;
        }

        // check if the cursor is in the top half or bottom half of the target element
        const rect = target.getBoundingClientRect();
        const middleY = rect.top + (rect.height / 2);
        const insertAfter = event.clientY > middleY;

        // IDs of the source and target elements
        const sourceId = window._currentDraggedElement.getAttribute("data-brackets-id");
        const targetId = target.getAttribute("data-brackets-id");

        // send message to the editor
        window._Brackets_MessageBroker.send({
            livePreviewEditEnabled: true,
            sourceElement: window._currentDraggedElement,
            targetElement: target,
            sourceId: Number(sourceId),
            targetId: Number(targetId),
            insertAfter: insertAfter,
            move: true
        });

        _clearDropMarkers();
        _dragEndChores(window._currentDraggedElement);
        dismissMoreOptionsBox();
        delete window._currentDraggedElement;
    }

    /**
     * This function is to calculate the width of the info box based on the number of chars in the box
     * @param {String} tagName - the element's tag name
     * @param {String} id - the element's id
     * @param {Array} classes - the array of class names
     * @returns {Number} - the total char count
     */
    function _calculateInfoBoxCharCount(tagName, id, classes) {
        // char count for tag name
        let tagNameCharCount = tagName.length;
        let idNameCharCount = 0;
        let classNameCharCount = 0;
        // char count for id
        if (id) {
            idNameCharCount = id.length + 1; // +1 for #
        }

        // char count for classes
        if (classes.length > 0) {
            for (let i = 0; i < Math.min(classes.length, 3); i++) {
                classNameCharCount += classes[i].length + 1; // +1 for .
            }

            if (classes.length > 3) {
                // "+ X more" for more than 3 classes
                const moreText = `+${classes.length - 3} more`;
                classNameCharCount += moreText.length;
            }
        }
        return Math.max(tagNameCharCount, idNameCharCount, classNameCharCount);
    }

    /**
     * This function checks whether there is overlap between the info and the more options box
     * @param {Number} elemWidth - the width of the DOM element
     * @param {String} tagName - the element's tag name
     * @param {String} id - the element's id
     * @param {Array} classes - the array of class names
     * @returns {Number} - the total char count
     */
    function checkOverlap(elemWidth, tagName, id, classes) {
        let avgCharWidth = 6;
        const basePadding = 16;

        // char count for tag name, id, and classes
        let charCount = _calculateInfoBoxCharCount(tagName, id, classes);
        if(charCount <= 10) {
            avgCharWidth = 7.5;
        }

        // calc estimate width based on the char count
        const infoBoxWidth = basePadding + (charCount * avgCharWidth);

        // more options box is 106px
        const moreOptionsBoxWidth = 106;

        // check if there's enough space for both boxes
        // 20px buffer for spacing between boxes
        if (elemWidth > (infoBoxWidth + moreOptionsBoxWidth + 20)) {
            return false; // No overlap
        }

        return true;
    }

    /**
     * this function is to check if an element should show the edit text option
     * it is needed because edit text option doesn't make sense with many elements like images, videos, hr tag etc
     * @param {Element} element - DOM element to check
     * @returns {boolean} - true if we should show the edit text option otherwise false
     */
    function _shouldShowEditTextOption(element) {
        if (!element || !element.tagName) {
            return false;
        }

        const tagName = element.tagName.toLowerCase();

        // these are self-closing tags and don't allow any text content
        const voidElements = [
            "img",
            "br",
            "hr",
            "input",
            "meta",
            "link",
            "area",
            "base",
            "col",
            "embed",
            "source",
            "track",
            "wbr"
        ];

        // these elements are non-editable as they have their own mechanisms
        const nonEditableElements = [
            "script",
            "style",
            "noscript",
            "canvas",
            "svg",
            "video",
            "audio",
            "iframe",
            "object",
            "button",
            "select",
            "textarea"
        ];

        if (voidElements.includes(tagName) || nonEditableElements.includes(tagName)) {
            return false;
        }

        return true;
    }

    /**
     * this function is to check if an element should show the 'select-parent' option
     * because we don't want to show the select parent option when the parent is directly the body/html tag
     * or the parent doesn't have the 'data-brackets-id'
     * @param {Element} element - DOM element to check
     * @returns {boolean} - true if we should show the select parent option otherwise false
     */
    function _shouldShowSelectParentOption(element) {
        if (!element || !element.parentElement) {
            return false;
        }

        const parentElement = element.parentElement;

        if (parentElement.tagName === "HTML" || parentElement.tagName === "BODY") {
            return false;
        }
        if (!parentElement.hasAttribute("data-brackets-id")) {
            return false;
        }

        return true;
    }

    /**
     * This is for the advanced DOM options that appears when a DOM element is clicked
     * advanced options like: 'select parent', 'duplicate', 'delete'
     */
    function NodeMoreOptionsBox(element) {
        this.element = element;
        this.remove = this.remove.bind(this);
        this.create();
    }

    NodeMoreOptionsBox.prototype = {
        _registerDragDrop: function() {
            this.element.setAttribute("draggable", true);

            this.element.addEventListener("dragstart", (event) => {
                event.stopPropagation();
                event.dataTransfer.setData("text/plain", this.element.getAttribute("data-brackets-id"));
                _dragStartChores(this.element);
                _clearDropMarkers();
                window._currentDraggedElement = this.element;
            });

            this.element.addEventListener("dragend", (event) => {
                event.preventDefault();
                event.stopPropagation();
                _dragEndChores(this.element);
                _clearDropMarkers();
                delete window._currentDraggedElement;
            });
        },

        _style: function() {
            this.body = window.document.createElement("div");

            // this is shadow DOM.
            // we need it because if we add the box directly to the DOM then users style might override it.
            // {mode: "closed"} means that users will not be able to access the shadow DOM
            const shadow = this.body.attachShadow({ mode: "closed" });

            // the element that was clicked
            let elemBounds = this.element.getBoundingClientRect();

            // check which options should be shown to determine box width
            const showEditTextOption = _shouldShowEditTextOption(this.element);
            const showSelectParentOption = _shouldShowSelectParentOption(this.element);

            // calculate box width based on visible options
            // NOTE: duplicate and delete buttons are always shown
            let optionCount = 2;
            if (showSelectParentOption) {
                optionCount++;
            }
            if (showEditTextOption) {
                optionCount++;
            }

            // box width we need to decide based on the no. of options
            let boxWidth;
            if (optionCount === 2) {
                boxWidth = 52;
            } else if (optionCount === 3) {
                boxWidth = 82;
            } else {
                boxWidth = 106;
            }
            const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

            // get the ID and classes for the element
            // we need this to check for overlap issue between the info box and this box
            // because when we have classes and ids then the info box tends to stretch in width
            const id = this.element.id;
            const classes = this.element.className ? this.element.className.split(/\s+/).filter(Boolean) : [];
            const tagName = this.element.tagName.toLowerCase();

            const isOverlap = checkOverlap(elemBounds.width, tagName, id, classes);

            const viewportWidth = window.innerWidth;
            const idealLeftPos = elemBounds.right - boxWidth + scrollLeft;
            const maxLeftPos = viewportWidth - boxWidth - 10 + scrollLeft;
            // 10px is just the padding, because we want some space
            const minLeftPos = 10 + scrollLeft;

            // we'll use the position that keeps the box within viewport bounds
            let leftPos = Math.min(idealLeftPos, maxLeftPos);
            leftPos = Math.max(leftPos, minLeftPos);
            let topPos;

            if (isOverlap) {
                if (elemBounds.top > 40) { // check if there's enough space at the top
                    // place at the top
                    topPos = elemBounds.top - 30 + scrollTop;
                } else {
                    // at the bottom
                    topPos = elemBounds.top + elemBounds.height + 5 + scrollTop;
                }
            } else {
                // no overlap, so it comes just above the element
                topPos = (elemBounds.top - 30 < 0
                    ? elemBounds.top + elemBounds.height + 5
                    : elemBounds.top - 30) + scrollTop;
            }

            // the icons that is displayed in the box
            const ICONS = {
                arrowUp: `
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.59 5.58L20 12l-8-8-8 8z"/>
                </svg>
              `,

                edit: `
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                </svg>
              `,

                copy: `
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0
                  1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                </svg>
              `,

                trash: `
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2h3v2h-2l-1.5 12.5a2 2 0 0
                  1-2 1.5H8.5a2 2 0 0 1-2-1.5L5 9H3V7h3zm2 0h8V5H8v2z"/>
                </svg>
              `
            };

            let content = `<div class="node-options">`;

            // Only include select parent option if element supports it
            if (showSelectParentOption) {
                content += `<span data-action="select-parent" title="Select Parent">
                    ${ICONS.arrowUp}
                </span>`;
            }

            // Only include edit text option if element supports it
            if (showEditTextOption) {
                content += `<span data-action="edit-text" title="Edit Text">
                    ${ICONS.edit}
                </span>`;
            }

            // Always include duplicate and delete options
            content += `<span data-action="duplicate" title="Duplicate">
                    ${ICONS.copy}
                </span>
                <span data-action="delete" title="Delete">
                    ${ICONS.trash}
                </span>
            </div>`;

            const styles = `
                .box {
                    background-color: #4285F4;
                    color: white;
                    border-radius: 3px;
                    padding: 5px 8px;
                    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
                    font-size: 12px;
                    font-family: Arial, sans-serif;
                    z-index: 2147483647;
                    position: absolute;
                    left: ${leftPos}px;
                    top: ${topPos}px;
                    width: ${boxWidth}px;
                    box-sizing: border-box;
                }

                .node-options {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                }

                .node-options span {
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                }

                .node-options span > svg {
                    width: 16px;
                    height: 16px;
                    display: block;
                }
            `;

            // add everything to the shadow box
            shadow.innerHTML = `<style>${styles}</style><div class="box">${content}</div>`;
            this._shadow = shadow;
        },

        create: function() {
            this.remove(); // remove existing box if already present
            this._style(); // style the box

            window.document.body.appendChild(this.body);

            // add click handler to all the buttons
            const spans = this._shadow.querySelectorAll('.node-options span');
            spans.forEach(span => {
                span.addEventListener('click', (event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    // data-action is to differentiate between the buttons (duplicate, delete or select-parent)
                    const action = event.currentTarget.getAttribute('data-action');
                    handleOptionClick(event, action, this.element);
                    this.remove();
                });
            });

            this._registerDragDrop();
        },

        remove: function() {
            if (this.body && this.body.parentNode && this.body.parentNode === window.document.body) {
                window.document.body.removeChild(this.body);
                this.body = null;
                _nodeMoreOptionsBox = null;
            }
        }
    };

    // Node info box to display DOM node ID and classes on hover
    function NodeInfoBox(element, isFromClick) {
        this.element = element;
        this.isFromClick = isFromClick || false;
        this.remove = this.remove.bind(this);
        this.create();
    }

    NodeInfoBox.prototype = {
        _style: function() {
            this.body = window.document.createElement("div");

            // this is shadow DOM.
            // we need it because if we add the box directly to the DOM then users style might override it.
            // {mode: "closed"} means that users will not be able to access the shadow DOM
            const shadow = this.body.attachShadow({ mode: "closed" });

            // the element that was clicked
            let elemBounds = this.element.getBoundingClientRect();

            // the positions where it should be placed
            const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

            // this value decides where we need to show the box in the UI
            // we are creating this here, because if the element has IDs and Classes then we need to increase the value
            // so that the box doesn't obscure the element
            let pushBoxUp = 32; // px value

            // get the ID and classes for that element, as we need to display it in the box
            const id = this.element.id;
            const classes = this.element.className ? this.element.className.split(/\s+/).filter(Boolean) : [];

            let content = ""; // this will hold the main content that will be displayed
            content += "<div class='tag-name'>" + this.element.tagName.toLowerCase() + "</div>"; // add element tag name

            // Add ID if present
            if (id) {
                content += "<div class='id-name'>#" + id + "</div>";
                pushBoxUp += 20;
            }

            // Add classes (limit to 3 with dropdown indicator)
            if (classes.length > 0) {
                content += "<div class='class-name'>";
                for (var i = 0; i < Math.min(classes.length, 3); i++) {
                    content += "." + classes[i] + " ";
                }
                if (classes.length > 3) {
                    content += "<span class='exceeded-classes'>+" + (classes.length - 3) + " more</span>";
                }
                content += "</div>";
                pushBoxUp += 20;
            }

            let leftPos = elemBounds.left + scrollLeft;
            let topPos = (elemBounds.top - pushBoxUp < 0
                ? elemBounds.top + elemBounds.height + 5
                : elemBounds.top - pushBoxUp) + scrollTop;

            let avgCharWidth = 6;
            const basePadding = 16;

            // Get the tag name
            const tagName = this.element.tagName.toLowerCase();

            // Count characters in tag name, id, and classes
            let charCount = _calculateInfoBoxCharCount(tagName, id, classes);
            if(charCount <= 10) {
                avgCharWidth = 7.5;
            }

            // Calculate estimated width based on character count
            // Formula: base padding + (character count * average character width)
            const boxWidth = basePadding + (charCount * avgCharWidth);

            // we need to check for overlap if this is from a click
            if (this.isFromClick) {
                const isOverlap = checkOverlap(elemBounds.width, tagName, id, classes);

                if (isOverlap) {
                    const windowWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;

                    // Estimate the height of the info box based on its content
                    // base height for tag name + padding
                    let estimatedHeight = 32;

                    // height adjustment if ID is present
                    if (id) {
                        estimatedHeight += 20;
                    }

                    // height adjustment if classes are present
                    if (classes.length > 0) {
                        estimatedHeight += 20;
                    }

                    // check if element is near bottom of viewport
                    const elementBottomFromViewportTop = elemBounds.bottom;
                    const availableSpaceBelow = viewportHeight - elementBottomFromViewportTop;

                    // align with the bottom of the info box (original behavior)
                    topPos = (elemBounds.top + elemBounds.height - estimatedHeight) + scrollTop;

                    // If element is near bottom and there's not enough space below,
                    // push the info box up a bit to prevent scrollbar
                    if (availableSpaceBelow < estimatedHeight + 10) {
                        // Push it up by the amount it would overflow
                        const pushUpAmount = estimatedHeight - availableSpaceBelow;
                        topPos -= pushUpAmount;
                    }

                    // decide whether position at left or right based on available space
                    // check if there's enough space on the left side
                    if (elemBounds.left > boxWidth + 10) {
                        leftPos = elemBounds.left - boxWidth - 10 + scrollLeft;
                    } else if (windowWidth - elemBounds.right > boxWidth + 10) {
                        // position on the right
                        leftPos = elemBounds.right + 10 + scrollLeft;
                    }
                }
            }

            // to make sure that the info box stays under the viewport width
            const viewportWidth = window.innerWidth;
            const margin = 10;

            // horizontal boundary checking
            if (leftPos + boxWidth + margin > viewportWidth + scrollLeft) {
                leftPos = viewportWidth + scrollLeft - boxWidth - margin;
            }
            if (leftPos < scrollLeft + margin) {
                leftPos = scrollLeft + margin;
            }

            const styles = `
                .box {
                    background-color: #4285F4;
                    color: white;
                    border-radius: 3px;
                    padding: 5px 8px;
                    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
                    font-size: 12px;
                    font-family: Arial, sans-serif;
                    z-index: 2147483647;
                    position: absolute;
                    left: ${leftPos}px;
                    top: ${topPos}px;
                    max-width: fit-content;
                    box-sizing: border-box;
                    pointer-events: none;
                }

                .tag-name {
                    font-weight: bold;
                }

                .id-name,
                .class-name {
                    margin-top: 3px;
                }

                .exceeded-classes {
                    opacity: 0.8;
                }
            `;

            // add everything to the shadow box
            shadow.innerHTML = `<style>${styles}</style><div class="box">${content}</div>`;
            this._shadow = shadow;
        },

        create: function() {
            this.remove(); // remove existing box if already present
            this._style(); // style the box

            window.document.body.appendChild(this.body);
        },

        remove: function() {
            if (this.body && this.body.parentNode && this.body.parentNode === window.document.body) {
                window.document.body.removeChild(this.body);
                this.body = null;
            }
        }
    };

    function Highlight(color, trigger) {
        this.color = color;
        this.trigger = !!trigger;
        this.elements = [];
        this.selector = "";
    }

    Highlight.prototype = {
        _elementExists: function (element) {
            var i;
            for (i in this.elements) {
                if (this.elements[i] === element) {
                    return true;
                }
            }
            return false;
        },
        _makeHighlightDiv: function (element, doAnimation) {
            var elementBounds = element.getBoundingClientRect(),
                highlight = window.document.createElement("div"),
                elementStyling = window.getComputedStyle(element),
                transitionDuration = parseFloat(elementStyling.getPropertyValue('transition-duration')),
                animationDuration = parseFloat(elementStyling.getPropertyValue('animation-duration'));

            highlight.trackingElement = element; // save which node are we highlighting

            if (transitionDuration) {
                animateHighlight(transitionDuration);
            }

            if (animationDuration) {
                animateHighlight(animationDuration);
            }

            // Don't highlight elements with 0 width & height
            if (elementBounds.width === 0 && elementBounds.height === 0) {
                return;
            }

            var realElBorder = {
              right: elementStyling.getPropertyValue('border-right-width'),
              left: elementStyling.getPropertyValue('border-left-width'),
              top: elementStyling.getPropertyValue('border-top-width'),
              bottom: elementStyling.getPropertyValue('border-bottom-width')
            };

            var borderBox = elementStyling.boxSizing === 'border-box';

            var innerWidth = parseFloat(elementStyling.width),
                innerHeight = parseFloat(elementStyling.height),
                outerHeight = innerHeight,
                outerWidth = innerWidth;

            if (!borderBox) {
                innerWidth += parseFloat(elementStyling.paddingLeft) + parseFloat(elementStyling.paddingRight);
                innerHeight += parseFloat(elementStyling.paddingTop) + parseFloat(elementStyling.paddingBottom);
                outerWidth = innerWidth + parseFloat(realElBorder.right) +
                parseFloat(realElBorder.left),
                outerHeight = innerHeight + parseFloat(realElBorder.bottom) + parseFloat(realElBorder.top);
            }


            var visualisations = {
                horizontal: "left, right",
                vertical: "top, bottom"
            };

            var drawPaddingRect = function(side) {
              var elStyling = {};

              if (visualisations.horizontal.indexOf(side) >= 0) {
                elStyling['width'] =  elementStyling.getPropertyValue('padding-' + side);
                elStyling['height'] = innerHeight + "px";
                elStyling['top'] = 0;

                  if (borderBox) {
                    elStyling['height'] = innerHeight - parseFloat(realElBorder.top) - parseFloat(realElBorder.bottom) + "px";
                  }

              } else {
                elStyling['height'] = elementStyling.getPropertyValue('padding-' + side);
                elStyling['width'] = innerWidth + "px";
                elStyling['left'] = 0;

                  if (borderBox) {
                    elStyling['width'] = innerWidth - parseFloat(realElBorder.left) - parseFloat(realElBorder.right) + "px";
                  }
              }

              elStyling[side] = 0;
              elStyling['position'] = 'absolute';

              return elStyling;
            };

          var drawMarginRect = function(side) {
            var elStyling = {};

            var margin = [];
            margin['right'] = parseFloat(elementStyling.getPropertyValue('margin-right'));
            margin['top'] = parseFloat(elementStyling.getPropertyValue('margin-top'));
            margin['bottom'] = parseFloat(elementStyling.getPropertyValue('margin-bottom'));
            margin['left'] = parseFloat(elementStyling.getPropertyValue('margin-left'));

            if(visualisations['horizontal'].indexOf(side) >= 0) {

              elStyling['width'] = elementStyling.getPropertyValue('margin-' + side);
              elStyling['height'] = outerHeight + margin['top'] + margin['bottom'] + "px";
              elStyling['top'] = "-" + (margin['top'] + parseFloat(realElBorder.top))  + "px";
            } else {
              elStyling['height'] = elementStyling.getPropertyValue('margin-' + side);
              elStyling['width'] = outerWidth + "px";
              elStyling['left'] = "-" + realElBorder.left;
            }

            elStyling[side] = "-" + (margin[side] + parseFloat(realElBorder[side])) + "px";
            elStyling['position'] = 'absolute';

            return elStyling;
          };

            var setVisibility = function (el) {
                if (
                    !config.remoteHighlight.showPaddingMargin ||
                    parseInt(el.height, 10) <= 0 ||
                    parseInt(el.width, 10) <= 0
                ) {
                    el.display = 'none';
                } else {
                    el.display = 'block';
                }
            };

            var mainBoxStyles = config.remoteHighlight.stylesToSet;

            var paddingVisualisations = [
              drawPaddingRect('top'),
              drawPaddingRect('right'),
              drawPaddingRect('bottom'),
              drawPaddingRect('left')
            ];

            var marginVisualisations = [
              drawMarginRect('top'),
              drawMarginRect('right'),
              drawMarginRect('bottom'),
              drawMarginRect('left')
            ];

            var setupVisualisations = function (arr, config) {
                var i;
                for (i = 0; i < arr.length; i++) {
                    setVisibility(arr[i]);

                    // Applies to every visualisationElement (padding or margin div)
                    arr[i]["transform"] = "none";
                    var el = window.document.createElement("div"),
                        styles = Object.assign(
                        {},
                        config,
                        arr[i]
                    );

                    _setStyleValues(styles, el.style);

                    highlight.appendChild(el);
                }
            };

            setupVisualisations(
                marginVisualisations,
                config.remoteHighlight.marginStyling
            );
            setupVisualisations(
                paddingVisualisations,
                config.remoteHighlight.paddingStyling
            );

            highlight.className = HIGHLIGHT_CLASSNAME;

            var offset = _screenOffset(element);

            // some code to find element left/top was removed here. This seems to be relevant to box model
            // live highlights. firether reading: https://github.com/adobe/brackets/pull/13357/files
            // we removed this in phoenix because it was throwing the rendering of live highlight boxes in phonix
            // default project at improper places. Some other cases might fail as the above code said they
            // introduces that removed computation for fixing some box-model regression. If you are here to fix a
            // related bug, check history of this changes in git.

            var stylesToSet = {
                "left": offset.left + "px",
                "top": offset.top + "px",
                "width": elementBounds.width + "px",
                "height": elementBounds.height + "px",
                "z-index": 2000000,
                "margin": 0,
                "padding": 0,
                "position": "absolute",
                "pointer-events": "none",
                "box-shadow": "0 0 1px #fff",
                "box-sizing": elementStyling.getPropertyValue('box-sizing'),
                "border-right": elementStyling.getPropertyValue('border-right'),
                "border-left": elementStyling.getPropertyValue('border-left'),
                "border-top": elementStyling.getPropertyValue('border-top'),
                "border-bottom": elementStyling.getPropertyValue('border-bottom'),
                "border-color": config.remoteHighlight.borderColor
            };

            var mergedStyles = Object.assign({}, stylesToSet,  config.remoteHighlight.stylesToSet);

            var animateStartValues = config.remoteHighlight.animateStartValue;

            var animateEndValues = config.remoteHighlight.animateEndValue;

            var transitionValues = {
                "transition-property": "opacity, background-color, transform",
                "transition-duration": "300ms, 2.3s"
            };

            function _setStyleValues(styleValues, obj) {
                var prop;

                for (prop in styleValues) {
                    obj.setProperty(prop, styleValues[prop]);
                }
            }

            _setStyleValues(mergedStyles, highlight.style);
            _setStyleValues(
                doAnimation ? animateStartValues : animateEndValues,
                highlight.style
            );


            if (doAnimation) {
                _setStyleValues(transitionValues, highlight.style);

                window.setTimeout(function () {
                    _setStyleValues(animateEndValues, highlight.style);
                }, 20);
            }

            window.document.body.appendChild(highlight);
        },

        add: function (element, doAnimation) {
            if (this._elementExists(element) || element === window.document) {
                return;
            }
            if (this.trigger) {
                _trigger(element, "highlight", 1);
            }

            if ((!window.event || window.event instanceof MessageEvent) && !isInViewport(element)) {
                var top = getDocumentOffsetTop(element);
                if (top) {
                    top -= (window.innerHeight / 2);
                    window.scrollTo(0, top);
                }
            }
            this.elements.push(element);

            this._makeHighlightDiv(element, doAnimation);
        },

        clear: function () {
            var i, highlights = window.document.querySelectorAll("." + HIGHLIGHT_CLASSNAME),
                body = window.document.body;

            for (i = 0; i < highlights.length; i++) {
                body.removeChild(highlights[i]);
            }

            if (this.trigger) {
                for (i = 0; i < this.elements.length; i++) {
                    _trigger(this.elements[i], "highlight", 0);
                }
            }

            this.elements = [];
        },

        redraw: function () {
            var i, highlighted;

            // When redrawing a selector-based highlight, run a new selector
            // query to ensure we have the latest set of elements to highlight.
            if (this.selector) {
                highlighted = window.document.querySelectorAll(this.selector);
            } else {
                highlighted = this.elements.slice(0);
            }

            this.clear();
            for (i = 0; i < highlighted.length; i++) {
                this.add(highlighted[i], false);
            }
        }
    };

    var _currentMenu;
    var _localHighlight;
    var _remoteHighlight;
    var _hoverHighlight;
    var _clickHighlight;
    var _nodeInfoBox;
    var _nodeMoreOptionsBox;
    var _setup = false;


    /** Event Handlers ***********************************************************/

    function onMouseOver(event) {
        if (_validEvent(event)) {
            // Skip highlighting for HTML and BODY tags
            if (event.target && event.target.nodeType === Node.ELEMENT_NODE &&
                event.target.tagName !== "HTML" && event.target.tagName !== "BODY") {
                _localHighlight.add(event.target, true);
            }
        }
    }

    function onMouseOut(event) {
        if (_validEvent(event)) {
            _localHighlight.clear();
        }
    }

    function onMouseMove(event) {
        onMouseOver(event);
        window.document.removeEventListener("mousemove", onMouseMove);
    }

    function onElementHover(event) {
        if (_hoverHighlight) {
            _hoverHighlight.clear();

            // Skip highlighting for HTML and BODY tags and for DOM elements which doesn't have 'data-brackets-id'
            // NOTE: Don't remove 'data-brackets-id' check else hover will also target internal live preview elements
            if (
                event.target &&
                event.target.nodeType === Node.ELEMENT_NODE &&
                event.target.tagName !== "HTML" &&
                event.target.tagName !== "BODY" &&
                event.target.hasAttribute("data-brackets-id")
            ) {
                // Store original background color to restore on hover out
                event.target._originalBackgroundColor = event.target.style.backgroundColor;
                event.target.style.backgroundColor = "rgba(0, 162, 255, 0.2)";

                _hoverHighlight.add(event.target, false);

                // Create info box for the hovered element
                if (_nodeInfoBox) {
                    _nodeInfoBox.remove();
                }
                // check if this element is already clicked (has more options box)
                // this is needed so that we can check for overlapping issue among the boxes
                const isAlreadyClicked = previouslyClickedElement === event.target && _nodeMoreOptionsBox !== null;
                _nodeInfoBox = new NodeInfoBox(event.target, isAlreadyClicked);
            }
        }
    }

    function onElementHoverOut(event) {
        if (_hoverHighlight) {
            _hoverHighlight.clear();
        }

        // Restore original background color
        if (event && event.target && event.target.nodeType === Node.ELEMENT_NODE && event.target.hasAttribute("data-brackets-id")) {
            if (event.target._originalBackgroundColor !== undefined) {
                event.target.style.backgroundColor = event.target._originalBackgroundColor;
            } else {
                event.target.style.backgroundColor = "";
            }
            delete event.target._originalBackgroundColor;
        }

        // Remove info box when mouse leaves the element
        if (_nodeInfoBox) {
            _nodeInfoBox.remove();
            _nodeInfoBox = null;
        }
    }

    /**
     * This function handles the click event on the live preview DOM element
     * it is to show the advanced DOM manipulation options in the live preview
     * @param {Event} event
     */
    function onClick(event) {
        // make sure that the feature is enabled and also the clicked element has the attribute 'data-brackets-id'
        if (
            isFlagActive &&
            event.target.hasAttribute("data-brackets-id") &&
            event.target.tagName !== "BODY" &&
            event.target.tagName !== "HTML"
        ) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            if (_nodeMoreOptionsBox) {
                _nodeMoreOptionsBox.remove();
                _nodeMoreOptionsBox = null;
            }

            // to remove the outline styling from the previously clicked element
            if (previouslyClickedElement) {
                if (previouslyClickedElement._originalOutline !== undefined) {
                    previouslyClickedElement.style.outline = previouslyClickedElement._originalOutline;
                } else {
                    previouslyClickedElement.style.outline = "";
                }
                delete previouslyClickedElement._originalOutline;
            }

            _nodeMoreOptionsBox = new NodeMoreOptionsBox(event.target);

            // show the info box when a DOM element is clicked
            if (_nodeInfoBox) {
                _nodeInfoBox.remove();
            }
            _nodeInfoBox = new NodeInfoBox(event.target, true); // true means that the element was clicked

            event.target._originalOutline = event.target.style.outline;
            event.target.style.outline = "1px solid #4285F4";
            previouslyClickedElement = event.target;
        } else if ( // when user clicks on the HTML or the BODY tag, we want to remove the boxes
            isFlagActive &&
            _nodeMoreOptionsBox &&
            (event.target.tagName === "HTML" || event.target.tagName === "BODY")
        ) {
            dismissMoreOptionsBox();
        }
    }

    /**
     * this function handles the double click event
     * @param {Event} event
     */
    function onDoubleClick(event) {
        if (
            isFlagActive &&
            event.target.hasAttribute("data-brackets-id") &&
            event.target.tagName !== "BODY" &&
            event.target.tagName !== "HTML"
        ) {
            // because we only want to allow double click text editing where we show the edit option
            if (_shouldShowEditTextOption(event.target)) {
                event.preventDefault();
                event.stopPropagation();
                startEditing(event.target);
            }
        }
    }

    function onKeyUp(event) {
        if (_setup && !_validEvent(event)) {
            window.document.removeEventListener("keyup", onKeyUp);
            window.document.removeEventListener("mouseover", onMouseOver);
            window.document.removeEventListener("mouseout", onMouseOut);
            window.document.removeEventListener("mousemove", onMouseMove);
            _localHighlight.clear();
            _localHighlight = undefined;
            _setup = false;
        }
    }

    function onKeyDown(event) {
        if ((event.key === "Escape" || event.key === "Esc")) {
            dismissMoreOptionsBox();
        }
        if (!_setup && _validEvent(event)) {
            window.document.addEventListener("keyup", onKeyUp);
            window.document.addEventListener("mouseover", onMouseOver);
            window.document.addEventListener("mouseout", onMouseOut);
            window.document.addEventListener("mousemove", onMouseMove);
            window.document.addEventListener("click", onClick);
            _localHighlight = new Highlight("#ecc", true);
            _setup = true;
        }
    }

    /** Public Commands **********************************************************/

    // show goto
    function showGoto(targets) {
        if (!_currentMenu) {
            return;
        }
        _currentMenu.createBody();
        var i;
        for (i in targets) {
            _currentMenu.addItem(targets[i]);
        }
        _currentMenu.show();
    }

    // remove active highlights
    function hideHighlight() {
        if (_remoteHighlight) {
            _remoteHighlight.clear();
            _remoteHighlight = null;
        }
        if (_clickHighlight) {
            _clickHighlight.clear();
            _clickHighlight = null;
        }
        if (_hoverHighlight) {
            _hoverHighlight.clear();
        }
    }

    // highlight a node
    function highlight(node, clear) {
        if (!_clickHighlight) {
            _clickHighlight = new Highlight("#cfc");
        }
        if (clear) {
            _clickHighlight.clear();
        }
        // Skip highlighting for HTML and BODY tags
        if (node && node.nodeType === Node.ELEMENT_NODE &&
            node.tagName !== "HTML" && node.tagName !== "BODY") {
            _clickHighlight.add(node, true);
        }
    }

    // highlight a rule
    function highlightRule(rule) {
        hideHighlight();
        var i, nodes = window.document.querySelectorAll(rule);
        for (i = 0; i < nodes.length; i++) {
            highlight(nodes[i]);
        }
        _clickHighlight.selector = rule;
    }

    // recreate UI boxes (info box and more options box)
    function redrawUIBoxes() {
        if (_nodeMoreOptionsBox) {
            const element = _nodeMoreOptionsBox.element;
            _nodeMoreOptionsBox.remove();
            _nodeMoreOptionsBox = new NodeMoreOptionsBox(element);

            if (_nodeInfoBox) {
                _nodeInfoBox.remove();
                _nodeInfoBox = new NodeInfoBox(element, true); // true means it came from a click
            }
        }
    }

    // redraw active highlights
    function redrawHighlights() {
        if (_remoteHighlight) {
            _remoteHighlight.redraw();
        }
        if (_clickHighlight) {
            _clickHighlight.redraw();
        }
        if (_hoverHighlight) {
            _hoverHighlight.redraw();
        }
    }

    // just a wrapper function when we need to redraw highlights as well as UI boxes
    function redrawEverything() {
        redrawHighlights();
        redrawUIBoxes();
    }

    window.addEventListener("resize", redrawEverything);
    // Add a capture-phase scroll listener to update highlights when
    // any element scrolls.

    function _scrollHandler(e) {
        // Document scrolls can be updated immediately. Any other scrolls
        // need to be updated on a timer to ensure the layout is correct.
        if (e.target === window.document) {
            redrawHighlights();
        } else {
            if (_remoteHighlight || _localHighlight || _clickHighlight || _hoverHighlight) {
                window.setTimeout(redrawHighlights, 0);
            }
        }

        dismissMoreOptionsBox();
    }

    window.addEventListener("scroll", _scrollHandler, true);

    /**
     * Constructor
     * @param {Document} htmlDocument
     */
    function DOMEditHandler(htmlDocument) {
        this.htmlDocument = htmlDocument;
        this.rememberedNodes = null;
        this.entityParseParent = htmlDocument.createElement("div");
    }

    /**
     * @private
     * Find the first matching element with the specified data-brackets-id
     * @param {string} id
     * @return {Element}
     */
    DOMEditHandler.prototype._queryBracketsID = function (id) {
        if (!id) {
            return null;
        }

        if (this.rememberedNodes && this.rememberedNodes[id]) {
            return this.rememberedNodes[id];
        }

        var results = this.htmlDocument.querySelectorAll("[data-brackets-id='" + id + "']");
        return results && results[0];
    };

    /**
     * @private
     * Insert a new child element
     * @param {Element} targetElement Parent element already in the document
     * @param {Element} childElement New child element
     * @param {Object} edit
     */
    DOMEditHandler.prototype._insertChildNode = function (targetElement, childElement, edit) {
        var before = this._queryBracketsID(edit.beforeID),
            after  = this._queryBracketsID(edit.afterID);

        if (edit.firstChild) {
            before = targetElement.firstChild;
        } else if (edit.lastChild) {
            after = targetElement.lastChild;
        }

        if (before) {
            targetElement.insertBefore(childElement, before);
        } else if (after && (after !== targetElement.lastChild)) {
            targetElement.insertBefore(childElement, after.nextSibling);
        } else {
            targetElement.appendChild(childElement);
        }
    };

    /**
     * @private
     * Given a string containing encoded entity references, returns the string with the entities decoded.
     * @param {string} text The text to parse.
     * @return {string} The decoded text.
     */
    DOMEditHandler.prototype._parseEntities = function (text) {
        // Kind of a hack: just set the innerHTML of a div to the text, which will parse the entities, then
        // read the content out.
        var result;
        this.entityParseParent.innerHTML = text;
        result = this.entityParseParent.textContent;
        this.entityParseParent.textContent = "";
        return result;
    };

    /**
     * @private
     * @param {Node} node
     * @return {boolean} true if node expects its content to be raw text (not parsed for entities) according to the HTML5 spec.
     */
    function _isRawTextNode(node) {
        return (node.nodeType === Node.ELEMENT_NODE && /script|style|noscript|noframes|noembed|iframe|xmp/i.test(node.tagName));
    }

    /**
     * @private
     * Replace a range of text and comment nodes with an optional new text node
     * @param {Element} targetElement
     * @param {Object} edit
     */
    DOMEditHandler.prototype._textReplace = function (targetElement, edit) {
        function prevIgnoringHighlights(node) {
            do {
                node = node.previousSibling;
            } while (node && node.className === HIGHLIGHT_CLASSNAME);
            return node;
        }
        function nextIgnoringHighlights(node) {
            do {
                node = node.nextSibling;
            } while (node && node.className === HIGHLIGHT_CLASSNAME);
            return node;
        }
        function lastChildIgnoringHighlights(node) {
            node = (node.childNodes.length ? node.childNodes.item(node.childNodes.length - 1) : null);
            if (node && node.className === HIGHLIGHT_CLASSNAME) {
                node = prevIgnoringHighlights(node);
            }
            return node;
        }

        var start           = (edit.afterID)  ? this._queryBracketsID(edit.afterID)  : null,
            startMissing    = edit.afterID && !start,
            end             = (edit.beforeID) ? this._queryBracketsID(edit.beforeID) : null,
            endMissing      = edit.beforeID && !end,
            moveNext        = start && nextIgnoringHighlights(start),
            current         = moveNext || (end && prevIgnoringHighlights(end)) || lastChildIgnoringHighlights(targetElement),
            next,
            textNode        = (edit.content !== undefined) ? this.htmlDocument.createTextNode(_isRawTextNode(targetElement) ? edit.content : this._parseEntities(edit.content)) : null,
            lastRemovedWasText,
            isText;

        // remove all nodes inside the range
        while (current && (current !== end)) {
            isText = current.nodeType === Node.TEXT_NODE;

            // if start is defined, delete following text nodes
            // if start is not defined, delete preceding text nodes
            next = (moveNext) ? nextIgnoringHighlights(current) : prevIgnoringHighlights(current);

            // only delete up to the nearest element.
            // if the start/end tag was deleted in a prior edit, stop removing
            // nodes when we hit adjacent text nodes
            if ((current.nodeType === Node.ELEMENT_NODE) ||
                    ((startMissing || endMissing) && (isText && lastRemovedWasText))) {
                break;
            } else {
                lastRemovedWasText = isText;

                if (current.remove) {
                    current.remove();
                } else if (current.parentNode && current.parentNode.removeChild) {
                    current.parentNode.removeChild(current);
                }
                current = next;
            }
        }

        if (textNode) {
            // OK to use nextSibling here (not nextIgnoringHighlights) because we do literally
            // want to insert immediately after the start tag.
            if (start && start.nextSibling) {
                targetElement.insertBefore(textNode, start.nextSibling);
            } else if (end) {
                targetElement.insertBefore(textNode, end);
            } else {
                targetElement.appendChild(textNode);
            }
        }
    };

    /**
     * @private
     * Apply an array of DOM edits to the document
     * @param {Array.<Object>} edits
     */
    DOMEditHandler.prototype.apply = function (edits) {
        var targetID,
            targetElement,
            childElement,
            self = this;

        this.rememberedNodes = {};

        edits.forEach(function (edit) {
            var editIsSpecialTag = edit.type === "elementInsert" && (edit.tag === "html" || edit.tag === "head" || edit.tag === "body");

            if (edit.type === "rememberNodes") {
                edit.tagIDs.forEach(function (tagID) {
                    var node = self._queryBracketsID(tagID);
                    self.rememberedNodes[tagID] = node;
                    if (node.remove) {
                        node.remove();
                    } else if (node.parentNode && node.parentNode.removeChild) {
                        node.parentNode.removeChild(node);
                    }
                });
                return;
            }

            targetID = edit.type.match(/textReplace|textDelete|textInsert|elementInsert|elementMove/) ? edit.parentID : edit.tagID;
            targetElement = self._queryBracketsID(targetID);

            if (!targetElement && !editIsSpecialTag) {
                console.error("data-brackets-id=" + targetID + " not found");
                return;
            }

            switch (edit.type) {
            case "attrChange":
            case "attrAdd":
                targetElement.setAttribute(edit.attribute, self._parseEntities(edit.value));
                break;
            case "attrDelete":
                targetElement.removeAttribute(edit.attribute);
                break;
            case "elementDelete":
                if (targetElement.remove) {
                    targetElement.remove();
                } else if (targetElement.parentNode && targetElement.parentNode.removeChild) {
                    targetElement.parentNode.removeChild(targetElement);
                }
                break;
            case "elementInsert":
                childElement = null;
                if (editIsSpecialTag) {
                    // If we already have one of these elements (which we should), then
                    // just copy the attributes and set the ID.
                    childElement = self.htmlDocument[edit.tag === "html" ? "documentElement" : edit.tag];
                    if (!childElement) {
                        // Treat this as a normal insertion.
                        editIsSpecialTag = false;
                    }
                }
                if (!editIsSpecialTag) {
                    childElement = self.htmlDocument.createElement(edit.tag);
                }

                Object.keys(edit.attributes).forEach(function (attr) {
                    childElement.setAttribute(attr, self._parseEntities(edit.attributes[attr]));
                });
                childElement.setAttribute("data-brackets-id", edit.tagID);

                if (!editIsSpecialTag) {
                    self._insertChildNode(targetElement, childElement, edit);
                }
                break;
            case "elementMove":
                childElement = self._queryBracketsID(edit.tagID);
                self._insertChildNode(targetElement, childElement, edit);
                break;
            case "textInsert":
                var textElement = self.htmlDocument.createTextNode(_isRawTextNode(targetElement) ? edit.content : self._parseEntities(edit.content));
                self._insertChildNode(targetElement, textElement, edit);
                break;
            case "textReplace":
            case "textDelete":
                self._textReplace(targetElement, edit);
                break;
            }
        });

        this.rememberedNodes = {};

        // update highlight after applying diffs
        redrawEverything();
    };

    function applyDOMEdits(edits) {
        _editHandler.apply(edits);
    }

    /**
     *
     * @param {Element} elem
     */
    function _domElementToJSON(elem) {
        var json = { tag: elem.tagName.toLowerCase(), attributes: {}, children: [] },
            i,
            len,
            node,
            value;

        len = elem.attributes.length;
        for (i = 0; i < len; i++) {
            node = elem.attributes.item(i);

            // skip internal attributes that shouldn't be serialized
            if (node.name === "draggable" && node.value === "true") {
                continue;
            }
            value = (node.name === "data-brackets-id") ? parseInt(node.value, 10) : node.value;
            // Clean internal style properties
            if (node.name === "style") {
                const cleanedStyle = _cleanInternalStyles(value);

                if (cleanedStyle.trim() === '') {
                    continue; // Skip empty style attribute
                }
                value = cleanedStyle;
            }
            json.attributes[node.name] = value;
        }

        len = elem.childNodes.length;
        for (i = 0; i < len; i++) {
            node = elem.childNodes.item(i);

            // ignores comment nodes and visuals generated by live preview
            if (node.nodeType === Node.ELEMENT_NODE && node.className !== HIGHLIGHT_CLASSNAME) {
                json.children.push(_domElementToJSON(node));
            } else if (node.nodeType === Node.TEXT_NODE) {
                json.children.push({ content: node.nodeValue });
            }
        }

        return json;
    }

    function getSimpleDOM() {
        return JSON.stringify(_domElementToJSON(window.document.documentElement));
    }

    function updateConfig(newConfig) {
        var oldConfig = config;
        config = JSON.parse(newConfig);

        if (config.highlight) {
            // Add hover event listeners if highlight is enabled
            window.document.removeEventListener("mouseover", onElementHover);
            window.document.removeEventListener("mouseout", onElementHoverOut);
            window.document.addEventListener("mouseover", onElementHover);
            window.document.addEventListener("mouseout", onElementHoverOut);
        } else {
            // Remove hover event listeners if highlight is disabled
            window.document.removeEventListener("mouseover", onElementHover);
            window.document.removeEventListener("mouseout", onElementHoverOut);

            // Remove info box and more options box if highlight is disabled
            if (_nodeInfoBox) {
                _nodeInfoBox.remove();
                _nodeInfoBox = null;
            }
            if (_nodeMoreOptionsBox) {
                _nodeMoreOptionsBox.remove();
                _nodeMoreOptionsBox = null;
            }
        }
        return JSON.stringify(config);
    }

    /**
     * This function checks if there are any live preview boxes currently visible
     * @return {boolean} true if any boxes are visible, false otherwise
     */
    function hasVisibleLivePreviewBoxes() {
        return _nodeMoreOptionsBox !== null || _nodeInfoBox !== null || previouslyClickedElement !== null;
    }

    /**
     * This function is responsible to remove the more options box
     * we do this either when user presses the Esc key or clicks on the HTML or Body tags
     * @return {boolean} true if any boxes were dismissed, false otherwise
     */
    function dismissMoreOptionsBox() {
        let dismissed = false;

        if (_nodeMoreOptionsBox) {
            _nodeMoreOptionsBox.remove();
            _nodeMoreOptionsBox = null;
            dismissed = true;
        }

        if (_nodeInfoBox) {
            _nodeInfoBox.remove();
            _nodeInfoBox = null;
            dismissed = true;
        }

        if (previouslyClickedElement) {
            if (previouslyClickedElement._originalOutline !== undefined) {
                previouslyClickedElement.style.outline = previouslyClickedElement._originalOutline;
            } else {
                previouslyClickedElement.style.outline = "";
            }
            delete previouslyClickedElement._originalOutline;
            previouslyClickedElement = null;
            dismissed = true;
        }

        return dismissed;
    }

    /**
     * This function is responsible to move the cursor to the end of the text content when we start editing
     * @param {DOMElement} element
     */
    function moveCursorToEnd(selection, element) {
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    // Function to handle direct editing of elements in the live preview
    function startEditing(element) {
        if (!element) {
            return;
        }

        // Make the element editable
        element.setAttribute("contenteditable", "true");
        element.focus();

        // Move cursor to end if no existing selection
        const selection = window.getSelection();
        if (selection.rangeCount === 0 || selection.isCollapsed) {
            moveCursorToEnd(selection, element);
        }

        dismissMoreOptionsBox();

        element._originalContent = cleanupElementProperties(element);

        // Add event listeners for editing
        function onBlur() {
            finishEditing(element);
        }

        function onKeyDown(event) {
            if (event.key === "Escape") {
                // Cancel editing
                event.preventDefault();
                finishEditing(element);
            } else if (event.key === "Enter" && !event.shiftKey) {
                // Finish editing on Enter (unless Shift is held)
                event.preventDefault();
                finishEditing(element);
            }
        }

        element.addEventListener("blur", onBlur);
        element.addEventListener("keydown", onKeyDown);

        // Store the event listeners for later removal
        element._editListeners = {
            blur: onBlur,
            keydown: onKeyDown
        };
    }

    // Helper function to clean internal style properties
    function _cleanInternalStyles(styleValue) {
        if (typeof styleValue !== "string") {
            return styleValue;
        }

        let cleanedStyle = styleValue;

        // remove internal background color
        cleanedStyle = cleanedStyle.replace(/background-color:\s*rgba\(0,\s*162,\s*255,\s*0\.2\)\s*;?\s*/gi, "");

        // remove internal outline
        cleanedStyle = cleanedStyle.replace(/outline:\s*rgb\(66,\s*133,\s*244\)\s+solid\s+1px\s*;?\s*/gi, "");
        cleanedStyle = cleanedStyle.replace(/outline:\s*1px\s+solid\s+#4285F4\s*;?\s*/gi, "");

        // clean up any extra spaces or semicolons
        cleanedStyle = cleanedStyle
            .replace(/;\s*;/g, ";")
            .replace(/^\s*;\s*/, "")
            .replace(/\s*;\s*$/, "");

        return cleanedStyle;
    }

    // this function is to remove the internal properties from elements before getting the innerHTML
    // then add all the properties back to the elements
    // internal properties such as 'data-brackets-id', 'data-ld-highlight' etc
    function cleanupElementProperties(element) {
        const clone = element.cloneNode(true);
        const allElements = [clone, ...clone.querySelectorAll('*')];

        allElements.forEach(el => {
            // Remove Phoenix internal attributes
            if (el.hasAttribute('data-brackets-id')) {
                el.removeAttribute('data-brackets-id');
            }
            if (el.hasAttribute('data-ld-highlight')) {
                el.removeAttribute('data-ld-highlight');
            }

            // remove the draggable attribute added internally
            if (el.hasAttribute('draggable')) {
                el.removeAttribute('draggable');
            }

            // remove internal style properties
            if (el.hasAttribute('style')) {
                const style = el.getAttribute('style');
                const cleanedStyle = _cleanInternalStyles(style);

                if (cleanedStyle.trim() === '') {
                    el.removeAttribute('style');
                } else {
                    el.setAttribute('style', cleanedStyle);
                }
            }
        });

        return clone.innerHTML;
    }

    // Function to finish editing and apply changes
    function finishEditing(element) {
        if (!element || !element.hasAttribute("contenteditable")) {
            return;
        }

        // Remove contenteditable attribute
        element.removeAttribute("contenteditable");
        dismissMoreOptionsBox();

        // Remove event listeners
        if (element._editListeners) {
            element.removeEventListener("blur", element._editListeners.blur);
            element.removeEventListener("keydown", element._editListeners.keydown);
            delete element._editListeners;
        }

        // Get the new content after cleaning up unwanted properties
        const newContent = cleanupElementProperties(element);

        // If content has changed, send the edit to the editor
        if (newContent !== element._originalContent && element.hasAttribute("data-brackets-id")) {
            const tagId = element.getAttribute("data-brackets-id");
            window._Brackets_MessageBroker.send({
                livePreviewEditEnabled: true,
                element: element,
                newContent: newContent,
                tagId: Number(tagId),
                livePreviewTextEdit: true
            });
        }

        // Clean up
        delete element._originalContent;
    }

    // init
    _editHandler = new DOMEditHandler(window.document);

    // Initialize hover highlight with Chrome-like colors
    _hoverHighlight = new Highlight("#c8f9c5", true); // Green similar to Chrome's padding color

    // Initialize click highlight with animation
    _clickHighlight = new Highlight("#cfc", true); // Light green for click highlight

    // Add event listeners for hover
    window.document.addEventListener("mouseover", onElementHover);
    window.document.addEventListener("mouseout", onElementHoverOut);
    window.document.addEventListener("click", onClick);
    window.document.addEventListener("dblclick", onDoubleClick);
    window.document.addEventListener("dragover", onDragOver);
    window.document.addEventListener("drop", onDrop);
    window.document.addEventListener("keydown", onKeyDown);

    return {
        "DOMEditHandler"        : DOMEditHandler,
        "showGoto"              : showGoto,
        "hideHighlight"         : hideHighlight,
        "highlight"             : highlight,
        "highlightRule"         : highlightRule,
        "redrawHighlights"      : redrawHighlights,
        "redrawEverything"      : redrawEverything,
        "applyDOMEdits"         : applyDOMEdits,
        "getSimpleDOM"          : getSimpleDOM,
        "updateConfig"          : updateConfig,
        "startEditing"          : startEditing,
        "finishEditing"         : finishEditing,
        "dismissMoreOptionsBox" : dismissMoreOptionsBox,
        "hasVisibleLivePreviewBoxes" : hasVisibleLivePreviewBoxes
    };
}
