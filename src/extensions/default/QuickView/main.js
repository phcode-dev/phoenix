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

define(function (require, exports, module) {


    // Brackets modules
    const colorGradientProvider          = require("./colorGradientProvider"),
        ImagePreviewProvider           = require("./ImagePreviewProvider"),
        CommandManager      = brackets.getModule("command/CommandManager"),
        Commands            = brackets.getModule("command/Commands"),
        EditorManager       = brackets.getModule("editor/EditorManager"),
        ExtensionUtils      = brackets.getModule("utils/ExtensionUtils"),
        Menus               = brackets.getModule("command/Menus"),
        PreferencesManager  = brackets.getModule("preferences/PreferencesManager"),
        Strings             = brackets.getModule("strings"),
        ViewUtils           = brackets.getModule("utils/ViewUtils");

    const previewContainerHTML       = require("text!QuickViewTemplate.html");

    let enabled,                             // Only show preview if true
        prefs                      = null,   // Preferences
        $previewContainer,                   // Preview container
        $previewContent,                     // Preview content holder
        _currentMousePos,
        animationRequest;

    // Constants
    const CMD_ENABLE_QUICK_VIEW       = "view.enableQuickView",
        QUICK_VIEW_EDITOR_MARKER = 'quickViewMark',
        // Time (ms) mouse must remain over a provider's matched text before popover appears
        HOVER_DELAY                 = 500,
        // Pointer height, used to shift popover above pointer (plus a little bit of space)
        POINTER_HEIGHT              = 15,
        POPOVER_HORZ_MARGIN         =  5;   // Horizontal margin

    prefs = PreferencesManager.getExtensionPrefs("quickview");
    prefs.definePreference("enabled", "boolean", true, {
        description: Strings.DESCRIPTION_QUICK_VIEW_ENABLED
    });

    /**
     * There are three states for this var:
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
     *      onShow: ?function():void,       - called once popover content added to the DOM (may never be called)
     *        - if specified, must call positionPreview()
     *      xpos: number,                   - x of center of popover
     *      ytop: number,                   - y of top of matched text (when popover placed above text, normally)
     *      ybot: number,                   - y of bottom of matched text (when popover moved below text, avoiding window top)
     *      marker: ?CodeMirror.TextMarker  - only set once visible==true
     * }}
     */
    let popoverState = null;



    // Popover widget management ----------------------------------------------

    /**
     * Cancels whatever popoverState was currently pending and sets it back to null. If the popover was visible,
     * hides it; if the popover was invisible and still pending, cancels hoverTimer so it will never be shown.
     */
    function hidePreview() {
        console.log("hiding preview");
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

    /**
     * Returns a 'ready for use' popover state object:
     * { visible: false, editor, start, end, content, ?onShow, xpos, ytop, ybot }
     * Lacks only hoverTimer (supplied by handleMouseMove()) and marker (supplied by showPreview()).
     */
    function queryPreviewProviders(editor, pos, token) {
        let line = editor.document.getLine(pos.line);

        // FUTURE: Support plugin providers. For now we just hard-code...
        let popover = colorGradientProvider.colorAndGradientPreviewProvider($previewContainer, editor, pos, token, line)
            || ImagePreviewProvider.imagePreviewProvider($previewContainer, editor, pos, token, line);

        if (popover) {
            // Providers return just { start, end, content, ?onShow, xpos, ytop, ybot }
            popover.visible = false;
            popover.editor  = editor;
            return popover;
        }

        return null;
    }

    /**
     * Changes the current hidden popoverState to visible, showing it in the UI and highlighting
     * its matching text in the editor.
     */
    function showPreview(editor, popover) {
        console.log("showpreview");
        let token;

        // Figure out which editor we are over
        if (!editor) {
            editor = EditorManager.getHoveredEditor(_currentMousePos);
        }

        if (!editor) {
            console.log("hiding as no editor");
            hidePreview();
            return;
        }

        // Find char mouse is over
        let pos = editor.coordsChar({left: _currentMousePos.clientX, top: _currentMousePos.clientY});

        // No preview if mouse is past last char on line
        if (pos.ch >= editor.document.getLine(pos.line).length) {
            return;
        }

        if (popover) {
            popoverState = popover;
        } else {
            // Query providers and append to popoverState
            token = editor.getToken(pos);
            popoverState = $.extend({}, popoverState, queryPreviewProviders(editor, pos, token));
        }

        if (popoverState && popoverState.start && popoverState.end) {
            popoverState.marker = editor.markText(
                QUICK_VIEW_EDITOR_MARKER,
                popoverState.start,
                popoverState.end,
                {className: "quick-view-highlight"}
            );

            $previewContent.append(popoverState.content);
            $previewContainer.show();

            popoverState.visible = true;

            if (popoverState.onShow) {
                popoverState.onShow()
                    .then(()=>{
                        $previewContainer.show();
                        positionPreview(editor, popoverState.xpos, popoverState.ytop, popoverState.ybot);
                    })
                    .catch(()=>{
                        console.log("hiding onShow error");
                        hidePreview();
                    });
            } else {
                positionPreview(editor, popoverState.xpos, popoverState.ytop, popoverState.ybot);
            }
        }
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
                console.log("hiding to create new popup");
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

        if (event.which) {
            // Button is down - don't show popovers while dragging
            console.log("hiding as button clicked");
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
        console.log("hiding active editor changed");
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
        CommandManager.get(CMD_ENABLE_QUICK_VIEW).setChecked(enabled);
    }

    let mouseInPreviewContainer = false;
    function mouseOut(_evt) {
        setTimeout(()=>{
            if(mouseInPreviewContainer){
                return;
            }
            console.log("hiding mouse out");
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

    function toggleEnableQuickView() {
        setEnabled(!enabled);
    }

    function _forceShow(popover) {
        hidePreview();
        _currentMousePos = {
            clientX: popover.xpos,
            clientY: Math.floor((popover.ybot + popover.ytop) / 2)
        };
        showPreview(popover.editor, popover);
    }

    // Create the preview container
    $previewContainer = $(previewContainerHTML).appendTo($("body"));
    $previewContent = $previewContainer.find(".preview-content");

    // Load our stylesheet
    ExtensionUtils.loadStyleSheet(module, "QuickView.less");

    // Register command
    // Insert menu at specific pos since this may load before OR after code folding extension
    CommandManager.register(Strings.CMD_ENABLE_QUICK_VIEW, CMD_ENABLE_QUICK_VIEW, toggleEnableQuickView);
    Menus.getMenu(Menus.AppMenuBar.VIEW_MENU).addMenuItem(
        CMD_ENABLE_QUICK_VIEW, null, Menus.AFTER, Commands.VIEW_TOGGLE_INSPECTION);

    // Setup initial UI state
    setEnabled(prefs.get("enabled"), true);

    prefs.on("change", "enabled", function () {
        setEnabled(prefs.get("enabled"), true);
    });

    // For unit testing
    exports._queryPreviewProviders  = queryPreviewProviders;
    exports._forceShow              = _forceShow;
});
