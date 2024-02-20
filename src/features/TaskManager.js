/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

// @INCLUDE_IN_API_DOCS
/**
 * TaskManager module deals with managing long running tasks in phcode. It handles the `Tasks` dropdown in the status
 * bar where the user can see all running tasks, monitor its progress and close/pause the execution of the task if
 * supported by the task.
 * @module features/TaskManager
 */
define(function (require, exports, module) {
    const Strings = require("strings"),
        EventDispatcher = require("utils/EventDispatcher"),
        StringUtils = require("utils/StringUtils");
    const taskList = {};
    const STATUS_SUCCESS = "success",
        STATUS_FAIL ="fail",
        STATUS_INCOMPLETE = "incomplete";
    const SPINNER_FAIL = "spinner-failure",
        SPINNER_SUCCESS = "spinner-success",
        SPINNER_NORMAL = "spinner-normal";
    const SPINNER_HIDE_TIME = Phoenix.isTestWindow? 5 : 3000; // for tests , we wait only 1 ms
    let currentSpinnerType = null, spinnerHideTimer;
    let $spinner;

    /**
     * This is used by legacy extensions that used StatusBar.showBusyIndicator and hide apis that are deprecated.
     * here for legacy support.
     * @private
     * @type {boolean}
     */
    let legacyExtensionBusy = false;

    let taskSelect;

    function _showSpinnerIcon(spinnerType) {
        // we only show the icon for a few seconds to be less distracting except if the persist option is specified
        // the persist option is now used only for errors and success tasks that has not been removed from the task
        // manager list(which usually happens if there is some user action needed). Even then on click the spinner will
        // be hidden again.
        if(spinnerType === SPINNER_FAIL) {
            clearTimeout(spinnerHideTimer);
            $spinner.removeClass("forced-hidden");
            $spinner.removeClass(SPINNER_SUCCESS);
            $spinner.addClass(SPINNER_FAIL);
            currentSpinnerType = SPINNER_FAIL;
            return;
        }
        if(spinnerType === SPINNER_SUCCESS) {
            clearTimeout(spinnerHideTimer);
            $spinner.removeClass("forced-hidden");
            $spinner.removeClass(SPINNER_FAIL);
            $spinner.addClass(SPINNER_SUCCESS);
            currentSpinnerType = SPINNER_SUCCESS;
            return;
        }
        if(spinnerType === SPINNER_NORMAL) {
            clearTimeout(spinnerHideTimer);
            $spinner.removeClass("forced-hidden");
            $spinner.removeClass(SPINNER_FAIL);
            $spinner.removeClass(SPINNER_SUCCESS);
            spinnerHideTimer = setTimeout(hideSpinnerIcon, SPINNER_HIDE_TIME);
            currentSpinnerType = SPINNER_NORMAL;
        }
    }

    function hideSpinnerIcon() {
        clearTimeout(spinnerHideTimer);
        currentSpinnerType = null;
        $spinner.addClass("forced-hidden");
        $spinner.removeClass(SPINNER_FAIL);
        $spinner.removeClass(SPINNER_SUCCESS);
    }

    /**
     * determines what the spinner icon to show(green-for success), red-fail, blue normal based on the active
     * tasks in list and renders. IF the active tasks has already  been notified, it wont notify again.
     */
    function renderSpinnerIcon(newTaskAdded) {
        let unackSuccessTaskFound = false;
        if(currentSpinnerType && currentSpinnerType !== SPINNER_NORMAL) {
            // there is a success/fail spinner visible, clean it. For the normal spinner, it will be
            // auto-cleaned by timer.
            hideSpinnerIcon();
        }
        for(let task of Object.values(taskList)){
            if(!task._spinnerIconAck && task.isFailed()){
                _showSpinnerIcon(SPINNER_FAIL);
                return;
            }
            if(!task._spinnerIconAck && task.isSucceeded()){
                unackSuccessTaskFound = true;
            }
        }
        if(unackSuccessTaskFound) {
            _showSpinnerIcon(SPINNER_SUCCESS);
            return;
        }

        // for normal spinner, we dont show anything as its only shown briefly till SPINNER_HIDE_TIME
        // which was already handled, except when newTaskAdded
        if(newTaskAdded) {
            _showSpinnerIcon(SPINNER_NORMAL);
        }
    }

    function _onDropdownShown() {
        // the animating icon is a call to action that stops showing after a few seconds normally. On clicking the
        // task dropdown, the user has checked the notifications and we can hide the distracting spinner.
        for(let task of Object.values(taskList)){
            task._spinnerIconAck = true;
        }
        hideSpinnerIcon();
    }

    function _setTaskSelect(select) {
        taskSelect = select;
        $spinner = $("#status-tasks .spinner");
        if(Phoenix.isTestWindow) {
            exports.taskSelect = taskSelect;
            exports.SPINNER_HIDE_TIME = SPINNER_HIDE_TIME;
        }
    }
    function _renderItem(item, index) {
        if(item === Strings.STATUSBAR_TASKS_UNKNOWN_EXTENSION_TASK){
            return Strings.STATUSBAR_TASKS_UNKNOWN_EXTENSION_TASK;
        }
        if(!taskList[item]){
            // This should never happen
            console.error("Cannot render task item", item);
            return "unknown";
        }
        const task = taskList[item];
        task._$html = $(`<div class="task-status-popup-item">
            <div class="task-icon">
                <i class="fa-solid fa-download"></i>
            </div>
            <div class="status-container">
                <div class="task-heading">
                    <span class="task-title">${task._title||task._id}</span>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar-background">
                        <div
                            class="progress progress-bar-foreground-pulse"
                            style="width: 100%"></div>
                    </div>
                    <div class="pause-icon forced-hidden" >
                        <i class="fa-solid fa-circle-pause"></i>
                    </div>
                    <div class="play-icon forced-hidden" >
                        <i class="fa-solid fa-circle-play"></i>
                    </div>
                    <div class="retry-icon forced-hidden">
                        <i class="fa-solid fa-rotate"></i>
                    </div>
                    <div class="close-icon forced-hidden">
                        <i class="fa-solid fa-circle-xmark"></i>
                    </div>
                </div>
                <div class="task-message">${task._message||""}</div>
            </div>
        </div>`);
        const eventListeners= {
            ".pause-icon": "onPauseClick",
            ".play-icon": "onPlayClick",
            ".retry-icon": "onRetryClick",
            ".close-icon": "onStopClick"
        };
        for(let iconClass of Object.keys(eventListeners)){
            task._$html.find(iconClass).click((evt)=>{
                console.log(iconClass);
                const cbFn = eventListeners[iconClass];
                return task[cbFn] && task[cbFn](evt);
            });
        }
        _reRenderComponents(task);
        return {$html: task._$html};
    }

    function _onSelect(el, selection) {
        if(selection===Strings.STATUSBAR_TASKS_UNKNOWN_EXTENSION_TASK){
            return;
        }
        if(!taskList[selection]){
            // This should never happen
            console.error("Cannot select task item", selection);
            return;
        }
        const task = taskList[selection];
        return task.onSelect && task.onSelect(el);
    }

    function _getDefaultTaskIDs() {
        if(legacyExtensionBusy){
            return [Strings.STATUSBAR_TASKS_UNKNOWN_EXTENSION_TASK, Strings.STATUSBAR_TASKS_HIDE_SPINNER];
        }
        return [Strings.STATUSBAR_TASKS_HIDE_SPINNER];
    }

    function _showOrHideStatusBarIfNeeded() {
        const taskArray = Object.keys(taskList);
        if(taskArray.length) {
            taskArray.push("---");
        }
        taskSelect.items = [...taskArray, ..._getDefaultTaskIDs()];
        taskSelect.refresh();
        if(Object.keys(taskList).length || legacyExtensionBusy){
            $("#status-tasks").removeClass('forced-hidden');
        } else {
            $("#status-tasks").addClass('forced-hidden');
            taskSelect.closeDropdown();
        }
    }

    function _renderProgressbar(task) {
        const $html = task._$html;
        if(!task._$html){
            return;
        }
        $html.find(".progress")
            .removeClass("progress-bar-foreground")
            .removeClass("progress-bar-foreground-pulse")
            .removeClass("progress-bar-foreground-failure")
            .removeClass("progress-bar-foreground-success");

        if(task._completedStatus === STATUS_SUCCESS){
            $html.find(".progress")
                .addClass("progress-bar-foreground-success")
                .css('width', `100%`);
            return;
        }
        if(task._completedStatus === STATUS_FAIL){
            $html.find(".progress")
                .addClass("progress-bar-foreground-failure")
                .css('width', `100%`);
            return;
        }
        if(task._percent){
            $html.find(".progress")
                .addClass("progress-bar-foreground")
                .css('width', `${task._percent}%`);
        } else {
            $html.find(".progress")
                .addClass("progress-bar-foreground-pulse")
                .css('width', `100%`);
        }
    }

    function _renderPlayIcons(task) {
        const $html = task._$html;
        if(!task._$html){
            return;
        }
        const iconMap = {
            ".close-icon": "_showStopIcon",
            ".pause-icon": "_showPauseIcon",
            ".play-icon": "_showPlayIcon",
            ".retry-icon": "_showRestartIcon"
        };
        for(let iconClass of Object.keys(iconMap)){
            const showIconMessage = iconMap[iconClass];
            if(task[showIconMessage]){
                $html.find(iconClass)
                    .removeClass('forced-hidden')
                    .attr("title", task[showIconMessage]);
            } else {
                $html.find(iconClass)
                    .addClass('forced-hidden');
            }
        }
    }

    function _reRenderComponents(task) {
        const $html = task._$html;
        if(!task._$html){
            return;
        }
        $html.find(".task-title").text(task._title||task._id);
        $html.find(".task-message").text(task._message||"");
        if(task._iconHTML) {
            $html.find(".task-icon").html(task._iconHTML);
        }
        _renderProgressbar(task);
        _renderPlayIcons(task);
    }

    /**
     * @typedef {Object} TaskObject
     * Methods for managing the task's state and UI representation in the TaskManager.
     *
     * @property {function(): void} close - Closes the task and removes it from the UI.
     * @property {function(string): void} setTitle - Sets the task's title.
     * @property {function(): string} getTitle - Returns the task's title.
     * @property {function(string): void} setMessage - Sets the task's message.
     * @property {function(): string} getMessage - Returns the task's message.
     * @property {function(number): void} setProgressPercent - Sets the task's progress percentage.
     * @property {function(): number} getProgressPercent - Returns the task's current progress percentage.
     * @property {function(): void} setFailed - Marks the task as failed.
     * @property {function(): boolean} isFailed - Returns true if the task is marked as failed.
     * @property {function(): void} setSucceded - Marks the task as succeeded.
     * @property {function(): boolean} isSucceded - Returns true if the task is marked as succeeded.
     * @property {function(string): void} showStopIcon - Shows the stop icon with an optional tooltip message.
     * @property {function(): void} hideStopIcon - Hides the stop icon.
     * @property {function(string): void} showPlayIcon - Shows the play icon with an optional tooltip message.
     * @property {function(): void} hidePlayIcon - Hides the play icon.
     * @property {function(string): void} showPauseIcon - Shows the pause icon with an optional tooltip message.
     * @property {function(): void} hidePauseIcon - Hides the pause icon.
     * @property {function(string): void} showRestartIcon - Shows the restart (retry) icon with an optional tooltip message.
     * @property {function(): void} hideRestartIcon - Hides the restart (retry) icon.
     */

    /**
     * The addNewTask is designed for adding new tasks to the task management system. This function is central to
     * managing long-running tasks, providing a way to visually represent task progress, status, and control actions
     * directly from the UI in the status bar.
     *
     * @param {string} taskTitle - The title of the task. This is a mandatory parameter and is displayed in the UI.
     * @param {string} message - A message or status associated with the task. Displayed as additional information in the UI.
     * @param {string} [iconHTML] - Optional HTML string for the task's icon. Used to visually represent the task in the UI.
     * @param {Object} [options] - Optional settings and callbacks for the task.
     * @param {Function} [options.onPauseClick] - Callback function triggered when the pause button is clicked.
     * @param {Function} [options.onPlayClick] - Callback function triggered when the play button is clicked.
     * @param {Function} [options.onStopClick] - Callback function triggered when the stop button is clicked.
     * @param {Function} [options.onRetryClick] - Callback function triggered when the retry button is clicked.
     * @param {Function} [options.onSelect] - Callback function triggered when the task is selected from the dropdown.
     * @param {number} [options.progressPercent] - Initial progress percentage of the task.
     * @returns {TaskObject} Returns a task object with methods for updating the task's state and UI representation,
     * such as `setProgressPercent`, `setMessage`, `setSucceeded`, `setFailed`, and control visibility methods
     * like `showStopIcon`, `hideStopIcon`, etc.
     *
     * @example
     * // Example: Adding a new task with initial progress and attaching event handlers
     * const task = TaskManager.addNewTask(
     *   'Data Processing',
     *   'Processing data...',
     *   '<i class="fa fa-spinner fa-spin"></i>',
     *   {
     *     onPauseClick: () => console.log('Task paused'),
     *     onPlayClick: () => console.log('Task resumed'),
     *     onStopClick: () => console.log('Task stopped'),
     *     onRetryClick: () => console.log('Task retried'),
     *     onSelect: () => console.log('Task selected'),
     *     progressPercent: 20
     *   }
     * );
     *
     * // Updating task progress
     * task.setProgressPercent(60);
     *
     * // Updating task message
     * task.setMessage('60% completed');
     *
     * // Marking task as succeeded
     * task.setSucceeded();
     */
    function addNewTask(taskTitle, message, iconHTML=null, options = {
        onPauseClick: null,
        onPlayClick: null,
        onStopClick: null,
        onRetryClick: null,
        onSelect: null,
        progressPercent: null
    }) {
        if(!taskTitle){
            throw new Error("taskTitle is required to call addNewTask");
        }
        const task = {
            _id: `${taskTitle}-${StringUtils.randomString(10)}`,
            _title: taskTitle,
            _message: message,
            _showPauseIcon: null,
            _showPlayIcon: null,
            _showStopIcon: null,
            _showRestartIcon: null,
            onPauseClick: options && options.onPauseClick,
            onPlayClick: options && options.onPlayClick,
            onStopClick: options && options.onStopClick,
            onRetryClick: options && options.onRetryClick,
            onSelect: options && options.onSelect,
            _percent: options && options.progressPercent,
            _completedStatus: STATUS_INCOMPLETE,
            _iconHTML: iconHTML,
            _spinnerIconAck: false // This is set when the user has seen the spinner icon spinning and clicked to see
            // weather the task succeeded or failed.
        };
        function close() {
            delete taskList[task._id];
            _showOrHideStatusBarIfNeeded();
            renderSpinnerIcon();
        }

        function setIconHTML(html) {
            task._iconHTML = html;
            if(task._$html){
                task._$html.find(".task-icon").html(task._iconHTML);
            }
        }
        function setTitle(title) {
            task._title = title;
            if(task._$html){
                task._$html.find(".task-title").text(task._title||task._id);
            }
        }
        function getTitle() {
            return task._title;
        }
        function setMessage(_message) {
            task._message = _message;
            if(task._$html){
                task._$html.find(".task-message").text(task._message||"");
            }
        }
        function getMessage() {
            return task._message;
        }

        function setProgressPercent(percent) {
            task._percent = percent;
            task._completedStatus = STATUS_INCOMPLETE;
            _renderProgressbar(task);
            task._spinnerIconAck= true; // when progress changes, there is no notification visual in status bar.
            renderSpinnerIcon();
        }
        function getProgressPercent() {
            return task._percent;
        }

        function setFailed(){
            task._completedStatus = STATUS_FAIL;
            _renderProgressbar(task);
            task._spinnerIconAck= false;
            renderSpinnerIcon();
        }
        function isFailed(){
            return task._completedStatus === STATUS_FAIL;
        }
        function setSucceeded(){
            task._completedStatus = STATUS_SUCCESS;
            _renderProgressbar(task);
            task._spinnerIconAck= false;
            renderSpinnerIcon();
        }
        function isSucceeded(){
            return task._completedStatus === STATUS_SUCCESS;
        }

        function showStopIcon(tooltipMessage) {
            task._showStopIcon = tooltipMessage || Strings.STATUSBAR_TASKS_STOP;
            _renderPlayIcons(task);
        }
        function showPlayIcon(tooltipMessage) {
            task._showPlayIcon = tooltipMessage || Strings.STATUSBAR_TASKS_PLAY;
            _renderPlayIcons(task);
        }
        function showPauseIcon(tooltipMessage) {
            task._showPauseIcon = tooltipMessage || Strings.STATUSBAR_TASKS_PAUSE;
            _renderPlayIcons(task);
        }
        function showRestartIcon(tooltipMessage) {
            task._showRestartIcon = tooltipMessage || Strings.STATUSBAR_TASKS_RESTART;
            _renderPlayIcons(task);
        }
        function hideStopIcon() {
            task._showStopIcon = null;
            _renderPlayIcons(task);
        }
        function hidePlayIcon() {
            task._showPlayIcon = null;
            _renderPlayIcons(task);
        }
        function hidePauseIcon() {
            task._showPauseIcon = null;
            _renderPlayIcons(task);
        }
        function hideRestartIcon() {
            task._showRestartIcon = null;
            _renderPlayIcons(task);
        }

        task.close = close;
        task.setTitle = setTitle;
        task.getTitle = getTitle;
        task.setMessage = setMessage;
        task.getMessage = getMessage;
        task.setSucceded = setSucceeded;
        task.isSucceeded = isSucceeded;
        task.setFailed = setFailed;
        task.isFailed = isFailed;
        task.setProgressPercent = setProgressPercent;
        task.getProgressPercent = getProgressPercent;
        task.setIconHTML = setIconHTML;
        task.showStopIcon = showStopIcon;
        task.hideStopIcon = hideStopIcon;
        task.showPlayIcon = showPlayIcon;
        task.hidePlayIcon = hidePlayIcon;
        task.showPauseIcon = showPauseIcon;
        task.hidePauseIcon = hidePauseIcon;
        task.showRestartIcon = showRestartIcon;
        task.hideRestartIcon = hideRestartIcon;
        taskList[task._id] = task;
        EventDispatcher.makeEventDispatcher(task);
        _showOrHideStatusBarIfNeeded();
        renderSpinnerIcon(true);
        return task;
    }

    function _setLegacyExtensionBusy(busy) {
        legacyExtensionBusy = busy;
        if(busy){
            renderSpinnerIcon(true);
        } else {
            renderSpinnerIcon();
        }
        _showOrHideStatusBarIfNeeded();
    }

    // private apis
    exports._setTaskSelect = _setTaskSelect;
    exports._onDropdownShown = _onDropdownShown;
    exports._renderItem = _renderItem;
    exports._onSelect = _onSelect;
    exports._setLegacyExtensionBusy = _setLegacyExtensionBusy;

    window.TaskManager = exports; // todo remove this
    // public apis
    exports.addNewTask = addNewTask;
});
