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

    /**
     * This is used by legacy extensions that used StatusBar.showBusyIndicator and hide apis that are deprecated.
     * here for legacy support.
     * @type {boolean}
     */
    let legacyExtensionBusy = false;

    let taskSelect;

    function _setTaskSelect(select) {
        taskSelect = select;
        if(Phoenix.isTestWindow) {
            exports.taskSelect = taskSelect;
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
                <i class="fa-solid fa-cogs"></i>
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
        return task.onSelect && task.onSelect(el, selection);
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
        if(task._completedStatus === STATUS_SUCCESS){
            $html.find(".progress")
                .removeClass("progress-bar-foreground")
                .removeClass("progress-bar-foreground-pulse")
                .removeClass("progress-bar-foreground-failure")
                .addClass("progress-bar-foreground-success")
                .css('width', `100%`);
            return;
        }
        if(task._completedStatus === STATUS_FAIL){
            $html.find(".progress")
                .removeClass("progress-bar-foreground")
                .removeClass("progress-bar-foreground-pulse")
                .removeClass("progress-bar-foreground-success")
                .addClass("progress-bar-foreground-failure")
                .css('width', `100%`);
            return;
        }
        if(task._percent){
            $html.find(".progress")
                .removeClass("progress-bar-foreground-pulse")
                .addClass("progress-bar-foreground")
                .css('width', `${task._percent}%`);
        } else {
            $html.find(".progress")
                .removeClass("progress-bar-foreground")
                .removeClass("progress-bar-foreground-success")
                .removeClass("progress-bar-foreground-failure")
                .addClass("progress-bar-foreground-pulse")
                .css('width', `${task._percent}%`);
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
    }

    function addNewTask(taskTitle, message, iconHTML, options = {
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
            onPauseClick: options && options.onPauseClick,
            onPlayClick: options && options.onPlayClick,
            onStopClick: options && options.onStopClick,
            onRetryClick: options && options.onRetryClick,
            onSelect: options && options.onSelect,
            _percent: options && options.progressPercent,
            _completedStatus: STATUS_INCOMPLETE,
            _iconHTML: iconHTML
        };
        function close() {
            delete taskList[task._id];
            _showOrHideStatusBarIfNeeded();
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
            _renderProgressbar(task);
        }
        function getProgressPercent() {
            return task._percent;
        }

        function setFailed(){
            task._completedStatus = STATUS_FAIL;
            _renderProgressbar(task);
        }
        function isFailed(){
            return task._completedStatus === STATUS_FAIL;
        }
        function setSucceeded(){
            task._completedStatus = STATUS_SUCCESS;
            _renderProgressbar(task);
        }
        function isSucceeded(){
            return task._completedStatus === STATUS_SUCCESS;
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
        taskList[task._id] = task;
        EventDispatcher.makeEventDispatcher(task);
        _showOrHideStatusBarIfNeeded();
        return task;
    }

    function _setLegacyExtensionBusy(busy) {
        legacyExtensionBusy = busy;
        _showOrHideStatusBarIfNeeded();
    }

    // private apis
    exports._setTaskSelect = _setTaskSelect;
    exports._renderItem = _renderItem;
    exports._onSelect = _onSelect;
    exports._setLegacyExtensionBusy = _setLegacyExtensionBusy;

    window.tm=exports;//todo remove
    // public apis
    exports.addNewTask = addNewTask;
});
