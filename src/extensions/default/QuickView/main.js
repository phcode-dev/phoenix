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
        ViewUtils           = brackets.getModule("utils/ViewUtils"),
        TokenUtils          = brackets.getModule("utils/TokenUtils");

    const previewContainerHTML       = require("text!QuickViewTemplate.html");

    let enabled,                             // Only show preview if true
        prefs                      = null,   // Preferences
        $previewContainer,                   // Preview container
        $previewContent,                     // Preview content holder
        lastMousePos,                        // Last mouse position
        animationRequest;

    // Constants
    const CMD_ENABLE_QUICK_VIEW       = "view.enableQuickView",
        // Time (ms) mouse must remain over a provider's matched text before popover appears
        HOVER_DELAY                 = 350,
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
        if (!popoverState) {
            return;
        }

        if (popoverState.visible) {
            popoverState.marker.clear();

            $previewContent.empty();
            $previewContainer.hide();
            $previewContainer.removeClass("active");
        } else {
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

    function divContainsMouse($div, mousePos) {
        let offset = $div.offset();

        return (mousePos.clientX >= offset.left &&
                mousePos.clientX <= offset.left + $div.width() &&
                mousePos.clientY >= offset.top &&
                mousePos.clientY <= offset.top + $div.height());
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

    function getHoveredEditor(mousePos) {
        // Figure out which editor we are over
        let fullEditor = EditorManager.getCurrentFullEditor();

        if (!fullEditor || !mousePos) {
            return;
        }

        // Check for inline Editor instances first
        let inlines = fullEditor.getInlineWidgets(),
            i,
            editor;

        for (i = 0; i < inlines.length; i++) {
            // see MultiRangeInlineEditor
            let $inlineEditorRoot = inlines[i].editor && $(inlines[i].editor.getRootElement()),
                $otherDiv = inlines[i].$htmlContent;

            if ($inlineEditorRoot && divContainsMouse($inlineEditorRoot, mousePos)) {
                editor = inlines[i].editor;
                break;
            } else if ($otherDiv && divContainsMouse($otherDiv, mousePos)) {
                // Mouse inside unsupported inline editor like Quick Docs or Color Editor
                return;
            }
        }

        // Check main editor
        if (!editor) {
            if (divContainsMouse($(fullEditor.getRootElement()), mousePos)) {
                editor = fullEditor;
            }
        }

        return editor;
    }

    /**
     * Changes the current hidden popoverState to visible, showing it in the UI and highlighting
     * its matching text in the editor.
     */
    function showPreview(editor, popover) {
        let token, cm;

        // Figure out which editor we are over
        if (!editor) {
            editor = getHoveredEditor(lastMousePos);
        }

        if (!editor || !editor._codeMirror) {
            hidePreview();
            return;
        }

        cm = editor._codeMirror;

        // Find char mouse is over
        let pos = cm.coordsChar({left: lastMousePos.clientX, top: lastMousePos.clientY});

        // No preview if mouse is past last char on line
        if (pos.ch >= editor.document.getLine(pos.line).length) {
            return;
        }

        if (popover) {
            popoverState = popover;
        } else {
            // Query providers and append to popoverState
            token = TokenUtils.getTokenAt(cm, pos);
            popoverState = $.extend({}, popoverState, queryPreviewProviders(editor, pos, token));
        }

        if (popoverState && popoverState.start && popoverState.end) {
            popoverState.marker = cm.markText(
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
                    .catch(hidePreview);
            } else {
                positionPreview(editor, popoverState.xpos, popoverState.ytop, popoverState.ybot);
            }
        }
    }

    function processMouseMove() {
        animationRequest = null;

        if (!lastMousePos) {
            return;         // should never get here, but safety first!
        }

        let showImmediately = false,
            editor = null;

        if (popoverState && popoverState.visible) {
            // Only figure out which editor we are over when there is already a popover
            // showing (otherwise wait until after delay to minimize processing)
            editor = getHoveredEditor(lastMousePos);
            if (editor && editor._codeMirror) {
                // Find char mouse is over
                let cm = editor._codeMirror,
                    pos = cm.coordsChar({left: lastMousePos.clientX, top: lastMousePos.clientY});

                if (popoverState.start && popoverState.end &&
                        editor.posWithinRange(pos, popoverState.start, popoverState.end, true) &&
                        (pos.ch < editor.document.getLine(pos.line).length)) {

                    // That one's still relevant - nothing more to do
                    // Note: posWithinRange() includes mouse past end of line, so need to check for that case
                    return;
                }
            }

            // That one doesn't cover this pos - hide it and start anew
            showImmediately = true;
        }

        // Initialize popoverState
        hidePreview();
        popoverState = {};

        // Set timer to scan and show. This will get cancelled (in hidePreview())
        // if mouse movement rendered this popover inapplicable before timer fires.
        // When showing "immediately", still use setTimeout() to make this async
        // so we return from this mousemove event handler ASAP.
        popoverState.hoverTimer = window.setTimeout(function () {
            showPreview(editor);
        }, showImmediately ? 0 : HOVER_DELAY);
    }

    function handleMouseMove(event) {
        lastMousePos = null;

        if (!enabled) {
            return;
        }

        if (event.which) {
            // Button is down - don't show popovers while dragging
            hidePreview();
            return;
        }

        // Keep track of last mouse position
        lastMousePos = {
            clientX: event.clientX,
            clientY: event.clientY
        };

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
        CommandManager.get(CMD_ENABLE_QUICK_VIEW).setChecked(enabled);
    }

    function setEnabled(_enabled, doNotSave) {
        if (enabled !== _enabled) {
            enabled = _enabled;
            let editorHolder = $("#editor-holder")[0];
            if (enabled) {
                // Note: listening to "scroll" also catches text edits, which bubble a scroll
                // event up from the hidden text area. This means
                // we auto-hide on text edit, which is probably actually a good thing.
                editorHolder.addEventListener("mousemove", handleMouseMove, true);
                editorHolder.addEventListener("scroll", hidePreview, true);
                editorHolder.addEventListener("mouseout", hidePreview, true);

                // Setup doc "change" listener
                onActiveEditorChange(null, EditorManager.getActiveEditor(), null);
                EditorManager.on("activeEditorChange", onActiveEditorChange);

            } else {
                editorHolder.removeEventListener("mousemove", handleMouseMove, true);
                editorHolder.removeEventListener("scroll", hidePreview, true);
                editorHolder.removeEventListener("mouseout", hidePreview, true);

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
        lastMousePos = {
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
