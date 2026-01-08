// this is a single file sent to browser preview. keep this light. add features as extensions
// Please do not add any license header in this file as it will end up in distribution bin as is.
/**
 * RemoteFunctions define the functions to be executed in the browser. This
 * modules should define a single function that returns an object of all
 * exported functions.
 */
// eslint-disable-next-line no-unused-vars
function RemoteFunctions(config = {}) {
    const GLOBALS = {
        // given to internal elements like info box, tool box, image gallery and all other phcode internal elements
        // to distinguish between phoenix internal vs user created elements
        PHCODE_INTERNAL_ATTR: "data-phcode-internal-c15r5a9",
        DATA_BRACKETS_ID_ATTR: "data-brackets-id", // data attribute used to track elements for live preview operations
        HIGHLIGHT_CLASSNAME: "__brackets-ld-highlight" // CSS class name used for highlighting elements in live preview
    };

    // this is for bidirectional communication between phoenix and live preview
    const PhoenixComm = window._Brackets_LiveDev_PhoenixComm;
    PhoenixComm && PhoenixComm.registerLpFn("PH_Hello", function(param) {
        // this is just a test function here to check if live preview. fn call is working correctly.
        console.log("Hello World", param);
    });
    const MessageBroker = window._Brackets_MessageBroker; // to be used by plugins.

    const SHARED_STATE = {
        __description: "Use this to keep shared state for Live Preview Edit instead of window.*"
    };

    let _hoverHighlight;
    let _clickHighlight;
    let _cssSelectorHighlight; // temporary highlight for CSS selector matches in edit mode
    let _hoverLockTimer = null;
    let _cssSelectorHighlightTimer = null; // timer for clearing temporary CSS selector highlights

    // this will store the element that was clicked previously (before the new click)
    // we need this so that we can remove click styling from the previous element when a new element is clicked
    let previouslySelectedElement = null;

    var req, timeout;
    function animateHighlight(time) {
        if(req) {
            window.cancelAnimationFrame(req);
            window.clearTimeout(timeout);
        }
        req = window.requestAnimationFrame(redrawHighlights);

        timeout = setTimeout(function () {
            window.cancelAnimationFrame(req);
            req = null;
        }, time * 1000);
    }

    // the following fucntions can be in the handler and live preview will call those functions when the below
    // events happen
    const allowedHandlerFns = [
        "dismiss", // when handler gets this event, it should dismiss all ui it renders in the live preview
        "createToolBox",
        "createInfoBox",
        "createMoreOptionsDropdown",
        // render an icon or html when the selected element toolbox appears in edit mode.
        "renderToolBoxItem",
        "redraw",
        "onElementSelected", // an item is selected in live preview
        "onElementCleanup",
        "onNonEditableElementClick", // called when user clicks on a non-editable element
        "handleConfigChange",
        // below  function gets called to render the dropdown when user clicks on the ... menu in the tool box,
        // the handler should retrun html tor ender the dropdown item.
        "renderDropdownItems",
        // called when an item is selected from the more options dropdown
        "handleDropdownClick",
        "reRegisterEventHandlers",
        "handleClick", // handle click on an icon in the tool box.
        // when escape key is presses in the editor, we may need to dismiss the live edit boxes.
        "handleEscapePressFromEditor",
        // interaction blocks acts as 'kill switch' to block all kinds of click handlers
        // this is done so that links or buttons doesn't perform their natural operation in edit mode
        "registerInteractionBlocker", // to block
        "unregisterInteractionBlocker", // to unblock
        "udpateHotCornerState" // to update the hot corner button when state changes
    ];

    const _toolHandlers = new Map();
    function registerToolHandler(handlerName, handler) {
        if(_toolHandlers.get(handlerName)) {
            console.error(`lp: Tool handler '${handlerName}' already registered. Ignoring new registration`);
            return;
        }
        if (!handler || typeof handler !== "object") {
            console.error(`lp: Tool handler '${handlerName}' value is invalid ${JSON.stringify(handler)}.`);
            return;
        }
        handler.handlerName = handlerName;
        for (const key of Object.keys(handler)) {
            if (key !== "handlerName" && !allowedHandlerFns.includes(key)) {
                console.warn(`lp: Tool handler '${handlerName}' has unknown property '${key}'`,
                    `should be one of ${allowedHandlerFns.join(",")}`);
            }
        }
        _toolHandlers.set(handlerName, handler);
    }
    function getToolHandler(handlerName) {
        return _toolHandlers.get(handlerName);
    }
    function getAllToolHandlers() {
        return Array.from(_toolHandlers.values());
    }

    /**
     * check if an element is inspectable.
     * inspectable elements are those which doesn't have GLOBALS.DATA_BRACKETS_ID_ATTR ('data-brackets-id'),
     * this normally happens when content is DOM content is inserted by some scripting language
     */
    function isElementInspectable(element, onlyHighlight = false) {
        if(config.mode !== 'edit' && !onlyHighlight) {
            return false;
        }

        if(element && // element should exist
            element.tagName.toLowerCase() !== "body" && // shouldn't be the body tag
            element.tagName.toLowerCase() !== "html" && // shouldn't be the HTML tag
            // this attribute is used by phoenix internal elements
            !element.closest(`[${GLOBALS.PHCODE_INTERNAL_ATTR}]`) &&
            !_isInsideHeadTag(element)) { // shouldn't be inside the head tag like meta tags and all
            return true;
        }
        return false;
    }

    /**
     * This is a checker function for editable elements, it makes sure that the element satisfies all the required check
     * - When onlyHighlight is false → config.mode must be 'edit'
     * - When onlyHighlight is true → config.mode can be any mode (doesn't matter)
     * @param {DOMElement} element
     * @param {boolean} [onlyHighlight=false] - If true, bypasses the mode check
     * @returns {boolean} - True if the element is editable else false
     */
    function isElementEditable(element, onlyHighlight = false) {
        // for an element to be editable it should satisfy all inspectable checks and should also have data-brackets-id
        return isElementInspectable(element, onlyHighlight) && element.hasAttribute(GLOBALS.DATA_BRACKETS_ID_ATTR);
    }

    /**
     * this function calc the screen offset of an element
     *
     * @param {DOMElement} element
     * @returns {{left: number, top: number}}
     */
    function screenOffset(element) {
        const elemBounds = element.getBoundingClientRect();
        const body = window.document.body;
        let offsetTop;
        let offsetLeft;

        if (window.getComputedStyle(body).position === "static") {
            offsetLeft = elemBounds.left + window.pageXOffset;
            offsetTop = elemBounds.top + window.pageYOffset;
        } else {
            const bodyBounds = body.getBoundingClientRect();
            offsetLeft = elemBounds.left - bodyBounds.left;
            offsetTop = elemBounds.top - bodyBounds.top;
        }
        return { left: offsetLeft, top: offsetTop };
    }

    const LivePreviewView = {
        registerToolHandler: registerToolHandler,
        getToolHandler: getToolHandler,
        getAllToolHandlers: getAllToolHandlers,
        isElementEditable: isElementEditable,
        isElementInspectable: isElementInspectable,
        isElementVisible: isElementVisible,
        screenOffset: screenOffset,
        selectElement: selectElement,
        brieflyDisableHoverListeners: brieflyDisableHoverListeners,
        handleElementClick: handleElementClick,
        cleanupPreviousElementState: cleanupPreviousElementState,
        disableHoverListeners: disableHoverListeners,
        enableHoverListeners: enableHoverListeners
    };

    /**
     * @type {DOMEditHandler}
     */
    var _editHandler;

    // the below code comment is replaced by added scripts for extensibility
    // DONT_STRIP_MINIFY:REPLACE_WITH_ADDED_REMOTE_CONSTANT_SCRIPTS

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
            const remoteHighlight = {
                animateStartValue: {
                    "background-color": "rgba(0, 162, 255, 0.5)",
                    "opacity": 0
                },
                animateEndValue: {
                    "background-color": "rgba(0, 162, 255, 0)",
                    "opacity": 0.6
                },
                paddingStyling: {
                    "background-color": "rgba(200, 249, 197, 0.7)"
                },
                marginStyling: {
                    "background-color": "rgba(249, 204, 157, 0.7)"
                },
                borderColor: "rgba(200, 249, 197, 0.85)",
                showPaddingMargin: true
            };
            var elementBounds = element.getBoundingClientRect(),
                highlightDiv = window.document.createElement("div"),
                elementStyling = window.getComputedStyle(element),
                transitionDuration = parseFloat(elementStyling.getPropertyValue('transition-duration')),
                animationDuration = parseFloat(elementStyling.getPropertyValue('animation-duration'));

            highlightDiv.trackingElement = element; // save which node are we highlighting

            if (doAnimation) {
                if (transitionDuration) {
                    animateHighlight(transitionDuration);
                }

                if (animationDuration) {
                    animateHighlight(animationDuration);
                }
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

            var drawPaddingRect = function (side) {
                var elStyling = {};

                if (visualisations.horizontal.indexOf(side) >= 0) {
                    elStyling["width"] = elementStyling.getPropertyValue("padding-" + side);
                    elStyling["height"] = innerHeight + "px";
                    elStyling["top"] = 0;

                    if (borderBox) {
                        elStyling["height"] =
                            innerHeight - parseFloat(realElBorder.top) - parseFloat(realElBorder.bottom) + "px";
                    }
                } else {
                    elStyling["height"] = elementStyling.getPropertyValue("padding-" + side);
                    elStyling["width"] = innerWidth + "px";
                    elStyling["left"] = 0;

                    if (borderBox) {
                        elStyling["width"] =
                            innerWidth - parseFloat(realElBorder.left) - parseFloat(realElBorder.right) + "px";
                    }
                }

                elStyling[side] = 0;
                elStyling["position"] = "absolute";

                return elStyling;
            };

            var drawMarginRect = function (side) {
                var elStyling = {};

                var margin = [];
                margin["right"] = parseFloat(elementStyling.getPropertyValue("margin-right"));
                margin["top"] = parseFloat(elementStyling.getPropertyValue("margin-top"));
                margin["bottom"] = parseFloat(elementStyling.getPropertyValue("margin-bottom"));
                margin["left"] = parseFloat(elementStyling.getPropertyValue("margin-left"));

                if (visualisations["horizontal"].indexOf(side) >= 0) {
                    elStyling["width"] = elementStyling.getPropertyValue("margin-" + side);
                    elStyling["height"] = outerHeight + margin["top"] + margin["bottom"] + "px";
                    elStyling["top"] = "-" + (margin["top"] + parseFloat(realElBorder.top)) + "px";
                } else {
                    elStyling["height"] = elementStyling.getPropertyValue("margin-" + side);
                    elStyling["width"] = outerWidth + "px";
                    elStyling["left"] = "-" + realElBorder.left;
                }

                elStyling[side] = "-" + (margin[side] + parseFloat(realElBorder[side])) + "px";
                elStyling["position"] = "absolute";

                return elStyling;
            };

            var setVisibility = function (el) {
                if (
                    !remoteHighlight.showPaddingMargin ||
                    parseInt(el.height, 10) <= 0 ||
                    parseInt(el.width, 10) <= 0
                ) {
                    el.display = 'none';
                } else {
                    el.display = 'block';
                }
            };

            var paddingVisualisations = [
                drawPaddingRect("top"),
                drawPaddingRect("right"),
                drawPaddingRect("bottom"),
                drawPaddingRect("left")
            ];

            var marginVisualisations = [
                drawMarginRect("top"),
                drawMarginRect("right"),
                drawMarginRect("bottom"),
                drawMarginRect("left")
            ];

            var setupVisualisations = function (arr, visualConfig) {
                var i;
                for (i = 0; i < arr.length; i++) {
                    setVisibility(arr[i]);

                    // Applies to every visualisationElement (padding or margin div)
                    arr[i]["transform"] = "none";
                    var el = window.document.createElement("div"),
                        styles = Object.assign({}, visualConfig, arr[i]);

                    _setStyleValues(styles, el.style);

                    highlightDiv.appendChild(el);
                }
            };

            setupVisualisations(
                marginVisualisations,
                remoteHighlight.marginStyling
            );
            setupVisualisations(
                paddingVisualisations,
                remoteHighlight.paddingStyling
            );

            highlightDiv.className = GLOBALS.HIGHLIGHT_CLASSNAME;

            var offset = LivePreviewView.screenOffset(element);

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
                "z-index": 2147483645,
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
                "border-color": remoteHighlight.borderColor
            };

            var mergedStyles = Object.assign({}, stylesToSet,  remoteHighlight.stylesToSet);

            var animateStartValues = remoteHighlight.animateStartValue;

            var animateEndValues = remoteHighlight.animateEndValue;

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

            _setStyleValues(mergedStyles, highlightDiv.style);
            _setStyleValues(
                doAnimation ? animateStartValues : animateEndValues,
                highlightDiv.style
            );


            if (doAnimation) {
                _setStyleValues(transitionValues, highlightDiv.style);

                window.setTimeout(function () {
                    _setStyleValues(animateEndValues, highlightDiv.style);
                }, 20);
            }

            window.document.body.appendChild(highlightDiv);
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
            var i, highlights = window.document.querySelectorAll("." + GLOBALS.HIGHLIGHT_CLASSNAME),
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
        // don't want highlighting and stuff when auto scrolling or when dragging (svgs)
        // for dragging normal html elements its already taken care of...so we just add svg drag checking
        if (SHARED_STATE.isAutoScrolling || SHARED_STATE._isDraggingSVG) {
            return;
        }

        const element = event.target;
        if(!LivePreviewView.isElementInspectable(element) || element.nodeType !== Node.ELEMENT_NODE) {
            return false;
        }
        if(element && element.closest('.phcode-no-lp-edit')) {
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

            // create the info box for the hovered element
            const infoBoxHandler = LivePreviewView.getToolHandler("InfoBox");
            if (infoBoxHandler) {
                infoBoxHandler.dismiss();
                infoBoxHandler.createInfoBox(element);
            }
        }
    }

    function onElementHoverOut(event) {
        // don't want highlighting and stuff when auto scrolling
        if (SHARED_STATE.isAutoScrolling) { return; }

        const element = event.target;
        if(LivePreviewView.isElementEditable(element) && element.nodeType === Node.ELEMENT_NODE) {
            // this is to check the user's settings, if they want to show the elements highlights on hover or click
            if (_hoverHighlight && shouldShowHighlightOnHover()) {
                _hoverHighlight.clear();
                clearElementBackground(element);
                // dismiss the info box
                const infoBoxHandler = LivePreviewView.getToolHandler("InfoBox");
                if (infoBoxHandler) {
                    infoBoxHandler.dismiss();
                }
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
    function selectElement(element) {
        dismissUIAndCleanupState();
        // this should also be there when users are in highlight mode
        scrollElementToViewPort(element);

        if(!LivePreviewView.isElementInspectable(element)) {
            return false;
        }

        // when user clicks on a non-editable element
        if (!element.hasAttribute(GLOBALS.DATA_BRACKETS_ID_ATTR)) {
            getAllToolHandlers().forEach(handler => {
                if (handler.onNonEditableElementClick) {
                    handler.onNonEditableElementClick(element);
                }
            });
        }

        // make sure that the element is actually visible to the user
        if (isElementVisible(element)) {
            // Notify handlers about element selection
            getAllToolHandlers().forEach(handler => {
                if (handler.onElementSelected) {
                    handler.onElementSelected(element);
                }
            });
        }

        element._originalOutline = element.style.outline;
        const outlineColor = element.hasAttribute(GLOBALS.DATA_BRACKETS_ID_ATTR) ? "#4285F4" : "#3C3F41";
        element.style.outline = `1px solid ${outlineColor}`;

        if (!_clickHighlight) {
            _clickHighlight = new Highlight("#cfc");
        }
        _clickHighlight.clear();
        _clickHighlight.add(element, true);

        previouslySelectedElement = element;
    }

    function disableHoverListeners() {
        window.document.removeEventListener("mouseover", onElementHover);
        window.document.removeEventListener("mouseout", onElementHoverOut);
    }

    function enableHoverListeners() {
        if (config.mode === 'edit' && shouldShowHighlightOnHover()) {
            disableHoverListeners();
            window.document.addEventListener("mouseover", onElementHover);
            window.document.addEventListener("mouseout", onElementHoverOut);
        }
    }

    /**
     * this function disables hover listeners for 800ms to prevent ui conclicts
     * Used when user performs click actions to avoid UI box conflicts
     */
    function brieflyDisableHoverListeners() {
        if (_hoverLockTimer) {
            clearTimeout(_hoverLockTimer);
        }

        disableHoverListeners();
        _hoverLockTimer = setTimeout(() => {
            enableHoverListeners();
            _hoverLockTimer = null;
        }, 800);
    }

    /**
     * this function is called when user clicks on an element in the LP when in edit mode
     *
     * @param {HTMLElement} element - The clicked element
     * @param {Event} event - The click event
     */
    function handleElementClick(element, event) {
        if(element && element.closest('.phcode-no-lp-edit')) {
            return;
        }
        if (!LivePreviewView.isElementInspectable(element)) {
            dismissUIAndCleanupState();
            return;
        }

        // if anything is currently selected, we need to clear that
        const selection = window.getSelection();
        if (selection && selection.toString().length > 0) {
            selection.removeAllRanges();
        }

        // send cursor movement message to editor so cursor jumps to clicked element
        if (element.hasAttribute(GLOBALS.DATA_BRACKETS_ID_ATTR)) {
            MessageBroker.send({
                "tagId": element.getAttribute(GLOBALS.DATA_BRACKETS_ID_ATTR),
                "nodeID": element.id,
                "nodeClassList": element.classList,
                "nodeName": element.nodeName,
                "allSelectors": window.getAllInheritedSelectorsInOrder(element),
                "contentEditable": element.contentEditable === "true",
                "clicked": true
            });
        }

        brieflyDisableHoverListeners();
        selectElement(element);
    }

    // clear temporary CSS selector highlights
    function clearCssSelectorHighlight() {
        if (_cssSelectorHighlightTimer) {
            clearTimeout(_cssSelectorHighlightTimer);
            _cssSelectorHighlightTimer = null;
        }
        if (_cssSelectorHighlight) {
            _cssSelectorHighlight.clear();
            _cssSelectorHighlight = null;
        }
    }

    // create temporary CSS selector highlights for edit mode
    function createCssSelectorHighlight(nodes, rule) {
        // Clear any existing temporary highlights
        clearCssSelectorHighlight();

        // Create new temporary highlight for all matching elements
        _cssSelectorHighlight = new Highlight("#cfc");
        for (var i = 0; i < nodes.length; i++) {
            if (LivePreviewView.isElementInspectable(nodes[i], true) && nodes[i].nodeType === Node.ELEMENT_NODE) {
                _cssSelectorHighlight.add(nodes[i], true);
            }
        }
        _cssSelectorHighlight.selector = rule;

        // Clear temporary highlights after 2 seconds
        _cssSelectorHighlightTimer = setTimeout(clearCssSelectorHighlight, 2000);
    }

    // remove active highlights
    function hideHighlight() {
        if (_clickHighlight) {
            _clickHighlight.clear();
            _clickHighlight = null;
        }
        if (_hoverHighlight) {
            _hoverHighlight.clear();
            _hoverHighlight = null;
        }
        clearCssSelectorHighlight();
    }

    // highlight an element
    function highlight(element, clear) {
        if (!_clickHighlight) {
            _clickHighlight = new Highlight("#cfc");
        }
        if (clear) {
            _clickHighlight.clear();
        }
        if (LivePreviewView.isElementInspectable(element, true) && element.nodeType === Node.ELEMENT_NODE) {
            _clickHighlight.add(element, true);
        }
    }

    /**
     * Find the best element to select from a list of matched nodes
     * Prefers: previously selected element > parent of selected > first valid element
     * @param {NodeList} nodes - The nodes matching the CSS rule
     * @param {string} rule - The CSS rule used to match nodes
     * @returns {{element: Element|null, skipSelection: boolean}} - The element to select and whether to skip selection
     */
    function findBestElementToSelect(nodes, rule) {
        let firstValidElement = null;
        let elementToSelect = null;

        for (let i = 0; i < nodes.length; i++) {
            if(!LivePreviewView.isElementInspectable(nodes[i], true) || nodes[i].tagName === "BR") {
                continue;
            }

            // Store the first valid element as a fallback
            if (!firstValidElement) {
                firstValidElement = nodes[i];
            }

            // if hover lock timer is active, skip selection as it's already handled by handleElementClick
            if (_hoverLockTimer && nodes[i] === previouslySelectedElement) {
                return { element: null, skipSelection: true };
            }

            // Check if the currently selected element or any of its parents have a highlight
            if (previouslySelectedElement) {
                if (nodes[i] === previouslySelectedElement) {
                    // Exact match - prefer this
                    elementToSelect = previouslySelectedElement;
                    break;
                } else if (!elementToSelect &&
                    previouslySelectedElement.closest && nodes[i] === previouslySelectedElement.closest(rule)) {
                    // The node is a parent of the currently selected element. we stop at the first parent, after that
                    // we only scan for exact match
                    elementToSelect = nodes[i];
                }
            }
        }

        return {
            element: elementToSelect || firstValidElement,
            skipSelection: false
        };
    }

    /**
     * Highlight all elements matching a CSS rule and select the best one
     * @param {string} rule - The CSS rule to highlight
     */
    function highlightRule(rule) {
        hideHighlight();
        const nodes = window.document.querySelectorAll(rule);

        // Highlight all matching nodes
        for (let i = 0; i < nodes.length; i++) {
            highlight(nodes[i]);
        }

        if (_clickHighlight) {
            _clickHighlight.selector = rule;
        }

        // Find and select the best element
        const { element, skipSelection } = findBestElementToSelect(nodes, rule);

        if (!skipSelection) {
            if (element) {
                selectElement(element);
            } else {
                // No valid element found, dismiss UI
                dismissUIAndCleanupState();
            }
        }

        // In edit mode, create temporary highlights AFTER selection to avoid clearing
        if (config.mode === 'edit') {
            createCssSelectorHighlight(nodes, rule);
        }
    }

    // recreate UI boxes so that they are placed properly
    function redrawUIBoxes() {
        if (SHARED_STATE._toolBox) {
            const element = SHARED_STATE._toolBox.element;
            const toolBoxHandler = LivePreviewView.getToolHandler("ToolBox");
            if (toolBoxHandler) {
                toolBoxHandler.dismiss();
                toolBoxHandler.createToolBox(element);
            }
        }

        if (SHARED_STATE._infoBox) {
            const element = SHARED_STATE._infoBox.element;
            const infoBoxHandler = LivePreviewView.getToolHandler("InfoBox");
            if (infoBoxHandler) {
                infoBoxHandler.dismiss();
                infoBoxHandler.createInfoBox(element);
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
        // Call redraw on all registered handlers
        getAllToolHandlers().forEach(handler => {
            if (handler.redraw) {
                handler.redraw();
            }
        });
    }

    window.addEventListener("resize", redrawEverything);

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

        var results = this.htmlDocument.querySelectorAll(`[${GLOBALS.DATA_BRACKETS_ID_ATTR}='${id}']`);
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
     * @return {boolean} true if node expects its content to be
     * raw text (not parsed for entities) according to the HTML5 spec.
     */
    function _isRawTextNode(node) {
        return (
            node.nodeType === Node.ELEMENT_NODE &&
            /script|style|noscript|noframes|noembed|iframe|xmp/i.test(node.tagName)
        );
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
            } while (node && node.className === GLOBALS.HIGHLIGHT_CLASSNAME);
            return node;
        }
        function nextIgnoringHighlights(node) {
            do {
                node = node.nextSibling;
            } while (node && node.className === GLOBALS.HIGHLIGHT_CLASSNAME);
            return node;
        }
        function lastChildIgnoringHighlights(node) {
            node = (node.childNodes.length ? node.childNodes.item(node.childNodes.length - 1) : null);
            if (node && node.className === GLOBALS.HIGHLIGHT_CLASSNAME) {
                node = prevIgnoringHighlights(node);
            }
            return node;
        }

        var start           = (edit.afterID)  ? this._queryBracketsID(edit.afterID)  : null,
            startMissing    = edit.afterID && !start,
            end             = (edit.beforeID) ? this._queryBracketsID(edit.beforeID) : null,
            endMissing      = edit.beforeID && !end,
            moveNext        = start && nextIgnoringHighlights(start),

            current         = moveNext ||
            (end && prevIgnoringHighlights(end)) || lastChildIgnoringHighlights(targetElement),

            next,

            textNode        = (edit.content !== undefined) ?
                this.htmlDocument.createTextNode(
                    _isRawTextNode(targetElement) ? edit.content : this._parseEntities(edit.content)
                ) : null,

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
            var editIsSpecialTag = edit.type === "elementInsert" &&
                (edit.tag === "html" || edit.tag === "head" || edit.tag === "body");

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

            targetID = new RegExp("textReplace|textDelete|textInsert|elementInsert|elementMove").test(edit.type)
                ? edit.parentID : edit.tagID;

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
                    // If the parent element is an instance of SVGElement or we're inserting an <svg> tag directly,
                    // we need to create it in the SVG namespace otherwise SVG elements won't render
                    // correctly in live preview until it's reloaded
                    if (targetElement instanceof SVGElement || edit.tag.toLowerCase() === "svg") {
                        childElement = self.htmlDocument.createElementNS("http://www.w3.org/2000/svg", edit.tag);
                    } else {
                        childElement = self.htmlDocument.createElement(edit.tag);
                    }
                }

                Object.keys(edit.attributes).forEach(function (attr) {
                    childElement.setAttribute(attr, self._parseEntities(edit.attributes[attr]));
                });
                childElement.setAttribute(GLOBALS.DATA_BRACKETS_ID_ATTR, edit.tagID);

                if (!editIsSpecialTag) {
                    self._insertChildNode(targetElement, childElement, edit);
                }
                break;
            case "elementMove":
                childElement = self._queryBracketsID(edit.tagID);
                self._insertChildNode(targetElement, childElement, edit);
                break;
            case "textInsert":
                var textElement = self.htmlDocument.createTextNode(
                    _isRawTextNode(targetElement) ? edit.content : self._parseEntities(edit.content)
                );
                self._insertChildNode(targetElement, textElement, edit);
                break;
            case "textReplace":
            case "textDelete":
                self._textReplace(targetElement, edit);
                break;
            }
        });

        this.rememberedNodes = {};

        // this check makes sure that if the element is no more in the DOM then we remove it
        if (previouslySelectedElement && !previouslySelectedElement.isConnected) {
            dismissUIAndCleanupState();
        } else {
            redrawEverything();
        }
    };

    function applyDOMEdits(edits) {
        _editHandler.apply(edits);
    }

    function updateConfig(newConfig) {
        const oldConfig = config;
        config = newConfig;

        // Notify handlers about config changes
        getAllToolHandlers().forEach(handler => {
            if (handler.handleConfigChange) {
                handler.handleConfigChange(oldConfig, config);
            }
        });

        // Determine if configuration has changed significantly
        const oldHighlightMode = oldConfig.elemHighlights ? oldConfig.elemHighlights.toLowerCase() : "hover";
        const newHighlightMode = getHighlightMode();
        const highlightModeChanged = oldHighlightMode !== newHighlightMode;
        const isModeChanged = oldConfig.mode !== config.mode;

        // Update hot corner state when mode changes
        // Show animation when mode changes to help users discover the feature
        if (isModeChanged && SHARED_STATE._hotCorner) {
            SHARED_STATE._hotCorner.updateState(config.mode === 'preview', true);
        }

        // Handle configuration changes
        if (highlightModeChanged || isModeChanged) {
            _handleConfigurationChange();
        }

        registerHandlers();
        return JSON.stringify(config);
    }

    /**
     * when config is changed we clear all the highlighting and stuff
     */
    function _handleConfigurationChange() {
        hideHighlight();
        dismissUIAndCleanupState();
    }

    /**
     * Helper function to cleanup previously clicked element highlighting and state
     */
    function cleanupPreviousElementState() {
        if (previouslySelectedElement) {
            if (previouslySelectedElement._originalOutline !== undefined) {
                previouslySelectedElement.style.outline = previouslySelectedElement._originalOutline;
            } else {
                previouslySelectedElement.style.outline = "";
            }
            delete previouslySelectedElement._originalOutline;
            previouslySelectedElement = null;
        }

        if (config.mode === 'edit') {
            hideHighlight();

            // Notify handlers about cleanup
            getAllToolHandlers().forEach(handler => {
                if (handler.onElementCleanup) {
                    handler.onElementCleanup();
                }
            });
        }
    }

    /**
     * This function dismisses all UI elements and cleans up application state
     * Called when user presses Esc key, clicks on HTML/Body tags, or other dismissal events
     */
    function dismissUIAndCleanupState() {
        getAllToolHandlers().forEach(handler => (handler.dismiss && handler.dismiss())); // to dismiss all UI boxes
        cleanupPreviousElementState();
    }

    // init
    _editHandler = new DOMEditHandler(window.document);

    function registerHandlers() {
        hideHighlight(); // clear previous highlighting
        disableHoverListeners(); // Always remove existing listeners first to avoid duplicates
        getAllToolHandlers().forEach(handler => {
            if (handler.unregisterInteractionBlocker) {
                handler.unregisterInteractionBlocker();
            }
        });

        if (config.mode === 'edit') {
            // Initialize hover highlight with Chrome-like colors
            _hoverHighlight = new Highlight("#c8f9c5", true); // Green similar to Chrome's padding color

            // Initialize click highlight with animation
            _clickHighlight = new Highlight("#cfc", true); // Light green for click highlight

            // register the event handlers
            enableHoverListeners();

            // this is to block all the interactions of the user created elements
            // so that lets say user created link doesn't redirect in edit mode
            getAllToolHandlers().forEach(handler => {
                if (handler.registerInteractionBlocker) {
                    handler.registerInteractionBlocker();
                }
            });
        } else {
            // Clean up any existing UI when edit features are disabled
            dismissUIAndCleanupState();
        }
        getAllToolHandlers().forEach(handler => {
            if (handler.reRegisterEventHandlers) {
                handler.reRegisterEventHandlers();
            }
        });
    }

    function _escapeKeyPressInEditor() {
        enableHoverListeners(); // so that if hover lock is there it will get cleared
        dismissUIAndCleanupState();
        getAllToolHandlers().forEach(handler => {
            if (handler.handleEscapePressFromEditor) {
                handler.handleEscapePressFromEditor();
            }
        });
    }

    // we need to refresh the config once the load is completed
    // this is important because messageBroker gets ready for use only when load fires
    window.addEventListener('load', function() {
        MessageBroker.send({
            requestConfigRefresh: true
        });
    });

    let customReturns = {};
    // only apis that needs to be called from phoenix js layer should be customReturns. APis that are shared within
    // the remote function context only should not be in customReturns and should be in
    // either SHARED_STATE for state vars, GLOBALS for global vars, or LivePreviewView for shared functions.
    customReturns = { // we have to do this else the minifier will strip the customReturns variable
        ...customReturns,
        "DOMEditHandler": DOMEditHandler,
        "hideHighlight": hideHighlight,
        "highlight": highlight,
        "highlightRule": highlightRule,
        "redrawHighlights": redrawHighlights,
        "redrawEverything": redrawEverything,
        "applyDOMEdits": applyDOMEdits,
        "updateConfig": updateConfig,
        "dismissUIAndCleanupState": dismissUIAndCleanupState,
        "escapeKeyPressInEditor": _escapeKeyPressInEditor,
        "getMode": function() { return config.mode; }
    };

    // the below code comment is replaced by added scripts for extensibility
    // DONT_STRIP_MINIFY:REPLACE_WITH_ADDED_REMOTE_SCRIPTS

    registerHandlers();
    return customReturns;
}
