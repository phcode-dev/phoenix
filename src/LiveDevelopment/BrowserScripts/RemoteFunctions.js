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
        __description: "Use this to keep shared state for Live Preview Edit instead of window.*",
        _suppressDOMEditDismissal: false,
        _suppressDOMEditDismissalTimeout: null
    };

    let _hoverHighlight;
    let _clickHighlight;
    let _cssSelectorHighlight; // temporary highlight for CSS selector matches in edit mode
    let _hoverLockTimer = null;
    let _cssSelectorHighlightTimer = null;
    let _lastHoverTarget = null; // tracks the element currently under the mouse (for same-element skip)
    let _pendingHoverRAF = null; // pending requestAnimationFrame ID for hover updates

    // this will store the element that was clicked previously (before the new click)
    // we need this so that we can remove click styling from the previous element when a new element is clicked
    let previouslySelectedElement = null;
    // Expose the currently selected element globally for external access
    window.__current_ph_lp_selected = null;

    const COLORS = {
        highlightPadding: "rgba(147, 196, 125, 0.55)",
        highlightMargin: "rgba(246, 178, 107, 0.66)",
        outlineEditable: "#4285F4",
        outlineNonEditable: "#3C3F41"
    };

    // the following fucntions can be in the handler and live preview will call those functions when the below
    // events happen
    const allowedHandlerFns = [
        "dismiss", // when handler gets this event, it should dismiss all ui it renders in the live preview
        "createToolBox",
        "createInfoBox",
        "showHoverBox",
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
        "handleEscapePress",
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
        enableHoverListeners: enableHoverListeners,
        redrawHighlights: redrawHighlights,
        redrawEverything: redrawEverything
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

    // Shadow DOM host for highlight overlays — isolates our UI from user page CSS.
    let _highlightShadowHost = null;
    let _highlightShadowRoot = null;

    const HIGHLIGHT_CSS = `:host {
        all: initial !important;
    }

    .overlay-container {
        position: absolute !important;
        z-index: 2147483645 !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        pointer-events: none !important;
        box-sizing: border-box !important;
    }

    .rect {
        position: absolute !important;
    }

    .overlay-container.hidden {
        display: none !important;
    }

    .outline {
        position: absolute !important;
        box-sizing: border-box !important;
        pointer-events: none !important;
    }`;

    function _ensureHighlightShadowRoot() {
        if (_highlightShadowRoot) {
            return _highlightShadowRoot;
        }
        _highlightShadowHost = window.document.createElement("div");
        _highlightShadowHost.className = GLOBALS.HIGHLIGHT_CLASSNAME;
        _highlightShadowHost.setAttribute(GLOBALS.PHCODE_INTERNAL_ATTR, "true");
        _highlightShadowRoot = _highlightShadowHost.attachShadow({ mode: "open" });
        _highlightShadowRoot.innerHTML = `<style>${HIGHLIGHT_CSS}</style>`;
        window.document.body.appendChild(_highlightShadowHost);
        return _highlightShadowRoot;
    }

    // Overlay pool — overlays are created once and reused across highlights.
    // When released, they stay in the shadow DOM (hidden) ready for instant reuse.
    // This eliminates all DOM creation/destruction from the highlight hot paths.
    const _overlayPool = [];

    function _createOverlayStructure() {
        const div = window.document.createElement("div");
        div.className = "overlay-container hidden";

        function createRect() {
            const r = window.document.createElement("div");
            r.className = "rect";
            return r;
        }

        const padTop = createRect(), padBottom = createRect(),
            padLeft = createRect(), padRight = createRect();
        const marTop = createRect(), marBottom = createRect(),
            marLeft = createRect(), marRight = createRect();
        const outline = window.document.createElement("div");
        outline.className = "outline";

        div.appendChild(padTop);
        div.appendChild(padBottom);
        div.appendChild(padLeft);
        div.appendChild(padRight);
        div.appendChild(marTop);
        div.appendChild(marBottom);
        div.appendChild(marLeft);
        div.appendChild(marRight);
        div.appendChild(outline);

        // Cache child references for O(1) access during updates
        div._refs = {
            padTop, padBottom, padLeft, padRight,
            marTop, marBottom, marLeft, marRight,
            outline
        };

        _ensureHighlightShadowRoot().appendChild(div);
        return div;
    }

    function _getOverlay() {
        return _overlayPool.length > 0 ? _overlayPool.pop() : _createOverlayStructure();
    }

    function _releaseOverlay(overlay) {
        overlay.classList.add('hidden');
        overlay.trackingElement = null;
        _overlayPool.push(overlay);
    }

    // Update an existing overlay's position, dimensions, and colors to match the target element.
    // No DOM elements are created or destroyed — only style properties are updated.
    function _updateOverlay(overlay, element) {
        const bounds = element.getBoundingClientRect();
        if (bounds.width === 0 && bounds.height === 0) {
            overlay.classList.add('hidden');
            return;
        }

        const cs = window.getComputedStyle(element);

        // Parse box model values (getComputedStyle always resolves to px)
        const bt = parseFloat(cs.borderTopWidth) || 0,
            br = parseFloat(cs.borderRightWidth) || 0,
            bb = parseFloat(cs.borderBottomWidth) || 0,
            bl = parseFloat(cs.borderLeftWidth) || 0;
        const pt = parseFloat(cs.paddingTop) || 0,
            pr = parseFloat(cs.paddingRight) || 0,
            pb = parseFloat(cs.paddingBottom) || 0,
            pl = parseFloat(cs.paddingLeft) || 0;
        const mt = parseFloat(cs.marginTop) || 0,
            mr = parseFloat(cs.marginRight) || 0,
            mb = parseFloat(cs.marginBottom) || 0,
            ml = parseFloat(cs.marginLeft) || 0;

        // Compute the 4 absolute boxes exactly like dev tools:
        // getBoundingClientRect() always returns the border box regardless of box-sizing.
        const scroll = LivePreviewView.screenOffset(element);
        const borderBox = {
            left: scroll.left,
            top: scroll.top,
            width: bounds.width,
            height: bounds.height
        };
        const paddingBox = {
            left: borderBox.left + bl,
            top: borderBox.top + bt,
            width: borderBox.width - bl - br,
            height: borderBox.height - bt - bb
        };
        const contentBox = {
            left: paddingBox.left + pl,
            top: paddingBox.top + pt,
            width: paddingBox.width - pl - pr,
            height: paddingBox.height - pt - pb
        };
        const marginBox = {
            left: borderBox.left - ml,
            top: borderBox.top - mt,
            width: borderBox.width + ml + mr,
            height: borderBox.height + mt + mb
        };

        // Update container position
        overlay.trackingElement = element;
        overlay.style.left = marginBox.left + "px";
        overlay.style.top = marginBox.top + "px";
        overlay.style.width = marginBox.width + "px";
        overlay.style.height = marginBox.height + "px";
        overlay.classList.remove('hidden');

        const refs = overlay._refs;
        const mLeft = marginBox.left;

        // Update a rect's position, size, and color in place
        function setRect(rect, left, top, width, height, color) {
            const s = rect.style;
            s.left = (left - mLeft) + "px";
            s.top = (top - marginBox.top) + "px";
            s.width = Math.max(0, width) + "px";
            s.height = Math.max(0, height) + "px";
            s.backgroundColor = color;
        }

        // Padding region
        const padColor = COLORS.highlightPadding;
        setRect(refs.padTop, paddingBox.left, paddingBox.top, paddingBox.width, pt, padColor);
        setRect(refs.padBottom, paddingBox.left, contentBox.top + contentBox.height, paddingBox.width, pb, padColor);
        setRect(refs.padLeft, paddingBox.left, contentBox.top, pl, contentBox.height, padColor);
        setRect(refs.padRight, contentBox.left + contentBox.width, contentBox.top, pr, contentBox.height, padColor);

        // Margin region
        const margColor = COLORS.highlightMargin;
        setRect(refs.marTop, marginBox.left, marginBox.top, marginBox.width, mt, margColor);
        setRect(refs.marBottom, marginBox.left, borderBox.top + borderBox.height, marginBox.width, mb, margColor);
        setRect(refs.marLeft, marginBox.left, borderBox.top, ml, borderBox.height, margColor);
        setRect(refs.marRight, borderBox.left + borderBox.width, borderBox.top, mr, borderBox.height, margColor);

        // Outline
        const isEditable = element.hasAttribute(GLOBALS.DATA_BRACKETS_ID_ATTR);
        const outlineColor = isEditable ? COLORS.outlineEditable : COLORS.outlineNonEditable;
        const outlineStyle = refs.outline.style;
        outlineStyle.left = (borderBox.left - mLeft) + "px";
        outlineStyle.top = (borderBox.top - marginBox.top) + "px";
        outlineStyle.width = borderBox.width + "px";
        outlineStyle.height = borderBox.height + "px";
        outlineStyle.border = `1px solid ${outlineColor}`;
    }

    function Highlight(trigger) {
        this.trigger = !!trigger;
        this.elements = [];
        this.selector = "";
        this._overlays = [];
    }

    Highlight.prototype = {
        add: function (element) {
            if (this.elements.includes(element) || element === window.document) {
                return;
            }
            if (this.trigger) {
                _trigger(element, "highlight", 1);
            }

            this.elements.push(element);
            const overlay = _getOverlay();
            this._overlays.push(overlay);
            _updateOverlay(overlay, element);
        },

        clear: function () {
            this._overlays.forEach(function (overlay) {
                _releaseOverlay(overlay);
            });
            this._overlays = [];

            if (this.trigger) {
                this.elements.forEach(function (el) {
                    _trigger(el, "highlight", 0);
                });
            }

            this.elements = [];
        },

        redraw: function () {
            const elements = this.selector
                ? Array.from(window.document.querySelectorAll(this.selector))
                : this.elements.slice();

            // Adjust overlay count to match element count
            while (this._overlays.length > elements.length) {
                _releaseOverlay(this._overlays.pop());
            }
            while (this._overlays.length < elements.length) {
                this._overlays.push(_getOverlay());
            }

            this.elements = elements;

            // Update all overlays in place — no DOM creation or destruction
            for (let i = 0; i < elements.length; i++) {
                _updateOverlay(this._overlays[i], elements[i]);
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

    /**
     * Applies the current hover state in a single batched DOM update.
     * Called once per animation frame via requestAnimationFrame.
     * _lastHoverTarget holds the element to highlight (or null to clear).
     */
    function _applyHoverState() {
        _pendingHoverRAF = null;

        if (!_hoverHighlight || !shouldShowHighlightOnHover()) {
            return;
        }

        _hoverHighlight.clear();
        const hoverBoxHandler = LivePreviewView.getToolHandler("HoverBox");
        if (hoverBoxHandler) {
            hoverBoxHandler.dismiss();
        }

        const element = _lastHoverTarget;
        // Show hover overlay + hover box only for non-selected elements
        if (element && element !== previouslySelectedElement) {
            _hoverHighlight.add(element);
            if (hoverBoxHandler) {
                hoverBoxHandler.showHoverBox(element);
            }
        }
    }

    /**
     * Schedules a hover state update for the next animation frame.
     * Multiple calls within one frame collapse into a single DOM update.
     */
    function _scheduleHoverUpdate() {
        if (!_pendingHoverRAF) {
            _pendingHoverRAF = requestAnimationFrame(_applyHoverState);
        }
    }

    function onElementHover(event) {
        // don't want highlighting and stuff when auto scrolling or when dragging (svgs)
        // for dragging normal html elements its already taken care of...so we just add svg drag checking
        if (SHARED_STATE.isAutoScrolling || SHARED_STATE._isDraggingSVG) {
            return;
        }

        const element = event.target;
        if(!LivePreviewView.isElementInspectable(element) || element.nodeType !== Node.ELEMENT_NODE) {
            return;
        }
        if(element && (element.closest('.phcode-no-lp-edit') || element.classList.contains('phcode-no-lp-edit-this'))) {
            return;
        }

        // Same element as last hover — nothing changed, skip entirely
        if (element === _lastHoverTarget) {
            return;
        }
        _lastHoverTarget = element;

        // if _hoverHighlight is uninitialized, initialize it
        if (!_hoverHighlight && shouldShowHighlightOnHover()) {
            _hoverHighlight = new Highlight(true);
        }

        if (_hoverHighlight && shouldShowHighlightOnHover()) {
            _scheduleHoverUpdate();
        }
    }

    function onElementHoverOut(event) {
        // don't want highlighting and stuff when auto scrolling
        if (SHARED_STATE.isAutoScrolling) { return; }

        const element = event.target;
        // Use isElementInspectable (not isElementEditable) so that JS-rendered
        // elements also get their hover highlight and hover box properly dismissed.
        if(LivePreviewView.isElementInspectable(element) && element.nodeType === Node.ELEMENT_NODE) {
            if (_hoverHighlight && shouldShowHighlightOnHover()) {
                _lastHoverTarget = null;
                _scheduleHoverUpdate();
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
     * @param {boolean} [fromEditor] - If true, this is an editor-cursor-driven selection;
     *   only lightweight highlights (outline, margin/padding overlay) are shown, not interactive
     *   UI like control box, spacing handles, or measurements.
     */
    function selectElement(element, fromEditor) {
        dismissUIAndCleanupState();
        // this should also be there when users are in highlight mode
        scrollElementToViewPort(element);

        if(!LivePreviewView.isElementInspectable(element, true)) {
            return false;
        }

        // Only invoke tool handlers for user-initiated clicks in the live preview,
        // not for editor cursor movements which should only show lightweight highlights
        if (!fromEditor) {
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
        }

        if (!_clickHighlight) {
            _clickHighlight = new Highlight();
        }
        _clickHighlight.clear();
        _clickHighlight.add(element);

        previouslySelectedElement = element;
        window.__current_ph_lp_selected = element;
    }

    function disableHoverListeners() {
        window.document.removeEventListener("mouseover", onElementHover);
        window.document.removeEventListener("mouseout", onElementHoverOut);
        // Cancel any pending rAF hover update so stale callbacks don't fire
        if (_pendingHoverRAF) {
            cancelAnimationFrame(_pendingHoverRAF);
            _pendingHoverRAF = null;
        }
        _lastHoverTarget = null;
    }

    function enableHoverListeners() {
        // don't enable hover listeners if user is currently editing an element
        // this was added to fix a specific bug:
        // lets say user double clicked an element: so as soon as the first click is made,
        // 'breiflyDisableHoverListeners' is called which has a timer to re-enable hover listeners,
        // because of which even during editing the hover listeners were working
        if (SHARED_STATE._currentlyEditingElement) {
            return;
        }
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
        // Check for dismiss action first - dismiss LP editing when clicked (takes precedence over no-edit)
        if(element && (
            element.closest('.phcode-dismiss-lp-edit') || element.classList.contains('phcode-dismiss-lp-edit-this'))) {
            dismissUIAndCleanupState();
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        if(element && (element.closest('.phcode-no-lp-edit') || element.classList.contains('phcode-no-lp-edit-this'))) {
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
        if (element.hasAttribute(GLOBALS.DATA_BRACKETS_ID_ATTR) &&
            config.syncSourceAndPreview !== false) {
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

    // clear CSS selector highlights
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

    // create CSS selector highlights for edit mode
    function createCssSelectorHighlight(nodes, rule) {
        // Clear any existing highlights
        clearCssSelectorHighlight();

        // Highlight all matching elements except the selected one
        // (it already has a click highlight)
        _cssSelectorHighlight = new Highlight();
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i] !== previouslySelectedElement &&
                LivePreviewView.isElementInspectable(nodes[i], true) &&
                nodes[i].nodeType === Node.ELEMENT_NODE) {
                _cssSelectorHighlight.add(nodes[i]);
            }
        }
        _cssSelectorHighlight.selector = rule;
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
            _clickHighlight = new Highlight();
        }
        if (clear) {
            _clickHighlight.clear();
        }
        if (LivePreviewView.isElementInspectable(element, true) && element.nodeType === Node.ELEMENT_NODE) {
            _clickHighlight.add(element);
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

        // Filter out the universal selector (*) from the rule - highlighting everything
        // is not useful, similar to how we skip html/body in isElementInspectable.
        // The rule can be a comma-separated list of selectors (from multi-cursor),
        // so we filter out any standalone * segments and keep valid ones.
        rule = rule.split(",").map(s => s.trim()).filter(s => s !== "*").join(",");
        if (!rule) {
            dismissUIAndCleanupState();
            return;
        }

        const nodes = window.document.querySelectorAll(rule);

        // Highlight all matching nodes
        for (let i = 0; i < nodes.length; i++) {
            highlight(nodes[i]);
        }

        if (_clickHighlight) {
            _clickHighlight.selector = rule;
        }

        // In edit mode, select the best element and create temporary highlights for the rest.
        // In highlight mode, skip selection so all matching elements stay highlighted equally.
        if (config.mode === 'edit') {
            const { element, skipSelection } = findBestElementToSelect(nodes, rule);

            if (!skipSelection) {
                if (element) {
                    selectElement(element, true);
                } else {
                    // No valid element found, dismiss UI
                    dismissUIAndCleanupState();
                }
            }

            createCssSelectorHighlight(nodes, rule);
        }
    }

    // recreate UI boxes so that they are placed properly
    function redrawUIBoxes() {
        // commented out for unified box redesign
        // if (SHARED_STATE._toolBox) {
        //     const element = SHARED_STATE._toolBox.element;
        //     const toolBoxHandler = LivePreviewView.getToolHandler("ToolBox");
        //     if (toolBoxHandler) {
        //         toolBoxHandler.dismiss();
        //         toolBoxHandler.createToolBox(element);
        //     }
        // }

        // if (SHARED_STATE._infoBox) {
        //     const element = SHARED_STATE._infoBox.element;
        //     const infoBoxHandler = LivePreviewView.getToolHandler("InfoBox");
        //     if (infoBoxHandler) {
        //         infoBoxHandler.dismiss();
        //         infoBoxHandler.createInfoBox(element);
        //     }
        // }
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

    // Throttle resize redraws to one per animation frame — avoids redundant
    // layout reads when the browser fires multiple resize events per frame.
    let _pendingResizeRAF = null;
    function _onWindowResize() {
        if (!_pendingResizeRAF) {
            _pendingResizeRAF = requestAnimationFrame(function () {
                _pendingResizeRAF = null;
                redrawEverything();
            });
        }
    }
    window.addEventListener("resize", _onWindowResize);

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
        // skip this check if suppression is active (e.g., when some internal feature updates source)
        if (!SHARED_STATE._suppressDOMEditDismissal) {
            if (previouslySelectedElement && !previouslySelectedElement.isConnected) {
                dismissUIAndCleanupState();
            } else {
                redrawEverything();
            }
        } else {
            // Suppression is active (e.g., control box initiated a source edit)
            if (previouslySelectedElement && !previouslySelectedElement.isConnected) {
                let freshElement = null;

                // Strategy 1: Tree path (most reliable — works even with duplicate
                // text content and tag changes). Stored when suppression was activated.
                if (SHARED_STATE._suppressedElementPath) {
                    freshElement = _getElementByTreePath(SHARED_STATE._suppressedElementPath);
                }

                // Strategy 2: brackets-id (works when IDs are preserved)
                if (!freshElement) {
                    const bracketsId = previouslySelectedElement.getAttribute(GLOBALS.DATA_BRACKETS_ID_ATTR);
                    if (bracketsId) {
                        freshElement = document.querySelector(
                            '[' + GLOBALS.DATA_BRACKETS_ID_ATTR + '="' + bracketsId + '"]'
                        );
                    }
                }

                // Strategy 3: Text + tag match (fallback — search reverse for deepest match)
                if (!freshElement) {
                    const oldText = previouslySelectedElement.textContent;
                    const oldTag = previouslySelectedElement.tagName;
                    let candidates = document.querySelectorAll(
                        oldTag.toLowerCase() + '[' + GLOBALS.DATA_BRACKETS_ID_ATTR + ']'
                    );
                    for (let i = candidates.length - 1; i >= 0; i--) {
                        if (candidates[i].textContent === oldText) {
                            freshElement = candidates[i];
                            break;
                        }
                    }
                    // Broaden if tag changed (e.g. h2→footer)
                    if (!freshElement) {
                        candidates = document.querySelectorAll('[' + GLOBALS.DATA_BRACKETS_ID_ATTR + ']');
                        for (let i = candidates.length - 1; i >= 0; i--) {
                            if (candidates[i].textContent === oldText) {
                                freshElement = candidates[i];
                                break;
                            }
                        }
                    }
                }

                if (freshElement) {
                    if (_clickHighlight) {
                        _clickHighlight.clear();
                        _clickHighlight.add(freshElement);
                    }
                    previouslySelectedElement = freshElement;
                    window.__current_ph_lp_selected = freshElement;
                    redrawEverything();
                }
            }
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

        // Clear highlights when sync is turned off
        const syncTurnedOff = oldConfig.syncSourceAndPreview !== false &&
            config.syncSourceAndPreview === false;

        // Handle configuration changes
        if (highlightModeChanged || isModeChanged || syncTurnedOff) {
            _handleConfigurationChange();
        }

        // Preserve the currently selected element across re-registration
        // so that toggling options (e.g. show measurements)
        // doesn't clear the element highlighting.
        const selectedBeforeReregister = previouslySelectedElement;
        registerHandlers();
        if (!isModeChanged && !highlightModeChanged && !syncTurnedOff
            && selectedBeforeReregister && config.mode === 'edit') {
            // Restore the click highlight for the previously selected element
            if (!_clickHighlight) {
                _clickHighlight = new Highlight(true);
            }
            _clickHighlight.add(selectedBeforeReregister);
            previouslySelectedElement = selectedBeforeReregister;
            window.__current_ph_lp_selected = selectedBeforeReregister;
        }
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
            previouslySelectedElement = null;
            window.__current_ph_lp_selected = null;
        }

        // Reset hover tracking so the same-element skip doesn't suppress
        // re-highlighting after a full state cleanup (e.g. Escape, dismiss).
        _lastHoverTarget = null;
        if (_pendingHoverRAF) {
            cancelAnimationFrame(_pendingHoverRAF);
            _pendingHoverRAF = null;
        }

        // Highlight.clear() removes all overlay divs (outline + margin/padding rects)
        hideHighlight();

        if (config.mode === 'edit') {
            // Notify handlers about cleanup
            getAllToolHandlers().forEach(handler => {
                if (handler.onElementCleanup) {
                    handler.onElementCleanup();
                }
            });
        }
    }

    /**
     * Compute the tree path of an element as an array of child indices
     * from <html> down. Used to re-locate the element after re-instrumentation
     * when data-brackets-id changes and text matching is ambiguous.
     * E.g. [1, 0, 0, 1] means html > 2nd child > 1st child > 1st child > 2nd child.
     */
    function _getTreePath(element) {
        const path = [];
        let el = element;
        while (el && el.parentElement) {
            const parent = el.parentElement;
            const children = parent.children;
            for (let i = 0; i < children.length; i++) {
                if (children[i] === el) {
                    path.unshift(i);
                    break;
                }
            }
            el = parent;
        }
        return path;
    }

    /**
     * Find an element by its tree path (array of child indices from <html>).
     */
    function _getElementByTreePath(path) {
        let el = document.documentElement;
        for (let i = 0; i < path.length; i++) {
            if (!el || !el.children || !el.children[path[i]]) {
                return null;
            }
            el = el.children[path[i]];
        }
        return el;
    }

    /**
     * Temporarily suppress the DOM edit dismissal check in apply()
     * Used when source is modified from UI panels to prevent
     * the panel from being dismissed when the DOM is updated.
     * @param {Number} durationMs - Duration in milliseconds to suppress (default 100)
     */
    function suppressDOMEditDismissal(durationMs) {
        durationMs = durationMs || 100;
        if (SHARED_STATE._suppressDOMEditDismissalTimeout) {
            clearTimeout(SHARED_STATE._suppressDOMEditDismissalTimeout);
        }
        SHARED_STATE._suppressDOMEditDismissal = true;
        // Store the tree path while the element is still connected
        if (previouslySelectedElement && previouslySelectedElement.isConnected) {
            SHARED_STATE._suppressedElementPath = _getTreePath(previouslySelectedElement);
        }
        SHARED_STATE._suppressDOMEditDismissalTimeout = setTimeout(function() {
            SHARED_STATE._suppressDOMEditDismissal = false;
            SHARED_STATE._suppressDOMEditDismissalTimeout = null;
            SHARED_STATE._suppressedElementPath = null;
        }, durationMs);
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
        // Cancel any pending resize RAF so stale callbacks don't fire after re-init
        if (_pendingResizeRAF) {
            cancelAnimationFrame(_pendingResizeRAF);
            _pendingResizeRAF = null;
        }
        getAllToolHandlers().forEach(handler => {
            if (handler.unregisterInteractionBlocker) {
                handler.unregisterInteractionBlocker();
            }
        });

        if (config.mode === 'edit') {
            _hoverHighlight = new Highlight(true);
            _clickHighlight = new Highlight(true);

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

    function _handleEscapeKeyPress() {
        enableHoverListeners(); // so that if hover lock is there it will get cleared
        dismissUIAndCleanupState();
        getAllToolHandlers().forEach(handler => {
            if (handler.handleEscapePress) {
                handler.handleEscapePress();
            }
        });
    }

    document.addEventListener('keydown', function(event) {
        if (config.mode === 'edit' && (event.key === 'Escape' || event.key === 'Esc')) {
            event.preventDefault();
            _handleEscapeKeyPress();
        }
    });

    // we need to refresh the config once the load is completed
    // this is important because messageBroker gets ready for use only when load fires
    window.addEventListener('load', function() {
        MessageBroker.send({
            requestConfigRefresh: true
        });
    });

    function getMode() {
        return config.mode;
    }

    function isSyncEnabled() {
        return config.syncSourceAndPreview !== false;
    }

    function getHighlightCount() {
        if (!_highlightShadowRoot) { return 0; }
        return _highlightShadowRoot.querySelectorAll('.overlay-container:not(.hidden)').length;
    }

    function getHighlightTrackingElement(index) {
        if (!_highlightShadowRoot) { return null; }
        const overlay = _highlightShadowRoot.querySelectorAll('.overlay-container:not(.hidden)')[index];
        if (!overlay || !overlay.trackingElement) { return null; }
        const el = overlay.trackingElement;
        return {
            id: el.id,
            classList: Array.from(el.classList)
        };
    }

    function getHighlightStyle(index, property) {
        if (!_highlightShadowRoot) { return null; }
        const overlay = _highlightShadowRoot.querySelectorAll('.overlay-container:not(.hidden)')[index];
        return overlay ? overlay.style[property] : null;
    }

    function setHotCornerHidden(hidden) {
        if (SHARED_STATE._hotCorner && SHARED_STATE._hotCorner.hotCorner) {
            if (hidden) {
                SHARED_STATE._hotCorner.hotCorner.classList.add('hc-hidden');
            } else {
                SHARED_STATE._hotCorner.hotCorner.classList.remove('hc-hidden');
            }
        }
    }

    let customReturns = {};
    // only apis that needs to be called from phoenix js layer should be customReturns. APis that are shared within
    // the remote function context only should not be in customReturns and should be in
    // either SHARED_STATE for state vars, GLOBALS for global vars, or LivePreviewView for shared functions.
    customReturns = { // we have to do this else the minifier will strip the customReturns variable
        ...customReturns,
        "DOMEditHandler": DOMEditHandler,
        "hideHighlight": dismissUIAndCleanupState,
        "highlight": highlight,
        "highlightRule": highlightRule,
        "redrawHighlights": redrawHighlights,
        "redrawEverything": redrawEverything,
        "applyDOMEdits": applyDOMEdits,
        "updateConfig": updateConfig,
        "dismissUIAndCleanupState": dismissUIAndCleanupState,
        "escapeKeyPressInEditor": _handleEscapeKeyPress,
        "getMode": getMode,
        "isSyncEnabled": isSyncEnabled,
        "suppressDOMEditDismissal": suppressDOMEditDismissal,
        "getHighlightCount": getHighlightCount,
        "getHighlightTrackingElement": getHighlightTrackingElement,
        "getHighlightStyle": getHighlightStyle,
        "setHotCornerHidden": setHotCornerHidden
    };

    // the below code comment is replaced by added scripts for extensibility
    // DONT_STRIP_MINIFY:REPLACE_WITH_ADDED_REMOTE_SCRIPTS

    registerHandlers();
    return customReturns;
}
