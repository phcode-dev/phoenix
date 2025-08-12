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

    // this will store the element that was clicked previously (before the new click)
    // we need this so that we can remove click styling from the previous element when a new element is clicked
    let previouslyClickedElement = null;

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

    // auto-scroll variables to auto scroll the live preview when an element is dragged to the top/bottom
    let _autoScrollTimer = null;
    let _isAutoScrolling = false; // to disable highlights when auto scrolling
    const AUTO_SCROLL_SPEED = 12; // pixels per scroll
    const AUTO_SCROLL_EDGE_SIZE = 0.05; // 5% of viewport height (either top/bottom)

    /**
     * this function is responsible to auto scroll the live preview when
     * dragging an element to the viewport edges
     * @param {number} clientY - curr mouse Y position
     */
    function _handleAutoScroll(clientY) {
        const viewportHeight = window.innerHeight;
        const scrollEdgeSize = viewportHeight * AUTO_SCROLL_EDGE_SIZE;

        // Clear existing timer
        if (_autoScrollTimer) {
            clearInterval(_autoScrollTimer);
            _autoScrollTimer = null;
        }

        let scrollDirection = 0;

        // check if near top edge (scroll up)
        if (clientY <= scrollEdgeSize) {
            scrollDirection = -AUTO_SCROLL_SPEED;
        } else if (clientY >= viewportHeight - scrollEdgeSize) {
            // check if near bottom edge (scroll down)
            scrollDirection = AUTO_SCROLL_SPEED;
        }

        // Start scrolling if needed
        if (scrollDirection !== 0) {
            _isAutoScrolling = true;
            _autoScrollTimer = setInterval(() => {
                window.scrollBy(0, scrollDirection);
            }, 16); // 16 is ~60fps
        }
    }

    // stop autoscrolling
    function _stopAutoScroll() {
        if (_autoScrollTimer) {
            clearInterval(_autoScrollTimer);
            _autoScrollTimer = null;
        }
        _isAutoScrolling = false;
    }

    // determine whether an event should be processed for Live Development
    function _validEvent(event) {
        if (window.navigator.platform.substr(0, 3) === "Mac") {
            // Mac
            return event.metaKey;
        }
        // Windows
        return event.ctrlKey;
    }

    // helper function to check if an element is inside the HEAD tag
    // we need this because we don't wanna trigger the element highlights on head tag and its children
    function _isInsideHeadTag(element) {
        let parent = element;
        while (parent && parent !== window.document) {
            if (parent.tagName === "HEAD") {
                return true;
            }
            parent = parent.parentElement;
        }
        return false;
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

    // Checks if an element is actually visible to the user (not hidden, collapsed, or off-screen)
    function isElementVisible(element) {
        // Check if element has zero dimensions (indicates it's hidden or collapsed)
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
            return false;
        }

        // Check computed styles for visibility
        const computedStyle = window.getComputedStyle(element);
        if (computedStyle.display === 'none' ||
            computedStyle.visibility === 'hidden' ||
            computedStyle.opacity === '0') {
            return false;
        }

        // Check if any parent element is hidden
        let parent = element.parentElement;
        while (parent && parent !== document.body) {
            const parentStyle = window.getComputedStyle(parent);
            if (parentStyle.display === 'none' ||
                parentStyle.visibility === 'hidden') {
                return false;
            }
            parent = parent.parentElement;
        }

        return true;
    }

    // returns the distance from the top of the closest relatively positioned parent element
    function getDocumentOffsetTop(element) {
        return element.offsetTop + (element.offsetParent ? getDocumentOffsetTop(element.offsetParent) : 0);
    }

    /**
     * This function gets called when the delete button is clicked
     * it sends a message to the editor using postMessage to delete the element from the source code
     * @param {Event} event
     * @param {DOMElement} element - the HTML DOM element that was clicked. it is to get the data-brackets-id attribute
     */
    function _handleDeleteOptionClick(event, element) {
        const tagId = element.getAttribute("data-brackets-id");

        if (tagId && element.tagName !== "BODY" && element.tagName !== "HTML" && !_isInsideHeadTag(element)) {
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

        if (tagId && element.tagName !== "BODY" && element.tagName !== "HTML" && !_isInsideHeadTag(element)) {
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
            !_isInsideHeadTag(parentElement) &&
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
        element.style.opacity = 0.4;
    }


    function _dragEndChores(element) {
        if (element._originalDragOpacity) {
            element.style.opacity = element._originalDragOpacity;
        } else {
            element.style.opacity = 1;
        }
        delete element._originalDragOpacity;
    }

    // CSS class names for drop markers
    let DROP_MARKER_CLASSNAME = "__brackets-drop-marker-horizontal";
    let DROP_MARKER_VERTICAL_CLASSNAME = "__brackets-drop-marker-vertical";
    let DROP_MARKER_INSIDE_CLASSNAME = "__brackets-drop-marker-inside";

    /**
     * This function is responsible to determine whether to show vertical/horizontal indicators
     *
     * @param {DOMElement} element - the target element
     * @returns {String} 'vertical' or 'horizontal'
     */
    function _getIndicatorType(element) {
        // we need to check the parent element's property if its a flex container
        const parent = element.parentElement;
        if (!parent) {
            return 'horizontal';
        }

        const parentStyle = window.getComputedStyle(parent);
        const display = parentStyle.display;
        const flexDirection = parentStyle.flexDirection;

        if ((display === "flex" || display === "inline-flex") && flexDirection.startsWith("row")) {
            return "vertical";
        }

        // default is horizontal
        return 'horizontal';
    }

    /**
     * this function is to determine if an element can accept children (inside drops)
     *
     * @param {DOMElement} element - The target element
     * @returns {Boolean} true if element can accept children
     */
    function _canAcceptChildren(element) {
        // self-closing elements, cannot have children
        const voidElements = [
            "IMG",
            "BR",
            "HR",
            "INPUT",
            "META",
            "LINK",
            "AREA",
            "BASE",
            "COL",
            "EMBED",
            "SOURCE",
            "TRACK",
            "WBR"
        ];

        // Elements that shouldn't accept visual children
        const nonContainerElements = [
            "SCRIPT", "STYLE", "NOSCRIPT", "CANVAS", "SVG", "VIDEO", "AUDIO", "IFRAME", "OBJECT"
        ];

        const tagName = element.tagName.toUpperCase();

        if (voidElements.includes(tagName) || nonContainerElements.includes(tagName)) {
            return false;
        }

        return true;
    }

    /**
     * it is to check if a source element can be placed inside a target element according to HTML rules
     *
     * @param {DOMElement} sourceElement - The element being dragged
     * @param {DOMElement} targetElement - The target container element
     * @returns {Boolean} true if the nesting is valid
     */
    function _isValidNesting(sourceElement, targetElement) {
        const sourceTag = sourceElement.tagName.toUpperCase();
        const targetTag = targetElement.tagName.toUpperCase();

        // block elements, cannot come inside inline elements
        const blockElements = [
            "DIV",
            "P",
            "H1",
            "H2",
            "H3",
            "H4",
            "H5",
            "H6",
            "SECTION",
            "ARTICLE",
            "HEADER",
            "FOOTER",
            "NAV",
            "ASIDE",
            "MAIN",
            "BLOCKQUOTE",
            "PRE",
            "TABLE",
            "UL",
            "OL",
            "LI",
            "DL",
            "DT",
            "DD",
            "FORM",
            "FIELDSET",
            "ADDRESS",
            "FIGURE",
            "FIGCAPTION",
            "DETAILS",
            "SUMMARY"
        ];

        // inline elements that can't contain block elements
        const inlineElements = [
            "SPAN",
            "A",
            "STRONG",
            "EM",
            "B",
            "I",
            "U",
            "SMALL",
            "CODE",
            "KBD",
            "SAMP",
            "VAR",
            "SUB",
            "SUP",
            "MARK",
            "DEL",
            "INS",
            "Q",
            "CITE",
            "ABBR",
            "TIME",
            "DATA",
            "OUTPUT"
        ];

        // interactive elements that can't be nested inside each other
        const interactiveElements = [
            "A",
            "BUTTON",
            "INPUT",
            "SELECT",
            "TEXTAREA",
            "LABEL",
            "DETAILS",
            "SUMMARY",
            "AUDIO",
            "VIDEO",
            "EMBED",
            "IFRAME",
            "OBJECT"
        ];

        // Sectioning content - semantic HTML5 sections
        const sectioningContent = ["ARTICLE", "ASIDE", "NAV", "SECTION"];

        // Elements that can't contain themselves (prevent nesting)
        const noSelfNesting = [
            "P",
            "A",
            "BUTTON",
            "LABEL",
            "FORM",
            "HEADER",
            "FOOTER",
            "NAV",
            "MAIN",
            "ASIDE",
            "SECTION",
            "ARTICLE",
            "ADDRESS",
            "H1",
            "H2",
            "H3",
            "H4",
            "H5",
            "H6",
            "FIGURE",
            "FIGCAPTION",
            "DETAILS",
            "SUMMARY"
        ];

        // Special cases - elements that have specific content restrictions
        const restrictedContainers = {
            // List elements
            UL: ["LI"],
            OL: ["LI"],
            DL: ["DT", "DD"],

            // Table elements
            TABLE: ["THEAD", "TBODY", "TFOOT", "TR", "CAPTION", "COLGROUP"],
            THEAD: ["TR"],
            TBODY: ["TR"],
            TFOOT: ["TR"],
            TR: ["TD", "TH"],
            COLGROUP: ["COL"],

            // Form elements
            SELECT: ["OPTION", "OPTGROUP"],
            OPTGROUP: ["OPTION"],
            DATALIST: ["OPTION"],

            // Media elements
            PICTURE: ["SOURCE", "IMG"],
            AUDIO: ["SOURCE", "TRACK"],
            VIDEO: ["SOURCE", "TRACK"],

            // Other specific containers
            FIGURE: ["FIGCAPTION", "DIV", "P", "IMG", "CANVAS", "SVG", "TABLE", "PRE", "CODE"],
            DETAILS: ["SUMMARY"] // SUMMARY should be the first child
        };

        // 1. Check self-nesting (elements that can't contain themselves)
        if (noSelfNesting.includes(sourceTag) && sourceTag === targetTag) {
            return false;
        }

        // 2. Check block elements inside inline elements
        if (blockElements.includes(sourceTag) && inlineElements.includes(targetTag)) {
            return false;
        }

        // 3. Check restricted containers (strict parent-child relationships)
        if (restrictedContainers[targetTag]) {
            return restrictedContainers[targetTag].includes(sourceTag);
        }

        // 4. Special case: P tags can't contain block elements (phrasing content only)
        if (targetTag === "P" && blockElements.includes(sourceTag)) {
            return false;
        }

        // 5. Interactive elements can't contain other interactive elements
        if (interactiveElements.includes(targetTag) && interactiveElements.includes(sourceTag)) {
            return false;
        }

        // 6. Semantic HTML5 sectioning rules
        if (targetTag === "HEADER") {
            // Header can't contain other headers, footers, or main
            if (["HEADER", "FOOTER", "MAIN"].includes(sourceTag)) {
                return false;
            }
        }

        if (targetTag === "FOOTER") {
            // Footer can't contain headers, footers, or main
            if (["HEADER", "FOOTER", "MAIN"].includes(sourceTag)) {
                return false;
            }
        }

        if (targetTag === "MAIN") {
            // Main can't contain other mains
            if (sourceTag === "MAIN") {
                return false;
            }
        }

        if (targetTag === "ADDRESS") {
            // Address can't contain sectioning content, headers, footers, or address
            if (sectioningContent.includes(sourceTag) || ["HEADER", "FOOTER", "ADDRESS", "MAIN"].includes(sourceTag)) {
                return false;
            }
        }

        // 7. Form-related validation
        if (targetTag === "FORM") {
            // Form can't contain other forms
            if (sourceTag === "FORM") {
                return false;
            }
        }

        if (targetTag === "FIELDSET") {
            // Fieldset should have legend as first child (but we'll allow it anywhere for flexibility)
            // No specific restrictions beyond normal content
        }

        if (targetTag === "LABEL") {
            // Label can't contain other labels or form controls (except one input)
            if (["LABEL", "BUTTON", "SELECT", "TEXTAREA"].includes(sourceTag)) {
                return false;
            }
        }

        // 8. Heading hierarchy validation (optional - can be strict or flexible)
        if (["H1", "H2", "H3", "H4", "H5", "H6"].includes(targetTag)) {
            // Headings can't contain block elements (should only contain phrasing content)
            if (blockElements.includes(sourceTag)) {
                return false;
            }
        }

        // 9. List item specific rules
        if (sourceTag === "LI") {
            // LI can only be inside UL, OL, or MENU
            if (!["UL", "OL", "MENU"].includes(targetTag)) {
                return false;
            }
        }

        if (["DT", "DD"].includes(sourceTag)) {
            // DT and DD can only be inside DL
            if (targetTag !== "DL") {
                return false;
            }
        }

        // 10. Table-related validation
        if (["THEAD", "TBODY", "TFOOT"].includes(sourceTag)) {
            if (targetTag !== "TABLE") {
                return false;
            }
        }

        if (sourceTag === "TR") {
            if (!["TABLE", "THEAD", "TBODY", "TFOOT"].includes(targetTag)) {
                return false;
            }
        }

        if (["TD", "TH"].includes(sourceTag)) {
            if (targetTag !== "TR") {
                return false;
            }
        }

        if (sourceTag === "CAPTION") {
            if (targetTag !== "TABLE") {
                return false;
            }
        }

        // 11. Media and embedded content
        if (["SOURCE", "TRACK"].includes(sourceTag)) {
            if (!["AUDIO", "VIDEO", "PICTURE"].includes(targetTag)) {
                return false;
            }
        }

        // 12. Ruby annotation elements (if supported)
        if (["RP", "RT"].includes(sourceTag)) {
            if (targetTag !== "RUBY") {
                return false;
            }
        }

        // 13. Option elements
        if (sourceTag === "OPTION") {
            if (!["SELECT", "OPTGROUP", "DATALIST"].includes(targetTag)) {
                return false;
            }
        }

        return true;
    }

    /**
     * this function determines the drop zone based on cursor position relative to element
     *
     * @param {DOMElement} element - The target element
     * @param {Number} clientX - x pos
     * @param {Number} clientY - y pos
     * @param {String} indicatorType - 'vertical' or 'horizontal'
     * @param {DOMElement} sourceElement - The element being dragged (for validation)
     * @returns {String} 'before', 'inside', or 'after'
     */
    function _getDropZone(element, clientX, clientY, indicatorType, sourceElement) {
        const rect = element.getBoundingClientRect();
        const canAcceptChildren = _canAcceptChildren(element);
        const isValidNesting = sourceElement ? _isValidNesting(sourceElement, element) : true;

        if (indicatorType === "vertical") {
            const leftThird = rect.left + rect.width * 0.3;
            const rightThird = rect.right - rect.width * 0.3;

            if (clientX < leftThird) {
                return "before";
            } else if (clientX > rightThird) {
                return "after";
            } else if (canAcceptChildren && isValidNesting) {
                return "inside";
            }
            // If can't accept children or invalid nesting, use middle as "after"
            return clientX < rect.left + rect.width / 2 ? "before" : "after";
        }

        const topThird = rect.top + rect.height * 0.3;
        const bottomThird = rect.bottom - rect.height * 0.3;

        if (clientY < topThird) {
            return "before";
        } else if (clientY > bottomThird) {
            return "after";
        } else if (canAcceptChildren && isValidNesting) {
            return "inside";
        }
        // If can't accept children or invalid nesting, use middle as "after"
        return clientY < rect.top + rect.height / 2 ? "before" : "after";
    }

    /**
     * this is to create a marker to indicate a valid drop position
     *
     * @param {DOMElement} element - The element where the drop is possible
     * @param {String} dropZone - 'before', 'inside', or 'after'
     * @param {String} indicatorType - 'vertical' or 'horizontal'
     */
    function _createDropMarker(element, dropZone, indicatorType = "horizontal") {
        // clean any existing marker from that element
        _removeDropMarkerFromElement(element);

        // create the marker element
        let marker = window.document.createElement("div");

        // Set marker class based on drop zone
        if (dropZone === "inside") {
            marker.className = DROP_MARKER_INSIDE_CLASSNAME;
        } else {
            marker.className = indicatorType === "vertical" ? DROP_MARKER_VERTICAL_CLASSNAME : DROP_MARKER_CLASSNAME;
        }

        let rect = element.getBoundingClientRect();
        marker.style.position = "fixed";
        marker.style.zIndex = "2147483646";
        marker.style.borderRadius = "2px";
        marker.style.pointerEvents = "none";

        if (dropZone === "inside") {
            // inside marker - outline around the element
            marker.style.border = "1px dashed #4285F4";
            marker.style.backgroundColor = "rgba(66, 133, 244, 0.05)";
            marker.style.left = rect.left + "px";
            marker.style.top = rect.top + "px";
            marker.style.width = rect.width + "px";
            marker.style.height = rect.height + "px";
            marker.style.animation = "insideMarkerPulse 1s ease-in-out infinite alternate";
        } else {
            // Before/After markers - lines
            marker.style.background = "linear-gradient(90deg, #4285F4, #1976D2)";
            marker.style.boxShadow = "0 0 8px rgba(66, 133, 244, 0.5)";
            marker.style.animation = "dropMarkerPulse 0.8s ease-in-out infinite alternate";

            if (indicatorType === "vertical") {
                // Vertical marker (for flex row containers)
                marker.style.width = "2px";
                marker.style.height = rect.height + "px";
                marker.style.top = rect.top + "px";

                if (dropZone === "after") {
                    marker.style.left = rect.right + 3 + "px";
                } else {
                    marker.style.left = rect.left - 5 + "px";
                }
            } else {
                // Horizontal marker (for block/grid containers)
                marker.style.width = rect.width + "px";
                marker.style.height = "2px";
                marker.style.left = rect.left + "px";

                if (dropZone === "after") {
                    marker.style.top = rect.bottom + 3 + "px";
                } else {
                    marker.style.top = rect.top - 5 + "px";
                }
            }
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
        // Clear all types of markers
        let horizontalMarkers = window.document.querySelectorAll("." + DROP_MARKER_CLASSNAME);
        let verticalMarkers = window.document.querySelectorAll("." + DROP_MARKER_VERTICAL_CLASSNAME);
        let insideMarkers = window.document.querySelectorAll("." + DROP_MARKER_INSIDE_CLASSNAME);

        for (let i = 0; i < horizontalMarkers.length; i++) {
            if (horizontalMarkers[i].parentNode) {
                horizontalMarkers[i].parentNode.removeChild(horizontalMarkers[i]);
            }
        }

        for (let i = 0; i < verticalMarkers.length; i++) {
            if (verticalMarkers[i].parentNode) {
                verticalMarkers[i].parentNode.removeChild(verticalMarkers[i]);
            }
        }

        for (let i = 0; i < insideMarkers.length; i++) {
            if (insideMarkers[i].parentNode) {
                insideMarkers[i].parentNode.removeChild(insideMarkers[i]);
            }
        }

        // Also clear any element references
        let elements = window.document.querySelectorAll("[data-brackets-id]");
        for (let j = 0; j < elements.length; j++) {
            delete elements[j]._dropMarker;
            // Remove any hover effects
            elements[j].style.backgroundColor = "";
            elements[j].style.transform = "";
        }
    }

    /**
     * Handle dragover events on the document (throttled version)
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

        // Skip BODY, HTML tags and elements inside HEAD
        if (target.tagName === "BODY" || target.tagName === "HTML" || _isInsideHeadTag(target)) {
            return;
        }

        // Add subtle hover effect to target element
        target.style.backgroundColor = "rgba(66, 133, 244, 0.1)";
        target.style.transition = "background-color 0.2s ease";

        // Determine indicator type and drop zone based on container layout and cursor position
        const indicatorType = _getIndicatorType(target);
        const dropZone = _getDropZone(
            target, event.clientX, event.clientY, indicatorType, window._currentDraggedElement
        );

        // before creating a drop marker, make sure that we clear all the drop markers
        _clearDropMarkers();
        _createDropMarker(target, dropZone, indicatorType);
        _handleAutoScroll(event.clientY);
    }

    /**
     * handles drag leave event. mainly to clear the drop markers
     * @param {Event} event
     */
    function onDragLeave(event) {
        if (!event.relatedTarget) {
            _clearDropMarkers();
            _stopAutoScroll();
        }
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
            _clearDropMarkers();
            _stopAutoScroll();
            _dragEndChores(window._currentDraggedElement);
            dismissMoreOptionsBox();
            delete window._currentDraggedElement;
            return;
        }

        // Skip BODY, HTML tags and elements inside HEAD
        if (target.tagName === "BODY" || target.tagName === "HTML" || _isInsideHeadTag(target)) {
            _clearDropMarkers();
            _stopAutoScroll();
            _dragEndChores(window._currentDraggedElement);
            dismissMoreOptionsBox();
            delete window._currentDraggedElement;
            return;
        }

        // Determine drop position based on container layout and cursor position
        const indicatorType = _getIndicatorType(target);
        const dropZone = _getDropZone(
            target, event.clientX, event.clientY, indicatorType, window._currentDraggedElement
        );

        // IDs of the source and target elements
        const sourceId = window._currentDraggedElement.getAttribute("data-brackets-id");
        const targetId = target.getAttribute("data-brackets-id");

        // Handle different drop zones
        let messageData = {
            livePreviewEditEnabled: true,
            sourceElement: window._currentDraggedElement,
            targetElement: target,
            sourceId: Number(sourceId),
            targetId: Number(targetId),
            move: true
        };

        if (dropZone === "inside") {
            // For inside drops, we want to insert as a child of the target element
            messageData.insertInside = true;
            messageData.insertAfter = false; // Will be handled differently in backend
        } else {
            // For before/after drops, use the existing logic
            messageData.insertAfter = dropZone === "after";
        }

        // send message to the editor
        window._Brackets_MessageBroker.send(messageData);

        _clearDropMarkers();
        _stopAutoScroll();
        _dragEndChores(window._currentDraggedElement);
        dismissMoreOptionsBox();
        delete window._currentDraggedElement;
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

        if (parentElement.tagName === "HTML" || parentElement.tagName === "BODY" || _isInsideHeadTag(parentElement)) {
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
                dismissMoreOptionsBox();
                // Add drag image styling
                event.dataTransfer.effectAllowed = "move";
            });

            this.element.addEventListener("dragend", (event) => {
                event.preventDefault();
                event.stopPropagation();
                _dragEndChores(this.element);
                _clearDropMarkers();
                _stopAutoScroll();
                delete window._currentDraggedElement;
            });
        },

        _getBoxPosition: function(boxWidth, boxHeight) {
            const elemBounds = this.element.getBoundingClientRect();
            const offset = _screenOffset(this.element);

            let topPos = offset.top - boxHeight - 6; // 6 for just some little space to breathe
            let leftPos = offset.left + elemBounds.width - boxWidth;

            // Check if the box would go off the top of the viewport
            if (elemBounds.top - boxHeight < 6) {
                topPos = offset.top + elemBounds.height + 6;
            }

            // Check if the box would go off the left of the viewport
            if (leftPos < 0) {
                leftPos = offset.left;
            }

            return {topPos: topPos, leftPos: leftPos};
        },

        _style: function() {
            this.body = window.document.createElement("div");

            // this is shadow DOM.
            // we need it because if we add the box directly to the DOM then users style might override it.
            // {mode: "open"} allows us to access the shadow DOM to get actual height/position of the boxes
            const shadow = this.body.attachShadow({ mode: "open" });

            // check which options should be shown to determine box width
            const showEditTextOption = _shouldShowEditTextOption(this.element);
            const showSelectParentOption = _shouldShowSelectParentOption(this.element);

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

                duplicate: `
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 3H4C3.44772 3 3 3.44772 3 4V18C3 18.5523 2.55228 19 2 19C1.44772 19 1 18.5523 1 18V4C1 2.34315 2.34315 1 4 1H18C18.5523 1 19 1.44772 19 2C19 2.55228 18.5523 3 18 3Z"/>
                  <path d="M13 11C13 10.4477 13.4477 10 14 10C14.5523 10 15 10.4477 15 11V13H17C17.5523 13 18 13.4477 18 14C18 14.5523 17.5523 15 17 15H15V17C15 17.5523 14.5523 18 14 18C13.4477 18 13 17.5523 13 17V15H11C10.4477 15 10 14.5523 10 14C10 13.4477 10.4477 13 11 13H13V11Z"/>
                  <path fill-rule="evenodd" clip-rule="evenodd" d="M20 5C21.6569 5 23 6.34315 23 8V20C23 21.6569 21.6569 23 20 23H8C6.34315 23 5 21.6569 5 20V8C5 6.34315 6.34315 5 8 5H20ZM20 7C20.5523 7 21 7.44772 21 8V20C21 20.5523 20.5523 21 20 21H8C7.44772 21 7 20.5523 7 20V8C7 7.44772 7.44772 7 8 7H20Z"/>
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
                content += `<span data-action="select-parent" title="${config.strings.selectParent}">
                    ${ICONS.arrowUp}
                </span>`;
            }

            // Only include edit text option if element supports it
            if (showEditTextOption) {
                content += `<span data-action="edit-text" title="${config.strings.editText}">
                    ${ICONS.edit}
                </span>`;
            }

            // Always include duplicate and delete options
            content += `<span data-action="duplicate" title="${config.strings.duplicate}">
                    ${ICONS.duplicate}
                </span>
                <span data-action="delete" title="${config.strings.delete}">
                    ${ICONS.trash}
                </span>
            </div>`;

            const styles = `
                .phoenix-more-options-box {
                    background-color: #4285F4;
                    color: white;
                    border-radius: 3px;
                    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
                    font-size: 12px;
                    font-family: Arial, sans-serif;
                    z-index: 2147483647;
                    position: absolute;
                    left: -1000px;
                    top: -1000px;
                    box-sizing: border-box;
                }

                .node-options {
                    display: flex;
                    align-items: center;
                }

                .node-options span {
                    padding: 4px 3.9px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    border-radius: 0;
                }

                .node-options span:first-child {
                    border-radius: 3px 0 0 3px;
                }

                .node-options span:last-child {
                    border-radius: 0 3px 3px 0;
                }

                .node-options span:hover {
                    background-color: rgba(255, 255, 255, 0.15);
                }

                .node-options span > svg {
                    width: 16px;
                    height: 16px;
                    display: block;
                }
            `;

            // add everything to the shadow box
            shadow.innerHTML = `<style>${styles}</style><div class="phoenix-more-options-box">${content}</div>`;
            this._shadow = shadow;
        },

        create: function() {
            this.remove(); // remove existing box if already present

            if(!config.isLPEditFeaturesActive) {
                return;
            }

            // this check because when there is no element visible to the user, we don't want to show the box
            // for ex: when user clicks on a 'x' button and the button is responsible to hide a panel
            // then clicking on that button shouldn't show the more options box
            // also covers cases where elements are inside closed/collapsed menus
            if(!isElementVisible(this.element)) {
                return;
            }

            this._style(); // style the box

            window.document.body.appendChild(this.body);

            // get the actual rendered dimensions of the box and then we reposition it to the actual place
            const boxElement = this._shadow.querySelector('.phoenix-more-options-box');
            if (boxElement) {
                const boxRect = boxElement.getBoundingClientRect();
                const pos = this._getBoxPosition(boxRect.width, boxRect.height);

                boxElement.style.left = pos.leftPos + 'px';
                boxElement.style.top = pos.topPos + 'px';
            }

            // add click handler to all the buttons
            const spans = this._shadow.querySelectorAll('.node-options span');
            spans.forEach(span => {
                span.addEventListener('click', (event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    // data-action is to differentiate between the buttons (duplicate, delete or select-parent)
                    const action = event.currentTarget.getAttribute('data-action');
                    handleOptionClick(event, action, this.element);
                    if (action !== 'duplicate') {
                        this.remove();
                    }
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
    function NodeInfoBox(element) {
        this.element = element;
        this.remove = this.remove.bind(this);
        this.create();
    }

    NodeInfoBox.prototype = {
        _checkOverlap: function(nodeInfoBoxPos, nodeInfoBoxDimensions) {
            if (_nodeMoreOptionsBox && _nodeMoreOptionsBox._shadow) {
                const moreOptionsBoxElement = _nodeMoreOptionsBox._shadow.querySelector('.phoenix-more-options-box');
                if (moreOptionsBoxElement) {
                    const moreOptionsBoxOffset = _screenOffset(moreOptionsBoxElement);
                    const moreOptionsBoxRect = moreOptionsBoxElement.getBoundingClientRect();

                    const infoBox = {
                        left: nodeInfoBoxPos.leftPos,
                        top: nodeInfoBoxPos.topPos,
                        right: nodeInfoBoxPos.leftPos + nodeInfoBoxDimensions.width,
                        bottom: nodeInfoBoxPos.topPos + nodeInfoBoxDimensions.height
                    };

                    const moreOptionsBox = {
                        left: moreOptionsBoxOffset.left,
                        top: moreOptionsBoxOffset.top,
                        right: moreOptionsBoxOffset.left + moreOptionsBoxRect.width,
                        bottom: moreOptionsBoxOffset.top + moreOptionsBoxRect.height
                    };

                    const isOverlapping = !(infoBox.right < moreOptionsBox.left ||
                             moreOptionsBox.right < infoBox.left ||
                             infoBox.bottom < moreOptionsBox.top ||
                             moreOptionsBox.bottom < infoBox.top);

                    return isOverlapping;
                }
            }
            return false;
        },

        _getBoxPosition: function(boxDimensions, overlap = false) {
            const elemBounds = this.element.getBoundingClientRect();
            const offset = _screenOffset(this.element);
            let topPos = 0;
            let leftPos = 0;

            if (overlap) {
                topPos = offset.top + 2;
                leftPos = offset.left + elemBounds.width + 6; // positioning at the right side

                // Check if overlap position would go off the right of the viewport
                if (leftPos + boxDimensions.width > window.innerWidth) {
                    leftPos = offset.left - boxDimensions.width - 6; // positioning at the left side

                    if (leftPos < 0) { // if left positioning not perfect, position at bottom
                        topPos = offset.top + elemBounds.height + 6;
                        leftPos = offset.left;

                        // if bottom position not perfect, move at top above the more options box
                        if (elemBounds.bottom + 6 + boxDimensions.height > window.innerHeight) {
                            topPos = offset.top - boxDimensions.height - 34; // 34 is for moreOptions box height
                            leftPos = offset.left;
                        }
                    }
                }
            } else {
                topPos = offset.top - boxDimensions.height - 6; // 6 for just some little space to breathe
                leftPos = offset.left;

                if (elemBounds.top - boxDimensions.height < 6) {
                    // check if placing the box below would cause viewport height increase
                    // we need this or else it might cause a flickering issue
                    // read this to know why flickering occurs:
                    // when we hover over the bottom part of a tall element, the info box appears below it.
                    // this increases the live preview height, which makes the cursor position relatively
                    // higher due to content shift. the cursor then moves out of the element boundary,
                    // ending the hover state. this makes the info box disappear, decreasing the height
                    // back, causing the cursor to fall back into the element, restarting the hover cycle.
                    // this creates a continuous flickering loop.
                    const bottomPosition = offset.top + elemBounds.height + 6;
                    const wouldIncreaseViewportHeight = bottomPosition + boxDimensions.height > window.innerHeight;

                    // we only need to use floating position during hover mode (not on click mode)
                    const isHoverMode = shouldShowHighlightOnHover();
                    const shouldUseFloatingPosition = wouldIncreaseViewportHeight && isHoverMode;

                    if (shouldUseFloatingPosition) {
                        // float over element at bottom-right to prevent layout shift during hover
                        topPos = offset.top + elemBounds.height - boxDimensions.height - 6;
                        leftPos = offset.left + elemBounds.width - boxDimensions.width;

                        // make sure it doesn't go off-screen
                        if (leftPos < 0) {
                            leftPos = offset.left; // align to left edge of element
                        }
                        if (topPos < 0) {
                            topPos = offset.top + 6; // for the top of element
                        }
                    } else {
                        topPos = bottomPosition;
                    }
                }

                // Check if the box would go off the right of the viewport
                if (leftPos + boxDimensions.width > window.innerWidth) {
                    leftPos = window.innerWidth - boxDimensions.width - 10;
                }
            }

            return {topPos: topPos, leftPos: leftPos};
        },

        _style: function() {
            this.body = window.document.createElement("div");

            // this is shadow DOM.
            // we need it because if we add the box directly to the DOM then users style might override it.
            // {mode: "open"} allows us to access the shadow DOM to get actual height/position of the boxes
            const shadow = this.body.attachShadow({ mode: "open" });

            // get the ID and classes for that element, as we need to display it in the box
            const id = this.element.id;
            const classes = this.element.className ? this.element.className.split(/\s+/).filter(Boolean) : [];

            let content = ""; // this will hold the main content that will be displayed
            content += "<div class='tag-name'>" + this.element.tagName.toLowerCase() + "</div>"; // add element tag name

            // Add ID if present
            if (id) {
                content += "<div class='id-name'>#" + id + "</div>";
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
            }

            // initially, we place our info box -1000px to the top but at the right left pos. this is done so that
            // we can take the text-wrapping inside the info box in account when calculating the height
            // after calculating the height of the box, we place it at the exact position above the element
            const offset = _screenOffset(this.element);
            const leftPos = offset.left;

            const styles = `
                .phoenix-node-info-box {
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
                    top: -1000px;
                    max-width: 300px;
                    box-sizing: border-box;
                    pointer-events: none;
                }

                .tag-name {
                    font-weight: bold;
                }

                .id-name,
                .class-name {
                    margin-top: 2px;
                }

                .exceeded-classes {
                    opacity: 0.8;
                }
            `;

            // add everything to the shadow box
            shadow.innerHTML = `<style>${styles}</style><div class="phoenix-node-info-box">${content}</div>`;
            this._shadow = shadow;
        },

        create: function() {
            this.remove(); // remove existing box if already present

            if(!config.isLPEditFeaturesActive) {
                return;
            }

            // this check because when there is no element visible to the user, we don't want to show the box
            // for ex: when user clicks on a 'x' button and the button is responsible to hide a panel
            // then clicking on that button shouldn't show the more options box
            // also covers cases where elements are inside closed/collapsed menus
            if(!isElementVisible(this.element)) {
                return;
            }

            this._style(); // style the box

            window.document.body.appendChild(this.body);

            // get the actual rendered height of the box and then we reposition it to the actual place
            const boxElement = this._shadow.querySelector('.phoenix-node-info-box');
            if (boxElement) {
                const nodeInfoBoxDimensions = {
                    height: boxElement.getBoundingClientRect().height,
                    width: boxElement.getBoundingClientRect().width
                };
                const nodeInfoBoxPos = this._getBoxPosition(nodeInfoBoxDimensions, false);

                boxElement.style.left = nodeInfoBoxPos.leftPos + 'px';
                boxElement.style.top = nodeInfoBoxPos.topPos + 'px';

                const isBoxOverlapping = this._checkOverlap(nodeInfoBoxPos, nodeInfoBoxDimensions);
                if(isBoxOverlapping) {
                    const newPos = this._getBoxPosition(nodeInfoBoxDimensions, true);
                    boxElement.style.left = newPos.leftPos + 'px';
                    boxElement.style.top = newPos.topPos + 'px';
                }
            }
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

        // shouldAutoScroll is whether to scroll page to element if not in view
        // true when user clicks on the source code of some element, in that case we want to scroll the live preview
        add: function (element, doAnimation, shouldAutoScroll) {
            if (this._elementExists(element) || element === window.document) {
                return;
            }
            if (this.trigger) {
                _trigger(element, "highlight", 1);
            }

            if (shouldAutoScroll && (!window.event || window.event instanceof MessageEvent) && !isInViewport(element)) {
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
                this.add(highlighted[i], false, false); // 3rd arg is for auto-scroll
            }
        }
    };

    var _localHighlight;
    var _hoverHighlight;
    var _clickHighlight;
    var _nodeInfoBox;
    var _nodeMoreOptionsBox;
    var _setup = false;


    /** Event Handlers ***********************************************************/

    function onMouseOver(event) {
        if (_validEvent(event)) {
            // Skip highlighting for HTML, BODY tags and elements inside HEAD
            if (event.target && event.target.nodeType === Node.ELEMENT_NODE &&
                event.target.tagName !== "HTML" && event.target.tagName !== "BODY" && !_isInsideHeadTag(event.target)) {
                _localHighlight.add(event.target, true, false); // false means no-auto scroll
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

    // helper function to get the current elements highlight mode
    // this is as per user settings (either click or hover)
    function getHighlightMode() {
        return config.elemHighlights ? config.elemHighlights.toLowerCase() : "hover";
    }

    // helper function to check if highlights should show on hover
    function shouldShowHighlightOnHover() {
        return getHighlightMode() !== "click";
    }

    // helper function to clear element background highlighting
    function clearElementBackground(element) {
        if (element._originalBackgroundColor !== undefined) {
            element.style.backgroundColor = element._originalBackgroundColor;
        } else {
            element.style.backgroundColor = "";
        }
        delete element._originalBackgroundColor;
    }

    function onElementHover(event) {
        // don't want highlighting and stuff when auto scrolling
        if (_isAutoScrolling) {
            return;
        }

        // this is to check the user's settings, if they want to show the elements highlights on hover or click
        if (_hoverHighlight && config.isLPEditFeaturesActive && shouldShowHighlightOnHover()) {
            _hoverHighlight.clear();

            // Skip highlighting for HTML, BODY tags and elements inside HEAD
            // and for DOM elements which doesn't have 'data-brackets-id'
            // NOTE: Don't remove 'data-brackets-id' check else hover will also target internal live preview elements
            if (
                event.target &&
                event.target.nodeType === Node.ELEMENT_NODE &&
                event.target.tagName !== "HTML" &&
                event.target.tagName !== "BODY" &&
                !_isInsideHeadTag(event.target) &&
                event.target.hasAttribute("data-brackets-id")
            ) {
                // Store original background color to restore on hover out
                event.target._originalBackgroundColor = event.target.style.backgroundColor;
                event.target.style.backgroundColor = "rgba(0, 162, 255, 0.2)";

                _hoverHighlight.add(event.target, false, false); // false means no auto-scroll

                // Create info box for the hovered element
                if (_nodeInfoBox) {
                    _nodeInfoBox.remove();
                }
                _nodeInfoBox = new NodeInfoBox(event.target);
            }
        }
    }

    function onElementHoverOut(event) {
        // don't want highlighting and stuff when auto scrolling
        if (_isAutoScrolling) {
            return;
        }

        // this is to check the user's settings, if they want to show the elements highlights on hover or click
        if (_hoverHighlight && config.isLPEditFeaturesActive && shouldShowHighlightOnHover()) {
            _hoverHighlight.clear();

            // Restore original background color
            if (
                event &&
                event.target &&
                event.target.nodeType === Node.ELEMENT_NODE &&
                event.target.hasAttribute("data-brackets-id")
            ) {
                clearElementBackground(event.target);
            }

            // Remove info box when mouse leaves the element
            if (_nodeInfoBox) {
                _nodeInfoBox.remove();
                _nodeInfoBox = null;
            }
        }
    }

    /**
     * this function is responsible to select an element in the live preview
     * @param {Element} element - The DOM element to select
     */
    function _selectElement(element) {
        // make sure that the feature is enabled and also the element has the attribute 'data-brackets-id'
        if (
            !config.isLPEditFeaturesActive ||
            !element.hasAttribute("data-brackets-id") ||
            element.tagName === "BODY" ||
            element.tagName === "HTML" ||
            _isInsideHeadTag(element)
        ) {
            return;
        }

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

            // Remove highlighting from previously clicked element
            if (getHighlightMode() === "click") {
                clearElementBackground(previouslyClickedElement);
            }
        }

        // make sure that the element is actually visible to the user
        if (isElementVisible(element)) {
            _nodeMoreOptionsBox = new NodeMoreOptionsBox(element);

            // show the info box when a DOM element is selected
            if (_nodeInfoBox) {
                _nodeInfoBox.remove();
            }
            _nodeInfoBox = new NodeInfoBox(element);
        } else {
            // Element is hidden, so don't show UI boxes but still apply visual styling
            _nodeMoreOptionsBox = null;

            // Remove any existing info box since the element is not visible
            if (_nodeInfoBox) {
                _nodeInfoBox.remove();
                _nodeInfoBox = null;
            }
        }

        element._originalOutline = element.style.outline;
        element.style.outline = "1px solid #4285F4";

        // Add highlight for click mode
        if (getHighlightMode() === "click") {
            element._originalBackgroundColor = element.style.backgroundColor;
            element.style.backgroundColor = "rgba(0, 162, 255, 0.2)";

            if (_hoverHighlight) {
                _hoverHighlight.clear();
                _hoverHighlight.add(element, true, false); // false means no auto-scroll
            }
        }

        previouslyClickedElement = element;
    }

    /**
     * This function handles the click event on the live preview DOM element
     * it is to show the advanced DOM manipulation options in the live preview
     * @param {Event} event
     */
    function onClick(event) {
        // make sure that the feature is enabled and also the clicked element has the attribute 'data-brackets-id'
        if (
            config.isLPEditFeaturesActive &&
            event.target.hasAttribute("data-brackets-id") &&
            event.target.tagName !== "BODY" &&
            event.target.tagName !== "HTML" &&
            !_isInsideHeadTag(event.target)
        ) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            _selectElement(event.target);
        } else if ( // when user clicks on the HTML, BODY tags or elements inside HEAD, we want to remove the boxes
            _nodeMoreOptionsBox &&
            (event.target.tagName === "HTML" || event.target.tagName === "BODY" || _isInsideHeadTag(event.target))
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
            config.isLPEditFeaturesActive &&
            event.target.hasAttribute("data-brackets-id") &&
            event.target.tagName !== "BODY" &&
            event.target.tagName !== "HTML" &&
            !_isInsideHeadTag(event.target)
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


    // remove active highlights
    function hideHighlight() {
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
        // Skip highlighting for HTML, BODY tags and elements inside HEAD
        if (node && node.nodeType === Node.ELEMENT_NODE &&
            node.tagName !== "HTML" && node.tagName !== "BODY" && !_isInsideHeadTag(node)) {
            _clickHighlight.add(node, true, true); // 3rd arg is for auto-scroll
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

        // select the first valid highlighted element
        var foundValidElement = false;
        for (i = 0; i < nodes.length; i++) {
            if (nodes[i].hasAttribute("data-brackets-id") &&
                nodes[i].tagName !== "HTML" &&
                nodes[i].tagName !== "BODY" &&
                !_isInsideHeadTag(nodes[i]) &&
                nodes[i].tagName !== "BR"
            ) {
                _selectElement(nodes[i]);
                foundValidElement = true;
                break;
            }
        }

        // if no valid element present we dismiss the boxes
        if (!foundValidElement) {
            dismissMoreOptionsBox();
        }
    }

    // recreate UI boxes (info box and more options box)
    function redrawUIBoxes() {
        if (_nodeMoreOptionsBox) {
            const element = _nodeMoreOptionsBox.element;
            _nodeMoreOptionsBox.remove();
            _nodeMoreOptionsBox = new NodeMoreOptionsBox(element);

            if (_nodeInfoBox) {
                _nodeInfoBox.remove();
                _nodeInfoBox = new NodeInfoBox(element);
            }
        }
    }

    // redraw active highlights
    function redrawHighlights() {
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

    // Helper function to dismiss boxes only for elements that don't move with scroll
    // this is needed for fixed positioned elements because otherwise the boxes will move along with scroll,
    // but the element stays at position which will lead to drift between the element & boxes
    function _dismissBoxesForFixedElements() {
        // first we try more options box, because its position is generally fixed even in overlapping cases
        if (_nodeMoreOptionsBox && _nodeMoreOptionsBox.element) {
            const moreOptionsBoxElement = _nodeMoreOptionsBox._shadow.querySelector('.phoenix-more-options-box');
            if(moreOptionsBoxElement) {

                // get the position of both the moreOptionsBox as well as the element
                const moreOptionsBoxBounds = moreOptionsBoxElement.getBoundingClientRect();
                const elementBounds = _nodeMoreOptionsBox.element.getBoundingClientRect();

                // this is to store the prev value, so that we can compare it the second time
                if(!_nodeMoreOptionsBox._possDifference) {
                    _nodeMoreOptionsBox._possDifference = moreOptionsBoxBounds.top - elementBounds.top;
                } else {
                    const calcNewDifference = moreOptionsBoxBounds.top - elementBounds.top;
                    const prevDifference = _nodeMoreOptionsBox._possDifference;

                    // 4 is just for pixelated differences
                    if (Math.abs(calcNewDifference - prevDifference) > 4) {
                        dismissMoreOptionsBox();
                    }
                }
            }
        } else if (_nodeInfoBox && _nodeInfoBox.element) {
            // if more options box didn't exist, we check with info box (logic is same)
            const infoBoxElement = _nodeInfoBox._shadow.querySelector('.phoenix-node-info-box');
            if (infoBoxElement) {
                // here just we make sure that the element is same
                if(!_nodeInfoBox._prevElement) {
                    _nodeInfoBox._prevElement = _nodeInfoBox.element;
                } else if(_nodeInfoBox._prevElement !== _nodeInfoBox.element) {
                    return;
                } else {
                    const infoBoxBounds = infoBoxElement.getBoundingClientRect();
                    const elementBounds = _nodeInfoBox.element.getBoundingClientRect();

                    if(!_nodeInfoBox._possDifference) {
                        _nodeInfoBox._possDifference = infoBoxBounds.top - elementBounds.top;
                    } else {
                        const calcNewDifference = infoBoxBounds.top - elementBounds.top;
                        const prevDifference = _nodeInfoBox._possDifference;

                        if (Math.abs(calcNewDifference - prevDifference) > 4) {
                            dismissMoreOptionsBox();
                        }
                    }
                }
            }
        }
    }

    function _scrollHandler(e) {
        // Document scrolls can be updated immediately. Any other scrolls
        // need to be updated on a timer to ensure the layout is correct.
        if (e.target === window.document) {
            redrawHighlights();
            // need to dismiss the box if the elements are fixed, otherwise they drift at times
            _dismissBoxesForFixedElements();
        } else {
            if (_localHighlight || _clickHighlight || _hoverHighlight) {
                window.setTimeout(redrawHighlights, 0);
            }
            _dismissBoxesForFixedElements();
        }
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

    function updateConfig(newConfig) {
        var oldConfig = config;
        config = JSON.parse(newConfig);

        if (config.highlight || (config.isLPEditFeaturesActive && shouldShowHighlightOnHover())) {
            // Add hover event listeners if highlight is enabled OR editHighlights is set to hover
            window.document.removeEventListener("mouseover", onElementHover);
            window.document.removeEventListener("mouseout", onElementHoverOut);
            window.document.addEventListener("mouseover", onElementHover);
            window.document.addEventListener("mouseout", onElementHoverOut);
        } else {
            // Remove hover event listeners only if both highlight is disabled AND editHighlights is not set to hover
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

        // Handle element highlight mode changes for instant switching
        const oldHighlightMode = oldConfig.elemHighlights ? oldConfig.elemHighlights.toLowerCase() : "hover";
        const newHighlightMode = getHighlightMode();

        if (oldHighlightMode !== newHighlightMode) {
            // Clear any existing highlights when mode changes
            if (_hoverHighlight) {
                _hoverHighlight.clear();
            }

            // Clean up any previously highlighted elements
            if (previouslyClickedElement) {
                clearElementBackground(previouslyClickedElement);
            }

            // Clear all elements that might have hover background styling applied
            const allElements = window.document.querySelectorAll("[data-brackets-id]");
            for (let i = 0; i < allElements.length; i++) {
                if (allElements[i]._originalBackgroundColor !== undefined) {
                    clearElementBackground(allElements[i]);
                }
            }

            // Remove info box when switching modes to avoid confusion
            if (_nodeInfoBox && !_nodeMoreOptionsBox) {
                _nodeInfoBox.remove();
                _nodeInfoBox = null;
            }

            // Re-setup event listeners based on new mode to ensure proper behavior
            if (config.highlight && config.isLPEditFeaturesActive) {
                window.document.removeEventListener("mouseover", onElementHover);
                window.document.removeEventListener("mouseout", onElementHoverOut);
                window.document.addEventListener("mouseover", onElementHover);
                window.document.addEventListener("mouseout", onElementHoverOut);
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

            // Clear click-mode highlighting
            if (getHighlightMode() === "click") {
                clearElementBackground(previouslyClickedElement);

                if (_hoverHighlight) {
                    _hoverHighlight.clear();
                }
            }

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
        if (!config.isLPEditFeaturesActive
            || !element
            || element.tagName === "BODY"
            || element.tagName === "HTML"
            || _isInsideHeadTag(element)
            || !element.hasAttribute("data-brackets-id")) {
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

        function onBlur() {
            finishEditing(element);
        }

        function onKeyDown(event) {
            if (event.key === "Escape") {
                // Cancel editing
                event.preventDefault();
                finishEditing(element, false); // false means that the edit operation was cancelled
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

    // Function to finish editing and apply changes
    // isEditSuccessful: this is a boolean value, defaults to true. false only when the edit operation is cancelled
    function finishEditing(element, isEditSuccessful = true) {
        if (!config.isLPEditFeaturesActive || !element || !element.hasAttribute("contenteditable")) {
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

        if (element.hasAttribute("data-brackets-id")) {
            const tagId = element.getAttribute("data-brackets-id");
            window._Brackets_MessageBroker.send({
                livePreviewEditEnabled: true,
                livePreviewTextEdit: true,
                element: element,
                newContent: element.outerHTML,
                tagId: Number(tagId),
                isEditSuccessful: isEditSuccessful
            });
        }
    }

    // init
    _editHandler = new DOMEditHandler(window.document);

    function registerHandlers() {
        if (config.isLPEditFeaturesActive) {
            // Initialize hover highlight with Chrome-like colors
            _hoverHighlight = new Highlight("#c8f9c5", true); // Green similar to Chrome's padding color

            // Initialize click highlight with animation
            _clickHighlight = new Highlight("#cfc", true); // Light green for click highlight

            window.document.addEventListener("mouseover", onElementHover);
            window.document.addEventListener("mouseout", onElementHoverOut);
            window.document.addEventListener("click", onClick);
            window.document.addEventListener("dblclick", onDoubleClick);
            window.document.addEventListener("dragover", onDragOver);
            window.document.addEventListener("drop", onDrop);
            window.document.addEventListener("dragleave", onDragLeave);
            window.document.addEventListener("keydown", onKeyDown);
        }
    }

    registerHandlers();

    return {
        "DOMEditHandler"        : DOMEditHandler,
        "hideHighlight"         : hideHighlight,
        "highlight"             : highlight,
        "highlightRule"         : highlightRule,
        "redrawHighlights"      : redrawHighlights,
        "redrawEverything"      : redrawEverything,
        "applyDOMEdits"         : applyDOMEdits,
        "updateConfig"          : updateConfig,
        "startEditing"          : startEditing,
        "finishEditing"         : finishEditing,
        "dismissMoreOptionsBox" : dismissMoreOptionsBox,
        "hasVisibleLivePreviewBoxes" : hasVisibleLivePreviewBoxes,
        "registerHandlers" : registerHandlers
    };
}
