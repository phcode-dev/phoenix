/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*jslint regexp: true */

// @INCLUDE_IN_API_DOCS

/**
 * SelectionViewManager provides support to add interactive preview popups on selection over the main editors.
 * This can be used to provide interactive editor controls on a selected element.
 *
 * Extensions can register to provide previews with `SelectionViewManager.registerSelectionViewProvider` API.
 * <img src = "https://user-images.githubusercontent.com/5336369/186434397-3db55789-6077-4d02-b4e2-78ef3f663399.png" alt="Phoenix code selection view" />
 * <img src = "https://user-images.githubusercontent.com/5336369/186434671-c1b263e5-19a9-4a9d-8f90-507df5f881b5.gif" />
 *
 * ### See Related: QuickViewManager
 * [features/QuickViewManager](https://github.com/phcode-dev/phoenix/wiki/QuickViewManager-API) is similar to
 * SelectionViewManager API.
 * * SelectionViews popup only once user selects a text by mouse or hover over a region with text selection.
 * * Quickviews popup on mouse hover.
 * <img src = "https://docs-images.phcode.dev/phcode-sdk/quick-view-youtube.png" alt="Phoenix code selection view Youtube image" />
 *
 * ## Usage
 * Lets build a "hello world" extension that displays "hello world" above selected text in the editor.
 * In your extension file, add the following code:
 *
 * @example
 * ```js
 * const SelectionViewManager = brackets.getModule("features/SelectionViewManager");
 * // replace `all` with language ID(Eg. javascript) if you want to restrict the preview to js files only.
 * SelectionViewManager.registerSelectionViewProvider(exports, ["all"]);
 *
 * // provide a helpful name for the SelectionView. This will be useful if you have to debug the selection view
 * exports.SELECTION_VIEW_NAME = "extension.someName";
 * // now implement the getSelectionView function that will be invoked when ever user selection changes in the editor.
 * exports.getSelectionView = function(editor, selections) {
 *         return new Promise((resolve, reject)=>{
 *             resolve({
 *                 content: "<div>hello world</div>"
 *             });
 *         });
 *     };
 * ```
 *
 * ### How it works
 * When SelectionViewManager determines that the user intents to see SelectionViewr, `getSelectionView` function on all
 * registered SelectionView providers are invoked to get the Selection View popup. `getSelectionView` should return
 * a promise that resolves to the popup contents if the provider has a Selection View. Else just reject the promise.
 * If multiple providers returns SelectionView, all of them are displayed one by one.
 * See detailed API docs for implementation details below:
 *
 * ## API
 * ### registerSelectionViewProvider
 * Register a SelectionView provider with this api.
 *
 * @example
 * ```js
 * // syntax
 * SelectionViewManager.registerSelectionViewProvider(provider, supportedLanguages);
 * ```
 * The API requires two parameters:
 * 1. `provider`: must implement a  `getSelectionView` function which will be invoked to get the preview. See API doc below.
 * 1. `supportedLanguages`: An array of languages that the SelectionView supports. If `["all"]` is supplied, then the
 *    SelectionView will be invoked for all languages. Restrict to specific languages: Eg: `["javascript", "html", "php"]`
 *
 * @example
 * ```js
 * // to register a provider that will be invoked for all languages. where provider is any object that implements
 * // a getSelectionView function
 * SelectionViewManager.registerSelectionViewProvider(provider, ["all"]);
 *
 * // to register a provider that will be invoked for specific languages
 * SelectionViewManager.registerSelectionViewProvider(provider, ["javascript", "html", "php"]);
 * ```
 *
 * ### removeSelectionViewProvider
 * Removes a registered SelectionView provider. The API takes the same arguments as `registerSelectionViewProvider`.
 *
 * @example
 * ```js
 * // syntax
 * SelectionViewManager.removeSelectionViewProvider(provider, supportedLanguages);
 * // Example
 * SelectionViewManager.removeSelectionViewProvider(provider, ["javascript", "html"]);
 * ```
 *
 * ### getSelectionView
 * Each provider must implement the `getSelectionView` function that returns a promise. The promise either resolves with
 * the Selection View details object(described below) or rejects if there is no preview for the position.
 *
 * @example
 * ```js
 * // function signature
 * provider.getSelectionView = function(editor, selections) {
 *         return new Promise((resolve, reject)=>{
 *             resolve({
 *                 content: "<div>hello world</div>"
 *             });
 *         });
 *     };
 * ```
 *
 * #### parameters
 * The function will be called with the following arguments:
 * 1. `editor` - The editor over which the user hovers the mouse cursor.
 * 1. `selections` - An array containing the active selections when the selection view was trigerred.
 *
 * #### return types
 * The promise returned should resolve to an object with the following contents:
 * 1. `content`: Either `HTML` as text, a `DOM Node` or a `Jquery Element`.
 *
 * #### Modifying the SelectionView content after resolving `getSelectionView` promise
 * Some advanced/interactive extensions may need to do dom operations on the SelectionView content.
 * In such cases, it is advised to return a domNode/Jquery element as content in `getSelectionView`. Event Handlers
 * or further dom manipulations can be done on the returned content element.
 * The SelectionView may be dismissed at any time, so be sure to check if the DOM Node is visible in the editor before
 * performing any operations.
 *
 * #### Considerations
 * 1. SelectionView won't be displayed till all provider promises are settled. To improve performance, if your SelectionView
 *    handler takes time to resolve the SelectionView, resolve a dummy quick once you are sure that a SelectionView needs
 *    to be shown to the user. The div contents can be later updated as and when more details are available.
 * 1. Note that the SelectionView could be hidden/removed any time by the SelectionViewManager.
 * 1. If multiple providers returns a valid popup, all of them are displayed.
 *
 * @module features/SelectionViewManager
 */

define(function (require, exports, module) {


    // Brackets modules
    const CommandManager    = require("command/CommandManager"),
        Commands            = require("command/Commands"),
        EditorManager       = require("editor/EditorManager"),
        Menus               = require("command/Menus"),
        PreferencesManager  = require("preferences/PreferencesManager"),
        Strings             = require("strings"),
        AppInit             = require("utils/AppInit"),
        Resizer             = require("utils/Resizer"),
        WorkspaceManager    = require("view/WorkspaceManager"),
        EventDispatcher     = require("utils/EventDispatcher"),
        ProviderRegistrationHandler = require("features/PriorityBasedRegistration").RegistrationHandler;

    const previewContainerHTML       = '<div id="selection-view-container">\n' +
        '    <div class="preview-content">\n' +
        '    </div>\n' +
        '</div>';

    EventDispatcher.makeEventDispatcher(exports);
    const _EVENT_POPUP_CONTENT_MUTATED = "_popupContentMutated";
    // Create a new MutationObserver instance
    const observer = new MutationObserver(mutations => {
        for (let mutation of mutations) {
            if (mutation.type === 'childList' || mutation.type === 'subtree') {
                exports.trigger(_EVENT_POPUP_CONTENT_MUTATED, mutations);
                break; // Optional: Break after the first change if only one change is needed
            }
        }
    });

    const _providerRegistrationHandler = new ProviderRegistrationHandler(),
        registerSelectionViewProvider = _providerRegistrationHandler.registerProvider.bind(_providerRegistrationHandler),
        removeSelectionViewProvider = _providerRegistrationHandler.removeProvider.bind(_providerRegistrationHandler);

    function _getSelectionViewProviders(editor) {
        let SelectionViewProviders = [];
        let language = editor.getLanguageForSelection(),
            enabledProviders = _providerRegistrationHandler.getProvidersForLanguageId(language.getId());

        for(let item of enabledProviders){
            SelectionViewProviders.push(item.provider);
        }
        return SelectionViewProviders;
    }

    let enabled,                             // Only show preview if true
        prefs                      = null,   // Preferences
        $previewContainer,                   // Preview container
        lastMouseX = 0,
        lastMouseY = 0,
        $previewContent;                     // Preview content holder

    // Constants
    const CMD_ENABLE_SELECTION_VIEW       = "view.enableSelectionView",
        // Pointer height, used to shift popover above pointer (plus a little bit of space)
        POPUP_DELAY                 = 200,
        POINTER_HEIGHT              = 10,
        POPOVER_HORZ_MARGIN         =  5;   // Horizontal margin

    prefs = PreferencesManager.getExtensionPrefs("SelectionView");
    prefs.definePreference("enabled", "boolean", true, {
        description: Strings.DESCRIPTION_SELECTION_VIEW_ENABLED
    });

    /**
     * There are three states for this var:getToken
     * 1. If null, there is no provider result for the given mouse position.
     * 2. If non-null, and visible==true, there is a popover currently showing.
     * 3. If non-null, but visible==false, we're waiting for HOVER_DELAY, which
     *    is tracked by hoverTimer. The state changes to visible==true as soon as
     *    there is a provider. If the mouse moves before then, timer is restarted.
     * @typedef {Object} PopoverState
     * @property {boolean} visible - Whether the popover has been rendered and remains open.
     * @property {boolean=} layoutPending - Whether temporarily hidden until workspace layout settles.
     * @property {!Editor} editor - The editor instance associated with the popover.
     * @property {!{line: number, ch: number}} start - Start of the matched text range.
     * @property {!{line: number, ch: number}} end - End of the matched text range.
     * @property {!string} content - HTML content to display in the popover.
     * @property {number} xpos - X-coordinate of the center of the popover.
     * @property {number} ytop - Y-coordinate of the top of the matched text when the popover is placed above the text.
     * @property {number} ybot - Y-coordinate of the bottom of the matched text when the popover is moved below the text.
     * @private
     */
    let popoverState = null;
    let popupTimer = null, currentQueryID = 0, queryInProgress = false, layoutFrame = 0, layoutTimer = null;
    const resizingPanels = new Set();
    const LAYOUT_SETTLE_DELAY = 120;



    // Popover widget management ----------------------------------------------

    /**
     * Cancels whatever popoverState was currently pending and sets it back to null. If the popover was visible,
     * hides it; if the popover was invisible and still pending, cancels hoverTimer so it will never be shown.
     * @param {boolean=} focusEditor Whether to restore editor focus; defaults to true.
     * @private
     */
    function hidePreview(focusEditor) {
        clearTimeout(popupTimer);
        clearTimeout(layoutTimer);
        layoutTimer = null;
        cancelAnimationFrame(layoutFrame);
        layoutFrame = 0;
        popupTimer = null;
        currentQueryID++;
        queryInProgress = false;
        if (!popoverState) {
            return;
        }
        if (popoverState.visible) {
            $previewContent.empty();
            $previewContainer.hide();
            $previewContainer.css("visibility", "");
            $previewContainer.removeClass("active");
            if(focusEditor !== false && EditorManager.getActiveEditor()){
                EditorManager.getActiveEditor().focus();
            }
        }
        popoverState = null;
    }

    /**
     * Measure the visible selection highlights, including wrapped lines and partial viewport selections.
     * @param {Editor} editor Editor containing the selection.
     * @param {Object} bounds Visible editor bounds in window coordinates.
     * @return {Object|null} Visible bounds and highlight rectangles, or null when none are visible.
     */
    function getVisibleSelectionBounds(editor, bounds) {
        let selection = null;
        const root = editor.getRootElement();
        // CodeMirror already lays out these rectangles; do not scan source lines or characters.
        for (const highlight of root.querySelectorAll(".CodeMirror-selected")) {
            if (highlight.closest(".CodeMirror") !== root) { continue; }
            const rect = highlight.getBoundingClientRect();
            const left = Math.max(bounds.left, rect.left), right = Math.min(bounds.right, rect.right);
            const top = Math.max(bounds.top, rect.top), bottom = Math.min(bounds.bottom, rect.bottom);
            if (right <= left || bottom <= top) { continue; }
            if (!selection) {
                selection = {left, right, top, bottom, rectangles: []};
            } else {
                selection.left = Math.min(selection.left, left);
                selection.right = Math.max(selection.right, right);
                selection.top = Math.min(selection.top, top);
                selection.bottom = Math.max(selection.bottom, bottom);
            }
            selection.rectangles.push({left, right, top, bottom});
        }
        return selection;
    }

    /**
     * Prefer below-right, then above-right, and overlap only when no outside placement fits.
     * @param {Editor} editor Editor whose visible bounds constrain the popup.
     * @param {boolean=} refreshBounds Remeasure selection highlights after an editor layout change.
     */
    function positionPreview(editor, refreshBounds) {
        if ($previewContent.find("#selection-view-popover-root").is(':empty')){
            hidePreview();
            return;
        }
        const root = editor.getRootElement();
        const bounds = root.getBoundingClientRect();
        if (!root.isConnected || bounds.width <= POPOVER_HORZ_MARGIN * 2 ||
            bounds.height <= POPOVER_HORZ_MARGIN * 2) {
            hidePreview(false);
            return;
        }
        const minX = Math.max(0, bounds.left) + POPOVER_HORZ_MARGIN;
        const maxX = Math.min(window.innerWidth, bounds.right) - POPOVER_HORZ_MARGIN;
        const minY = Math.max(0, bounds.top) + POPOVER_HORZ_MARGIN;
        const maxY = Math.min(window.innerHeight, bounds.bottom) - POPOVER_HORZ_MARGIN;
        if (!popoverState.anchor) {
            const overEditor = lastMouseX >= minX && lastMouseX <= maxX && lastMouseY >= minY && lastMouseY <= maxY;
            popoverState.anchor = {x: overEditor ? lastMouseX : popoverState.xpos,
                y: overEditor ? lastMouseY : popoverState.ytop};
            refreshBounds = true;
        }
        if (refreshBounds) {
            popoverState.selectionBounds = getVisibleSelectionBounds(editor,
                {left: minX, right: maxX, top: minY, bottom: maxY});
        }
        const anchorX = Math.max(minX, Math.min(maxX, popoverState.anchor.x));
        const anchorY = Math.max(minY, Math.min(maxY, popoverState.anchor.y));
        const previewWidth = $previewContainer.outerWidth(), previewHeight = $previewContainer.outerHeight();
        const selection = popoverState.selectionBounds ||
            {left: anchorX, right: anchorX, top: anchorY, bottom: anchorY};
        let left = Math.max(minX, Math.min(maxX - previewWidth, selection.right - previewWidth));
        // A short final line leaves room beside it: tuck under the blue region at the toolbar's right-side position.
        const occupied = (selection.rectangles || [selection]).filter(rect =>
            rect.right > left && rect.left < left + previewWidth);
        const bottom = occupied.length ? Math.max(...occupied.map(rect => rect.bottom)) : selection.bottom;
        let top = bottom + POINTER_HEIGHT;
        let below = true;
        if (top + previewHeight > maxY) {
            top = selection.top - previewHeight - POINTER_HEIGHT;
            below = false;
            if (top < minY) {
                top = anchorY - previewHeight - POINTER_HEIGHT;
                if (selection.right + POINTER_HEIGHT + previewWidth <= maxX) {
                    left = selection.right + POINTER_HEIGHT;
                } else if (selection.left - POINTER_HEIGHT - previewWidth >= minX) {
                    left = selection.left - POINTER_HEIGHT - previewWidth;
                }
                // With no room on any side, retain the right-aligned position inside the selection.
            }
        }
        top = Math.max(minY, Math.min(maxY - previewHeight, top));
        left = Math.max(minX, Math.min(maxX - previewWidth, left));
        $previewContainer.toggleClass("preview-bubble-below", below).toggleClass("preview-bubble-above", !below);

        $previewContainer
            .css({
                left: left,
                top: top
            })
            .addClass("active");
    }

    /** Hide the popup without discarding its controls, and cancel any pending layout measurements. */
    function suspendPreviewLayout() {
        clearTimeout(layoutTimer);
        layoutTimer = null;
        cancelAnimationFrame(layoutFrame);
        layoutFrame = 0;
        if (popoverState && popoverState.visible && !popoverState.layoutPending) {
            popoverState.layoutPending = true;
            $previewContainer.css("visibility", "hidden");
        }
    }

    /** Remeasure once after resizing finishes, then reveal the existing popup at its new position. */
    function restorePreviewLayout() {
        clearTimeout(layoutTimer);
        layoutTimer = null;
        if (!popoverState || !popoverState.visible || resizingPanels.size || layoutFrame) { return; }
        layoutFrame = requestAnimationFrame(function () {
            layoutFrame = 0;
            if (!popoverState || !popoverState.visible || resizingPanels.size) { return; }
            const editor = popoverState.editor;
            const cursor = editor.charCoords(editor.getCursorPos(), "window");
            popoverState.anchor = {x: cursor.left, y: cursor.top};
            positionPreview(editor, true);
            if (popoverState && popoverState.visible) {
                popoverState.layoutPending = false;
                $previewContainer.css("visibility", "");
            }
        });
    }

    /** Wait for layout events to settle when there is no explicit panel-resize lifecycle. */
    function schedulePreviewLayout() {
        if (!popoverState || !popoverState.visible) { return; }
        suspendPreviewLayout();
        if (!resizingPanels.size) {
            layoutTimer = setTimeout(restorePreviewLayout, LAYOUT_SETTLE_DELAY);
        }
    }

    /**
     * Suspend positioning throughout a panel drag, including any forwarded resize events.
     * @param {jQuery.Event} event Resize-start event whose target identifies the resizing panel.
     */
    function onPanelResizeStart(event) {
        resizingPanels.add(event.target);
        if (popoverState && popoverState.visible) {
            suspendPreviewLayout();
        } else {
            hidePreview(false);
        }
    }

    /**
     * Restore the popup after all panels participating in the drag have finished resizing.
     * @param {jQuery.Event} event Resize-end event for the panel that finished resizing.
     */
    function onPanelResizeEnd(event) {
        if (resizingPanels.delete(event.target) && !resizingPanels.size) {
            restorePreviewLayout();
        }
    }

    // Preview hide/show logic ------------------------------------------------

    function _createPopoverState(editor, popoverResults) {
        if (popoverResults && popoverResults.length) {
            let popover = {
                content: $("<div id='selection-view-popover-root'></div>")
            };
            // Each provider return popover { start, end, content}
            for(let result of popoverResults){
                popover.content.append(result.content);
            }

            let pos = editor.getCursorPos();
            let startCoord = editor.charCoords(pos),
                endCoord = editor.charCoords(pos);
            popover.xpos = (endCoord.left - startCoord.left) / 2 + startCoord.left;
            if(endCoord.left<startCoord.left){
                // this probably spans multiple lines, just show at start cursor position
                popover.xpos = startCoord.left;
            }
            popover.ytop = startCoord.top;
            popover.ybot = startCoord.bottom;
            popover.visible = false;
            popover.editor  = editor;
            popover.pos = pos;
            return popover;
        }

        return null;
    }

    /**
     * Returns a 'ready for use' popover state object or null if there is no popover:
     * { visible: false, editor, start, end, content, xpos, ytop, ybot }
     * @private
     */
    async function queryPreviewProviders(editor, selectionObj) {
        if(!editor){
            return null;
        }

        selectionObj = selectionObj || editor.getSelections();
        if(selectionObj.length !== 1){
            // we only show selection view over a single selection
            return null;
        }
        let selection = editor.getSelection();
        if(selection.start.line === selection.end.line &&  selection.start.ch === selection.end.ch){
            //this is just a cursor
            return null;
        }
        let providers = _getSelectionViewProviders(editor);
        let popovers = [], providerPromises = [];
        for(let provider of providers){
            if(!provider.getSelectionView){
                console.error("Error: SelectionView provider should implement getSelectionView function", provider);
                continue;
            }
            providerPromises.push(provider.getSelectionView(editor, selectionObj));
        }
        let results = await Promise.allSettled(providerPromises);
        for(let result of results){
            if(result.status === "fulfilled" && result.value){
                popovers.push(result.value);
            }
        }

        return _createPopoverState(editor, popovers);
    }

    /**
     * Changes the current hidden popoverState to visible, showing it in the UI and highlighting
     * its matching text in the editor.
     * @private
     */
    function _renderPreview(editor) {
        if (popoverState) {
            let $popoverContent = $(popoverState.content);
            $previewContent.empty();
            $previewContent.append($popoverContent);
            $previewContainer.show();
            popoverState.visible = true;
            positionPreview(editor);
        }
    }

    /**
     * Render only the latest provider result; dismissed requests cannot reopen the popup.
     * @param {Editor} editor Editor providing the selected text.
     * @param {Array<Object>} selectionObj Selected ranges supplied to providers.
     * @return {Promise<void>} Resolves after the provider results have been considered.
     */
    async function showPreview(editor, selectionObj) {
        if (!editor) {
            hidePreview();
            return;
        }

        // Query providers and append to popoverState
        currentQueryID++;
        let savedQueryId = currentQueryID;
        queryInProgress = true;
        const result = await queryPreviewProviders(editor, selectionObj);
        if(savedQueryId === currentQueryID){
            // this is to prevent race conditions. For Eg., if the preview provider takes time to generate a preview,
            // another query might have happened while the last query is still in progress. So we only render the most
            // recent QueryID
            queryInProgress = false;
            popoverState = result;
            _renderPreview(editor);
        }
    }

    function handleMouseUp(event) {
        if (!enabled || resizingPanels.size) {
            return;
        }

        hidePreview();
        if (event.buttons !== 0) {
            // Button is down - don't show popovers while dragging
            return;
        }
        lastMouseX = event.clientX;
        lastMouseY = event.clientY;
        popupTimer = setTimeout(()=>{
            popupTimer = null;
            // we do this delayed popup so that we get a consistent view of the editor selections
            let editor = EditorManager.getActiveEditor();
            if(editor){
                showPreview(editor, editor.getSelections());
            }
        }, POPUP_DELAY);
    }

    function _processMouseMove(event) {
        if (!enabled || resizingPanels.size || popupTimer !== null || queryInProgress ||
            (popoverState && popoverState.visible)) {
            return;
        }
        lastMouseX= event.clientX;
        lastMouseY= event.clientY;
        if (event.buttons !== 0) {
            // Button is down - don't show popovers while dragging
            return;
        }
        let editor = EditorManager.getHoveredEditor(event);
        if (editor) {
            // Find char mouse is over
            let mousePos = editor.coordsChar({left: event.clientX, top: event.clientY});
            let selectionObj = editor.getSelections();
            if(selectionObj.length !== 1){
                // we only show selection view over a single selection
                return;
            }
            let selection = editor.getSelection();
            if(selection.start.line === selection.end.line &&  selection.start.ch === selection.end.ch){
                //this is just a cursor
                return;
            }
            if (editor.posWithinRange(mousePos, selection.start, selection.end, true)) {
                showPreview(editor, selectionObj);
            }
        }
    }

    /** Dismiss on editor viewport scrolling, except while workspace layout is being restored. */
    function onEditorScroll() {
        if (resizingPanels.size || (popoverState && popoverState.layoutPending)) { return; }
        hidePreview(false);
    }

    function onActiveEditorChange(_event, current, previous) {
        // Hide preview when editor changes
        hidePreview();

        if (previous && previous.document) {
            previous.document.off("change", hidePreview);
            previous.off("scroll", onEditorScroll);
        }

        if (current && current.document) {
            current.document.on("change", hidePreview);
            current.on("scroll", onEditorScroll);
        }
    }

    // Menu command handlers
    function updateMenuItemCheckmark() {
        CommandManager.get(CMD_ENABLE_SELECTION_VIEW).setChecked(enabled);
    }

    function setEnabled(_enabled, doNotSave) {
        if (enabled !== _enabled) {
            enabled = _enabled;
            let editorHolder = $("#editor-holder")[0];
            if (enabled) {
                // Editor scroll events exclude Firefox's hidden input scrolling on selection/focus.
                // Text edits already dismiss through the document change listener.
                editorHolder.addEventListener("mouseup", handleMouseUp, true);
                editorHolder.addEventListener("mousemove", _processMouseMove, true);

                // Setup doc "change" listener
                onActiveEditorChange(null, EditorManager.getActiveEditor(), null);
                EditorManager.on("activeEditorChange", onActiveEditorChange);

            } else {
                editorHolder.removeEventListener("mouseup", handleMouseUp, true);
                editorHolder.removeEventListener("mousemove", _processMouseMove, true);

                // Cleanup doc "change" listener
                onActiveEditorChange(null, null, EditorManager.getActiveEditor());
                EditorManager.off("activeEditorChange", onActiveEditorChange);

                hidePreview();
            }
            if (!doNotSave) {
                prefs.set("enabled", enabled);
                prefs.save();
            }
        }
        // Always update the checkmark, even if the enabled flag hasn't changed.
        updateMenuItemCheckmark();
    }

    function toggleEnableSelectionView() {
        setEnabled(!enabled);
    }

    function _forceShow(popover) {
        hidePreview();
        popoverState = popover;
        _renderPreview(popover.editor);
    }

    function _handleEscapeKeyEvent(event) {
        if(popoverState && popoverState.visible){
            hidePreview();
            event.preventDefault();
            event.stopPropagation();
            return true;
        }
        return false;
    }

    AppInit.appReady(function () {
        // Create the preview container
        $previewContainer = $(previewContainerHTML).appendTo($("body"));
        $previewContent = $previewContainer.find(".preview-content");
        observer.observe($previewContent[0], {
            childList: true, // Observe direct children
            subtree: true // And lower descendants too
        });
        exports.on(_EVENT_POPUP_CONTENT_MUTATED, function () {
            if (isSelectionViewShown()) {
                positionPreview(popoverState.editor);
            }
        });
        WorkspaceManager.on("workspaceUpdateLayout", schedulePreviewLayout);
        $(document).on(Resizer.EVENT_PANEL_RESIZE_START + ".selectionView", onPanelResizeStart)
            .on(Resizer.EVENT_PANEL_RESIZE_END + ".selectionView", onPanelResizeEnd);

        // Register command
        // Insert menu at specific pos since this may load before OR after code folding extension
        CommandManager.register(Strings.CMD_ENABLE_SELECTION_VIEW, CMD_ENABLE_SELECTION_VIEW, toggleEnableSelectionView);
        Menus.getMenu(Menus.AppMenuBar.VIEW_MENU).addMenuItem(
            CMD_ENABLE_SELECTION_VIEW, null, Menus.AFTER, Commands.VIEW_TOGGLE_INSPECTION);

        // Setup initial UI state
        setEnabled(prefs.get("enabled"), true);

        prefs.on("change", "enabled", function () {
            setEnabled(prefs.get("enabled"), true);
        });

        WorkspaceManager.addEscapeKeyEventHandler("selectionView", _handleEscapeKeyEvent);
    });

    /**
     * Whether the selection popup is visible, excluding temporary suspension during layout changes.
     * @return {boolean}
     * @type {function}
     */
    function isSelectionViewShown() {
        return (popoverState && popoverState.visible && !popoverState.layoutPending) || false;
    }

    // For unit testing
    exports._queryPreviewProviders  = queryPreviewProviders;
    exports._forceShow              = _forceShow;

    exports.registerSelectionViewProvider = registerSelectionViewProvider;
    exports.removeSelectionViewProvider   = removeSelectionViewProvider;
    exports.hidePreview = hidePreview;
    exports.isSelectionViewShown = isSelectionViewShown;
});
