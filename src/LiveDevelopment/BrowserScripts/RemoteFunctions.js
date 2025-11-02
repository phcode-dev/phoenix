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
function RemoteFunctions(config = {}) {
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

    // to track the state as we want to have a selected state for image gallery
    let imageGallerySelected = false;

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

    /**
     * This is a checker function for editable elements, it makes sure that the element satisfies all the required checks
     * - When onlyHighlight is false → config.isProUser must be true
     * - When onlyHighlight is true → config.isProUser can be true or false (doesn't matter)
     * @param {DOMElement} element
     * @param {boolean} [onlyHighlight=false] - If true, bypasses the isProUser check
     * @returns {boolean} - True if the element is editable else false
     */
    function isElementEditable(element, onlyHighlight = false) {
        if(!config.isProUser && !onlyHighlight) {
            return false;
        }

        if(element && // element should exist
           element.hasAttribute("data-brackets-id") && // should have the data-brackets-id attribute
           element.tagName.toLowerCase() !== "body" && // shouldn't be the body tag
           element.tagName.toLowerCase() !== "html" && // shouldn't be the HTML tag
           !_isInsideHeadTag(element)) { // shouldn't be inside the head tag like meta tags and all
            return true;
        }
        return false;
    }

    // helper function to check if an element is inside the HEAD tag
    // we need this because we don't wanna trigger the element highlights on head tag and its children,
    // except for <style> tags which should be allowed
    function _isInsideHeadTag(element) {
        let parent = element;
        while (parent && parent !== window.document) {
            if (parent.tagName.toLowerCase() === "head") {
                // allow <style> tags inside <head>
                return element.tagName.toLowerCase() !== "style";
            }
            parent = parent.parentElement;
        }
        return false;
    }

    // helper function to check if an element is inside an SVG tag
    // we need this because SVG elements don't support contenteditable
    function _isInsideSVGTag(element) {
        let parent = element;
        while (parent && parent !== window.document) {
            if (parent.tagName.toLowerCase() === "svg") {
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
            rect.bottom <= (window.innerHeight || html.clientHeight)
        );
    }

    /**
     * this function checks whether the image gallery overlaps the image element
     * because if it does we scroll the image element a bit above so that users can see the whole image clearly
     * @param {DOMElement} element - the image element
     * @param {DOMElement} imageGalleryElement - the image gallery container
     */
    function scrollImageToViewportIfRequired(element, imageGalleryElement) {
        let elementRect = element.getBoundingClientRect();
        let galleryRect = imageGalleryElement._shadow.querySelector('.phoenix-image-gallery-container').getBoundingClientRect();

        // this will get true when the image element and the image gallery overlaps each other
        if (elementRect.bottom >= galleryRect.top) {
            const scrollValue = window.scrollY + (elementRect.bottom - galleryRect.top) + 10;
            window.scrollTo(0, scrollValue);
        }
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
     * This function gets called when the AI button is clicked
     * it shows a AI prompt box to the user
     * @param {Event} event
     * @param {DOMElement} element - the HTML DOM element that was clicked
     */
    function _handleAIOptionClick(event, element) {
        // make sure there is no existing AI prompt box, and no other box as well
        dismissAllUIBoxes();
        _aiPromptBox = new AIPromptBox(element); // create a new one
    }

    /**
     * This function gets called when the image gallery button is clicked
     * it shows the image ribbon gallery at the bottom of the live preview
     * @param {Event} event
     * @param {DOMElement} element - the HTML DOM element that was clicked (should be an image)
     */
    function _handleImageGalleryOptionClick(event, element) {
        dismissImageRibbonGallery();

        if (imageGallerySelected) {
            imageGallerySelected = false;
        } else {
            imageGallerySelected = true;
            _imageRibbonGallery = new ImageRibbonGallery(element);
            scrollImageToViewportIfRequired(element, _imageRibbonGallery);
        }
    }

    /**
     * This function gets called when the delete button is clicked
     * it sends a message to the editor using postMessage to delete the element from the source code
     * @param {Event} event
     * @param {DOMElement} element - the HTML DOM element that was clicked. it is to get the data-brackets-id attribute
     */
    function _handleDeleteOptionClick(event, element) {
        if (isElementEditable(element)) {
            const tagId = element.getAttribute("data-brackets-id");

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
        if (isElementEditable(element)) {
            const tagId = element.getAttribute("data-brackets-id");

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
        if (!isElementEditable(element)) {
            return;
        }

        const parentElement = element.parentElement;
        if (isElementEditable(parentElement)) {
            // Check if parent element has .click() method (HTML elements)
            // SVG elements don't have .click() method, so we use _selectElement for them
            if (typeof parentElement.click === 'function') {
                parentElement.click();
            } else {
                activateHoverLock();
                _selectElement(parentElement);
            }
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
        } else if (action === "ai") {
            _handleAIOptionClick(e, element);
        } else if (action === "image-gallery") {
            _handleImageGalleryOptionClick(e, element);
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
    let DROP_MARKER_ARROW_CLASSNAME = "__brackets-drop-marker-arrow";

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

        if (element._originalDragBackgroundColor === undefined) {
            element._originalDragBackgroundColor = element.style.backgroundColor;
        }
        element.style.backgroundColor = "rgba(66, 133, 244, 0.22)";

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
        marker.style.zIndex = "2147483647";
        marker.style.borderRadius = "2px";
        marker.style.pointerEvents = "none";

        // for the arrow indicator
        let arrow = window.document.createElement("div");
        arrow.className = DROP_MARKER_ARROW_CLASSNAME;
        arrow.style.position = "fixed";
        arrow.style.zIndex = "2147483648";
        arrow.style.pointerEvents = "none";
        arrow.style.fontWeight = "bold";
        arrow.style.color = "#4285F4";

        if (dropZone === "inside") {
            // inside marker - outline around the element
            marker.style.border = "2px dashed #4285F4";
            marker.style.backgroundColor = "rgba(66, 133, 244, 0.05)";
            marker.style.left = rect.left + "px";
            marker.style.top = rect.top + "px";
            marker.style.width = rect.width + "px";
            marker.style.height = rect.height + "px";

            // exclusive or symbol (plus inside circle) we use when dropping inside
            arrow.style.fontSize = "16px";
            arrow.innerHTML = "⊕";
            arrow.style.left = (rect.left + rect.width / 2) + "px";
            arrow.style.top = (rect.top + rect.height / 2) + "px";
            arrow.style.transform = "translate(-50%, -50%)";
        } else {
            // Before/After markers - lines
            marker.style.background = "linear-gradient(90deg, #4285F4, #1976D2)";
            marker.style.boxShadow = "0 0 8px rgba(66, 133, 244, 0.5)";

            arrow.style.fontSize = "22px";
            if (indicatorType === "vertical") {
                // Vertical marker (for flex row containers)
                marker.style.width = "3px";
                marker.style.height = rect.height + "px";
                marker.style.top = rect.top + "px";
                arrow.style.top = (rect.top + rect.height / 2) + "px";

                if (dropZone === "after") {
                    marker.style.left = rect.right + 3 + "px";
                    // Right arrow
                    arrow.innerHTML = "→";
                    arrow.style.left = (rect.right + 5) + "px";
                    arrow.style.transform = "translateY(-50%)";
                } else {
                    marker.style.left = rect.left - 5 + "px";
                    // Left arrow
                    arrow.innerHTML = "←";
                    arrow.style.left = (rect.left - 15) + "px";
                    arrow.style.transform = "translate(-50%, -50%)";
                }
            } else {
                // Horizontal marker (for block/grid containers)
                marker.style.width = rect.width + "px";
                marker.style.height = "3px";
                marker.style.left = rect.left + "px";
                arrow.style.left = (rect.left + rect.width / 2) + "px";

                if (dropZone === "after") {
                    marker.style.top = rect.bottom + 3 + "px";
                    // Down arrow
                    arrow.innerHTML = "↓";
                    arrow.style.top = rect.bottom + "px";
                    arrow.style.transform = "translateX(-50%)";
                } else {
                    marker.style.top = rect.top - 5 + "px";
                    // Up arrow
                    arrow.innerHTML = "↑";
                    arrow.style.top = (rect.top - 15) + "px";
                    arrow.style.transform = "translate(-50%, -50%)";
                }
            }
        }

        element._dropMarker = marker; // we need this in the _removeDropMarkerFromElement function
        element._dropArrow = arrow; // store arrow reference too
        window.document.body.appendChild(marker);
        window.document.body.appendChild(arrow);
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
        if (element._dropArrow && element._dropArrow.parentNode) {
            element._dropArrow.parentNode.removeChild(element._dropArrow);
            delete element._dropArrow;
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
        let arrows = window.document.querySelectorAll("." + DROP_MARKER_ARROW_CLASSNAME);

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

        for (let i = 0; i < arrows.length; i++) {
            if (arrows[i].parentNode) {
                arrows[i].parentNode.removeChild(arrows[i]);
            }
        }

        // Also clear any element references
        let elements = window.document.querySelectorAll("[data-brackets-id]");
        for (let j = 0; j < elements.length; j++) {
            delete elements[j]._dropMarker;
            delete elements[j]._dropArrow;
            // only restore the styles that were modified by drag operations
            if (elements[j]._originalDragBackgroundColor !== undefined) {
                elements[j].style.backgroundColor = elements[j]._originalDragBackgroundColor;
                delete elements[j]._originalDragBackgroundColor;
            }
            if (elements[j]._originalDragTransform !== undefined) {
                elements[j].style.transform = elements[j]._originalDragTransform;
                delete elements[j]._originalDragTransform;
            }
            if (elements[j]._originalDragTransition !== undefined) {
                elements[j].style.transition = elements[j]._originalDragTransition;
                delete elements[j]._originalDragTransition;
            }
        }
    }

    /**
     * this function is for finding the best target element on where to drop the dragged element
     * for ex: div > image...here both the div and image are of the exact same size, then when user is dragging some
     * other element, then almost everytime they want to drop it before/after the div and not like div>newEle+img
     * @param {Element} target - The current target element
     * @returns {Element|null} - The outermost parent with all edges aligned, or null
     */
    function _findBestParentTarget(target) {
        if (!target) {
            return null;
        }

        const tolerance = 1; // 1px is considered same
        let bestParent = null;
        let currentElement = target;
        let parent = currentElement.parentElement;

        while (parent) {
            if (parent.hasAttribute("data-brackets-id") && isElementEditable(parent)) {
                const currentRect = currentElement.getBoundingClientRect();
                const parentRect = parent.getBoundingClientRect();

                // check if all the edges are same
                const topAligned = Math.abs(currentRect.top - parentRect.top) <= tolerance;
                const bottomAligned = Math.abs(currentRect.bottom - parentRect.bottom) <= tolerance;
                const leftAligned = Math.abs(currentRect.left - parentRect.left) <= tolerance;
                const rightAligned = Math.abs(currentRect.right - parentRect.right) <= tolerance;

                if (topAligned && bottomAligned && leftAligned && rightAligned) {
                    // all edges match, we prefer the parent element
                    bestParent = parent;
                    currentElement = parent;
                } else {
                    break;
                }
            }
            parent = parent.parentElement;
        }

        return bestParent;
    }

    /**
     * Find the nearest valid drop target when direct elementFromPoint fails
     * @param {number} clientX - x coordinate
     * @param {number} clientY - y coordinate
     * @returns {Element|null} - nearest valid target or null
     */
    function _findNearestValidTarget(clientX, clientY) {
        const searchRadius = 500;
        const step = 10; // pixel step for search

        // Search in expanding squares around the cursor position
        for (let radius = step; radius <= searchRadius; radius += step) {
            // Check points in a square pattern around the cursor
            const points = [
                [clientX + radius, clientY],
                [clientX - radius, clientY],
                [clientX, clientY + radius],
                [clientX, clientY - radius],
                [clientX + radius, clientY + radius],
                [clientX - radius, clientY - radius],
                [clientX + radius, clientY - radius],
                [clientX - radius, clientY + radius]
            ];

            for (let point of points) {
                const [x, y] = point;
                let target = document.elementFromPoint(x, y);

                if (!target || target === window._currentDraggedElement) {
                    continue;
                }

                // Find closest element with data-brackets-id
                while (target && !target.hasAttribute("data-brackets-id")) {
                    target = target.parentElement;
                }

                // Check if target is valid (not BODY, HTML or inside HEAD)
                if (isElementEditable(target) && target !== window._currentDraggedElement) {
                    return target;
                }
            }
        }
        return null;
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

        if (!isElementEditable(target) || target === window._currentDraggedElement) {
            // if direct detection fails, we try to find a nearby valid target
            target = _findNearestValidTarget(event.clientX, event.clientY);
            if (!target) {
                return;
            }
        }

        // Check if we should prefer a parent when all edges are aligned
        const bestParent = _findBestParentTarget(target);
        if (bestParent) {
            target = bestParent;
        }

        // Store original styles before modifying them
        if (target._originalDragBackgroundColor === undefined) {
            target._originalDragBackgroundColor = target.style.backgroundColor;
        }
        if (target._originalDragTransition === undefined) {
            target._originalDragTransition = target.style.transition;
        }

        // Add subtle hover effect to target element
        target.style.backgroundColor = "rgba(66, 133, 244, 0.22)";
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

        if (!isElementEditable(target) || target === window._currentDraggedElement) {
            // if direct detection fails, we try to find a nearby valid target
            target = _findNearestValidTarget(event.clientX, event.clientY);
        }

        // skip if no valid target found or if it's the dragged element
        if (!isElementEditable(target) || target === window._currentDraggedElement) {
            _clearDropMarkers();
            _stopAutoScroll();
            _dragEndChores(window._currentDraggedElement);
            dismissUIAndCleanupState();
            delete window._currentDraggedElement;
            return;
        }

        // Check if we should prefer a parent when all edges are aligned
        const bestParent = _findBestParentTarget(target);
        if (bestParent) {
            target = bestParent;
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
        dismissUIAndCleanupState();
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

        if (voidElements.includes(tagName) || nonEditableElements.includes(tagName) || _isInsideSVGTag(element)) {
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
        if(!isElementEditable(element)) {
            return false;
        }

        const parentElement = element.parentElement;
        if(!isElementEditable(parentElement)) {
            return false;
        }
        return true;
    }

    // the icons used in the live preview edit mode features
    const ICONS = {
        ai: `
        <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="100" height="100" viewBox="0,0,256,256">
            <g fill="#fffbfb" fill-rule="nonzero" stroke="none" stroke-width="1" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="10" stroke-dasharray="" stroke-dashoffset="0" font-family="none" font-weight="none" font-size="none" text-anchor="none" style="mix-blend-mode: normal"><g transform="scale(4,4)"><path d="M30.701,41.663l-2.246,5.145c-0.864,1.978 -3.6,1.978 -4.464,0l-2.247,-5.145c-1.999,-4.579 -5.598,-8.224 -10.086,-10.216l-6.183,-2.745c-1.966,-0.873 -1.966,-3.733 0,-4.605l5.99,-2.659c4.604,-2.044 8.267,-5.824 10.232,-10.559l2.276,-5.483c0.844,-2.035 3.656,-2.035 4.5,0l2.276,5.483c1.965,4.735 5.628,8.515 10.232,10.559l5.99,2.659c1.966,0.873 1.966,3.733 0,4.605l-6.183,2.745c-4.489,1.992 -8.088,5.637 -10.087,10.216z"></path><path d="M30.701,41.663l-2.246,5.145c-0.864,1.978 -3.6,1.978 -4.464,0l-2.247,-5.145c-1.999,-4.579 -5.598,-8.224 -10.086,-10.216l-6.183,-2.745c-1.966,-0.873 -1.966,-3.733 0,-4.605l5.99,-2.659c4.604,-2.044 8.267,-5.824 10.232,-10.559l2.276,-5.483c0.844,-2.035 3.656,-2.035 4.5,0l2.276,5.483c1.965,4.735 5.628,8.515 10.232,10.559l5.99,2.659c1.966,0.873 1.966,3.733 0,4.605l-6.183,2.745c-4.489,1.992 -8.088,5.637 -10.087,10.216z"></path><g><path d="M51.578,57.887l-0.632,1.448c-0.462,1.06 -1.93,1.06 -2.393,0l-0.632,-1.448c-1.126,-2.582 -3.155,-4.637 -5.686,-5.762l-1.946,-0.865c-1.052,-0.468 -1.052,-1.998 0,-2.465l1.838,-0.816c2.596,-1.153 4.661,-3.285 5.768,-5.955l0.649,-1.565c0.452,-1.091 1.96,-1.091 2.412,0l0.649,1.565c1.107,2.669 3.172,4.801 5.768,5.955l1.837,0.816c1.053,0.468 1.053,1.998 0,2.465l-1.946,0.865c-2.531,1.125 -4.56,3.18 -5.686,5.762z"></path><path d="M51.578,57.887l-0.632,1.448c-0.462,1.06 -1.93,1.06 -2.393,0l-0.632,-1.448c-1.126,-2.582 -3.155,-4.637 -5.686,-5.762l-1.946,-0.865c-1.052,-0.468 -1.052,-1.998 0,-2.465l1.838,-0.816c2.596,-1.153 4.661,-3.285 5.768,-5.955l0.649,-1.565c0.452,-1.091 1.96,-1.091 2.412,0l0.649,1.565c1.107,2.669 3.172,4.801 5.768,5.955l1.837,0.816c1.053,0.468 1.053,1.998 0,2.465l-1.946,0.865c-2.531,1.125 -4.56,3.18 -5.686,5.762z"></path></g></g></g>
        </svg>
        `,

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
      `,

        imageGallery: `
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
          <path d="M1 3v16h2V5h16V3H1z"/>
        </svg>
      `,

        selectImageFromComputer: `
        <svg viewBox="0 0 24 24" fill="currentColor" width="19" height="19">
          <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/>
        </svg>
      `,

        downloadImage: `
        <svg viewBox="0 0 640 640" fill="currentColor">
          <path d="M352 96C352 78.3 337.7 64 320 64C302.3 64 288 78.3 288 96L288 306.7L246.6 265.3C234.1 252.8 213.8 252.8 201.3 265.3C188.8 277.8 188.8 298.1 201.3 310.6L297.3 406.6C309.8 419.1 330.1 419.1 342.6 406.6L438.6 310.6C451.1 298.1 451.1 277.8 438.6 265.3C426.1 252.8 405.8 252.8 393.3 265.3L352 306.7L352 96zM160 384C124.7 384 96 412.7 96 448L96 480C96 515.3 124.7 544 160 544L480 544C515.3 544 544 515.3 544 480L544 448C544 412.7 515.3 384 480 384L433.1 384L376.5 440.6C345.3 471.8 294.6 471.8 263.4 440.6L206.9 384L160 384zM464 440C477.3 440 488 450.7 488 464C488 477.3 477.3 488 464 488C450.7 488 440 477.3 440 464C440 450.7 450.7 440 464 440z"/>
        </svg>
      `,

        folderSettings: `
        <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17">
          <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h8.1c.15.7.42 1.36.81 1.94l.29.41H4c-1.66 0-3-1.34-3-3V6c0-1.66 1.34-3 3-3h6l2 2h8c1.66 0 3 1.34 3 3v4.18c-.63-.11-1.28-.18-1.95-.18-.68 0-1.35.07-2 .2V8c0-1.1-.9-2-2-2h-8l-2-2zM18 13a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2c.55 0 1 .45 1 1v1h1c.55 0 1 .45 1 1s-.45 1-1 1h-1v1c0 .55-.45 1-1 1s-1-.45-1-1v-1h-1c-.55 0-1-.45-1-1s.45-1 1-1h1v-1c0-.55.45-1 1-1z"/>
        </svg>
       `,

        close: `
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
        </svg>
      `,

        paperPlane: `
        <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
        </svg>
      `,

        search: `
        <svg viewBox="0 0 20 16" fill="currentColor" width="17" height="17">
          <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
        </svg>
      `
    };

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
            // disable dragging on all elements and then enable it on the current element
            const allElements = document.querySelectorAll('[data-brackets-id]');
            allElements.forEach(el => el.setAttribute("draggable", "false"));
            this.element.setAttribute("draggable", "true");

            this.element.addEventListener("dragstart", (event) => {
                event.stopPropagation();
                event.dataTransfer.setData("text/plain", this.element.getAttribute("data-brackets-id"));
                _dragStartChores(this.element);
                _clearDropMarkers();
                window._currentDraggedElement = this.element;
                dismissUIAndCleanupState();
                dismissImageRibbonGallery();
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

            let content = `<div class="node-options">`;

            // @abose @devansh
            // hiding it for now as AI is not yet ready
            // content += `<span data-action="ai" title="${config.strings.ai}">
            //         ${ICONS.ai}
            //     </span>`;

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

            // if its an image element, we show the image gallery icon
            if (this.element && this.element.tagName.toLowerCase() === 'img') {
                content += `<span data-action="image-gallery" title="${config.strings.imageGallery}">
                    ${ICONS.imageGallery}
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

            let styles = `
                :host {
                  all: initial !important;
                }

                .phoenix-more-options-box {
                    background-color: #4285F4 !important;
                    color: white !important;
                    border-radius: 3px !important;
                    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2) !important;
                    font-size: 12px !important;
                    font-family: Arial, sans-serif !important;
                    z-index: 2147483647 !important;
                    position: absolute !important;
                    left: -1000px;
                    top: -1000px;
                    box-sizing: border-box !important;
                }

                .node-options {
                    display: flex !important;
                    align-items: center !important;
                }

                .node-options span {
                    padding: 4px 3.9px !important;
                    cursor: pointer !important;
                    display: flex !important;
                    align-items: center !important;
                    border-radius: 0 !important;
                }

                .node-options span:first-child {
                    border-radius: 3px 0 0 3px !important;
                }

                .node-options span:last-child {
                    border-radius: 0 3px 3px 0 !important;
                }

                .node-options span:hover {
                    background-color: rgba(255, 255, 255, 0.15) !important;
                }

                .node-options span > svg {
                    width: 16px !important;
                    height: 16px !important;
                    display: block !important;
                }
            `;

            // to highlight that in a different color, to show the selected state
            if (imageGallerySelected) {
                styles += `
                    .node-options span[data-action="image-gallery"] {
                      background-color: rgba(255, 255, 255, 0.25) !important;
                    }
                `;
            }

            // add everything to the shadow box
            shadow.innerHTML = `<style>${styles}</style><div class="phoenix-more-options-box">${content}</div>`;
            this._shadow = shadow;
        },

        create: function() {
            this.remove(); // remove existing box if already present

            if(!config.isProUser) {
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
            const classes = Array.from(this.element.classList || []);

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
                :host {
                  all: initial !important;
                }

                .phoenix-node-info-box {
                    background-color: #4285F4 !important;
                    color: white !important;
                    border-radius: 3px !important;
                    padding: 5px 8px !important;
                    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2) !important;
                    font-size: 12px !important;
                    font-family: Arial, sans-serif !important;
                    z-index: 2147483647 !important;
                    position: absolute !important;
                    left: ${leftPos}px;
                    top: -1000px;
                    max-width: 300px !important;
                    box-sizing: border-box !important;
                    pointer-events: none !important;
                }

                .tag-name {
                    font-weight: bold !important;
                }

                .id-name,
                .class-name {
                    margin-top: 3px !important;
                }

                .exceeded-classes {
                    opacity: 0.8 !important;
                }
            `;

            // add everything to the shadow box
            shadow.innerHTML = `<style>${styles}</style><div class="phoenix-node-info-box">${content}</div>`;
            this._shadow = shadow;
        },

        create: function() {
            this.remove(); // remove existing box if already present

            if(!config.isProUser) {
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

    // AI prompt box, it is displayed when user clicks on the AI button in the more options box
    function AIPromptBox(element) {
        this.element = element;
        this.selectedModel = 'fast';
        this.remove = this.remove.bind(this);
        this.create();
    }

    AIPromptBox.prototype = {
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
            // using shadow dom so that user styles doesn't override it
            const shadow = this.body.attachShadow({ mode: "open" });

            // Calculate responsive dimensions based on viewport width
            const viewportWidth = window.innerWidth;
            let boxWidth, boxHeight;

            if (viewportWidth >= 400) {
                boxWidth = Math.min(310, viewportWidth * 0.85);
                boxHeight = 60;
            } else if (viewportWidth >= 350) {
                boxWidth = Math.min(275, viewportWidth * 0.85);
                boxHeight = 70;
            } else if (viewportWidth >= 300) {
                boxWidth = Math.min(230, viewportWidth * 0.85);
                boxHeight = 80;
            } else if (viewportWidth >= 250) {
                boxWidth = Math.min(180, viewportWidth * 0.85);
                boxHeight = 100;
            } else if (viewportWidth >= 200) {
                boxWidth = Math.min(130, viewportWidth * 0.85);
                boxHeight = 120;
            } else {
                boxWidth = Math.min(100, viewportWidth * 0.85);
                boxHeight = 140;
            }

            const styles = `
                :host {
                  all: initial !important;
                }

                .phoenix-ai-prompt-box {
                    position: absolute !important;
                    background: #3C3F41 !important;
                    border: 1px solid #4285F4 !important;
                    border-radius: 4px !important;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15) !important;
                    font-family: Arial, sans-serif !important;
                    z-index: 2147483647 !important;
                    width: ${boxWidth}px !important;
                    padding: 0 !important;
                    box-sizing: border-box !important;
                }

                .phoenix-ai-prompt-input-container {
                    position: relative !important;
                }

                .phoenix-ai-prompt-textarea {
                    width: 100% !important;
                    height: ${boxHeight}px !important;
                    border: none !important;
                    border-radius: 4px 4px 0 0 !important;
                    padding: 12px 40px 12px 16px !important;
                    font-size: 14px !important;
                    font-family: Arial, sans-serif !important;
                    resize: none !important;
                    outline: none !important;
                    box-sizing: border-box !important;
                    background: transparent !important;
                    color: #c5c5c5 !important;
                    transition: background 0.2s ease !important;
                }

                .phoenix-ai-prompt-textarea:focus {
                    background: rgba(255, 255, 255, 0.03) !important;
                }

                .phoenix-ai-prompt-textarea::placeholder {
                    color: #a0a0a0 !important;
                    opacity: 0.7 !important;
                }

                .phoenix-ai-prompt-send-button {
                    background-color: transparent !important;
                    border: 1px solid transparent !important;
                    color: #a0a0a0 !important;
                    border-radius: 4px !important;
                    cursor: pointer !important;
                    padding: 3px 6px !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    font-size: 14px !important;
                    transition: all 0.2s ease !important;
                }

                .phoenix-ai-prompt-send-button:hover:not(:disabled) {
                    border: 1px solid rgba(0, 0, 0, 0.24) !important;
                    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12) !important;
                }

                .phoenix-ai-prompt-send-button:disabled {
                    opacity: 0.5 !important;
                    cursor: not-allowed !important;
                }

                .phoenix-ai-bottom-controls {
                    border-top: 1px solid rgba(255,255,255,0.14) !important;
                    padding: 8px 16px !important;
                    background: transparent !important;
                    border-radius: 0 0 4px 4px !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: space-between !important;
                }

                .phoenix-ai-model-select {
                    padding: 4px 8px !important;
                    border: 1px solid transparent !important;
                    border-radius: 4px !important;
                    font-size: 12px !important;
                    background: transparent !important;
                    color: #a0a0a0 !important;
                    outline: none !important;
                    cursor: pointer !important;
                    transition: all 0.2s ease !important;
                }

                .phoenix-ai-model-select:hover {
                    border: 1px solid rgba(0, 0, 0, 0.24) !important;
                    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12) !important;
                }

                .phoenix-ai-model-select:focus {
                    border: 1px solid rgba(0, 0, 0, 0.24) !important;
                    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12) !important;
                }

                .phoenix-ai-model-select option {
                    background: #000 !important;
                    color: #fff !important;
                    padding: 4px 8px !important;
                }
            `;

            const content = `
                <div class="phoenix-ai-prompt-box">
                    <div class="phoenix-ai-prompt-input-container">
                        <textarea
                            class="phoenix-ai-prompt-textarea"
                            placeholder="${config.strings.aiPromptPlaceholder}"
                        ></textarea>
                    </div>
                    <div class="phoenix-ai-bottom-controls">
                        <select class="phoenix-ai-model-select">
                            <option value="fast">Fast AI</option>
                            <option value="moderate">Moderate AI</option>
                            <option value="slow">Slow AI</option>
                        </select>
                        <button class="phoenix-ai-prompt-send-button" disabled>
                            ${ICONS.paperPlane}
                        </button>
                    </div>
                </div>
            `;

            shadow.innerHTML = `<style>${styles}</style>${content}`;
            this._shadow = shadow;
        },

        create: function() {
            this._style();
            window.document.body.appendChild(this.body);

            // Get the actual rendered dimensions of the box and position it
            const boxElement = this._shadow.querySelector('.phoenix-ai-prompt-box');
            if (boxElement) {
                const boxRect = boxElement.getBoundingClientRect();
                const pos = this._getBoxPosition(boxRect.width, boxRect.height);

                boxElement.style.left = pos.leftPos + 'px';
                boxElement.style.top = pos.topPos + 'px';
            }

            // Focus on the textarea
            const textarea = this._shadow.querySelector('.phoenix-ai-prompt-textarea');
            if (textarea) { // small timer to make sure that the text area element is fetched
                setTimeout(() => textarea.focus(), 50);
            }

            this._attachEventHandlers();

            // Prevent clicks inside the AI box from bubbling up and closing it
            this.body.addEventListener('click', (event) => {
                event.stopPropagation();
            });
        },

        _attachEventHandlers: function() {
            const textarea = this._shadow.querySelector('.phoenix-ai-prompt-textarea');
            const sendButton = this._shadow.querySelector('.phoenix-ai-prompt-send-button');
            const modelSelect = this._shadow.querySelector('.phoenix-ai-model-select');

            // Handle textarea input to enable/disable send button
            if (textarea && sendButton) {
                textarea.addEventListener('input', (event) => {
                    const hasText = event.target.value.trim().length > 0;
                    sendButton.disabled = !hasText;
                });

                // enter key
                textarea.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        if (textarea.value.trim()) {
                            this._handleSend(event, textarea.value.trim());
                        }
                    } else if (event.key === 'Escape') {
                        event.preventDefault();
                        this.remove();
                    }
                });
            }

            // send button click
            if (sendButton) {
                sendButton.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (textarea && textarea.value.trim()) {
                        this._handleSend(event, textarea.value.trim());
                    }
                });
            }

            // model selection change
            if (modelSelect) {
                modelSelect.addEventListener('change', (event) => {
                    this.selectedModel = event.target.value;
                });
            }
        },

        _handleSend: function(event, prompt) {
            const element = this.element;
            if(!isElementEditable(element)) {
                return;
            }
            const tagId = element.getAttribute("data-brackets-id");

            window._Brackets_MessageBroker.send({
                livePreviewEditEnabled: true,
                event: event,
                element: element,
                prompt: prompt,
                tagId: Number(tagId),
                selectedModel: this.selectedModel,
                AISend: true
            });
            this.remove();
        },

        remove: function() {
            if (this._handleKeydown) {
                document.removeEventListener('keydown', this._handleKeydown);
                this._handleKeydown = null;
            }

            if (this._handleResize) {
                window.removeEventListener('resize', this._handleResize);
                this._handleResize = null;
            }

            if (this.body && this.body.parentNode && this.body.parentNode === window.document.body) {
                window.document.body.removeChild(this.body);
                this.body = null;
                _aiPromptBox = null;
            }
        }
    };

    // image ribbon gallery cache, to store the last query and its results
    const CACHE_EXPIRY_TIME = 168 * 60 * 60 * 1000; // 7 days, might need to revise this...
    const CACHE_MAX_IMAGES = 50; // max number of images that we store in the localStorage
    const _imageGalleryCache = {
        get currentQuery() {
            const data = this._getFromStorage();
            return data ? data.currentQuery : null;
        },
        set currentQuery(val) {
            this._updateStorage({currentQuery: val});
        },

        get allImages() {
            const data = this._getFromStorage();
            return data ? data.allImages : [];
        },
        set allImages(val) {
            this._updateStorage({allImages: val});
        },

        get totalPages() {
            const data = this._getFromStorage();
            return data ? data.totalPages : 1;
        },
        set totalPages(val) {
            this._updateStorage({totalPages: val});
        },

        get currentPage() {
            const data = this._getFromStorage();
            return data ? data.currentPage : 1;
        },
        set currentPage(val) {
            this._updateStorage({currentPage: val});
        },


        _getFromStorage() {
            try {
                const data = window.localStorage.getItem('imageGalleryCache');
                if (!data) { return null; }

                const parsed = JSON.parse(data);

                if (Date.now() > parsed.expires) {
                    window.localStorage.removeItem('imageGalleryCache');
                    return null;
                }

                return parsed;
            } catch (error) {
                return null;
            }
        },

        _updateStorage(updates) {
            try {
                const current = this._getFromStorage() || {};
                const newData = {
                    ...current,
                    ...updates,
                    expires: Date.now() + CACHE_EXPIRY_TIME
                };
                window.localStorage.setItem('imageGalleryCache', JSON.stringify(newData));
            } catch (error) {
                if (error.name === 'QuotaExceededError') {
                    try {
                        window.localStorage.removeItem('imageGalleryCache');
                        window.localStorage.setItem('imageGalleryCache', JSON.stringify(updates));
                    } catch (retryError) {
                        console.error('Failed to save image cache even after clearing:', retryError);
                    }
                }
            }
        }
    };

    /**
     * when user clicks on an image we call this,
     * this creates a image ribbon gallery at the bottom of the live preview
     */
    function ImageRibbonGallery(element) {
        this.element = element;
        this.remove = this.remove.bind(this);
        this.currentPage = 1;
        this.totalPages = 1;
        this.allImages = [];
        this.imagesPerPage = 10;
        this.scrollPosition = 0;

        this.create();
    }

    ImageRibbonGallery.prototype = {
        _style: function () {
            this.body = window.document.createElement("div");
            this._shadow = this.body.attachShadow({mode: 'closed'});

            this._shadow.innerHTML = `
                <style>
                    .phoenix-image-gallery-container {
                        position: absolute;
                        bottom: 0;
                        left: 12px;
                        right: 12px;
                        background-color: #2c2c2c;
                        border-radius: 6px 6px 0 0;
                        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial;
                        height: 164px;
                        border: 1px solid rgba(255, 255, 255, 0.2);
                        z-index: 2147483647;
                    }

                    .phoenix-image-gallery-header {
                        display: flex;
                        padding: 6px 8px;
                        gap: 10px;
                    }

                    .phoenix-image-gallery-header-title {
                        display: flex;
                        color: #a0a0a0;
                        gap: 3px;
                        font-size: 14px;
                    }

                    .phoenix-image-gallery-header-icon {
                        height: 18px;
                        width: 18px;
                    }

                    .phoenix-image-gallery-search-container {
                        display: flex;
                        align-items: center;
                    }

                    .search-wrapper {
                        position: relative;
                        width: 130px;
                    }

                    .search-wrapper input {
                        width: 100%;
                        padding: 8px 12px 8px 36px;
                        border-radius: 6px;
                        border: none;
                        background-color: #1e1e1e;
                        color: #fff;
                    }

                    .search-wrapper .search-icon {
                        position: absolute;
                        left: 10px;
                        top: 50%;
                        transform: translateY(-50%);
                        background: none;
                        border: none;
                        color: #aaa;
                        cursor: pointer;
                    }

                    .search-wrapper .search-icon:hover {
                        color: #fff;
                    }

                    .search-wrapper input:focus {
                        outline: 1px solid #3a8ef6;
                    }

                    .phoenix-image-gallery-upload-container {
                        margin-left: 40px;
                    }

                    .phoenix-image-gallery-upload-container button {
                        display: flex;
                        align-items: center;
                        gap: 2px;
                        background: transparent;
                        color: #a0a0a0;
                        border: none;
                        border-radius: 3px;
                        padding: 4px 8px;
                        font-size: 12px;
                        cursor: pointer;
                    }

                    .phoenix-image-gallery-upload-container button:hover {
                        background: #3c3f41;
                    }

                    .phoenix-image-gallery-right-buttons {
                        display: flex;
                        align-items: center;
                        gap: 3px;
                        margin-left: auto;
                    }

                    .phoenix-image-gallery-right-buttons button {
                        display: flex;
                        background: transparent;
                        color: #a0a0a0;
                        border: none;
                        border-radius: 3px;
                        padding: 4px 8px;
                        cursor: pointer;
                    }

                    .phoenix-image-gallery-right-buttons button:hover {
                        background: #3c3f41;
                    }

                    .phoenix-image-gallery-right-buttons svg {
                        width: 16px;
                        height: 16px;
                    }

                    .phoenix-image-gallery-strip {
                        overflow: hidden;
                        scroll-behavior: smooth;
                        padding: 6px;
                    }

                    .phoenix-image-gallery-row {
                        display: flex;
                        gap: 5px;
                    }

                    .phoenix-ribbon-thumb {
                        flex: 0 0 auto;
                        width: 112px;
                        height: 112px;
                        border-radius: 4px;
                        overflow: hidden;
                        position: relative;
                        cursor: pointer;
                        outline: 1px solid rgba(255,255,255,0.08);
                        transition: transform 0.15s ease, outline-color 0.15s ease, box-shadow 0.15s ease;
                        background: #0b0e14;
                    }

                    .phoenix-ribbon-thumb img {
                        width: 100%;
                        height: 100%;
                        object-fit: cover;
                        display: block;
                    }

                    .phoenix-ribbon-thumb:hover {
                        transform: translateY(-2px) scale(1.02);
                        outline-color: rgba(255,255,255,0.25);
                        box-shadow: 0 8px 18px rgba(0,0,0,0.36);
                    }

                    .phoenix-image-gallery-nav {
                        position: absolute;
                        top: 50%;
                        border-radius: 12px;
                        border: 1px solid rgba(255,255,255,0.14);
                        color: #eaeaf0;
                        background: rgba(21,25,36,0.65);
                        cursor: pointer;
                        font-size: 20px;
                        font-weight: 600;
                        user-select: none;
                        transition: all 0.2s ease;
                        z-index: 2147483647;
                        padding: 0 12px 6px 12px;
                    }

                    .phoenix-image-gallery-nav:hover {
                        background: rgba(21,25,36,0.85);
                        border-color: rgba(255,255,255,0.25);
                        transform: scale(1.05);
                        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    }

                    .phoenix-image-gallery-nav:active {
                        transform: scale(0.95);
                    }

                    .phoenix-image-gallery-nav.left {
                        left: 15px;
                    }

                    .phoenix-image-gallery-nav.right {
                        right: 15px;
                    }

                    .phoenix-image-gallery-loading {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        height: 100%;
                        color: #eaeaf0;
                        font-size: 14px;
                    }

                    .phoenix-ribbon-error {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        height: 100%;
                        color: #ff6b6b;
                        font-size: 14px;
                    }

                    .phoenix-loading-more {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        min-width: 120px;
                        height: 116px;
                        margin-left: 2px;
                        background: rgba(255,255,255,0.03);
                        border-radius: 8px;
                        color: #e8eaf0;
                        font-size: 12px;
                        border: 1px dashed rgba(255,255,255,0.1);
                    }

                    .phoenix-ribbon-attribution {
                        position: absolute;
                        bottom: 6px;
                        left: 6px;
                        background: rgba(0,0,0,0.8);
                        color: white;
                        padding: 4px 6px;
                        border-radius: 5px;
                        font-size: 10px;
                        line-height: 1.2;
                        max-width: calc(100% - 12px);
                        text-shadow: 0 1px 2px rgba(0,0,0,0.9);
                        pointer-events: auto;
                        opacity: 0;
                        transition: all 0.2s ease;
                    }

                    .phoenix-ribbon-attribution .photographer {
                        display: block;
                        font-weight: 500;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        color: white;
                        text-decoration: none;
                    }

                    .phoenix-ribbon-attribution .photographer:hover {
                        text-decoration: underline;
                    }

                    .phoenix-ribbon-attribution .source {
                        display: block;
                        font-size: 9px;
                        opacity: 0.85;
                        color: white;
                        text-decoration: none;
                    }

                    .phoenix-ribbon-attribution .source:hover {
                        text-decoration: underline;
                    }

                    .phoenix-download-icon {
                        position: absolute;
                        top: 8px;
                        right: 8px;
                        background: rgba(0,0,0,0.7);
                        border: none;
                        color: #eee;
                        border-radius: 50%;
                        width: 18px;
                        height: 18px;
                        padding: 4px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                        font-size: 16px;
                        z-index: 2147483647;
                        transition: all 0.2s ease;
                        pointer-events: none;
                        opacity: 0;
                    }

                    .phoenix-ribbon-thumb:hover .phoenix-download-icon {
                        opacity: 1;
                        pointer-events: auto;
                    }

                    .phoenix-ribbon-thumb:hover .phoenix-ribbon-attribution {
                        opacity: 1;
                    }

                    .phoenix-ribbon-attribution:hover {
                        opacity: 1;
                    }

                    .phoenix-download-icon:hover {
                        background: rgba(0,0,0,0.9);
                        transform: scale(1.1);
                    }

                    .phoenix-ribbon-thumb.downloading {
                        opacity: 0.6;
                        pointer-events: none;
                    }

                    .phoenix-download-indicator {
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        background: rgba(0, 0, 0, 0.8);
                        border-radius: 50%;
                        width: 40px;
                        height: 40px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 10;
                    }

                    .phoenix-download-spinner {
                        width: 20px;
                        height: 20px;
                        border: 2px solid rgba(255, 255, 255, 0.3);
                        border-top: 2px solid #fff;
                        border-radius: 50%;
                        animation: phoenix-spin 1s linear infinite;
                    }

                    @keyframes phoenix-spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>


                <div class='phoenix-image-gallery-container'>
                    <div class='phoenix-image-gallery-header'>
                        <div class='phoenix-image-gallery-header-title'>
                            <div class='phoenix-image-gallery-header-icon'>
                                ${ICONS.imageGallery}
                            </div>
                            <div class='phoenix-image-gallery-header-text'>
                                ${config.strings.imageGallery}
                            </div>
                        </div>

                        <div class="phoenix-image-gallery-search-container">
                          <div class="search-wrapper">
                            <button class="search-icon">${ICONS.search}</button>
                            <input
                              type="text"
                              placeholder="${config.strings.imageGallerySearchPlaceholder}"
                            />
                          </div>
                        </div>

                        <div class='phoenix-image-gallery-upload-container'>
                            <button>${ICONS.selectImageFromComputer} Upload</button>
                            <input type="file" class="phoenix-file-input" accept="image/*" style="display: none;">
                        </div>

                        <div class='phoenix-image-gallery-right-buttons'>
                            <button class='phoenix-image-gallery-download-folder-button'>
                                ${ICONS.folderSettings}
                            </button>

                            <button class='phoenix-image-gallery-close-button'>
                                ${ICONS.close}
                            </button>
                        </div>
                    </div>

                    <div class="phoenix-image-gallery-nav left">&#8249;</div>
                    <div class="phoenix-image-gallery-strip">
                        <div class="phoenix-image-gallery-row phoenix-image-gallery-loading">
                            ${config.strings.imageGalleryLoadingInitial}
                        </div>
                    </div>
                    <div class="phoenix-image-gallery-nav right">&#8250;</div>
                </div>
            `;
        },

        _getDefaultQuery: function() {
            // this are the default queries, so when image ribbon gallery is shown, we select a random query and show it
            const qualityQueries = [
                'nature', 'minimal', 'workspace', 'abstract', 'coffee',
                'mountains', 'city', 'flowers', 'ocean', 'sunset',
                'architecture', 'forest', 'travel', 'technology', 'sky',
                'landscape', 'creative', 'design', 'art', 'modern',
                'food', 'patterns', 'colors', 'photography', 'studio',
                'light', 'winter', 'summer', 'vintage', 'geometric',
                'water', 'beach', 'space', 'garden', 'textures',
                'urban', 'portrait', 'music', 'books', 'home',
                'cozy', 'aesthetic', 'autumn', 'spring', 'clouds'
            ];

            const randIndex = Math.floor(Math.random() * qualityQueries.length);
            return qualityQueries[randIndex];
        },

        _fetchImages: function(searchQuery, page = 1, append = false) {
            this._currentSearchQuery = searchQuery;

            if (!append && this._loadFromCache(searchQuery)) { // try cache first
                return;
            }
            if (append && this._loadPageFromCache(searchQuery, page)) { // try to load new page from cache
                return;
            }
            // if unable to load from cache, we make the API call
            this._fetchFromAPI(searchQuery, page, append);
        },

        _fetchFromAPI: function(searchQuery, page, append) {
            // when we fetch from API, we clear the previous query from local storage and then store a fresh copy
            if (searchQuery !== _imageGalleryCache.currentQuery) {
                this._clearCache();
            }

            const apiUrl = `https://images.phcode.dev/api/images/search?q=${encodeURIComponent(searchQuery)}&per_page=10&page=${page}&safe=true`;

            if (!append) {
                this._showLoading();
            }

            fetch(apiUrl)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`API request failed: ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    if (data.results && data.results.length > 0) {
                        if (append) {
                            this.allImages = this.allImages.concat(data.results);
                            this._renderImages(data.results, true); // true means need to append new images at the end
                        } else {
                            this.allImages = data.results;
                            this._renderImages(this.allImages, false); // false means its a new search
                        }
                        this.totalPages = data.total_pages || 1;
                        this.currentPage = page;
                        this._updateNavButtons();
                        this._updateSearchInput(searchQuery);
                        this._updateCache(searchQuery, data, append);
                    } else if (!append) {
                        this._showError(config.strings.imageGalleryNoImages);
                    }

                    if (append) {
                        this._isLoadingMore = false;
                        this._hideLoadingMore();
                    }
                })
                .catch(error => {
                    console.error('Failed to fetch images:', error);
                    if (!append) {
                        this._showError(config.strings.imageGalleryLoadError);
                    } else {
                        this._isLoadingMore = false;
                        this._hideLoadingMore();
                    }
                });
        },

        _updateCache: function(searchQuery, data, append) {
            // Update cache with new data for current query
            _imageGalleryCache.currentQuery = searchQuery;
            _imageGalleryCache.totalPages = data.total_pages || 1;
            _imageGalleryCache.currentPage = this.currentPage;

            if (append) {
                const currentImages = _imageGalleryCache.allImages;
                const newImages = currentImages.concat(data.results);

                if (newImages.length > CACHE_MAX_IMAGES) {
                    _imageGalleryCache.allImages = newImages.slice(-CACHE_MAX_IMAGES);
                } else {
                    _imageGalleryCache.allImages = newImages;
                }
            } else {
                // new search replace cache
                _imageGalleryCache.allImages = data.results;
            }
        },

        _clearCache: function() {
            try {
                window.localStorage.removeItem('imageGalleryCache');
            } catch (error) {
                console.error('Failed to clear image cache:', error);
            }
        },

        _updateSearchInput: function(searchQuery) {
            // write the current query in the search input
            const searchInput = this._shadow.querySelector('.search-wrapper input');
            if (searchInput && searchQuery) {
                searchInput.value = searchQuery;
                searchInput.placeholder = searchQuery;
            }
        },

        _loadFromCache: function(searchQuery) {
            if (searchQuery === _imageGalleryCache.currentQuery && _imageGalleryCache.allImages.length > 0) {
                this.allImages = _imageGalleryCache.allImages;
                this.totalPages = _imageGalleryCache.totalPages;
                this.currentPage = _imageGalleryCache.currentPage;

                this._renderImages(this.allImages, false);
                this._updateNavButtons();
                this._updateSearchInput(searchQuery);
                return true;
            }
            return false;
        },

        _loadPageFromCache: function(searchQuery, page) {
            if (searchQuery === _imageGalleryCache.currentQuery && page <= Math.ceil(_imageGalleryCache.allImages.length / 10)) {
                const startIdx = (page - 1) * 10;
                const endIdx = startIdx + 10;
                const pageImages = _imageGalleryCache.allImages.slice(startIdx, endIdx);

                if (pageImages.length > 0) {
                    this.allImages = this.allImages.concat(pageImages);
                    this._renderImages(pageImages, true);
                    this.currentPage = page;
                    this._updateNavButtons();
                    this._isLoadingMore = false;
                    this._hideLoadingMore();
                    return true;
                }
            }
            return false;
        },

        _handleNavLeft: function() {
            const container = this._shadow.querySelector('.phoenix-image-gallery-strip');
            if (!container) { return; }

            const containerWidth = container.clientWidth;
            const scrollAmount = containerWidth;

            this.scrollPosition = Math.max(0, this.scrollPosition - scrollAmount);
            container.scrollTo({ left: this.scrollPosition, behavior: 'smooth' });
            this._updateNavButtons();
        },

        _handleNavRight: function() {
            const container = this._shadow.querySelector('.phoenix-image-gallery-strip');
            if (!container) { return; }

            const containerWidth = container.clientWidth;
            const totalWidth = container.scrollWidth;
            const scrollAmount = containerWidth;

            // if we're near the end, we need to load more images
            const nearEnd = (this.scrollPosition + containerWidth + scrollAmount) >= totalWidth - 100;
            if (nearEnd && this.currentPage < this.totalPages && !this._isLoadingMore) {
                this._isLoadingMore = true;
                this._showLoadingMore();
                this._fetchImages(this._currentSearchQuery, this.currentPage + 1, true);
            }

            this.scrollPosition = Math.min(totalWidth - containerWidth, this.scrollPosition + scrollAmount);
            container.scrollTo({ left: this.scrollPosition, behavior: 'smooth' });
            this._updateNavButtons();
        },

        _updateNavButtons: function() {
            // this function is responsible to update the nav buttons
            // when we're at the very left, we hide the nav-left button completely
            // when we're at the very right and no more pages available, we hide the nav-right button
            const navLeft = this._shadow.querySelector('.phoenix-image-gallery-nav.left');
            const navRight = this._shadow.querySelector('.phoenix-image-gallery-nav.right');
            const container = this._shadow.querySelector('.phoenix-image-gallery-strip');

            if (!navLeft || !navRight || !container) { return; }

            // show/hide left button
            if (this.scrollPosition <= 0) {
                navLeft.style.display = 'none';
            } else {
                navLeft.style.display = 'block';
            }

            // show/hide right button
            const containerWidth = container.clientWidth;
            const totalWidth = container.scrollWidth;
            const atEnd = (this.scrollPosition + containerWidth) >= totalWidth - 10;
            const hasMorePages = this.currentPage < this.totalPages;

            if (atEnd && !hasMorePages) {
                navRight.style.display = 'none';
            } else {
                navRight.style.display = 'block';
            }
        },

        _showLoading: function() {
            const rowElement = this._shadow.querySelector('.phoenix-image-gallery-row');
            if (!rowElement) { return; }

            rowElement.innerHTML = config.strings.imageGalleryLoadingInitial;
            rowElement.className = 'phoenix-image-gallery-row phoenix-image-gallery-loading';
        },

        _showLoadingMore: function() {
            const rowElement = this._shadow.querySelector('.phoenix-image-gallery-row');
            if (!rowElement) { return; }

            // when loading more images we need to show the message at the end of the image ribbon
            const loadingIndicator = window.document.createElement('div');
            loadingIndicator.className = 'phoenix-loading-more';
            loadingIndicator.textContent = config.strings.imageGalleryLoadingMore;
            rowElement.appendChild(loadingIndicator);
        },

        _hideLoadingMore: function() {
            const loadingIndicator = this._shadow.querySelector('.phoenix-loading-more');
            if (loadingIndicator) {
                loadingIndicator.remove();
            }
        },

        _attachEventHandlers: function() {
            const ribbonContainer = this._shadow.querySelector('.phoenix-image-gallery-container');
            const ribbonStrip = this._shadow.querySelector('.phoenix-image-gallery-strip');
            const searchInput = this._shadow.querySelector('.search-wrapper input');
            const searchButton = this._shadow.querySelector('.search-icon');
            const closeButton = this._shadow.querySelector('.phoenix-image-gallery-close-button');
            const folderSettingsButton = this._shadow.querySelector('.phoenix-image-gallery-download-folder-button');
            const navLeft = this._shadow.querySelector('.phoenix-image-gallery-nav.left');
            const navRight = this._shadow.querySelector('.phoenix-image-gallery-nav.right');
            const selectImageBtn = this._shadow.querySelector('.phoenix-image-gallery-upload-container button');
            const fileInput = this._shadow.querySelector('.phoenix-file-input');

            if (searchInput && searchButton) {
                const performSearch = (e) => {
                    e.stopPropagation();
                    const query = searchInput.value.trim();
                    if (query) {
                        // reset pagination when searching
                        this.currentPage = 1;
                        this.allImages = [];
                        this.scrollPosition = 0;
                        this._fetchImages(query);
                    }
                };

                // disable/enable search button as per input container text
                const updateSearchButtonState = () => {
                    searchButton.disabled = searchInput.value.trim().length === 0;
                };

                searchInput.addEventListener('input', updateSearchButtonState);

                searchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        performSearch(e);
                    }
                });

                searchInput.addEventListener('click', (e) => {
                    e.stopPropagation();
                });

                searchButton.addEventListener('click', performSearch);
            }

            if (selectImageBtn && fileInput) {
                selectImageBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    fileInput.click();
                });

                fileInput.addEventListener('change', (e) => {
                    e.stopPropagation();
                    const file = e.target.files[0];
                    if (file) {
                        this._handleLocalImageSelection(file);
                        fileInput.value = '';
                    }
                });
            }

            if (closeButton) {
                closeButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.remove();
                    imageGallerySelected = false;
                    dismissUIAndCleanupState();
                });
            }

            if (folderSettingsButton) {
                folderSettingsButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // send message to LivePreviewEdit to show folder selection dialog
                    const tagId = this.element.getAttribute("data-brackets-id");
                    window._Brackets_MessageBroker.send({
                        livePreviewEditEnabled: true,
                        resetImageFolderSelection: true,
                        element: this.element,
                        tagId: Number(tagId)
                    });
                });
            }

            if (navLeft) {
                navLeft.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._handleNavLeft();
                });
            }

            if (navRight) {
                navRight.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._handleNavRight();
                });
            }

            // Restore original image when mouse leaves the entire ribbon strip
            if (ribbonStrip) {
                ribbonStrip.addEventListener('mouseleave', () => {
                    this.element.src = this._originalImageSrc;
                });
            }

            // Prevent clicks anywhere inside the ribbon from bubbling up
            if (ribbonContainer) {
                ribbonContainer.addEventListener('click', (e) => {
                    e.stopPropagation();
                });
            }
        },

        // append true means load more images (user clicked on nav-right)
        // append false means its a new query
        _renderImages: function(images, append = false) {
            const rowElement = this._shadow.querySelector('.phoenix-image-gallery-row');
            if (!rowElement) { return; }

            const container = this._shadow.querySelector('.phoenix-image-gallery-strip');
            const savedScrollPosition = container ? container.scrollLeft : 0;

            // if not appending we clear the phoenix ribbon
            if (!append) {
                rowElement.innerHTML = '';
                rowElement.className = 'phoenix-image-gallery-row';
            } else {
                // when appending we add the new images at the end
                const loadingIndicator = this._shadow.querySelector('.phoenix-loading-more');
                if (loadingIndicator) {
                    loadingIndicator.remove();
                }
            }

            // Create thumbnails from API data
            images.forEach(image => {
                const thumbDiv = window.document.createElement('div');
                thumbDiv.className = 'phoenix-ribbon-thumb';

                const img = window.document.createElement('img');
                img.src = image.thumb_url || image.url;
                img.alt = image.alt_text || 'Unsplash image';
                img.loading = 'lazy';

                // show hovered image along with dimensions
                thumbDiv.addEventListener('mouseenter', () => {
                    this.element.style.width = this._originalImageStyle.width;
                    this.element.style.height = this._originalImageStyle.height;

                    this.element.style.objectFit = this._originalImageStyle.objectFit || 'cover';
                    this.element.src = image.url || image.thumb_url;
                });

                // attribution overlay, we show this only in the image ribbon gallery
                const attribution = window.document.createElement('div');
                attribution.className = 'phoenix-ribbon-attribution';

                const photographer = window.document.createElement('a');
                photographer.className = 'photographer';
                photographer.href = image.photographer_url;
                photographer.target = '_blank';
                photographer.rel = 'noopener noreferrer';
                photographer.textContent = (image.user && image.user.name) || 'Anonymous';
                photographer.addEventListener('click', (e) => {
                    e.stopPropagation();
                });

                const source = window.document.createElement('a');
                source.className = 'source';
                source.href = image.unsplash_url;
                source.target = '_blank';
                source.rel = 'noopener noreferrer';
                source.textContent = 'on Unsplash';
                source.addEventListener('click', (e) => {
                    e.stopPropagation();
                });

                attribution.appendChild(photographer);
                attribution.appendChild(source);

                // download icon
                const downloadIcon = window.document.createElement('div');
                downloadIcon.className = 'phoenix-download-icon';
                downloadIcon.title = config.strings.imageGalleryUseImage;
                downloadIcon.innerHTML = ICONS.downloadImage;

                // when the image is clicked we download the image
                thumbDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();

                    // prevent multiple downloads of the same image
                    if (thumbDiv.classList.contains('downloading')) { return; }

                    // show download indicator
                    this._showDownloadIndicator(thumbDiv);

                    const filename = this._generateFilename(image);
                    const extnName = ".jpg";

                    const downloadUrl = image.url || image.thumb_url;

                    // we need to make a req to the download endpoint
                    // its required by the Unsplash API guidelines to track downloads for photographers
                    // this is just a tracking call, we don't need to wait for the response
                    if (image.download_location) {
                        fetch(image.download_location)
                            .catch(error => {
                                //
                            });
                    }

                    this._useImage(downloadUrl, filename, extnName, false, thumbDiv);
                });

                thumbDiv.appendChild(img);
                thumbDiv.appendChild(attribution);
                thumbDiv.appendChild(downloadIcon);
                rowElement.appendChild(thumbDiv);
            });

            if (append && container && savedScrollPosition > 0) {
                setTimeout(() => {
                    container.scrollLeft = savedScrollPosition;
                }, 0);
            }
        },

        _showError: function(message) {
            const rowElement = this._shadow.querySelector('.phoenix-image-gallery-row');
            if (!rowElement) { return; }

            rowElement.innerHTML = message;
            rowElement.className = 'phoenix-image-gallery-row phoenix-ribbon-error';
        },

        // file name with which we need to save the image
        _generateFilename: function(image) {
            const photographerName = (image.user && image.user.name) || 'Anonymous';
            const searchTerm = this._currentSearchQuery || 'image';

            // clean the search term and the photograper name to write in file name
            const cleanSearchTerm = searchTerm.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
            const cleanPhotographerName = photographerName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

            return `${cleanSearchTerm}-by-${cleanPhotographerName}`;
        },

        _useImage: function(imageUrl, filename, extnName, isLocalFile, thumbDiv) {
            // send the message to the editor instance to save the image and update the source code
            const tagId = this.element.getAttribute("data-brackets-id");

            const messageData = {
                livePreviewEditEnabled: true,
                useImage: true,
                imageUrl: imageUrl,
                filename: filename,
                extnName: extnName,
                element: this.element,
                tagId: Number(tagId)
            };

            // if this is a local file we need some more data before sending it to the editor
            if (isLocalFile) {
                messageData.isLocalFile = true;
                // Convert data URL to binary data array for local files
                const byteCharacters = atob(imageUrl.split(',')[1]);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                messageData.imageData = byteNumbers;
            }

            window._Brackets_MessageBroker.send(messageData);

            // if thumbDiv is provided, hide the download indicator after a reasonable timeout
            // this is to make sure that the indicator is always removed even if there's no explicit success callback
            if (thumbDiv) {
                setTimeout(() => {
                    this._hideDownloadIndicator(thumbDiv);
                }, 3000);
            }
        },

        _handleLocalImageSelection: function(file) {
            if (!file || !file.type.startsWith('image/')) {
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const imageDataUrl = e.target.result;

                const originalName = file.name;
                const nameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
                const extension = originalName.substring(originalName.lastIndexOf('.')) || '.jpg';

                // we clean the file name because the file might have some chars which might not be compatible
                const cleanName = nameWithoutExt.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
                const filename = cleanName || 'selected-image';

                // Use the unified _useImage method with isLocalFile flag
                this._useImage(imageDataUrl, filename, extension, true, null);

                // Close the ribbon after successful selection
                this.remove();
            };

            reader.onerror = (error) => {
                console.error('Something went wrong when reading the image:', error);
            };

            reader.readAsDataURL(file);
        },


        create: function() {
            this.remove(); // remove existing ribbon if already present

            // when image ribbon gallery is created we get the original image along with its dimensions
            // so that on hover in we can show the hovered image and on hover out we can restore the original image
            this._originalImageSrc = this.element.src;
            this._originalImageStyle = {
                width: window.getComputedStyle(this.element).width,
                height: window.getComputedStyle(this.element).height,
                objectFit: window.getComputedStyle(this.element).objectFit
            };

            this._style();
            window.document.body.appendChild(this.body);
            this._attachEventHandlers();

            const queryToUse = _imageGalleryCache.currentQuery || this._getDefaultQuery();
            this._fetchImages(queryToUse);
            setTimeout(() => this._updateNavButtons(), 0);
        },

        remove: function () {
            _imageRibbonGallery = null;
            if (this.body && this.body.parentNode && this.body.parentNode === window.document.body) {
                window.document.body.removeChild(this.body);
                this.body = null;
            }
        },

        _showDownloadIndicator: function(thumbDiv) {
            // add downloading class
            thumbDiv.classList.add('downloading');

            // create download indicator
            const indicator = window.document.createElement('div');
            indicator.className = 'phoenix-download-indicator';

            const spinner = window.document.createElement('div');
            spinner.className = 'phoenix-download-spinner';

            indicator.appendChild(spinner);
            thumbDiv.appendChild(indicator);
        },

        _hideDownloadIndicator: function(thumbDiv) {
            // remove downloading class
            thumbDiv.classList.remove('downloading');

            // remove download indicator
            const indicator = thumbDiv.querySelector('.phoenix-download-indicator');
            if (indicator) {
                indicator.remove();
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
                "z-index": 2147483647,
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

            this.elements.push(element);
            this._makeHighlightDiv(element, doAnimation);
        },

        clear: function () {
            var i, highlights = window.document.querySelectorAll("." + HIGHLIGHT_CLASSNAME),
                body = window.document.body;

            for (i = 0; i < highlights.length; i++) {
                body.removeChild(highlights[i]);
            }

            for (i = 0; i < this.elements.length; i++) {
                if (this.trigger) {
                    _trigger(this.elements[i], "highlight", 0);
                }
                clearElementBackground(this.elements[i]);
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

    var _localHighlight;
    var _hoverHighlight;
    var _clickHighlight;
    var _nodeInfoBox;
    var _nodeMoreOptionsBox;
    var _aiPromptBox;
    var _imageRibbonGallery;
    var _setup = false;
    var _hoverLockTimer = null;

    function onMouseOver(event) {
        if (_validEvent(event)) {
            const element = event.target;
            if(isElementEditable(element) && element.nodeType === Node.ELEMENT_NODE ) {
                _localHighlight.add(element, true);
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
            // only clear background if it's currently a highlight color, not if it's an original user style
            const currentBg = element.style.backgroundColor;
            if (currentBg === "rgba(0, 162, 255, 0.2)" || currentBg.includes("rgba(0, 162, 255")) {
                element.style.backgroundColor = "";
            }
            // if it's some other color, we just leave it as is - it's likely a user-defined style
        }
        delete element._originalBackgroundColor;
    }

    function onElementHover(event) {
        // don't want highlighting and stuff when auto scrolling
        if (_isAutoScrolling) {
            return;
        }

        const element = event.target;
        if(!isElementEditable(element) || element.nodeType !== Node.ELEMENT_NODE) {
            return false;
        }

        // if _hoverHighlight is uninitialized, initialize it
        if (!_hoverHighlight && shouldShowHighlightOnHover()) {
            _hoverHighlight = new Highlight("#c8f9c5", true);
        }

        // this is to check the user's settings, if they want to show the elements highlights on hover or click
        if (_hoverHighlight && shouldShowHighlightOnHover()) {
            _hoverHighlight.clear();

            // Store original background color to restore on hover out
            element._originalBackgroundColor = element.style.backgroundColor;
            element.style.backgroundColor = "rgba(0, 162, 255, 0.2)";

            _hoverHighlight.add(element, false);

            // Create info box for the hovered element
            dismissNodeInfoBox();
            _nodeInfoBox = new NodeInfoBox(element);
        }
    }

    function onElementHoverOut(event) {
        // don't want highlighting and stuff when auto scrolling
        if (_isAutoScrolling) {
            return;
        }

        const element = event.target;
        if(isElementEditable(element) && element.nodeType === Node.ELEMENT_NODE) {
            // this is to check the user's settings, if they want to show the elements highlights on hover or click
            if (_hoverHighlight && shouldShowHighlightOnHover()) {
                _hoverHighlight.clear();
                clearElementBackground(element);
                dismissNodeInfoBox();
            }
        }
    }

    function scrollElementToViewPort(element) {
        if (!element) {
            return;
        }

        // Check if element is in viewport, if not scroll to it
        if (!isInViewport(element)) {
            let top = getDocumentOffsetTop(element);
            if (top) {
                top -= (window.innerHeight / 2);
                window.scrollTo(0, top);
            }
        }
    }

    /**
     * this function is responsible to select an element in the live preview
     * @param {Element} element - The DOM element to select
     */
    function _selectElement(element) {
        // dismiss all UI boxes and cleanup previous element state when selecting a different element
        dismissUIAndCleanupState();
        dismissImageRibbonGallery();

        // this should always happen before isElementEditable check because this is not a live preview edit feature
        // this should also be there when users are in highlight mode
        scrollElementToViewPort(element);

        if(!isElementEditable(element)) {
            return false;
        }

        // if imageGallerySelected is true, show the image gallery directly
        if(element && element.tagName.toLowerCase() === 'img' && imageGallerySelected) {
            if (!_imageRibbonGallery) {
                _imageRibbonGallery = new ImageRibbonGallery(element);
                scrollImageToViewportIfRequired(element, _imageRibbonGallery);
            }
        }

        // make sure that the element is actually visible to the user
        if (isElementVisible(element)) {
            _nodeMoreOptionsBox = new NodeMoreOptionsBox(element);
            _nodeInfoBox = new NodeInfoBox(element);
        } else {
            // Element is hidden, so don't show UI boxes but still apply visual styling
            _nodeMoreOptionsBox = null;
        }

        element._originalOutline = element.style.outline;
        element.style.outline = "1px solid #4285F4";

        if (element._originalBackgroundColor === undefined) {
            element._originalBackgroundColor = element.style.backgroundColor;
        }
        element.style.backgroundColor = "rgba(0, 162, 255, 0.2)";

        if (_hoverHighlight) {
            _hoverHighlight.clear();
            _hoverHighlight.add(element, true);
        }

        previouslyClickedElement = element;
    }

    function disableHoverListeners() {
        window.document.removeEventListener("mouseover", onElementHover);
        window.document.removeEventListener("mouseout", onElementHoverOut);
    }

    function enableHoverListeners() {
        if (config.isProUser && (config.highlight || shouldShowHighlightOnHover())) {
            window.document.addEventListener("mouseover", onElementHover);
            window.document.addEventListener("mouseout", onElementHoverOut);
        }
    }

    /**
     * this function activates hover lock to prevent hover events
     * Used when user performs click actions to avoid UI box conflicts
     */
    function activateHoverLock() {
        if (_hoverLockTimer) {
            clearTimeout(_hoverLockTimer);
        }

        disableHoverListeners();
        _hoverLockTimer = setTimeout(() => {
            enableHoverListeners();
            _hoverLockTimer = null;
        }, 1500); // 1.5s
    }

    /**
     * This function handles the click event on the live preview DOM element
     * this just stops the propagation because otherwise users might not be able to edit buttons or hyperlinks etc
     * @param {Event} event
     */
    function onClick(event) {
        const element = event.target;

        if(isElementEditable(element)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            activateHoverLock();
        }
    }

    /**
     * this function handles the double click event
     * @param {Event} event
     */
    function onDoubleClick(event) {
        const element = event.target;
        if (isElementEditable(element)) {
            // because we only want to allow double click text editing where we show the edit option
            if (_shouldShowEditTextOption(element)) {
                event.preventDefault();
                event.stopPropagation();
                startEditing(element);
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

    // highlight an element
    function highlight(element, clear) {
        if (!_clickHighlight) {
            _clickHighlight = new Highlight("#cfc");
        }
        if (clear) {
            _clickHighlight.clear();
        }
        if (isElementEditable(element, true) && element.nodeType === Node.ELEMENT_NODE) {
            _clickHighlight.add(element, true);
        }
    }

    // highlight a rule
    function highlightRule(rule) {
        hideHighlight();
        var i, nodes = window.document.querySelectorAll(rule);

        for (i = 0; i < nodes.length; i++) {
            highlight(nodes[i]);
        }
        if (_clickHighlight) {
            _clickHighlight.selector = rule;
        }

        // select the first valid highlighted element
        var foundValidElement = false;
        for (i = 0; i < nodes.length; i++) {
            if(isElementEditable(nodes[i], true) && nodes[i].tagName !== "BR") {
                _selectElement(nodes[i]);
                foundValidElement = true;
                break;
            }
        }

        // if no valid element present we dismiss the boxes
        if (!foundValidElement) {
            dismissUIAndCleanupState();
            dismissImageRibbonGallery();
        }
    }

    // recreate UI boxes (info box and more options box)
    function redrawUIBoxes() {
        if (_nodeMoreOptionsBox) {
            const element = _nodeMoreOptionsBox.element;
            _nodeMoreOptionsBox.remove();
            _nodeMoreOptionsBox = new NodeMoreOptionsBox(element);

            if (_nodeInfoBox) {
                dismissNodeInfoBox();
                _nodeInfoBox = new NodeInfoBox(element);
            }
        }

        if (_aiPromptBox) {
            const element = _aiPromptBox.element;
            _aiPromptBox.remove();
            _aiPromptBox = new AIPromptBox(element);
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
        if (_nodeMoreOptionsBox && _nodeMoreOptionsBox.element && _nodeMoreOptionsBox._shadow) {
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
                        dismissNodeInfoBox();
                        dismissNodeMoreOptionsBox();
                        cleanupPreviousElementState();
                    }
                }
            }
        } else if (_nodeInfoBox && _nodeInfoBox.element && _nodeInfoBox._shadow) {
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
                            dismissNodeInfoBox();
                            dismissNodeMoreOptionsBox();
                            cleanupPreviousElementState();
                        }
                    }
                }
            }
        }
    }

    // this function is responsible to reposition the AI box
    // so we need to reposition it when for ex: a fixed positioned element is selected in the live preview
    // now when live preview is scrolled the element remains at a fixed position but the AI box will drift away
    // so we reposition it when its a fixed element
    function _repositionAIBox() {
        if (!_aiPromptBox || !_aiPromptBox.element || !_aiPromptBox._shadow) { return; }

        const aiBox = _aiPromptBox._shadow.querySelector('.phoenix-ai-prompt-box');
        if (!aiBox) { return; }

        const aiBoxBounds = aiBox.getBoundingClientRect();
        const elementBounds = _aiPromptBox.element.getBoundingClientRect();

        // this is to store the prev value, so that we can compare it the second time
        if(!_aiPromptBox._possDifference) {
            _aiPromptBox._possDifference = aiBoxBounds.top - elementBounds.top;
        } else {
            const calcNewDifference = aiBoxBounds.top - elementBounds.top;
            const prevDifference = _aiPromptBox._possDifference;

            // 4 is just for pixelated differences
            if (Math.abs(calcNewDifference - prevDifference) > 4) {
                const boxPositions = _aiPromptBox._getBoxPosition(aiBoxBounds.width, aiBoxBounds.height);

                aiBox.style.left = boxPositions.leftPos + 'px';
                aiBox.style.top = boxPositions.topPos + 'px';
                _aiPromptBox._possDifference = calcNewDifference;
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
            _repositionAIBox(); // and reposition the AI box
        } else {
            if (_localHighlight || _clickHighlight || _hoverHighlight) {
                window.setTimeout(redrawHighlights, 0);
            }
            _dismissBoxesForFixedElements();
            _repositionAIBox();
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
        const oldConfig = config;
        config = JSON.parse(newConfig);

        // Determine if configuration has changed significantly
        const oldHighlightMode = oldConfig.elemHighlights ? oldConfig.elemHighlights.toLowerCase() : "hover";
        const newHighlightMode = getHighlightMode();
        const highlightModeChanged = oldHighlightMode !== newHighlightMode;
        const isProStatusChanged = oldConfig.isProUser !== config.isProUser;
        const highlightSettingChanged = oldConfig.highlight !== config.highlight;
        // Handle configuration changes
        if (highlightModeChanged || isProStatusChanged || highlightSettingChanged) {
            _handleConfigurationChange();
        }

        _updateEventListeners();
        return JSON.stringify(config);
    }

    /**
     * when config is changed we clear all the highlighting and stuff
     */
    function _handleConfigurationChange() {
        if (_hoverHighlight) {
            _hoverHighlight.clear();
        }
        cleanupPreviousElementState();
        const allElements = window.document.querySelectorAll("[data-brackets-id]");
        for (let i = 0; i < allElements.length; i++) {
            if (allElements[i]._originalBackgroundColor !== undefined) {
                clearElementBackground(allElements[i]);
            }
        }
        dismissUIAndCleanupState();
    }

    /**
     * Update event listeners based on current configuration
     */
    function _updateEventListeners() {
        window.document.removeEventListener("mouseover", onElementHover);
        window.document.removeEventListener("mouseout", onElementHoverOut);
        if (config.highlight || (config.isProUser && shouldShowHighlightOnHover())) {
            window.document.addEventListener("mouseover", onElementHover);
            window.document.addEventListener("mouseout", onElementHoverOut);
        }
    }

    /**
     * This function checks if there are any live preview boxes currently visible
     * @return {boolean} true if any boxes are visible, false otherwise
     */
    function hasVisibleLivePreviewBoxes() {
        return _nodeMoreOptionsBox !== null ||
                _nodeInfoBox !== null ||
                _aiPromptBox !== null ||
                previouslyClickedElement !== null;
    }

    /**
     * Helper function to dismiss NodeMoreOptionsBox if it exists
     */
    function dismissNodeMoreOptionsBox() {
        if (_nodeMoreOptionsBox) {
            _nodeMoreOptionsBox.remove();
            _nodeMoreOptionsBox = null;
        }
    }

    /**
     * Helper function to dismiss NodeInfoBox if it exists
     */
    function dismissNodeInfoBox() {
        if (_nodeInfoBox) {
            _nodeInfoBox.remove();
            _nodeInfoBox = null;
        }
    }

    /**
     * Helper function to dismiss AIPromptBox if it exists
     */
    function dismissAIPromptBox() {
        if (_aiPromptBox) {
            _aiPromptBox.remove();
            _aiPromptBox = null;
        }
    }

    /**
     * to dismiss the image ribbon gallery if its available
     */
    function dismissImageRibbonGallery() {
        if (_imageRibbonGallery) {
            _imageRibbonGallery.remove();
            _imageRibbonGallery = null;
        }
    }

    /**
     * Helper function to dismiss all UI boxes at once
     */
    function dismissAllUIBoxes() {
        dismissNodeMoreOptionsBox();
        dismissAIPromptBox();
        dismissNodeInfoBox();
        dismissImageRibbonGallery();
    }

    /**
     * Helper function to cleanup previously clicked element highlighting and state
     */
    function cleanupPreviousElementState() {
        if (previouslyClickedElement) {
            if (previouslyClickedElement._originalOutline !== undefined) {
                previouslyClickedElement.style.outline = previouslyClickedElement._originalOutline;
            } else {
                previouslyClickedElement.style.outline = "";
            }
            delete previouslyClickedElement._originalOutline;

            clearElementBackground(previouslyClickedElement);
            if (_hoverHighlight) {
                _hoverHighlight.clear();
            }

            previouslyClickedElement = null;
        }
    }

    /**
     * This function dismisses all UI elements and cleans up application state
     * Called when user presses Esc key, clicks on HTML/Body tags, or other dismissal events
     */
    function dismissUIAndCleanupState() {
        dismissAllUIBoxes();
        cleanupPreviousElementState();
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
        if (!isElementEditable(element)) {
            return;
        }

        // Make the element editable
        element.setAttribute("contenteditable", "true");
        element.focus();
        // to compare with the new text content, if same we don't make any changes in the editor area
        const oldContent = element.textContent;

        // Move cursor to end if no existing selection
        const selection = window.getSelection();
        if (selection.rangeCount === 0 || selection.isCollapsed) {
            moveCursorToEnd(selection, element);
        }

        dismissUIAndCleanupState();

        // flag to check if escape is pressed, if pressed we prevent onBlur from handling it as keydown already handles
        let isEscapePressed = false;

        function onBlur() {
            // Small delay so that keydown can handle things first
            setTimeout(() => {
                if (isEscapePressed) {
                    isEscapePressed = false;
                    finishEditingCleanup(element);
                    return;
                }

                const newContent = element.textContent;
                if (oldContent !== newContent) {
                    finishEditing(element);
                } else { // if same content, we just cleanup things
                    finishEditingCleanup(element);
                }
            }, 10);
        }

        function onKeyDown(event) {
            if (event.key === "Escape") {
                isEscapePressed = true;
                // Cancel editing
                event.preventDefault();
                const newContent = element.textContent;
                if (oldContent !== newContent) {
                    finishEditing(element, false); // false means that the edit operation was cancelled
                } else { // no content change we can avoid sending details to the editor
                    finishEditingCleanup(element);
                }
            } else if (event.key === "Enter" && !event.shiftKey) {
                isEscapePressed = false;
                // Finish editing on Enter (unless Shift is held)
                event.preventDefault();
                finishEditing(element);
            } else if ((event.key === " " || event.key === "Spacebar") && element.tagName.toLowerCase() === 'button') {
                event.preventDefault();
                document.execCommand("insertText", false, " ");
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

    function finishEditingCleanup(element) {
        if (!isElementEditable(element) || !element.hasAttribute("contenteditable")) {
            return;
        }

        // Remove contenteditable attribute
        element.removeAttribute("contenteditable");
        dismissUIAndCleanupState();

        // Remove event listeners
        if (element._editListeners) {
            element.removeEventListener("blur", element._editListeners.blur);
            element.removeEventListener("keydown", element._editListeners.keydown);
            delete element._editListeners;
        }
    }

    // Function to finish editing and apply changes
    // isEditSuccessful: this is a boolean value, defaults to true. false only when the edit operation is cancelled
    function finishEditing(element, isEditSuccessful = true) {
        finishEditingCleanup(element);

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

    // init
    _editHandler = new DOMEditHandler(window.document);

    function registerHandlers() {
        // Always remove existing listeners first to avoid duplicates
        window.document.removeEventListener("mouseover", onElementHover);
        window.document.removeEventListener("mouseout", onElementHoverOut);
        window.document.removeEventListener("click", onClick);
        window.document.removeEventListener("dblclick", onDoubleClick);
        window.document.removeEventListener("dragover", onDragOver);
        window.document.removeEventListener("drop", onDrop);
        window.document.removeEventListener("dragleave", onDragLeave);
        window.document.removeEventListener("keydown", onKeyDown);

        if (config.isProUser) {
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
        } else {
            // Clean up any existing UI when edit features are disabled
            dismissUIAndCleanupState();
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
        "hasVisibleLivePreviewBoxes" : hasVisibleLivePreviewBoxes,
        "dismissUIAndCleanupState" : dismissUIAndCleanupState,
        "enableHoverListeners" : enableHoverListeners,
        "registerHandlers" : registerHandlers
    };
}
