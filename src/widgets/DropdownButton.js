/*
 *  Copyright (c) 2021 - present core.ai . All rights reserved.
 *  Original work Copyright (c) 2014 - 2021 Adobe Systems Incorporated. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

/**
 * Button that opens a dropdown list when clicked. More akin to a popup menu than a combobox. Compared to a
 * simple <select> element:
 *  - There's no "selected" state
 *  - The button's label is not automatically changed when an item in the list is clicked
 *  - Its width is not the max of all the dropdown items' labels
 *  - The button & dropdown's appearance can be customized far more
 * Events
 *  - listRendered -- This event is dispatched after the entire list is rendered so that custom event handlers can be
 *                    set up for any custom UI in the list.
 *
 * TODO: merge DropdownEventHandler into this? Are there any other widgets that might want to use it separately?
 *
 */
define(function (require, exports, module) {


    // Load dependent modules
    const DropdownEventHandler    = require("utils/DropdownEventHandler").DropdownEventHandler,
        EventDispatcher         = require("utils/EventDispatcher"),
        WorkspaceManager        = require("view/WorkspaceManager"),
        Menus                   = require("command/Menus"),
        ViewUtils               = require("utils/ViewUtils"),
        _                       = require("thirdparty/lodash");

    const EVENT_SELECTED = "select",
        EVENT_LIST_RENDERED = "listRendered",
        EVENT_DROPDOWN_SHOWN = "shown",
        EVENT_DROPDOWN_CLOSED = "closed";

    /**
     * Creates a single dropdown-button instance. The DOM node is created but not attached to
     * the document anywhere - clients should append this.$button to the appropriate location.
     *
     * DropdownButton dispatches the following events:
     *  - "select" - when an option in the dropdown is clicked. Passed item object and index.
     *
     * @param {!string} label  Label to display on the button
     * @param {!Array.<*>} items  Items in the dropdown list. It generally doesn't matter what type/value the
     *          items have, except that any item === "---" will be treated as a divider. Such items are not
     *          clickable and itemRenderer() will not be called for them.
     * @param {?function(*, number):!string|{html:string, enabled:boolean} itemRenderer  Optional function to
     *          convert a single item to HTML (see itemRenderer() docs below). If not provided, items are
     *          assumed to be plain text strings.
     * @param {Object?} options
     * @param {boolean?} options.enableFilter - true if you need to enable filter by typing
     * @param {string?} options.cssClasses - space seperated list of css classes to apply to button
     * @param {function(userSearchText, elementText, elementIndex)?} options.customFilter - Optional. When `enableFilter`
     *      is enabled, this function is used as a custom filtering callback. It receives the user's search text, the
     *      text of the element being filtered, and the element's index. Return `true` to display the list item, or `false` to hide it.
     */
    function DropdownButton(label, items, itemRenderer, options) {
        this.items = items;
        options = options || {};
        this.enableFilter = (typeof options.enableFilter === 'boolean' ? options.enableFilter : true);
        this.customFilter = options.customFilter;

        this.itemRenderer = itemRenderer || this.itemRenderer;

        this._onClick        = this._onClick.bind(this);
        this.closeDropdown   = this.closeDropdown.bind(this);
        this._onClickOutside = this._onClickOutside.bind(this);

        this.$button = $(`<button class='btn btn-dropdown ${options.cssClasses ? options.cssClasses : ''}'/>`)
            .text(label)
            .on("click", this._onClick);
    }
    EventDispatcher.makeEventDispatcher(DropdownButton.prototype);

    /**
     * Items in dropdown list - may be changed any time dropdown isn't open
     * @type {!Array.<*>}
     */
    DropdownButton.prototype.items = null;

    /**
     * This is filter text corresponding to each items. it will be used to filter the items based on
     * the keyboard key presses the user does to enter search filter in popup.
     * @type {null}
     */
    DropdownButton.prototype.itemsSearchFilterText = null;

    /**
     * The clickable button. Available as soon as the DropdownButton is constructed.
     * @type {!jQueryObject}
     */
    DropdownButton.prototype.$button = null;

    /**
     * The dropdown element. Only non-null while open.
     * @type {?jQueryObject}
     */
    DropdownButton.prototype.$dropdown = null;

    /**
     * Extra CSS class(es) to apply to $dropdown
     * @type {?string}
     */
    DropdownButton.prototype.dropdownExtraClasses = null;

    /**
     * @private
     * Where to restore focus when dropdown closed
     * @type {?HTMLElement}
     */
    DropdownButton.prototype._lastFocus = null;

    /**
     * @private
     * Helper object for dropdown. Only non-null while open.
     * @type {?DropdownEventHandler}
     */
    DropdownButton.prototype._dropdownEventHandler = null;


    /**
     * @private
     * Handle clicking button
     */
    DropdownButton.prototype._onClick = function (event) {
        if (!this.$button.hasClass("disabled")) {
            this.toggleDropdown();
        }
        // Indicate click was handled (e.g. to shield from MultiRangeInlineEditor._onClick())
        event.stopPropagation();
    };

    /**
     * Update the button label.
     * @param {string} label
     */
    DropdownButton.prototype.setButtonLabel = function (label) {
        if (!this.$button) {
            return;
        }
        $(this.$button).text(label);
    };

    /**
     * returns true if the dropdown is open
     */
    DropdownButton.prototype.isOpen = function () {
        if (this.$dropdown) {
            return true;
        }
        return false;
    };

    /**
     * Called for each item when rendering the dropdown.
     * @param {*} item from items array
     * @param {number} index in items array
     * @return {!string|{html:string, enabled:boolean}} Formatted & escaped HTML, either as a simple string
     *      or as the 'html' field in an object that also conveys enabled state. Disabled items inherit gray
     *      text color and cannot be selected.
     */
    DropdownButton.prototype.itemRenderer = function (item, index) {
        return _.escape(String(item));
    };

    /**
     * Converts the list of item objects into HTML list items in format required by DropdownEventHandler
     * @param {!jQueryObject} $parent The dropdown element
     * @return {!jQueryObject} The dropdown element with the rendered list items appended.
     */
    DropdownButton.prototype._renderList = function ($parent) {
        if (!$parent) {
            return null;
        }

        const self = this;
        this.itemsSearchFilterText = [];
        let html = "";
        this.searchStr = "";
        if(self.enableFilter){
            $parent.append(`<li class="sticky-li-top forced-hidden"><a class='stylesheet-link'><i class="fa fa-search" aria-hidden="true"></i>&nbsp;&nbsp;<span class="searchTextSpan"></span></a></li>`);
        }
        this.items.forEach(function (item, i) {
            self.itemsSearchFilterText[i] = "";
            if (item === "---") {
                $parent.append("<li class='divider'></li>");
            } else {
                let rendered = self.itemRenderer(item, i),
                    itemHtml = rendered.html || rendered || "",
                    disabledClass = (rendered.html && !rendered.enabled) ? "disabled" : "";

                if(rendered.$html){
                    const $atag = $(`<a class='stylesheet-link ${disabledClass}' data-index='${i}'></a>`);
                    $atag.append(rendered.$html);
                    const $itemHtml = $(`<li data-index='${i}'></li>`).append($atag);
                    self.itemsSearchFilterText[i] = $itemHtml.text();
                    $parent.append($itemHtml);
                } else {
                    const $itemHtml = $(`<li data-index='${i}'><a class='stylesheet-link ${disabledClass}' data-index='${i}'>${itemHtml}</a></li>`);
                    self.itemsSearchFilterText[i] = $itemHtml.text();
                    $parent.append($itemHtml);
                }
            }
        }.bind(this));

        $parent.append(html);

        // Also trigger listRendered handler so that custom event handlers can be
        // set up for any custom UI in the list.
        this.trigger(EVENT_LIST_RENDERED, $parent);

        // Also need to re-register mouse event handlers with the updated list.
        if (this._dropdownEventHandler) {
            this._dropdownEventHandler.reRegisterMouseHandlers($parent);
        }

        return $parent;
    };

    /**
     * Refresh the dropdown list by removing and re-creating all list items.
     * Call this after deleting/adding any item in the dropdown list.
     */
    DropdownButton.prototype.refresh = function () {
        if (!this.$dropdown) {
            return;
        }

        // Remove all list items and then re-create them from this.items.
        $("li", this.$dropdown).remove();
        this._renderList(this.$dropdown);
        this._reposition();
    };

    /**
     * Check/Uncheck the list item of the given index.
     * @param {number} index The index of the list item to be checked or unchecked
     * @param {boolean} checked True if the list item is to be checked, false to get check
     *    mark removed.
     */
    DropdownButton.prototype.setChecked = function (index, checked) {
        if (!this.$dropdown) {
            return;
        }

        var listItems = $("li", this.$dropdown),
            count     = listItems.length;

        if (index > -1 && index < count) {
            $("a", listItems[index]).toggleClass("checked", checked);
        }
    };

    DropdownButton.prototype._reposition = function () {
        const $dropdown = this.$dropdown;
        // Calculate position of dropdown
        var toggleOffset = this.$button.offset(),
            posLeft      = toggleOffset.left,
            posTop       = toggleOffset.top + this.$button.outerHeight(),
            elementRect  = {
                top: posTop,
                left: posLeft,
                height: $dropdown.height(),
                width: $dropdown.width()
            },
            clip = ViewUtils.getElementClipSize($(window), elementRect);

        if (clip.bottom > 0) {
            // Bottom is clipped, so move entire menu above button
            posTop = Math.max(0, toggleOffset.top - $dropdown.height() - 4);
        }

        // Take in consideration the scrollbar to prevent unexpected behaviours (see #10963).
        var dropdownElement = this.$dropdown[0];
        var scrollWidth = dropdownElement.offsetWidth - dropdownElement.clientWidth + 1;

        if (clip.right > 0) {
            // Right is clipped, so adjust left to fit menu in editor.
            posLeft = Math.max(0, posLeft - clip.right - scrollWidth);
        }

        $dropdown.css({
            left: posLeft,
            top: posTop,
            width: $dropdown.width() + scrollWidth
        });
    };

    /** Pops open the dropdown if currently closed. Does nothing if items.length == 0 */
    DropdownButton.prototype.showDropdown = function () {
        // Act like a plain old button if no items to show
        if (!this.items.length) {
            return;
        }

        if (this.$dropdown) {
            return;
        }

        Menus.closeAll();
        this.searchStr = "";
        var $dropdown = $("<ul class='dropdown-menu dropdownbutton-popup' tabindex='-1'>")
            .addClass(this.dropdownExtraClasses)  // (no-op if unspecified)
            .css("min-width", this.$button.outerWidth());  // do this before the clipping calcs below

        this.$dropdown = $dropdown;
        this._renderList(this.$dropdown)
            .appendTo($("body"))
            .data("attached-to", this.$button[0]);  // keep ModalBar open while dropdown focused

        this._reposition();

        // Attach event handlers
        this._dropdownEventHandler = new DropdownEventHandler($dropdown, this._onSelect.bind(this),
            this._onDropdownClose.bind(this), this._onKeyDown.bind(this));
        this._dropdownEventHandler.open();

        window.document.body.addEventListener("mousedown", this._onClickOutside, true);
        WorkspaceManager.on("workspaceUpdateLayout", this.closeDropdown);

        // Manage focus
        this._lastFocus = window.document.activeElement;
        $dropdown.focus();
        this.trigger(EVENT_DROPDOWN_SHOWN);
    };

    /**
     * @private
     * Clean up event handlers after dropdown closed & dispose old dropdown DOM. Called regardless of how the dropdown
     * was closed.
     */
    DropdownButton.prototype._onDropdownClose = function () {
        window.document.body.removeEventListener("mousedown", this._onClickOutside, true);
        WorkspaceManager.off("workspaceUpdateLayout", this.closeDropdown);

        // Restore focus to old pos, unless "select" handler changed it
        if (window.document.activeElement === this.$dropdown[0]) {
            this._lastFocus.focus();
        }

        this._dropdownEventHandler = null;
        this.$dropdown = null;  // already remvoed from DOM automatically by PopUpManager
        this.trigger(EVENT_DROPDOWN_CLOSED);
    };

    /**
     * hides all elements in popup that doesn't match the given search string, also shows the search bar in popup
     * @param searchString
     */
    DropdownButton.prototype.filterDropdown = function (searchString) {
        this.searchStr = searchString;
        const $stickyLi = this.$dropdown.find('li.sticky-li-top');
        for(let i=0; i<this.itemsSearchFilterText.length; i++){
            const itemText = this.itemsSearchFilterText[i];
            const $liElementAtIndex = this.$dropdown.find(`li[data-index='${i}']`);
            let shouldShow = itemText && itemText.toLowerCase().includes(searchString.toLowerCase());
            if(this.customFilter){
                shouldShow = this.customFilter(searchString, itemText, i);
            }
            if(shouldShow){
                $liElementAtIndex.removeClass('forced-hidden');
            } else {
                $liElementAtIndex.addClass('forced-hidden');
            }
        }
        if(searchString) {
            $stickyLi.removeClass('forced-hidden');
            $stickyLi.find('.searchTextSpan').text(searchString);
        } else {
            $stickyLi.addClass('forced-hidden');
        }
    };

    DropdownButton.prototype._onKeyDown = function (event) {
        if(!this.enableFilter){
            return false;
        }
        const self = this;
        if((event.ctrlKey || event.metaKey) && event.key === 'v') {
            Phoenix.app.clipboardReadText().then(text=>{
                self.searchStr += text;
                self.filterDropdown(this.searchStr);
            });
            event.stopImmediatePropagation();
            event.preventDefault();
            return true;
        } else if (event.key.length === 1) {
            this.searchStr += event.key;
        } else if (event.key === 'Backspace') {
            // Remove the last character when Backspace is pressed
            this.searchStr  = this.searchStr.slice(0, -1);
        } else {
            // bubble up, not for us to handle
            return false;
        }
        this.filterDropdown(this.searchStr);
        event.stopImmediatePropagation();
        event.preventDefault();
        return true;
    };

    /** Closes the dropdown if currently open */
    DropdownButton.prototype.closeDropdown = function () {
        if (this._dropdownEventHandler) {
            this._dropdownEventHandler.close();
        }
    };

    /**
     * @private
     * Clicking outside the dropdown closes it
     */
    DropdownButton.prototype._onClickOutside = function (event) {
        var $container = $(event.target).closest(".dropdownbutton-popup");

        // If click is outside dropdown list or dropdown button, then close dropdown list
        if (!$(event.target).is(this.$button) &&
                ($container.length === 0 || $container[0] !== this.$dropdown[0])) {
            this.closeDropdown();
            event.stopPropagation();
            event.preventDefault();
        }
    };

    /** Opens the dropdown if closed; closes it if open */
    DropdownButton.prototype.toggleDropdown = function () {
        if (this.$dropdown) {
            this.closeDropdown();
        } else {
            this.showDropdown();
        }
    };

    /**
     * @private
     * Callback from DropdownEventHandler when item in dropdown list is selected (via mouse or keyboard)
     * @param {!jQueryObject} $link  The `a` element selected
     */
    DropdownButton.prototype._onSelect = function ($link) {
        var itemIndex = Number($link.data("index"));
        this.trigger(EVENT_SELECTED, this.items[itemIndex], itemIndex);
    };


    exports.DropdownButton = DropdownButton;
    // public events
    exports.EVENT_SELECTED = EVENT_SELECTED;
    exports.EVENT_LIST_RENDERED = EVENT_LIST_RENDERED;
    exports.EVENT_DROPDOWN_SHOWN = EVENT_DROPDOWN_SHOWN;
    exports.EVENT_DROPDOWN_CLOSED = EVENT_DROPDOWN_CLOSED;
});
