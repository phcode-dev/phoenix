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

    // Node info box to display DOM node ID and classes on hover
    function NodeInfoBox(element) {
        this.element = element;
        this.remove = this.remove.bind(this);
        this.create();
    }

    NodeInfoBox.prototype = {
        create: function() {
            // Remove existing info box if any
            this.remove();

            // compute the position on screen
            var offset = _screenOffset(this.element),
                x = offset.left,
                y = offset.top - 30; // Position above the element

            // create the container
            this.body = window.document.createElement("div");
            this.body.style.setProperty("z-index", 2147483647);
            this.body.style.setProperty("position", "fixed");
            this.body.style.setProperty("left", (offset.left) + "px");
            this.body.style.setProperty("top", (offset.top - 30 < 0 ? offset.top + this.element.offsetHeight + 5 : offset.top - 30) + "px");
            this.body.style.setProperty("font-size", "12px");
            this.body.style.setProperty("font-family", "Arial, sans-serif");

            // Style the info box with a blue background
            this.body.style.setProperty("background", "#4285F4");
            this.body.style.setProperty("color", "white");
            this.body.style.setProperty("border-radius", "3px");
            this.body.style.setProperty("padding", "5px 8px");
            this.body.style.setProperty("box-shadow", "0 2px 5px rgba(0,0,0,0.2)");
            this.body.style.setProperty("max-width", "300px");
            this.body.style.setProperty("pointer-events", "none"); // Make it non-interactive

            // Get element ID and classes
            var id = this.element.id;
            var classes = this.element.className ? this.element.className.split(/\s+/).filter(Boolean) : [];

            // Create content for the info box
            var content = "";

            // Add element tag name
            content += "<div style='font-weight: bold;'>" + this.element.tagName.toLowerCase() + "</div>";

            // Add ID if present
            if (id) {
                content += "<div style='margin-top: 3px;'>#" + id + "</div>";
            }

            // Add classes (limit to 3 with dropdown indicator)
            if (classes.length > 0) {
                content += "<div style='margin-top: 3px;'>";
                for (var i = 0; i < Math.min(classes.length, 3); i++) {
                    content += "." + classes[i] + " ";
                }
                if (classes.length > 3) {
                    content += "<span style='opacity: 0.8;'>+" + (classes.length - 3) + " more</span>";
                }
                content += "</div>";
            }

            this.body.innerHTML = content;
            window.document.body.appendChild(this.body);
        },

        remove: function() {
            if (this.body && this.body.parentNode) {
                window.document.body.removeChild(this.body);
                this.body = null;
            }
        }
    };

    function Editor(element) {
        this.onBlur = this.onBlur.bind(this);
        this.onKeyPress = this.onKeyPress.bind(this);

        this.element = element;
        this.element.setAttribute("contenteditable", "true");
        this.element.focus();
        this.element.addEventListener("blur", this.onBlur);
        this.element.addEventListener("keypress", this.onKeyPress);

        this.revertText = this.element.innerHTML;

        _trigger(this.element, "edit", 1);
    }

    Editor.prototype = {
        onBlur: function (event) {
            this.element.removeAttribute("contenteditable");
            this.element.removeEventListener("blur", this.onBlur);
            this.element.removeEventListener("keypress", this.onKeyPress);
            _trigger(this.element, "edit", 0, true);
        },

        onKeyPress: function (event) {
            switch (event.which) {
            case 13: // return
                this.element.blur();
                break;
            case 27: // esc
                this.element.innerHTML = this.revertText;
                this.element.blur();
                break;
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

    var _currentEditor;
    function _toggleEditor(element) {
        _currentEditor = new Editor(element);
    }

    var _currentMenu;
    function _toggleMenu(element) {
        if (_currentMenu) {
            _currentMenu.remove();
        }
        _currentMenu = new Menu(element);
    }

    var _localHighlight;
    var _remoteHighlight;
    var _hoverHighlight;
    var _clickHighlight;
    var _nodeInfoBox;
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

            // Skip highlighting for HTML and BODY tags
            if (event.target && event.target.nodeType === Node.ELEMENT_NODE &&
                event.target.tagName !== "HTML" && event.target.tagName !== "BODY") {
                // Store original background color to restore on hover out
                event.target._originalBackgroundColor = event.target.style.backgroundColor;
                event.target.style.backgroundColor = "rgba(0, 162, 255, 0.2)";

                _hoverHighlight.add(event.target, false);

                // Create info box for the hovered element
                if (_nodeInfoBox) {
                    _nodeInfoBox.remove();
                }
                _nodeInfoBox = new NodeInfoBox(event.target);
            }
        }
    }

    function onElementHoverOut(event) {
        if (_hoverHighlight) {
            _hoverHighlight.clear();
        }

        // Restore original background color
        if (event && event.target && event.target.nodeType === Node.ELEMENT_NODE) {
            if (event.target._originalBackgroundColor !== undefined) {
                event.target.style.backgroundColor = event.target._originalBackgroundColor;
                delete event.target._originalBackgroundColor;
            } else {
                event.target.style.backgroundColor = "";
            }
        }

        // Remove info box when mouse leaves the element
        if (_nodeInfoBox) {
            _nodeInfoBox.remove();
            _nodeInfoBox = null;
        }
    }

    function onClick(event) {
        if (_validEvent(event)) {
            event.preventDefault();
            event.stopPropagation();
            if (event.altKey) {
                _toggleEditor(event.target);
            } else {
                _toggleMenu(event.target);
            }
        }
    }

    function onKeyUp(event) {
        if (_setup && !_validEvent(event)) {
            window.document.removeEventListener("keyup", onKeyUp);
            window.document.removeEventListener("mouseover", onMouseOver);
            window.document.removeEventListener("mouseout", onMouseOut);
            window.document.removeEventListener("mousemove", onMouseMove);
            window.document.removeEventListener("click", onClick);
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
        if (_nodeInfoBox) {
            _nodeInfoBox.remove();
            _nodeInfoBox = null;
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

    window.addEventListener("resize", redrawHighlights);
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
        redrawHighlights();
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
            value = (node.name === "data-brackets-id") ? parseInt(node.value, 10) : node.value;
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

            // Remove info box if highlight is disabled
            if (_nodeInfoBox) {
                _nodeInfoBox.remove();
                _nodeInfoBox = null;
            }
        }
        return JSON.stringify(config);
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

    if (experimental) {
        window.document.addEventListener("keydown", onKeyDown);
    }

    return {
        "DOMEditHandler"        : DOMEditHandler,
        "showGoto"              : showGoto,
        "hideHighlight"         : hideHighlight,
        "highlight"             : highlight,
        "highlightRule"         : highlightRule,
        "redrawHighlights"      : redrawHighlights,
        "applyDOMEdits"         : applyDOMEdits,
        "getSimpleDOM"          : getSimpleDOM,
        "updateConfig"          : updateConfig
    };
}
