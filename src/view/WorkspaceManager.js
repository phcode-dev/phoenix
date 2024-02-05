/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2014 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/**
* Manages layout of panels surrounding the editor area, and size of the editor area (but not its contents).
 *
 * Updates panel sizes when the window is resized. Maintains the max resizing limits for panels, based on
 * currently available window size.
 *
 * Events:
 * `workspaceUpdateLayout` When workspace size changes for any reason (including panel show/hide panel resize, or the window resize).
 *              The 2nd arg is the available workspace height.
 *              The 3rd arg is a refreshHint flag for internal use (passed in to recomputeLayout)
 */
define(function (require, exports, module) {


    const AppInit                 = require("utils/AppInit"),
        EventDispatcher         = require("utils/EventDispatcher"),
        KeyBindingManager = require("command/KeyBindingManager"),
        Resizer                 = require("utils/Resizer"),
        PluginPanelView         = require("view/PluginPanelView"),
        PanelView               = require("view/PanelView"),
        EditorManager           = require("editor/EditorManager"),
        KeyEvent                = require("utils/KeyEvent");

    //constants
    const EVENT_WORKSPACE_UPDATE_LAYOUT  = "workspaceUpdateLayout",
        EVENT_WORKSPACE_PANEL_SHOWN    = PanelView.EVENT_PANEL_SHOWN,
        EVENT_WORKSPACE_PANEL_HIDDEN   = PanelView.EVENT_PANEL_HIDDEN,
        MAIN_TOOLBAR_WIDTH = 30;

    /**
     * The ".content" vertical stack (editor + all header/footer panels)
     * @type {jQueryObject}
     */
    var $windowContent;

    /**
     * The "#editor-holder": has only one visible child, the current CodeMirror instance (or the no-editor placeholder)
     * @type {jQueryObject}
     */
    var $editorHolder;


    /**
     * The "#main-toolbay": to the right side holding plugin panels and icons
     * @type {jQueryObject}
     */
    var $mainToolbar;

    /**
     * The "#main-plugin-panel": The plugin panel main container
     * @type {jQueryObject}
     */
    let $mainPluginPanel;

    /**
     * The "#plugin-icons-bar": holding all the plugin icons
     * @type {jQueryObject}
     */
    let $pluginIconsBar;

    /**
     * A map from panel ID's to all reated panels
     */
    var panelIDMap = {};

    /**
     * Have we already started listening for the end of the ongoing window resize?
     * @type {boolean}
     */
    var windowResizing = false;

    let lastHiddenBottomPanelStack = [],
        lastShownBottomPanelStack = [];


    /**
     * Calculates the available height for the full-size Editor (or the no-editor placeholder),
     * accounting for the current size of all visible panels, toolbar, & status bar.
     * @return {number}
     */
    function calcAvailableHeight() {
        var availableHt = $windowContent.height();

        $editorHolder.siblings().each(function (i, elem) {
            var $elem = $(elem);
            if ($elem.css("display") !== "none" && $elem.css("position") !== "absolute") {
                availableHt -= $elem.outerHeight();
            }
        });

        // Clip value to 0 (it could be negative if a panel wants more space than we have)
        return Math.max(availableHt, 0);
    }

    /** Updates panel resize limits to disallow making panels big enough to shrink editor area below 0 */
    function updateResizeLimits() {
        var editorAreaHeight = $editorHolder.height();

        $editorHolder.siblings().each(function (i, elem) {
            var $elem = $(elem);
            if ($elem.css("display") === "none") {
                $elem.data("maxsize", editorAreaHeight);
            } else {
                $elem.data("maxsize", editorAreaHeight + $elem.outerHeight());
            }
        });

        $mainToolbar.data("maxsize", window.innerWidth*.75);
    }


    /**
     * Calculates a new size for editor-holder and resizes it accordingly, then and dispatches the "workspaceUpdateLayout"
     * event. (The editors within are resized by EditorManager, in response to that event).
     *
     * @param {boolean=} refreshHint  true to force a complete refresh
     */
    function triggerUpdateLayout(refreshHint) {
        // Find how much space is left for the editor
        let editorAreaHeight = calcAvailableHeight();

        $editorHolder.height(editorAreaHeight);  // affects size of "not-editor" placeholder as well

        let pluginPanelWidth = $mainToolbar.width() - $pluginIconsBar.width();
        $mainPluginPanel.width(pluginPanelWidth);

        // Resize editor to fill the space
        exports.trigger(EVENT_WORKSPACE_UPDATE_LAYOUT, editorAreaHeight, refreshHint);
    }


    /** Trigger editor area resize whenever the window is resized */
    function handleWindowResize() {
        // These are not initialized in Jasmine Spec Runner window until a test
        // is run that creates a mock document.
        if (!$windowContent || !$editorHolder) {
            return;
        }

        // FIXME (issue #4564) Workaround https://github.com/codemirror/CodeMirror/issues/1787
        triggerUpdateLayout();

        if (!windowResizing) {
            windowResizing = true;

            // We don't need any fancy debouncing here - we just need to react before the user can start
            // resizing any panels at the new window size. So just listen for first mousemove once the
            // window resize releases mouse capture.
            $(window.document).one("mousemove", function () {
                windowResizing = false;
                updateResizeLimits();
            });
        }
    }

    /** Trigger editor area resize whenever the given panel is shown/hidden/resized
     *  @param {!jQueryObject} $panel the jquery object in which to attach event handlers
     */
    function listenToResize($panel) {
        // Update editor height when shown/hidden, & continuously as panel is resized
        $panel.on("panelCollapsed panelExpanded panelResizeUpdate", function () {
            triggerUpdateLayout();
        });
        // Update max size of sibling panels when shown/hidden, & at *end* of resize gesture
        $panel.on("panelCollapsed panelExpanded panelResizeEnd", function () {
            updateResizeLimits();
        });
    }


    /**
     * Creates a new resizable panel beneath the editor area and above the status bar footer. Panel is initially invisible.
     * The panel's size & visibility are automatically saved & restored as a view-state preference.
     *
     * @param {!string} id  Unique id for this panel. Use package-style naming, e.g. "myextension.feature.panelname"
     * @param {!jQueryObject} $panel  DOM content to use as the panel. Need not be in the document yet. Must have an id
     *      attribute, for use as a preferences key.
     * @param {number=} minSize  Minimum height of panel in px.
     * @return {!Panel}
     */
    function createBottomPanel(id, $panel, minSize) {
        $panel.insertBefore("#status-bar");
        $panel.hide();
        updateResizeLimits();  // initialize panel's max size

        let bottomPanel = new PanelView.Panel($panel, id);
        panelIDMap[id] = bottomPanel;

        Resizer.makeResizable($panel[0], Resizer.DIRECTION_VERTICAL, Resizer.POSITION_TOP, minSize,
            false, undefined, true);
        listenToResize($panel);

        return bottomPanel;
    }

    /**
     * Creates a new resizable plugin panel associated with the given toolbar icon. Panel is initially invisible.
     * The panel's size & visibility are automatically saved & restored. Only one panel can be associated with a
     * toolbar icon.
     *
     * @param {!string} id  Unique id for this panel. Use package-style naming, e.g. "myextension.panelname". will
     *      overwrite an existing panel id if present.
     * @param {!jQueryObject} $panel  DOM content to use as the panel. Need not be in the document yet. Must have an id
     *      attribute, for use as a preferences key.
     * @param {number=} minSize  Minimum height of panel in px.
     * @param {!jQueryObject} $toolbarIcon An icon that should be present in main-toolbar to associate this panel to.
     *      The panel will be shown only if the icon is visible on the toolbar and the user clicks on the icon.
     * @param {?number=} initialSize  Optional Initial size of panel in px. If not given, panel will use minsize
     *      or current size.
     * @return {!Panel}
     */
    function createPluginPanel(id, $panel, minSize, $toolbarIcon, initialSize) {
        if(!$toolbarIcon){
            throw new Error("invalid $toolbarIcon provided to create createPluginPanel");
        }

        $mainPluginPanel[0].appendChild($panel[0]);

        let pluginPanel = new PluginPanelView.Panel($panel, id, $toolbarIcon, minSize, initialSize);
        panelIDMap[id] = pluginPanel;
        pluginPanel.hide();

        return pluginPanel;
    }

    /**
     * Returns an array of all panel ID's
     * @returns {Array} List of ID's of all bottom panels
     */
    function getAllPanelIDs() {
        var property, panelIDs = [];
        for (property in panelIDMap) {
            if (panelIDMap.hasOwnProperty(property)) {
                panelIDs.push(property);
            }
        }
        return panelIDs;
    }

    /**
     * Gets the Panel interface for the given ID. Can return undefined if no panel with the ID is found.
     * @param   {string} panelID
     * @returns {Object} Panel object for the ID or undefined
     */
    function getPanelForID(panelID) {
        return panelIDMap[panelID];
    }

    /**
     * Called when an external widget has appeared and needs some of the space occupied
     *  by the mainview manager
     * @param {boolean} refreshHint true to refresh the editor, false if not
     */
    function recomputeLayout(refreshHint) {
        triggerUpdateLayout(refreshHint);
        updateResizeLimits();
    }


    /* Attach to key parts of the overall UI, once created */
    AppInit.htmlReady(function () {
        $windowContent = $(".content");
        $editorHolder = $("#editor-holder");
        $mainToolbar = $("#main-toolbar");
        $mainPluginPanel = $("#main-plugin-panel");
        $pluginIconsBar = $("#plugin-icons-bar");

        // Sidebar is a special case: it isn't a Panel, and is not created dynamically. Need to explicitly
        // listen for resize here.
        listenToResize($("#sidebar"));
        listenToResize($("#main-toolbar"));
    });

    /* Unit test only: allow passing in mock DOM notes, e.g. for use with SpecRunnerUtils.createMockEditor() */
    function _setMockDOM($mockWindowContent, $mockEditorHolder, $mockMainToolbar, $mockMainPluginPanel, $mockPluginIconsBar) {
        $windowContent = $mockWindowContent;
        $editorHolder = $mockEditorHolder;
        $mainToolbar = $mockMainToolbar;
        $mainPluginPanel = $mockMainPluginPanel;
        $pluginIconsBar = $mockPluginIconsBar;
    }

    /* Add this as a capture handler so we're guaranteed to run it before the editor does its own
     * refresh on resize.
     */
    window.addEventListener("resize", handleWindowResize, true);


    EventDispatcher.makeEventDispatcher(exports);

    PanelView.on(PanelView.EVENT_PANEL_SHOWN, (event, panelID)=>{
        lastHiddenBottomPanelStack = lastHiddenBottomPanelStack.filter(item => item !== panelID);
        lastShownBottomPanelStack = lastShownBottomPanelStack.filter(item => item !== panelID);
        lastShownBottomPanelStack.push(panelID);
        exports.trigger(EVENT_WORKSPACE_PANEL_SHOWN, panelID);
    });
    PanelView.on(PanelView.EVENT_PANEL_HIDDEN, (event, panelID)=>{
        lastHiddenBottomPanelStack = lastHiddenBottomPanelStack.filter(item => item !== panelID);
        lastHiddenBottomPanelStack.push(panelID);
        lastShownBottomPanelStack = lastShownBottomPanelStack.filter(item => item !== panelID);
        exports.trigger(EVENT_WORKSPACE_PANEL_HIDDEN, panelID);
    });

    let currentlyShownPanel = null,
        panelShowInProgress = false,
        initialSizeSetOnce = {};

    function _getInitialSize(panel) {
        let setOnce = initialSizeSetOnce[panel.panelID];
        if(setOnce){
            return undefined; // we haev lalready set the initial size once, let resizer figure out size to apply now.
        }
        initialSizeSetOnce[panel.panelID] = true;
        return panel.initialSize;
    }

    function _showPluginSidePanel(panelID) {
        let panelBeingShown = getPanelForID(panelID);
        Resizer.makeResizable($mainToolbar, Resizer.DIRECTION_HORIZONTAL, Resizer.POSITION_LEFT,
            panelBeingShown.minWidth, false, undefined, true,
            undefined, $windowContent, undefined, _getInitialSize(panelBeingShown));
        Resizer.show($mainToolbar[0]);
        recomputeLayout(true);
    }

    function _hidePluginSidePanel() {
        $mainToolbar.css('width', MAIN_TOOLBAR_WIDTH);
        $windowContent.css('right', MAIN_TOOLBAR_WIDTH);
        Resizer.removeSizable($mainToolbar[0]);
        recomputeLayout(true);
    }

    PluginPanelView.on(PluginPanelView.EVENT_PANEL_SHOWN, (event, panelID)=>{
        panelShowInProgress = true;
        _showPluginSidePanel(panelID);
        if(currentlyShownPanel){
            currentlyShownPanel.hide();
        }
        currentlyShownPanel = getPanelForID(panelID);
        exports.trigger(EVENT_WORKSPACE_PANEL_SHOWN, panelID);
        panelShowInProgress = false;
    });

    PluginPanelView.on(PluginPanelView.EVENT_PANEL_HIDDEN, (event, panelID)=>{
        if(!panelShowInProgress){
            _hidePluginSidePanel();
            currentlyShownPanel = null;
        }
        exports.trigger(EVENT_WORKSPACE_PANEL_HIDDEN, panelID);
    });

    function isPanelVisible(panelID) {
        let panel = getPanelForID(panelID);
        if(panel && panel.isVisible()){
            return true;
        }
        return false;
    }

    // Escape key and toggle panel special handling
    let _escapeKeyConsumers = {};

    /**
     * If any widgets related to the editor needs to handle the escape key event, add it here. returning true from the
     * registered handler will prevent primary escape key toggle panel behavior of phoenix. Note that returning true
     * will no stop the event bubbling, that has to be controlled with the event parameter forwarded to the handler.
     * @param {string} consumerName a unique name for your consumer
     * @param {function(event)} eventHandler If the eventHandler returns true for this callback, the escape key event
     *        will not lead to panel toggle default behavior.
     * @return {boolean} true if added
     */
    function addEscapeKeyEventHandler(consumerName, eventHandler) {
        if(_escapeKeyConsumers[consumerName]){
            console.error("EscapeKeyEvent consumer of same name already registered: ", consumerName);
            return false;
        }
        if(typeof eventHandler !== 'function'){
            console.error(`EscapeKeyEvent invalid eventHandler: ${consumerName}, ${eventHandler}`);
            return false;
        }
        _escapeKeyConsumers[consumerName] = eventHandler;
        return true;
    }

    /**
     * Removing the escape key event consumer.
     * @param {string} consumerName used to register the consumer.
     * @return {boolean} true if removed
     */
    function removeEscapeKeyEventHandler(consumerName) {
        if(_escapeKeyConsumers[consumerName]){
            delete _escapeKeyConsumers[consumerName];
            return true;
        } else {
            console.error("EscapeKeyEvent no such consumer to remove: ", consumerName);
        }
        return false;
    }

    function _showLastHiddenPanelIfPossible() {
        while(lastHiddenBottomPanelStack.length > 0){
            let panelToShow = getPanelForID(lastHiddenBottomPanelStack.pop());
            if(panelToShow.canBeShown()){
                panelToShow.show();
                return true;
            }
        }
        return false;
    }

    function _handleEscapeKey() {
        let allPanelsIDs = getAllPanelIDs();
        // first we see if there is any least recently shown panel
        if(lastShownBottomPanelStack.length > 0){
            let panelToHide = getPanelForID(lastShownBottomPanelStack.pop());
            panelToHide.hide();
            return true;
        }
        // if not, see if there is any open panels that are not yet tracked in the least recently used stacks.
        for(let panelID of allPanelsIDs){
            let panel = getPanelForID(panelID);
            if(panel.getPanelType() === PanelView.PANEL_TYPE_BOTTOM_PANEL && panel.isVisible()){
                panel.hide();
                lastHiddenBottomPanelStack.push(panelID);
                return true;
            }
        }
        // no panels hidden, we will toggle the last hidden panel with succeeding escape key presses
        return _showLastHiddenPanelIfPossible();
    }

    function _handleShiftEscapeKey() {
        // show hidden panels one by one
        return _showLastHiddenPanelIfPossible();
    }

    // pressing escape when focused on editor will toggle the last opened bottom panel
    function _handleKeydown(event) {
        if(event.keyCode !== KeyEvent.DOM_VK_ESCAPE || KeyBindingManager.isInOverlayMode()){
            return;
        }

        for(let consumerName of Object.keys(_escapeKeyConsumers)){
            if(_escapeKeyConsumers[consumerName](event)){
                return;
            }
        }

        let focussedEditor = EditorManager.getFocusedEditor();
        if(!focussedEditor || EditorManager.getFocusedInlineEditor()){
            // if there is no editor in focus, we do no panel toggling
            // if there is an editor with an inline widget in focus, the escape key will be
            // handled by the inline widget itself first.
            return;
        }
        if(focussedEditor.canConsumeEscapeKeyEvent()){
            return;
        }

        if (event.keyCode === KeyEvent.DOM_VK_ESCAPE  && event.shiftKey) {
            _handleShiftEscapeKey();
        } else if (event.keyCode === KeyEvent.DOM_VK_ESCAPE) {
            _handleEscapeKey();
        }

        event.stopPropagation();
        event.preventDefault();
    }
    window.document.body.addEventListener("keydown", _handleKeydown, true);

    // Define public API
    exports.createBottomPanel               = createBottomPanel;
    exports.createPluginPanel               = createPluginPanel;
    exports.isPanelVisible                  = isPanelVisible;
    exports.recomputeLayout                 = recomputeLayout;
    exports.getAllPanelIDs                  = getAllPanelIDs;
    exports.getPanelForID                   = getPanelForID;
    exports.addEscapeKeyEventHandler        = addEscapeKeyEventHandler;
    exports.removeEscapeKeyEventHandler     = removeEscapeKeyEventHandler;
    exports._setMockDOM                     = _setMockDOM;
    exports.EVENT_WORKSPACE_UPDATE_LAYOUT   = EVENT_WORKSPACE_UPDATE_LAYOUT;
    exports.EVENT_WORKSPACE_PANEL_SHOWN     = EVENT_WORKSPACE_PANEL_SHOWN;
    exports.EVENT_WORKSPACE_PANEL_HIDDEN    = EVENT_WORKSPACE_PANEL_HIDDEN;
    exports.PANEL_TYPE_BOTTOM_PANEL         = PanelView.PANEL_TYPE_BOTTOM_PANEL;
    exports.PANEL_TYPE_PLUGIN_PANEL         = PluginPanelView.PANEL_TYPE_PLUGIN_PANEL;
});
