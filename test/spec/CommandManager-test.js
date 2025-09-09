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

/*global describe, beforeEach, afterEach, it, expect */

define(function (require, exports, module) {


    // Load dependent modules
    var CommandManager = require("command/CommandManager");

    describe("CommandManager", function () {

        var commandID = "commandID";

        var executed;
        var testCommandFn = function () { executed = true; };

        beforeEach(function () {
            executed = false;
            CommandManager._testReset();
        });

        afterEach(function () {
            CommandManager._testRestore();
        });

        it("register and get a command and validate parameters", function () {
            var command = CommandManager.register("test command", commandID, testCommandFn);
            expect(command).toBeTruthy();
            expect(command.getName()).toBe("test command");
            expect(command.getID()).toBe(commandID);
            expect(command.getEnabled()).toBeTruthy();
            expect(command.getChecked()).toBe(undefined);
            expect(command._commandFn).toBe(testCommandFn);

            // duplicate command
            expect(CommandManager.register("test command", commandID, testCommandFn)).toBeFalsy();

            // missing arguments
            expect(CommandManager.register(null, "test-command-id2", testCommandFn)).toBe(null);
            expect(CommandManager.register("test command", null, testCommandFn)).toBe(null);
            expect(CommandManager.register("test command", "test-command-id2", null)).toBe(null);

        });

        it("execute a command", function () {
            var command = CommandManager.register("test command", commandID, testCommandFn);
            command.execute();
            expect(executed).toBeTruthy();
        });

        it("not execute a disabled command", function () {
            var command = CommandManager.register("test command", commandID, testCommandFn);
            command.setEnabled(false);
            command.execute();
            expect(executed).toBeFalsy();
        });

        it("set enabled state and trigger enabledStateChange", function () {
            var eventTriggered = false;
            var command = CommandManager.register("test command", commandID, testCommandFn);
            command.on("enabledStateChange", function () {
                eventTriggered = true;
            });
            command.setEnabled(false);
            expect(eventTriggered).toBeTruthy();
            expect(command.getEnabled()).toBeFalsy();
        });

        it("set checked state and trigger checkedStateChange", function () {
            var eventTriggered = false;
            var command = CommandManager.register("test command", commandID, testCommandFn);
            command.on("checkedStateChange", function () {
                eventTriggered = true;
            });
            command.setChecked(true);
            expect(eventTriggered).toBeTruthy();
            expect(command.getChecked()).toBeTruthy();
        });

        it("rename command trigger nameChange", function () {
            var eventTriggered = false;
            var command = CommandManager.register("test command", commandID, testCommandFn);
            command.on("nameChange", function () {
                eventTriggered = true;
            });
            command.setName("newName");
            expect(eventTriggered).toBeTruthy();
            expect(command.getName()).toBe("newName");
        });
        it("execute a command with optional source event", function () {
            let event = {eventSource: "hello"};
            let receivedEvent;
            let command = CommandManager.register("test command", commandID, (event)=>{
                receivedEvent = event;
            }, {eventSource: true});
            command.execute(event);
            expect(receivedEvent).toBe(event);
            // now do with command manager exec
            receivedEvent = null;
            CommandManager.execute(commandID, event);
            expect(receivedEvent).toBe(event);
        });
        it("execute a command with optional source event and additional exec args", function () {
            let event = {eventSource: "hello"};
            let receivedEvent, receiveArg1, receiveArg2;
            let command = CommandManager.register("test command", commandID, (event, arg1, arg2)=>{
                receivedEvent = event;
                receiveArg1 = arg1;
                receiveArg2 = arg2;
            }, {eventSource: true});
            command.execute(event, 42, "arg2");
            expect(receivedEvent).toBe(event);
            expect(receiveArg1).toBe(42);
            expect(receiveArg2).toBe("arg2");
            // now do with command manager exec
            receivedEvent = null;
            CommandManager.execute(commandID, event, 55, "argx");
            expect(receivedEvent).toBe(event);
            expect(receiveArg1).toBe(55);
            expect(receiveArg2).toBe("argx");
        });
        it("execute a command registered with eventSource should get event even if execute misses the source", function () {
            let receivedEvent;
            let command = CommandManager.register("test command", commandID, (event)=>{
                receivedEvent = event;
            }, {eventSource: true});
            command.execute();
            expect(receivedEvent).toEql({ eventSource: 'otherExecAction' });
            // now do with command manager exec
            receivedEvent = null;
            CommandManager.execute(commandID);
            expect(receivedEvent).toEql({ eventSource: 'otherExecAction' });
        });
        it("execute a command will not get eventSource if eventSource option set to false", function () {
            let receivedEvent;
            let command = CommandManager.register("test command", commandID, (event)=>{
                receivedEvent = event;
            }, {eventSource: false});
            command.execute();
            expect(receivedEvent).not.toBeDefined();
            // now do with command manager exec
            receivedEvent = null;
            CommandManager.execute(commandID);
            expect(receivedEvent).not.toBeDefined();
        });
        it("execute a command will not get eventSource if eventSource option not given", function () {
            let receivedEvent;
            let command = CommandManager.register("test command", commandID, (event)=>{receivedEvent = event;});
            command.execute();
            expect(receivedEvent).not.toBeDefined();
            // now do with command manager exec
            receivedEvent = null;
            CommandManager.execute(commandID);
            expect(receivedEvent).not.toBeDefined();
        });

        it("register command with htmlName option", function () {
            var htmlName = "Phoenix menu<i class='fa fa-car' style='margin-left: 4px;'></i>";
            var command = CommandManager.register("test command", "test-htmlname-command", testCommandFn, {
                htmlName: htmlName
            });
            expect(command).toBeTruthy();
            expect(command.getName()).toBe("test command");
            expect(command.getOptions().htmlName).toBe(htmlName);
        });

        it("getOptions should return empty object when no options provided", function () {
            var command = CommandManager.register("test command", "test-no-options-command", testCommandFn);
            expect(command).toBeTruthy();
            expect(command.getOptions()).toEql({});
        });

        it("getOptions should return options when provided", function () {
            var options = {
                eventSource: true,
                htmlName: "Test <b>HTML</b> Name"
            };
            var command = CommandManager.register("test command", "test-with-options-command", testCommandFn, options);
            expect(command).toBeTruthy();
            expect(command.getOptions()).toEql(options);
        });

        it("setName with htmlName parameter and trigger nameChange", function () {
            var eventTriggered = false;
            var command = CommandManager.register("test command", "test-setname-html-command", testCommandFn);
            command.on("nameChange", function () {
                eventTriggered = true;
            });

            var newName = "new command name";
            var htmlName = "New <i class='fa fa-star'></i> Name";
            command.setName(newName, htmlName);

            expect(eventTriggered).toBeTruthy();
            expect(command.getName()).toBe(newName);
            expect(command.getOptions().htmlName).toBe(htmlName);
        });

        it("setName should trigger nameChange when only htmlName changes", function () {
            var eventTriggered = false;
            var command = CommandManager.register("test command", "test-setname-htmlonly-command", testCommandFn, {
                htmlName: "original html"
            });
            command.on("nameChange", function () {
                eventTriggered = true;
            });

            var newHtmlName = "Updated <span>HTML</span> Name";
            command.setName(command.getName(), newHtmlName);

            expect(eventTriggered).toBeTruthy();
            expect(command.getOptions().htmlName).toBe(newHtmlName);
        });

        it("setName should not trigger nameChange when name and htmlName are unchanged", function () {
            var eventTriggered = false;
            var htmlName = "Same HTML Name";
            var command = CommandManager.register("test command", "test-setname-same-command", testCommandFn, {
                htmlName: htmlName
            });
            command.on("nameChange", function () {
                eventTriggered = true;
            });

            command.setName(command.getName(), htmlName);

            expect(eventTriggered).toBeFalsy();
        });

        it("should handle edge cases for htmlName", function () {
            // Test with empty string htmlName
            var command1 = CommandManager.register("test command", "test-empty-html-command", testCommandFn, {
                htmlName: ""
            });
            expect(command1.getOptions().htmlName).toBe("");

            // Test with null htmlName
            var command2 = CommandManager.register("test command", "test-null-html-command", testCommandFn, {
                htmlName: null
            });
            expect(command2.getOptions().htmlName).toBe(null);

            // Test with undefined htmlName (should not be set)
            var command3 = CommandManager.register("test command", "test-undefined-html-command", testCommandFn, {
                htmlName: undefined
            });
            expect(command3.getOptions().htmlName).toBe(undefined);
        });

        it("setName should handle edge cases for htmlName parameter", function () {
            var command = CommandManager.register("test command", "test-setname-edge-command", testCommandFn);

            // Test setting htmlName to empty string
            command.setName("test name", "");
            expect(command.getOptions().htmlName).toBe("");

            // Test setting htmlName to null (should still trigger change if it was different)
            var eventTriggered = false;
            command.on("nameChange", function () {
                eventTriggered = true;
            });
            command.setName("test name", null);
            expect(command.getOptions().htmlName).toBe(null);
            expect(eventTriggered).toBeTruthy();
        });
    });
});
