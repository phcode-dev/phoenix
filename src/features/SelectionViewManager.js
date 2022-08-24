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
 * ![quick-view-image.png](todo add images here)
 *
 * ### See Related: QuickViewManager
 * [features/QuickViewManager](https://github.com/phcode-dev/phoenix/wiki/QuickViewManager-API) is similar to
 * SelectionViewManager API.
 * * SelectionViews popup only once user selects a text.
 * * Quickviews popup on mouse hover. They are not shown if there is a selection view already being displayed.
 * ![quick-view-youtube.png](generatedDocs/images/quick-view-youtube.png)
 *
 * ## Usage
 * Lets build a "hello world" extension that displays "hello world" above selected text in the editor.
 * In your extension file, add the following code:
 * ```js
 * const SelectionViewManager = brackets.getModule("features/SelectionViewManager");
 * // replace `all` with language ID(Eg. javascript) if you want to restrict the preview to js files only.
 * SelectionViewManager.registerSelectionViewProvider(exports, ["all"]);
 *
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
 * ```js
 * // syntax
 * SelectionViewManager.registerSelectionViewProvider(provider, supportedLanguages);
 * ```
 * The API requires two parameters:
 * 1. `provider`: must implement a  `getSelectionView` function which will be invoked to get the preview. See API doc below.
 * 1. `supportedLanguages`: An array of languages that the SelectionView supports. If `["all"]` is supplied, then the
 *    SelectionView will be invoked for all languages. Restrict to specific languages: Eg: `["javascript", "html", "php"]`
 *
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
 * Removes a registered code hint provider. The API takes the same arguments as `registerSelectionViewProvider`.
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
        ViewUtils           = require("utils/ViewUtils"),
        AppInit             = require("utils/AppInit"),
        ProviderRegistrationHandler = require("features/PriorityBasedRegistration").RegistrationHandler;

    const previewContainerHTML       = '<div id="selection-view-container">\n' +
        '    <div class="preview-content">\n' +
        '    </div>\n' +
        '</div>';

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
        $previewContent,                     // Preview content holder
        _currentMousePos,
        animationRequest;

    // Constants
    const CMD_ENABLE_SELECTION_VIEW       = "view.enableSelectionView",
        SELECTION_VIEW_EDITOR_MARKER = 'SelectionViewMark',
        // Time (ms) mouse must remain over a provider's matched text before popover appears
        HOVER_DELAY                 = 500,
        // Pointer height, used to shift popover above pointer (plus a little bit of space)
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
     *
     * @type {{
     *      visible: boolean,
     *      editor: !Editor,
     *      hoverTimer: number,             - setTimeout() token
     *      start: !{line, ch},             - start of matched text range
     *      end: !{line, ch},               - end of matched text range
     *      content: !string,               - HTML content to display in popover
     *      xpos: number,                   - x of center of popover
     *      ytop: number,                   - y of top of matched text (when popover placed above text, normally)
     *      ybot: number,                   - y of bottom of matched text (when popover moved below text, avoiding window top)
     *      marker: ?CodeMirror.TextMarker  - only set once visible==true
     * }}
     * @private
     */
    let popoverState = null;



    // Popover widget management ----------------------------------------------

    /**
     * Cancels whatever popoverState was currently pending and sets it back to null. If the popover was visible,
     * hides it; if the popover was invisible and still pending, cancels hoverTimer so it will never be shown.
     * @private
     */
    function hidePreview() {
        if (!popoverState) {
            return;
        }

        if (popoverState.visible) {
            popoverState.marker.clear();

            $previewContent.empty();
            $previewContainer.hide();
            $previewContainer.removeClass("active");
        } else {
            showPreviewQueued = false;
            mouseInPreviewContainer = false;
            window.clearTimeout(popoverState.hoverTimer);
        }
        popoverState = null;
    }

    function positionPreview(editor, xpos, ypos, ybot) {
        if ($previewContent.find("#quick-view-popover-root").is(':empty')){
            hidePreview();
            return;
        }
        let previewWidth  = $previewContainer.outerWidth(),
            top           = ypos - $previewContainer.outerHeight() - POINTER_HEIGHT,
            left          = xpos - previewWidth / 2,
            elementRect = {
                top: top,
                left: left - POPOVER_HORZ_MARGIN,
                height: $previewContainer.outerHeight() + POINTER_HEIGHT,
                width: previewWidth + 2 * POPOVER_HORZ_MARGIN
            },
            clip = ViewUtils.getElementClipSize($(editor.getRootElement()), elementRect);

        // Prevent horizontal clipping
        if (clip.left > 0) {
            left += clip.left;
        } else if (clip.right > 0) {
            left -= clip.right;
        }

        // If clipped on top, flip popover below line
        if (clip.top > 0) {
            top = ybot + POINTER_HEIGHT;
            $previewContainer
                .removeClass("preview-bubble-above")
                .addClass("preview-bubble-below");
        } else {
            $previewContainer
                .removeClass("preview-bubble-below")
                .addClass("preview-bubble-above");
        }

        $previewContainer
            .css({
                left: left,
                top: top
            })
            .addClass("active");
    }

    // Preview hide/show logic ------------------------------------------------

    function _isResultBeforePopoverStart(editor, popover, result){
        if(!popover.start){
            return true;
        }
        return editor.indexFromPos(result.start) < editor.indexFromPos(popover.start);
    }

    function _isResultAfterPopoverEnd(editor, popover, result){
        if(!popover.end){
            return true;
        }
        return editor.indexFromPos(popover.start) > editor.indexFromPos(result.end);
    }

    function _createPopoverState(editor, popoverResults) {
        if (popoverResults && popoverResults.length) {
            let popover = {
                content: $("<div id='quick-view-popover-root'></div>")
            };
            // Each provider return popover { start, end, content}
            for(let result of popoverResults){
                if(_isResultBeforePopoverStart(editor, popover, result)){
                    popover.start = result.start;
                }
                if(_isResultAfterPopoverEnd(editor, popover, result)){
                    popover.end = result.end;
                }
                popover.content.append(result.content);
            }

            let startCoord = editor.charCoords(popover.start),
                endCoord = editor.charCoords(popover.end);
            popover.xpos = (endCoord.left - startCoord.left) / 2 + startCoord.left;
            if(endCoord.left<startCoord.left){
                // this probably spans multiple lines, just show at start cursor position
                popover.xpos = startCoord.left;
            }
            popover.ytop = startCoord.top;
            popover.ybot = startCoord.bottom;
            popover.visible = false;
            popover.editor  = editor;
            return popover;
        }

        return null;
    }

    /**
     * Returns a 'ready for use' popover state object:
     * { visible: false, editor, start, end, content, ?onShow, xpos, ytop, ybot }
     * Lacks only hoverTimer (supplied by handleMouseMove()) and marker (supplied by showPreview()).
     * @private
     */
    async function queryPreviewProviders(editor, pos, token) {
        let line = editor.document.getLine(pos.line);
        let providers = _getSelectionViewProviders(editor);
        let popovers = [], providerPromises = [];
        for(let provider of providers){
            if(!provider.getSelectionView){
                console.error("SelectionView provider does not implement the required getSelectionView function", provider);
                continue;
            }
            providerPromises.push(provider.getSelectionView(editor, pos, token, line));
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
        if (popoverState && popoverState.start && popoverState.end) {
            popoverState.marker = editor.markText(
                SELECTION_VIEW_EDITOR_MARKER,
                popoverState.start,
                popoverState.end,
                {className: "quick-view-highlight"}
            );

            let $popoverContent = $(popoverState.content);
            $previewContent.append($popoverContent);
            $previewContainer.show();
            popoverState.visible = true;
            positionPreview(editor, popoverState.xpos, popoverState.ytop, popoverState.ybot);

            $popoverContent[0].addEventListener('DOMSubtreeModified', ()=>{
                positionPreview(editor, popoverState.xpos, popoverState.ytop, popoverState.ybot);
            }, false);
        }
    }

    async function showPreview(editor) {
        let token;

        // Figure out which editor we are over
        if (!editor) {
            editor = EditorManager.getHoveredEditor(_currentMousePos);
        }

        if (!editor) {
            hidePreview();
            return;
        }

        // Find char mouse is over
        let pos = editor.coordsChar({left: _currentMousePos.clientX, top: _currentMousePos.clientY});

        // No preview if mouse is past last char on line
        if (pos.ch >= editor.document.getLine(pos.line).length) {
            return;
        }

        // Query providers and append to popoverState
        token = editor.getToken(pos);
        popoverState = await queryPreviewProviders(editor, pos, token);
        _renderPreview(editor);
    }

    function _isMouseFarFromPopup() {
        const previewRect = $previewContainer[0].getBoundingClientRect();
        const docRect = {
            height: $(document).height(),
            width: $(document).width()
        };
        const thresholdPercent = 5;
        function _isDistanceExceedThreshold(smaller, larger, total, threshold) {
            return ((larger - smaller)/total)*100 > threshold;
        }
        let x= _currentMousePos.clientX, y=_currentMousePos.clientY;
        if((x<previewRect.left && _isDistanceExceedThreshold(x, previewRect.left, docRect.width, thresholdPercent))
            ||(x>previewRect.right && _isDistanceExceedThreshold(previewRect.right, x, docRect.width, thresholdPercent))
            ||(y<previewRect.top && _isDistanceExceedThreshold(y, previewRect.top, docRect.height, thresholdPercent))
            ||(y>previewRect.bottom && _isDistanceExceedThreshold(previewRect.bottom, y, docRect.height, thresholdPercent))){
            return true;
        }
        return false;
    }

    let showPreviewQueued = false;

    function processMouseMove() {
        animationRequest = null;

        if (mouseInPreviewContainer) {
            return;
        }

        let editor = null;

        if (popoverState && popoverState.visible) {
            // Only figure out which editor we are over when there is already a popover
            // showing (otherwise wait until after delay to minimize processing)
            editor = EditorManager.getHoveredEditor(_currentMousePos);
            if (editor) {
                // Find char mouse is over
                let pos = editor.coordsChar({left: _currentMousePos.clientX, top: _currentMousePos.clientY});
                if (popoverState.start && popoverState.end &&
                        editor.posWithinRange(pos, popoverState.start, popoverState.end, true) &&
                        (pos.ch < editor.document.getLine(pos.line).length)) {

                    // That one's still relevant - nothing more to do
                    // Note: posWithinRange() includes mouse past end of line, so need to check for that case
                    return;
                }
                if(_isMouseFarFromPopup()){
                    hidePreview();
                    return;
                }
            }
        }

        if(!showPreviewQueued){
            // Initialize popoverState
            showPreviewQueued = true;
            popoverState = popoverState || {};

            // Set timer to scan and show. This will get cancelled (in hidePreview())
            // if mouse movement rendered this popover inapplicable before timer fires.
            // When showing "immediately", still use setTimeout() to make this async
            // so we return from this mousemove event handler ASAP.
            popoverState.hoverTimer = window.setTimeout(function () {
                showPreviewQueued = false;
                if(!mouseInPreviewContainer){
                    hidePreview();
                    popoverState = {};
                    showPreview(editor);
                }
            }, HOVER_DELAY);
        }
    }

    function handleMouseMove(event) {
        // Keep track of mouse position
        _currentMousePos = {
            clientX: event.clientX,
            clientY: event.clientY
        };

        if (!enabled) {
            return;
        }

        if (event.buttons !== 0) {
            // Button is down - don't show popovers while dragging
            hidePreview();
            return;
        }

        // Prevent duplicate animation frame requests
        if (!animationRequest) {
            animationRequest = window.requestAnimationFrame(processMouseMove);
        }
    }

    function onActiveEditorChange(event, current, previous) {
        // Hide preview when editor changes
        hidePreview();

        if (previous && previous.document) {
            previous.document.off("change", hidePreview);
        }

        if (current && current.document) {
            current.document.on("change", hidePreview);
        }
    }

    // Menu command handlers
    function updateMenuItemCheckmark() {
        CommandManager.get(CMD_ENABLE_SELECTION_VIEW).setChecked(enabled);
    }

    let mouseInPreviewContainer = false;
    function mouseOut(_evt) {
        setTimeout(()=>{
            if(mouseInPreviewContainer || $previewContainer[0].contains(_evt.toElement)){
                return;
            }
            hidePreview();
        }, HOVER_DELAY);
    }

    function _mouseEnteredPreviewContainer() {
        mouseInPreviewContainer = true;
    }

    function _mouseExitedPreviewContainer() {
        mouseInPreviewContainer = false;
    }

    function setEnabled(_enabled, doNotSave) {
        if (enabled !== _enabled) {
            enabled = _enabled;
            let editorHolder = $("#editor-holder")[0];
            let previewContainer = $previewContainer[0];
            if (enabled) {
                // Note: listening to "scroll" also catches text edits, which bubble a scroll
                // event up from the hidden text area. This means
                // we auto-hide on text edit, which is probably actually a good thing.
                editorHolder.addEventListener("mousemove", handleMouseMove, true);
                editorHolder.addEventListener("scroll", hidePreview, true);
                editorHolder.addEventListener("mouseout", mouseOut, true);
                previewContainer.addEventListener("mouseover", _mouseEnteredPreviewContainer, true);
                previewContainer.addEventListener("mouseout", _mouseExitedPreviewContainer, true);

                // Setup doc "change" listener
                onActiveEditorChange(null, EditorManager.getActiveEditor(), null);
                EditorManager.on("activeEditorChange", onActiveEditorChange);

            } else {
                editorHolder.removeEventListener("mousemove", handleMouseMove, true);
                editorHolder.removeEventListener("scroll", hidePreview, true);
                editorHolder.removeEventListener("mouseout", mouseOut, true);
                previewContainer.removeEventListener("mouseover", _mouseEnteredPreviewContainer, true);
                previewContainer.removeEventListener("mouseout", _mouseExitedPreviewContainer, true);


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
        _currentMousePos = {
            clientX: popover.xpos,
            clientY: Math.floor((popover.ybot + popover.ytop) / 2)
        };
        popoverState = popover;
        _renderPreview(popover.editor);
    }

    AppInit.appReady(function () {
        // Create the preview container
        $previewContainer = $(previewContainerHTML).appendTo($("body"));
        $previewContent = $previewContainer.find(".preview-content");

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
    });

    // For unit testing
    exports._queryPreviewProviders  = queryPreviewProviders;
    exports._forceShow              = _forceShow;

    exports.registerSelectionViewProvider = registerSelectionViewProvider;
    exports.removeSelectionViewProvider   = removeSelectionViewProvider;
});
