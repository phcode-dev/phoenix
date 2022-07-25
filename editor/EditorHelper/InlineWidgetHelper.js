/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
 *
 * self program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * self program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with self program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

/**
 * Editor instance helpers for showing error popups. Only to be used from Editor.js.
 */

define(function (require, exports, module) {

    const AnimationUtils = require("utils/AnimationUtils"),
        Async = require("utils/Async"),
        CodeMirror = require("thirdparty/CodeMirror/lib/codemirror");

    /**
     * ****** Update actual public API doc in Editor.js *****
     *
     * Adds an inline widget below the given line. If any inline widget was already open for that
     * line, it is closed without warning.
     * @param {!{line:number, ch:number}} pos  Position in text to anchor the inline.
     * @param {!InlineWidget} inlineWidget The widget to add.
     * @param {boolean=} scrollLineIntoView Scrolls the associated line into view. Default true.
     * @return {$.Promise} A promise object that is resolved when the widget has been added (but might
     *     still be animating open). Never rejected.
     */
    function addInlineWidget(pos, inlineWidget, scrollLineIntoView) {
        // eslint-disable-next-line no-invalid-this
        let self = this;
        let queue = self._inlineWidgetQueues[pos.line],
            deferred = new $.Deferred();
        if (!queue) {
            queue = new Async.PromiseQueue();
            self._inlineWidgetQueues[pos.line] = queue;
        }
        queue.add(function () {
            self._addInlineWidgetInternal(pos, inlineWidget, scrollLineIntoView, deferred);
            return deferred.promise();
        });
        return deferred.promise();
    }

    /**
     * @private
     * Does the actual work of addInlineWidget().
     */
    function _addInlineWidgetInternal(pos, inlineWidget, scrollLineIntoView, deferred) {
        // eslint-disable-next-line no-invalid-this
        let self = this;

        self.removeAllInlineWidgetsForLine(pos.line).done(function () {
            if (scrollLineIntoView === undefined) {
                scrollLineIntoView = true;
            }

            if (scrollLineIntoView) {
                self._codeMirror.scrollIntoView(pos);
            }

            inlineWidget.info = self._codeMirror.addLineWidget(pos.line, inlineWidget.htmlContent,
                { coverGutter: true, noHScroll: true });
            CodeMirror.on(inlineWidget.info.line, "delete", function () {
                self._removeInlineWidgetInternal(inlineWidget);
            });
            self._inlineWidgets.push(inlineWidget);

            // Set up the widget to start closed, then animate open when its initial height is set.
            inlineWidget.$htmlContent.height(0);
            AnimationUtils.animateUsingClass(inlineWidget.htmlContent, "animating")
                .done(function () {
                    deferred.resolve();
                });

            // Callback to widget once parented to the editor. The widget should call back to
            // setInlineWidgetHeight() in order to set its initial height and animate open.
            inlineWidget.onAdded();
        });
    }

    /**
     * ****** Update actual public API doc in Editor.js *****
     *
     * Removes all inline widgets
     */
    function removeAllInlineWidgets() {
        // eslint-disable-next-line no-invalid-this
        let self = this;
        // copy the array because _removeInlineWidgetInternal will modify the original
        let widgets = [].concat(self.getInlineWidgets());

        return Async.doInParallel(
            widgets,
            self.removeInlineWidget.bind(self)
        );
    }

    /**
     * ****** Update actual public API doc in Editor.js *****
     * Removes the given inline widget.
     * @param {number} inlineWidget The widget to remove.
     * @return {$.Promise} A promise that is resolved when the inline widget is fully closed and removed from the DOM.
     */
    function removeInlineWidget(inlineWidget) {
        // eslint-disable-next-line no-invalid-this
        let self = this;
        let deferred = new $.Deferred();

        function finishRemoving() {
            self._codeMirror.removeLineWidget(inlineWidget.info);
            self._removeInlineWidgetInternal(inlineWidget);
            deferred.resolve();
        }

        if (!inlineWidget.closePromise) {
            // Remove the inline widget from our internal list immediately, so
            // everyone external to us knows it's essentially already gone. We
            // don't want to wait until it's done animating closed (but we do want
            // the other stuff in _removeInlineWidgetInternal to wait until then).
            self._removeInlineWidgetFromList(inlineWidget);

            // If we're not visible (in which case the widget will have 0 client height),
            // don't try to do the animation, because nothing will happen and we won't get
            // called back right away. (The animation would happen later when we switch
            // back to the editor.)
            if (self.isFullyVisible()) {
                AnimationUtils.animateUsingClass(inlineWidget.htmlContent, "animating")
                    .done(finishRemoving);
                inlineWidget.$htmlContent.height(0);
            } else {
                finishRemoving();
            }
            inlineWidget.closePromise = deferred.promise();
        }
        return inlineWidget.closePromise;
    }

    /**
     * ****** Update actual public API doc in Editor.js *****
     * Removes all inline widgets for a given line
     * @param {number} lineNum The line number to modify
     */
    function removeAllInlineWidgetsForLine(lineNum) {
        // eslint-disable-next-line no-invalid-this
        let self = this;
        let lineInfo = self._codeMirror.lineInfo(lineNum),
            widgetInfos = (lineInfo && lineInfo.widgets) ? [].concat(lineInfo.widgets) : null;

        if (widgetInfos && widgetInfos.length) {
            // Map from CodeMirror LineWidget to Brackets InlineWidget
            let inlineWidget,
                allWidgetInfos = self._inlineWidgets.map(function (w) {
                    return w.info;
                });

            return Async.doInParallel(
                widgetInfos,
                function (info) {
                    // Lookup the InlineWidget object using the same index
                    inlineWidget = self._inlineWidgets[allWidgetInfos.indexOf(info)];
                    if (inlineWidget) {
                        return self.removeInlineWidget(inlineWidget);
                    }
                    return new $.Deferred().resolve().promise();

                }
            );
        }
        return new $.Deferred().resolve().promise();

    }

    /**
     * Cleans up the given inline widget from our internal list of widgets. It's okay
     * to call self multiple times for the same widget--it will just do nothing if
     * the widget has already been removed.
     * @param {InlineWidget} inlineWidget  an inline widget.
     */
    function _removeInlineWidgetFromList(inlineWidget) {
        // eslint-disable-next-line no-invalid-this
        let self = this;
        let l = self._inlineWidgets.length,
            i;
        for (i = 0; i < l; i++) {
            if (self._inlineWidgets[i] === inlineWidget) {
                self._inlineWidgets.splice(i, 1);
                break;
            }
        }
    }

    /**
     * Removes the inline widget from the editor and notifies it to clean itself up.
     * @param {InlineWidget} inlineWidget  an inline widget.
     */
    function _removeInlineWidgetInternal(inlineWidget) {
        // eslint-disable-next-line no-invalid-this
        let self = this;
        if (!inlineWidget.isClosed) {
            self._removeInlineWidgetFromList(inlineWidget);
            inlineWidget.onClosed();
            inlineWidget.isClosed = true;
        }
    }

    /**
     * ****** Update actual public API doc in Editor.js *****
     * Returns a list of all inline widgets currently open in self editor. Each entry contains the
     * inline's id, and the data parameter that was passed to addInlineWidget().
     * @return {!Array.<{id:number, data:Object}>}
     */
    function getInlineWidgets() {
        // eslint-disable-next-line no-invalid-this
        let self = this;
        return self._inlineWidgets;
    }

    /**
     * ****** Update actual public API doc in Editor.js *****
     * Returns the currently focused inline widget, if any.
     * @return {?InlineWidget}
     */
    function getFocusedInlineWidget() {
        // eslint-disable-next-line no-invalid-this
        let self = this;
        let result = null;

        self.getInlineWidgets().forEach(function (widget) {
            if (widget.hasFocus()) {
                result = widget;
            }
        });

        return result;
    }

    /**
     * ****** Update actual public API doc in Editor.js *****
     * Sets the height of an inline widget in self editor.
     * @param {!InlineWidget} inlineWidget The widget whose height should be set.
     * @param {!number} height The height of the widget.
     * @param {boolean=} ensureVisible Whether to scroll the entire widget into view. Default false.
     */
    function setInlineWidgetHeight(inlineWidget, height, ensureVisible) {
        // eslint-disable-next-line no-invalid-this
        let self = this;
        let node = inlineWidget.htmlContent,
            oldHeight = (node && $(node).height()) || 0,
            changed = (oldHeight !== height),
            isAttached = inlineWidget.info !== undefined;

        function updateHeight() {
            // Notify CodeMirror for the height change.
            if (isAttached) {
                inlineWidget.info.changed();
            }
        }

        function setOuterHeight() {
            function finishAnimating(e) {
                if (e.target === node) {
                    updateHeight();
                    $(node).off("webkitTransitionEnd", finishAnimating);
                }
            }
            $(node).height(height);
            if ($(node).hasClass("animating")) {
                $(node).on("webkitTransitionEnd", finishAnimating);
            } else {
                updateHeight();
            }
        }

        // Make sure we set an explicit height on the widget, so children can use things like
        // min-height if they want.
        if (changed || !node.style.height) {
            // If we're animating, set the wrapper's height on a timeout so the layout is finished before we animate.
            if ($(node).hasClass("animating")) {
                window.setTimeout(setOuterHeight, 0);
            } else {
                setOuterHeight();
            }
        }

        if (ensureVisible && isAttached) {
            let offset = $(node).offset(), // offset relative to document
                position = $(node).position(), // position within parent linespace
                scrollerTop = self.getVirtualScrollAreaTop();

            self._codeMirror.scrollIntoView({
                left: position.left,
                top: offset.top - scrollerTop,
                right: position.left, // don't try to make the right edge visible
                bottom: offset.top + height - scrollerTop
            });
        }
    }

    /**
     * @private
     * Get the starting line number for an inline widget.
     * @param {!InlineWidget} inlineWidget
     * @return {number} The line number of the widget or -1 if not found.
     */
    function _getInlineWidgetLineNumber(inlineWidget) {
        // eslint-disable-next-line no-invalid-this
        let self = this;
        return self._codeMirror.getLineNumber(inlineWidget.info.line);
    }

    /**
     * add required helpers to editor
     * @param Editor
     */
    function addHelpers(Editor) {
        // only private Editor APIs should be assigned below. Public APIs should be updated in Editor.js only.
        Editor.prototype._addInlineWidgetInternal = _addInlineWidgetInternal;
        Editor.prototype._removeInlineWidgetFromList = _removeInlineWidgetFromList;
        Editor.prototype._removeInlineWidgetInternal = _removeInlineWidgetInternal;
        Editor.prototype._getInlineWidgetLineNumber = _getInlineWidgetLineNumber;
    }

    exports.addHelpers = addHelpers;
    exports.addInlineWidget = addInlineWidget;
    exports.removeAllInlineWidgets = removeAllInlineWidgets;
    exports.removeInlineWidget = removeInlineWidget;
    exports.removeAllInlineWidgetsForLine = removeAllInlineWidgetsForLine;
    exports.getInlineWidgets = getInlineWidgets;
    exports.getFocusedInlineWidget = getFocusedInlineWidget;
    exports.setInlineWidgetHeight = setInlineWidgetHeight;
});
